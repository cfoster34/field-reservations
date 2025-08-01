import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SubscriptionService } from '@/lib/stripe/subscription-service'
import { CheckoutService } from '@/lib/stripe/checkout-service'
import { errorResponse, successResponse, withErrorHandler } from '@/lib/api/middleware'
import { SubscriptionTier } from '@/types/payment'

const subscriptionService = new SubscriptionService()
const checkoutService = new CheckoutService()

// Get subscription for league
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const leagueId = searchParams.get('leagueId')

  if (!leagueId) {
    return errorResponse('League ID is required', 400)
  }

  const subscription = await subscriptionService.getSubscriptionByLeague(leagueId)
  
  return successResponse({
    subscription,
  })
})

// Create subscription or checkout session
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json()
  const {
    action,
    userId,
    leagueId,
    tier,
    addOns = [],
    trialDays = 0,
    couponId,
    successUrl,
    cancelUrl,
    collectTaxIds = false,
  } = body

  if (!userId || !leagueId) {
    return errorResponse('User ID and League ID are required', 400)
  }

  switch (action) {
    case 'create_checkout':
      if (!tier || !successUrl || !cancelUrl) {
        return errorResponse('Tier, success URL, and cancel URL are required for checkout', 400)
      }

      const checkout = await checkoutService.createSubscriptionCheckout({
        userId,
        leagueId,
        tier: tier as SubscriptionTier,
        addOns,
        trialDays,
        couponId,
        successUrl,
        cancelUrl,
        collectTaxIds,
      })

      return successResponse({
        checkoutUrl: checkout.url,
        sessionId: checkout.session.id,
      })

    case 'create_direct':
      if (!tier) {
        return errorResponse('Tier is required', 400)
      }

      const subscription = await subscriptionService.createSubscription({
        userId,
        leagueId,
        tier: tier as SubscriptionTier,
        addOns,
        trialDays,
        couponId,
      })

      return successResponse({
        subscription: subscription.subscription,
        clientSecret: subscription.clientSecret,
      })

    default:
      return errorResponse('Invalid action', 400)
  }
})

// Update subscription
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json()
  const {
    action,
    subscriptionId,
    newTier,
    addOns,
    prorationBehavior = 'create_prorations',
  } = body

  if (!subscriptionId) {
    return errorResponse('Subscription ID is required', 400)
  }

  switch (action) {
    case 'update_tier':
      if (!newTier) {
        return errorResponse('New tier is required', 400)
      }

      const updatedSubscription = await subscriptionService.updateSubscriptionTier({
        subscriptionId,
        newTier: newTier as SubscriptionTier,
        prorationBehavior,
      })

      return successResponse({
        subscription: updatedSubscription,
      })

    case 'add_addon':
      if (!addOns || addOns.length === 0) {
        return errorResponse('Add-ons are required', 400)
      }

      const results = []
      for (const addOn of addOns) {
        const result = await subscriptionService.addSubscriptionAddOn({
          subscriptionId,
          addOnId: addOn.id,
          quantity: addOn.quantity || 1,
        })
        results.push(result)
      }

      return successResponse({
        addOns: results,
      })

    case 'remove_addon':
      if (!addOns || addOns.length === 0) {
        return errorResponse('Add-on IDs are required', 400)
      }

      for (const addOn of addOns) {
        await subscriptionService.removeSubscriptionAddOn({
          subscriptionId,
          addOnId: addOn.id,
        })
      }

      return successResponse({
        message: 'Add-ons removed successfully',
      })

    case 'cancel':
      const immediately = body.immediately || false
      const cancelledSubscription = await subscriptionService.cancelSubscription(
        subscriptionId,
        immediately
      )

      return successResponse({
        subscription: cancelledSubscription,
      })

    case 'reactivate':
      const reactivatedSubscription = await subscriptionService.reactivateSubscription(subscriptionId)

      return successResponse({
        subscription: reactivatedSubscription,
      })

    default:
      return errorResponse('Invalid action', 400)
  }
})