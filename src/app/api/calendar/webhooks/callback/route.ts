import { NextRequest } from 'next/server'
import { 
  withErrorHandler, 
  logRequest
} from '@/lib/api/middleware'
import { webhookManager } from '@/lib/calendar/webhook-manager'

// POST /api/calendar/webhooks/callback - Handle webhook notifications
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    const contentType = req.headers.get('content-type') || ''
    
    // Handle different webhook formats
    if (contentType.includes('application/json')) {
      return handleJsonWebhook(req)
    } else if (contentType.includes('text/plain')) {
      return handleGoogleWebhook(req)
    } else {
      return new Response('Unsupported content type', { status: 400 })
    }
  })(req)
}

// GET /api/calendar/webhooks/callback - Handle webhook verification
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    const searchParams = req.nextUrl.searchParams
    
    // Microsoft Graph webhook validation
    const validationToken = searchParams.get('validationToken')
    if (validationToken) {
      return new Response(validationToken, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    }
    
    // Google Calendar webhook verification
    const challenge = searchParams.get('hub.challenge')
    if (challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    }
    
    return new Response('OK', { status: 200 })
  })(req)
}

/**
 * Handle JSON webhook notifications (Microsoft Graph)
 */
async function handleJsonWebhook(req: NextRequest) {
  try {
    const body = await req.json()
    
    // Microsoft Graph sends an array of notifications
    if (Array.isArray(body.value)) {
      for (const notification of body.value) {
        await processOutlookNotification(notification)
      }
    } else {
      // Single notification
      await processOutlookNotification(body)
    }
    
    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Failed to process JSON webhook:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

/**
 * Handle Google Calendar webhook notifications
 */
async function handleGoogleWebhook(req: NextRequest) {
  try {
    const body = await req.text()
    
    // Extract webhook headers
    const channelId = req.headers.get('x-goog-channel-id')
    const resourceId = req.headers.get('x-goog-resource-id')
    const resourceUri = req.headers.get('x-goog-resource-uri')
    const eventType = req.headers.get('x-goog-resource-state') // 'sync', 'exists', 'not_exists'
    const eventTime = req.headers.get('x-goog-message-number')
    
    if (!channelId || !resourceUri) {
      return new Response('Missing required headers', { status: 400 })
    }
    
    await processGoogleNotification({
      subscriptionId: channelId,
      resourceUri: resourceUri,
      changeType: mapGoogleEventType(eventType || 'exists'),
      eventTime: new Date().toISOString(),
      data: {
        resourceId,
        eventType,
        messageNumber: eventTime,
        body
      }
    })
    
    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Failed to process Google webhook:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

/**
 * Process Outlook/Microsoft Graph notification
 */
async function processOutlookNotification(notification: any) {
  try {
    const webhookEvent = {
      subscriptionId: notification.subscriptionId,
      resourceUri: notification.resource,
      changeType: notification.changeType,
      eventTime: notification.eventTime || new Date().toISOString(),
      data: {
        resourceData: notification.resourceData,
        subscriptionExpirationDateTime: notification.subscriptionExpirationDateTime,
        clientState: notification.clientState
      }
    }
    
    await webhookManager.processWebhookEvent(webhookEvent)
  } catch (error) {
    console.error('Failed to process Outlook notification:', error)
    throw error
  }
}

/**
 * Process Google Calendar notification
 */
async function processGoogleNotification(event: any) {
  try {
    await webhookManager.processWebhookEvent(event)
  } catch (error) {
    console.error('Failed to process Google notification:', error)
    throw error
  }
}

/**
 * Map Google event type to standard change type
 */
function mapGoogleEventType(eventType: string): 'created' | 'updated' | 'deleted' {
  switch (eventType) {
    case 'sync':
      return 'created' // Initial sync
    case 'exists':
      return 'updated' // Event exists/changed
    case 'not_exists':
      return 'deleted' // Event removed
    default:
      return 'updated'
  }
}