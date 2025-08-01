import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { format } from 'date-fns'

interface RouteParams {
  params: {
    token: string
  }
}

// GET /api/calendar/embed/[token] - Get embed widget data
export async function GET(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    const token = params.token
    const supabase = createClient()
    
    // Get embed widget configuration
    const { data: embedWidget, error } = await supabase
      .from('calendar_exports')
      .select('*')
      .eq('token', token)
      .eq('is_embed', true)
      .eq('is_active', true)
      .single()
    
    if (error || !embedWidget) {
      return new Response('Embed widget not found', { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      })
    }
    
    // Check expiration
    if (embedWidget.expires_at && new Date(embedWidget.expires_at) < new Date()) {
      return new Response('Embed widget expired', { 
        status: 410,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      })
    }
    
    // Get query parameters for additional filtering
    const searchParams = req.nextUrl.searchParams
    const timezone = searchParams.get('timezone') || embedWidget.embed_config?.timezone || 'UTC'
    const includePast = searchParams.get('include_past') === 'true' || embedWidget.embed_config?.showPastEvents
    const limit = parseInt(searchParams.get('limit') || embedWidget.embed_config?.maxEvents?.toString() || '10')
    const startDate = searchParams.get('start_date') || embedWidget.embed_config?.dateRange?.start
    const endDate = searchParams.get('end_date') || embedWidget.embed_config?.dateRange?.end
    
    // Build reservations query
    let query = supabase
      .from('reservations')
      .select(`
        id,
        date,
        start_time,
        end_time,
        purpose,
        attendees,
        status,
        field:fields(id, name, address, type),
        user:user_profiles(id, full_name),
        team:teams(id, name)
      `)
      .eq('user_id', embedWidget.user_id)
      .in('status', embedWidget.embed_config?.statuses || ['confirmed', 'pending'])
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(limit)
    
    // Apply field filters
    if (embedWidget.include_fields && embedWidget.include_fields.length > 0) {
      query = query.in('field_id', embedWidget.include_fields)
    }
    
    // Apply team filters
    if (embedWidget.include_teams && embedWidget.include_teams.length > 0) {
      query = query.in('team_id', embedWidget.include_teams)
    }
    
    // Apply date range filters
    if (!includePast) {
      query = query.gte('date', format(new Date(), 'yyyy-MM-dd'))
    }
    
    if (startDate) {
      query = query.gte('date', startDate)
    }
    
    if (endDate) {
      query = query.lte('date', endDate)
    }
    
    const { data: reservations, error: reservationsError } = await query
    
    if (reservationsError) {
      return new Response('Failed to fetch reservations', { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      })
    }
    
    // Transform reservations to widget format
    const events = (reservations || []).map(reservation => ({
      id: reservation.id,
      title: `${reservation.field.name} - ${reservation.purpose}`,
      start: `${reservation.date}T${reservation.start_time}`,
      end: `${reservation.date}T${reservation.end_time}`,
      field: reservation.field.name,
      address: reservation.field.address,
      purpose: reservation.purpose,
      attendees: reservation.attendees,
      status: reservation.status,
      team: reservation.team?.name,
      user: reservation.user.full_name
    }))
    
    // Update last accessed time
    await supabase
      .from('calendar_exports')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', embedWidget.id)
    
    const response = {
      events,
      total: events.length,
      config: embedWidget.embed_config,
      timezone,
      lastUpdated: new Date().toISOString()
    }
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        'ETag': `"${embedWidget.id}-${embedWidget.updated_at}"`
      }
    })
  })(req, { params })
}

// OPTIONS for CORS preflight
export async function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  })
}