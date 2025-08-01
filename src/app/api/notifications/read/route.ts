import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  errorResponse,
  successResponse,
  validateBody,
  withErrorHandler,
} from '@/lib/api/middleware'
import { markReadSchema } from '@/lib/api/validation'

// PUT /api/notifications/read - Mark notifications as read
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await validateBody(markReadSchema)(req)
  if (!validation.valid) {
    return errorResponse('Invalid request data', 400, validation.errors)
  }

  const supabase = createClient()
  const { notificationIds } = validation.data

  // Verify all notifications belong to the user
  const { data: notifications, error: fetchError } = await supabase
    .from('notifications')
    .select('id')
    .in('id', notificationIds)
    .eq('user_id', auth.user.id)

  if (fetchError) {
    return errorResponse('Failed to fetch notifications', 500, fetchError)
  }

  const validIds = notifications?.map(n => n.id) || []
  const invalidIds = notificationIds.filter(id => !validIds.includes(id))

  if (invalidIds.length > 0) {
    return errorResponse('Some notifications do not belong to you', 400, { invalidIds })
  }

  // Mark notifications as read
  const { error: updateError } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .in('id', validIds)
    .eq('user_id', auth.user.id)

  if (updateError) {
    return errorResponse('Failed to mark notifications as read', 500, updateError)
  }

  return successResponse({
    message: 'Notifications marked as read',
    updatedCount: validIds.length,
  })
})

// POST /api/notifications/read - Mark all notifications as read
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const supabase = createClient()

  // Mark all unread notifications as read
  const { error, count } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', auth.user.id)
    .eq('is_read', false)

  if (error) {
    return errorResponse('Failed to mark all notifications as read', 500, error)
  }

  return successResponse({
    message: 'All notifications marked as read',
    updatedCount: count || 0,
  })
})