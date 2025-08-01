import { Client } from '@microsoft/microsoft-graph-client'
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client'
import { createClient } from '@/lib/supabase/server'

interface OutlookEvent {
  subject: string
  body: {
    contentType: 'html' | 'text'
    content: string
  }
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  location?: {
    displayName: string
    address?: {
      street?: string
      city?: string
      state?: string
      countryOrRegion?: string
      postalCode?: string
    }
  }
  attendees?: Array<{
    emailAddress: {
      address: string
      name?: string
    }
    type: 'required' | 'optional' | 'resource'
  }>
  categories?: string[]
  importance: 'low' | 'normal' | 'high'
  sensitivity: 'normal' | 'personal' | 'private' | 'confidential'
  showAs: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown'
  isReminderOn: boolean
  reminderMinutesBeforeStart?: number
  recurrence?: any
  extensions?: Array<{
    extensionName: string
    id: string
    value: string
  }>
}

interface CalendarIntegration {
  id: string
  user_id: string
  provider: 'outlook'
  access_token: string
  refresh_token: string
  expires_at: string
  calendar_id?: string
  sync_enabled: boolean
  last_sync_at?: string
}

// Custom authentication provider for Microsoft Graph
class TokenAuthProvider implements AuthenticationProvider {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken
  }
}

export class OutlookCalendarService {
  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private authority: string

  constructor() {
    this.clientId = process.env.MICROSOFT_CLIENT_ID!
    this.clientSecret = process.env.MICROSOFT_CLIENT_SECRET!
    this.redirectUri = process.env.MICROSOFT_REDIRECT_URI!
    this.authority = 'https://login.microsoftonline.com/common'
  }

  /**
   * Get OAuth2 authorization URL for Microsoft
   */
  getAuthUrl(state: string): string {
    const scopes = [
      'https://graph.microsoft.com/Calendars.ReadWrite',
      'https://graph.microsoft.com/User.Read'
    ]

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      state,
      response_mode: 'query',
      prompt: 'consent'
    })

    return `${this.authority}/oauth2/v2.0/authorize?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<{
    access_token: string
    refresh_token: string
    expires_at: Date
  }> {
    const tokenEndpoint = `${this.authority}/oauth2/v2.0/token`
    
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      scope: 'https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read'
    })

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to exchange code for tokens: ${error}`)
    }

    const data = await response.json()
    
    if (!data.access_token || !data.refresh_token) {
      throw new Error('Invalid token response from Microsoft')
    }

    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600))

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
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
    const tokenEndpoint = `${this.authority}/oauth2/v2.0/token`
    
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read'
    })

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to refresh token: ${error}`)
    }

    const data = await response.json()
    
    if (!data.access_token) {
      throw new Error('Invalid refresh token response from Microsoft')
    }

    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600))

    return {
      access_token: data.access_token,
      expires_at: expiresAt
    }
  }

  /**
   * Create Graph client with authentication
   */
  private createGraphClient(accessToken: string): Client {
    const authProvider = new TokenAuthProvider(accessToken)
    return Client.initWithMiddleware({ authProvider })
  }

  /**
   * List user's calendars
   */
  async listCalendars(integration: CalendarIntegration): Promise<Array<{
    id: string
    name: string
    isDefaultCalendar: boolean
    canEdit: boolean
    owner: {
      name?: string
      address?: string
    }
  }>> {
    const graphClient = this.createGraphClient(integration.access_token)

    try {
      const calendars = await graphClient.api('/me/calendars').get()
      
      return calendars.value.map((calendar: any) => ({
        id: calendar.id,
        name: calendar.name,
        isDefaultCalendar: calendar.isDefaultCalendar || false,
        canEdit: calendar.canEdit || true,
        owner: {
          name: calendar.owner?.name,
          address: calendar.owner?.address
        }
      }))
    } catch (error) {
      if (error.code === 'InvalidAuthenticationToken') {
        await this.handleTokenRefresh(integration)
        // Retry with refreshed token
        const newGraphClient = this.createGraphClient(integration.access_token)
        const calendars = await newGraphClient.api('/me/calendars').get()
        return calendars.value.map((calendar: any) => ({
          id: calendar.id,
          name: calendar.name,
          isDefaultCalendar: calendar.isDefaultCalendar || false,
          canEdit: calendar.canEdit || true,
          owner: {
            name: calendar.owner?.name,
            address: calendar.owner?.address
          }
        }))
      }
      throw error
    }
  }

  /**
   * Create calendar event from reservation
   */
  async createEvent(
    integration: CalendarIntegration,
    reservation: any,
    timezone: string = 'UTC'
  ): Promise<string> {
    const graphClient = this.createGraphClient(integration.access_token)
    const event = this.convertReservationToEvent(reservation, timezone)
    
    try {
      const calendarId = integration.calendar_id || 'calendar'
      const response = await graphClient
        .api(`/me/calendars/${calendarId}/events`)
        .post(event)

      if (!response.id) {
        throw new Error('Failed to create Outlook Calendar event')
      }

      return response.id
    } catch (error) {
      if (error.code === 'InvalidAuthenticationToken') {
        await this.handleTokenRefresh(integration)
        const newGraphClient = this.createGraphClient(integration.access_token)
        const response = await newGraphClient
          .api(`/me/calendars/${integration.calendar_id || 'calendar'}/events`)
          .post(event)
        return response.id
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
    const graphClient = this.createGraphClient(integration.access_token)
    const event = this.convertReservationToEvent(reservation, timezone)
    
    try {
      const calendarId = integration.calendar_id || 'calendar'
      await graphClient
        .api(`/me/calendars/${calendarId}/events/${eventId}`)
        .patch(event)
    } catch (error) {
      if (error.code === 'InvalidAuthenticationToken') {
        await this.handleTokenRefresh(integration)
        const newGraphClient = this.createGraphClient(integration.access_token)
        await newGraphClient
          .api(`/me/calendars/${integration.calendar_id || 'calendar'}/events/${eventId}`)
          .patch(event)
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
    const graphClient = this.createGraphClient(integration.access_token)
    
    try {
      const calendarId = integration.calendar_id || 'calendar'
      await graphClient
        .api(`/me/calendars/${calendarId}/events/${eventId}`)
        .delete()
    } catch (error) {
      if (error.code === 'InvalidAuthenticationToken') {
        await this.handleTokenRefresh(integration)
        const newGraphClient = this.createGraphClient(integration.access_token)
        await newGraphClient
          .api(`/me/calendars/${integration.calendar_id || 'calendar'}/events/${eventId}`)
          .delete()
      } else if (error.code !== 'ErrorItemNotFound') {
        // Ignore not found errors (event already deleted)
        throw error
      }
    }
  }

  /**
   * Convert reservation to Outlook event
   */
  private convertReservationToEvent(reservation: any, timezone: string): OutlookEvent {
    const startDateTime = new Date(`${reservation.date}T${reservation.start_time}`)
    const endDateTime = new Date(`${reservation.date}T${reservation.end_time}`)

    const event: OutlookEvent = {
      subject: `${reservation.field.name} - ${reservation.purpose}`,
      body: {
        contentType: 'html',
        content: this.buildEventDescription(reservation)
      },
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: timezone
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: timezone
      },
      location: {
        displayName: reservation.field.address || reservation.field.name
      },
      categories: this.getEventCategories(reservation),
      importance: this.getEventImportance(reservation.field.type),
      sensitivity: 'normal',
      showAs: this.mapReservationShowAs(reservation.status),
      isReminderOn: true,
      reminderMinutesBeforeStart: 60,
      extensions: [
        {
          extensionName: 'com.fieldreservations.metadata',
          id: 'reservation-data',
          value: JSON.stringify({
            reservationId: reservation.id,
            fieldId: reservation.field.id,
            userId: reservation.user_id,
            teamId: reservation.team?.id
          })
        }
      ]
    }

    return event
  }

  /**
   * Build HTML event description
   */
  private buildEventDescription(reservation: any): string {
    const parts: string[] = []
    
    parts.push(`<p><strong>Field:</strong> ${reservation.field.name}</p>`)
    parts.push(`<p><strong>Purpose:</strong> ${reservation.purpose}</p>`)
    parts.push(`<p><strong>Expected Attendees:</strong> ${reservation.attendees}</p>`)
    
    if (reservation.team) {
      parts.push(`<p><strong>Team:</strong> ${reservation.team.name}</p>`)
    }
    
    if (reservation.notes) {
      parts.push(`<p><strong>Notes:</strong> ${reservation.notes}</p>`)
    }
    
    parts.push(`<p><strong>Status:</strong> ${reservation.status.toUpperCase()}</p>`)
    parts.push(`<p><strong>Reservation ID:</strong> ${reservation.id}</p>`)
    
    return parts.join('')
  }

  /**
   * Get event categories
   */
  private getEventCategories(reservation: any): string[] {
    const categories: string[] = ['Sports']
    
    categories.push(reservation.field.type)
    
    if (reservation.team) {
      categories.push('Team Event')
    }
    
    if (reservation.purpose.toLowerCase().includes('tournament')) {
      categories.push('Tournament')
    } else if (reservation.purpose.toLowerCase().includes('practice')) {
      categories.push('Practice')
    }
    
    return categories
  }

  /**
   * Get event importance based on field type
   */
  private getEventImportance(fieldType: string): 'low' | 'normal' | 'high' {
    switch (fieldType.toLowerCase()) {
      case 'championship':
      case 'tournament':
        return 'high'
      case 'practice':
        return 'low'
      default:
        return 'normal'
    }
  }

  /**
   * Map reservation status to Outlook show as
   */
  private mapReservationShowAs(status: string): 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown' {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return 'busy'
      case 'pending':
        return 'tentative'
      case 'cancelled':
        return 'free'
      default:
        return 'tentative'
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
   * Sync reservation to Outlook Calendar
   */
  async syncReservation(
    userId: string,
    reservation: any,
    action: 'create' | 'update' | 'delete',
    timezone: string = 'UTC'
  ): Promise<void> {
    const supabase = createClient()
    
    // Get user's Outlook Calendar integration
    const { data: integration } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'outlook')
      .eq('sync_enabled', true)
      .single()

    if (!integration) {
      return // No integration configured
    }

    try {
      switch (action) {
        case 'create':
          const eventId = await this.createEvent(integration, reservation, timezone)
          // Store the Outlook event ID in the reservation
          await supabase
            .from('reservations')
            .update({ 
              external_calendar_events: { 
                ...reservation.external_calendar_events, 
                outlook: { event_id: eventId } 
              } 
            })
            .eq('id', reservation.id)
          break

        case 'update':
          if (reservation.external_calendar_events?.outlook?.event_id) {
            await this.updateEvent(integration, reservation.external_calendar_events.outlook.event_id, reservation, timezone)
          }
          break

        case 'delete':
          if (reservation.external_calendar_events?.outlook?.event_id) {
            await this.deleteEvent(integration, reservation.external_calendar_events.outlook.event_id)
          }
          break
      }

      // Update last sync time
      await supabase
        .from('calendar_integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', integration.id)

    } catch (error) {
      console.error('Failed to sync reservation to Outlook Calendar:', error)
      // Don't throw error to avoid breaking the main reservation flow
    }
  }
}

export const outlookCalendarService = new OutlookCalendarService()