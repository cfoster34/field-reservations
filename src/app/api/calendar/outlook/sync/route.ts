import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateAuth,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { outlookCalendarService } from '@/lib/calendar/outlook-calendar'

// POST /api/calendar/outlook/sync - Manually trigger sync of reservations
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const { reservationIds, forceResync } = await req.json()
    
    const supabase = createClient()
    
    // Get user's Outlook Calendar integration
    const { data: integration, error: integrationError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('provider', 'outlook')
      .eq('sync_enabled', true)
      .single()
    
    if (integrationError || !integration) {
      return errorResponse('Outlook Calendar not connected', 404)
    }
    
    try {
      let query = supabase
        .from('reservations')
        .select(`
          *,
          field:fields(id, name, address, type),
          user:user_profiles(id, full_name),
          team:teams(id, name)
        `)
        .eq('user_id', auth.user.id)
        .in('status', ['pending', 'confirmed'])
      
      // Filter by specific reservation IDs if provided
      if (reservationIds && reservationIds.length > 0) {
        query = query.in('id', reservationIds)
      } else {
        // Default to future reservations
        query = query.gte('date', new Date().toISOString().split('T')[0])
      }
      
      const { data: reservations, error: reservationsError } = await query
      
      if (reservationsError) {
        return errorResponse('Failed to fetch reservations', 500, reservationsError)
      }
      
      const syncResults = {
        total: reservations?.length || 0,
        synced: 0,
        failed: 0,
        errors: [] as string[]
      }
      
      // Sync each reservation
      for (const reservation of reservations || []) {
        try {
          const hasExistingEvent = reservation.external_calendar_events?.outlook?.event_id
          
          if (hasExistingEvent && !forceResync) {
            // Update existing event
            await outlookCalendarService.syncReservation(
              auth.user.id,
              reservation,
              'update'
            )
          } else {
            // Create new event
            await outlookCalendarService.syncReservation(
              auth.user.id,
              reservation,
              'create'
            )
          }
          
          syncResults.synced++
          
          // Log successful sync
          await supabase
            .from('calendar_sync_log')
            .insert({
              integration_id: integration.id,
              reservation_id: reservation.id,
              operation: hasExistingEvent ? 'update' : 'create',
              status: 'success',
              sync_direction: 'outbound'
            })
          
        } catch (error) {
          console.error(`Failed to sync reservation ${reservation.id}:`, error)
          syncResults.failed++
          syncResults.errors.push(`Reservation ${reservation.id}: ${error.message}`)
          
          // Log failed sync
          await supabase
            .from('calendar_sync_log')
            .insert({
              integration_id: integration.id,
              reservation_id: reservation.id,
              operation: 'sync',
              status: 'failed',
              error_message: error.message,
              sync_direction: 'outbound'
            })
        }
      }
      
      // Update last sync time
      await supabase
        .from('calendar_integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', integration.id)
      
      return successResponse({
        message: 'Sync completed',
        results: syncResults
      })
      
    } catch (error) {
      console.error('Sync error:', error)
      return errorResponse('Sync failed', 500, error)
    }
  })(req)
}

// DELETE /api/calendar/outlook/sync - Disconnect Outlook Calendar integration
export async function DELETE(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const supabase = createClient()
    
    // Get integration to clean up events
    const { data: integration } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('provider', 'outlook')
      .single()
    
    if (integration) {
      try {
        // Get reservations with Outlook events to clean up
        const { data: reservations } = await supabase
          .from('reservations')
          .select('id, external_calendar_events')
          .eq('user_id', auth.user.id)
          .not('external_calendar_events->outlook->event_id', 'is', null)
        
        // Delete Outlook Calendar events
        for (const reservation of reservations || []) {
          const outlookEventId = reservation.external_calendar_events?.outlook?.event_id
          if (outlookEventId) {
            try {
              await outlookCalendarService.deleteEvent(integration, outlookEventId)
              
              // Clear Outlook event ID from reservation
              const updatedEvents = { ...reservation.external_calendar_events }
              delete updatedEvents.outlook
              
              await supabase
                .from('reservations')
                .update({ external_calendar_events: updatedEvents })
                .eq('id', reservation.id)
                
            } catch (error) {
              console.error(`Failed to delete Outlook event ${outlookEventId}:`, error)
              // Continue with other events
            }
          }
        }
        
      } catch (error) {
        console.error('Failed to clean up Outlook Calendar events:', error)
      }
      
      // Delete integration and related data
      await supabase
        .from('calendar_integrations')
        .delete()
        .eq('user_id', auth.user.id)
        .eq('provider', 'outlook')
    }
    
    return successResponse({
      message: 'Outlook Calendar integration disconnected'
    })
  })(req)
}