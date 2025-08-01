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

// GET /api/analytics/activity - Get user activity analytics
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin', 'coach'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const { searchParams } = new URL(req.url)
  const queryParams = analyticsQuerySchema.parse({
    startDate: searchParams.get('startDate'),
    endDate: searchParams.get('endDate'),
    teamId: searchParams.get('teamId'),
  })

  const supabase = createClient()
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  // Cache key for analytics data
  const cacheKey = `analytics:activity:${leagueId}:${JSON.stringify(queryParams)}`

  const data = await cache(cacheKey, async () => {
    // Get user profiles for the league
    let userQuery = supabase
      .from('user_profiles')
      .select('id, full_name, email, role, team_id, created_at')
      .eq('league_id', leagueId)
      .eq('is_active', true)

    if (queryParams.teamId) {
      userQuery = userQuery.eq('team_id', queryParams.teamId)
    }

    const { data: users, error: userError } = await userQuery

    if (userError) {
      throw userError
    }

    const userIds = users?.map(u => u.id) || []

    // Get reservations made by users
    const { data: reservations, error: reservationError } = await supabase
      .from('reservations')
      .select(`
        id,
        user_id,
        team_id,
        date,
        status,
        created_at,
        cancelled_at
      `)
      .in('user_id', userIds)
      .gte('created_at', `${queryParams.startDate}T00:00:00`)
      .lte('created_at', `${queryParams.endDate}T23:59:59`)

    if (reservationError) {
      throw reservationError
    }

    // Get analytics events
    const { data: events, error: eventsError } = await supabase
      .from('analytics_events')
      .select('user_id, event_type, created_at')
      .eq('league_id', leagueId)
      .in('user_id', userIds)
      .gte('created_at', `${queryParams.startDate}T00:00:00`)
      .lte('created_at', `${queryParams.endDate}T23:59:59`)

    if (eventsError) {
      throw eventsError
    }

    // Calculate activity metrics
    const activityByUser = new Map()
    const activityByDate = new Map()
    const activityByHour = new Map()
    const eventTypeCounts = new Map()

    // Initialize user data
    users?.forEach(user => {
      activityByUser.set(user.id, {
        userId: user.id,
        userName: user.full_name,
        userEmail: user.email,
        userRole: user.role,
        teamId: user.team_id,
        totalReservations: 0,
        cancelledReservations: 0,
        totalEvents: 0,
        lastActive: null,
        isNewUser: new Date(user.created_at) >= new Date(queryParams.startDate),
      })
    })

    // Process reservations
    reservations?.forEach(reservation => {
      const userData = activityByUser.get(reservation.user_id)
      if (userData) {
        userData.totalReservations += 1
        if (reservation.status === 'cancelled') {
          userData.cancelledReservations += 1
        }
        if (!userData.lastActive || new Date(reservation.created_at) > new Date(userData.lastActive)) {
          userData.lastActive = reservation.created_at
        }
      }

      // Activity by date
      const date = reservation.created_at.split('T')[0]
      if (!activityByDate.has(date)) {
        activityByDate.set(date, {
          date,
          reservations: 0,
          cancellations: 0,
          events: 0,
          uniqueUsers: new Set(),
        })
      }
      const dateData = activityByDate.get(date)
      dateData.reservations += 1
      if (reservation.status === 'cancelled') {
        dateData.cancellations += 1
      }
      dateData.uniqueUsers.add(reservation.user_id)
    })

    // Process events
    events?.forEach(event => {
      const userData = activityByUser.get(event.user_id)
      if (userData) {
        userData.totalEvents += 1
        if (!userData.lastActive || new Date(event.created_at) > new Date(userData.lastActive)) {
          userData.lastActive = event.created_at
        }
      }

      // Event type counts
      if (!eventTypeCounts.has(event.event_type)) {
        eventTypeCounts.set(event.event_type, 0)
      }
      eventTypeCounts.set(event.event_type, eventTypeCounts.get(event.event_type) + 1)

      // Activity by date
      const date = event.created_at.split('T')[0]
      if (!activityByDate.has(date)) {
        activityByDate.set(date, {
          date,
          reservations: 0,
          cancellations: 0,
          events: 0,
          uniqueUsers: new Set(),
        })
      }
      const dateData = activityByDate.get(date)
      dateData.events += 1
      dateData.uniqueUsers.add(event.user_id)

      // Activity by hour
      const hour = new Date(event.created_at).getHours()
      if (!activityByHour.has(hour)) {
        activityByHour.set(hour, 0)
      }
      activityByHour.set(hour, activityByHour.get(hour) + 1)
    })

    // Convert unique users sets to counts
    activityByDate.forEach((data) => {
      data.uniqueUsers = data.uniqueUsers.size
    })

    // Calculate summary metrics
    const activeUsers = Array.from(activityByUser.values()).filter(u => u.lastActive).length
    const newUsers = Array.from(activityByUser.values()).filter(u => u.isNewUser).length
    const totalReservations = reservations?.length || 0
    const cancellationRate = totalReservations > 0
      ? (reservations?.filter(r => r.status === 'cancelled').length || 0) / totalReservations * 100
      : 0

    // Get most active users
    const mostActiveUsers = Array.from(activityByUser.values())
      .sort((a, b) => (b.totalReservations + b.totalEvents) - (a.totalReservations + a.totalEvents))
      .slice(0, 10)

    // Get peak activity hours
    const peakHours = Array.from(activityByHour.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour, count]) => ({
        hour,
        count,
        time: `${hour.toString().padStart(2, '0')}:00`,
      }))

    return {
      summary: {
        totalUsers: users?.length || 0,
        activeUsers,
        newUsers,
        totalReservations,
        cancellationRate,
        totalEvents: events?.length || 0,
      },
      byUser: mostActiveUsers,
      byDate: Array.from(activityByDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
      eventTypes: Array.from(eventTypeCounts.entries()).map(([type, count]) => ({ type, count })),
      peakHours,
    }
  }, 300) // Cache for 5 minutes

  return successResponse(data)
})