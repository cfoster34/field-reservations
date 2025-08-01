import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  errorResponse,
  successResponse,
  withErrorHandler,
} from '@/lib/api/middleware'

// GET /api/waitlist/position - Check position in waitlist
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const { searchParams } = new URL(req.url)
  const waitlistId = searchParams.get('id')

  if (!waitlistId) {
    return errorResponse('Waitlist ID is required', 400)
  }

  const supabase = createClient()

  // Get the waitlist entry
  const { data: entry, error: entryError } = await supabase
    .from('waitlist')
    .select(`
      *,
      field:fields (
        id,
        name,
        type
      )
    `)
    .eq('id', waitlistId)
    .eq('user_id', auth.user.id)
    .single()

  if (entryError || !entry) {
    return errorResponse('Waitlist entry not found', 404)
  }

  // Count how many people are ahead in the queue
  const { count: peopleAhead, error: countError } = await supabase
    .from('waitlist')
    .select('*', { count: 'exact', head: true })
    .eq('field_id', entry.field_id)
    .eq('desired_date', entry.desired_date)
    .eq('desired_start_time', entry.desired_start_time)
    .eq('desired_end_time', entry.desired_end_time)
    .or(`priority.gt.${entry.priority},and(priority.eq.${entry.priority},created_at.lt.${entry.created_at})`)

  if (countError) {
    return errorResponse('Failed to calculate position', 500, countError)
  }

  // Get total number in queue
  const { count: totalInQueue, error: totalError } = await supabase
    .from('waitlist')
    .select('*', { count: 'exact', head: true })
    .eq('field_id', entry.field_id)
    .eq('desired_date', entry.desired_date)
    .eq('desired_start_time', entry.desired_start_time)
    .eq('desired_end_time', entry.desired_end_time)

  if (totalError) {
    return errorResponse('Failed to get total queue size', 500, totalError)
  }

  // Check if the slot is currently available
  const { data: isConflict } = await supabase
    .rpc('check_reservation_conflict', {
      p_field_id: entry.field_id,
      p_date: entry.desired_date,
      p_start_time: entry.desired_start_time,
      p_end_time: entry.desired_end_time,
    })

  return successResponse({
    waitlistEntry: entry,
    position: (peopleAhead || 0) + 1,
    totalInQueue: totalInQueue || 0,
    isSlotAvailable: !isConflict,
    estimatedWaitTime: calculateEstimatedWaitTime(peopleAhead || 0, entry.desired_date),
  })
})

// Helper function to estimate wait time
function calculateEstimatedWaitTime(peopleAhead: number, desiredDate: string): string {
  // This is a simplified estimation
  // In reality, you'd want to analyze historical data
  const daysUntilSlot = Math.max(0, 
    Math.floor((new Date(desiredDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  )
  
  if (peopleAhead === 0) {
    return 'You are next in line'
  }
  
  if (daysUntilSlot > 7) {
    return `${peopleAhead} people ahead of you`
  }
  
  // Assume 20% cancellation rate as people get closer to the date
  const estimatedCancellations = Math.floor(peopleAhead * 0.2)
  const effectivePosition = Math.max(1, peopleAhead - estimatedCancellations)
  
  if (effectivePosition === 1) {
    return 'High chance of getting this slot'
  } else if (effectivePosition <= 3) {
    return 'Moderate chance of getting this slot'
  } else {
    return 'Low chance of getting this slot'
  }
}