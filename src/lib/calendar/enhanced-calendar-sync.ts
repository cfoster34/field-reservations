import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { Client } from '@microsoft/microsoft-graph-client'
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client'
import { webhookManager } from '@/lib/webhooks/webhook-manager'
import { z } from 'zod'

export interface CalendarIntegration {
  id: string
  leagueId: string
  userId: string
  provider: 'google' | 'outlook' | 'office365' | 'icloud' | 'caldav'
  name: string
  isActive: boolean
  syncDirection: 'import' | 'export' | 'bidirectional'
  calendarId?: string
  credentials: EncryptedCredentials
  lastSyncAt?: string
  nextSyncAt?: string
  syncFrequency: 'realtime' | 'hourly' | 'daily' | 'manual'
  syncSettings: CalendarSyncSettings
  createdAt: string
  updatedAt: string
}

export interface CalendarSyncSettings {
  syncReservations: boolean
  syncAvailability: boolean
  createEvents: boolean
  updateEvents: boolean
  deleteEvents: boolean
  eventPrefix: string
  includeDescription: boolean
  includeLocation: boolean
  includeAttendees: boolean
  reminderMinutes: number[]
  colorId?: string
  visibility: 'public' | 'private' | 'confidential'
  categories: string[]
  fieldFilters: string[]
  timeRange: {
    start: string // ISO date
    end: string // ISO date
  }
}

export interface EncryptedCredentials {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresAt?: string
  scope?: string[]
  tokenType?: string
}

export interface CalendarEvent {
  id: string
  calendarId: string
  title: string
  description?: string
  location?: string
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  attendees?: Array<{
    email: string
    name?: string
    status: 'accepted' | 'declined' | 'tentative' | 'needsAction'
  }>
  reminders?: Array<{
    method: 'email' | 'popup'
    minutes: number
  }>
  status: 'confirmed' | 'tentative' | 'cancelled'
  visibility: 'public' | 'private' | 'confidential'
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly'
    interval: number
    until?: string
    count?: number
  }
  source: 'reservation' | 'availability' | 'maintenance'
  sourceId: string
  lastModified: string
}

export interface SyncResult {
  success: boolean
  provider: string
  direction: string
  events: {
    created: number
    updated: number
    deleted: number
    skipped: number
    errors: number
  }
  errors: Array<{
    eventId?: string
    message: string
    details?: any
  }>
  duration: number
  nextSyncAt?: string
}

// Custom Authentication Provider for Microsoft Graph
class GraphAuthProvider implements AuthenticationProvider {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken
  }
}

export class EnhancedCalendarSync {
  private supabase: any

  constructor() {
    this.supabase = createClient()
  }

  // Integration management
  async createIntegration(
    leagueId: string,
    userId: string,
    provider: string,
    credentials: any,
    settings: CalendarSyncSettings
  ): Promise<CalendarIntegration> {
    const integration = {
      league_id: leagueId,
      user_id: userId,
      provider,
      name: `${provider} Calendar`,
      is_active: true,
      sync_direction: 'bidirectional',
      credentials: await this.encryptCredentials(credentials),
      sync_frequency: 'hourly',
      sync_settings: settings,
    }

    const { data: created, error } = await this.supabase
      .from('calendar_integrations')
      .insert(integration)
      .select()
      .single()

    if (error) throw error

    // Schedule initial sync
    await this.scheduleSync(created.id)

    return this.transformIntegration(created)
  }

  async updateIntegration(
    integrationId: string,
    updates: Partial<CalendarIntegration>
  ): Promise<CalendarIntegration> {
    const { data: updated, error } = await this.supabase
      .from('calendar_integrations')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId)
      .select()
      .single()

    if (error) throw error

    return this.transformIntegration(updated)
  }

  async deleteIntegration(integrationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('calendar_integrations')
      .delete()
      .eq('id', integrationId)

    if (error) throw error
  }

  async getIntegrations(leagueId: string): Promise<CalendarIntegration[]> {
    const { data: integrations, error } = await this.supabase
      .from('calendar_integrations')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return integrations.map(this.transformIntegration)
  }

  // Sync operations
  async syncIntegration(integrationId: string): Promise<SyncResult> {
    const integration = await this.getIntegration(integrationId)
    if (!integration || !integration.isActive) {
      throw new Error('Integration not found or inactive')
    }

    const startTime = Date.now()
    let result: SyncResult

    try {
      // Update sync status
      await this.updateSyncStatus(integrationId, 'running')

      switch (integration.provider) {
        case 'google':
          result = await this.syncGoogleCalendar(integration)
          break
        case 'outlook':
        case 'office365':
          result = await this.syncOutlookCalendar(integration)
          break
        default:
          throw new Error(`Unsupported provider: ${integration.provider}`)
      }

      result.duration = Date.now() - startTime

      // Update last sync time
      await this.updateLastSync(integrationId, result)

      // Schedule next sync
      if (integration.syncFrequency !== 'manual') {
        await this.scheduleSync(integrationId)
      }

      // Send webhook notification
      await webhookManager.triggerWebhook(
        integration.leagueId,
        'sync.completed',
        {
          integration: {
            id: integration.id,
            provider: integration.provider,
            name: integration.name,
          },
          result,
        },
        undefined,
        {
          id: 'calendar-sync',
          name: 'Calendar Sync Service',
          type: 'system',
        }
      )

      return result
    } catch (error) {
      const errorResult: SyncResult = {
        success: false,
        provider: integration.provider,
        direction: integration.syncDirection,
        events: { created: 0, updated: 0, deleted: 0, skipped: 0, errors: 1 },
        errors: [{
          message: error instanceof Error ? error.message : 'Unknown sync error',
        }],
        duration: Date.now() - startTime,
      }

      await this.updateSyncStatus(integrationId, 'failed', errorResult)

      // Send error webhook
      await webhookManager.triggerWebhook(
        integration.leagueId,
        'sync.failed',
        {
          integration: {
            id: integration.id,
            provider: integration.provider,
            name: integration.name,
          },
          error: errorResult,
        }
      )

      throw error
    }
  }

  private async syncGoogleCalendar(integration: CalendarIntegration): Promise<SyncResult> {
    const credentials = await this.decryptCredentials(integration.credentials)
    
    // Initialize Google Calendar API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
    })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const result: SyncResult = {
      success: true,
      provider: 'google',
      direction: integration.syncDirection,
      events: { created: 0, updated: 0, deleted: 0, skipped: 0, errors: 0 },
      errors: [],
      duration: 0,
    }

    try {
      // Export reservations to Google Calendar
      if (integration.syncDirection === 'export' || integration.syncDirection === 'bidirectional') {
        await this.exportReservationsToGoogle(calendar, integration, result)
      }

      // Import events from Google Calendar
      if (integration.syncDirection === 'import' || integration.syncDirection === 'bidirectional') {
        await this.importEventsFromGoogle(calendar, integration, result)
      }

      return result
    } catch (error) {
      result.success = false
      result.errors.push({
        message: error instanceof Error ? error.message : 'Google Calendar sync error',
        details: error,
      })
      return result
    }
  }

  private async syncOutlookCalendar(integration: CalendarIntegration): Promise<SyncResult> {
    const credentials = await this.decryptCredentials(integration.credentials)
    
    // Initialize Microsoft Graph client
    const authProvider = new GraphAuthProvider(credentials.accessToken)
    const graphClient = Client.initWithMiddleware({ authProvider })

    const result: SyncResult = {
      success: true,
      provider: 'outlook',
      direction: integration.syncDirection,
      events: { created: 0, updated: 0, deleted: 0, skipped: 0, errors: 0 },
      errors: [],
      duration: 0,
    }

    try {
      // Export reservations to Outlook
      if (integration.syncDirection === 'export' || integration.syncDirection === 'bidirectional') {
        await this.exportReservationsToOutlook(graphClient, integration, result)
      }

      // Import events from Outlook
      if (integration.syncDirection === 'import' || integration.syncDirection === 'bidirectional') {
        await this.importEventsFromOutlook(graphClient, integration, result)
      }

      return result
    } catch (error) {
      result.success = false
      result.errors.push({
        message: error instanceof Error ? error.message : 'Outlook Calendar sync error',
        details: error,
      })
      return result
    }
  }

  private async exportReservationsToGoogle(
    calendar: any,
    integration: CalendarIntegration,
    result: SyncResult
  ): Promise<void> {
    // Get reservations to sync
    const reservations = await this.getReservationsToSync(integration)

    for (const reservation of reservations) {
      try {
        const event = this.transformReservationToGoogleEvent(reservation, integration)
        
        // Check if event already exists
        const existingEvent = await this.findGoogleEvent(calendar, integration.calendarId!, reservation.id)
        
        if (existingEvent) {
          // Update existing event
          await calendar.events.update({
            calendarId: integration.calendarId,
            eventId: existingEvent.id,
            resource: event,
          })
          result.events.updated++
        } else {
          // Create new event
          await calendar.events.insert({
            calendarId: integration.calendarId,
            resource: event,
          })
          result.events.created++
        }
      } catch (error) {
        result.events.errors++
        result.errors.push({
          eventId: reservation.id,
          message: error instanceof Error ? error.message : 'Export error',
        })
      }
    }
  }

  private async importEventsFromGoogle(
    calendar: any,
    integration: CalendarIntegration,
    result: SyncResult
  ): Promise<void> {
    const timeRange = integration.syncSettings.timeRange
    
    // Get events from Google Calendar
    const response = await calendar.events.list({
      calendarId: integration.calendarId,
      timeMin: timeRange.start,
      timeMax: timeRange.end,
      singleEvents: true,
      orderBy: 'startTime',
    })

    const events = response.data.items || []

    for (const event of events) {
      try {
        // Skip events created by our system
        if (event.summary?.startsWith(integration.syncSettings.eventPrefix)) {
          result.events.skipped++
          continue
        }

        // Transform Google event to reservation
        const reservationData = this.transformGoogleEventToReservation(event, integration)
        
        // Check if reservation already exists
        const existingReservation = await this.findReservationByExternalId(event.id)
        
        if (existingReservation) {
          // Update existing reservation
          await this.updateReservation(existingReservation.id, reservationData)
          result.events.updated++
        } else {
          // Create new reservation
          await this.createReservationFromEvent(reservationData, integration)
          result.events.created++
        }
      } catch (error) {
        result.events.errors++
        result.errors.push({
          eventId: event.id,
          message: error instanceof Error ? error.message : 'Import error',
        })
      }
    }
  }

  private async exportReservationsToOutlook(
    graphClient: Client,
    integration: CalendarIntegration,
    result: SyncResult
  ): Promise<void> {
    const reservations = await this.getReservationsToSync(integration)

    for (const reservation of reservations) {
      try {
        const event = this.transformReservationToOutlookEvent(reservation, integration)
        
        // Check if event already exists
        const existingEvent = await this.findOutlookEvent(graphClient, reservation.id)
        
        if (existingEvent) {
          // Update existing event
          await graphClient.api(`/me/events/${existingEvent.id}`).patch(event)
          result.events.updated++
        } else {
          // Create new event
          await graphClient.api('/me/events').post(event)
          result.events.created++
        }
      } catch (error) {
        result.events.errors++
        result.errors.push({
          eventId: reservation.id,
          message: error instanceof Error ? error.message : 'Export error',
        })
      }
    }
  }

  private async importEventsFromOutlook(
    graphClient: Client,
    integration: CalendarIntegration,
    result: SyncResult
  ): Promise<void> {
    const timeRange = integration.syncSettings.timeRange
    
    // Get events from Outlook
    const response = await graphClient
      .api('/me/events')
      .filter(`start/dateTime ge '${timeRange.start}' and end/dateTime le '${timeRange.end}'`)
      .orderby('start/dateTime')
      .get()

    const events = response.value || []

    for (const event of events) {
      try {
        // Skip events created by our system
        if (event.subject?.startsWith(integration.syncSettings.eventPrefix)) {
          result.events.skipped++
          continue
        }

        // Transform Outlook event to reservation
        const reservationData = this.transformOutlookEventToReservation(event, integration)
        
        // Check if reservation already exists
        const existingReservation = await this.findReservationByExternalId(event.id)
        
        if (existingReservation) {
          // Update existing reservation
          await this.updateReservation(existingReservation.id, reservationData)
          result.events.updated++
        } else {
          // Create new reservation
          await this.createReservationFromEvent(reservationData, integration)
          result.events.created++
        }
      } catch (error) {
        result.events.errors++
        result.errors.push({
          eventId: event.id,
          message: error instanceof Error ? error.message : 'Import error',
        })
      }
    }
  }

  // Transformation methods
  private transformReservationToGoogleEvent(reservation: any, integration: CalendarIntegration): any {
    const settings = integration.syncSettings
    
    return {
      summary: `${settings.eventPrefix}${reservation.field?.name} - ${reservation.user?.full_name}`,
      description: settings.includeDescription ? this.generateEventDescription(reservation) : undefined,
      location: settings.includeLocation ? reservation.field?.address : undefined,
      start: {
        dateTime: `${reservation.date}T${reservation.start_time}:00`,
        timeZone: reservation.timezone || 'America/New_York',
      },
      end: {
        dateTime: `${reservation.date}T${reservation.end_time}:00`,
        timeZone: reservation.timezone || 'America/New_York',
      },
      attendees: settings.includeAttendees ? this.generateAttendees(reservation) : undefined,
      reminders: {
        useDefault: false,
        overrides: settings.reminderMinutes.map(minutes => ({
          method: 'email',
          minutes,
        })),
      },
      colorId: settings.colorId,
      visibility: settings.visibility,
    }
  }

  private transformReservationToOutlookEvent(reservation: any, integration: CalendarIntegration): any {
    const settings = integration.syncSettings
    
    return {
      subject: `${settings.eventPrefix}${reservation.field?.name} - ${reservation.user?.full_name}`,
      body: settings.includeDescription ? {
        contentType: 'text',
        content: this.generateEventDescription(reservation),
      } : undefined,
      location: settings.includeLocation ? {
        displayName: reservation.field?.address,
      } : undefined,
      start: {
        dateTime: `${reservation.date}T${reservation.start_time}:00`,
        timeZone: reservation.timezone || 'America/New_York',
      },
      end: {
        dateTime: `${reservation.date}T${reservation.end_time}:00`,
        timeZone: reservation.timezone || 'America/New_York',
      },
      attendees: settings.includeAttendees ? this.generateOutlookAttendees(reservation) : undefined,
      reminderMinutesBeforeStart: settings.reminderMinutes[0] || 15,
      sensitivity: settings.visibility === 'private' ? 'private' : 'normal',
      categories: settings.categories,
    }
  }

  private generateEventDescription(reservation: any): string {
    const parts = [
      `Field: ${reservation.field?.name}`,
      `Team: ${reservation.team?.name || 'Individual'}`,
      `Purpose: ${reservation.purpose || 'Field reservation'}`,
    ]

    if (reservation.attendees) {
      parts.push(`Attendees: ${reservation.attendees}`)
    }

    if (reservation.notes) {
      parts.push(`Notes: ${reservation.notes}`)
    }

    parts.push(`Booked by: ${reservation.user?.full_name}`)
    
    return parts.join('\n')
  }

  private generateAttendees(reservation: any): any[] {
    const attendees = []
    
    if (reservation.user?.email) {
      attendees.push({
        email: reservation.user.email,
        displayName: reservation.user.full_name,
        responseStatus: 'accepted',
      })
    }

    if (reservation.team?.coach?.email) {
      attendees.push({
        email: reservation.team.coach.email,
        displayName: reservation.team.coach.full_name,
        responseStatus: 'needsAction',
      })
    }

    return attendees
  }

  private generateOutlookAttendees(reservation: any): any[] {
    const attendees = []
    
    if (reservation.user?.email) {
      attendees.push({
        emailAddress: {
          address: reservation.user.email,
          name: reservation.user.full_name,
        },
        type: 'required',
      })
    }

    if (reservation.team?.coach?.email) {
      attendees.push({
        emailAddress: {
          address: reservation.team.coach.email,
          name: reservation.team.coach.full_name,
        },
        type: 'optional',
      })
    }

    return attendees
  }

  // Helper methods
  private async getIntegration(integrationId: string): Promise<CalendarIntegration | null> {
    const { data: integration, error } = await this.supabase
      .from('calendar_integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (error) return null
    return this.transformIntegration(integration)
  }

  private async getReservationsToSync(integration: CalendarIntegration): Promise<any[]> {
    let query = this.supabase
      .from('reservations')
      .select(`
        *,
        field:fields(*),
        user:user_profiles(*),
        team:teams(*, coach:user_profiles(*))
      `)
      .eq('field.league_id', integration.leagueId)
      .gte('date', integration.syncSettings.timeRange.start)
      .lte('date', integration.syncSettings.timeRange.end)

    // Apply field filters
    if (integration.syncSettings.fieldFilters.length > 0) {
      query = query.in('field_id', integration.syncSettings.fieldFilters)
    }

    const { data: reservations, error } = await query

    if (error) throw error
    return reservations || []
  }

  private async encryptCredentials(credentials: any): Promise<EncryptedCredentials> {
    // In production, use proper encryption
    return credentials
  }

  private async decryptCredentials(credentials: EncryptedCredentials): Promise<EncryptedCredentials> {
    // In production, use proper decryption
    return credentials
  }

  private transformIntegration(integration: any): CalendarIntegration {
    return {
      id: integration.id,
      leagueId: integration.league_id,
      userId: integration.user_id,
      provider: integration.provider,
      name: integration.name,
      isActive: integration.is_active,
      syncDirection: integration.sync_direction,
      calendarId: integration.calendar_id,
      credentials: integration.credentials,
      lastSyncAt: integration.last_sync_at,
      nextSyncAt: integration.next_sync_at,
      syncFrequency: integration.sync_frequency,
      syncSettings: integration.sync_settings,
      createdAt: integration.created_at,
      updatedAt: integration.updated_at,
    }
  }

  private async scheduleSync(integrationId: string): Promise<void> {
    // Implementation for scheduling next sync
    console.log('Scheduling next sync for integration:', integrationId)
  }

  private async updateSyncStatus(
    integrationId: string,
    status: string,
    result?: SyncResult
  ): Promise<void> {
    await this.supabase
      .from('calendar_integrations')
      .update({
        sync_status: status,
        last_sync_result: result,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId)
  }

  private async updateLastSync(integrationId: string, result: SyncResult): Promise<void> {
    await this.supabase
      .from('calendar_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        next_sync_at: result.nextSyncAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId)
  }

  // Placeholder implementations for missing methods
  private async findGoogleEvent(calendar: any, calendarId: string, reservationId: string): Promise<any> {
    // Implementation to find existing Google event
    return null
  }

  private async findOutlookEvent(graphClient: Client, reservationId: string): Promise<any> {
    // Implementation to find existing Outlook event
    return null
  }

  private async findReservationByExternalId(externalId: string): Promise<any> {
    // Implementation to find reservation by external calendar event ID
    return null
  }

  private transformGoogleEventToReservation(event: any, integration: CalendarIntegration): any {
    // Implementation to transform Google event to reservation data
    return {}
  }

  private transformOutlookEventToReservation(event: any, integration: CalendarIntegration): any {
    // Implementation to transform Outlook event to reservation data
    return {}
  }

  private async updateReservation(reservationId: string, data: any): Promise<void> {
    // Implementation to update existing reservation
  }

  private async createReservationFromEvent(data: any, integration: CalendarIntegration): Promise<void> {
    // Implementation to create reservation from calendar event
  }
}

// Singleton instance
export const enhancedCalendarSync = new EnhancedCalendarSync()