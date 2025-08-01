import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateAuth,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'

// GET /api/calendar/export - Create calendar export token
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const supabase = createClient()
    const searchParams = req.nextUrl.searchParams
    
    // Enhanced filtering options
    const includeFields = searchParams.get('fields')?.split(',') || []
    const includeTeams = searchParams.get('teams')?.split(',') || []
    const name = searchParams.get('name') || 'My Bookings'
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const statuses = searchParams.get('statuses')?.split(',') || ['confirmed', 'pending']
    const includePast = searchParams.get('include_past') === 'true'
    const timezone = searchParams.get('timezone') || 'UTC'
    const includeReminders = searchParams.get('include_reminders') !== 'false'
    const customColor = searchParams.get('color')
    const refreshInterval = parseInt(searchParams.get('refresh_interval') || '60')
    
    // Create or update calendar export
    const token = generateCalendarToken()
    
    const { data: calendarExport, error } = await supabase
      .from('calendar_exports')
      .upsert({
        user_id: auth.user.id,
        token,
        name,
        include_fields: includeFields,
        include_teams: includeTeams,
        filter_settings: {
          start_date: startDate,
          end_date: endDate,
          statuses,
          include_past: includePast,
          timezone,
          include_reminders: includeReminders,
          custom_color: customColor,
          refresh_interval: refreshInterval
        },
        is_active: true,
        last_accessed_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single()
    
    if (error) {
      return errorResponse('Failed to create calendar export', 500, error)
    }
    
    const calendarUrl = `${getBaseUrl(req)}/api/calendar/ical/${token}`
    
    return successResponse({
      token,
      url: calendarUrl,
      webcal_url: calendarUrl.replace('https://', 'webcal://').replace('http://', 'webcal://'),
      name,
      includeFields,
      includeTeams,
      filterSettings: {
        start_date: startDate,
        end_date: endDate,
        statuses,
        include_past: includePast,
        timezone,
        include_reminders: includeReminders,
        custom_color: customColor,
        refresh_interval: refreshInterval
      }
    })
  })(req)
}

// Helper functions
function generateCalendarToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

function getBaseUrl(req: NextRequest): string {
  const protocol = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host')
  return `${protocol}://${host}`
}