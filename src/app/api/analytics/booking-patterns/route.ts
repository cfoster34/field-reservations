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

// GET /api/analytics/booking-patterns - Booking pattern analysis
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin', 'coach'])(req)
  
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

  const cacheKey = `analytics:booking-patterns:${leagueId}:${JSON.stringify(queryParams)}`

  const data = await cache(cacheKey, async () => {
    // Get base reservation data
    let reservationQuery = supabase
      .from('reservations')
      .select(`
        id,
        field_id,
        team_id,
        user_id,
        date,
        start_time,
        end_time,
        status,
        created_at,
        cancelled_at,
        attendees,
        field:fields(name, type),
        team:teams(name),
        user:user_profiles(full_name)
      `)
      .eq('league_id', leagueId)
      .gte('date', queryParams.startDate)
      .lte('date', queryParams.endDate)

    if (queryParams.fieldId) {
      reservationQuery = reservationQuery.eq('field_id', queryParams.fieldId)
    }
    if (queryParams.teamId) {
      reservationQuery = reservationQuery.eq('team_id', queryParams.teamId)
    }

    const { data: reservations, error } = await reservationQuery

    if (error) {
      throw error
    }

    // Analyze patterns
    const patterns = {
      temporal: analyzeTemporalPatterns(reservations || []),
      lead_time: analyzeLeadTimePatterns(reservations || []),
      duration: analyzeDurationPatterns(reservations || []),
      frequency: analyzeFrequencyPatterns(reservations || []),
      seasonal: analyzeSeasonalPatterns(reservations || []),
      cancellation: analyzeCancellationPatterns(reservations || []),
      optimization: generateOptimizationInsights(reservations || [])
    }

    return patterns
  }, 300) // Cache for 5 minutes

  return successResponse(data)
})

function analyzeTemporalPatterns(reservations: any[]) {
  const hourlyBookings = new Map()
  const dailyBookings = new Map()
  const weeklyBookings = new Map()

  // Days of week mapping
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  reservations.forEach(reservation => {
    const date = new Date(reservation.date)
    const startTime = new Date(`2000-01-01T${reservation.start_time}`)
    const hour = startTime.getHours()
    const dayOfWeek = daysOfWeek[date.getDay()]

    // Hourly patterns
    if (!hourlyBookings.has(hour)) {
      hourlyBookings.set(hour, { bookings: 0, cancellations: 0, revenue: 0 })
    }
    const hourData = hourlyBookings.get(hour)
    hourData.bookings += 1
    if (reservation.status === 'cancelled') {
      hourData.cancellations += 1
    }

    // Daily patterns
    if (!dailyBookings.has(dayOfWeek)) {
      dailyBookings.set(dayOfWeek, { bookings: 0, cancellations: 0, avgAttendees: 0 })
    }
    const dayData = dailyBookings.get(dayOfWeek)
    dayData.bookings += 1
    if (reservation.status === 'cancelled') {
      dayData.cancellations += 1
    }
    dayData.avgAttendees = ((dayData.avgAttendees * (dayData.bookings - 1)) + (reservation.attendees || 0)) / dayData.bookings

    // Weekly patterns
    const weekStart = getWeekStart(date)
    const weekKey = weekStart.toISOString().split('T')[0]
    if (!weeklyBookings.has(weekKey)) {
      weeklyBookings.set(weekKey, { week: weekKey, bookings: 0, uniqueUsers: new Set() })
    }
    const weekData = weeklyBookings.get(weekKey)
    weekData.bookings += 1
    weekData.uniqueUsers.add(reservation.user_id)
  })

  // Convert to arrays and calculate metrics
  const hourlyData = Array.from(hourlyBookings.entries())
    .map(([hour, data]) => ({
      hour,
      time: `${hour.toString().padStart(2, '0')}:00`,
      bookings: data.bookings,
      cancellationRate: data.bookings > 0 ? (data.cancellations / data.bookings) * 100 : 0,
      popularity: data.bookings
    }))
    .sort((a, b) => a.hour - b.hour)

  const dailyData = Array.from(dailyBookings.entries())
    .map(([day, data]) => ({
      day,
      bookings: data.bookings,
      cancellationRate: data.bookings > 0 ? (data.cancellations / data.bookings) * 100 : 0,
      avgAttendees: Math.round(data.avgAttendees * 10) / 10
    }))

  const weeklyData = Array.from(weeklyBookings.values())
    .map(data => ({
      ...data,
      uniqueUsers: data.uniqueUsers.size
    }))
    .sort((a, b) => a.week.localeCompare(b.week))

  // Find peak times
  const peakHour = hourlyData.reduce((max, current) => 
    current.bookings > max.bookings ? current : max, hourlyData[0])
  
  const peakDay = dailyData.reduce((max, current) => 
    current.bookings > max.bookings ? current : max, dailyData[0])

  return {
    hourly: hourlyData,
    daily: dailyData,
    weekly: weeklyData,
    peaks: {
      hour: peakHour,
      day: peakDay
    }
  }
}

function analyzeLeadTimePatterns(reservations: any[]) {
  const leadTimes = reservations
    .filter(r => r.created_at && r.date)
    .map(reservation => {
      const createdDate = new Date(reservation.created_at)
      const reservationDate = new Date(reservation.date)
      const leadTimeHours = (reservationDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60)
      
      return {
        ...reservation,
        leadTimeHours: Math.max(0, leadTimeHours)
      }
    })

  if (leadTimes.length === 0) {
    return {
      distribution: [],
      averageLeadTime: 0,
      medianLeadTime: 0,
      patterns: []
    }
  }

  // Calculate distribution buckets
  const buckets = [
    { label: '< 2 hours', min: 0, max: 2, count: 0 },
    { label: '2-24 hours', min: 2, max: 24, count: 0 },
    { label: '1-3 days', min: 24, max: 72, count: 0 },
    { label: '3-7 days', min: 72, max: 168, count: 0 },
    { label: '1-2 weeks', min: 168, max: 336, count: 0 },
    { label: '> 2 weeks', min: 336, max: Infinity, count: 0 }
  ]

  leadTimes.forEach(reservation => {
    const bucket = buckets.find(b => 
      reservation.leadTimeHours >= b.min && reservation.leadTimeHours < b.max)
    if (bucket) bucket.count += 1
  })

  // Calculate statistics
  const sortedLeadTimes = leadTimes.map(r => r.leadTimeHours).sort((a, b) => a - b)
  const averageLeadTime = sortedLeadTimes.reduce((sum, time) => sum + time, 0) / sortedLeadTimes.length
  const medianLeadTime = sortedLeadTimes[Math.floor(sortedLeadTimes.length / 2)]

  // Analyze patterns by field type and day of week
  const patternsByField = new Map()
  const patternsByDay = new Map()

  leadTimes.forEach(reservation => {
    const fieldType = reservation.field?.type || 'unknown'
    const dayOfWeek = new Date(reservation.date).getDay()

    // By field type
    if (!patternsByField.has(fieldType)) {
      patternsByField.set(fieldType, [])
    }
    patternsByField.get(fieldType).push(reservation.leadTimeHours)

    // By day of week
    if (!patternsByDay.has(dayOfWeek)) {
      patternsByDay.set(dayOfWeek, [])
    }
    patternsByDay.get(dayOfWeek).push(reservation.leadTimeHours)
  })

  const fieldPatterns = Array.from(patternsByField.entries())
    .map(([fieldType, times]) => ({
      fieldType,
      averageLeadTime: times.reduce((sum, time) => sum + time, 0) / times.length,
      count: times.length
    }))

  const dayPatterns = Array.from(patternsByDay.entries())
    .map(([day, times]) => ({
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day],
      averageLeadTime: times.reduce((sum, time) => sum + time, 0) / times.length,
      count: times.length
    }))

  return {
    distribution: buckets,
    averageLeadTime: Math.round(averageLeadTime * 10) / 10,
    medianLeadTime: Math.round(medianLeadTime * 10) / 10,
    patterns: {
      byFieldType: fieldPatterns,
      byDayOfWeek: dayPatterns
    }
  }
}

function analyzeDurationPatterns(reservations: any[]) {
  const durations = reservations
    .filter(r => r.start_time && r.end_time)
    .map(reservation => {
      const startTime = new Date(`2000-01-01T${reservation.start_time}`)
      const endTime = new Date(`2000-01-01T${reservation.end_time}`)
      const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
      
      return {
        ...reservation,
        durationHours
      }
    })

  if (durations.length === 0) {
    return {
      distribution: [],
      averageDuration: 0,
      mostCommonDuration: 0,
      patterns: []
    }
  }

  // Calculate distribution
  const durationCounts = new Map()
  durations.forEach(reservation => {
    const duration = reservation.durationHours
    durationCounts.set(duration, (durationCounts.get(duration) || 0) + 1)
  })

  const distribution = Array.from(durationCounts.entries())
    .map(([duration, count]) => ({
      duration,
      count,
      percentage: (count / durations.length) * 100
    }))
    .sort((a, b) => a.duration - b.duration)

  const averageDuration = durations.reduce((sum, r) => sum + r.durationHours, 0) / durations.length
  const mostCommonDuration = distribution.reduce((max, current) => 
    current.count > max.count ? current : max, distribution[0])

  // Analyze patterns by field type and team
  const patternsByField = new Map()
  const patternsByTeam = new Map()

  durations.forEach(reservation => {
    const fieldType = reservation.field?.type || 'unknown'
    const teamName = reservation.team?.name || 'Individual'

    // By field type
    if (!patternsByField.has(fieldType)) {
      patternsByField.set(fieldType, [])
    }
    patternsByField.get(fieldType).push(reservation.durationHours)

    // By team
    if (!patternsByTeam.has(teamName)) {
      patternsByTeam.set(teamName, [])
    }
    patternsByTeam.get(teamName).push(reservation.durationHours)
  })

  const fieldPatterns = Array.from(patternsByField.entries())
    .map(([fieldType, durations]) => ({
      fieldType,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      count: durations.length
    }))

  const teamPatterns = Array.from(patternsByTeam.entries())
    .map(([teamName, durations]) => ({
      teamName,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      count: durations.length
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10) // Top 10 teams

  return {
    distribution,
    averageDuration: Math.round(averageDuration * 10) / 10,
    mostCommonDuration: mostCommonDuration?.duration || 0,
    patterns: {
      byFieldType: fieldPatterns,
      byTeam: teamPatterns
    }
  }
}

function analyzeFrequencyPatterns(reservations: any[]) {
  const userBookings = new Map()
  const teamBookings = new Map()

  reservations.forEach(reservation => {
    // User frequency
    const userId = reservation.user_id
    if (!userBookings.has(userId)) {
      userBookings.set(userId, {
        userId,
        userName: reservation.user?.full_name || 'Unknown',
        bookings: 0,
        cancellations: 0,
        totalHours: 0
      })
    }
    const userData = userBookings.get(userId)
    userData.bookings += 1
    if (reservation.status === 'cancelled') {
      userData.cancellations += 1
    }
    
    if (reservation.start_time && reservation.end_time) {
      const startTime = new Date(`2000-01-01T${reservation.start_time}`)
      const endTime = new Date(`2000-01-01T${reservation.end_time}`)
      userData.totalHours += (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
    }

    // Team frequency
    if (reservation.team_id) {
      const teamId = reservation.team_id
      if (!teamBookings.has(teamId)) {
        teamBookings.set(teamId, {
          teamId,
          teamName: reservation.team?.name || 'Unknown',
          bookings: 0,
          cancellations: 0,
          uniqueUsers: new Set()
        })
      }
      const teamData = teamBookings.get(teamId)
      teamData.bookings += 1
      if (reservation.status === 'cancelled') {
        teamData.cancellations += 1
      }
      teamData.uniqueUsers.add(reservation.user_id)
    }
  })

  // Process user data
  const userData = Array.from(userBookings.values())
    .map(user => ({
      ...user,
      cancellationRate: user.bookings > 0 ? (user.cancellations / user.bookings) * 100 : 0,
      avgHoursPerBooking: user.bookings > 0 ? user.totalHours / user.bookings : 0
    }))
    .sort((a, b) => b.bookings - a.bookings)

  // Process team data
  const teamData = Array.from(teamBookings.values())
    .map(team => ({
      ...team,
      uniqueUsers: team.uniqueUsers.size,
      cancellationRate: team.bookings > 0 ? (team.cancellations / team.bookings) * 100 : 0,
      avgBookingsPerUser: team.uniqueUsers.size > 0 ? team.bookings / team.uniqueUsers.size : 0
    }))
    .sort((a, b) => b.bookings - a.bookings)

  // Frequency distribution
  const frequencyBuckets = [
    { label: '1 booking', min: 1, max: 1, count: 0 },
    { label: '2-5 bookings', min: 2, max: 5, count: 0 },
    { label: '6-10 bookings', min: 6, max: 10, count: 0 },
    { label: '11-20 bookings', min: 11, max: 20, count: 0 },
    { label: '20+ bookings', min: 21, max: Infinity, count: 0 }
  ]

  userData.forEach(user => {
    const bucket = frequencyBuckets.find(b => 
      user.bookings >= b.min && user.bookings <= b.max)
    if (bucket) bucket.count += 1
  })

  return {
    userFrequency: {
      distribution: frequencyBuckets,
      topUsers: userData.slice(0, 20),
      totalUniqueUsers: userData.length
    },
    teamFrequency: {
      topTeams: teamData.slice(0, 10),
      totalActiveTeams: teamData.length
    }
  }
}

function analyzeSeasonalPatterns(reservations: any[]) {
  const monthlyBookings = new Map()
  const quarterlyBookings = new Map()

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  reservations.forEach(reservation => {
    const date = new Date(reservation.date)
    const month = date.getMonth()
    const quarter = Math.floor(month / 3) + 1

    // Monthly patterns
    const monthName = months[month]
    if (!monthlyBookings.has(monthName)) {
      monthlyBookings.set(monthName, { month: monthName, bookings: 0, revenue: 0 })
    }
    monthlyBookings.get(monthName).bookings += 1

    // Quarterly patterns
    const quarterName = `Q${quarter}`
    if (!quarterlyBookings.has(quarterName)) {
      quarterlyBookings.set(quarterName, { quarter: quarterName, bookings: 0 })
    }
    quarterlyBookings.get(quarterName).bookings += 1
  })

  const monthlyData = Array.from(monthlyBookings.values())
  const quarterlyData = Array.from(quarterlyBookings.values())

  // Find seasonal trends
  const peakMonth = monthlyData.reduce((max, current) => 
    current.bookings > max.bookings ? current : max, 
    monthlyData[0] || { month: 'N/A', bookings: 0 })

  const peakQuarter = quarterlyData.reduce((max, current) => 
    current.bookings > max.bookings ? current : max,
    quarterlyData[0] || { quarter: 'N/A', bookings: 0 })

  return {
    monthly: monthlyData,
    quarterly: quarterlyData,
    trends: {
      peakMonth,
      peakQuarter,
      seasonality: calculateSeasonality(monthlyData)
    }
  }
}

function analyzeCancellationPatterns(reservations: any[]) {
  const cancellations = reservations.filter(r => r.status === 'cancelled' && r.cancelled_at)
  
  if (cancellations.length === 0) {
    return {
      rate: 0,
      patterns: [],
      insights: []
    }
  }

  const totalBookings = reservations.length
  const cancellationRate = (cancellations.length / totalBookings) * 100

  // Analyze cancellation timing
  const cancellationTiming = cancellations.map(reservation => {
    const createdAt = new Date(reservation.created_at)
    const cancelledAt = new Date(reservation.cancelled_at)
    const reservationDate = new Date(reservation.date)
    
    const timeFromBookingToCancellation = (cancelledAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
    const timeFromCancellationToReservation = (reservationDate.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60)
    
    return {
      ...reservation,
      timeFromBookingToCancellation,
      timeFromCancellationToReservation
    }
  })

  // Timing distribution
  const timingBuckets = [
    { label: '< 1 hour before', min: 0, max: 1, count: 0 },
    { label: '1-24 hours before', min: 1, max: 24, count: 0 },
    { label: '1-3 days before', min: 24, max: 72, count: 0 },
    { label: '> 3 days before', min: 72, max: Infinity, count: 0 }
  ]

  cancellationTiming.forEach(cancellation => {
    const bucket = timingBuckets.find(b => 
      cancellation.timeFromCancellationToReservation >= b.min && 
      cancellation.timeFromCancellationToReservation < b.max)
    if (bucket) bucket.count += 1
  })

  // Patterns by field type and day of week
  const patternsByField = new Map()
  const patternsByDay = new Map()

  cancellations.forEach(reservation => {
    const fieldType = reservation.field?.type || 'unknown'
    const dayOfWeek = new Date(reservation.date).getDay()

    patternsByField.set(fieldType, (patternsByField.get(fieldType) || 0) + 1)
    patternsByDay.set(dayOfWeek, (patternsByDay.get(dayOfWeek) || 0) + 1)
  })

  const fieldPatterns = Array.from(patternsByField.entries())
    .map(([fieldType, count]) => ({ fieldType, cancellations: count }))

  const dayPatterns = Array.from(patternsByDay.entries())
    .map(([day, count]) => ({
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day],
      cancellations: count
    }))

  return {
    rate: cancellationRate,
    timing: timingBuckets,
    patterns: {
      byFieldType: fieldPatterns,
      byDayOfWeek: dayPatterns
    },
    averageTimingHours: {
      fromBooking: cancellationTiming.reduce((sum, c) => sum + c.timeFromBookingToCancellation, 0) / cancellationTiming.length,
      beforeReservation: cancellationTiming.reduce((sum, c) => sum + c.timeFromCancellationToReservation, 0) / cancellationTiming.length
    }
  }
}

function generateOptimizationInsights(reservations: any[]) {
  const insights = []

  // Analyze the data to generate actionable insights
  const hourlyBookings = new Map()
  const dailyBookings = new Map()
  const fieldTypeBookings = new Map()

  reservations.forEach(reservation => {
    const hour = new Date(`2000-01-01T${reservation.start_time}`).getHours()
    const day = new Date(reservation.date).getDay()
    const fieldType = reservation.field?.type || 'unknown'

    hourlyBookings.set(hour, (hourlyBookings.get(hour) || 0) + 1)
    dailyBookings.set(day, (dailyBookings.get(day) || 0) + 1)
    fieldTypeBookings.set(fieldType, (fieldTypeBookings.get(fieldType) || 0) + 1)
  })

  // Find optimization opportunities
  const peakHour = Array.from(hourlyBookings.entries())
    .reduce((max, [hour, count]) => count > max.count ? { hour, count } : max, { hour: 0, count: 0 })

  const lowUtilizationHours = Array.from(hourlyBookings.entries())
    .filter(([hour, count]) => count < peakHour.count * 0.3)
    .map(([hour, count]) => ({ hour, count }))

  if (lowUtilizationHours.length > 0) {
    insights.push({
      type: 'optimization',
      category: 'utilization',
      title: 'Low Utilization Hours Identified',
      description: `Hours ${lowUtilizationHours.map(h => h.hour).join(', ')} have significantly lower booking rates`,
      recommendation: 'Consider promotional pricing or targeted marketing for these time slots',
      impact: 'medium'
    })
  }

  // Weekend vs weekday analysis
  const weekendBookings = (dailyBookings.get(0) || 0) + (dailyBookings.get(6) || 0)
  const weekdayBookings = Array.from(dailyBookings.entries())
    .filter(([day]) => day >= 1 && day <= 5)
    .reduce((sum, [, count]) => sum + count, 0)

  if (weekendBookings < weekdayBookings * 0.5) {
    insights.push({
      type: 'opportunity',
      category: 'scheduling',
      title: 'Weekend Utilization Opportunity',
      description: 'Weekend bookings are significantly lower than weekdays',
      recommendation: 'Develop weekend-specific programs or family-friendly activities',
      impact: 'high'
    })
  }

  // Field type utilization
  const fieldTypes = Array.from(fieldTypeBookings.entries())
    .sort((a, b) => b[1] - a[1])

  if (fieldTypes.length > 1) {
    const topField = fieldTypes[0]
    const underutilizedFields = fieldTypes.filter(([, count]) => count < topField[1] * 0.4)

    if (underutilizedFields.length > 0) {
      insights.push({
        type: 'optimization',
        category: 'capacity',
        title: 'Underutilized Field Types',
        description: `${underutilizedFields.map(([type]) => type).join(', ')} fields have low booking rates`,
        recommendation: 'Consider repurposing or marketing these field types differently',
        impact: 'medium'
      })
    }
  }

  return insights
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day
  return new Date(d.setDate(diff))
}

function calculateSeasonality(monthlyData: any[]): string {
  if (monthlyData.length < 6) return 'Insufficient data'

  const summerMonths = monthlyData.filter(m => ['June', 'July', 'August'].includes(m.month))
  const winterMonths = monthlyData.filter(m => ['December', 'January', 'February'].includes(m.month))

  const summerAvg = summerMonths.reduce((sum, m) => sum + m.bookings, 0) / Math.max(summerMonths.length, 1)
  const winterAvg = winterMonths.reduce((sum, m) => sum + m.bookings, 0) / Math.max(winterMonths.length, 1)

  if (summerAvg > winterAvg * 1.2) return 'Summer peak'
  if (winterAvg > summerAvg * 1.2) return 'Winter peak'
  return 'Consistent year-round'
}