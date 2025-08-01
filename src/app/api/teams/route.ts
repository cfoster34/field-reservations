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
import { createTeamSchema, paginationSchema } from '@/lib/api/validation'

// GET /api/teams - List teams
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
    sortBy: searchParams.get('sortBy') || 'name',
    sortOrder: searchParams.get('sortOrder'),
  })

  // Get filters
  const leagueId = searchParams.get('leagueId') || auth.user.profile?.league_id
  const ageGroup = searchParams.get('ageGroup')
  const division = searchParams.get('division')
  const search = searchParams.get('search')

  // Build query
  let query = supabase
    .from('teams')
    .select(`
      *,
      coach:user_profiles!coach_id (
        id,
        full_name,
        email,
        avatar_url
      ),
      _count:user_profiles(count)
    `, { count: 'exact' })

  // Apply filters
  if (leagueId) {
    query = query.eq('league_id', leagueId)
  }
  
  if (ageGroup) {
    query = query.eq('age_group', ageGroup)
  }
  
  if (division) {
    query = query.eq('division', division)
  }
  
  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  // Apply sorting
  query = query.order(pagination.sortBy, { ascending: pagination.sortOrder === 'asc' })

  // Apply pagination
  const { data: teams, count, error } = await query
    .range(
      (pagination.page - 1) * pagination.pageSize,
      pagination.page * pagination.pageSize - 1
    )

  if (error) {
    return errorResponse('Failed to fetch teams', 500, error)
  }

  // Get member counts for each team
  const teamsWithCounts = await Promise.all(
    (teams || []).map(async (team) => {
      const { count: memberCount } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', team.id)

      return {
        ...team,
        memberCount: memberCount || 0,
      }
    })
  )

  return paginatedResponse(
    teamsWithCounts,
    count || 0,
    pagination.page,
    pagination.pageSize
  )
})

// POST /api/teams - Create a new team
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin', 'coach'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await validateBody(createTeamSchema)(req)
  if (!validation.valid) {
    return errorResponse('Invalid request data', 400, validation.errors)
  }

  const supabase = createClient()
  const { name, coachId, assistantCoachIds, logoUrl, primaryColor, ageGroup, division } = validation.data

  // Use the user's league if not admin
  const leagueId = auth.user.profile?.league_id
  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  // Check if team name already exists in the league
  const { data: existingTeam } = await supabase
    .from('teams')
    .select('id')
    .eq('league_id', leagueId)
    .eq('name', name)
    .single()

  if (existingTeam) {
    return errorResponse('A team with this name already exists', 400)
  }

  // Create the team
  const { data: team, error } = await supabase
    .from('teams')
    .insert({
      league_id: leagueId,
      name,
      coach_id: coachId || auth.user.id,
      assistant_coach_ids: assistantCoachIds || [],
      logo_url: logoUrl,
      primary_color: primaryColor,
      age_group: ageGroup,
      division: division,
    })
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
    return errorResponse('Failed to create team', 500, error)
  }

  // If user is creating a team as coach, update their role
  if (auth.user.profile?.role === 'member' && (!coachId || coachId === auth.user.id)) {
    await supabase
      .from('user_profiles')
      .update({ role: 'coach' })
      .eq('id', auth.user.id)
  }

  // Add coach to the team if not already assigned
  if (coachId && coachId !== auth.user.id) {
    await supabase
      .from('user_profiles')
      .update({ team_id: team.id })
      .eq('id', coachId)
  }

  return successResponse(team, 201)
})