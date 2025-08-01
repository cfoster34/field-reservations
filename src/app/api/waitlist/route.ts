import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  errorResponse,
  successResponse,
  paginatedResponse,
  validateBody,
  withErrorHandler,
} from '@/lib/api/middleware'
import { addToWaitlistSchema, paginationSchema } from '@/lib/api/validation'
import { z } from 'zod'

// GET /api/waitlist - Get user's waitlist entries
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  
  // Parse pagination params
  const pagination = paginationSchema.parse({
    page: searchParams.get('page'),
    pageSize: searchParams.get('pageSize'),
  })

  // Build query
  let query = supabase
    .from('waitlist')
    .select(`
      *,
      field:fields (
        id,
        name,
        type,
        address,
        hourly_rate
      )
    `, { count: 'exact' })
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })

  // Apply pagination
  const { data: waitlistEntries, count, error } = await query
    .range(
      (pagination.page - 1) * pagination.pageSize,
      pagination.page * pagination.pageSize - 1
    )

  if (error) {
    return errorResponse('Failed to fetch waitlist entries', 500, error)
  }

  return paginatedResponse(
    waitlistEntries || [],
    count || 0,
    pagination.page,
    pagination.pageSize
  )
})

// POST /api/waitlist - Add to waitlist
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await validateBody(addToWaitlistSchema)(req)
  if (!validation.valid) {
    return errorResponse('Invalid request data', 400, validation.errors)
  }

  const supabase = createClient()
  const { fieldId, desiredDate, desiredStartTime, desiredEndTime, priority } = validation.data

  // Check if field exists
  const { data: field, error: fieldError } = await supabase
    .from('fields')
    .select('id, name, league_id')
    .eq('id', fieldId)
    .single()

  if (fieldError || !field) {
    return errorResponse('Field not found', 404)
  }

  // Check if user already has a waitlist entry for this slot
  const { data: existingEntry } = await supabase
    .from('waitlist')
    .select('id')
    .eq('user_id', auth.user.id)
    .eq('field_id', fieldId)
    .eq('desired_date', desiredDate)
    .eq('desired_start_time', desiredStartTime)
    .eq('desired_end_time', desiredEndTime)
    .single()

  if (existingEntry) {
    return errorResponse('You are already on the waitlist for this slot', 400)
  }

  // Check if there's already a reservation for this slot
  const { data: reservation } = await supabase
    .rpc('check_reservation_conflict', {
      p_field_id: fieldId,
      p_date: desiredDate,
      p_start_time: desiredStartTime,
      p_end_time: desiredEndTime,
    })

  if (!reservation) {
    return errorResponse('This time slot is already available for booking', 400)
  }

  // Add to waitlist
  const { data: waitlistEntry, error } = await supabase
    .from('waitlist')
    .insert({
      user_id: auth.user.id,
      field_id: fieldId,
      desired_date: desiredDate,
      desired_start_time: desiredStartTime,
      desired_end_time: desiredEndTime,
      priority: priority || 0,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    })
    .select()
    .single()

  if (error) {
    return errorResponse('Failed to add to waitlist', 500, error)
  }

  // Create notification
  await supabase
    .from('notifications')
    .insert({
      user_id: auth.user.id,
      type: 'email',
      title: 'Added to Waitlist',
      content: `You've been added to the waitlist for ${field.name} on ${desiredDate} from ${desiredStartTime} to ${desiredEndTime}`,
      data: {
        waitlistId: waitlistEntry.id,
        fieldId,
        fieldName: field.name,
      },
    })

  return successResponse(waitlistEntry, 201)
})

// DELETE /api/waitlist - Remove from waitlist
export const DELETE = withErrorHandler(async (req: NextRequest) => {
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

  // Check if waitlist entry exists and belongs to user
  const { data: entry, error: fetchError } = await supabase
    .from('waitlist')
    .select('id')
    .eq('id', waitlistId)
    .eq('user_id', auth.user.id)
    .single()

  if (fetchError || !entry) {
    return errorResponse('Waitlist entry not found', 404)
  }

  // Delete waitlist entry
  const { error } = await supabase
    .from('waitlist')
    .delete()
    .eq('id', waitlistId)

  if (error) {
    return errorResponse('Failed to remove from waitlist', 500, error)
  }

  return successResponse({ message: 'Successfully removed from waitlist' })
})