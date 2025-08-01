import { stripe } from './client'
import { createClient } from '@/lib/supabase/server'
import { PaymentService } from './payment-service'
import Stripe from 'stripe'
import { RefundReason } from '@/types/payment'

export class RefundService {
  private supabase = createClient()
  private paymentService = new PaymentService()

  /**
   * Create a refund for a payment
   */
  async createRefund({
    paymentId,
    amount,
    reason,
    notes,
    refundApplicationFee = false,
    reverseTransfer = false,
    metadata = {},
  }: {
    paymentId: string
    amount?: number // In cents, if not provided, full refund
    reason: RefundReason
    notes?: string
    refundApplicationFee?: boolean
    reverseTransfer?: boolean
    metadata?: Record<string, any>
  }) {
    try {
      // Get payment record
      const payment = await this.paymentService.getPayment(paymentId)
      if (!payment) {
        throw new Error('Payment not found')
      }

      if (!payment.stripe_payment_intent_id) {
        throw new Error('Payment does not have a Stripe payment intent')
      }

      // Check if payment can be refunded
      if (!['completed', 'succeeded'].includes(payment.status)) {
        throw new Error('Payment cannot be refunded in its current state')
      }

      // Get the payment intent to get the charge
      const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id)
      
      if (!paymentIntent.latest_charge) {
        throw new Error('No charge found for this payment')
      }

      // Calculate refund amount
      const maxRefundAmount = payment.amount * 100 // Convert to cents
      const refundAmount = amount ? Math.min(amount, maxRefundAmount) : maxRefundAmount

      // Create refund in Stripe
      const refundParams: Stripe.RefundCreateParams = {
        charge: paymentIntent.latest_charge as string,
        amount: refundAmount,
        reason: this.mapRefundReason(reason),
        metadata: {
          paymentId,
          reason,
          notes: notes || '',
          ...metadata,
        },
      }

      if (refundApplicationFee) {
        refundParams.refund_application_fee = true
      }

      if (reverseTransfer) {
        refundParams.reverse_transfer = true
      }

      const stripeRefund = await stripe.refunds.create(refundParams)

      // Create refund record in database
      const { data: refund, error } = await this.supabase
        .from('refunds')
        .insert({
          payment_id: paymentId,
          stripe_refund_id: stripeRefund.id,
          amount: refundAmount / 100, // Convert back to dollars
          currency: stripeRefund.currency.toUpperCase(),
          reason,
          status: stripeRefund.status,
          notes,
          metadata: {
            stripeChargeId: paymentIntent.latest_charge,
            refundApplicationFee,
            reverseTransfer,
            ...metadata,
          },
        })
        .select()
        .single()

      if (error) {
        // If database insert fails, try to cancel the Stripe refund
        try {
          await stripe.refunds.cancel(stripeRefund.id)
        } catch (cancelError) {
          console.error('Failed to cancel Stripe refund after database error:', cancelError)
        }
        throw error
      }

      // Update payment status
      const isFullRefund = refundAmount >= maxRefundAmount
      await this.paymentService.updatePaymentStatus({
        paymentId,
        status: isFullRefund ? 'refunded' : 'partial_refund',
        metadata: {
          ...payment.metadata,
          refunded: true,
          refundAmount: refundAmount / 100,
          refundReason: reason,
        },
      })

      // Handle specific refund scenarios
      await this.handleRefundSideEffects(payment, refund, isFullRefund)

      // Send refund notification
      await this.sendRefundNotification(payment, refund)

      return {
        refund,
        stripeRefund,
      }
    } catch (error) {
      console.error('Error creating refund:', error)
      throw error
    }
  }

  /**
   * Get refund by ID
   */
  async getRefund(refundId: string) {
    try {
      const { data: refund, error } = await this.supabase
        .from('refunds')
        .select(`
          *,
          payments (
            *,
            customers (*),
            reservations (
              *,
              fields (name),
              user_profiles (full_name, email)
            )
          )
        `)
        .eq('id', refundId)
        .single()

      if (error) {
        throw error
      }

      return refund
    } catch (error) {
      console.error('Error getting refund:', error)
      throw error
    }
  }

  /**
   * Get refunds for a payment
   */
  async getPaymentRefunds(paymentId: string) {
    try {
      const { data: refunds, error } = await this.supabase
        .from('refunds')
        .select('*')
        .eq('payment_id', paymentId)
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      return refunds
    } catch (error) {
      console.error('Error getting payment refunds:', error)
      throw error
    }
  }

  /**
   * Get refunds for a league
   */
  async getLeagueRefunds({
    leagueId,
    limit = 50,
    offset = 0,
    status,
  }: {
    leagueId: string
    limit?: number
    offset?: number
    status?: string
  }) {
    try {
      let query = this.supabase
        .from('refunds')
        .select(`
          *,
          payments!inner (
            *,
            customers (*),
            reservations (
              *,
              fields (name),
              user_profiles (full_name, email)
            )
          )
        `)
        .eq('payments.league_id', leagueId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (status) {
        query = query.eq('status', status)
      }

      const { data: refunds, error } = await query

      if (error) {
        throw error
      }

      return refunds
    } catch (error) {
      console.error('Error getting league refunds:', error)
      throw error
    }
  }

  /**
   * Process automatic refund for cancelled reservation
   */
  async processReservationCancellationRefund({
    reservationId,
    reason = RefundReason.CANCELLATION,
    refundPolicy = 'full', // 'full', 'partial', 'none'
    partialRefundPercentage = 50,
  }: {
    reservationId: string
    reason?: RefundReason
    refundPolicy?: 'full' | 'partial' | 'none'
    partialRefundPercentage?: number
  }) {
    try {
      if (refundPolicy === 'none') {
        return null
      }

      // Get reservation and associated payment
      const { data: reservation } = await this.supabase
        .from('reservations')
        .select(`
          *,
          fields (name, league_id),
          payments (*)
        `)
        .eq('id', reservationId)
        .single()

      if (!reservation) {
        throw new Error('Reservation not found')
      }

      const payment = reservation.payments?.[0]
      if (!payment || !['completed', 'succeeded'].includes(payment.status)) {
        return null // No refundable payment found
      }

      // Calculate refund amount based on policy
      let refundAmount: number | undefined
      if (refundPolicy === 'partial') {
        refundAmount = Math.round((payment.amount * 100 * partialRefundPercentage) / 100)
      } // For 'full', leave refundAmount undefined for full refund

      // Calculate refund based on time until reservation
      const reservationDateTime = new Date(`${reservation.date}T${reservation.start_time}`)
      const timeUntilReservation = reservationDateTime.getTime() - Date.now()
      const hoursUntilReservation = timeUntilReservation / (1000 * 60 * 60)

      // Apply time-based refund policy
      if (hoursUntilReservation < 2) {
        // Less than 2 hours: no refund
        return null
      } else if (hoursUntilReservation < 24) {
        // Less than 24 hours: 50% refund
        refundAmount = Math.round((payment.amount * 100 * 50) / 100)
      } else if (hoursUntilReservation < 48) {
        // Less than 48 hours: 75% refund
        refundAmount = Math.round((payment.amount * 100 * 75) / 100)
      }
      // More than 48 hours: full refund (refundAmount remains undefined)

      return await this.createRefund({
        paymentId: payment.id,
        amount: refundAmount,
        reason,
        notes: `Automatic refund for cancelled reservation: ${reservation.fields.name}`,
        metadata: {
          reservationId,
          automaticRefund: true,
          hoursUntilReservation: Math.round(hoursUntilReservation),
        },
      })
    } catch (error) {
      console.error('Error processing reservation cancellation refund:', error)
      throw error
    }
  }

  /**
   * Get refund statistics for a league
   */
  async getRefundStats(leagueId: string, period = '30d') {
    try {
      const startDate = new Date()
      switch (period) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7)
          break
        case '30d':
          startDate.setDate(startDate.getDate() - 30)
          break
        case '90d':
          startDate.setDate(startDate.getDate() - 90)
          break
        case '1y':
          startDate.setFullYear(startDate.getFullYear() - 1)
          break
      }

      const { data: refunds, error } = await this.supabase
        .from('refunds')
        .select(`
          *,
          payments!inner (league_id)
        `)
        .eq('payments.league_id', leagueId)
        .gte('created_at', startDate.toISOString())

      if (error) {
        throw error
      }

      const stats = {
        totalRefunds: refunds.length,
        totalRefundAmount: 0,
        averageRefundAmount: 0,
        refundsByReason: {} as Record<string, number>,
        refundsByStatus: {} as Record<string, number>,
        refundRate: 0, // Will be calculated with total payments
      }

      for (const refund of refunds) {
        stats.totalRefundAmount += refund.amount || 0
        
        stats.refundsByReason[refund.reason] = (stats.refundsByReason[refund.reason] || 0) + 1
        stats.refundsByStatus[refund.status] = (stats.refundsByStatus[refund.status] || 0) + 1
      }

      stats.averageRefundAmount = stats.totalRefunds > 0 
        ? stats.totalRefundAmount / stats.totalRefunds 
        : 0

      // Calculate refund rate
      const { data: payments } = await this.supabase
        .from('payments')
        .select('id')
        .eq('league_id', leagueId)
        .gte('created_at', startDate.toISOString())
        .in('status', ['completed', 'succeeded'])

      if (payments) {
        stats.refundRate = payments.length > 0 
          ? (stats.totalRefunds / payments.length) * 100 
          : 0
      }

      return stats
    } catch (error) {
      console.error('Error getting refund stats:', error)
      throw error
    }
  }

  /**
   * Update refund status (internal use)
   */
  async updateRefundStatus({
    refundId,
    status,
    failureReason,
    metadata,
  }: {
    refundId: string
    status: 'pending' | 'succeeded' | 'failed' | 'cancelled'
    failureReason?: string
    metadata?: Record<string, any>
  }) {
    try {
      const updateData: any = { status }
      
      if (failureReason) updateData.failure_reason = failureReason
      if (metadata) updateData.metadata = metadata

      const { data: refund, error } = await this.supabase
        .from('refunds')
        .update(updateData)
        .eq('id', refundId)
        .select()
        .single()

      if (error) {
        throw error
      }

      return refund
    } catch (error) {
      console.error('Error updating refund status:', error)
      throw error
    }
  }

  private mapRefundReason(reason: RefundReason): Stripe.RefundCreateParams.Reason {
    switch (reason) {
      case RefundReason.DUPLICATE:
        return 'duplicate'
      case RefundReason.FRAUDULENT:
        return 'fraudulent'
      case RefundReason.REQUESTED_BY_CUSTOMER:
      case RefundReason.CANCELLATION:
      case RefundReason.WEATHER:
      case RefundReason.FIELD_ISSUE:
      case RefundReason.SERVICE_NOT_PROVIDED:
      case RefundReason.BILLING_ERROR:
      case RefundReason.OTHER:
      default:
        return 'requested_by_customer'
    }
  }

  private async handleRefundSideEffects(payment: any, refund: any, isFullRefund: boolean) {
    // Handle reservation cancellation if applicable
    if (payment.type === 'field_reservation' && payment.reservation_id && isFullRefund) {
      await this.supabase
        .from('reservations')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'Refunded',
        })
        .eq('id', payment.reservation_id)
    }

    // Record analytics event
    await this.supabase
      .from('analytics_events')
      .insert({
        league_id: payment.league_id,
        user_id: payment.user_id,
        event_type: 'refund_processed',
        event_data: {
          refundId: refund.id,
          paymentId: payment.id,
          amount: refund.amount,
          reason: refund.reason,
          isFullRefund,
        },
      })
  }

  private async sendRefundNotification(payment: any, refund: any) {
    await this.supabase
      .from('notifications')
      .insert({
        user_id: payment.user_id,
        type: 'email',
        title: 'Refund Processed',
        content: `Your refund of ${this.formatAmount(refund.amount * 100)} has been processed and will appear in your account within 5-10 business days.`,
        data: {
          refundId: refund.id,
          paymentId: payment.id,
          amount: refund.amount,
          reason: refund.reason,
          estimatedArrival: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days
        },
      })
  }

  private formatAmount(amountInCents: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amountInCents / 100)
  }
}