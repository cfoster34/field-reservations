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
import { webhookManager, WebhookEvent } from '@/lib/webhooks/webhook-manager'
import { z } from 'zod'

// V2 Webhook Schemas
const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.enum([
    'user.created', 'user.updated', 'user.deleted',
    'team.created', 'team.updated', 'team.deleted',
    'field.created', 'field.updated', 'field.deleted',
    'reservation.created', 'reservation.updated', 'reservation.cancelled', 'reservation.confirmed',
    'payment.processed', 'payment.failed',
    'sync.completed', 'sync.failed'
  ])).min(1),
  headers: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(30000).default(10000),
  retryAttempts: z.number().min(0).max(5).default(3),
})

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

const testWebhookSchema = z.object({
  event: z.enum([
    'user.created', 'user.updated', 'user.deleted',
    'team.created', 'team.updated', 'team.deleted',
    'field.created', 'field.updated', 'field.deleted',
    'reservation.created', 'reservation.updated', 'reservation.cancelled', 'reservation.confirmed',
    'payment.processed', 'payment.failed',
    'sync.completed', 'sync.failed'
  ]),
  testData: z.any().optional(),
})

// GET /api/v2/webhooks - List webhook endpoints
export const GET = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting
  const rateLimitResult = await rateLimit(req, 'webhooks:list')
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

  const leagueId = auth.user.profile?.league_id
  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  try {
    const webhooks = await webhookManager.getWebhookEndpoints(leagueId)
    
    // Transform webhooks for response (hide secrets)
    const transformedWebhooks = webhooks.map(webhook => ({
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
    }))

    return createVersionedResponse(transformedWebhooks, 'v2')
  } catch (error) {
    console.error('Failed to fetch webhooks:', error)
    return errorResponse(
      'Failed to fetch webhooks',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
})

// POST /api/v2/webhooks - Create webhook endpoint
export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting
  const rateLimitResult = await rateLimit(req, 'webhooks:create', { max: 5, windowMs: 60000 })
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
  const validation = await validateBody(createWebhookSchema)(req)
  if (!validation.valid) {
    return errorResponse('Validation failed', 400, validation.errors)
  }

  const leagueId = auth.user.profile?.league_id
  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  try {
    // Check webhook limit per league (prevent abuse)
    const existingWebhooks = await webhookManager.getWebhookEndpoints(leagueId)
    if (existingWebhooks.length >= 10) {
      return errorResponse('Maximum number of webhooks per league exceeded (10)', 400)
    }

    // Test webhook URL before creating
    try {
      const testResponse = await fetch(validation.data.url, {
        method: 'HEAD',
        timeout: 5000,
      })
      
      if (!testResponse.ok && testResponse.status !== 405) { // 405 Method Not Allowed is acceptable
        return errorResponse(
          `Webhook URL test failed: HTTP ${testResponse.status}`,
          400,
          { testStatus: testResponse.status }
        )
      }
    } catch (error) {
      return errorResponse(
        'Webhook URL is not reachable',
        400,
        error instanceof Error ? error.message : 'Connection failed'
      )
    }

    const webhook = await webhookManager.createWebhookEndpoint(
      leagueId,
      auth.user.id,
      validation.data
    )

    // Transform response (include secret for initial setup)
    const response = {
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      secret: webhook.secret, // Include secret only on creation
      headers: webhook.headers,
      timeout: webhook.timeout,
      retryAttempts: webhook.retryAttempts,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    }

    return createVersionedResponse(response, 'v2')
  } catch (error) {
    console.error('Failed to create webhook:', error)
    return errorResponse(
      'Failed to create webhook',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
})

// Test webhook endpoint functionality
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting
  const rateLimitResult = await rateLimit(req, 'webhooks:test', { max: 10, windowMs: 60000 })
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

  // Validate request body
  const validation = await validateBody(testWebhookSchema)(req)
  if (!validation.valid) {
    return errorResponse('Validation failed', 400, validation.errors)
  }

  const leagueId = auth.user.profile?.league_id
  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  const { event, testData } = validation.data

  try {
    // Generate test payload
    const testPayload = testData || generateTestPayload(event)
    
    // Trigger webhook for testing
    await webhookManager.triggerWebhook(
      leagueId,
      event as WebhookEvent,
      testPayload,
      undefined,
      {
        id: auth.user.id,
        name: auth.user.profile?.full_name || 'Test User',
        type: 'user',
      }
    )

    return createVersionedResponse({
      message: 'Test webhook triggered successfully',
      event,
      timestamp: new Date().toISOString(),
    }, 'v2')
  } catch (error) {
    console.error('Failed to trigger test webhook:', error)
    return errorResponse(
      'Failed to trigger test webhook',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
})

// Generate test payloads for different event types
function generateTestPayload(event: string): any {
  const baseData = {
    id: 'test-' + Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  switch (event) {
    case 'user.created':
    case 'user.updated':
      return {
        ...baseData,
        email: 'test@example.com',
        fullName: 'Test User',
        role: 'member',
        isApproved: true,
      }

    case 'team.created':
    case 'team.updated':
      return {
        ...baseData,
        name: 'Test Team',
        ageGroup: 'U-12',
        division: 'A',
        memberCount: 15,
      }

    case 'field.created':
    case 'field.updated':
      return {
        ...baseData,
        name: 'Test Field',
        type: 'soccer',
        address: '123 Test Street, Test City',
        hourlyRate: 50,
        status: 'available',
      }

    case 'reservation.created':
    case 'reservation.updated':
    case 'reservation.confirmed':
      return {
        ...baseData,
        field: { id: 'field-1', name: 'Test Field' },
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
        date: new Date().toISOString().split('T')[0],
        startTime: '10:00',
        endTime: '12:00',
        status: 'confirmed',
        cost: 100,
      }

    case 'reservation.cancelled':
      return {
        ...baseData,
        field: { id: 'field-1', name: 'Test Field' },
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
        date: new Date().toISOString().split('T')[0],
        startTime: '10:00',
        endTime: '12:00',
        status: 'cancelled',
        cancellationReason: 'Test cancellation',
        cost: 100,
      }

    case 'payment.processed':
      return {
        ...baseData,
        amount: 100,
        currency: 'USD',
        status: 'succeeded',
        reservation: { id: 'reservation-1' },
        stripePaymentId: 'pi_test_123456789',
      }

    case 'payment.failed':
      return {
        ...baseData,
        amount: 100,
        currency: 'USD',
        status: 'failed',
        reservation: { id: 'reservation-1' },
        error: 'Payment method declined',
      }

    case 'sync.completed':
      return {
        ...baseData,
        source: 'sportsconnect',
        result: {
          users: { created: 5, updated: 3, errors: [] },
          teams: { created: 2, updated: 1, errors: [] },
          fields: { created: 1, updated: 0, errors: [] },
          reservations: { created: 10, updated: 2, errors: [] },
        },
        duration: 30000,
      }

    case 'sync.failed':
      return {
        ...baseData,
        source: 'sportsconnect',
        error: 'API connection timeout',
        partialResult: {
          users: { created: 2, updated: 1, errors: ['Invalid email format'] },
          teams: { created: 0, updated: 0, errors: ['Team name already exists'] },
        },
      }

    default:
      return { ...baseData, message: 'Test event data' }
  }
}