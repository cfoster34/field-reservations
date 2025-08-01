import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { format } from 'date-fns'
import { generateICalendar } from '@/lib/calendar/ical-generator'

interface RouteParams {
  params: {
    token: string
  }
}

// GET /api/calendar/ical/[token] - Get iCal feed
export async function GET(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    const token = params.token
    const supabase = createClient()
    
    // Validate token and get export settings
    const { data: calendarExport, error } = await supabase
      .from('calendar_exports')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .single()
    
    if (error || !calendarExport) {
      return new Response('Calendar not found', { status: 404 })
    }
    
    // Update last accessed time
    await supabase
      .from('calendar_exports')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', calendarExport.id)
    
    // Get filter settings from export or query params
    const filterSettings = calendarExport.filter_settings || {}
    const statuses = filterSettings.statuses || ['pending', 'confirmed']
    const includePast = filterSettings.include_past || false
    const startDate = filterSettings.start_date
    const endDate = filterSettings.end_date
    
    // Build query for reservations
    let query = supabase
      .from('reservations')
      .select(`
        *,
        field:fields(id, name, address, type),
        user:user_profiles(id, full_name),
        team:teams(id, name)
      `)
      .eq('user_id', calendarExport.user_id)
      .in('status', statuses)
      .order('date', { ascending: true })
    
    // Apply field filters
    if (calendarExport.include_fields && calendarExport.include_fields.length > 0) {
      query = query.in('field_id', calendarExport.include_fields)
    }
    
    // Apply team filters
    if (calendarExport.include_teams && calendarExport.include_teams.length > 0) {
      query = query.in('team_id', calendarExport.include_teams)
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
    
    const { data: reservations } = await query
    
    // Get timezone from query params, filter settings, or use UTC
    const timezone = req.nextUrl.searchParams.get('timezone') || filterSettings.timezone || 'UTC'
    
    // Generate iCal content using enhanced generator
    const icalContent = generateICalendar(
      reservations || [], 
      {
        name: calendarExport.name,
        description: `Field reservations calendar export`,
        timezone,
        color: filterSettings.custom_color,
        refreshInterval: filterSettings.refresh_interval || 60
      },
      timezone
    )
    
    return new Response(icalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${calendarExport.name.replace(/[^a-zA-Z0-9]/g, '_')}.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  })(req, { params })
}

// Legacy function removed - now using enhanced ICalGenerator