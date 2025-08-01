import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  authorize,
  errorResponse,
  successResponse,
  withErrorHandler,
  cache,
} from '@/lib/api/middleware'
import { analyticsQuerySchema } from '@/lib/api/validation'

// GET /api/analytics/revenue - Get revenue analytics
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const { searchParams } = new URL(req.url)
  const queryParams = analyticsQuerySchema.parse({
    startDate: searchParams.get('startDate'),
    endDate: searchParams.get('endDate'),
    fieldId: searchParams.get('fieldId'),
    teamId: searchParams.get('teamId'),
  })

  const supabase = createClient()
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  // Cache key for analytics data
  const cacheKey = `analytics:revenue:${leagueId}:${JSON.stringify(queryParams)}`

  const data = await cache(cacheKey, async () => {
    // Get payments within date range
    let paymentQuery = supabase
      .from('payments')
      .select(`
        *,
        reservation:reservations (
          id,
          field_id,
          team_id,
          date,
          field:fields (
            id,
            name,
            type
          )
        )
      `)
      .eq('league_id', leagueId)
      .eq('status', 'completed')
      .gte('created_at', `${queryParams.startDate}T00:00:00`)
      .lte('created_at', `${queryParams.endDate}T23:59:59`)

    const { data: payments, error } = await paymentQuery

    if (error) {
      throw error
    }

    // Filter by field or team if specified
    let filteredPayments = payments || []
    if (queryParams.fieldId) {
      filteredPayments = filteredPayments.filter(p => p.reservation?.field_id === queryParams.fieldId)
    }
    if (queryParams.teamId) {
      filteredPayments = filteredPayments.filter(p => p.reservation?.team_id === queryParams.teamId)
    }

    // Calculate revenue metrics
    const revenueByDate = new Map()
    const revenueByField = new Map()
    const revenueByPaymentType = new Map()
    const revenueByMonth = new Map()

    let totalRevenue = 0
    let totalRefunded = 0
    let fieldReservationRevenue = 0
    let subscriptionRevenue = 0

    filteredPayments.forEach(payment => {
      const amount = payment.amount
      totalRevenue += amount

      // Track refunds
      if (payment.refunded_at) {
        const refundAmount = payment.metadata?.refund_amount || amount
        totalRefunded += refundAmount
      }

      // Revenue by date
      const date = payment.created_at.split('T')[0]
      if (!revenueByDate.has(date)) {
        revenueByDate.set(date, { date, revenue: 0, transactions: 0 })
      }
      const dateData = revenueByDate.get(date)
      dateData.revenue += amount
      dateData.transactions += 1

      // Revenue by field
      if (payment.reservation?.field) {
        const fieldId = payment.reservation.field.id
        if (!revenueByField.has(fieldId)) {
          revenueByField.set(fieldId, {
            fieldId,
            fieldName: payment.reservation.field.name,
            fieldType: payment.reservation.field.type,
            revenue: 0,
            transactions: 0,
          })
        }
        const fieldData = revenueByField.get(fieldId)
        fieldData.revenue += amount
        fieldData.transactions += 1
        fieldReservationRevenue += amount
      }

      // Revenue by payment type
      if (payment.stripe_subscription_id) {
        subscriptionRevenue += amount
        if (!revenueByPaymentType.has('subscription')) {
          revenueByPaymentType.set('subscription', { type: 'subscription', revenue: 0, count: 0 })
        }
        const typeData = revenueByPaymentType.get('subscription')
        typeData.revenue += amount
        typeData.count += 1
      } else {
        if (!revenueByPaymentType.has('reservation')) {
          revenueByPaymentType.set('reservation', { type: 'reservation', revenue: 0, count: 0 })
        }
        const typeData = revenueByPaymentType.get('reservation')
        typeData.revenue += amount
        typeData.count += 1
      }

      // Revenue by month
      const month = payment.created_at.substring(0, 7) // YYYY-MM
      if (!revenueByMonth.has(month)) {
        revenueByMonth.set(month, { month, revenue: 0, transactions: 0 })
      }
      const monthData = revenueByMonth.get(month)
      monthData.revenue += amount
      monthData.transactions += 1
    })

    // Calculate growth metrics
    const sortedMonths = Array.from(revenueByMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    let previousMonthRevenue = 0
    const monthlyGrowth = sortedMonths.map(([month, data], index) => {
      const growth = index > 0 && previousMonthRevenue > 0
        ? ((data.revenue - previousMonthRevenue) / previousMonthRevenue) * 100
        : 0
      previousMonthRevenue = data.revenue
      return {
        ...data,
        growth,
      }
    })

    // Calculate average transaction value
    const avgTransactionValue = filteredPayments.length > 0
      ? totalRevenue / filteredPayments.length
      : 0

    return {
      summary: {
        totalRevenue,
        totalRefunded,
        netRevenue: totalRevenue - totalRefunded,
        fieldReservationRevenue,
        subscriptionRevenue,
        totalTransactions: filteredPayments.length,
        avgTransactionValue,
      },
      byDate: Array.from(revenueByDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
      byField: Array.from(revenueByField.values()).sort((a, b) => b.revenue - a.revenue),
      byType: Array.from(revenueByPaymentType.values()),
      monthlyGrowth,
      topFields: Array.from(revenueByField.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    }
  }, 300) // Cache for 5 minutes

  return successResponse(data)
})