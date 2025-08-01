import { NextRequest, NextResponse } from 'next/server'
import { 
  authenticate, 
  authorize, 
  rateLimit,
  errorResponse,
  withErrorHandler 
} from '@/lib/api/middleware'
import { createVersionedResponse } from '@/lib/api/versioning'
import { webhookManager } from '@/lib/webhooks/webhook-manager'

interface RouteContext {
  params: { id: string; deliveryId: string }
}

// POST /api/v2/webhooks/[id]/deliveries/[deliveryId]/retry - Retry webhook delivery
export async function POST(req: NextRequest, { params }: RouteContext) {
  return withErrorHandler(async () => {
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'webhooks:retry', { max: 5, windowMs: 60000 })
    if (!rateLimitResult.success) {
      return errorResponse(rateLimitResult.error, 429, {
        retryAfter: rateLimitResult.retryAfter,
      })
    }

    // Authentication and authorization
    const auth = await authorize(['admin', 'coach'])(req)
    if (!auth.authenticated || !auth.authorized) {
      return errorResponse(auth.error || 'Insufficient permissions', auth.authenticated ? 403 : 401)
    }

    const webhookId = params.id
    const deliveryId = params.deliveryId
    const leagueId = auth.user.profile?.league_id

    if (!leagueId) {
      return errorResponse('User must belong to a league', 400)
    }

    try {
      // Check if webhook exists and belongs to the league
      const webhook = await webhookManager.getWebhookEndpoint(webhookId, leagueId)
      if (!webhook) {
        return errorResponse('Webhook not found', 404)
      }

      // Check if delivery exists
      const { deliveries } = await webhookManager.getWebhookDeliveries(webhookId, {
        limit: 1,
        offset: 0,
      })

      const delivery = deliveries.find(d => d.id === deliveryId)
      if (!delivery) {
        return errorResponse('Delivery not found', 404)
      }

      // Check if delivery can be retried
      if (delivery.status === 'delivered') {
        return errorResponse('Cannot retry a successful delivery', 400)
      }

      if (delivery.status === 'pending' || delivery.status === 'retrying') {
        return errorResponse('Delivery is already being processed', 400)
      }

      // Retry the delivery
      await webhookManager.retryWebhookDelivery(deliveryId)

      return createVersionedResponse({
        deliveryId,
        webhookId,
        status: 'queued',
        message: 'Webhook delivery has been queued for retry',
        retriedAt: new Date().toISOString(),
      }, 'v2')
    } catch (error) {
      console.error('Failed to retry webhook delivery:', error)
      return errorResponse(
        'Failed to retry webhook delivery',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  })()
}