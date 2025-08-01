import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authorize,
  errorResponse,
  successResponse,
  withErrorHandler,
  cache,
} from '@/lib/api/middleware'
import { analyticsQuerySchema } from '@/lib/api/validation'

// GET /api/analytics/executive - Executive dashboard analytics
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const { searchParams } = new URL(req.url)
  const queryParams = analyticsQuerySchema.parse({
    startDate: searchParams.get('startDate'),
    endDate: searchParams.get('endDate'),
    period: searchParams.get('period') || 'month',
  })

  const supabase = createClient()
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  const cacheKey = `analytics:executive:${leagueId}:${JSON.stringify(queryParams)}`

  const data = await cache(cacheKey, async () => {
    // Key Performance Indicators
    const [
      totalUsers,
      activeUsers,
      totalReservations,
      totalRevenue,
      totalFields,
      avgUtilization,
      previousPeriodData,
      trendsData,
      topMetrics
    ] = await Promise.all([
      // Total users
      supabase
        .from('user_profiles')
        .select('id', { count: 'exact' })
        .eq('league_id', leagueId)
        .eq('is_active', true),

      // Active users (users with activity in the period)
      supabase
        .from('user_engagement_metrics')
        .select('user_id', { count: 'exact' })
        .eq('league_id', leagueId)
        .gte('date', queryParams.startDate)
        .lte('date', queryParams.endDate)
        .gt('session_count', 0),

      // Total reservations
      supabase
        .from('reservations')
        .select('id', { count: 'exact' })
        .eq('league_id', leagueId)
        .gte('date', queryParams.startDate)
        .lte('date', queryParams.endDate)
        .in('status', ['confirmed', 'completed']),

      // Total revenue
      supabase
        .from('revenue_analytics')
        .select('total_revenue')
        .eq('league_id', leagueId)
        .gte('date', queryParams.startDate)
        .lte('date', queryParams.endDate),

      // Total fields
      supabase
        .from('fields')
        .select('id', { count: 'exact' })
        .eq('league_id', leagueId)
        .eq('status', 'available'),

      // Average utilization
      supabase
        .from('field_utilization_analytics')
        .select('utilization_rate')
        .eq('league_id', leagueId)
        .gte('date', queryParams.startDate)
        .lte('date', queryParams.endDate),

      // Previous period data for comparisons
      getPreviousPeriodData(supabase, leagueId, queryParams),

      // Trends data
      getTrendsData(supabase, leagueId, queryParams),

      // Top performing metrics
      getTopMetrics(supabase, leagueId, queryParams)
    ])

    // Calculate current period metrics
    const currentMetrics = {
      totalUsers: totalUsers.count || 0,
      activeUsers: activeUsers.count || 0,
      totalReservations: totalReservations.count || 0,
      totalRevenue: totalRevenue.data?.reduce((sum, r) => sum + (r.total_revenue || 0), 0) || 0,
      totalFields: totalFields.count || 0,
      avgUtilization: avgUtilization.data?.length
        ? avgUtilization.data.reduce((sum, u) => sum + u.utilization_rate, 0) / avgUtilization.data.length
        : 0,
    }

    // Calculate period-over-period changes
    const changes = {
      userGrowth: calculateGrowth(currentMetrics.totalUsers, previousPeriodData.totalUsers),
      activeUserGrowth: calculateGrowth(currentMetrics.activeUsers, previousPeriodData.activeUsers),
      reservationGrowth: calculateGrowth(currentMetrics.totalReservations, previousPeriodData.totalReservations),
      revenueGrowth: calculateGrowth(currentMetrics.totalRevenue, previousPeriodData.totalRevenue),
      utilizationGrowth: calculateGrowth(currentMetrics.avgUtilization, previousPeriodData.avgUtilization),
    }

    // Calculate conversion rates
    const conversionRate = currentMetrics.activeUsers > 0
      ? (currentMetrics.totalReservations / currentMetrics.activeUsers) * 100
      : 0

    const avgRevenuePerUser = currentMetrics.activeUsers > 0
      ? currentMetrics.totalRevenue / currentMetrics.activeUsers
      : 0

    return {
      summary: {
        ...currentMetrics,
        conversionRate,
        avgRevenuePerUser,
        cancellationRate: await getCancellationRate(supabase, leagueId, queryParams),
        customerSatisfaction: await getCustomerSatisfaction(supabase, leagueId, queryParams),
      },
      changes,
      trends: trendsData,
      topMetrics,
      insights: await generateInsights(currentMetrics, changes, trendsData),
    }
  }, 300) // Cache for 5 minutes

  return successResponse(data)
})

async function getPreviousPeriodData(supabase: any, leagueId: string, queryParams: any) {
  const startDate = new Date(queryParams.startDate)
  const endDate = new Date(queryParams.endDate)
  const periodLength = endDate.getTime() - startDate.getTime()
  
  const prevStartDate = new Date(startDate.getTime() - periodLength)
  const prevEndDate = new Date(startDate.getTime() - 1)

  const [users, activeUsers, reservations, revenue, utilization] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id', { count: 'exact' })
      .eq('league_id', leagueId)
      .eq('is_active', true)
      .lte('created_at', prevEndDate.toISOString()),

    supabase
      .from('user_engagement_metrics')
      .select('user_id', { count: 'exact' })
      .eq('league_id', leagueId)
      .gte('date', prevStartDate.toISOString().split('T')[0])
      .lte('date', prevEndDate.toISOString().split('T')[0])
      .gt('session_count', 0),

    supabase
      .from('reservations')
      .select('id', { count: 'exact' })
      .eq('league_id', leagueId)
      .gte('date', prevStartDate.toISOString().split('T')[0])
      .lte('date', prevEndDate.toISOString().split('T')[0])
      .in('status', ['confirmed', 'completed']),

    supabase
      .from('revenue_analytics')
      .select('total_revenue')
      .eq('league_id', leagueId)
      .gte('date', prevStartDate.toISOString().split('T')[0])
      .lte('date', prevEndDate.toISOString().split('T')[0]),

    supabase
      .from('field_utilization_analytics')
      .select('utilization_rate')
      .eq('league_id', leagueId)
      .gte('date', prevStartDate.toISOString().split('T')[0])
      .lte('date', prevEndDate.toISOString().split('T')[0])
  ])

  return {
    totalUsers: users.count || 0,
    activeUsers: activeUsers.count || 0,
    totalReservations: reservations.count || 0,
    totalRevenue: revenue.data?.reduce((sum, r) => sum + (r.total_revenue || 0), 0) || 0,
    avgUtilization: utilization.data?.length
      ? utilization.data.reduce((sum, u) => sum + u.utilization_rate, 0) / utilization.data.length
      : 0,
  }
}

async function getTrendsData(supabase: any, leagueId: string, queryParams: any) {
  const { data: dailyMetrics } = await supabase
    .from('revenue_analytics')
    .select(`
      date,
      total_revenue,
      transaction_count,
      avg_transaction_value
    `)
    .eq('league_id', leagueId)
    .gte('date', queryParams.startDate)
    .lte('date', queryParams.endDate)
    .order('date')

  const { data: dailyUtilization } = await supabase
    .from('field_utilization_analytics')
    .select(`
      date,
      utilization_rate,
      bookings_count
    `)
    .eq('league_id', leagueId)
    .gte('date', queryParams.startDate)
    .lte('date', queryParams.endDate)

  // Group utilization by date
  const utilizationByDate = new Map()
  dailyUtilization?.forEach(record => {
    if (!utilizationByDate.has(record.date)) {
      utilizationByDate.set(record.date, { totalRate: 0, count: 0, bookings: 0 })
    }
    const data = utilizationByDate.get(record.date)
    data.totalRate += record.utilization_rate
    data.count += 1
    data.bookings += record.bookings_count
  })

  return {
    daily: dailyMetrics?.map(metric => ({
      date: metric.date,
      revenue: metric.total_revenue,
      transactions: metric.transaction_count,
      avgTransactionValue: metric.avg_transaction_value,
      utilization: utilizationByDate.has(metric.date)
        ? utilizationByDate.get(metric.date).totalRate / utilizationByDate.get(metric.date).count
        : 0,
      bookings: utilizationByDate.has(metric.date)
        ? utilizationByDate.get(metric.date).bookings
        : 0,
    })) || []
  }
}

async function getTopMetrics(supabase: any, leagueId: string, queryParams: any) {
  const [topFields, topUsers, peakHours] = await Promise.all([
    // Top performing fields by revenue
    supabase
      .from('field_utilization_analytics')
      .select(`
        field_id,
        revenue,
        utilization_rate,
        bookings_count,
        field:fields(name, type)
      `)
      .eq('league_id', leagueId)
      .gte('date', queryParams.startDate)
      .lte('date', queryParams.endDate)
      .order('revenue', { ascending: false })
      .limit(5),

    // Most active users
    supabase
      .from('user_engagement_metrics')
      .select(`
        user_id,
        session_count,
        bookings_made,
        revenue_generated,
        engagement_score,
        user:user_profiles(full_name, email)
      `)
      .eq('league_id', leagueId)
      .gte('date', queryParams.startDate)
      .lte('date', queryParams.endDate)
      .order('engagement_score', { ascending: false })
      .limit(10),

    // Peak hours analysis
    supabase
      .from('field_utilization_analytics')
      .select('hour, utilization_rate, bookings_count')
      .eq('league_id', leagueId)
      .gte('date', queryParams.startDate)
      .lte('date', queryParams.endDate)
  ])

  // Process peak hours
  const hourlyData = new Map()
  peakHours.data?.forEach(record => {
    if (!hourlyData.has(record.hour)) {
      hourlyData.set(record.hour, { utilization: 0, bookings: 0, count: 0 })
    }
    const data = hourlyData.get(record.hour)
    data.utilization += record.utilization_rate
    data.bookings += record.bookings_count
    data.count += 1
  })

  const peakHoursArray = Array.from(hourlyData.entries())
    .map(([hour, data]) => ({
      hour,
      avgUtilization: data.utilization / data.count,
      totalBookings: data.bookings,
      time: `${hour.toString().padStart(2, '0')}:00`
    }))
    .sort((a, b) => b.avgUtilization - a.avgUtilization)
    .slice(0, 5)

  return {
    topFields: topFields.data || [],
    topUsers: topUsers.data || [],
    peakHours: peakHoursArray,
  }
}

async function getCancellationRate(supabase: any, leagueId: string, queryParams: any) {
  const { data: reservations } = await supabase
    .from('reservations')
    .select('status')
    .eq('league_id', leagueId)
    .gte('date', queryParams.startDate)
    .lte('date', queryParams.endDate)

  if (!reservations?.length) return 0

  const cancelled = reservations.filter(r => r.status === 'cancelled').length
  return (cancelled / reservations.length) * 100
}

async function getCustomerSatisfaction(supabase: any, leagueId: string, queryParams: any) {
  // This would typically come from feedback/rating data
  // For now, we'll use a simplified calculation based on cancellation rates and repeat bookings
  const { data: userMetrics } = await supabase
    .from('user_engagement_metrics')
    .select('bookings_made, bookings_cancelled')
    .eq('league_id', leagueId)
    .gte('date', queryParams.startDate)
    .lte('date', queryParams.endDate)

  if (!userMetrics?.length) return 85 // Default satisfaction score

  const totalBookings = userMetrics.reduce((sum, m) => sum + m.bookings_made, 0)
  const totalCancellations = userMetrics.reduce((sum, m) => sum + m.bookings_cancelled, 0)
  
  const satisfactionScore = totalBookings > 0
    ? Math.max(60, 100 - ((totalCancellations / totalBookings) * 40))
    : 85

  return Math.round(satisfactionScore)
}

function calculateGrowth(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

async function generateInsights(metrics: any, changes: any, trends: any) {
  const insights = []

  // Revenue insights
  if (changes.revenueGrowth > 10) {
    insights.push({
      type: 'positive',
      category: 'revenue',
      message: `Revenue is up ${changes.revenueGrowth.toFixed(1)}% compared to the previous period`,
      impact: 'high'
    })
  } else if (changes.revenueGrowth < -5) {
    insights.push({
      type: 'warning',
      category: 'revenue',
      message: `Revenue has declined by ${Math.abs(changes.revenueGrowth).toFixed(1)}% - consider promotional strategies`,
      impact: 'high'
    })
  }

  // Utilization insights
  if (metrics.avgUtilization < 50) {
    insights.push({
      type: 'opportunity',
      category: 'utilization',
      message: `Field utilization is at ${metrics.avgUtilization.toFixed(1)}% - there's room for improvement`,
      impact: 'medium'
    })
  } else if (metrics.avgUtilization > 85) {
    insights.push({
      type: 'positive',
      category: 'utilization',
      message: `Excellent field utilization at ${metrics.avgUtilization.toFixed(1)}% - consider expanding capacity`,
      impact: 'high'
    })
  }

  // User engagement insights
  if (changes.activeUserGrowth > 15) {
    insights.push({
      type: 'positive',
      category: 'engagement',
      message: `Active user growth is strong at ${changes.activeUserGrowth.toFixed(1)}%`,
      impact: 'high'
    })
  }

  // Conversion rate insights
  if (metrics.conversionRate < 50) {
    insights.push({
      type: 'opportunity',
      category: 'conversion',
      message: `Conversion rate is ${metrics.conversionRate.toFixed(1)}% - focus on user experience improvements`,
      impact: 'medium'
    })
  }

  return insights
}