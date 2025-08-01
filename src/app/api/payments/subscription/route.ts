import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  authorize,
  errorResponse,
  successResponse,
  validateBody,
  withErrorHandler,
} from '@/lib/api/middleware'
import { z } from 'zod'
import { 
  createSubscriptionCheckout, 
  getSubscription,
  cancelSubscription,
  cancelSubscriptionImmediately,
} from '@/lib/stripe/client'

const createSubscriptionSchema = z.object({
  tier: z.enum(['basic', 'premium', 'enterprise']),
  returnUrl: z.string().url(),
  cancelUrl: z.string().url(),
})

const cancelSubscriptionSchema = z.object({
  immediate: z.boolean().default(false),
})

// GET /api/payments/subscription - Get current subscription
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const supabase = createClient()
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  // Get league subscription details
  const { data: league, error } = await supabase
    .from('leagues')
    .select('subscription_tier, subscription_expires_at, settings')
    .eq('id', leagueId)
    .single()

  if (error || !league) {
    return errorResponse('League not found', 404)
  }

  // Get Stripe subscription details if available
  let stripeSubscription = null
  if (league.settings?.stripe_subscription_id) {
    try {
      stripeSubscription = await getSubscription(league.settings.stripe_subscription_id)
    } catch (error) {
      console.error('Failed to fetch Stripe subscription:', error)
    }
  }

  // Get payment history
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('league_id', leagueId)
    .not('stripe_subscription_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)

  return successResponse({
    tier: league.subscription_tier,
    expiresAt: league.subscription_expires_at,
    status: stripeSubscription?.status || 'inactive',
    cancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end || false,
    currentPeriodEnd: stripeSubscription?.current_period_end 
      ? new Date(stripeSubscription.current_period_end * 1000).toISOString() 
      : null,
    paymentHistory: payments || [],
  })
})

// POST /api/payments/subscription - Create subscription checkout
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await validateBody(createSubscriptionSchema)(req)
  if (!validation.valid) {
    return errorResponse('Invalid request data', 400, validation.errors)
  }

  const supabase = createClient()
  const { tier, returnUrl, cancelUrl } = validation.data
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  // Check current subscription
  const { data: league } = await supabase
    .from('leagues')
    .select('subscription_tier, settings')
    .eq('id', leagueId)
    .single()

  if (league?.settings?.stripe_subscription_id) {
    // Check if there's an active subscription
    try {
      const subscription = await getSubscription(league.settings.stripe_subscription_id)
      if (subscription.status === 'active') {
        return errorResponse('League already has an active subscription', 400)
      }
    } catch (error) {
      console.error('Error checking subscription:', error)
    }
  }

  try {
    // Create Stripe checkout session
    const session = await createSubscriptionCheckout({
      userId: auth.user.id,
      userEmail: auth.user.email!,
      leagueId,
      tier,
      successUrl: returnUrl,
      cancelUrl: cancelUrl,
    })

    return successResponse({
      checkoutUrl: session.url,
      sessionId: session.id,
    })
  } catch (error) {
    console.error('Stripe subscription checkout error:', error)
    return errorResponse('Failed to create subscription checkout', 500, error)
  }
})

// DELETE /api/payments/subscription - Cancel subscription
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await validateBody(cancelSubscriptionSchema)(req)
  if (!validation.valid) {
    return errorResponse('Invalid request data', 400, validation.errors)
  }

  const supabase = createClient()
  const { immediate } = validation.data
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  // Get league subscription details
  const { data: league, error } = await supabase
    .from('leagues')
    .select('settings')
    .eq('id', leagueId)
    .single()

  if (error || !league) {
    return errorResponse('League not found', 404)
  }

  if (!league.settings?.stripe_subscription_id) {
    return errorResponse('No active subscription found', 400)
  }

  try {
    // Cancel subscription in Stripe
    const subscription = immediate
      ? await cancelSubscriptionImmediately(league.settings.stripe_subscription_id)
      : await cancelSubscription(league.settings.stripe_subscription_id)

    // Update league if immediate cancellation
    if (immediate) {
      await supabase
        .from('leagues')
        .update({
          subscription_tier: 'free',
          subscription_expires_at: null,
        })
        .eq('id', leagueId)
    }

    // Create notification for all admins
    const { data: admins } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('league_id', leagueId)
      .eq('role', 'admin')

    if (admins) {
      const notifications = admins.map(admin => ({
        user_id: admin.id,
        type: 'email' as const,
        title: immediate ? 'Subscription Cancelled' : 'Subscription Set to Cancel',
        content: immediate 
          ? 'Your subscription has been cancelled immediately.'
          : `Your subscription will be cancelled at the end of the current billing period on ${new Date(subscription.current_period_end * 1000).toLocaleDateString()}.`,
        data: {
          subscriptionId: subscription.id,
          cancelledBy: auth.user.profile?.full_name,
        },
      }))

      await supabase.from('notifications').insert(notifications)
    }

    return successResponse({
      message: immediate 
        ? 'Subscription cancelled immediately' 
        : 'Subscription will be cancelled at the end of the billing period',
      cancelAt: subscription.cancel_at 
        ? new Date(subscription.cancel_at * 1000).toISOString() 
        : null,
    })
  } catch (error) {
    console.error('Failed to cancel subscription:', error)
    return errorResponse('Failed to cancel subscription', 500, error)
  }
})