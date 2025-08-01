import { createClient } from '@/lib/supabase/server'

interface WebhookSubscription {
  id: string
  integration_id: string
  webhook_id: string
  resource_uri: string
  expiration_time?: string
  is_active: boolean
}

interface WebhookEvent {
  subscriptionId: string
  resourceUri: string
  changeType: 'created' | 'updated' | 'deleted'
  eventTime: string
  data: any
}

export class CalendarWebhookManager {
  
  /**
   * Register webhook for calendar changes
   */
  async registerWebhook(
    integrationId: string,
    provider: 'google' | 'outlook',
    resourceUri: string,
    callbackUrl: string
  ): Promise<WebhookSubscription> {
    const supabase = createClient()
    
    try {
      let webhookId: string
      let expirationTime: Date | undefined
      
      switch (provider) {
        case 'google':
          const googleResult = await this.registerGoogleWebhook(resourceUri, callbackUrl)
          webhookId = googleResult.id
          expirationTime = googleResult.expiration
          break
          
        case 'outlook':
          const outlookResult = await this.registerOutlookWebhook(resourceUri, callbackUrl)
          webhookId = outlookResult.id
          expirationTime = outlookResult.expiration
          break
          
        default:
          throw new Error(`Unsupported provider: ${provider}`)
      }
      
      // Store webhook subscription in database
      const { data: webhook, error } = await supabase
        .from('calendar_webhooks')
        .insert({
          integration_id: integrationId,
          webhook_id: webhookId,
          resource_uri: resourceUri,
          expiration_time: expirationTime?.toISOString(),
          is_active: true
        })
        .select()
        .single()
      
      if (error) {
        throw new Error(`Failed to store webhook: ${error.message}`)
      }
      
      return webhook
      
    } catch (error) {
      console.error('Failed to register webhook:', error)
      throw error
    }
  }
  
  /**
   * Register Google Calendar webhook using push notifications
   */
  private async registerGoogleWebhook(
    resourceUri: string,
    callbackUrl: string
  ): Promise<{ id: string; expiration: Date }> {
    // Google Calendar push notifications setup
    const watchRequest = {
      id: `webhook-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      type: 'web_hook',
      address: callbackUrl,
      params: {
        ttl: '3600' // 1 hour
      }
    }
    
    // This would be implemented with Google Calendar API
    // For now, return mock data
    return {
      id: watchRequest.id,
      expiration: new Date(Date.now() + 3600 * 1000) // 1 hour from now
    }
  }
  
  /**
   * Register Outlook webhook using Microsoft Graph subscriptions
   */
  private async registerOutlookWebhook(
    resourceUri: string,
    callbackUrl: string
  ): Promise<{ id: string; expiration: Date }> {
    // Microsoft Graph subscription setup
    const subscription = {
      changeType: 'created,updated,deleted',
      notificationUrl: callbackUrl,
      resource: resourceUri,
      expirationDateTime: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour
      clientState: Math.random().toString(36).substring(2)
    }
    
    // This would be implemented with Microsoft Graph API
    // For now, return mock data
    return {
      id: `outlook-${Date.now()}`,
      expiration: new Date(Date.now() + 3600 * 1000)
    }
  }
  
  /**
   * Renew webhook subscription before expiration
   */
  async renewWebhook(webhookId: string): Promise<void> {
    const supabase = createClient()
    
    // Get webhook details
    const { data: webhook, error } = await supabase
      .from('calendar_webhooks')
      .select(`
        *,
        integration:calendar_integrations(provider)
      `)
      .eq('webhook_id', webhookId)
      .single()
    
    if (error || !webhook) {
      throw new Error('Webhook not found')
    }
    
    try {
      let newExpiration: Date
      
      switch (webhook.integration.provider) {
        case 'google':
          newExpiration = await this.renewGoogleWebhook(webhookId)
          break
          
        case 'outlook':
          newExpiration = await this.renewOutlookWebhook(webhookId)
          break
          
        default:
          throw new Error(`Unsupported provider: ${webhook.integration.provider}`)
      }
      
      // Update expiration time in database
      await supabase
        .from('calendar_webhooks')
        .update({ expiration_time: newExpiration.toISOString() })
        .eq('webhook_id', webhookId)
        
    } catch (error) {
      console.error(`Failed to renew webhook ${webhookId}:`, error)
      
      // Mark webhook as inactive if renewal fails
      await supabase
        .from('calendar_webhooks')
        .update({ is_active: false })
        .eq('webhook_id', webhookId)
        
      throw error
    }
  }
  
  /**
   * Renew Google webhook
   */
  private async renewGoogleWebhook(webhookId: string): Promise<Date> {
    // Implement Google Calendar API renewal
    return new Date(Date.now() + 3600 * 1000) // 1 hour from now
  }
  
  /**
   * Renew Outlook webhook
   */
  private async renewOutlookWebhook(webhookId: string): Promise<Date> {
    // Implement Microsoft Graph API renewal
    return new Date(Date.now() + 3600 * 1000) // 1 hour from now
  }
  
  /**
   * Unregister webhook subscription
   */
  async unregisterWebhook(webhookId: string): Promise<void> {
    const supabase = createClient()
    
    // Get webhook details
    const { data: webhook, error } = await supabase
      .from('calendar_webhooks')
      .select(`
        *,
        integration:calendar_integrations(provider)
      `)
      .eq('webhook_id', webhookId)
      .single()
    
    if (error || !webhook) {
      console.warn(`Webhook ${webhookId} not found in database`)
      return
    }
    
    try {
      switch (webhook.integration.provider) {
        case 'google':
          await this.unregisterGoogleWebhook(webhookId)
          break
          
        case 'outlook':
          await this.unregisterOutlookWebhook(webhookId)
          break
      }
    } catch (error) {
      console.error(`Failed to unregister webhook ${webhookId}:`, error)
      // Continue to remove from database even if external cleanup fails
    }
    
    // Remove from database
    await supabase
      .from('calendar_webhooks')
      .delete()
      .eq('webhook_id', webhookId)
  }
  
  /**
   * Unregister Google webhook
   */
  private async unregisterGoogleWebhook(webhookId: string): Promise<void> {
    // Implement Google Calendar API webhook deletion
  }
  
  /**
   * Unregister Outlook webhook
   */
  private async unregisterOutlookWebhook(webhookId: string): Promise<void> {
    // Implement Microsoft Graph API subscription deletion
  }
  
  /**
   * Process incoming webhook event
   */
  async processWebhookEvent(event: WebhookEvent): Promise<void> {
    const supabase = createClient()
    
    // Validate webhook subscription
    const { data: webhook, error } = await supabase
      .from('calendar_webhooks')
      .select(`
        *,
        integration:calendar_integrations(*)
      `)
      .eq('webhook_id', event.subscriptionId)
      .eq('is_active', true)
      .single()
    
    if (error || !webhook) {
      console.warn(`Webhook ${event.subscriptionId} not found or inactive`)
      return
    }
    
    try {
      // Process the event based on change type
      switch (event.changeType) {
        case 'created':
          await this.handleEventCreated(webhook, event)
          break
          
        case 'updated':
          await this.handleEventUpdated(webhook, event)
          break
          
        case 'deleted':
          await this.handleEventDeleted(webhook, event)
          break
      }
      
      // Log successful processing
      await supabase
        .from('calendar_sync_log')
        .insert({
          integration_id: webhook.integration_id,
          operation: 'sync',
          status: 'success',
          sync_direction: 'inbound',
          metadata: {
            webhook_event: event,
            processed_at: new Date().toISOString()
          }
        })
        
    } catch (error) {
      console.error('Failed to process webhook event:', error)
      
      // Log failed processing
      await supabase
        .from('calendar_sync_log')
        .insert({
          integration_id: webhook.integration_id,
          operation: 'sync',
          status: 'failed',
          error_message: error.message,
          sync_direction: 'inbound',
          metadata: {
            webhook_event: event,
            error_details: error.stack
          }
        })
    }
  }
  
  /**
   * Handle calendar event creation
   */
  private async handleEventCreated(webhook: any, event: WebhookEvent): Promise<void> {
    // Check if this is a reservation-related event
    const eventData = event.data
    if (this.isReservationEvent(eventData)) {
      // Sync back to reservations system if needed
      console.log('External calendar event created:', eventData)
    }
  }
  
  /**
   * Handle calendar event update
   */
  private async handleEventUpdated(webhook: any, event: WebhookEvent): Promise<void> {
    const eventData = event.data
    if (this.isReservationEvent(eventData)) {
      // Update corresponding reservation if it exists
      console.log('External calendar event updated:', eventData)
    }
  }
  
  /**
   * Handle calendar event deletion
   */
  private async handleEventDeleted(webhook: any, event: WebhookEvent): Promise<void> {
    const eventData = event.data
    if (this.isReservationEvent(eventData)) {
      // Handle reservation cancellation if needed
      console.log('External calendar event deleted:', eventData)
    }
  }
  
  /**
   * Check if calendar event is related to a reservation
   */
  private isReservationEvent(eventData: any): boolean {
    // Check for reservation identifiers in event data
    return !!(
      eventData?.extendedProperties?.private?.['field-reservation-id'] ||
      eventData?.extensions?.find((ext: any) => ext.extensionName === 'com.fieldreservations.metadata')
    )
  }
  
  /**
   * Clean up expired webhooks
   */
  async cleanupExpiredWebhooks(): Promise<number> {
    const supabase = createClient()
    
    // Get expired webhooks
    const { data: expiredWebhooks, error } = await supabase
      .from('calendar_webhooks')
      .select('webhook_id')
      .lt('expiration_time', new Date().toISOString())
      .eq('is_active', true)
    
    if (error) {
      console.error('Failed to fetch expired webhooks:', error)
      return 0
    }
    
    let cleanedCount = 0
    
    // Unregister each expired webhook
    for (const webhook of expiredWebhooks || []) {
      try {
        await this.unregisterWebhook(webhook.webhook_id)
        cleanedCount++
      } catch (error) {
        console.error(`Failed to cleanup webhook ${webhook.webhook_id}:`, error)
      }
    }
    
    return cleanedCount
  }
  
  /**
   * Get webhook statistics
   */
  async getWebhookStats(): Promise<{
    total: number
    active: number
    expired: number
    byProvider: Record<string, number>
  }> {
    const supabase = createClient()
    
    const { data: webhooks, error } = await supabase
      .from('calendar_webhooks')
      .select(`
        *,
        integration:calendar_integrations(provider)
      `)
    
    if (error) {
      throw new Error(`Failed to fetch webhook stats: ${error.message}`)
    }
    
    const now = new Date()
    const stats = {
      total: webhooks?.length || 0,
      active: 0,
      expired: 0,
      byProvider: {} as Record<string, number>
    }
    
    for (const webhook of webhooks || []) {
      if (webhook.is_active) {
        stats.active++
      }
      
      if (webhook.expiration_time && new Date(webhook.expiration_time) < now) {
        stats.expired++
      }
      
      const provider = webhook.integration.provider
      stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1
    }
    
    return stats
  }
}

export const webhookManager = new CalendarWebhookManager()