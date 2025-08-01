import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  authorize,
  errorResponse,
  successResponse,
  validateBody,
  withErrorHandler,
} from '@/lib/api/middleware'
import { updateTeamSchema } from '@/lib/api/validation'

// GET /api/teams/[id] - Get team details
export const GET = withErrorHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } }
) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const supabase = createClient()
  const teamId = params.id

  // Get team details with members
  const { data: team, error } = await supabase
    .from('teams')
    .select(`
      *,
      coach:user_profiles!coach_id (
        id,
        full_name,
        email,
        avatar_url,
        phone
      ),
      members:user_profiles!team_id (
        id,
        full_name,
        email,
        avatar_url,
        role,
        created_at
      ),
      league:leagues (
        id,
        name,
        primary_color
      )
    `)
    .eq('id', teamId)
    .single()

  if (error || !team) {
    return errorResponse('Team not found', 404)
  }

  // Get assistant coaches details
  let assistantCoaches = []
  if (team.assistant_coach_ids?.length > 0) {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', team.assistant_coach_ids)
    
    assistantCoaches = data || []
  }

  // Get recent reservations
  const { data: recentReservations } = await supabase
    .from('reservations')
    .select(`
      id,
      date,
      start_time,
      end_time,
      status,
      field:fields (
        id,
        name,
        type
      )
    `)
    .eq('team_id', teamId)
    .gte('date', new Date().toISOString().split('T')[0])
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(5)

  return successResponse({
    ...team,
    assistantCoaches,
    memberCount: team.members?.length || 0,
    upcomingReservations: recentReservations || [],
  })
})

// PUT /api/teams/[id] - Update team
export const PUT = withErrorHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } }
) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await validateBody(updateTeamSchema)(req)
  if (!validation.valid) {
    return errorResponse('Invalid request data', 400, validation.errors)
  }

  const supabase = createClient()
  const teamId = params.id

  // Check if user has permission to update the team
  const { data: team } = await supabase
    .from('teams')
    .select('coach_id, assistant_coach_ids, league_id')
    .eq('id', teamId)
    .single()

  if (!team) {
    return errorResponse('Team not found', 404)
  }

  const isCoach = team.coach_id === auth.user.id
  const isAssistantCoach = team.assistant_coach_ids?.includes(auth.user.id)
  const isAdmin = auth.user.profile?.role === 'admin' && auth.user.profile?.league_id === team.league_id

  if (!isCoach && !isAssistantCoach && !isAdmin) {
    return errorResponse('You do not have permission to update this team', 403)
  }

  // Update the team
  const { data: updatedTeam, error } = await supabase
    .from('teams')
    .update({
      ...validation.data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', teamId)
    .select(`
      *,
      coach:user_profiles!coach_id (
        id,
        full_name,
        email
      )
    `)
    .single()

  if (error) {
    return errorResponse('Failed to update team', 500, error)
  }

  return successResponse(updatedTeam)
})

// DELETE /api/teams/[id] - Delete team
export const DELETE = withErrorHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } }
) => {
  const auth = await authorize(['admin'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const supabase = createClient()
  const teamId = params.id

  // Check if team exists and belongs to user's league
  const { data: team } = await supabase
    .from('teams')
    .select('league_id')
    .eq('id', teamId)
    .single()

  if (!team) {
    return errorResponse('Team not found', 404)
  }

  if (team.league_id !== auth.user.profile?.league_id) {
    return errorResponse('You can only delete teams in your league', 403)
  }

  // Remove team assignment from all members
  await supabase
    .from('user_profiles')
    .update({ team_id: null })
    .eq('team_id', teamId)

  // Delete the team
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId)

  if (error) {
    return errorResponse('Failed to delete team', 500, error)
  }

  return successResponse({ message: 'Team deleted successfully' })
})