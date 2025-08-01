import { createClient } from '@/lib/supabase/server'
import { googleCalendarService } from './google-calendar'
import { outlookCalendarService } from './outlook-calendar'
import { reminderService } from './reminder-service'

interface ReservationChange {
  type: 'created' | 'updated' | 'cancelled' | 'deleted'
  reservation: any
  oldReservation?: any
  userId: string
}

export class CalendarSyncService {
  
  /**
   * Handle reservation changes and sync to all connected calendars
   */
  async handleReservationChange(change: ReservationChange): Promise<void> {
    const { type, reservation, oldReservation, userId } = change
    
    try {
      // Run all sync operations in parallel
      await Promise.allSettled([
        this.syncToExternalCalendars(change),
        this.updateReminders(change),
        this.logSyncOperation(change)
      ])
      
    } catch (error) {
      console.error('Calendar sync error:', error)
      // Don't throw error to avoid breaking reservation operations
    }
  }
  
  /**
   * Sync to external calendar services (Google, Outlook)
   */
  private async syncToExternalCalendars(change: ReservationChange): Promise<void> {
    const { type, reservation, userId } = change
    
    const supabase = createClient()
    
    // Get user's calendar integrations
    const { data: integrations, error } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('sync_enabled', true)
    
    if (error || !integrations) {
      return
    }
    
    // Sync to each connected calendar service
    const syncPromises = integrations.map(async (integration) => {
      try {
        switch (integration.provider) {
          case 'google':
            await this.syncToGoogle(integration, change)
            break
          case 'outlook':
            await this.syncToOutlook(integration, change)
            break
        }
        
        // Log successful sync
        await this.logIntegrationSync(integration.id, type, 'success')
        
      } catch (error) {
        console.error(`Failed to sync to ${integration.provider}:`, error)
        
        // Log failed sync
        await this.logIntegrationSync(integration.id, type, 'failed', error.message)
      }
    })
    
    await Promise.allSettled(syncPromises)
  }
  
  /**
   * Sync to Google Calendar
   */
  private async syncToGoogle(integration: any, change: ReservationChange): Promise<void> {
    const { type, reservation, userId } = change
    
    switch (type) {
      case 'created':
        await googleCalendarService.syncReservation(userId, reservation, 'create')
        break
        
      case 'updated':
        await googleCalendarService.syncReservation(userId, reservation, 'update')
        break
        
      case 'cancelled':
      case 'deleted':
        await googleCalendarService.syncReservation(userId, reservation, 'delete')
        break
    }
  }
  
  /**
   * Sync to Outlook Calendar
   */
  private async syncToOutlook(integration: any, change: ReservationChange): Promise<void> {
    const { type, reservation, userId } = change
    
    switch (type) {
      case 'created':
        await outlookCalendarService.syncReservation(userId, reservation, 'create')
        break
        
      case 'updated':
        await outlookCalendarService.syncReservation(userId, reservation, 'update')
        break
        
      case 'cancelled':
      case 'deleted':
        await outlookCalendarService.syncReservation(userId, reservation, 'delete')
        break
    }
  }
  
  /**
   * Update calendar reminders based on reservation changes
   */
  private async updateReminders(change: ReservationChange): Promise<void> {
    const { type, reservation, oldReservation, userId } = change
    
    switch (type) {
      case 'created':
        // Create reminders for new reservation
        if (reservation.status === 'confirmed') {
          const reservationDateTime = new Date(`${reservation.date}T${reservation.start_time}`)
          await reminderService.createReminders(
            reservation.id,
            userId,
            reservationDateTime
          )
        }
        break
        
      case 'updated':
        // Handle reservation updates
        if (oldReservation && reservation) {
          const dateChanged = reservation.date !== oldReservation.date
          const timeChanged = reservation.start_time !== oldReservation.start_time
          const statusChanged = reservation.status !== oldReservation.status
          
          if (dateChanged || timeChanged) {
            // Update reminder timing
            const newReservationDate = new Date(`${reservation.date}T${reservation.start_time}`)
            await reminderService.updateReminders(
              reservation.id,
              newReservationDate,
              reservation.start_time
            )
          }
          
          if (statusChanged) {
            if (reservation.status === 'cancelled') {
              // Cancel reminders
              await reminderService.cancelReminders(reservation.id)
            } else if (reservation.status === 'confirmed' && oldReservation.status !== 'confirmed') {
              // Create reminders for newly confirmed reservation
              const reservationDateTime = new Date(`${reservation.date}T${reservation.start_time}`)
              await reminderService.createReminders(
                reservation.id,
                userId,
                reservationDateTime
              )
            }
          }
        }
        break
        
      case 'cancelled':
      case 'deleted':
        // Cancel all reminders
        await reminderService.cancelReminders(reservation.id)
        break
    }
  }
  
  /**
   * Log sync operation for audit trail
   */
  private async logSyncOperation(change: ReservationChange): Promise<void> {
    const supabase = createClient()
    
    try {
      await supabase
        .from('calendar_sync_log')
        .insert({
          reservation_id: change.reservation.id,
          operation: change.type,
          status: 'success',
          sync_direction: 'outbound',
          metadata: {
            reservation_data: change.reservation,
            old_reservation_data: change.oldReservation,
            timestamp: new Date().toISOString()
          }
        })
    } catch (error) {
      console.error('Failed to log sync operation:', error)
    }
  }
  
  /**
   * Log integration-specific sync result
   */
  private async logIntegrationSync(
    integrationId: string,
    operation: string,
    status: 'success' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    const supabase = createClient()
    
    try {
      await supabase
        .from('calendar_sync_log')
        .insert({
          integration_id: integrationId,
          operation,
          status,
          error_message: errorMessage,
          sync_direction: 'outbound'
        })
    } catch (error) {
      console.error('Failed to log integration sync:', error)
    }
  }
  
  /**
   * Bulk sync all reservations for a user
   */
  async bulkSyncUser(userId: string, options: {
    forceResync?: boolean
    dateRange?: {
      start: string
      end: string
    }
  } = {}): Promise<{
    total: number
    synced: number
    failed: number
    errors: string[]
  }> {
    const supabase = createClient()
    
    // Get user's reservations
    let query = supabase
      .from('reservations')
      .select(`
        *,
        field:fields(id, name, address, type),
        user:user_profiles(id, full_name),
        team:teams(id, name)
      `)
      .eq('user_id', userId)
      .in('status', ['pending', 'confirmed'])
    
    if (options.dateRange) {
      query = query
        .gte('date', options.dateRange.start)
        .lte('date', options.dateRange.end)
    } else {
      // Default to future reservations
      query = query.gte('date', new Date().toISOString().split('T')[0])
    }
    
    const { data: reservations, error } = await query
    
    if (error) {
      throw new Error(`Failed to fetch reservations: ${error.message}`)
    }
    
    const results = {
      total: reservations?.length || 0,
      synced: 0,
      failed: 0,
      errors: [] as string[]
    }
    
    // Sync each reservation
    for (const reservation of reservations || []) {
      try {
        const change: ReservationChange = {
          type: options.forceResync ? 'updated' : 'created',
          reservation,
          userId
        }
        
        await this.handleReservationChange(change)
        results.synced++
        
      } catch (error) {
        results.failed++
        results.errors.push(`Reservation ${reservation.id}: ${error.message}`)
      }
    }
    
    return results
  }
  
  /**
   * Clean up orphaned calendar events
   */
  async cleanupOrphanedEvents(userId: string): Promise<{
    cleaned: number
    errors: string[]
  }> {
    const supabase = createClient()
    const results = {
      cleaned: 0,
      errors: [] as string[]
    }
    
    // Get reservations with external calendar events
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('id, external_calendar_events, status')
      .eq('user_id', userId)
      .not('external_calendar_events', 'is', null)
    
    if (error) {
      results.errors.push(`Failed to fetch reservations: ${error.message}`)
      return results
    }
    
    // Get user's calendar integrations
    const { data: integrations } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('sync_enabled', true)
    
    if (!integrations) {
      return results
    }
    
    // Clean up events for cancelled/deleted reservations
    for (const reservation of reservations || []) {
      if (reservation.status === 'cancelled' || reservation.status === 'deleted') {
        const externalEvents = reservation.external_calendar_events || {}
        
        for (const integration of integrations) {
          const eventId = externalEvents[integration.provider]?.event_id
          if (!eventId) continue
          
          try {
            switch (integration.provider) {
              case 'google':
                await googleCalendarService.deleteEvent(integration, eventId)
                break
              case 'outlook':
                await outlookCalendarService.deleteEvent(integration, eventId)
                break
            }
            
            results.cleaned++
            
            // Clear the external event ID
            delete externalEvents[integration.provider]
            
            await supabase
              .from('reservations')
              .update({ external_calendar_events: externalEvents })
              .eq('id', reservation.id)
              
          } catch (error) {
            results.errors.push(`Failed to clean up ${integration.provider} event ${eventId}: ${error.message}`)
          }
        }
      }
    }
    
    return results
  }
  
  /**
   * Get sync statistics for a user
   */
  async getSyncStats(userId: string): Promise<{
    totalReservations: number
    syncedReservations: number
    pendingSync: number
    lastSyncAt?: string
    integrations: Array<{
      provider: string
      enabled: boolean
      lastSync?: string
      syncCount: number
    }>
  }> {
    const supabase = createClient()
    
    // Get total reservations
    const { count: totalReservations } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['pending', 'confirmed'])
    
    // Get synced reservations (have external calendar events)
    const { count: syncedReservations } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['pending', 'confirmed'])
      .not('external_calendar_events', 'is', null)
    
    // Get integrations
    const { data: integrations } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', userId)
    
    // Get sync log stats
    const integrationStats = await Promise.all(
      (integrations || []).map(async (integration) => {
        const { count: syncCount } = await supabase
          .from('calendar_sync_log')
          .select('*', { count: 'exact', head: true })
          .eq('integration_id', integration.id)
          .eq('status', 'success')
        
        return {
          provider: integration.provider,
          enabled: integration.sync_enabled,
          lastSync: integration.last_sync_at,
          syncCount: syncCount || 0
        }
      })
    )
    
    return {
      totalReservations: totalReservations || 0,
      syncedReservations: syncedReservations || 0,
      pendingSync: (totalReservations || 0) - (syncedReservations || 0),
      lastSyncAt: integrations?.[0]?.last_sync_at,
      integrations: integrationStats
    }
  }
}

export const calendarSyncService = new CalendarSyncService()