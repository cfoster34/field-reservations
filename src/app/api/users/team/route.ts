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
import { assignTeamSchema } from '@/lib/api/validation'

// PUT /api/users/team - Assign user to team (admin/league_manager/coach only)
export async function PUT(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authorize admin, league manager, or coach
    const auth = await authorize(['admin', 'league_manager', 'coach'])(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    if (!auth.authorized) {
      return errorResponse('Insufficient permissions', 403)
    }
    
    // Validate request body
    const validation = await validateBody(assignTeamSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const { userId, teamId } = validation.data
    const supabase = createClient()
    
    // Get team details
    const { data: team } = await supabase
      .from('teams')
      .select('id, name, league_id, coach_id')
      .eq('id', teamId)
      .single()
    
    if (!team) {
      return errorResponse('Team not found', 404)
    }
    
    // Check permissions
    if (auth.user.profile.role === 'coach') {
      // Coaches can only manage their own team
      if (team.coach_id !== auth.user.id) {
        return errorResponse('You can only manage your own team', 403)
      }
    } else if (auth.user.profile.role === 'league_manager') {
      // League managers can only manage teams in their league
      if (team.league_id !== auth.user.profile.league_id) {
        return errorResponse('Cannot manage teams from different league', 403)
      }
    }
    
    // Get target user
    const { data: targetUser } = await supabase
      .from('user_profiles')
      .select('id, league_id, team_id')
      .eq('id', userId)
      .single()
    
    if (!targetUser) {
      return errorResponse('User not found', 404)
    }
    
    // Check if user is in the same league
    if (targetUser.league_id !== team.league_id) {
      return errorResponse('User must be in the same league as the team', 400)
    }
    
    // Update user's team
    const { data: updatedUser, error } = await supabase
      .from('user_profiles')
      .update({
        team_id: teamId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select(`
        *,
        team:teams(id, name)
      `)
      .single()
    
    if (error) {
      return errorResponse('Failed to assign team', 400, error)
    }
    
    // Invalidate cache
    await cache(`user:${userId}`, async () => null, 0)
    await cache(`user_profile:${userId}`, async () => null, 0)
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        event_type: 'user_team_assigned',
        event_data: {
          target_user_id: userId,
          old_team_id: targetUser.team_id,
          new_team_id: teamId,
          team_name: team.name,
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
        title: 'You have been assigned to a team',
        content: `You have been assigned to team "${team.name}".`,
        data: {
          team_id: teamId,
          team_name: team.name,
          assigned_by: auth.user.profile.full_name,
        },
      })
    
    return successResponse(updatedUser)
  })(req)
}

// DELETE /api/users/team - Remove user from team
export async function DELETE(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Validate request body
    const body = await req.json()
    const userId = body.userId
    
    if (!userId) {
      return errorResponse('User ID is required', 400)
    }
    
    // Authorize admin, league manager, or coach
    const auth = await authorize(['admin', 'league_manager', 'coach'])(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    if (!auth.authorized) {
      return errorResponse('Insufficient permissions', 403)
    }
    
    const supabase = createClient()
    
    // Get target user with team
    const { data: targetUser } = await supabase
      .from('user_profiles')
      .select(`
        id, 
        league_id, 
        team_id,
        team:teams(id, name, league_id, coach_id)
      `)
      .eq('id', userId)
      .single()
    
    if (!targetUser) {
      return errorResponse('User not found', 404)
    }
    
    if (!targetUser.team_id) {
      return errorResponse('User is not assigned to any team', 400)
    }
    
    // Check permissions
    if (auth.user.profile.role === 'coach') {
      // Coaches can only manage their own team
      if (targetUser.team?.coach_id !== auth.user.id) {
        return errorResponse('You can only manage your own team', 403)
      }
    } else if (auth.user.profile.role === 'league_manager') {
      // League managers can only manage teams in their league
      if (targetUser.league_id !== auth.user.profile.league_id) {
        return errorResponse('Cannot manage users from different league', 403)
      }
    }
    
    // Remove user from team
    const { data: updatedUser, error } = await supabase
      .from('user_profiles')
      .update({
        team_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single()
    
    if (error) {
      return errorResponse('Failed to remove from team', 400, error)
    }
    
    // Invalidate cache
    await cache(`user:${userId}`, async () => null, 0)
    await cache(`user_profile:${userId}`, async () => null, 0)
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        event_type: 'user_team_removed',
        event_data: {
          target_user_id: userId,
          team_id: targetUser.team_id,
          team_name: targetUser.team?.name,
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
        title: 'You have been removed from a team',
        content: `You have been removed from team "${targetUser.team?.name}".`,
        data: {
          team_id: targetUser.team_id,
          team_name: targetUser.team?.name,
          removed_by: auth.user.profile.full_name,
        },
      })
    
    return successResponse(updatedUser)
  })(req)
}