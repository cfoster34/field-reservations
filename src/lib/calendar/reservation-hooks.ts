import { calendarSyncService } from './calendar-sync'

/**
 * Database webhook function for reservation changes
 * This would be called by Supabase database triggers
 */
export async function handleReservationTrigger(
  payload: {
    type: 'INSERT' | 'UPDATE' | 'DELETE'
    table: string
    record: any
    old_record?: any
  }
) {
  try {
    // Only process reservation table changes
    if (payload.table !== 'reservations') {
      return
    }
    
    const reservation = payload.record
    const oldReservation = payload.old_record
    
    if (!reservation || !reservation.user_id) {
      return
    }
    
    // Map database trigger type to our change type
    let changeType: 'created' | 'updated' | 'cancelled' | 'deleted'
    
    switch (payload.type) {
      case 'INSERT':
        changeType = 'created'
        break
      case 'UPDATE':
        // Check if reservation was cancelled
        if (reservation.status === 'cancelled' && oldReservation?.status !== 'cancelled') {
          changeType = 'cancelled'
        } else {
          changeType = 'updated'
        }
        break
      case 'DELETE':
        changeType = 'deleted'
        break
      default:
        return
    }
    
    // Handle the reservation change
    await calendarSyncService.handleReservationChange({
      type: changeType,
      reservation,
      oldReservation,
      userId: reservation.user_id
    })
    
    console.log(`Calendar sync triggered for reservation ${reservation.id}: ${changeType}`)
    
  } catch (error) {
    console.error('Error in reservation trigger:', error)
    // Don't throw error to avoid breaking database operations
  }
}

/**
 * Manual sync trigger for API endpoints
 */
export async function triggerReservationSync(
  reservationId: string,
  userId: string,
  changeType: 'created' | 'updated' | 'cancelled' | 'deleted',
  reservation?: any,
  oldReservation?: any
) {
  try {
    if (!reservation) {
      // Fetch reservation data if not provided
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          field:fields(id, name, address, type),
          user:user_profiles(id, full_name),
          team:teams(id, name)
        `)
        .eq('id', reservationId)
        .single()
      
      if (error || !data) {
        console.error('Failed to fetch reservation for sync:', error)
        return
      }
      
      reservation = data
    }
    
    await calendarSyncService.handleReservationChange({
      type: changeType,
      reservation,
      oldReservation,
      userId
    })
    
  } catch (error) {
    console.error('Error in manual sync trigger:', error)
    throw error // Re-throw for API error handling
  }
}

/**
 * Batch sync trigger for multiple reservations
 */
export async function triggerBatchSync(
  reservationIds: string[],
  userId: string,
  changeType: 'created' | 'updated' = 'updated'
) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = createClient()
  
  // Fetch all reservations in batch
  const { data: reservations, error } = await supabase
    .from('reservations')
    .select(`
      *,
      field:fields(id, name, address, type),
      user:user_profiles(id, full_name),
      team:teams(id, name)
    `)
    .in('id', reservationIds)
    .eq('user_id', userId)
  
  if (error || !reservations) {
    throw new Error(`Failed to fetch reservations: ${error?.message}`)
  }
  
  const results = {
    total: reservations.length,
    synced: 0,
    failed: 0,
    errors: [] as string[]
  }
  
  // Process each reservation
  for (const reservation of reservations) {
    try {
      await calendarSyncService.handleReservationChange({
        type: changeType,
        reservation,
        userId
      })
      
      results.synced++
      
    } catch (error) {
      results.failed++
      results.errors.push(`${reservation.id}: ${error.message}`)
    }
  }
  
  return results
}

/**
 * Scheduled sync for ensuring all reservations are synchronized
 */
export async function runScheduledSync() {
  try {
    console.log('Starting scheduled calendar sync...')
    
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()
    
    // Get all users with active calendar integrations
    const { data: integrations, error } = await supabase
      .from('calendar_integrations')
      .select('user_id, provider, last_sync_at')
      .eq('sync_enabled', true)
      .order('last_sync_at', { ascending: true, nullsFirst: true })
    
    if (error || !integrations) {
      console.error('Failed to fetch integrations for scheduled sync:', error)
      return
    }
    
    const userIds = [...new Set(integrations.map(i => i.user_id))]
    console.log(`Processing scheduled sync for ${userIds.length} users`)
    
    const syncResults = {
      totalUsers: userIds.length,
      processedUsers: 0,
      failedUsers: 0,
      totalReservations: 0,
      syncedReservations: 0,
      errors: [] as string[]
    }
    
    // Process each user
    for (const userId of userIds) {
      try {
        // Only sync reservations that haven't been synced in the last hour
        // or have no sync record
        const lastSyncThreshold = new Date(Date.now() - 60 * 60 * 1000).toISOString()
        
        const userResult = await calendarSyncService.bulkSyncUser(userId, {
          dateRange: {
            start: new Date().toISOString().split('T')[0],
            end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 1 year ahead
          }
        })
        
        syncResults.processedUsers++
        syncResults.totalReservations += userResult.total
        syncResults.syncedReservations += userResult.synced
        
        if (userResult.errors.length > 0) {
          syncResults.errors.push(...userResult.errors)
        }
        
      } catch (error) {
        syncResults.failedUsers++
        syncResults.errors.push(`User ${userId}: ${error.message}`)
        console.error(`Failed to sync user ${userId}:`, error)
      }
    }
    
    console.log('Scheduled calendar sync completed:', syncResults)
    
    // Log sync summary
    await supabase
      .from('calendar_sync_log')
      .insert({
        operation: 'scheduled_sync',
        status: syncResults.failedUsers === 0 ? 'success' : 'partial',
        metadata: {
          sync_results: syncResults,
          timestamp: new Date().toISOString()
        }
      })
    
    return syncResults
    
  } catch (error) {
    console.error('Scheduled sync failed:', error)
    throw error
  }
}

/**
 * Cleanup orphaned calendar events
 */
export async function runOrphanedEventCleanup() {
  try {
    console.log('Starting orphaned event cleanup...')
    
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()
    
    // Get all users with calendar integrations
    const { data: integrations, error } = await supabase
      .from('calendar_integrations')
      .select('user_id')
      .eq('sync_enabled', true)
    
    if (error || !integrations) {
      console.error('Failed to fetch integrations for cleanup:', error)
      return
    }
    
    const userIds = [...new Set(integrations.map(i => i.user_id))]
    
    const cleanupResults = {
      totalUsers: userIds.length,
      processedUsers: 0,
      totalCleaned: 0,
      errors: [] as string[]
    }
    
    // Process each user
    for (const userId of userIds) {
      try {
        const userResult = await calendarSyncService.cleanupOrphanedEvents(userId)
        
        cleanupResults.processedUsers++
        cleanupResults.totalCleaned += userResult.cleaned
        cleanupResults.errors.push(...userResult.errors)
        
      } catch (error) {
        cleanupResults.errors.push(`User ${userId}: ${error.message}`)
        console.error(`Failed to cleanup for user ${userId}:`, error)
      }
    }
    
    console.log('Orphaned event cleanup completed:', cleanupResults)
    
    return cleanupResults
    
  } catch (error) {
    console.error('Orphaned event cleanup failed:', error)
    throw error
  }
}