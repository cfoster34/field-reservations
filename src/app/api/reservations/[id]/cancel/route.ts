import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  authenticate,
  validateBody,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { cancelReservationSchema } from '@/lib/api/validation'

interface RouteParams {
  params: {
    id: string
  }
}

// POST /api/reservations/[id]/cancel - Cancel reservation
export async function POST(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authenticate user
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    
    // Validate request body
    const validation = await validateBody(cancelReservationSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const reservationId = params.id
    const { reason } = validation.data
    const supabase = createClient()
    
    // Get reservation with payment info
    const { data: reservation } = await supabase
      .from('reservations')
      .select(`
        *,
        field:fields(id, name, league_id),
        payment:payments(id, amount, status, stripe_payment_intent_id)
      `)
      .eq('id', reservationId)
      .single()
    
    if (!reservation) {
      return errorResponse('Reservation not found', 404)
    }
    
    // Check permissions
    if (reservation.user_id !== auth.user.id && 
        auth.user.profile.role !== 'admin' && 
        auth.user.profile.role !== 'league_manager') {
      return errorResponse('Access denied', 403)
    }
    
    // Check if reservation can be cancelled
    if (reservation.status === 'cancelled') {
      return errorResponse('Reservation is already cancelled', 400)
    }
    
    if (reservation.status === 'completed') {
      return errorResponse('Cannot cancel completed reservation', 400)
    }
    
    // Get booking rules for refund policy
    const { data: bookingRules } = await supabase
      .from('booking_rules')
      .select('*')
      .eq('league_id', reservation.field.league_id)
      .or(`field_id.eq.${reservation.field_id},field_id.is.null`)
      .order('field_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single()
    
    const refundPolicy = bookingRules?.refund_policy || {
      fullRefundHours: 48,
      partialRefundHours: 24,
      partialRefundPercentage: 50,
      noRefundHours: 12
    }
    
    // Calculate refund based on policy
    const reservationDateTime = new Date(`${reservation.date}T${reservation.start_time}`)
    const now = new Date()
    const hoursUntilReservation = (reservationDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    
    let refundAmount = 0
    let refundPercentage = 0
    let refundReason = ''
    
    if (hoursUntilReservation >= refundPolicy.fullRefundHours) {
      // Full refund
      refundPercentage = 100
      refundAmount = reservation.payment?.amount || 0
      refundReason = `Full refund - cancelled ${Math.round(hoursUntilReservation)} hours before`
    } else if (hoursUntilReservation >= refundPolicy.partialRefundHours) {
      // Partial refund
      refundPercentage = refundPolicy.partialRefundPercentage
      refundAmount = (reservation.payment?.amount || 0) * (refundPercentage / 100)
      refundReason = `${refundPercentage}% refund - cancelled ${Math.round(hoursUntilReservation)} hours before`
    } else if (hoursUntilReservation >= refundPolicy.noRefundHours) {
      // No refund but within cancellation deadline
      refundReason = `No refund - cancelled less than ${refundPolicy.partialRefundHours} hours before`
    } else {
      // Check if within cancellation deadline
      const cancellationDeadline = bookingRules?.cancellation_deadline || 24
      if (hoursUntilReservation < cancellationDeadline) {
        return errorResponse(
          `Cannot cancel reservation less than ${cancellationDeadline} hours before start time`, 
          400
        )
      }
    }
    
    // Cancel reservation
    const { data: cancelledReservation, error } = await supabase
      .from('reservations')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: auth.user.id,
        cancellation_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId)
      .select()
      .single()
    
    if (error) {
      return errorResponse('Failed to cancel reservation', 400, error)
    }
    
    // Process refund if applicable
    if (refundAmount > 0 && reservation.payment?.stripe_payment_intent_id) {
      // TODO: Integrate with Stripe to process refund
      // For now, just update payment status
      await supabase
        .from('payments')
        .update({
          status: 'refunded',
          refunded_at: new Date().toISOString(),
          refund_reason: reason,
          metadata: {
            ...reservation.payment.metadata,
            refund_amount: refundAmount,
            refund_percentage: refundPercentage,
          },
        })
        .eq('id', reservation.payment.id)
    }
    
    // Process waitlist for the freed slot
    const { data: waitlistUser } = await supabase
      .rpc('process_waitlist_for_slot', {
        p_field_id: reservation.field_id,
        p_date: reservation.date,
        p_start_time: reservation.start_time,
        p_end_time: reservation.end_time,
      })
    
    // Send cancellation confirmation email
    await supabase
      .from('notifications')
      .insert({
        user_id: reservation.user_id,
        type: 'email',
        title: 'Reservation Cancelled',
        content: `Your reservation at ${reservation.field.name} on ${reservation.date} has been cancelled.${refundAmount > 0 ? ` A refund of $${refundAmount.toFixed(2)} will be processed.` : ''}`,
        data: {
          reservation_id: reservationId,
          field_name: reservation.field.name,
          date: reservation.date,
          refund_amount: refundAmount,
          refund_percentage: refundPercentage,
        },
      })
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        league_id: reservation.field.league_id,
        event_type: 'reservation_cancelled',
        event_data: {
          reservation_id: reservationId,
          field_id: reservation.field_id,
          field_name: reservation.field.name,
          date: reservation.date,
          hours_before: hoursUntilReservation,
          refund_amount: refundAmount,
          refund_percentage: refundPercentage,
          waitlist_notified: waitlistUser ? true : false,
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse({
      reservation: cancelledReservation,
      refund: {
        amount: refundAmount,
        percentage: refundPercentage,
        policy: hoursUntilReservation >= 24 ? 'full' : 
                 hoursUntilReservation >= 12 ? 'partial' : 'none',
      },
      waitlist_notified: waitlistUser ? true : false,
    })
  })(req, { params })
}