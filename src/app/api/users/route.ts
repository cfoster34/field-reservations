import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  authorize,
  successResponse,
  errorResponse,
  logRequest,
  paginatedResponse
} from '@/lib/api/middleware'
import { paginationSchema } from '@/lib/api/validation'

// GET /api/users - List users (admin/league_manager only)
export async function GET(req: NextRequest) {
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
    
    const supabase = createClient()
    const searchParams = req.nextUrl.searchParams
    
    // Parse pagination params
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const sortBy = searchParams.get('sortBy') || 'created_at'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    
    // Parse filter params
    const leagueId = searchParams.get('leagueId')
    const teamId = searchParams.get('teamId')
    const role = searchParams.get('role')
    const isActive = searchParams.get('isActive')
    const isApproved = searchParams.get('isApproved')
    const search = searchParams.get('search')
    
    // Build query
    let query = supabase
      .from('user_profiles')
      .select(`
        *,
        league:leagues(id, name, slug),
        team:teams(id, name)
      `, { count: 'exact' })
    
    // Apply filters based on user role
    if (auth.user.profile.role === 'league_manager') {
      // League managers can only see users in their league
      query = query.eq('league_id', auth.user.profile.league_id)
    } else if (leagueId) {
      query = query.eq('league_id', leagueId)
    }
    
    // Apply other filters
    if (teamId) query = query.eq('team_id', teamId)
    if (role) query = query.eq('role', role)
    if (isActive !== null) query = query.eq('is_active', isActive === 'true')
    if (isApproved !== null) query = query.eq('is_approved', isApproved === 'true')
    
    // Apply search
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
    }
    
    // Apply sorting
    const ascending = sortOrder === 'asc'
    query = query.order(sortBy, { ascending })
    
    // Apply pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)
    
    // Execute query
    const { data: users, error, count } = await query
    
    if (error) {
      return errorResponse('Failed to fetch users', 400, error)
    }
    
    return paginatedResponse(
      users || [],
      count || 0,
      page,
      pageSize
    )
  })(req)
}