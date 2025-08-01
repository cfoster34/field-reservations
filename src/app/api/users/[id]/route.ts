import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  authorize,
  successResponse,
  errorResponse,
  logRequest,
  cache
} from '@/lib/api/middleware'

interface RouteParams {
  params: {
    id: string
  }
}

// GET /api/users/[id] - Get user by ID (admin/league_manager only)
export async function GET(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authorize admin or league manager
    const auth = await authorize(['admin', 'league_manager'])(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    if (!auth.authorized) {
      return errorResponse('Insufficient permissions', 403)
    }
    
    const userId = params.id
    const supabase = createClient()
    
    // Use cache for user data
    const user = await cache(
      `user:${userId}`,
      async () => {
        const { data, error } = await supabase
          .from('user_profiles')
          .select(`
            *,
            league:leagues(id, name, slug),
            team:teams(id, name, coach_id),
            reservations:reservations(count)
          `)
          .eq('id', userId)
          .single()
        
        if (error) throw error
        return data
      },
      300 // Cache for 5 minutes
    )
    
    if (!user) {
      return errorResponse('User not found', 404)
    }
    
    // Check if requester has access to this user
    if (auth.user.profile.role === 'league_manager' && 
        user.league_id !== auth.user.profile.league_id) {
      return errorResponse('Access denied to user from different league', 403)
    }
    
    return successResponse(user)
  })(req, { params })
}