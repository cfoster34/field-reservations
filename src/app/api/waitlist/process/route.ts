import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  authorize,
  errorResponse,
  successResponse,
  withErrorHandler,
} from '@/lib/api/middleware'

// POST /api/waitlist/process - Process waitlist for a cancelled reservation
export const POST = withErrorHandler(async (req: NextRequest) => {
  // This endpoint should be called by the system or admin
  const auth = await authorize(['admin'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const { fieldId, date, startTime, endTime } = await req.json()

  if (!fieldId || !date || !startTime || !endTime) {
    return errorResponse('Missing required fields', 400)
  }

  const supabase = createClient()

  // Process waitlist using the database function
  const { data: notifiedUserId, error } = await supabase
    .rpc('process_waitlist_for_slot', {
      p_field_id: fieldId,
      p_date: date,
      p_start_time: startTime,
      p_end_time: endTime,
    })

  if (error) {
    return errorResponse('Failed to process waitlist', 500, error)
  }

  if (notifiedUserId) {
    // Get user details for response
    const { data: user } = await supabase
      .from('user_profiles')
      .select('id, email, full_name')
      .eq('id', notifiedUserId)
      .single()

    // Set expiration for the waitlist notification (24 hours)
    await supabase
      .from('waitlist')
      .update({
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('user_id', notifiedUserId)
      .eq('field_id', fieldId)
      .eq('desired_date', date)
      .eq('desired_start_time', startTime)
      .eq('desired_end_time', endTime)

    return successResponse({
      processed: true,
      notifiedUser: user,
      message: 'Waitlist processed successfully',
    })
  }

  return successResponse({
    processed: true,
    notifiedUser: null,
    message: 'No users in waitlist for this slot',
  })
})

// GET /api/waitlist/process - Get slots that need waitlist processing
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const supabase = createClient()

  // Find recently cancelled reservations that might have waitlist entries
  const { data: cancelledSlots, error } = await supabase
    .from('reservations')
    .select(`
      field_id,
      date,
      start_time,
      end_time,
      cancelled_at,
      field:fields (
        name,
        type
      )
    `)
    .eq('status', 'cancelled')
    .gte('cancelled_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
    .order('cancelled_at', { ascending: false })

  if (error) {
    return errorResponse('Failed to fetch cancelled slots', 500, error)
  }

  // For each cancelled slot, check if there are waitlist entries
  const slotsWithWaitlist = []
  
  for (const slot of cancelledSlots || []) {
    const { count } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .eq('field_id', slot.field_id)
      .eq('desired_date', slot.date)
      .eq('desired_start_time', slot.start_time)
      .eq('desired_end_time', slot.end_time)
      .is('notified_at', null)

    if (count && count > 0) {
      slotsWithWaitlist.push({
        ...slot,
        waitlistCount: count,
      })
    }
  }

  return successResponse({
    slots: slotsWithWaitlist,
    total: slotsWithWaitlist.length,
  })
})