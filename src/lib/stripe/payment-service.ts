import { stripe, calculateBookingFees, TAX_CONFIG } from './client'
import { createClient } from '@/lib/supabase/server'
import { CustomerService } from './customer-service'
import Stripe from 'stripe'
import { PaymentType, PaymentStatus, CustomerAddress } from '@/types/payment'

export class PaymentService {
  private supabase = createClient()
  private customerService = new CustomerService()

  /**
   * Create payment for field reservation
   */
  async createFieldReservationPayment({
    reservationId,
    userId,
    leagueId,
    amount,
    currency = 'usd',
    description,
    customerAddress,
    savePaymentMethod = false,
    paymentMethodId,
  }: {
    reservationId: string
    userId: string
    leagueId: string
    amount: number // Base amount in cents
    currency?: string
    description?: string
    customerAddress?: CustomerAddress
    savePaymentMethod?: boolean
    paymentMethodId?: string
  }) {
    try {
      // Get or create customer
      const customer = await this.customerService.getOrCreateCustomer({
        userId,
        leagueId,
        address: customerAddress,
      })

      // Calculate fees and taxes
      const feeCalculation = calculateBookingFees(amount)
      const totalAmount = feeCalculation.totalAmount

      // Get reservation details for description
      const { data: reservation } = await this.supabase
        .from('reservations')
        .select(`
          *,
          fields (name),
          user_profiles (full_name, email)
        `)
        .eq('id', reservationId)
        .single()

      if (!reservation) {
        throw new Error('Reservation not found')
      }

      const paymentDescription = description || 
        `${reservation.fields.name} reservation for ${reservation.date} ${reservation.start_time}-${reservation.end_time}`

      // Create payment record in database first
      const { data: payment, error: paymentError } = await this.supabase
        .from('payments')
        .insert({
          user_id: userId,
          league_id: leagueId,
          reservation_id: reservationId,
          type: 'field_reservation',
          amount: amount / 100, // Convert to dollars for database
          currency: currency.toUpperCase(),
          status: 'pending',
          description: paymentDescription,
          stripe_customer_id: customer.stripeCustomerId,
          processing_fee: feeCalculation.processingFee / 100, // Convert to dollars
          metadata: {
            baseAmount: amount,
            processingFee: feeCalculation.processingFee,
            totalAmount: totalAmount,
          },
        })
        .select()
        .single()

      if (paymentError) {
        throw paymentError
      }

      // Prepare payment intent parameters
      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: totalAmount,
        currency,
        customer: customer.stripeCustomerId,
        description: paymentDescription,
        metadata: {
          paymentId: payment.id,
          reservationId,
          userId,
          leagueId,
          type: 'field_reservation',
        },
        receipt_email: reservation.user_profiles.email,
        setup_future_usage: savePaymentMethod ? 'off_session' : undefined,
      }

      // Add payment method if provided
      if (paymentMethodId) {
        paymentIntentParams.payment_method = paymentMethodId
        paymentIntentParams.confirm = true
        paymentIntentParams.return_url = `${process.env.NEXT_PUBLIC_APP_URL}/booking/success?reservation_id=${reservationId}`
      }

      // Enable automatic tax calculation if configured
      if (TAX_CONFIG.enabled && customerAddress) {
        paymentIntentParams.automatic_tax = {
          enabled: true,
        }
        paymentIntentParams.shipping = {
          address: {
            line1: customerAddress.line1 || '',
            line2: customerAddress.line2,
            city: customerAddress.city || '',
            state: customerAddress.state,
            postal_code: customerAddress.postalCode || '',
            country: customerAddress.country,
          },
          name: reservation.user_profiles.full_name || 'Customer',
        }
      }

      // Create payment intent in Stripe
      const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams)

      // Update payment record with Stripe payment intent ID
      const { data: updatedPayment, error: updateError } = await this.supabase
        .from('payments')
        .update({
          stripe_payment_intent_id: paymentIntent.id,
          status: paymentIntent.status as PaymentStatus,
          tax_amount: paymentIntent.automatic_tax?.amount ? paymentIntent.automatic_tax.amount / 100 : 0,
        })
        .eq('id', payment.id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      return {
        payment: updatedPayment,
        paymentIntent,
        clientSecret: paymentIntent.client_secret,
      }
    } catch (error) {
      console.error('Error creating field reservation payment:', error)
      throw error
    }
  }

  /**
   * Create Stripe checkout session for field reservation
   */
  async createCheckoutSession({
    reservationId,
    userId,
    leagueId,
    amount,
    currency = 'usd',
    successUrl,
    cancelUrl,
    customerAddress,
    collectTaxIds = false,
  }: {
    reservationId: string
    userId: string
    leagueId: string
    amount: number
    currency?: string
    successUrl: string
    cancelUrl: string
    customerAddress?: CustomerAddress
    collectTaxIds?: boolean
  }) {
    try {
      // Get or create customer
      const customer = await this.customerService.getOrCreateCustomer({
        userId,
        leagueId,
        address: customerAddress,
      })

      // Get reservation details
      const { data: reservation } = await this.supabase
        .from('reservations')
        .select(`
          *,
          fields (name, images),
          user_profiles (full_name, email)
        `)
        .eq('id', reservationId)
        .single()

      if (!reservation) {
        throw new Error('Reservation not found')
      }

      // Calculate fees
      const feeCalculation = calculateBookingFees(amount)

      // Create payment record in database
      const { data: payment, error: paymentError } = await this.supabase
        .from('payments')
        .insert({
          user_id: userId,
          league_id: leagueId,
          reservation_id: reservationId,
          type: 'field_reservation',
          amount: amount / 100, // Convert to dollars
          currency: currency.toUpperCase(),
          status: 'pending',
          description: `${reservation.fields.name} reservation`,
          stripe_customer_id: customer.stripeCustomerId,
          processing_fee: feeCalculation.processingFee / 100,
          metadata: {
            baseAmount: amount,
            processingFee: feeCalculation.processingFee,
            totalAmount: feeCalculation.totalAmount,
          },
        })
        .select()
        .single()

      if (paymentError) {
        throw paymentError
      }

      // Prepare line items
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        {
          price_data: {
            currency,
            product_data: {
              name: `${reservation.fields.name} Reservation`,
              description: `${reservation.date} from ${reservation.start_time} to ${reservation.end_time}`,
              images: reservation.fields.images?.slice(0, 1) || [],
            },
            unit_amount: amount,
            tax_behavior: 'exclusive',
          },
          quantity: 1,
        },
      ]

      // Add booking fee as separate line item
      if (feeCalculation.processingFee > 0) {
        lineItems.push({
          price_data: {
            currency,
            product_data: {
              name: 'Booking Fee',
              description: 'Processing and platform fee',
            },
            unit_amount: feeCalculation.processingFee,
            tax_behavior: 'exclusive',
          },
          quantity: 1,
        })
      }

      // Create checkout session
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: customer.stripeCustomerId,
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
        metadata: {
          paymentId: payment.id,
          reservationId,
          userId,
          leagueId,
          type: 'field_reservation',
        },
        payment_intent_data: {
          metadata: {
            paymentId: payment.id,
            reservationId,
            userId,
            leagueId,
            type: 'field_reservation',
          },
          receipt_email: reservation.user_profiles.email,
        },
        invoice_creation: {
          enabled: true,
          invoice_data: {
            description: `${reservation.fields.name} reservation`,
            metadata: {
              reservationId,
              userId,
              leagueId,
            },
            footer: 'Thank you for your reservation!',
          },
        },
      }

      // Enable automatic tax if configured
      if (TAX_CONFIG.enabled) {
        sessionParams.automatic_tax = {
          enabled: true,
        }
      }

      // Collect tax IDs if requested
      if (collectTaxIds && TAX_CONFIG.taxIdCollection.enabled) {
        sessionParams.tax_id_collection = {
          enabled: true,
          required: TAX_CONFIG.taxIdCollection.required,
        }
      }

      const session = await stripe.checkout.sessions.create(sessionParams)

      // Update payment record with session ID
      await this.supabase
        .from('payments')
        .update({
          metadata: {
            ...payment.metadata,
            stripeSessionId: session.id,
          },
        })
        .eq('id', payment.id)

      return {
        payment,
        session,
        url: session.url,
      }
    } catch (error) {
      console.error('Error creating checkout session:', error)
      throw error
    }
  }

  /**
   * Process one-time payment
   */
  async processOneTimePayment({
    userId,
    leagueId,
    amount,
    currency = 'usd',
    description,
    paymentMethodId,
    customerAddress,
    metadata = {},
  }: {
    userId: string
    leagueId: string
    amount: number
    currency?: string
    description: string
    paymentMethodId: string
    customerAddress?: CustomerAddress
    metadata?: Record<string, any>
  }) {
    try {
      // Get or create customer
      const customer = await this.customerService.getOrCreateCustomer({
        userId,
        leagueId,
        address: customerAddress,
      })

      // Create payment record
      const { data: payment, error: paymentError } = await this.supabase
        .from('payments')
        .insert({
          user_id: userId,
          league_id: leagueId,
          type: 'one_time',
          amount: amount / 100, // Convert to dollars
          currency: currency.toUpperCase(),
          status: 'pending',
          description,
          stripe_customer_id: customer.stripeCustomerId,
          metadata,
        })
        .select()
        .single()

      if (paymentError) {
        throw paymentError
      }

      // Create and confirm payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        customer: customer.stripeCustomerId,
        payment_method: paymentMethodId,
        description,
        confirm: true,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/payments/success`,
        metadata: {
          paymentId: payment.id,
          userId,
          leagueId,
          type: 'one_time',
          ...metadata,
        },
        automatic_tax: TAX_CONFIG.enabled ? { enabled: true } : undefined,
      })

      // Update payment record
      const { data: updatedPayment, error: updateError } = await this.supabase
        .from('payments')
        .update({
          stripe_payment_intent_id: paymentIntent.id,
          status: paymentIntent.status as PaymentStatus,
          paid_at: paymentIntent.status === 'succeeded' ? new Date().toISOString() : null,
          tax_amount: paymentIntent.automatic_tax?.amount ? paymentIntent.automatic_tax.amount / 100 : 0,
        })
        .eq('id', payment.id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      return {
        payment: updatedPayment,
        paymentIntent,
      }
    } catch (error) {
      console.error('Error processing one-time payment:', error)
      throw error
    }
  }

  /**
   * Get payment by ID
   */
  async getPayment(paymentId: string) {
    try {
      const { data: payment, error } = await this.supabase
        .from('payments')
        .select(`
          *,
          customers (*),
          reservations (
            *,
            fields (name),
            user_profiles (full_name, email)
          )
        `)
        .eq('id', paymentId)
        .single()

      if (error) {
        throw error
      }

      return payment
    } catch (error) {
      console.error('Error getting payment:', error)
      throw error
    }
  }

  /**
   * Get payments for a league
   */
  async getLeaguePayments({
    leagueId,
    limit = 50,
    offset = 0,
    status,
    type,
  }: {
    leagueId: string
    limit?: number
    offset?: number
    status?: PaymentStatus
    type?: PaymentType
  }) {
    try {
      let query = this.supabase
        .from('payments')
        .select(`
          *,
          customers (*),
          reservations (
            *,
            fields (name),
            user_profiles (full_name, email)
          )
        `)
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (status) {
        query = query.eq('status', status)
      }

      if (type) {
        query = query.eq('type', type)
      }

      const { data: payments, error } = await query

      if (error) {
        throw error
      }

      return payments
    } catch (error) {
      console.error('Error getting league payments:', error)
      throw error
    }
  }

  /**
   * Get payment summary for league
   */
  async getPaymentSummary(leagueId: string, period = '30d') {
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

      const { data: payments, error } = await this.supabase
        .from('payments')
        .select('*')
        .eq('league_id', leagueId)
        .gte('created_at', startDate.toISOString())

      if (error) {
        throw error
      }

      const summary = {
        totalRevenue: 0,
        monthlyRevenue: 0,
        pendingPayments: 0,
        refundedAmount: 0,
        transactionCount: payments.length,
        averageTransactionValue: 0,
        successfulPayments: 0,
        failedPayments: 0,
      }

      for (const payment of payments) {
        const amount = payment.amount || 0
        
        switch (payment.status) {
          case 'completed':
          case 'succeeded':
            summary.totalRevenue += amount
            summary.successfulPayments++
            break
          case 'pending':
          case 'processing':
            summary.pendingPayments += amount
            break
          case 'refunded':
          case 'partial_refund':
            summary.refundedAmount += amount
            break
          case 'failed':
          case 'cancelled':
            summary.failedPayments++
            break
        }
      }

      // Calculate monthly revenue (last 30 days)
      const monthStartDate = new Date()
      monthStartDate.setDate(monthStartDate.getDate() - 30)
      
      const monthlyPayments = payments.filter(
        p => new Date(p.created_at) >= monthStartDate && 
             ['completed', 'succeeded'].includes(p.status)
      )
      
      summary.monthlyRevenue = monthlyPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
      summary.averageTransactionValue = summary.successfulPayments > 0 
        ? summary.totalRevenue / summary.successfulPayments 
        : 0

      return summary
    } catch (error) {
      console.error('Error getting payment summary:', error)
      throw error
    }
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus({
    paymentId,
    status,
    paidAt,
    failedAt,
    metadata,
  }: {
    paymentId: string
    status: PaymentStatus
    paidAt?: string
    failedAt?: string
    metadata?: Record<string, any>
  }) {
    try {
      const updateData: any = { status }
      
      if (paidAt) updateData.paid_at = paidAt
      if (failedAt) updateData.failed_at = failedAt
      if (metadata) updateData.metadata = metadata

      const { data: payment, error } = await this.supabase
        .from('payments')
        .update(updateData)
        .eq('id', paymentId)
        .select()
        .single()

      if (error) {
        throw error
      }

      return payment
    } catch (error) {
      console.error('Error updating payment status:', error)
      throw error
    }
  }

  /**
   * Calculate tax for payment
   */
  async calculateTax({
    amount,
    currency = 'usd',
    customerAddress,
    lineItems = [],
  }: {
    amount: number
    currency?: string
    customerAddress: CustomerAddress
    lineItems?: Array<{
      amount: number
      reference?: string
      tax_behavior?: 'inclusive' | 'exclusive'
      tax_code?: string
    }>
  }) {
    try {
      if (!TAX_CONFIG.enabled) {
        return {
          amount_total: amount,
          tax_amount_exclusive: 0,
          tax_amount_inclusive: 0,
          line_items: lineItems.map(item => ({
            ...item,
            amount_tax: 0,
          })),
        }
      }

      const taxCalculation = await stripe.tax.calculations.create({
        currency,
        line_items: lineItems.length > 0 ? lineItems : [
          {
            amount,
            reference: 'default',
            tax_behavior: 'exclusive',
          },
        ],
        customer_details: {
          address: {
            line1: customerAddress.line1,
            line2: customerAddress.line2,
            city: customerAddress.city,
            state: customerAddress.state,
            postal_code: customerAddress.postalCode,
            country: customerAddress.country,
          },
          address_source: 'billing',
        },
      })

      return taxCalculation
    } catch (error) {
      console.error('Error calculating tax:', error)
      throw error
    }
  }
}