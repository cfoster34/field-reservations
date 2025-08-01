import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  errorResponse,
  successResponse,
  withErrorHandler,
  cache,
} from '@/lib/api/middleware'

// GET /api/notifications/count - Get unread notification count
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const supabase = createClient()
  
  // Cache key for notification count
  const cacheKey = `notifications:count:${auth.user.id}`

  const count = await cache(cacheKey, async () => {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', auth.user.id)
      .eq('is_read', false)

    if (error) {
      throw error
    }

    return count || 0
  }, 30) // Cache for 30 seconds

  return successResponse({
    unreadCount: count,
    userId: auth.user.id,
  })
})