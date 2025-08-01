import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  errorResponse,
  successResponse,
  validateBody,
  withErrorHandler,
} from '@/lib/api/middleware'
import { createCheckoutSchema } from '@/lib/api/validation'
import { createFieldReservationCheckout } from '@/lib/stripe/client'

// POST /api/payments/checkout - Create Stripe checkout session for reservation
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await authenticate(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await validateBody(createCheckoutSchema)(req)
  if (!validation.valid) {
    return errorResponse('Invalid request data', 400, validation.errors)
  }

  const supabase = createClient()
  const { reservationId, returnUrl, cancelUrl } = validation.data

  // Get reservation details
  const { data: reservation, error: reservationError } = await supabase
    .from('reservations')
    .select(`
      *,
      field:fields (
        id,
        name,
        type,
        hourly_rate
      )
    `)
    .eq('id', reservationId)
    .eq('user_id', auth.user.id)
    .single()

  if (reservationError || !reservation) {
    return errorResponse('Reservation not found', 404)
  }

  if (reservation.status !== 'pending') {
    return errorResponse('Reservation is not pending payment', 400)
  }

  // Calculate duration and amount
  const startTime = new Date(`2000-01-01T${reservation.start_time}`)
  const endTime = new Date(`2000-01-01T${reservation.end_time}`)
  const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
  const amount = durationHours * reservation.field.hourly_rate

  // Check if payment already exists
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id, status')
    .eq('reservation_id', reservationId)
    .single()

  if (existingPayment && existingPayment.status === 'completed') {
    return errorResponse('Payment already completed for this reservation', 400)
  }

  // Create or update payment record
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .upsert({
      id: existingPayment?.id,
      user_id: auth.user.id,
      league_id: auth.user.profile?.league_id,
      reservation_id: reservationId,
      amount,
      currency: 'usd',
      status: 'pending',
      description: `${reservation.field.name} - ${reservation.date} ${reservation.start_time}-${reservation.end_time}`,
    })
    .select()
    .single()

  if (paymentError) {
    return errorResponse('Failed to create payment record', 500, paymentError)
  }

  try {
    // Create Stripe checkout session
    const session = await createFieldReservationCheckout({
      reservationId: reservation.id,
      userId: auth.user.id,
      userEmail: auth.user.email!,
      amount,
      fieldName: reservation.field.name,
      date: reservation.date,
      startTime: reservation.start_time,
      endTime: reservation.end_time,
      successUrl: returnUrl,
      cancelUrl: cancelUrl,
    })

    // Update payment with Stripe session ID
    await supabase
      .from('payments')
      .update({
        metadata: {
          stripe_checkout_session_id: session.id,
        },
      })
      .eq('id', payment.id)

    return successResponse({
      checkoutUrl: session.url,
      sessionId: session.id,
    })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    
    // Update payment status to failed
    await supabase
      .from('payments')
      .update({ status: 'failed' })
      .eq('id', payment.id)

    return errorResponse('Failed to create checkout session', 500, error)
  }
})