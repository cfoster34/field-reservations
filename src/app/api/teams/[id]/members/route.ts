import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  errorResponse,
  successResponse,
  validateBody,
  withErrorHandler,
  paginatedResponse,
} from '@/lib/api/middleware'
import { addTeamMemberSchema, paginationSchema } from '@/lib/api/validation'

// GET /api/teams/[id]/members - Get team members
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
  const { searchParams } = new URL(req.url)
  
  // Parse pagination params
  const pagination = paginationSchema.parse({
    page: searchParams.get('page'),
    pageSize: searchParams.get('pageSize'),
  })

  // Check if team exists
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, league_id')
    .eq('id', teamId)
    .single()

  if (!team) {
    return errorResponse('Team not found', 404)
  }

  // Get team members with pagination
  const { data: members, count, error } = await supabase
    .from('user_profiles')
    .select(`
      id,
      full_name,
      email,
      avatar_url,
      phone,
      role,
      created_at
    `, { count: 'exact' })
    .eq('team_id', teamId)
    .order('full_name', { ascending: true })
    .range(
      (pagination.page - 1) * pagination.pageSize,
      pagination.page * pagination.pageSize - 1
    )

  if (error) {
    return errorResponse('Failed to fetch team members', 500, error)
  }

  return paginatedResponse(
    members || [],
    count || 0,
    pagination.page,
    pagination.pageSize
  )
})

// POST /api/teams/[id]/members - Add member to team
export const POST = withErrorHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } }
) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await validateBody(addTeamMemberSchema)(req)
  if (!validation.valid) {
    return errorResponse('Invalid request data', 400, validation.errors)
  }

  const supabase = createClient()
  const teamId = params.id
  const { userId } = validation.data

  // Check if team exists
  const { data: team } = await supabase
    .from('teams')
    .select('id, coach_id, assistant_coach_ids, league_id')
    .eq('id', teamId)
    .single()

  if (!team) {
    return errorResponse('Team not found', 404)
  }

  // Check if user has permission (coach, assistant coach, or admin)
  const isCoach = team.coach_id === auth.user.id
  const isAssistantCoach = team.assistant_coach_ids?.includes(auth.user.id)
  const isAdmin = auth.user.profile?.role === 'admin' && auth.user.profile?.league_id === team.league_id

  if (!isCoach && !isAssistantCoach && !isAdmin) {
    return errorResponse('You do not have permission to add members to this team', 403)
  }

  // Check if user exists and is in the same league
  const { data: userToAdd } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, league_id, team_id')
    .eq('id', userId)
    .single()

  if (!userToAdd) {
    return errorResponse('User not found', 404)
  }

  if (userToAdd.league_id !== team.league_id) {
    return errorResponse('User must be in the same league', 400)
  }

  if (userToAdd.team_id) {
    return errorResponse('User is already assigned to a team', 400)
  }

  // Add user to team
  const { error } = await supabase
    .from('user_profiles')
    .update({ 
      team_id: teamId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    return errorResponse('Failed to add member to team', 500, error)
  }

  // Create notification for the added user
  await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'email',
      title: 'Added to Team',
      content: `You have been added to the team "${team.id}"`,
      data: {
        teamId,
        addedBy: auth.user.profile?.full_name,
      },
    })

  return successResponse({
    message: 'Member added successfully',
    member: userToAdd,
  }, 201)
})

// DELETE /api/teams/[id]/members - Remove member from team
export const DELETE = withErrorHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } }
) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return errorResponse('User ID is required', 400)
  }

  const supabase = createClient()
  const teamId = params.id

  // Check if team exists
  const { data: team } = await supabase
    .from('teams')
    .select('id, coach_id, assistant_coach_ids, league_id')
    .eq('id', teamId)
    .single()

  if (!team) {
    return errorResponse('Team not found', 404)
  }

  // Check if user has permission
  const isCoach = team.coach_id === auth.user.id
  const isAssistantCoach = team.assistant_coach_ids?.includes(auth.user.id)
  const isAdmin = auth.user.profile?.role === 'admin' && auth.user.profile?.league_id === team.league_id
  const isSelf = userId === auth.user.id

  if (!isCoach && !isAssistantCoach && !isAdmin && !isSelf) {
    return errorResponse('You do not have permission to remove members from this team', 403)
  }

  // Check if user is actually in the team
  const { data: member } = await supabase
    .from('user_profiles')
    .select('id, team_id')
    .eq('id', userId)
    .eq('team_id', teamId)
    .single()

  if (!member) {
    return errorResponse('User is not a member of this team', 400)
  }

  // Cannot remove the coach
  if (userId === team.coach_id) {
    return errorResponse('Cannot remove the team coach', 400)
  }

  // Remove user from team
  const { error } = await supabase
    .from('user_profiles')
    .update({ 
      team_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    return errorResponse('Failed to remove member from team', 500, error)
  }

  // Create notification for the removed user
  if (!isSelf) {
    await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: 'email',
        title: 'Removed from Team',
        content: `You have been removed from the team`,
        data: {
          teamId,
          removedBy: auth.user.profile?.full_name,
        },
      })
  }

  return successResponse({ message: 'Member removed successfully' })
})