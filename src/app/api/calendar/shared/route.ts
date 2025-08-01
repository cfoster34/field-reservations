import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateAuth,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'

// GET /api/calendar/shared - List shared calendar feeds
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth (optional for public feeds)
    const auth = await validateAuth()(req)
    const isAuthenticated = auth.valid
    
    const supabase = createClient()
    const searchParams = req.nextUrl.searchParams
    
    // Filter parameters
    const feedType = searchParams.get('type') // league, field, team, public
    const leagueId = searchParams.get('league_id')
    const fieldId = searchParams.get('field_id')
    const teamId = searchParams.get('team_id')
    const isPublic = searchParams.get('public') === 'true'
    
    let query = supabase
      .from('shared_calendar_feeds')
      .select(`
        id,
        feed_type,
        token,
        name,
        description,
        is_public,
        require_auth,
        filter_settings,
        access_count,
        last_accessed_at,
        created_at,
        league:leagues(id, name),
        field:fields(id, name),
        team:teams(id, name),
        creator:user_profiles!created_by(id, full_name)
      `)
      .eq('is_active', true)
    
    // Apply filters
    if (feedType) {
      query = query.eq('feed_type', feedType)
    }
    
    if (leagueId) {
      query = query.eq('league_id', leagueId)
    }
    
    if (fieldId) {
      query = query.eq('field_id', fieldId)
    }
    
    if (teamId) {
      query = query.eq('team_id', teamId)
    }
    
    if (isPublic) {
      query = query.eq('is_public', true)
    }
    
    // If not authenticated, only show public feeds
    if (!isAuthenticated) {
      query = query.eq('is_public', true)
    }
    
    const { data: feeds, error } = await query.order('created_at', { ascending: false })
    
    if (error) {
      return errorResponse('Failed to fetch shared feeds', 500, error)
    }
    
    // Build feed URLs
    const feedsWithUrls = feeds?.map(feed => ({
      ...feed,
      ical_url: `${getBaseUrl(req)}/api/calendar/shared/${feed.token}`,
      webcal_url: `webcal://${req.headers.get('host')}/api/calendar/shared/${feed.token}`
    })) || []
    
    return successResponse({
      feeds: feedsWithUrls,
      total: feedsWithUrls.length
    })
  })(req)
}

// POST /api/calendar/shared - Create shared calendar feed
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const body = await req.json()
    const {
      feed_type,
      league_id,
      field_id,
      team_id,
      name,
      description,
      is_public = false,
      require_auth = false,
      access_password,
      filter_settings = {
        includeStatuses: ['confirmed', 'pending'],
        includePastEvents: false,
        maxFutureMonths: 6
      }
    } = body
    
    if (!feed_type || !name) {
      return errorResponse('feed_type and name are required', 400)
    }
    
    // Validate feed scope
    if (feed_type === 'league' && !league_id) {
      return errorResponse('league_id is required for league feeds', 400)
    }
    if (feed_type === 'field' && !field_id) {
      return errorResponse('field_id is required for field feeds', 400)
    }
    if (feed_type === 'team' && !team_id) {
      return errorResponse('team_id is required for team feeds', 400)
    }
    
    const supabase = createClient()
    
    // Generate unique token
    const token = generateFeedToken()
    
    // Create shared feed
    const { data: feed, error } = await supabase
      .from('shared_calendar_feeds')
      .insert({
        feed_type,
        league_id: feed_type === 'league' ? league_id : null,
        field_id: feed_type === 'field' ? field_id : null,
        team_id: feed_type === 'team' ? team_id : null,
        token,
        name,
        description,
        is_public,
        require_auth,
        access_password: access_password ? await hashPassword(access_password) : null,
        filter_settings,
        created_by: auth.user.id
      })
      .select(`
        *,
        league:leagues(id, name),
        field:fields(id, name),
        team:teams(id, name)
      `)
      .single()
    
    if (error) {
      return errorResponse('Failed to create shared feed', 500, error)
    }
    
    const feedWithUrls = {
      ...feed,
      ical_url: `${getBaseUrl(req)}/api/calendar/shared/${feed.token}`,
      webcal_url: `webcal://${req.headers.get('host')}/api/calendar/shared/${feed.token}`
    }
    
    return successResponse({
      message: 'Shared calendar feed created',
      feed: feedWithUrls
    })
  })(req)
}

// Helper functions
function generateFeedToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

async function hashPassword(password: string): Promise<string> {
  // Simple hash for demo - use proper bcrypt in production
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function getBaseUrl(req: NextRequest): string {
  const protocol = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host')
  return `${protocol}://${host}`
}