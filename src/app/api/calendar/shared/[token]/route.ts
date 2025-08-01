import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { generateICalendar } from '@/lib/calendar/ical-generator'
import { format } from 'date-fns'

interface RouteParams {
  params: {
    token: string
  }
}

// GET /api/calendar/shared/[token] - Get shared calendar feed
export async function GET(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    const token = params.token
    const supabase = createClient()
    
    // Get shared feed settings
    const { data: sharedFeed, error } = await supabase
      .from('shared_calendar_feeds')
      .select(`
        *,
        league:leagues(id, name),
        field:fields(id, name),
        team:teams(id, name)
      `)
      .eq('token', token)
      .eq('is_active', true)
      .single()
    
    if (error || !sharedFeed) {
      return new Response('Calendar feed not found', { status: 404 })
    }
    
    // Check authentication requirements
    if (sharedFeed.require_auth && !sharedFeed.is_public) {
      const authHeader = req.headers.get('authorization')
      if (!authHeader) {
        return new Response('Authentication required', { 
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="Calendar Feed"' }
        })
      }
    }
    
    // Check password protection
    const password = req.nextUrl.searchParams.get('password')
    if (sharedFeed.access_password && password) {
      const hashedPassword = await hashPassword(password)
      if (hashedPassword !== sharedFeed.access_password) {
        return new Response('Invalid password', { status: 403 })
      }
    } else if (sharedFeed.access_password && !password) {
      return new Response('Password required', { status: 403 })
    }
    
    // Get timezone from query params
    const timezone = req.nextUrl.searchParams.get('timezone') || 'UTC'
    
    // Build reservations query based on feed type
    let reservationsQuery = supabase
      .from('reservations')
      .select(`
        *,
        field:fields(id, name, address, type),
        user:user_profiles(id, full_name),
        team:teams(id, name)
      `)
    
    // Apply feed scope filters
    switch (sharedFeed.feed_type) {
      case 'league':
        reservationsQuery = reservationsQuery
          .eq('field.league_id', sharedFeed.league_id)
        break
      case 'field':
        reservationsQuery = reservationsQuery
          .eq('field_id', sharedFeed.field_id)
        break
      case 'team':
        reservationsQuery = reservationsQuery
          .eq('team_id', sharedFeed.team_id)
        break
      case 'public':
        // Public feeds show all confirmed reservations
        break
    }
    
    // Apply filter settings
    const filterSettings = sharedFeed.filter_settings || {}
    const includeStatuses = filterSettings.includeStatuses || ['confirmed', 'pending']
    const includePastEvents = filterSettings.includePastEvents || false
    const maxFutureMonths = filterSettings.maxFutureMonths || 6
    
    // Status filter
    reservationsQuery = reservationsQuery.in('status', includeStatuses)
    
    // Date range filter
    const today = new Date()
    if (!includePastEvents) {
      reservationsQuery = reservationsQuery.gte('date', format(today, 'yyyy-MM-dd'))
    }
    
    // Future limit
    const futureLimit = new Date()
    futureLimit.setMonth(futureLimit.getMonth() + maxFutureMonths)
    reservationsQuery = reservationsQuery.lte('date', format(futureLimit, 'yyyy-MM-dd'))
    
    // Execute query
    const { data: reservations } = await reservationsQuery.order('date', { ascending: true })
    
    // Update access statistics
    await supabase
      .from('shared_calendar_feeds')
      .update({ 
        access_count: (sharedFeed.access_count || 0) + 1,
        last_accessed_at: new Date().toISOString()
      })
      .eq('id', sharedFeed.id)
    
    // Generate feed name and description
    const feedName = buildFeedName(sharedFeed)
    const feedDescription = buildFeedDescription(sharedFeed)
    
    // Generate iCal content
    const icalContent = generateICalendar(
      reservations || [], 
      {
        name: feedName,
        description: feedDescription,
        timezone,
        refreshInterval: 60 // 1 hour refresh
      },
      timezone
    )
    
    return new Response(icalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${feedName.replace(/[^a-zA-Z0-9]/g, '_')}.ics"`,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'ETag': `"${generateETag(sharedFeed, reservations?.length || 0)}"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  })(req, { params })
}

// Helper functions
function buildFeedName(sharedFeed: any): string {
  switch (sharedFeed.feed_type) {
    case 'league':
      return `${sharedFeed.league?.name || 'League'} Schedule`
    case 'field':
      return `${sharedFeed.field?.name || 'Field'} Reservations`
    case 'team':
      return `${sharedFeed.team?.name || 'Team'} Schedule`
    case 'public':
      return 'Public Field Reservations'
    default:
      return sharedFeed.name || 'Field Reservations'
  }
}

function buildFeedDescription(sharedFeed: any): string {
  const parts = ['Field reservations calendar feed']
  
  switch (sharedFeed.feed_type) {
    case 'league':
      parts.push(`for ${sharedFeed.league?.name || 'league'}`)
      break
    case 'field':
      parts.push(`for ${sharedFeed.field?.name || 'field'}`)
      break
    case 'team':
      parts.push(`for ${sharedFeed.team?.name || 'team'}`)
      break
    case 'public':
      parts.push('- public access')
      break
  }
  
  if (sharedFeed.description) {
    parts.push(`- ${sharedFeed.description}`)
  }
  
  return parts.join(' ')
}

function generateETag(sharedFeed: any, reservationCount: number): string {
  const lastModified = sharedFeed.updated_at || sharedFeed.created_at
  return `${sharedFeed.id}-${lastModified}-${reservationCount}`
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}