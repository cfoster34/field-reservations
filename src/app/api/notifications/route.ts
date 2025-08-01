import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  authorize,
  errorResponse,
  successResponse,
  paginatedResponse,
  validateBody,
  withErrorHandler,
} from '@/lib/api/middleware'
import { sendNotificationSchema, paginationSchema } from '@/lib/api/validation'
import { sendEmail } from '@/lib/sendgrid/client'
import { getNotificationTemplate } from '@/lib/sendgrid/templates'

// GET /api/notifications - Get user notifications
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
    sortBy: searchParams.get('sortBy') || 'created_at',
    sortOrder: searchParams.get('sortOrder'),
  })

  // Get filters
  const unreadOnly = searchParams.get('unreadOnly') === 'true'
  const type = searchParams.get('type')

  // Build query
  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', auth.user.id)

  // Apply filters
  if (unreadOnly) {
    query = query.eq('is_read', false)
  }
  
  if (type) {
    query = query.eq('type', type)
  }

  // Apply sorting
  query = query.order(pagination.sortBy, { ascending: pagination.sortOrder === 'asc' })

  // Apply pagination
  const { data: notifications, count, error } = await query
    .range(
      (pagination.page - 1) * pagination.pageSize,
      pagination.page * pagination.pageSize - 1
    )

  if (error) {
    return errorResponse('Failed to fetch notifications', 500, error)
  }

  return paginatedResponse(
    notifications || [],
    count || 0,
    pagination.page,
    pagination.pageSize
  )
})

// POST /api/notifications - Send notification
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin', 'coach'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await validateBody(sendNotificationSchema)(req)
  if (!validation.valid) {
    return errorResponse('Invalid request data', 400, validation.errors)
  }

  const supabase = createClient()
  const { userId, teamId, type, title, content, data, scheduledFor } = validation.data

  // Validate recipient
  if (!userId && !teamId) {
    return errorResponse('Either userId or teamId must be provided', 400)
  }

  if (userId && teamId) {
    return errorResponse('Cannot specify both userId and teamId', 400)
  }

  const leagueId = auth.user.profile?.league_id
  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  try {
    let recipientIds: string[] = []

    if (userId) {
      // Check if user exists and is in the same league
      const { data: user } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, notification_preferences')
        .eq('id', userId)
        .eq('league_id', leagueId)
        .single()

      if (!user) {
        return errorResponse('User not found or not in your league', 404)
      }

      recipientIds = [userId]
    } else if (teamId) {
      // Check if team exists and user has permission
      const { data: team } = await supabase
        .from('teams')
        .select('id, name, coach_id, assistant_coach_ids, league_id')
        .eq('id', teamId)
        .eq('league_id', leagueId)
        .single()

      if (!team) {
        return errorResponse('Team not found', 404)
      }

      // Check permission for coaches
      if (auth.user.profile?.role === 'coach') {
        const isCoach = team.coach_id === auth.user.id
        const isAssistantCoach = team.assistant_coach_ids?.includes(auth.user.id)
        
        if (!isCoach && !isAssistantCoach) {
          return errorResponse('You can only send notifications to your own team', 403)
        }
      }

      // Get all team members
      const { data: members } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('team_id', teamId)
        .eq('is_active', true)

      recipientIds = members?.map(m => m.id) || []
    }

    if (recipientIds.length === 0) {
      return errorResponse('No recipients found', 400)
    }

    // Create notifications
    const notifications = recipientIds.map(recipientId => ({
      user_id: recipientId,
      type,
      title,
      content,
      data: {
        ...data,
        sentBy: auth.user.profile?.full_name,
        sentById: auth.user.id,
      },
      scheduled_for: scheduledFor || new Date().toISOString(),
    }))

    const { data: createdNotifications, error } = await supabase
      .from('notifications')
      .insert(notifications)
      .select()

    if (error) {
      return errorResponse('Failed to create notifications', 500, error)
    }

    // Send immediate notifications if not scheduled for future
    if (!scheduledFor || new Date(scheduledFor) <= new Date()) {
      await sendImmediateNotifications(createdNotifications, supabase)
    }

    return successResponse({
      notifications: createdNotifications,
      recipientCount: recipientIds.length,
    }, 201)
  } catch (error) {
    console.error('Error sending notifications:', error)
    return errorResponse('Failed to send notifications', 500, error)
  }
})

// Helper function to send immediate notifications
async function sendImmediateNotifications(notifications: any[], supabase: any) {
  for (const notification of notifications) {
    try {
      // Get user preferences
      const { data: user } = await supabase
        .from('user_profiles')
        .select('email, full_name, notification_preferences')
        .eq('id', notification.user_id)
        .single()

      if (!user) continue

      const preferences = user.notification_preferences || {}

      // Send based on notification type and user preferences
      if (notification.type === 'email' && preferences.email !== false) {
        await sendEmail({
          to: user.email,
          subject: notification.title,
          templateId: getNotificationTemplate('generic'),
          dynamicTemplateData: {
            name: user.full_name,
            title: notification.title,
            content: notification.content,
            actionUrl: notification.data?.actionUrl,
            actionText: notification.data?.actionText,
          },
        })
      }

      // Update notification as sent
      await supabase
        .from('notifications')
        .update({
          is_sent: true,
          sent_at: new Date().toISOString(),
        })
        .eq('id', notification.id)
    } catch (error) {
      console.error(`Failed to send notification ${notification.id}:`, error)
    }
  }
}