import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  authorize,
  validateBody,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { updateRoleSchema } from '@/lib/api/validation'

// PUT /api/users/role - Update user role (admin/league_manager only)
export async function PUT(req: NextRequest) {
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
    
    // Validate request body
    const validation = await validateBody(updateRoleSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const { userId, role } = validation.data
    const supabase = createClient()
    
    // Get target user
    const { data: targetUser } = await supabase
      .from('user_profiles')
      .select('id, league_id, role')
      .eq('id', userId)
      .single()
    
    if (!targetUser) {
      return errorResponse('User not found', 404)
    }
    
    // Check permissions
    if (auth.user.profile.role === 'league_manager') {
      // League managers can only manage users in their league
      if (targetUser.league_id !== auth.user.profile.league_id) {
        return errorResponse('Cannot manage users from different league', 403)
      }
      
      // League managers cannot create admins or other league managers
      if (role === 'admin' || role === 'league_manager') {
        return errorResponse('Insufficient permissions to assign this role', 403)
      }
    }
    
    // Prevent demoting yourself
    if (userId === auth.user.id && targetUser.role === 'admin' && role !== 'admin') {
      return errorResponse('Cannot demote your own admin account', 400)
    }
    
    // Update role
    const { data: updatedUser, error } = await supabase
      .from('user_profiles')
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single()
    
    if (error) {
      return errorResponse('Failed to update user role', 400, error)
    }
    
    // Invalidate cache
    await cache(`user:${userId}`, async () => null, 0)
    await cache(`user_profile:${userId}`, async () => null, 0)
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        event_type: 'user_role_updated',
        event_data: {
          target_user_id: userId,
          old_role: targetUser.role,
          new_role: role,
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    // Send notification to user
    await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: 'email',
        title: 'Your role has been updated',
        content: `Your role has been changed from ${targetUser.role} to ${role}.`,
        data: {
          old_role: targetUser.role,
          new_role: role,
          updated_by: auth.user.profile.full_name,
        },
      })
    
    return successResponse(updatedUser)
  })(req)
}