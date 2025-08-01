import { stripe, SUBSCRIPTION_CONFIG, TAX_CONFIG } from './client'
import { createClient } from '@/lib/supabase/server'
import { CustomerService } from './customer-service'
import { PaymentService } from './payment-service'
import { SubscriptionService } from './subscription-service'
import Stripe from 'stripe'
import { SubscriptionTier, CustomerAddress } from '@/types/payment'

export class CheckoutService {
  private supabase = createClient()
  private customerService = new CustomerService()
  private paymentService = new PaymentService()
  private subscriptionService = new SubscriptionService()

  /**
   * Create subscription checkout session
   */
  async createSubscriptionCheckout({
    userId,
    leagueId,
    tier,
    addOns = [],
    trialDays = 0,
    couponId,
    successUrl,
    cancelUrl,
    collectTaxIds = false,
    allowPromotions = true,
  }: {
    userId: string
    leagueId: string
    tier: SubscriptionTier
    addOns?: Array<{ id: string; quantity: number }>
    trialDays?: number
    couponId?: string
    successUrl: string
    cancelUrl: string
    collectTaxIds?: boolean
    allowPromotions?: boolean
  }) {
    try {
      if (tier === 'free') {
        throw new Error('Cannot create checkout for free tier')
      }

      // Get or create customer
      const customer = await this.customerService.getOrCreateCustomer({
        userId,
        leagueId,
      })

      const tierConfig = SUBSCRIPTION_CONFIG.tiers[tier]
      if (!tierConfig?.stripePriceId) {
        throw new Error(`Invalid subscription tier: ${tier}`)
      }

      // Prepare line items
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        {
          price: tierConfig.stripePriceId,
          quantity: 1,
        },
      ]

      // Add any add-ons
      for (const addOn of addOns) {
        const addOnConfig = SUBSCRIPTION_CONFIG.addOns[addOn.id as keyof typeof SUBSCRIPTION_CONFIG.addOns]
        if (addOnConfig?.stripePriceId) {
          lineItems.push({
            price: addOnConfig.stripePriceId,
            quantity: addOn.quantity,
          })
        }
      }

      // Get league info for branding
      const { data: league } = await this.supabase
        .from('leagues')
        .select('name, logo_url')
        .eq('id', leagueId)
        .single()

      // Create checkout session
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: customer.stripeCustomerId,
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
        metadata: {
          userId,
          leagueId,
          tier,
          type: 'subscription',
          addOns: JSON.stringify(addOns),
        },
        subscription_data: {
          metadata: {
            userId,
            leagueId,
            tier,
            type: 'subscription',
          },
          trial_period_days: trialDays > 0 ? trialDays : undefined,
        },
        allow_promotion_codes: allowPromotions,
        billing_address_collection: 'auto',
        invoice_creation: {
          enabled: true,
          invoice_data: {
            description: `${tierConfig.name} subscription${league ? ` for ${league.name}` : ''}`,
            metadata: {
              userId,
              leagueId,
              tier,
            },
          },
        },
      }

      // Add coupon if provided
      if (couponId) {
        sessionParams.discounts = [{ coupon: couponId }]
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

      return {
        session,
        url: session.url,
      }
    } catch (error) {
      console.error('Error creating subscription checkout:', error)
      throw error
    }
  }

  /**
   * Create payment checkout session for field reservation
   */
  async createReservationCheckout({
    reservationId,
    userId,
    leagueId,
    successUrl,
    cancelUrl,
    customerAddress,
    collectTaxIds = false,
  }: {
    reservationId: string
    userId: string
    leagueId: string
    successUrl: string
    cancelUrl: string
    customerAddress?: CustomerAddress
    collectTaxIds?: boolean
  }) {
    try {
      // Get reservation details with pricing
      const { data: reservation } = await this.supabase
        .from('reservations')
        .select(`
          *,
          fields (
            name,
            hourly_rate,
            images,
            league_id,
            leagues (name, logo_url)
          ),
          user_profiles (full_name, email)
        `)
        .eq('id', reservationId)
        .single()

      if (!reservation) {
        throw new Error('Reservation not found')
      }

      // Calculate duration in hours
      const startTime = new Date(`1970-01-01T${reservation.start_time}`)
      const endTime = new Date(`1970-01-01T${reservation.end_time}`)
      const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)

      // Calculate base amount (in cents)
      const baseAmount = Math.round((reservation.fields.hourly_rate || 0) * duration * 100)

      return await this.paymentService.createCheckoutSession({
        reservationId,
        userId,
        leagueId,
        amount: baseAmount,
        successUrl,
        cancelUrl,
        customerAddress,
        collectTaxIds,
      })
    } catch (error) {
      console.error('Error creating reservation checkout:', error)
      throw error
    }
  }

  /**
   * Create upgrade/downgrade checkout session
   */
  async createSubscriptionUpgradeCheckout({
    subscriptionId,
    newTier,
    successUrl,
    cancelUrl,
    prorationBehavior = 'create_prorations',
  }: {
    subscriptionId: string
    newTier: SubscriptionTier
    successUrl: string
    cancelUrl: string
    prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice'
  }) {
    try {
      // Get current subscription
      const subscription = await this.subscriptionService.getSubscription(subscriptionId)
      if (!subscription) {
        throw new Error('Subscription not found')
      }

      const customer = await this.customerService.getCustomer(subscription.customer_id)
      if (!customer) {
        throw new Error('Customer not found')
      }

      const newTierConfig = SUBSCRIPTION_CONFIG.tiers[newTier]
      if (!newTierConfig?.stripePriceId) {
        throw new Error(`Invalid subscription tier: ${newTier}`)
      }

      // Create checkout session for subscription modification
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: newTierConfig.stripePriceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: customer.stripeCustomerId,
        metadata: {
          subscriptionId,
          currentTier: subscription.tier,
          newTier,
          type: 'subscription_upgrade',
          prorationBehavior,
        },
        subscription_data: {
          metadata: {
            subscriptionId,
            currentTier: subscription.tier,
            newTier,
            type: 'subscription_upgrade',
          },
        },
        allow_promotion_codes: true,
        automatic_tax: TAX_CONFIG.enabled ? { enabled: true } : undefined,
      })

      return {
        session,
        url: session.url,
      }
    } catch (error) {
      console.error('Error creating subscription upgrade checkout:', error)
      throw error
    }
  }

  /**
   * Create add-on checkout session
   */
  async createAddOnCheckout({
    subscriptionId,
    addOns,
    successUrl,
    cancelUrl,
  }: {
    subscriptionId: string
    addOns: Array<{ id: string; quantity: number }>
    successUrl: string
    cancelUrl: string
  }) {
    try {
      const subscription = await this.subscriptionService.getSubscription(subscriptionId)
      if (!subscription) {
        throw new Error('Subscription not found')
      }

      const customer = await this.customerService.getCustomer(subscription.customer_id)
      if (!customer) {
        throw new Error('Customer not found')
      }

      // Prepare line items for add-ons
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []

      for (const addOn of addOns) {
        const addOnConfig = SUBSCRIPTION_CONFIG.addOns[addOn.id as keyof typeof SUBSCRIPTION_CONFIG.addOns]
        if (addOnConfig?.stripePriceId) {
          lineItems.push({
            price: addOnConfig.stripePriceId,
            quantity: addOn.quantity,
          })
        }
      }

      if (lineItems.length === 0) {
        throw new Error('No valid add-ons provided')
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: customer.stripeCustomerId,
        metadata: {
          subscriptionId,
          type: 'add_on_purchase',
          addOns: JSON.stringify(addOns),
        },
        subscription_data: {
          metadata: {
            subscriptionId,
            type: 'add_on_purchase',
          },
        },
        automatic_tax: TAX_CONFIG.enabled ? { enabled: true } : undefined,
      })

      return {
        session,
        url: session.url,
      }
    } catch (error) {
      console.error('Error creating add-on checkout:', error)
      throw error
    }
  }

  /**
   * Create custom payment checkout (one-time)
   */
  async createCustomPaymentCheckout({
    userId,
    leagueId,
    amount,
    currency = 'usd',
    description,
    successUrl,
    cancelUrl,
    metadata = {},
    collectTaxIds = false,
  }: {
    userId: string
    leagueId: string
    amount: number
    currency?: string
    description: string
    successUrl: string
    cancelUrl: string
    metadata?: Record<string, any>
    collectTaxIds?: boolean
  }) {
    try {
      const customer = await this.customerService.getOrCreateCustomer({
        userId,
        leagueId,
      })

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: description,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: customer.stripeCustomerId,
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
        metadata: {
          userId,
          leagueId,
          type: 'custom_payment',
          ...metadata,
        },
        payment_intent_data: {
          metadata: {
            userId,
            leagueId,
            type: 'custom_payment',
            ...metadata,
          },
        },
        automatic_tax: TAX_CONFIG.enabled ? { enabled: true } : undefined,
        tax_id_collection: collectTaxIds && TAX_CONFIG.taxIdCollection.enabled ? {
          enabled: true,
          required: TAX_CONFIG.taxIdCollection.required,
        } : undefined,
        invoice_creation: {
          enabled: true,
          invoice_data: {
            description,
            metadata: {
              userId,
              leagueId,
              ...metadata,
            },
          },
        },
      })

      return {
        session,
        url: session.url,
      }
    } catch (error) {
      console.error('Error creating custom payment checkout:', error)
      throw error
    }
  }

  /**
   * Get checkout session
   */
  async getCheckoutSession(sessionId: string) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items', 'payment_intent', 'subscription'],
      })

      return session
    } catch (error) {
      console.error('Error getting checkout session:', error)
      throw error
    }
  }

  /**
   * Complete checkout session (post-payment processing)
   */
  async completeCheckoutSession(sessionId: string) {
    try {
      const session = await this.getCheckoutSession(sessionId)
      
      if (!session.metadata) {
        throw new Error('Session metadata not found')
      }

      const { userId, leagueId, type } = session.metadata

      switch (type) {
        case 'subscription':
          await this.handleSubscriptionCompletion(session)
          break
        
        case 'field_reservation':
          await this.handleReservationCompletion(session)
          break
        
        case 'subscription_upgrade':
          await this.handleSubscriptionUpgradeCompletion(session)
          break
        
        case 'add_on_purchase':
          await this.handleAddOnCompletion(session)
          break
        
        case 'custom_payment':
          await this.handleCustomPaymentCompletion(session)
          break
        
        default:
          console.warn(`Unknown checkout session type: ${type}`)
      }

      return session
    } catch (error) {
      console.error('Error completing checkout session:', error)
      throw error
    }
  }

  private async handleSubscriptionCompletion(session: Stripe.Checkout.Session) {
    if (!session.subscription || !session.metadata) return

    const subscription = session.subscription as Stripe.Subscription
    const { userId, leagueId, tier } = session.metadata

    // Update league subscription status
    await this.supabase
      .from('leagues')
      .update({
        subscription_tier: tier,
        subscription_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
      })
      .eq('id', leagueId)

    // Send welcome notification
    await this.supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: 'email',
        title: 'Welcome to your new subscription!',
        content: `Your ${tier} subscription is now active.`,
        data: {
          subscriptionId: subscription.id,
          tier,
        },
      })
  }

  private async handleReservationCompletion(session: Stripe.Checkout.Session) {
    if (!session.payment_intent || !session.metadata) return

    const { reservationId } = session.metadata

    // Update reservation status
    await this.supabase
      .from('reservations')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', reservationId)
  }

  private async handleSubscriptionUpgradeCompletion(session: Stripe.Checkout.Session) {
    if (!session.subscription || !session.metadata) return

    const { subscriptionId, newTier } = session.metadata

    // The actual subscription update will be handled by webhooks
    // Just send notification here
    const subscription = await this.subscriptionService.getSubscription(subscriptionId)
    if (subscription) {
      await this.supabase
        .from('notifications')
        .insert({
          user_id: subscription.user_id,
          type: 'email',
          title: 'Subscription Updated',
          content: `Your subscription has been updated to ${newTier}.`,
          data: {
            subscriptionId,
            newTier,
          },
        })
    }
  }

  private async handleAddOnCompletion(session: Stripe.Checkout.Session) {
    if (!session.subscription || !session.metadata) return

    const { subscriptionId, addOns } = session.metadata
    const parsedAddOns = JSON.parse(addOns)

    const subscription = await this.subscriptionService.getSubscription(subscriptionId)
    if (subscription) {
      await this.supabase
        .from('notifications')
        .insert({
          user_id: subscription.user_id,
          type: 'email',
          title: 'Add-ons Activated',
          content: `Your subscription add-ons have been activated.`,
          data: {
            subscriptionId,
            addOns: parsedAddOns,
          },
        })
    }
  }

  private async handleCustomPaymentCompletion(session: Stripe.Checkout.Session) {
    if (!session.payment_intent || !session.metadata) return

    const { userId } = session.metadata

    await this.supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: 'email',
        title: 'Payment Successful',
        content: 'Your payment has been processed successfully.',
        data: {
          sessionId: session.id,
          paymentIntentId: session.payment_intent,
        },
      })
  }
}