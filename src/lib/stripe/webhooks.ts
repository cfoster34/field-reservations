import { stripe } from './client'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

// Handle successful payment for field reservation
export async function handlePaymentSuccess(
  paymentIntent: Stripe.PaymentIntent
) {
  const supabase = createClient()
  const { reservationId, userId } = paymentIntent.metadata

  // Update payment record
  const { error: paymentError } = await supabase
    .from('payments')
    .update({
      status: 'completed',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntent.id,
    })
    .eq('reservation_id', reservationId)
    .eq('user_id', userId)

  if (paymentError) {
    console.error('Error updating payment:', paymentError)
    throw paymentError
  }

  // Update reservation status to confirmed
  const { error: reservationError } = await supabase
    .from('reservations')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', reservationId)

  if (reservationError) {
    console.error('Error confirming reservation:', reservationError)
    throw reservationError
  }

  // Create notification for user
  const { error: notificationError } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'email',
      title: 'Payment Successful',
      content: 'Your field reservation has been confirmed!',
      data: {
        reservationId,
        paymentIntentId: paymentIntent.id,
      },
    })

  if (notificationError) {
    console.error('Error creating notification:', notificationError)
  }
}

// Handle failed payment
export async function handlePaymentFailed(
  paymentIntent: Stripe.PaymentIntent
) {
  const supabase = createClient()
  const { reservationId, userId } = paymentIntent.metadata

  // Update payment record
  const { error: paymentError } = await supabase
    .from('payments')
    .update({
      status: 'failed',
      failed_at: new Date().toISOString(),
    })
    .eq('reservation_id', reservationId)
    .eq('user_id', userId)

  if (paymentError) {
    console.error('Error updating payment:', paymentError)
    throw paymentError
  }

  // Cancel the reservation
  const { error: reservationError } = await supabase
    .from('reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Payment failed',
    })
    .eq('id', reservationId)

  if (reservationError) {
    console.error('Error cancelling reservation:', reservationError)
    throw reservationError
  }

  // Create notification for user
  const { error: notificationError } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'email',
      title: 'Payment Failed',
      content: 'Your payment failed and the reservation has been cancelled.',
      data: {
        reservationId,
        paymentIntentId: paymentIntent.id,
      },
    })

  if (notificationError) {
    console.error('Error creating notification:', notificationError)
  }
}

// Handle successful subscription
export async function handleSubscriptionCreated(
  subscription: Stripe.Subscription
) {
  const supabase = createClient()
  const { leagueId, tier } = subscription.metadata

  // Update league subscription
  const { error } = await supabase
    .from('leagues')
    .update({
      subscription_tier: tier,
      subscription_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
      settings: {
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
      },
    })
    .eq('id', leagueId)

  if (error) {
    console.error('Error updating league subscription:', error)
    throw error
  }

  // Create payment record
  const { error: paymentError } = await supabase
    .from('payments')
    .insert({
      league_id: leagueId,
      user_id: subscription.metadata.userId,
      amount: subscription.items.data[0].price.unit_amount! / 100,
      currency: subscription.currency,
      status: 'completed',
      stripe_subscription_id: subscription.id,
      description: `${tier} subscription`,
      paid_at: new Date().toISOString(),
    })

  if (paymentError) {
    console.error('Error creating payment record:', paymentError)
  }
}

// Handle subscription updated
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
) {
  const supabase = createClient()
  const { leagueId } = subscription.metadata

  // Update league subscription
  const { error } = await supabase
    .from('leagues')
    .update({
      subscription_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('id', leagueId)

  if (error) {
    console.error('Error updating league subscription:', error)
    throw error
  }
}

// Handle subscription cancelled
export async function handleSubscriptionCancelled(
  subscription: Stripe.Subscription
) {
  const supabase = createClient()
  const { leagueId } = subscription.metadata

  // Update league subscription to free tier
  const { error } = await supabase
    .from('leagues')
    .update({
      subscription_tier: 'free',
      subscription_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('id', leagueId)

  if (error) {
    console.error('Error cancelling league subscription:', error)
    throw error
  }

  // Notify league admins
  const { data: admins } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('league_id', leagueId)
    .eq('role', 'admin')

  if (admins) {
    for (const admin of admins) {
      await supabase
        .from('notifications')
        .insert({
          user_id: admin.id,
          type: 'email',
          title: 'Subscription Cancelled',
          content: 'Your subscription has been cancelled and will expire at the end of the billing period.',
          data: {
            subscriptionId: subscription.id,
          },
        })
    }
  }
}

// Handle refund
export async function handleRefundCreated(refund: Stripe.Refund) {
  const supabase = createClient()
  const paymentIntentId = refund.payment_intent as string

  // Get the original payment
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single()

  if (!payment) {
    console.error('Payment not found for refund:', paymentIntentId)
    return
  }

  // Update payment status
  const refundAmount = refund.amount / 100
  const isFullRefund = refundAmount >= payment.amount

  const { error: paymentError } = await supabase
    .from('payments')
    .update({
      status: isFullRefund ? 'refunded' : 'completed',
      refunded_at: new Date().toISOString(),
      refund_reason: refund.reason || 'requested_by_customer',
      metadata: {
        ...payment.metadata,
        refund_amount: refundAmount,
        stripe_refund_id: refund.id,
      },
    })
    .eq('id', payment.id)

  if (paymentError) {
    console.error('Error updating payment for refund:', paymentError)
    throw paymentError
  }

  // If it's a reservation payment, cancel the reservation
  if (payment.reservation_id) {
    const { error: reservationError } = await supabase
      .from('reservations')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: 'Refunded',
      })
      .eq('id', payment.reservation_id)

    if (reservationError) {
      console.error('Error cancelling reservation:', reservationError)
    }
  }

  // Notify user
  await supabase
    .from('notifications')
    .insert({
      user_id: payment.user_id,
      type: 'email',
      title: 'Refund Processed',
      content: `Your refund of ${formatAmount(refund.amount)} has been processed.`,
      data: {
        paymentId: payment.id,
        refundId: refund.id,
        amount: refundAmount,
      },
    })
}

// Helper function to format amount
function formatAmount(amountInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountInCents / 100)
}