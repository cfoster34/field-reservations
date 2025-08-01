import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { constructWebhookEvent } from '@/lib/stripe/client'
import { webhookHandlers } from '@/lib/stripe/comprehensive-webhooks'
import { errorResponse, successResponse, withErrorHandler } from '@/lib/api/middleware'
import Stripe from 'stripe'

// Stripe webhook endpoint
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.text()
  const signature = headers().get('stripe-signature')

  if (!signature) {
    return errorResponse('No signature provided', 400)
  }

  let event: Stripe.Event

  try {
    event = constructWebhookEvent(body, signature)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return errorResponse('Invalid signature', 400)
  }

  // Handle the event using comprehensive webhook handlers
  try {
    const handler = webhookHandlers[event.type as keyof typeof webhookHandlers]
    
    if (handler) {
      console.log(`Processing webhook event: ${event.type}`)
      await handler(event.data.object as any)
      console.log(`Successfully processed webhook event: ${event.type}`)
    } else {
      console.log(`Unhandled event type: ${event.type}`)
    }

    return successResponse({ 
      received: true, 
      eventType: event.type,
      eventId: event.id,
      processed: !!handler 
    })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return errorResponse('Webhook processing failed', 500, error)
  }
})

