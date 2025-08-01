import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateAuth,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { calendarSyncService } from '@/lib/calendar/calendar-sync'
import { 
  triggerReservationSync,
  triggerBatchSync,
  runScheduledSync,
  runOrphanedEventCleanup
} from '@/lib/calendar/reservation-hooks'

// POST /api/calendar/sync - Trigger calendar sync
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    const body = await req.json()
    const { 
      type = 'user', // 'user', 'reservation', 'batch', 'scheduled', 'cleanup'
      userId,
      reservationId,
      reservationIds,
      forceResync = false,
      dateRange
    } = body
    
    // Handle different sync types
    switch (type) {
      case 'scheduled':
        return handleScheduledSync(req)
        
      case 'cleanup':
        return handleCleanupSync(req)
        
      case 'user':
        return handleUserSync(req, userId, { forceResync, dateRange })
        
      case 'reservation':
        return handleReservationSync(req, reservationId)
        
      case 'batch':
        return handleBatchSync(req, reservationIds)
        
      default:
        return errorResponse('Invalid sync type', 400)
    }
  })(req)
}

// GET /api/calendar/sync - Get sync status and statistics
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    try {
      const stats = await calendarSyncService.getSyncStats(auth.user.id)
      
      return successResponse({
        stats,
        lastUpdated: new Date().toISOString()
      })
      
    } catch (error) {
      console.error('Failed to get sync stats:', error)
      return errorResponse('Failed to get sync stats', 500, error)
    }
  })(req)
}

/**
 * Handle scheduled sync (cron job)
 */
async function handleScheduledSync(req: NextRequest) {
  // Verify this is a cron job or internal request
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return errorResponse('Unauthorized', 401)
  }
  
  try {
    const results = await runScheduledSync()
    
    return successResponse({
      message: 'Scheduled sync completed',
      results
    })
    
  } catch (error) {
    console.error('Scheduled sync failed:', error)
    return errorResponse('Scheduled sync failed', 500, error)
  }
}

/**
 * Handle cleanup sync (cron job)
 */
async function handleCleanupSync(req: NextRequest) {
  // Verify this is a cron job or internal request
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return errorResponse('Unauthorized', 401)
  }
  
  try {
    const results = await runOrphanedEventCleanup()
    
    return successResponse({
      message: 'Cleanup completed',
      results
    })
    
  } catch (error) {
    console.error('Cleanup failed:', error)
    return errorResponse('Cleanup failed', 500, error)
  }
}

/**
 * Handle user sync
 */
async function handleUserSync(
  req: NextRequest, 
  userId?: string, 
  options: { forceResync?: boolean, dateRange?: any } = {}
) {
  // Validate auth
  const auth = await validateAuth()(req)
  if (!auth.valid) {
    return errorResponse('Unauthorized', 401)
  }
  
  const targetUserId = userId || auth.user.id
  
  // Users can only sync their own data unless they're admin
  if (targetUserId !== auth.user.id) {
    const supabase = createClient()
    const { data: user } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', auth.user.id)
      .single()
    
    if (!user || user.role !== 'admin') {
      return errorResponse('Forbidden', 403)
    }
  }
  
  try {
    const results = await calendarSyncService.bulkSyncUser(targetUserId, options)
    
    return successResponse({
      message: 'User sync completed',
      results
    })
    
  } catch (error) {
    console.error('User sync failed:', error)
    return errorResponse('User sync failed', 500, error)
  }
}

/**
 * Handle single reservation sync
 */
async function handleReservationSync(req: NextRequest, reservationId: string) {
  if (!reservationId) {
    return errorResponse('reservationId is required', 400)
  }
  
  // Validate auth
  const auth = await validateAuth()(req)
  if (!auth.valid) {
    return errorResponse('Unauthorized', 401)
  }
  
  const supabase = createClient()
  
  // Verify user owns the reservation
  const { data: reservation, error } = await supabase
    .from('reservations')
    .select('id, user_id')
    .eq('id', reservationId)
    .eq('user_id', auth.user.id)
    .single()
  
  if (error || !reservation) {
    return errorResponse('Reservation not found', 404)
  }
  
  try {
    await triggerReservationSync(
      reservationId,
      auth.user.id,
      'updated' // Assume update for manual sync
    )
    
    return successResponse({
      message: 'Reservation sync completed',
      reservationId
    })
    
  } catch (error) {
    console.error('Reservation sync failed:', error)
    return errorResponse('Reservation sync failed', 500, error)
  }
}

/**
 * Handle batch reservation sync
 */
async function handleBatchSync(req: NextRequest, reservationIds: string[]) {
  if (!reservationIds || !Array.isArray(reservationIds) || reservationIds.length === 0) {
    return errorResponse('reservationIds array is required', 400)
  }
  
  // Validate auth
  const auth = await validateAuth()(req)
  if (!auth.valid) {
    return errorResponse('Unauthorized', 401)
  }
  
  try {
    const results = await triggerBatchSync(
      reservationIds,
      auth.user.id,
      'updated' // Assume update for manual sync
    )
    
    return successResponse({
      message: 'Batch sync completed',
      results
    })
    
  } catch (error) {
    console.error('Batch sync failed:', error)
    return errorResponse('Batch sync failed', 500, error)
  }
}