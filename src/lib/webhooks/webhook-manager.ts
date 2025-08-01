import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import crypto from 'crypto'

export interface WebhookEndpoint {
  id: string
  leagueId: string
  name: string
  url: string
  events: WebhookEvent[]
  isActive: boolean
  secret: string
  headers?: Record<string, string>
  timeout: number
  retryAttempts: number
  createdAt: string
  updatedAt: string
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  event: WebhookEvent
  payload: any
  response?: {
    status: number
    body: string
    headers: Record<string, string>
  }
  status: 'pending' | 'delivered' | 'failed' | 'retrying'
  attempts: number
  nextRetryAt?: string
  deliveredAt?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export type WebhookEvent = 
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'team.created' 
  | 'team.updated'
  | 'team.deleted'
  | 'field.created'
  | 'field.updated'
  | 'field.deleted'
  | 'reservation.created'
  | 'reservation.updated'
  | 'reservation.cancelled'
  | 'reservation.confirmed'
  | 'payment.processed'
  | 'payment.failed'
  | 'sync.completed'
  | 'sync.failed'

export interface WebhookPayload {
  id: string
  event: WebhookEvent
  timestamp: string
  data: any
  previous?: any // For update events
  league: {
    id: string
    name: string
  }
  triggered_by?: {
    id: string
    name: string
    type: 'user' | 'system'
  }
}

const webhookEndpointSchema = z.object({
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

export class WebhookManager {
  private supabase: any

  constructor() {
    this.supabase = createClient()
  }

  // Webhook endpoint management
  async createWebhookEndpoint(
    leagueId: string,
    userId: string,
    data: Omit<WebhookEndpoint, 'id' | 'leagueId' | 'secret' | 'createdAt' | 'updatedAt'>
  ): Promise<WebhookEndpoint> {
    const validation = webhookEndpointSchema.parse(data)
    
    const secret = this.generateSecret()
    const endpoint = {
      league_id: leagueId,
      created_by: userId,
      name: validation.name,
      url: validation.url,
      events: validation.events,
      is_active: true,
      secret,
      headers: validation.headers || {},
      timeout: validation.timeout,
      retry_attempts: validation.retryAttempts,
    }

    const { data: created, error } = await this.supabase
      .from('webhook_endpoints')
      .insert(endpoint)
      .select()
      .single()

    if (error) throw error

    return this.transformEndpoint(created)
  }

  async updateWebhookEndpoint(
    webhookId: string,
    leagueId: string,
    updates: Partial<Omit<WebhookEndpoint, 'id' | 'leagueId' | 'secret' | 'createdAt' | 'updatedAt'>>
  ): Promise<WebhookEndpoint> {
    const { data: updated, error } = await this.supabase
      .from('webhook_endpoints')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', webhookId)
      .eq('league_id', leagueId)
      .select()
      .single()

    if (error) throw error

    return this.transformEndpoint(updated)
  }

  async deleteWebhookEndpoint(webhookId: string, leagueId: string): Promise<void> {
    const { error } = await this.supabase
      .from('webhook_endpoints')
      .delete()
      .eq('id', webhookId)
      .eq('league_id', leagueId)

    if (error) throw error
  }

  async getWebhookEndpoints(leagueId: string): Promise<WebhookEndpoint[]> {
    const { data: endpoints, error } = await this.supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return endpoints.map(endpoint => this.transformEndpoint(endpoint))
  }

  async getWebhookEndpoint(webhookId: string, leagueId: string): Promise<WebhookEndpoint | null> {
    const { data: endpoint, error } = await this.supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('id', webhookId)
      .eq('league_id', leagueId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return this.transformEndpoint(endpoint)
  }

  // Webhook delivery
  async triggerWebhook(
    leagueId: string,
    event: WebhookEvent,
    data: any,
    previous?: any,
    triggeredBy?: { id: string; name: string; type: 'user' | 'system' }
  ): Promise<void> {
    // Get active endpoints that subscribe to this event
    const { data: endpoints, error } = await this.supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('league_id', leagueId)
      .eq('is_active', true)
      .contains('events', [event])

    if (error) {
      console.error('Failed to fetch webhook endpoints:', error)
      return
    }

    if (!endpoints || endpoints.length === 0) {
      return // No webhooks to trigger
    }

    // Get league info
    const { data: league } = await this.supabase
      .from('leagues')
      .select('id, name')
      .eq('id', leagueId)
      .single()

    // Create payload
    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      event,
      timestamp: new Date().toISOString(),
      data,
      previous,
      league: league || { id: leagueId, name: 'Unknown League' },
      triggered_by: triggeredBy,
    }

    // Create delivery records and queue for processing
    for (const endpoint of endpoints) {
      await this.createWebhookDelivery(endpoint.id, event, payload)
    }

    // Process deliveries asynchronously
    this.processWebhookDeliveries().catch(error => {
      console.error('Webhook delivery processing error:', error)
    })
  }

  private async createWebhookDelivery(
    webhookId: string,
    event: WebhookEvent,
    payload: WebhookPayload
  ): Promise<string> {
    const { data: delivery, error } = await this.supabase
      .from('webhook_deliveries')
      .insert({
        webhook_id: webhookId,
        event,
        payload,
        status: 'pending',
        attempts: 0,
      })
      .select('id')
      .single()

    if (error) throw error

    return delivery.id
  }

  async processWebhookDeliveries(): Promise<void> {
    // Get pending deliveries
    const { data: deliveries, error } = await this.supabase
      .from('webhook_deliveries')
      .select(`
        *,
        webhook:webhook_endpoints(*)
      `)
      .in('status', ['pending', 'retrying'])
      .or('next_retry_at.is.null,next_retry_at.lte.' + new Date().toISOString())
      .limit(50) // Process in batches

    if (error) {
      console.error('Failed to fetch webhook deliveries:', error)
      return
    }

    if (!deliveries || deliveries.length === 0) {
      return
    }

    // Process each delivery
    await Promise.allSettled(
      deliveries.map(delivery => this.deliverWebhook(delivery))
    )
  }

  private async deliverWebhook(delivery: any): Promise<void> {
    const { webhook } = delivery
    
    if (!webhook || !webhook.is_active) {
      await this.markDeliveryFailed(delivery.id, 'Webhook endpoint is inactive')
      return
    }

    const signature = this.generateSignature(delivery.payload, webhook.secret)
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'FieldReservations-Webhook/1.0',
      'X-Webhook-Signature': signature,
      'X-Webhook-Event': delivery.event,
      'X-Webhook-ID': delivery.id,
      'X-Webhook-Timestamp': delivery.created_at,
      ...webhook.headers,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), webhook.timeout)

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(delivery.payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const responseBody = await response.text().catch(() => '')
      const responseHeaders = Object.fromEntries(response.headers.entries())

      await this.updateDeliveryResponse(delivery.id, {
        status: response.status,
        body: responseBody,
        headers: responseHeaders,
      })

      if (response.ok) {
        await this.markDeliveryDelivered(delivery.id)
      } else {
        await this.handleDeliveryFailure(
          delivery.id,
          delivery.attempts + 1,
          webhook.retry_attempts,
          `HTTP ${response.status}: ${responseBody}`
        )
      }
    } catch (error) {
      clearTimeout(timeoutId)
      
      let errorMessage = 'Unknown error'
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Request timeout'
        } else {
          errorMessage = error.message
        }
      }

      await this.handleDeliveryFailure(
        delivery.id,
        delivery.attempts + 1,
        webhook.retry_attempts,
        errorMessage
      )
    }
  }

  private async updateDeliveryResponse(
    deliveryId: string,
    response: { status: number; body: string; headers: Record<string, string> }
  ): Promise<void> {
    await this.supabase
      .from('webhook_deliveries')
      .update({
        response,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)
  }

  private async markDeliveryDelivered(deliveryId: string): Promise<void> {
    await this.supabase
      .from('webhook_deliveries')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)
  }

  private async markDeliveryFailed(deliveryId: string, error: string): Promise<void> {
    await this.supabase
      .from('webhook_deliveries')
      .update({
        status: 'failed',
        error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)
  }

  private async handleDeliveryFailure(
    deliveryId: string,
    attempts: number,
    maxRetries: number,
    error: string
  ): Promise<void> {
    if (attempts <= maxRetries) {
      // Schedule retry with exponential backoff
      const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1), 300000) // Max 5 minutes
      const nextRetryAt = new Date(Date.now() + backoffMs).toISOString()

      await this.supabase
        .from('webhook_deliveries')
        .update({
          status: 'retrying',
          attempts,
          next_retry_at: nextRetryAt,
          error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId)
    } else {
      await this.markDeliveryFailed(deliveryId, error)
    }
  }

  // Webhook delivery history
  async getWebhookDeliveries(
    webhookId: string,
    options: {
      status?: 'pending' | 'delivered' | 'failed' | 'retrying'
      event?: WebhookEvent
      limit?: number
      offset?: number
    } = {}
  ): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    let query = this.supabase
      .from('webhook_deliveries')
      .select('*', { count: 'exact' })
      .eq('webhook_id', webhookId)

    if (options.status) {
      query = query.eq('status', options.status)
    }

    if (options.event) {
      query = query.eq('event', options.event)
    }

    query = query
      .order('created_at', { ascending: false })
      .range(options.offset || 0, (options.offset || 0) + (options.limit || 20) - 1)

    const { data: deliveries, error, count } = await query

    if (error) throw error

    return {
      deliveries: deliveries?.map(d => this.transformDelivery(d)) || [],
      total: count || 0,
    }
  }

  async retryWebhookDelivery(deliveryId: string): Promise<void> {
    const { error } = await this.supabase
      .from('webhook_deliveries')
      .update({
        status: 'pending',
        next_retry_at: null,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)

    if (error) throw error

    // Process immediately
    this.processWebhookDeliveries().catch(error => {
      console.error('Webhook retry processing error:', error)
    })
  }

  // Utility methods
  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  private generateSignature(payload: any, secret: string): string {
    const body = JSON.stringify(payload)
    return crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex')
  }

  verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )
  }

  private transformEndpoint(endpoint: any): WebhookEndpoint {
    return {
      id: endpoint.id,
      leagueId: endpoint.league_id,
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.events,
      isActive: endpoint.is_active,
      secret: endpoint.secret,
      headers: endpoint.headers,
      timeout: endpoint.timeout,
      retryAttempts: endpoint.retry_attempts,
      createdAt: endpoint.created_at,
      updatedAt: endpoint.updated_at,
    }
  }

  private transformDelivery(delivery: any): WebhookDelivery {
    return {
      id: delivery.id,
      webhookId: delivery.webhook_id,
      event: delivery.event,
      payload: delivery.payload,
      response: delivery.response,
      status: delivery.status,
      attempts: delivery.attempts,
      nextRetryAt: delivery.next_retry_at,
      deliveredAt: delivery.delivered_at,
      error: delivery.error,
      createdAt: delivery.created_at,
      updatedAt: delivery.updated_at,
    }
  }
}

// Singleton instance
export const webhookManager = new WebhookManager()

// Helper functions for triggering webhooks from different parts of the app
export async function triggerUserWebhook(
  leagueId: string,
  event: 'user.created' | 'user.updated' | 'user.deleted',
  user: any,
  previousUser?: any,
  triggeredBy?: { id: string; name: string; type: 'user' | 'system' }
): Promise<void> {
  await webhookManager.triggerWebhook(leagueId, event, user, previousUser, triggeredBy)
}

export async function triggerReservationWebhook(
  leagueId: string,
  event: 'reservation.created' | 'reservation.updated' | 'reservation.cancelled' | 'reservation.confirmed',
  reservation: any,
  previousReservation?: any,
  triggeredBy?: { id: string; name: string; type: 'user' | 'system' }
): Promise<void> {
  await webhookManager.triggerWebhook(leagueId, event, reservation, previousReservation, triggeredBy)
}

export async function triggerPaymentWebhook(
  leagueId: string,
  event: 'payment.processed' | 'payment.failed',
  payment: any,
  triggeredBy?: { id: string; name: string; type: 'user' | 'system' }
): Promise<void> {
  await webhookManager.triggerWebhook(leagueId, event, payment, undefined, triggeredBy)
}

export async function triggerSyncWebhook(
  leagueId: string,
  event: 'sync.completed' | 'sync.failed',
  syncResult: any,
  triggeredBy?: { id: string; name: string; type: 'user' | 'system' }
): Promise<void> {
  await webhookManager.triggerWebhook(leagueId, event, syncResult, undefined, triggeredBy)
}