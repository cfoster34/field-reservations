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
import { createRefund } from '@/lib/stripe/client'

const refundSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive().optional(),
  reason: z.enum(['cancellation', 'weather', 'field_issue', 'duplicate', 'other']),
  notes: z.string().optional(),
})

// POST /api/payments/refund - Process a refund
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await validateBody(refundSchema)(req)
  if (!validation.valid) {
    return errorResponse('Invalid request data', 400, validation.errors)
  }

  const supabase = createClient()
  const { paymentId, amount, reason, notes } = validation.data

  // Get payment details
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select(`
      *,
      reservation:reservations (
        id,
        status,
        user_id
      )
    `)
    .eq('id', paymentId)
    .single()

  if (paymentError || !payment) {
    return errorResponse('Payment not found', 404)
  }

  if (payment.status !== 'completed') {
    return errorResponse('Can only refund completed payments', 400)
  }

  if (!payment.stripe_payment_intent_id) {
    return errorResponse('No Stripe payment intent found', 400)
  }

  // Check if payment belongs to user's league
  if (payment.league_id !== auth.user.profile?.league_id) {
    return errorResponse('Payment does not belong to your league', 403)
  }

  try {
    // Create refund in Stripe
    const refundAmount = amount ? Math.round(amount * 100) : undefined // Convert to cents
    const stripeRefund = await createRefund({
      paymentIntentId: payment.stripe_payment_intent_id,
      amount: refundAmount,
      reason: reason === 'duplicate' ? 'duplicate' : 
              reason === 'other' ? 'requested_by_customer' : 
              'requested_by_customer',
    })

    // Update payment record
    const refundedAmount = (stripeRefund.amount / 100)
    const isFullRefund = refundedAmount >= payment.amount

    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: isFullRefund ? 'refunded' : 'completed',
        refunded_at: new Date().toISOString(),
        refund_reason: reason,
        metadata: {
          ...payment.metadata,
          refund_amount: refundedAmount,
          refund_notes: notes,
          stripe_refund_id: stripeRefund.id,
        },
      })
      .eq('id', paymentId)

    if (updateError) {
      console.error('Failed to update payment record:', updateError)
    }

    // If it's a reservation payment and full refund, cancel the reservation
    if (payment.reservation_id && isFullRefund) {
      await supabase
        .from('reservations')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: `Refunded: ${reason}`,
          cancelled_by: auth.user.id,
        })
        .eq('id', payment.reservation_id)
    }

    // Create notification for user
    if (payment.reservation?.user_id) {
      await supabase
        .from('notifications')
        .insert({
          user_id: payment.reservation.user_id,
          type: 'email',
          title: 'Payment Refunded',
          content: `Your payment of $${refundedAmount.toFixed(2)} has been refunded. Reason: ${reason}`,
          data: {
            paymentId,
            refundAmount: refundedAmount,
            reason,
          },
        })
    }

    return successResponse({
      refundId: stripeRefund.id,
      amount: refundedAmount,
      status: stripeRefund.status,
      reason,
    })
  } catch (error) {
    console.error('Stripe refund error:', error)
    return errorResponse('Failed to process refund', 500, error)
  }
})