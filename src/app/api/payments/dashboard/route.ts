import { NextRequest, NextResponse } from 'next/server'
import { PaymentService } from '@/lib/stripe/payment-service'
import { RefundService } from '@/lib/stripe/refund-service'
import { InvoiceService } from '@/lib/stripe/invoice-service'
import { SubscriptionService } from '@/lib/stripe/subscription-service'
import { errorResponse, successResponse, withErrorHandler } from '@/lib/api/middleware'

const paymentService = new PaymentService()
const refundService = new RefundService()
const invoiceService = new InvoiceService()
const subscriptionService = new SubscriptionService()

// Get payment dashboard data
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const leagueId = searchParams.get('leagueId')
  const period = searchParams.get('period') || '30d'

  if (!leagueId) {
    return errorResponse('League ID is required', 400)
  }

  // Get all dashboard data in parallel
  const [
    paymentSummary,
    refundStats,
    invoiceStats,
    subscription,
    recentPayments,
    recentRefunds,
  ] = await Promise.all([
    paymentService.getPaymentSummary(leagueId, period),
    refundService.getRefundStats(leagueId, period),
    invoiceService.getInvoiceStats(leagueId, period),
    subscriptionService.getSubscriptionByLeague(leagueId),
    paymentService.getLeaguePayments({
      leagueId,
      limit: 10,
      offset: 0,
    }),
    refundService.getLeagueRefunds({
      leagueId,
      limit: 5,
      offset: 0,
    }),
  ])

  // Calculate key metrics
  const metrics = {
    // Revenue metrics
    totalRevenue: paymentSummary.totalRevenue,
    monthlyRevenue: paymentSummary.monthlyRevenue,
    averageTransactionValue: paymentSummary.averageTransactionValue,
    
    // Payment metrics
    totalTransactions: paymentSummary.transactionCount,
    successfulPayments: paymentSummary.successfulPayments,
    failedPayments: paymentSummary.failedPayments,
    pendingPayments: paymentSummary.pendingPayments,
    successRate: paymentSummary.transactionCount > 0 
      ? (paymentSummary.successfulPayments / paymentSummary.transactionCount) * 100 
      : 0,
    
    // Refund metrics
    totalRefunds: refundStats.totalRefunds,
    totalRefundAmount: refundStats.totalRefundAmount,
    refundRate: refundStats.refundRate,
    
    // Invoice metrics
    totalInvoices: invoiceStats.totalInvoices,
    paidInvoices: invoiceStats.paidInvoices,
    overdueAmount: invoiceStats.overdueAmount,
    paymentRate: invoiceStats.paymentRate,
    
    // Subscription info
    currentTier: subscription?.tier || 'free',
    subscriptionStatus: subscription?.status || null,
    subscriptionExpiry: subscription?.current_period_end || null,
  }

  // Calculate revenue trends (simplified)
  const revenueByDay = {}
  for (const payment of recentPayments) {
    if (['completed', 'succeeded'].includes(payment.status)) {
      const day = new Date(payment.created_at).toISOString().split('T')[0]
      revenueByDay[day] = (revenueByDay[day] || 0) + (payment.amount || 0)
    }
  }

  const dashboard = {
    metrics,
    trends: {
      revenueByDay,
    },
    recentActivity: {
      payments: recentPayments.slice(0, 5),
      refunds: recentRefunds,
    },
    subscription: subscription ? {
      id: subscription.id,
      tier: subscription.tier,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    } : null,
    breakdown: {
      paymentsByStatus: {
        completed: paymentSummary.successfulPayments,
        failed: paymentSummary.failedPayments,
        pending: paymentSummary.pendingPayments,
      },
      refundsByReason: refundStats.refundsByReason,
      invoicesByStatus: {
        draft: invoiceStats.draftInvoices,
        open: invoiceStats.openInvoices,
        paid: invoiceStats.paidInvoices,
        void: invoiceStats.voidInvoices,
      },
    },
  }

  return successResponse(dashboard)
})