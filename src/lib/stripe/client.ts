import Stripe from 'stripe'
import { TaxCalculationCreateParams } from '@/types/tax'

// Initialize Stripe with API key
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
})

// Stripe webhook secret for verifying webhook signatures
export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

// Tax calculation service configuration
export const TAX_CONFIG = {
  enabled: process.env.STRIPE_TAX_ENABLED === 'true',
  automaticTax: {
    enabled: true,
  },
  taxIdCollection: {
    enabled: true,
    required: 'if_supported' as const,
  },
}

// Subscription configuration
export const SUBSCRIPTION_CONFIG = {
  tiers: {
    free: {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'usd',
      interval: 'month',
      features: {
        maxFields: 1,
        maxReservationsPerMonth: 10,
        maxUsers: 5,
        basicSupport: true,
        advancedAnalytics: false,
        customBranding: false,
        apiAccess: false,
        multiTenant: false,
        bulkOperations: false,
        integrations: false,
        storageGB: 1,
      },
    },
    basic: {
      id: 'basic',
      name: 'Basic',
      price: 29,
      currency: 'usd',
      interval: 'month',
      stripePriceId: process.env.STRIPE_BASIC_PRICE_ID!,
      features: {
        maxFields: 5,
        maxReservationsPerMonth: 100,
        maxUsers: 25,
        basicSupport: true,
        advancedAnalytics: true,
        customBranding: false,
        apiAccess: false,
        multiTenant: false,
        bulkOperations: true,
        integrations: false,
        storageGB: 10,
      },
    },
    premium: {
      id: 'premium',
      name: 'Premium',
      price: 99,
      currency: 'usd',
      interval: 'month',
      stripePriceId: process.env.STRIPE_PREMIUM_PRICE_ID!,
      features: {
        maxFields: 25,
        maxReservationsPerMonth: 1000,
        maxUsers: 100,
        basicSupport: true,
        advancedAnalytics: true,
        customBranding: true,
        apiAccess: true,
        multiTenant: true,
        bulkOperations: true,
        integrations: true,
        storageGB: 100,
      },
    },
    enterprise: {
      id: 'enterprise',
      name: 'Enterprise',
      price: 299,
      currency: 'usd',
      interval: 'month',
      stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID!,
      features: {
        maxFields: -1, // Unlimited
        maxReservationsPerMonth: -1, // Unlimited
        maxUsers: -1, // Unlimited
        basicSupport: true,
        advancedAnalytics: true,
        customBranding: true,
        apiAccess: true,
        multiTenant: true,
        bulkOperations: true,
        integrations: true,
        storageGB: -1, // Unlimited
        prioritySupport: true,
        dedicatedManager: true,
        sla: true,
      },
    },
  },
  addOns: {
    extraFields: {
      id: 'extra-fields',
      name: 'Additional Fields',
      price: 5,
      unit: 'field',
      stripePriceId: process.env.STRIPE_EXTRA_FIELDS_PRICE_ID,
    },
    extraStorage: {
      id: 'extra-storage',
      name: 'Additional Storage',
      price: 2,
      unit: '10GB',
      stripePriceId: process.env.STRIPE_EXTRA_STORAGE_PRICE_ID,
    },
    prioritySupport: {
      id: 'priority-support',
      name: 'Priority Support',
      price: 49,
      unit: 'month',
      stripePriceId: process.env.STRIPE_PRIORITY_SUPPORT_PRICE_ID,
    },
  },
}

// Legacy price mapping for backward compatibility
export const SUBSCRIPTION_PRICES = {
  basic: SUBSCRIPTION_CONFIG.tiers.basic.stripePriceId,
  premium: SUBSCRIPTION_CONFIG.tiers.premium.stripePriceId,
  enterprise: SUBSCRIPTION_CONFIG.tiers.enterprise.stripePriceId,
}

// Usage-based pricing for field bookings
export const USAGE_PRICING = {
  fieldBookingFee: {
    baseAmount: 250, // $2.50 in cents
    processingFeePercentage: 2.9, // 2.9%
    processingFeeFixed: 30, // $0.30 in cents
  },
  taxes: {
    enableAutomaticTax: true,
    defaultTaxBehavior: 'exclusive' as const,
  },
}

// Helper function to create a checkout session for field reservation
export async function createFieldReservationCheckout({
  reservationId,
  userId,
  userEmail,
  amount,
  fieldName,
  date,
  startTime,
  endTime,
  successUrl,
  cancelUrl,
}: {
  reservationId: string
  userId: string
  userEmail: string
  amount: number
  fieldName: string
  date: string
  startTime: string
  endTime: string
  successUrl: string
  cancelUrl: string
}) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${fieldName} Reservation`,
            description: `${date} from ${startTime} to ${endTime}`,
          },
          unit_amount: Math.round(amount * 100), // Convert to cents
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: userEmail,
    metadata: {
      reservationId,
      userId,
      type: 'field_reservation',
    },
    payment_intent_data: {
      metadata: {
        reservationId,
        userId,
        type: 'field_reservation',
      },
    },
  })

  return session
}

// Helper function to create a subscription checkout session
export async function createSubscriptionCheckout({
  userId,
  userEmail,
  leagueId,
  tier,
  successUrl,
  cancelUrl,
}: {
  userId: string
  userEmail: string
  leagueId: string
  tier: 'basic' | 'premium' | 'enterprise'
  successUrl: string
  cancelUrl: string
}) {
  const priceId = SUBSCRIPTION_PRICES[tier]
  
  if (!priceId) {
    throw new Error(`Invalid subscription tier: ${tier}`)
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: userEmail,
    metadata: {
      userId,
      leagueId,
      type: 'subscription',
      tier,
    },
    subscription_data: {
      metadata: {
        userId,
        leagueId,
        type: 'subscription',
        tier,
      },
    },
  })

  return session
}

// Helper function to create a refund
export async function createRefund({
  paymentIntentId,
  amount,
  reason,
}: {
  paymentIntentId: string
  amount?: number // In cents, if not provided, full refund
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
}) {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,
    reason,
  })

  return refund
}

// Helper function to cancel a subscription
export async function cancelSubscription(subscriptionId: string) {
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  })

  return subscription
}

// Helper function to immediately cancel a subscription
export async function cancelSubscriptionImmediately(subscriptionId: string) {
  const subscription = await stripe.subscriptions.cancel(subscriptionId)
  return subscription
}

// Helper function to retrieve a payment intent
export async function getPaymentIntent(paymentIntentId: string) {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
  return paymentIntent
}

// Helper function to retrieve a subscription
export async function getSubscription(subscriptionId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  return subscription
}

// Helper function to construct webhook event
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
) {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
}

// Helper function to verify webhook signature
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): boolean {
  try {
    stripe.webhooks.constructEvent(payload, signature, webhookSecret)
    return true
  } catch (err) {
    return false
  }
}

// Helper function to format amount for display
export function formatAmount(amount: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100) // Convert from cents
}

// Helper function to calculate application fee (for marketplace scenarios)
export function calculateApplicationFee(amount: number, feePercentage = 2.5): number {
  return Math.round(amount * (feePercentage / 100))
}

// Helper function to calculate booking fees
export function calculateBookingFees(baseAmount: number): {
  baseAmount: number
  processingFee: number
  totalAmount: number
} {
  const processingFee = Math.round(
    (baseAmount * USAGE_PRICING.fieldBookingFee.processingFeePercentage) / 100 +
    USAGE_PRICING.fieldBookingFee.processingFeeFixed
  )
  const totalAmount = baseAmount + USAGE_PRICING.fieldBookingFee.baseAmount + processingFee
  
  return {
    baseAmount,
    processingFee: USAGE_PRICING.fieldBookingFee.baseAmount + processingFee,
    totalAmount,
  }
}

// Helper function to get subscription tier by ID
export function getSubscriptionTier(tierId: string) {
  return SUBSCRIPTION_CONFIG.tiers[tierId as keyof typeof SUBSCRIPTION_CONFIG.tiers]
}

// Helper function to check if feature is available for tier
export function hasFeature(tierId: string, featureName: string): boolean {
  const tier = getSubscriptionTier(tierId)
  if (!tier) return false
  
  const feature = tier.features[featureName as keyof typeof tier.features]
  return feature === true || (typeof feature === 'number' && feature > 0)
}

// Helper function to get feature limit
export function getFeatureLimit(tierId: string, featureName: string): number {
  const tier = getSubscriptionTier(tierId)
  if (!tier) return 0
  
  const feature = tier.features[featureName as keyof typeof tier.features]
  if (typeof feature === 'number') return feature
  if (feature === true) return -1 // Unlimited
  return 0
}

// Helper function to calculate proration
export async function calculateProration({
  customerId,
  newPriceId,
  subscriptionId,
}: {
  customerId: string
  newPriceId: string
  subscriptionId?: string
}): Promise<{
  amountDue: number
  amountRemaining: number
  proratedAmount: number
}> {
  const previewParams: Stripe.InvoiceCreateParams = {
    customer: customerId,
    subscription_items: [
      {
        price: newPriceId,
        quantity: 1,
      },
    ],
  }

  if (subscriptionId) {
    // Get current subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    previewParams.subscription = subscriptionId
    previewParams.subscription_items = [
      {
        id: subscription.items.data[0].id,
        price: newPriceId,
        quantity: 1,
      },
    ]
    previewParams.subscription_proration_behavior = 'create_prorations'
  }

  const invoice = await stripe.invoices.create({
    ...previewParams,
    auto_advance: false,
  })

  await stripe.invoices.finalizeInvoice(invoice.id)
  const finalizedInvoice = await stripe.invoices.retrieve(invoice.id)

  return {
    amountDue: finalizedInvoice.amount_due,
    amountRemaining: finalizedInvoice.amount_remaining || 0,
    proratedAmount: finalizedInvoice.total,
  }
}