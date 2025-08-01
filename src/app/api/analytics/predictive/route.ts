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

// GET /api/analytics/predictive - Predictive analytics and demand forecasting
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin', 'coach'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const { searchParams } = new URL(req.url)
  const queryParams = {
    ...analyticsQuerySchema.parse({
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      fieldId: searchParams.get('fieldId'),
    }),
    forecastDays: parseInt(searchParams.get('forecastDays') || '30'),
    modelType: searchParams.get('modelType') || 'demand_forecast'
  }

  const supabase = createClient()
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  const cacheKey = `analytics:predictive:${leagueId}:${JSON.stringify(queryParams)}`

  const data = await cache(cacheKey, async () => {
    switch (queryParams.modelType) {
      case 'demand_forecast':
        return await generateDemandForecast(supabase, leagueId, queryParams)
      case 'churn_prediction':
        return await generateChurnPrediction(supabase, leagueId, queryParams)
      case 'revenue_forecast':
        return await generateRevenueForecast(supabase, leagueId, queryParams)
      case 'capacity_optimization':
        return await generateCapacityOptimization(supabase, leagueId, queryParams)
      default:
        return await generateDemandForecast(supabase, leagueId, queryParams)
    }
  }, 600) // Cache for 10 minutes

  return successResponse(data)
})

async function generateDemandForecast(supabase: any, leagueId: string, queryParams: any) {
  // Get historical booking data
  const { data: historicalData } = await supabase
    .from('reservations')
    .select(`
      date,
      start_time,
      field_id,
      status,
      attendees,
      field:fields(name, type)
    `)
    .eq('league_id', leagueId)
    .gte('date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) // Last 90 days
    .in('status', ['confirmed', 'completed'])

  if (!historicalData?.length) {
    return {
      forecast: [],
      accuracy: 0,
      insights: ['Insufficient historical data for accurate forecasting']
    }
  }

  // Process historical data into time series
  const timeSeriesData = processTimeSeriesData(historicalData)
  
  // Generate forecasts for each field and time slot
  const forecasts = []
  const insights = []

  // Get unique fields
  const fields = queryParams.fieldId 
    ? [{ id: queryParams.fieldId }]
    : await getUniqueFields(supabase, leagueId)

  for (const field of fields) {
    const fieldData = timeSeriesData.filter(d => d.fieldId === field.id)
    if (fieldData.length < 7) continue // Need at least a week of data

    const fieldForecast = await generateFieldDemandForecast(fieldData, queryParams.forecastDays)
    forecasts.push({
      fieldId: field.id,
      fieldName: field.name || 'Unknown',
      forecast: fieldForecast.predictions,
      confidence: fieldForecast.confidence,
      trend: fieldForecast.trend
    })

    // Generate insights for this field
    if (fieldForecast.trend === 'increasing') {
      insights.push({
        type: 'opportunity',
        field: field.name,
        message: 'Demand is trending upward - consider increasing capacity or pricing',
        impact: 'high'
      })
    } else if (fieldForecast.trend === 'decreasing') {
      insights.push({
        type: 'warning',
        field: field.name,
        message: 'Demand is declining - consider promotional strategies',
        impact: 'medium'
      })
    }
  }

  // Overall demand patterns
  const overallForecast = aggregateFieldForecasts(forecasts)
  
  // Peak demand predictions
  const peakDemandPredictions = predictPeakDemand(timeSeriesData, queryParams.forecastDays)

  return {
    forecast: {
      byField: forecasts,
      overall: overallForecast,
      peakDemand: peakDemandPredictions
    },
    accuracy: calculateForecastAccuracy(historicalData),
    insights,
    recommendations: generateDemandRecommendations(forecasts, peakDemandPredictions)
  }
}

async function generateChurnPrediction(supabase: any, leagueId: string, queryParams: any) {
  // Get user engagement data
  const { data: userMetrics } = await supabase
    .from('user_engagement_metrics')
    .select(`
      user_id,
      date,
      session_count,
      bookings_made,
      bookings_cancelled,
      engagement_score,
      user:user_profiles(full_name, email, created_at)
    `)
    .eq('league_id', leagueId)
    .gte('date', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) // Last 60 days

  if (!userMetrics?.length) {
    return {
      predictions: [],
      accuracy: 0,
      insights: ['Insufficient user data for churn prediction']
    }
  }

  // Calculate churn risk for each user
  const userChurnRisks = calculateUserChurnRisk(userMetrics)
  
  // Segment users by risk level
  const riskSegments = {
    high: userChurnRisks.filter(u => u.churnRisk > 0.7),
    medium: userChurnRisks.filter(u => u.churnRisk > 0.4 && u.churnRisk <= 0.7),
    low: userChurnRisks.filter(u => u.churnRisk <= 0.4)
  }

  // Generate retention strategies
  const retentionStrategies = generateRetentionStrategies(riskSegments)

  return {
    predictions: {
      highRisk: riskSegments.high.slice(0, 20), // Top 20 high-risk users
      summary: {
        totalUsers: userChurnRisks.length,
        highRiskCount: riskSegments.high.length,
        mediumRiskCount: riskSegments.medium.length,
        lowRiskCount: riskSegments.low.length,
        averageRisk: userChurnRisks.reduce((sum, u) => sum + u.churnRisk, 0) / userChurnRisks.length
      }
    },
    retentionStrategies,
    insights: generateChurnInsights(riskSegments, userMetrics)
  }
}

async function generateRevenueForecast(supabase: any, leagueId: string, queryParams: any) {
  // Get historical revenue data
  const { data: revenueData } = await supabase
    .from('revenue_analytics')
    .select('date, total_revenue, field_revenue, subscription_revenue, transaction_count')
    .eq('league_id', leagueId)
    .gte('date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .order('date')

  if (!revenueData?.length) {
    return {
      forecast: [],
      accuracy: 0,
      insights: ['Insufficient revenue data for forecasting']
    }
  }

  // Apply time series forecasting
  const revenueForecast = generateTimeSeriesForecast(
    revenueData.map(d => ({ date: d.date, value: d.total_revenue })),
    queryParams.forecastDays
  )

  const fieldRevenueForecast = generateTimeSeriesForecast(
    revenueData.map(d => ({ date: d.date, value: d.field_revenue })),
    queryParams.forecastDays
  )

  const subscriptionRevenueForecast = generateTimeSeriesForecast(
    revenueData.map(d => ({ date: d.date, value: d.subscription_revenue })),
    queryParams.forecastDays
  )

  // Calculate growth trends
  const recentTrend = calculateTrend(revenueData.slice(-14).map(d => d.total_revenue))
  const longTermTrend = calculateTrend(revenueData.map(d => d.total_revenue))

  return {
    forecast: {
      total: revenueForecast,
      field: fieldRevenueForecast,
      subscription: subscriptionRevenueForecast,
      projectedTotal: revenueForecast.reduce((sum, f) => sum + f.value, 0),
      confidence: calculateForecastConfidence(revenueData)
    },
    trends: {
      recent: recentTrend,
      longTerm: longTermTrend,
      momentum: recentTrend.direction === longTermTrend.direction ? 'consistent' : 'changing'
    },
    insights: generateRevenueInsights(revenueData, revenueForecast, recentTrend)
  }
}

async function generateCapacityOptimization(supabase: any, leagueId: string, queryParams: any) {
  // Get field utilization data
  const { data: utilizationData } = await supabase
    .from('field_utilization_analytics')
    .select(`
      field_id,
      date,
      hour,
      utilization_rate,
      bookings_count,
      field:fields(name, type)
    `)
    .eq('league_id', leagueId)
    .gte('date', queryParams.startDate)
    .lte('date', queryParams.endDate)

  if (!utilizationData?.length) {
    return {
      optimization: [],
      insights: ['Insufficient utilization data for optimization analysis']
    }
  }

  // Analyze capacity by field and time
  const capacityAnalysis = analyzeCapacityPatterns(utilizationData)
  
  // Generate optimization recommendations
  const optimizations = generateCapacityOptimizations(capacityAnalysis)

  return {
    currentUtilization: capacityAnalysis.summary,
    optimization: optimizations,
    projectedImpact: calculateOptimizationImpact(capacityAnalysis, optimizations),
    insights: generateCapacityInsights(capacityAnalysis)
  }
}

// Helper functions for predictive analytics

function processTimeSeriesData(historicalData: any[]) {
  const timeSeriesMap = new Map()

  historicalData.forEach(booking => {
    const date = booking.date
    const hour = new Date(`2000-01-01T${booking.start_time}`).getHours()
    const key = `${booking.field_id}-${date}-${hour}`

    if (!timeSeriesMap.has(key)) {
      timeSeriesMap.set(key, {
        fieldId: booking.field_id,
        fieldName: booking.field?.name,
        fieldType: booking.field?.type,
        date,
        hour,
        bookings: 0,
        totalAttendees: 0
      })
    }

    const entry = timeSeriesMap.get(key)
    entry.bookings += 1
    entry.totalAttendees += booking.attendees || 0
  })

  return Array.from(timeSeriesMap.values()).sort((a, b) => 
    a.date.localeCompare(b.date) || a.hour - b.hour
  )
}

async function generateFieldDemandForecast(fieldData: any[], forecastDays: number) {
  // Simple moving average with trend analysis
  const windowSize = Math.min(7, Math.floor(fieldData.length / 2))
  const recent = fieldData.slice(-windowSize)
  const older = fieldData.slice(-(windowSize * 2), -windowSize)

  const recentAvg = recent.reduce((sum, d) => sum + d.bookings, 0) / recent.length
  const olderAvg = older.length > 0 
    ? older.reduce((sum, d) => sum + d.bookings, 0) / older.length 
    : recentAvg

  const trendFactor = recentAvg / Math.max(olderAvg, 1)
  let trend = 'stable'
  if (trendFactor > 1.1) trend = 'increasing'
  else if (trendFactor < 0.9) trend = 'decreasing'

  // Generate predictions
  const predictions = []
  const baseDate = new Date()
  
  for (let day = 1; day <= forecastDays; day++) {
    const forecastDate = new Date(baseDate.getTime() + day * 24 * 60 * 60 * 1000)
    const dayOfWeek = forecastDate.getDay()
    
    // Apply seasonal and weekly patterns
    const weeklyMultiplier = getWeeklyMultiplier(dayOfWeek, fieldData)
    const seasonalMultiplier = getSeasonalMultiplier(forecastDate.getMonth())
    
    let predictedDemand = recentAvg * weeklyMultiplier * seasonalMultiplier
    
    // Apply trend
    const trendMultiplier = Math.pow(trendFactor, day / 30) // Compound trend over time
    predictedDemand *= trendMultiplier

    predictions.push({
      date: forecastDate.toISOString().split('T')[0],
      predictedDemand: Math.max(0, Math.round(predictedDemand * 100) / 100),
      confidence: Math.max(0.3, 0.9 - (day / forecastDays) * 0.4) // Confidence decreases over time
    })
  }

  return {
    predictions,
    confidence: predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length,
    trend
  }
}

function getWeeklyMultiplier(dayOfWeek: number, fieldData: any[]): number {
  const dayBookings = fieldData.filter(d => new Date(d.date).getDay() === dayOfWeek)
  const avgDayBookings = dayBookings.length > 0 
    ? dayBookings.reduce((sum, d) => sum + d.bookings, 0) / dayBookings.length 
    : 1

  const overallAvg = fieldData.reduce((sum, d) => sum + d.bookings, 0) / fieldData.length
  
  return overallAvg > 0 ? avgDayBookings / overallAvg : 1
}

function getSeasonalMultiplier(month: number): number {
  // Simple seasonal adjustment (can be enhanced with historical data)
  const seasonalFactors = [0.8, 0.85, 0.95, 1.1, 1.2, 1.3, 1.4, 1.35, 1.1, 1.0, 0.9, 0.75]
  return seasonalFactors[month] || 1
}

async function getUniqueFields(supabase: any, leagueId: string) {
  const { data } = await supabase
    .from('fields')
    .select('id, name')
    .eq('league_id', leagueId)
    .eq('status', 'available')
  
  return data || []
}

function aggregateFieldForecasts(forecasts: any[]) {
  if (!forecasts.length) return []

  const dateMap = new Map()
  
  forecasts.forEach(fieldForecast => {
    fieldForecast.forecast.forEach((prediction: any) => {
      if (!dateMap.has(prediction.date)) {
        dateMap.set(prediction.date, { 
          date: prediction.date, 
          totalDemand: 0, 
          avgConfidence: 0, 
          fieldCount: 0 
        })
      }
      
      const entry = dateMap.get(prediction.date)
      entry.totalDemand += prediction.predictedDemand
      entry.avgConfidence += prediction.confidence
      entry.fieldCount += 1
    })
  })

  return Array.from(dateMap.values()).map(entry => ({
    date: entry.date,
    predictedDemand: Math.round(entry.totalDemand * 100) / 100,
    confidence: Math.round((entry.avgConfidence / entry.fieldCount) * 100) / 100
  })).sort((a, b) => a.date.localeCompare(b.date))
}

function predictPeakDemand(timeSeriesData: any[], forecastDays: number) {
  // Analyze historical peak patterns
  const hourlyDemand = new Map()
  const dailyDemand = new Map()

  timeSeriesData.forEach(entry => {
    const hour = entry.hour
    const dayOfWeek = new Date(entry.date).getDay()

    hourlyDemand.set(hour, (hourlyDemand.get(hour) || 0) + entry.bookings)
    dailyDemand.set(dayOfWeek, (dailyDemand.get(dayOfWeek) || 0) + entry.bookings)
  })

  const peakHours = Array.from(hourlyDemand.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, demand]) => ({ hour, demand, time: `${hour.toString().padStart(2, '0')}:00` }))

  const peakDays = Array.from(dailyDemand.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([day, demand]) => ({ 
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day], 
      demand 
    }))

  return {
    peakHours,
    peakDays,
    upcomingPeaks: generateUpcomingPeaks(peakHours, peakDays, forecastDays)
  }
}

function generateUpcomingPeaks(peakHours: any[], peakDays: any[], forecastDays: number) {
  const upcomingPeaks = []
  const today = new Date()

  for (let day = 1; day <= Math.min(forecastDays, 14); day++) {
    const forecastDate = new Date(today.getTime() + day * 24 * 60 * 60 * 1000)
    const dayOfWeek = forecastDate.getDay()
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]

    const isPeakDay = peakDays.some(pd => pd.day === dayName)
    
    if (isPeakDay) {
      peakHours.forEach(({ hour, time }) => {
        upcomingPeaks.push({
          date: forecastDate.toISOString().split('T')[0],
          hour,
          time,
          expectedDemand: 'high',
          confidence: 0.8
        })
      })
    }
  }

  return upcomingPeaks.slice(0, 10) // Return top 10 upcoming peaks
}

function calculateForecastAccuracy(historicalData: any[]) {
  // Simple accuracy calculation based on data consistency
  if (historicalData.length < 14) return 0.6

  const recent = historicalData.slice(-7)
  const previous = historicalData.slice(-14, -7)

  if (previous.length === 0) return 0.7

  const recentAvg = recent.length / 7
  const previousAvg = previous.length / 7
  
  const consistency = 1 - Math.abs(recentAvg - previousAvg) / Math.max(recentAvg, previousAvg, 1)
  
  return Math.max(0.5, Math.min(0.95, 0.6 + consistency * 0.3))
}

function generateDemandRecommendations(forecasts: any[], peakPredictions: any) {
  const recommendations = []

  // High demand periods
  if (peakPredictions.upcomingPeaks.length > 0) {
    recommendations.push({
      type: 'capacity',
      priority: 'high',
      title: 'Prepare for Peak Demand',
      description: `${peakPredictions.upcomingPeaks.length} high-demand periods identified in the next 2 weeks`,
      action: 'Ensure adequate staffing and consider dynamic pricing'
    })
  }

  // Low utilization opportunities
  const lowDemandFields = forecasts.filter(f => 
    f.forecast.reduce((sum, p) => sum + p.predictedDemand, 0) / f.forecast.length < 2
  )

  if (lowDemandFields.length > 0) {
    recommendations.push({
      type: 'marketing',
      priority: 'medium',
      title: 'Underutilized Fields Identified',
      description: `${lowDemandFields.length} fields have low predicted demand`,
      action: 'Consider promotional campaigns or alternative uses'
    })
  }

  return recommendations
}

function calculateUserChurnRisk(userMetrics: any[]) {
  const userRiskMap = new Map()

  userMetrics.forEach(metric => {
    if (!userRiskMap.has(metric.user_id)) {
      userRiskMap.set(metric.user_id, {
        userId: metric.user_id,
        userName: metric.user?.full_name || 'Unknown',
        email: metric.user?.email,
        userSince: metric.user?.created_at,
        totalSessions: 0,
        totalBookings: 0,
        totalCancellations: 0,
        avgEngagement: 0,
        daysSinceLastActivity: 0,
        dataPoints: 0
      })
    }

    const user = userRiskMap.get(metric.user_id)
    user.totalSessions += metric.session_count
    user.totalBookings += metric.bookings_made
    user.totalCancellations += metric.bookings_cancelled
    user.avgEngagement = ((user.avgEngagement * user.dataPoints) + metric.engagement_score) / (user.dataPoints + 1)
    user.dataPoints += 1

    // Calculate days since last activity
    const activityDate = new Date(metric.date)
    const daysSince = Math.floor((Date.now() - activityDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince < user.daysSinceLastActivity || user.daysSinceLastActivity === 0) {
      user.daysSinceLastActivity = daysSince
    }
  })

  return Array.from(userRiskMap.values()).map(user => {
    // Calculate churn risk score (0-1)
    let riskScore = 0

    // Recency factor (higher risk if inactive)
    if (user.daysSinceLastActivity > 30) riskScore += 0.4
    else if (user.daysSinceLastActivity > 14) riskScore += 0.2
    else if (user.daysSinceLastActivity > 7) riskScore += 0.1

    // Engagement factor
    if (user.avgEngagement < 20) riskScore += 0.3
    else if (user.avgEngagement < 40) riskScore += 0.15

    // Booking behavior
    const cancellationRate = user.totalBookings > 0 ? user.totalCancellations / user.totalBookings : 0
    if (cancellationRate > 0.5) riskScore += 0.2
    else if (cancellationRate > 0.3) riskScore += 0.1

    // Activity level
    const avgSessionsPerWeek = user.totalSessions / Math.max(user.dataPoints / 7, 1)
    if (avgSessionsPerWeek < 1) riskScore += 0.2
    else if (avgSessionsPerWeek < 2) riskScore += 0.1

    return {
      ...user,
      churnRisk: Math.min(1, riskScore),
      riskLevel: riskScore > 0.7 ? 'high' : riskScore > 0.4 ? 'medium' : 'low'
    }
  }).sort((a, b) => b.churnRisk - a.churnRisk)
}

function generateRetentionStrategies(riskSegments: any) {
  return {
    highRisk: [
      'Personal outreach call or email',
      'Exclusive discount or free session',
      'Survey to understand issues',
      'Referral incentive program'
    ],
    mediumRisk: [
      'Targeted email campaign',
      'Loyalty program enrollment',
      'Usage tips and best practices',
      'Community engagement activities'
    ],
    low: [
      'Regular newsletter and updates',
      'New feature announcements',
      'Community building events',
      'Referral rewards'
    ]
  }
}

function generateChurnInsights(riskSegments: any, userMetrics: any[]) {
  const insights = []

  const totalUsers = Object.values(riskSegments).reduce((sum: number, segment: any) => sum + segment.length, 0)
  const highRiskPercentage = (riskSegments.high.length / totalUsers) * 100

  if (highRiskPercentage > 20) {
    insights.push({
      type: 'warning',
      message: `${highRiskPercentage.toFixed(1)}% of users are at high risk of churning`,
      recommendation: 'Implement immediate retention campaigns'
    })
  }

  if (riskSegments.high.length > 0) {
    const avgDaysSinceActivity = riskSegments.high.reduce((sum: number, user: any) => sum + user.daysSinceLastActivity, 0) / riskSegments.high.length
    
    insights.push({
      type: 'action',
      message: `High-risk users haven't been active for an average of ${avgDaysSinceActivity.toFixed(1)} days`,
      recommendation: 'Focus on re-engagement within the first 14 days of inactivity'
    })
  }

  return insights
}

function generateTimeSeriesForecast(data: any[], forecastDays: number) {
  if (data.length < 7) {
    return Array.from({ length: forecastDays }, (_, i) => ({
      date: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      value: 0,
      confidence: 0.1
    }))
  }

  // Simple exponential smoothing
  const alpha = 0.3
  let smoothedValue = data[0].value
  const smoothedValues = [smoothedValue]

  for (let i = 1; i < data.length; i++) {
    smoothedValue = alpha * data[i].value + (1 - alpha) * smoothedValue
    smoothedValues.push(smoothedValue)
  }

  // Calculate trend
  const recentValues = smoothedValues.slice(-7)
  const olderValues = smoothedValues.slice(-14, -7)
  const recentAvg = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length
  const olderAvg = olderValues.length > 0 
    ? olderValues.reduce((sum, v) => sum + v, 0) / olderValues.length 
    : recentAvg

  const trendFactor = recentAvg / Math.max(olderAvg, 1)

  // Generate forecast
  const forecast = []
  let lastValue = smoothedValues[smoothedValues.length - 1]

  for (let i = 1; i <= forecastDays; i++) {
    const forecastDate = new Date(Date.now() + i * 24 * 60 * 60 * 1000)
    const trendMultiplier = Math.pow(trendFactor, i / 30)
    const predictedValue = lastValue * trendMultiplier

    forecast.push({
      date: forecastDate.toISOString().split('T')[0],
      value: Math.max(0, Math.round(predictedValue * 100) / 100),
      confidence: Math.max(0.3, 0.9 - (i / forecastDays) * 0.4)
    })
  }

  return forecast
}

function calculateTrend(values: number[]) {
  if (values.length < 2) return { direction: 'stable', magnitude: 0 }

  const firstHalf = values.slice(0, Math.floor(values.length / 2))
  const secondHalf = values.slice(Math.floor(values.length / 2))

  const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length
  const secondAvg = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length

  const change = ((secondAvg - firstAvg) / Math.max(firstAvg, 1)) * 100

  return {
    direction: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable',
    magnitude: Math.abs(change)
  }
}

function calculateForecastConfidence(data: any[]) {
  if (data.length < 14) return 0.6

  // Calculate variance in recent data
  const recentValues = data.slice(-14).map(d => d.total_revenue)
  const mean = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length
  const variance = recentValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / recentValues.length
  const coefficientOfVariation = Math.sqrt(variance) / mean

  // Lower coefficient of variation = higher confidence
  return Math.max(0.4, Math.min(0.95, 1 - coefficientOfVariation))
}

function generateRevenueInsights(historicalData: any[], forecast: any[], trend: any) {
  const insights = []

  const currentRevenue = historicalData.slice(-7).reduce((sum, d) => sum + d.total_revenue, 0)
  const projectedRevenue = forecast.slice(0, 7).reduce((sum, f) => sum + f.value, 0)
  const growth = ((projectedRevenue - currentRevenue) / currentRevenue) * 100

  if (growth > 10) {
    insights.push({
      type: 'positive',
      message: `Revenue is projected to grow by ${growth.toFixed(1)}% next week`,
      recommendation: 'Capitalize on this growth with targeted marketing'
    })
  } else if (growth < -5) {
    insights.push({
      type: 'warning',
      message: `Revenue is projected to decline by ${Math.abs(growth).toFixed(1)}% next week`,
      recommendation: 'Consider promotional strategies to boost bookings'
    })
  }

  if (trend.direction === 'increasing' && trend.magnitude > 15) {
    insights.push({
      type: 'opportunity',
      message: 'Strong upward revenue trend detected',
      recommendation: 'Consider capacity expansion or premium pricing'
    })
  }

  return insights
}

function analyzeCapacityPatterns(utilizationData: any[]) {
  const fieldCapacity = new Map()
  const hourlyCapacity = new Map()
  const dailyCapacity = new Map()

  utilizationData.forEach(record => {
    // By field
    if (!fieldCapacity.has(record.field_id)) {
      fieldCapacity.set(record.field_id, {
        fieldId: record.field_id,
        fieldName: record.field?.name || 'Unknown',
        fieldType: record.field?.type || 'unknown',
        totalUtilization: 0,
        peakUtilization: 0,
        dataPoints: 0,
        underutilizedHours: 0
      })
    }
    const fieldData = fieldCapacity.get(record.field_id)
    fieldData.totalUtilization += record.utilization_rate
    fieldData.peakUtilization = Math.max(fieldData.peakUtilization, record.utilization_rate)
    fieldData.dataPoints += 1
    if (record.utilization_rate < 30) fieldData.underutilizedHours += 1

    // By hour
    if (!hourlyCapacity.has(record.hour)) {
      hourlyCapacity.set(record.hour, {
        hour: record.hour,
        totalUtilization: 0,
        dataPoints: 0
      })
    }
    const hourData = hourlyCapacity.get(record.hour)
    hourData.totalUtilization += record.utilization_rate
    hourData.dataPoints += 1

    // By day
    const dayOfWeek = new Date(record.date).getDay()
    if (!dailyCapacity.has(dayOfWeek)) {
      dailyCapacity.set(dayOfWeek, {
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
        totalUtilization: 0,
        dataPoints: 0
      })
    }
    const dayData = dailyCapacity.get(dayOfWeek)
    dayData.totalUtilization += record.utilization_rate
    dayData.dataPoints += 1
  })

  // Calculate averages
  const fieldSummary = Array.from(fieldCapacity.values()).map(field => ({
    ...field,
    avgUtilization: field.totalUtilization / field.dataPoints,
    underutilizationRate: (field.underutilizedHours / field.dataPoints) * 100
  }))

  const hourlySummary = Array.from(hourlyCapacity.values()).map(hour => ({
    ...hour,
    avgUtilization: hour.totalUtilization / hour.dataPoints,
    time: `${hour.hour.toString().padStart(2, '0')}:00`
  }))

  const dailySummary = Array.from(dailyCapacity.values()).map(day => ({
    ...day,
    avgUtilization: day.totalUtilization / day.dataPoints
  }))

  return {
    summary: {
      byField: fieldSummary,
      byHour: hourlySummary,
      byDay: dailySummary
    }
  }
}

function generateCapacityOptimizations(capacityAnalysis: any) {
  const optimizations = []

  // Underutilized fields
  const underutilized = capacityAnalysis.summary.byField.filter(f => f.avgUtilization < 40)
  if (underutilized.length > 0) {
    optimizations.push({
      type: 'capacity_reallocation',
      priority: 'high',
      title: 'Underutilized Fields Identified',
      description: `${underutilized.length} fields have utilization below 40%`,
      fields: underutilized.map(f => f.fieldName),
      recommendation: 'Consider alternative uses or targeted marketing'
    })
  }

  // Peak hour capacity
  const peakHours = capacityAnalysis.summary.byHour
    .filter(h => h.avgUtilization > 80)
    .sort((a, b) => b.avgUtilization - a.avgUtilization)

  if (peakHours.length > 0) {
    optimizations.push({
      type: 'capacity_expansion',
      priority: 'medium',
      title: 'Peak Hour Capacity Constraints',
      description: `${peakHours.length} hours have high utilization (>80%)`,
      hours: peakHours.slice(0, 3).map(h => h.time),
      recommendation: 'Consider dynamic pricing or additional capacity'
    })
  }

  // Day of week patterns
  const weekendUtil = capacityAnalysis.summary.byDay
    .filter(d => ['Sat', 'Sun'].includes(d.day))
    .reduce((sum, d) => sum + d.avgUtilization, 0) / 2

  const weekdayUtil = capacityAnalysis.summary.byDay
    .filter(d => !['Sat', 'Sun'].includes(d.day))
    .reduce((sum, d) => sum + d.avgUtilization, 0) / 5

  if (weekendUtil < weekdayUtil * 0.6) {
    optimizations.push({
      type: 'scheduling_optimization',
      priority: 'medium',
      title: 'Weekend Underutilization',
      description: `Weekend utilization (${weekendUtil.toFixed(1)}%) is significantly lower than weekdays (${weekdayUtil.toFixed(1)}%)`,
      recommendation: 'Develop weekend-specific programs or pricing strategies'
    })
  }

  return optimizations
}

function calculateOptimizationImpact(capacityAnalysis: any, optimizations: any[]) {
  let projectedUtilizationIncrease = 0
  let projectedRevenueIncrease = 0

  optimizations.forEach(opt => {
    switch (opt.type) {
      case 'capacity_reallocation':
        projectedUtilizationIncrease += 15 // Estimated 15% improvement
        break
      case 'capacity_expansion':
        projectedRevenueIncrease += 25 // Estimated 25% revenue increase for peak hours
        break
      case 'scheduling_optimization':
        projectedUtilizationIncrease += 10 // Estimated 10% improvement
        break
    }
  })

  return {
    projectedUtilizationIncrease: Math.min(projectedUtilizationIncrease, 50),
    projectedRevenueIncrease: Math.min(projectedRevenueIncrease, 100),
    timeframe: '3-6 months'
  }
}

function generateCapacityInsights(capacityAnalysis: any) {
  const insights = []

  const avgUtilization = capacityAnalysis.summary.byField.reduce(
    (sum, f) => sum + f.avgUtilization, 0
  ) / capacityAnalysis.summary.byField.length

  if (avgUtilization < 50) {
    insights.push({
      type: 'opportunity',
      message: `Overall utilization is ${avgUtilization.toFixed(1)}% - significant room for improvement`,
      recommendation: 'Focus on marketing and user engagement strategies'
    })
  } else if (avgUtilization > 85) {
    insights.push({
      type: 'warning',
      message: `High utilization at ${avgUtilization.toFixed(1)}% may lead to booking conflicts`,
      recommendation: 'Consider expanding capacity or implementing waitlists'
    })
  }

  // Field type insights
  const fieldTypes = new Map()
  capacityAnalysis.summary.byField.forEach(field => {
    if (!fieldTypes.has(field.fieldType)) {
      fieldTypes.set(field.fieldType, [])
    }
    fieldTypes.get(field.fieldType).push(field.avgUtilization)
  })

  fieldTypes.forEach((utilizations, type) => {
    const avgTypeUtil = utilizations.reduce((sum, u) => sum + u, 0) / utilizations.length
    if (avgTypeUtil < 30) {
      insights.push({
        type: 'optimization',
        message: `${type} fields have low utilization (${avgTypeUtil.toFixed(1)}%)`,
        recommendation: `Consider repurposing or specialized programs for ${type} fields`
      })
    }
  })

  return insights
}