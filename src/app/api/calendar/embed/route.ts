import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateAuth,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { embedService } from '@/lib/calendar/embed-widget'

// GET /api/calendar/embed - List user's embed widgets
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const supabase = createClient()
    
    // Get user's embed tokens (stored in calendar_exports table with embed flag)
    const { data: embedWidgets, error } = await supabase
      .from('calendar_exports')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('is_embed', true)
      .order('created_at', { ascending: false })
    
    if (error) {
      return errorResponse('Failed to fetch embed widgets', 500, error)
    }
    
    return successResponse({
      widgets: embedWidgets || [],
      total: embedWidgets?.length || 0
    })
  })(req)
}

// POST /api/calendar/embed - Create embed widget
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
      name,
      type = 'list',
      theme = 'light',
      width,
      height,
      showPastEvents = false,
      maxEvents = 10,
      dateRange,
      fields = [],
      teams = [],
      statuses = ['confirmed', 'pending'],
      timezone = 'UTC',
      colors,
      showHeaders = true,
      showFilters = false,
      clickAction = 'details',
      redirectUrl,
      customCSS,
      expiresIn
    } = body
    
    if (!name) {
      return errorResponse('Widget name is required', 400)
    }
    
    const supabase = createClient()
    
    // Generate embed token
    const embedToken = await embedService.generateEmbedToken(
      'user',
      auth.user.id,
      expiresIn
    )
    
    // Store embed widget configuration
    const { data: widget, error } = await supabase
      .from('calendar_exports')
      .insert({
        user_id: auth.user.id,
        token: embedToken.token,
        name,
        include_fields: fields,
        include_teams: teams,
        is_embed: true,
        embed_config: {
          type,
          theme,
          width,
          height,
          showPastEvents,
          maxEvents,
          dateRange,
          statuses,
          timezone,
          colors,
          showHeaders,
          showFilters,
          clickAction,
          redirectUrl,
          customCSS
        },
        expires_at: embedToken.expiresAt,
        is_active: true
      })
      .select()
      .single()
    
    if (error) {
      return errorResponse('Failed to create embed widget', 500, error)
    }
    
    // Generate embed HTML
    const embedHTML = embedService.generateEmbedHTML(embedToken.token, {
      type,
      theme,
      width,
      height,
      showPastEvents,
      maxEvents,
      dateRange,
      fields,
      teams,
      statuses,
      timezone,
      colors,
      showHeaders,
      showFilters,
      clickAction,
      redirectUrl,
      customCSS
    })
    
    return successResponse({
      widget,
      embedHTML,
      embedToken: embedToken.token,
      previewUrl: `${getBaseUrl(req)}/widgets/preview/${embedToken.token}`
    })
  })(req)
}

// DELETE /api/calendar/embed - Delete embed widget
export async function DELETE(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const { widgetId } = await req.json()
    
    if (!widgetId) {
      return errorResponse('Widget ID is required', 400)
    }
    
    const supabase = createClient()
    
    // Delete widget (verify ownership)
    const { error } = await supabase
      .from('calendar_exports')
      .delete()
      .eq('id', widgetId)
      .eq('user_id', auth.user.id)
      .eq('is_embed', true)
    
    if (error) {
      return errorResponse('Failed to delete widget', 500, error)
    }
    
    return successResponse({
      message: 'Embed widget deleted successfully'
    })
  })(req)
}

function getBaseUrl(req: NextRequest): string {
  const protocol = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host')
  return `${protocol}://${host}`
}