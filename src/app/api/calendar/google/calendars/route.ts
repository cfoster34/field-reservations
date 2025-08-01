import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateAuth,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { googleCalendarService } from '@/lib/calendar/google-calendar'

// GET /api/calendar/google/calendars - List user's Google calendars
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const supabase = createClient()
    
    // Get user's Google Calendar integration
    const { data: integration, error } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('provider', 'google')
      .eq('sync_enabled', true)
      .single()
    
    if (error || !integration) {
      return errorResponse('Google Calendar not connected', 404)
    }
    
    try {
      const calendars = await googleCalendarService.listCalendars(integration)
      
      return successResponse({
        calendars,
        currentCalendarId: integration.calendar_id
      })
      
    } catch (error) {
      console.error('Failed to list calendars:', error)
      return errorResponse('Failed to fetch calendars', 500, error)
    }
  })(req)
}

// POST /api/calendar/google/calendars - Set target calendar for sync
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const { calendarId } = await req.json()
    
    if (!calendarId) {
      return errorResponse('Calendar ID is required', 400)
    }
    
    const supabase = createClient()
    
    // Update integration with selected calendar
    const { error } = await supabase
      .from('calendar_integrations')
      .update({ calendar_id: calendarId })
      .eq('user_id', auth.user.id)
      .eq('provider', 'google')
    
    if (error) {
      return errorResponse('Failed to update calendar selection', 500, error)
    }
    
    return successResponse({
      message: 'Calendar selection updated',
      calendarId
    })
  })(req)
}