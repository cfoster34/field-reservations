import { stripe, SUBSCRIPTION_CONFIG, getSubscriptionTier, calculateProration } from './client'
import { createClient } from '@/lib/supabase/server'
import { CustomerService } from './customer-service'
import Stripe from 'stripe'
import { SubscriptionTier, SubscriptionStatus } from '@/types/payment'

export class SubscriptionService {
  private supabase = createClient()
  private customerService = new CustomerService()

  /**
   * Create a new subscription for a league
   */
  async createSubscription({
    leagueId,
    userId,
    tier,
    paymentMethodId,
    trialDays = 0,
    addOns = [],
    couponId,
  }: {
    leagueId: string
    userId: string
    tier: SubscriptionTier
    paymentMethodId?: string
    trialDays?: number
    addOns?: Array<{ id: string; quantity: number }>
    couponId?: string
  }) {
    try {
      // Get or create customer
      const customer = await this.customerService.getOrCreateCustomer({
        userId,
        leagueId,
      })

      const tierConfig = getSubscriptionTier(tier)
      if (!tierConfig || tier === 'free') {
        throw new Error(`Invalid subscription tier: ${tier}`)
      }

      // Prepare subscription items
      const subscriptionItems: Stripe.SubscriptionCreateParams.Item[] = [
        {
          price: tierConfig.stripePriceId,
          quantity: 1,
        },
      ]

      // Add any add-ons
      for (const addOn of addOns) {
        const addOnConfig = SUBSCRIPTION_CONFIG.addOns[addOn.id as keyof typeof SUBSCRIPTION_CONFIG.addOns]
        if (addOnConfig?.stripePriceId) {
          subscriptionItems.push({
            price: addOnConfig.stripePriceId,
            quantity: addOn.quantity,
          })
        }
      }

      // Create subscription in Stripe
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: customer.stripeCustomerId,
        items: subscriptionItems,
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          leagueId,
          userId,
          tier,
        },
        automatic_tax: {
          enabled: true,
        },
      }

      if (paymentMethodId) {
        subscriptionParams.default_payment_method = paymentMethodId
      }

      if (trialDays > 0) {
        subscriptionParams.trial_period_days = trialDays
      }

      if (couponId) {
        subscriptionParams.coupon = couponId
      }

      const stripeSubscription = await stripe.subscriptions.create(subscriptionParams)

      // Save subscription to database
      const { data: subscription, error } = await this.supabase
        .from('subscriptions')
        .insert({
          league_id: leagueId,
          user_id: userId,
          customer_id: customer.id,
          tier,
          status: stripeSubscription.status as SubscriptionStatus,
          stripe_subscription_id: stripeSubscription.id,
          stripe_customer_id: customer.stripeCustomerId,
          stripe_price_id: tierConfig.stripePriceId,
          current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
          trial_start: stripeSubscription.trial_start 
            ? new Date(stripeSubscription.trial_start * 1000).toISOString() 
            : null,
          trial_end: stripeSubscription.trial_end 
            ? new Date(stripeSubscription.trial_end * 1000).toISOString() 
            : null,
          metadata: {
            addOns,
            couponId,
          },
        })
        .select()
        .single()

      if (error) {
        // Cleanup Stripe subscription if database insert fails
        await stripe.subscriptions.cancel(stripeSubscription.id)
        throw error
      }

      // Save add-ons
      if (addOns.length > 0) {
        const addOnInserts = addOns.map(addOn => {
          const addOnConfig = SUBSCRIPTION_CONFIG.addOns[addOn.id as keyof typeof SUBSCRIPTION_CONFIG.addOns]
          return {
            subscription_id: subscription.id,
            add_on_id: addOn.id,
            stripe_price_id: addOnConfig.stripePriceId!,
            quantity: addOn.quantity,
            unit_amount: addOnConfig.price,
          }
        })

        await this.supabase
          .from('subscription_add_ons')
          .insert(addOnInserts)
      }

      // Update league subscription info
      await this.supabase
        .from('leagues')
        .update({
          subscription_tier: tier,
          subscription_expires_at: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
        })
        .eq('id', leagueId)

      return {
        subscription,
        stripeSubscription,
        clientSecret: stripeSubscription.latest_invoice?.payment_intent?.client_secret,
      }
    } catch (error) {
      console.error('Error creating subscription:', error)
      throw error
    }
  }

  /**
   * Update subscription tier (upgrade/downgrade)
   */
  async updateSubscriptionTier({
    subscriptionId,
    newTier,
    prorationBehavior = 'create_prorations',
  }: {
    subscriptionId: string
    newTier: SubscriptionTier
    prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice'
  }) {
    try {
      // Get current subscription
      const { data: subscription, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single()

      if (error || !subscription) {
        throw new Error('Subscription not found')
      }

      if (newTier === 'free') {
        return await this.cancelSubscription(subscriptionId)
      }

      const newTierConfig = getSubscriptionTier(newTier)
      if (!newTierConfig) {
        throw new Error(`Invalid subscription tier: ${newTier}`)
      }

      // Get Stripe subscription
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id)

      // Update subscription in Stripe
      const updatedStripeSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        {
          items: [
            {
              id: stripeSubscription.items.data[0].id,
              price: newTierConfig.stripePriceId,
              quantity: 1,
            },
          ],
          proration_behavior: prorationBehavior,
          metadata: {
            ...stripeSubscription.metadata,
            tier: newTier,
          },
        }
      )

      // Update subscription in database
      const { data: updatedSubscription, error: updateError } = await this.supabase
        .from('subscriptions')
        .update({
          tier: newTier,
          stripe_price_id: newTierConfig.stripePriceId,
          current_period_start: new Date(updatedStripeSubscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(updatedStripeSubscription.current_period_end * 1000).toISOString(),
        })
        .eq('id', subscriptionId)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      // Update league subscription info
      await this.supabase
        .from('leagues')
        .update({
          subscription_tier: newTier,
          subscription_expires_at: new Date(updatedStripeSubscription.current_period_end * 1000).toISOString(),
        })
        .eq('id', subscription.league_id)

      return updatedSubscription
    } catch (error) {
      console.error('Error updating subscription tier:', error)
      throw error
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, immediately = false) {
    try {
      const { data: subscription, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single()

      if (error || !subscription) {
        throw new Error('Subscription not found')
      }

      let cancelledStripeSubscription: Stripe.Subscription

      if (immediately) {
        cancelledStripeSubscription = await stripe.subscriptions.cancel(subscription.stripe_subscription_id)
      } else {
        cancelledStripeSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true,
        })
      }

      // Update subscription in database
      const updateData: any = {
        cancel_at_period_end: !immediately,
        status: cancelledStripeSubscription.status as SubscriptionStatus,
      }

      if (immediately) {
        updateData.cancelled_at = new Date().toISOString()
      }

      const { data: updatedSubscription, error: updateError } = await this.supabase
        .from('subscriptions')
        .update(updateData)
        .eq('id', subscriptionId)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      // If cancelled immediately, update league to free tier
      if (immediately) {
        await this.supabase
          .from('leagues')
          .update({
            subscription_tier: 'free',
            subscription_expires_at: new Date(cancelledStripeSubscription.current_period_end * 1000).toISOString(),
          })
          .eq('id', subscription.league_id)
      }

      return updatedSubscription
    } catch (error) {
      console.error('Error cancelling subscription:', error)
      throw error
    }
  }

  /**
   * Reactivate a cancelled subscription
   */
  async reactivateSubscription(subscriptionId: string) {
    try {
      const { data: subscription, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single()

      if (error || !subscription) {
        throw new Error('Subscription not found')
      }

      const reactivatedStripeSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        {
          cancel_at_period_end: false,
        }
      )

      // Update subscription in database
      const { data: updatedSubscription, error: updateError } = await this.supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: false,
          status: reactivatedStripeSubscription.status as SubscriptionStatus,
        })
        .eq('id', subscriptionId)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      return updatedSubscription
    } catch (error) {
      console.error('Error reactivating subscription:', error)
      throw error
    }
  }

  /**
   * Add add-on to subscription
   */
  async addSubscriptionAddOn({
    subscriptionId,
    addOnId,
    quantity = 1,
  }: {
    subscriptionId: string
    addOnId: string
    quantity?: number
  }) {
    try {
      const { data: subscription, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single()

      if (error || !subscription) {
        throw new Error('Subscription not found')
      }

      const addOnConfig = SUBSCRIPTION_CONFIG.addOns[addOnId as keyof typeof SUBSCRIPTION_CONFIG.addOns]
      if (!addOnConfig?.stripePriceId) {
        throw new Error(`Invalid add-on: ${addOnId}`)
      }

      // Add to Stripe subscription
      await stripe.subscriptionItems.create({
        subscription: subscription.stripe_subscription_id,
        price: addOnConfig.stripePriceId,
        quantity,
      })

      // Save to database
      const { data: addOn, error: addOnError } = await this.supabase
        .from('subscription_add_ons')
        .insert({
          subscription_id: subscriptionId,
          add_on_id: addOnId,
          stripe_price_id: addOnConfig.stripePriceId,
          quantity,
          unit_amount: addOnConfig.price,
        })
        .select()
        .single()

      if (addOnError) {
        throw addOnError
      }

      return addOn
    } catch (error) {
      console.error('Error adding subscription add-on:', error)
      throw error
    }
  }

  /**
   * Remove add-on from subscription
   */
  async removeSubscriptionAddOn({
    subscriptionId,
    addOnId,
  }: {
    subscriptionId: string
    addOnId: string
  }) {
    try {
      const { data: subscription, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single()

      if (error || !subscription) {
        throw new Error('Subscription not found')
      }

      const { data: addOn, error: addOnError } = await this.supabase
        .from('subscription_add_ons')
        .select('*')
        .eq('subscription_id', subscriptionId)
        .eq('add_on_id', addOnId)
        .single()

      if (addOnError || !addOn) {
        throw new Error('Add-on not found')
      }

      // Get Stripe subscription items
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id, {
        expand: ['items'],
      })

      // Find the subscription item for this add-on
      const subscriptionItem = stripeSubscription.items.data.find(
        item => item.price.id === addOn.stripe_price_id
      )

      if (subscriptionItem) {
        await stripe.subscriptionItems.del(subscriptionItem.id)
      }

      // Remove from database
      const { error: deleteError } = await this.supabase
        .from('subscription_add_ons')
        .delete()
        .eq('id', addOn.id)

      if (deleteError) {
        throw deleteError
      }

      return true
    } catch (error) {
      console.error('Error removing subscription add-on:', error)
      throw error
    }
  }

  /**
   * Get subscription with add-ons
   */
  async getSubscription(subscriptionId: string) {
    try {
      const { data: subscription, error } = await this.supabase
        .from('subscriptions')
        .select(`
          *,
          subscription_add_ons (*)
        `)
        .eq('id', subscriptionId)
        .single()

      if (error) {
        throw error
      }

      return subscription
    } catch (error) {
      console.error('Error getting subscription:', error)
      throw error
    }
  }

  /**
   * Get subscription by league
   */
  async getSubscriptionByLeague(leagueId: string) {
    try {
      const { data: subscription, error } = await this.supabase
        .from('subscriptions')
        .select(`
          *,
          subscription_add_ons (*)
        `)
        .eq('league_id', leagueId)
        .in('status', ['active', 'trialing', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return subscription || null
    } catch (error) {
      console.error('Error getting subscription by league:', error)
      throw error
    }
  }

  /**
   * Preview subscription change (for proration calculation)
   */
  async previewSubscriptionChange({
    subscriptionId,
    newTier,
    addOns = [],
  }: {
    subscriptionId: string
    newTier: SubscriptionTier
    addOns?: Array<{ id: string; quantity: number }>
  }) {
    try {
      const { data: subscription, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single()

      if (error || !subscription) {
        throw new Error('Subscription not found')
      }

      const customer = await this.customerService.getCustomer(subscription.customer_id)
      if (!customer) {
        throw new Error('Customer not found')
      }

      const newTierConfig = getSubscriptionTier(newTier)
      if (!newTierConfig) {
        throw new Error(`Invalid subscription tier: ${newTier}`)
      }

      return await calculateProration({
        customerId: customer.stripeCustomerId,
        newPriceId: newTierConfig.stripePriceId,
        subscriptionId: subscription.stripe_subscription_id,
      })
    } catch (error) {
      console.error('Error previewing subscription change:', error)
      throw error
    }
  }

  /**
   * Check if league has feature access
   */
  async hasFeatureAccess(leagueId: string, feature: string): Promise<boolean> {
    try {
      const subscription = await this.getSubscriptionByLeague(leagueId)
      
      if (!subscription) {
        // Check if league has free tier access
        const { data: league } = await this.supabase
          .from('leagues')
          .select('subscription_tier')
          .eq('id', leagueId)
          .single()

        const tier = league?.subscription_tier || 'free'
        const tierConfig = getSubscriptionTier(tier)
        
        if (tierConfig?.features) {
          const featureValue = tierConfig.features[feature as keyof typeof tierConfig.features]
          return featureValue === true || (typeof featureValue === 'number' && featureValue > 0)
        }
        
        return false
      }

      const tierConfig = getSubscriptionTier(subscription.tier)
      if (tierConfig?.features) {
        const featureValue = tierConfig.features[feature as keyof typeof tierConfig.features]
        return featureValue === true || (typeof featureValue === 'number' && featureValue > 0)
      }

      return false
    } catch (error) {
      console.error('Error checking feature access:', error)
      return false
    }
  }

  /**
   * Get feature usage limit
   */
  async getFeatureLimit(leagueId: string, feature: string): Promise<number> {
    try {
      const subscription = await this.getSubscriptionByLeague(leagueId)
      
      const tier = subscription?.tier || 'free'
      const tierConfig = getSubscriptionTier(tier)
      
      if (tierConfig?.features) {
        const featureValue = tierConfig.features[feature as keyof typeof tierConfig.features]
        if (typeof featureValue === 'number') return featureValue
        if (featureValue === true) return -1 // Unlimited
      }
      
      return 0
    } catch (error) {
      console.error('Error getting feature limit:', error)
      return 0
    }
  }
}