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
import { z } from 'zod'

const deliveryQuerySchema = z.object({
  status: z.enum(['pending', 'delivered', 'failed', 'retrying']).optional(),
  event: z.enum([
    'user.created', 'user.updated', 'user.deleted',
    'team.created', 'team.updated', 'team.deleted',
    'field.created', 'field.updated', 'field.deleted',
    'reservation.created', 'reservation.updated', 'reservation.cancelled', 'reservation.confirmed',
    'payment.processed', 'payment.failed',
    'sync.completed', 'sync.failed'
  ]).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
})

interface RouteContext {
  params: { id: string }
}

// GET /api/v2/webhooks/[id]/deliveries - Get webhook delivery history
export async function GET(req: NextRequest, { params }: RouteContext) {
  return withErrorHandler(async () => {
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'webhooks:deliveries')
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
    const leagueId = auth.user.profile?.league_id

    if (!leagueId) {
      return errorResponse('User must belong to a league', 400)
    }

    // Parse and validate query parameters
    const url = new URL(req.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const query = deliveryQuerySchema.parse(queryParams)

    try {
      // Check if webhook exists and belongs to the league
      const webhook = await webhookManager.getWebhookEndpoint(webhookId, leagueId)
      if (!webhook) {
        return errorResponse('Webhook not found', 404)
      }

      // Get deliveries
      const { deliveries, total } = await webhookManager.getWebhookDeliveries(webhookId, {
        status: query.status,
        event: query.event,
        limit: query.limit,
        offset: query.offset,
      })

      // Transform deliveries for response
      const transformedDeliveries = deliveries.map(delivery => ({
        id: delivery.id,
        event: delivery.event,
        payload: delivery.payload,
        response: delivery.response ? {
          status: delivery.response.status,
          headers: delivery.response.headers,
          body: delivery.response.body.length > 1000 
            ? delivery.response.body.substring(0, 1000) + '... (truncated)'
            : delivery.response.body,
        } : null,
        status: delivery.status,
        attempts: delivery.attempts,
        nextRetryAt: delivery.nextRetryAt,
        deliveredAt: delivery.deliveredAt,
        error: delivery.error,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
      }))

      // Create paginated response
      const pagination = {
        page: Math.floor(query.offset / query.limit) + 1,
        pageSize: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
        hasNext: query.offset + query.limit < total,
        hasPrev: query.offset > 0,
      }

      return createVersionedResponse(transformedDeliveries, 'v2', null, pagination)
    } catch (error) {
      console.error('Failed to fetch webhook deliveries:', error)
      return errorResponse(
        'Failed to fetch webhook deliveries',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  })()
}