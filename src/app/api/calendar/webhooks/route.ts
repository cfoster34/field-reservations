import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateAuth,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { webhookManager } from '@/lib/calendar/webhook-manager'

// GET /api/calendar/webhooks - List webhook subscriptions
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const supabase = createClient()
    
    // Get user's webhook subscriptions
    const { data: webhooks, error } = await supabase
      .from('calendar_webhooks')
      .select(`
        *,
        integration:calendar_integrations!inner(
          id,
          provider,
          calendar_id,
          sync_enabled
        )
      `)
      .eq('integration.user_id', auth.user.id)
      .order('created_at', { ascending: false })
    
    if (error) {
      return errorResponse('Failed to fetch webhooks', 500, error)
    }
    
    return successResponse({
      webhooks: webhooks || [],
      stats: await webhookManager.getWebhookStats()
    })
  })(req)
}

// POST /api/calendar/webhooks - Register new webhook subscription
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const { provider, calendarId } = await req.json()
    
    if (!provider || !['google', 'outlook'].includes(provider)) {
      return errorResponse('Valid provider (google/outlook) is required', 400)
    }
    
    const supabase = createClient()
    
    // Get user's calendar integration
    const { data: integration, error: integrationError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('provider', provider)
      .eq('sync_enabled', true)
      .single()
    
    if (integrationError || !integration) {
      return errorResponse(`${provider} Calendar not connected`, 404)
    }
    
    try {
      // Build resource URI based on provider
      const resourceUri = buildResourceUri(provider, calendarId || integration.calendar_id)
      
      // Build callback URL
      const callbackUrl = `${getBaseUrl(req)}/api/calendar/webhooks/callback`
      
      // Register webhook
      const webhook = await webhookManager.registerWebhook(
        integration.id,
        provider,
        resourceUri,
        callbackUrl
      )
      
      return successResponse({
        message: 'Webhook registered successfully',
        webhook
      })
      
    } catch (error) {
      console.error('Failed to register webhook:', error)
      return errorResponse('Failed to register webhook', 500, error)
    }
  })(req)
}

// DELETE /api/calendar/webhooks - Unregister webhook subscription
export async function DELETE(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const { webhookId } = await req.json()
    
    if (!webhookId) {
      return errorResponse('Webhook ID is required', 400)
    }
    
    const supabase = createClient()
    
    // Verify user owns this webhook
    const { data: webhook, error } = await supabase
      .from('calendar_webhooks')
      .select(`
        *,
        integration:calendar_integrations!inner(user_id)
      `)
      .eq('webhook_id', webhookId)
      .eq('integration.user_id', auth.user.id)
      .single()
    
    if (error || !webhook) {
      return errorResponse('Webhook not found', 404)
    }
    
    try {
      await webhookManager.unregisterWebhook(webhookId)
      
      return successResponse({
        message: 'Webhook unregistered successfully'
      })
      
    } catch (error) {
      console.error('Failed to unregister webhook:', error)
      return errorResponse('Failed to unregister webhook', 500, error)
    }
  })(req)
}

// Helper functions
function buildResourceUri(provider: string, calendarId: string): string {
  switch (provider) {
    case 'google':
      return `/calendars/${calendarId || 'primary'}/events`
    case 'outlook':
      return `/me/calendars/${calendarId || 'calendar'}/events`
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

function getBaseUrl(req: NextRequest): string {
  const protocol = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host')
  return `${protocol}://${host}`
}