import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  errorResponse,
  successResponse,
  validateBody,
  withErrorHandler,
} from '@/lib/api/middleware'
import { z } from 'zod'

const notificationPreferencesSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
  push: z.boolean(),
  reminderHours: z.number().min(0).max(72),
})

// GET /api/notifications/preferences - Get notification preferences
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const supabase = createClient()

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('notification_preferences')
    .eq('id', auth.user.id)
    .single()

  if (error || !profile) {
    return errorResponse('Failed to fetch preferences', 500, error)
  }

  const defaultPreferences = {
    email: true,
    sms: false,
    push: true,
    reminderHours: 24,
  }

  return successResponse({
    preferences: {
      ...defaultPreferences,
      ...profile.notification_preferences,
    },
  })
})

// PUT /api/notifications/preferences - Update notification preferences
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await validateBody(notificationPreferencesSchema)(req)
  if (!validation.valid) {
    return errorResponse('Invalid request data', 400, validation.errors)
  }

  const supabase = createClient()
  const preferences = validation.data

  const { error } = await supabase
    .from('user_profiles')
    .update({
      notification_preferences: preferences,
      updated_at: new Date().toISOString(),
    })
    .eq('id', auth.user.id)

  if (error) {
    return errorResponse('Failed to update preferences', 500, error)
  }

  return successResponse({
    message: 'Preferences updated successfully',
    preferences,
  })
})