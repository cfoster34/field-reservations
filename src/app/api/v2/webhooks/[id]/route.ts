import { NextRequest, NextResponse } from 'next/server'
import { 
  authenticate, 
  authorize, 
  validateBody, 
  rateLimit,
  errorResponse,
  withErrorHandler 
} from '@/lib/api/middleware'
import { createVersionedResponse } from '@/lib/api/versioning'
import { webhookManager } from '@/lib/webhooks/webhook-manager'
import { z } from 'zod'

// V2 Update Webhook Schema
const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.enum([
    'user.created', 'user.updated', 'user.deleted',
    'team.created', 'team.updated', 'team.deleted',
    'field.created', 'field.updated', 'field.deleted',
    'reservation.created', 'reservation.updated', 'reservation.cancelled', 'reservation.confirmed',
    'payment.processed', 'payment.failed',
    'sync.completed', 'sync.failed'
  ])).min(1).optional(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(30000).optional(),
  retryAttempts: z.number().min(0).max(5).optional(),
  isActive: z.boolean().optional(),
})

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

// GET /api/v2/webhooks/[id] - Get webhook endpoint details
export async function GET(req: NextRequest, { params }: RouteContext) {
  return withErrorHandler(async () => {
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'webhooks:get')
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

    try {
      const webhook = await webhookManager.getWebhookEndpoint(webhookId, leagueId)
      
      if (!webhook) {
        return errorResponse('Webhook not found', 404)
      }

      // Transform webhook for response (hide secret)
      const response = {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        isActive: webhook.isActive,
        headers: webhook.headers,
        timeout: webhook.timeout,
        retryAttempts: webhook.retryAttempts,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
        // Don't expose the secret
      }

      return createVersionedResponse(response, 'v2')
    } catch (error) {
      console.error('Failed to fetch webhook:', error)
      return errorResponse(
        'Failed to fetch webhook',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  })()
}

// PUT /api/v2/webhooks/[id] - Update webhook endpoint
export async function PUT(req: NextRequest, { params }: RouteContext) {
  return withErrorHandler(async () => {
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'webhooks:update', { max: 10, windowMs: 60000 })
    if (!rateLimitResult.success) {
      return errorResponse(rateLimitResult.error, 429, {
        retryAfter: rateLimitResult.retryAfter,
      })
    }

    // Authentication and authorization
    const auth = await authorize(['admin'])(req)
    if (!auth.authenticated || !auth.authorized) {
      return errorResponse(auth.error || 'Insufficient permissions', auth.authenticated ? 403 : 401)
    }

    // Validate request body
    const validation = await validateBody(updateWebhookSchema)(req)
    if (!validation.valid) {
      return errorResponse('Validation failed', 400, validation.errors)
    }

    const webhookId = params.id
    const leagueId = auth.user.profile?.league_id

    if (!leagueId) {
      return errorResponse('User must belong to a league', 400)
    }

    try {
      // Check if webhook exists
      const existingWebhook = await webhookManager.getWebhookEndpoint(webhookId, leagueId)
      if (!existingWebhook) {
        return errorResponse('Webhook not found', 404)
      }

      // Test new URL if provided
      if (validation.data.url && validation.data.url !== existingWebhook.url) {
        try {
          const testResponse = await fetch(validation.data.url, {
            method: 'HEAD',
            timeout: 5000,
          })
          
          if (!testResponse.ok && testResponse.status !== 405) {
            return errorResponse(
              `Webhook URL test failed: HTTP ${testResponse.status}`,
              400,
              { testStatus: testResponse.status }
            )
          }
        } catch (error) {
          return errorResponse(
            'New webhook URL is not reachable',
            400,
            error instanceof Error ? error.message : 'Connection failed'
          )
        }
      }

      const updatedWebhook = await webhookManager.updateWebhookEndpoint(
        webhookId,
        leagueId,
        validation.data
      )

      // Transform response (hide secret)
      const response = {
        id: updatedWebhook.id,
        name: updatedWebhook.name,
        url: updatedWebhook.url,
        events: updatedWebhook.events,
        isActive: updatedWebhook.isActive,
        headers: updatedWebhook.headers,
        timeout: updatedWebhook.timeout,
        retryAttempts: updatedWebhook.retryAttempts,
        createdAt: updatedWebhook.createdAt,
        updatedAt: updatedWebhook.updatedAt,
      }

      return createVersionedResponse(response, 'v2')
    } catch (error) {
      console.error('Failed to update webhook:', error)
      return errorResponse(
        'Failed to update webhook',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  })()
}

// DELETE /api/v2/webhooks/[id] - Delete webhook endpoint
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  return withErrorHandler(async () => {
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'webhooks:delete', { max: 5, windowMs: 60000 })
    if (!rateLimitResult.success) {
      return errorResponse(rateLimitResult.error, 429, {
        retryAfter: rateLimitResult.retryAfter,
      })
    }

    // Authentication and authorization
    const auth = await authorize(['admin'])(req)
    if (!auth.authenticated || !auth.authorized) {
      return errorResponse(auth.error || 'Insufficient permissions', auth.authenticated ? 403 : 401)
    }

    const webhookId = params.id
    const leagueId = auth.user.profile?.league_id

    if (!leagueId) {
      return errorResponse('User must belong to a league', 400)
    }

    try {
      // Check if webhook exists
      const existingWebhook = await webhookManager.getWebhookEndpoint(webhookId, leagueId)
      if (!existingWebhook) {
        return errorResponse('Webhook not found', 404)
      }

      await webhookManager.deleteWebhookEndpoint(webhookId, leagueId)

      return createVersionedResponse({
        id: webhookId,
        deleted: true,
        deletedAt: new Date().toISOString(),
        message: `Webhook '${existingWebhook.name}' has been successfully deleted`,
      }, 'v2')
    } catch (error) {
      console.error('Failed to delete webhook:', error)
      return errorResponse(
        'Failed to delete webhook',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  })()
}