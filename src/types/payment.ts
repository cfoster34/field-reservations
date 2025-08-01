export interface Payment {
  id: string
  userId: string
  leagueId: string
  reservationId?: string
  subscriptionId?: string
  amount: number
  currency: string
  status: PaymentStatus
  type: PaymentType
  method?: PaymentMethod
  stripePaymentIntentId?: string
  stripeSubscriptionId?: string
  stripeCustomerId?: string
  stripeRefundId?: string
  stripeInvoiceId?: string
  description?: string
  taxAmount?: number
  applicationFee?: number
  processingFee?: number
  metadata?: Record<string, any>
  paidAt?: string
  failedAt?: string
  refundedAt?: string
  refundReason?: string
  createdAt: string
  updatedAt: string
}

export interface Subscription {
  id: string
  leagueId: string
  userId: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  stripeSubscriptionId: string
  stripeCustomerId: string
  stripePriceId: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  cancelledAt?: string
  trialStart?: string
  trialEnd?: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface Customer {
  id: string
  userId: string
  leagueId: string
  stripeCustomerId: string
  email: string
  name?: string
  phone?: string
  address?: CustomerAddress
  taxIds?: TaxId[]
  defaultPaymentMethodId?: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface CustomerAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country: string
}

export interface TaxId {
  type: string
  value: string
  verified?: boolean
}

export interface PaymentMethod {
  id: string
  stripePaymentMethodId: string
  customerId: string
  type: 'card' | 'bank_account' | 'sepa_debit' | 'ideal' | 'sofort'
  card?: {
    brand: string
    last4: string
    expMonth: number
    expYear: number
    fingerprint: string
  }
  bankAccount?: {
    bankName?: string
    last4: string
    accountType: string
  }
  isDefault: boolean
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface Invoice {
  id: string
  subscriptionId?: string
  customerId: string
  stripeInvoiceId: string
  number: string
  status: InvoiceStatus
  currency: string
  amountDue: number
  amountPaid: number
  amountRemaining: number
  subtotal: number
  total: number
  tax: number
  description?: string
  dueDate?: string
  paidAt?: string
  hostedInvoiceUrl?: string
  invoicePdf?: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface UsageRecord {
  id: string
  subscriptionId: string
  leagueId: string
  itemType: UsageItemType
  quantity: number
  timestamp: string
  metadata?: Record<string, any>
  createdAt: string
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  PARTIAL_REFUND = 'partial_refund',
  DISPUTED = 'disputed',
  REQUIRES_ACTION = 'requires_action'
}

export enum PaymentType {
  FIELD_RESERVATION = 'field_reservation',
  SUBSCRIPTION = 'subscription',
  ONE_TIME = 'one_time',
  USAGE_BASED = 'usage_based',
  ADD_ON = 'add_on',
  SETUP_FEE = 'setup_fee'
}

export enum SubscriptionTier {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  UNPAID = 'unpaid',
  CANCELLED = 'cancelled',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  TRIALING = 'trialing',
  PAUSED = 'paused'
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  PAID = 'paid',
  UNCOLLECTIBLE = 'uncollectible',
  VOID = 'void'
}

export enum UsageItemType {
  FIELD_BOOKING = 'field_booking',
  STORAGE = 'storage',
  API_CALLS = 'api_calls',
  USERS = 'users',
  TEAMS = 'teams'
}

export enum PaymentMethodType {
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer',
  SEPA_DEBIT = 'sepa_debit',
  IDEAL = 'ideal',
  SOFORT = 'sofort',
  ACH = 'ach',
  CASH = 'cash',
  CHECK = 'check'
}

export interface PaymentIntent {
  amount: number
  currency: string
  reservationId: string
  userId: string
  description?: string
}

export interface RefundRequest {
  paymentId: string
  amount?: number // If not provided, full refund
  reason: RefundReason
  notes?: string
  refundApplicationFee?: boolean
  reverseTransfer?: boolean
  metadata?: Record<string, any>
}

export interface Refund {
  id: string
  paymentId: string
  stripeRefundId: string
  amount: number
  currency: string
  reason: RefundReason
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled'
  failureReason?: string
  notes?: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export enum RefundReason {
  CANCELLATION = 'cancellation',
  WEATHER = 'weather',
  FIELD_ISSUE = 'field_issue',
  DUPLICATE = 'duplicate',
  FRAUDULENT = 'fraudulent',
  REQUESTED_BY_CUSTOMER = 'requested_by_customer',
  SERVICE_NOT_PROVIDED = 'service_not_provided',
  BILLING_ERROR = 'billing_error',
  OTHER = 'other'
}

export interface PaymentSummary {
  totalRevenue: number
  monthlyRevenue: number
  pendingPayments: number
  refundedAmount: number
  activeSubscriptions: number
  churnRate: number
  averageRevenuePerUser: number
  transactions: Payment[]
  subscriptions: Subscription[]
}

export interface BillingSettings {
  leagueId: string
  enableAutomaticTax: boolean
  taxBehavior: 'inclusive' | 'exclusive'
  currency: string
  timezone: string
  billingAddress?: CustomerAddress
  taxIds?: TaxId[]
  invoiceSettings: {
    daysUntilDue: number
    footerText?: string
    renderOptions?: {
      amountTaxDisplay: 'include_inclusive_tax' | 'exclude_inclusive_tax'
    }
  }
  paymentSettings: {
    saveDefaultPaymentMethod: boolean
    paymentMethodTypes: PaymentMethodType[]
  }
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface ProrationPreview {
  amountDue: number
  amountRemaining: number
  proratedAmount: number
  currentPeriodEnd: string
  newPeriodStart: string
  items: Array<{
    description: string
    amount: number
    period: {
      start: string
      end: string
    }
  }>
}

export interface PaymentRecovery {
  id: string
  paymentId: string
  customerId: string
  failureCount: number
  nextRetryAt: string
  status: 'active' | 'paused' | 'cancelled' | 'succeeded'
  strategy: 'email' | 'dunning' | 'smart_retry'
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}