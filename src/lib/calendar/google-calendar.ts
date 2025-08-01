import { OAuth2Client } from 'google-auth-library'
import { calendar_v3, google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'

interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  location?: string
  status: 'confirmed' | 'tentative' | 'cancelled'
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted'
  }>
  reminders?: {
    useDefault: boolean
    overrides?: Array<{
      method: 'email' | 'popup'
      minutes: number
    }>
  }
  colorId?: string
  extendedProperties?: {
    private?: Record<string, string>
    shared?: Record<string, string>
  }
}

interface CalendarIntegration {
  id: string
  user_id: string
  provider: 'google'
  access_token: string
  refresh_token: string
  expires_at: string
  calendar_id?: string
  sync_enabled: boolean
  last_sync_at?: string
}

export class GoogleCalendarService {
  private oauth2Client: OAuth2Client
  private calendar: calendar_v3.Calendar
  
  constructor() {
    this.oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client })
  }

  /**
   * Get OAuth2 authorization URL
   */
  getAuthUrl(state: string): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ]

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state,
      prompt: 'consent' // Force consent screen to get refresh token
    })
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<{
    access_token: string
    refresh_token: string
    expires_at: Date
  }> {
    const { tokens } = await this.oauth2Client.getToken(code)
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to obtain tokens from Google')
    }

    const expiresAt = new Date()
    if (tokens.expiry_date) {
      expiresAt.setTime(tokens.expiry_date)
    } else {
      expiresAt.setHours(expiresAt.getHours() + 1) // Default 1 hour
    }

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    access_token: string
    expires_at: Date
  }> {
    this.oauth2Client.setCredentials({
      refresh_token: refreshToken
    })

    const { credentials } = await this.oauth2Client.refreshAccessToken()
    
    if (!credentials.access_token) {
      throw new Error('Failed to refresh access token')
    }

    const expiresAt = new Date()
    if (credentials.expiry_date) {
      expiresAt.setTime(credentials.expiry_date)
    } else {
      expiresAt.setHours(expiresAt.getHours() + 1)
    }

    return {
      access_token: credentials.access_token,
      expires_at: expiresAt
    }
  }

  /**
   * Set credentials for API calls
   */
  private setCredentials(integration: CalendarIntegration) {
    this.oauth2Client.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token
    })
  }

  /**
   * Create calendar event from reservation
   */
  async createEvent(
    integration: CalendarIntegration,
    reservation: any,
    timezone: string = 'UTC'
  ): Promise<string> {
    this.setCredentials(integration)

    const event: GoogleCalendarEvent = this.convertReservationToEvent(reservation, timezone)
    
    try {
      const response = await this.calendar.events.insert({
        calendarId: integration.calendar_id || 'primary',
        requestBody: event
      })

      if (!response.data.id) {
        throw new Error('Failed to create Google Calendar event')
      }

      return response.data.id
    } catch (error) {
      // Handle token expiration
      if (error.code === 401) {
        await this.handleTokenRefresh(integration)
        // Retry the request
        const response = await this.calendar.events.insert({
          calendarId: integration.calendar_id || 'primary',
          requestBody: event
        })
        return response.data.id!
      }
      throw error
    }
  }

  /**
   * Update calendar event
   */
  async updateEvent(
    integration: CalendarIntegration,
    eventId: string,
    reservation: any,
    timezone: string = 'UTC'
  ): Promise<void> {
    this.setCredentials(integration)

    const event: GoogleCalendarEvent = this.convertReservationToEvent(reservation, timezone)
    
    try {
      await this.calendar.events.update({
        calendarId: integration.calendar_id || 'primary',
        eventId,
        requestBody: event
      })
    } catch (error) {
      if (error.code === 401) {
        await this.handleTokenRefresh(integration)
        await this.calendar.events.update({
          calendarId: integration.calendar_id || 'primary',
          eventId,
          requestBody: event
        })
      } else {
        throw error
      }
    }
  }

  /**
   * Delete calendar event
   */
  async deleteEvent(
    integration: CalendarIntegration,
    eventId: string
  ): Promise<void> {
    this.setCredentials(integration)

    try {
      await this.calendar.events.delete({
        calendarId: integration.calendar_id || 'primary',
        eventId
      })
    } catch (error) {
      if (error.code === 401) {
        await this.handleTokenRefresh(integration)
        await this.calendar.events.delete({
          calendarId: integration.calendar_id || 'primary',
          eventId
        })
      } else if (error.code !== 404) {
        // Ignore 404 errors (event already deleted)
        throw error
      }
    }
  }

  /**
   * List user's calendars
   */
  async listCalendars(integration: CalendarIntegration): Promise<Array<{
    id: string
    summary: string
    description?: string
    primary?: boolean
    accessRole: string
  }>> {
    this.setCredentials(integration)

    try {
      const response = await this.calendar.calendarList.list()
      
      return response.data.items?.map(calendar => ({
        id: calendar.id!,
        summary: calendar.summary!,
        description: calendar.description,
        primary: calendar.primary,
        accessRole: calendar.accessRole!
      })) || []
    } catch (error) {
      if (error.code === 401) {
        await this.handleTokenRefresh(integration)
        const response = await this.calendar.calendarList.list()
        return response.data.items?.map(calendar => ({
          id: calendar.id!,
          summary: calendar.summary!,
          description: calendar.description,
          primary: calendar.primary,
          accessRole: calendar.accessRole!
        })) || []
      }
      throw error
    }
  }

  /**
   * Convert reservation to Google Calendar event
   */
  private convertReservationToEvent(reservation: any, timezone: string): GoogleCalendarEvent {
    const startDateTime = new Date(`${reservation.date}T${reservation.start_time}`)
    const endDateTime = new Date(`${reservation.date}T${reservation.end_time}`)

    const event: GoogleCalendarEvent = {
      id: `field-reservation-${reservation.id}`,
      summary: `${reservation.field.name} - ${reservation.purpose}`,
      description: this.buildEventDescription(reservation),
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: timezone
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: timezone
      },
      location: reservation.field.address || reservation.field.name,
      status: this.mapReservationStatus(reservation.status),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },  // 1 hour before
          { method: 'email', minutes: 1440 } // 24 hours before
        ]
      },
      extendedProperties: {
        private: {
          'field-reservation-id': reservation.id,
          'field-id': reservation.field.id,
          'user-id': reservation.user_id
        }
      }
    }

    // Add team information if available
    if (reservation.team) {
      event.extendedProperties!.private!['team-id'] = reservation.team.id
      event.extendedProperties!.private!['team-name'] = reservation.team.name
    }

    // Set color based on status
    event.colorId = this.getEventColorId(reservation.status)

    return event
  }

  /**
   * Build event description
   */
  private buildEventDescription(reservation: any): string {
    const parts: string[] = []
    
    parts.push(`Field: ${reservation.field.name}`)
    parts.push(`Purpose: ${reservation.purpose}`)
    parts.push(`Expected Attendees: ${reservation.attendees}`)
    
    if (reservation.team) {
      parts.push(`Team: ${reservation.team.name}`)
    }
    
    if (reservation.notes) {
      parts.push(`Notes: ${reservation.notes}`)
    }
    
    parts.push(`Status: ${reservation.status.toUpperCase()}`)
    parts.push(`Reservation ID: ${reservation.id}`)
    
    return parts.join('\n')
  }

  /**
   * Map reservation status to Google Calendar status
   */
  private mapReservationStatus(status: string): 'confirmed' | 'tentative' | 'cancelled' {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return 'confirmed'
      case 'pending':
        return 'tentative'
      case 'cancelled':
        return 'cancelled'
      default:
        return 'tentative'
    }
  }

  /**
   * Get event color ID based on status
   */
  private getEventColorId(status: string): string {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return '10' // Green
      case 'pending':
        return '5'  // Yellow
      case 'cancelled':
        return '4'  // Red
      default:
        return '1'  // Blue
    }
  }

  /**
   * Handle token refresh
   */
  private async handleTokenRefresh(integration: CalendarIntegration): Promise<void> {
    const tokens = await this.refreshAccessToken(integration.refresh_token)
    
    // Update integration in database
    const supabase = createClient()
    await supabase
      .from('calendar_integrations')
      .update({
        access_token: tokens.access_token,
        expires_at: tokens.expires_at.toISOString()
      })
      .eq('id', integration.id)

    // Update local object
    integration.access_token = tokens.access_token
    integration.expires_at = tokens.expires_at.toISOString()
  }

  /**
   * Check if access token is expired
   */
  isTokenExpired(integration: CalendarIntegration): boolean {
    const expiresAt = new Date(integration.expires_at)
    const now = new Date()
    // Consider token expired 5 minutes before actual expiry
    return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000
  }

  /**
   * Sync reservation to Google Calendar
   */
  async syncReservation(
    userId: string,
    reservation: any,
    action: 'create' | 'update' | 'delete',
    timezone: string = 'UTC'
  ): Promise<void> {
    const supabase = createClient()
    
    // Get user's Google Calendar integration
    const { data: integration } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .eq('sync_enabled', true)
      .single()

    if (!integration) {
      return // No integration configured
    }

    try {
      switch (action) {
        case 'create':
          const eventId = await this.createEvent(integration, reservation, timezone)
          // Store the Google event ID in the reservation
          await supabase
            .from('reservations')
            .update({ 
              metadata: { 
                ...reservation.metadata, 
                google_event_id: eventId 
              } 
            })
            .eq('id', reservation.id)
          break

        case 'update':
          if (reservation.metadata?.google_event_id) {
            await this.updateEvent(integration, reservation.metadata.google_event_id, reservation, timezone)
          }
          break

        case 'delete':
          if (reservation.metadata?.google_event_id) {
            await this.deleteEvent(integration, reservation.metadata.google_event_id)
          }
          break
      }

      // Update last sync time
      await supabase
        .from('calendar_integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', integration.id)

    } catch (error) {
      console.error('Failed to sync reservation to Google Calendar:', error)
      // Don't throw error to avoid breaking the main reservation flow
    }
  }
}

export const googleCalendarService = new GoogleCalendarService()