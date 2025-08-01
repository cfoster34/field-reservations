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

// GET /api/calendar/google/auth - Get Google Calendar authorization URL
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    // Generate state parameter for security
    const state = `${auth.user.id}-${Date.now()}-${Math.random().toString(36).substring(2)}`
    
    // Store state in database for validation
    const supabase = createClient()
    await supabase
      .from('calendar_integrations')
      .upsert({
        user_id: auth.user.id,
        provider: 'google',
        access_token: 'pending',
        refresh_token: 'pending',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
        sync_enabled: false,
        metadata: { state, pending: true }
      }, {
        onConflict: 'user_id,provider'
      })
    
    const authUrl = googleCalendarService.getAuthUrl(state)
    
    return successResponse({
      authUrl,
      state
    })
  })(req)
}

// POST /api/calendar/google/auth - Handle OAuth callback
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    const { code, state } = await req.json()
    
    if (!code || !state) {
      return errorResponse('Missing code or state parameter', 400)
    }
    
    // Extract user ID from state
    const [userId] = state.split('-')
    
    const supabase = createClient()
    
    // Validate state parameter
    const { data: integration, error: integrationError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single()
    
    if (integrationError || !integration || integration.metadata?.state !== state) {
      return errorResponse('Invalid state parameter', 400)
    }
    
    try {
      // Exchange code for tokens
      const tokens = await googleCalendarService.exchangeCodeForTokens(code)
      
      // Update integration with tokens
      const { error: updateError } = await supabase
        .from('calendar_integrations')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at.toISOString(),
          sync_enabled: true,
          last_sync_at: new Date().toISOString(),
          metadata: { connected: true }
        })
        .eq('user_id', userId)
        .eq('provider', 'google')
      
      if (updateError) {
        return errorResponse('Failed to save integration', 500, updateError)
      }
      
      // Get user's calendars
      const calendars = await googleCalendarService.listCalendars({
        ...integration,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at.toISOString()
      })
      
      return successResponse({
        message: 'Google Calendar connected successfully',
        calendars
      })
      
    } catch (error) {
      console.error('OAuth error:', error)
      return errorResponse('Failed to connect Google Calendar', 500, error)
    }
  })(req)
}