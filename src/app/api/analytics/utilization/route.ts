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

// GET /api/analytics/utilization - Get field utilization analytics
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

  // Cache key for analytics data
  const cacheKey = `analytics:utilization:${leagueId}:${JSON.stringify(queryParams)}`

  const data = await cache(cacheKey, async () => {
    // Get fields for the league
    const { data: fields } = await supabase
      .from('fields')
      .select('id, name, type, hourly_rate')
      .eq('league_id', leagueId)
      .eq('status', 'available')

    const fieldIds = queryParams.fieldId 
      ? [queryParams.fieldId]
      : fields?.map(f => f.id) || []

    // Get reservations within date range
    let reservationQuery = supabase
      .from('reservations')
      .select(`
        id,
        field_id,
        date,
        start_time,
        end_time,
        status,
        team_id,
        attendees
      `)
      .in('field_id', fieldIds)
      .gte('date', queryParams.startDate)
      .lte('date', queryParams.endDate)
      .in('status', ['confirmed', 'completed'])

    if (queryParams.teamId) {
      reservationQuery = reservationQuery.eq('team_id', queryParams.teamId)
    }

    const { data: reservations, error } = await reservationQuery

    if (error) {
      throw error
    }

    // Calculate utilization metrics
    const utilizationByField = new Map()
    const utilizationByDate = new Map()
    const utilizationByHour = new Map()
    const peakHours = new Map()

    // Initialize field data
    fields?.forEach(field => {
      utilizationByField.set(field.id, {
        fieldId: field.id,
        fieldName: field.name,
        fieldType: field.type,
        totalHours: 0,
        totalReservations: 0,
        totalRevenue: 0,
        utilizationRate: 0,
        averageAttendees: 0,
      })
    })

    // Process reservations
    reservations?.forEach(reservation => {
      const startTime = new Date(`2000-01-01T${reservation.start_time}`)
      const endTime = new Date(`2000-01-01T${reservation.end_time}`)
      const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
      
      // Update field utilization
      const fieldData = utilizationByField.get(reservation.field_id)
      if (fieldData) {
        fieldData.totalHours += durationHours
        fieldData.totalReservations += 1
        fieldData.totalRevenue += durationHours * (fields?.find(f => f.id === reservation.field_id)?.hourly_rate || 0)
        fieldData.averageAttendees = ((fieldData.averageAttendees * (fieldData.totalReservations - 1)) + (reservation.attendees || 0)) / fieldData.totalReservations
      }

      // Update daily utilization
      const dateKey = reservation.date
      if (!utilizationByDate.has(dateKey)) {
        utilizationByDate.set(dateKey, {
          date: dateKey,
          totalHours: 0,
          totalReservations: 0,
        })
      }
      const dateData = utilizationByDate.get(dateKey)
      dateData.totalHours += durationHours
      dateData.totalReservations += 1

      // Update hourly utilization
      const startHour = startTime.getHours()
      for (let hour = startHour; hour < endTime.getHours(); hour++) {
        if (!utilizationByHour.has(hour)) {
          utilizationByHour.set(hour, 0)
        }
        utilizationByHour.set(hour, utilizationByHour.get(hour) + 1)
      }
    })

    // Calculate utilization rates
    const totalDays = Math.ceil(
      (new Date(queryParams.endDate).getTime() - new Date(queryParams.startDate).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1

    const hoursPerDay = 12 // Assuming fields are available 12 hours per day (8am - 8pm)
    const totalAvailableHours = totalDays * hoursPerDay * fieldIds.length

    utilizationByField.forEach((fieldData) => {
      fieldData.utilizationRate = totalAvailableHours > 0 
        ? (fieldData.totalHours / (totalDays * hoursPerDay)) * 100 
        : 0
    })

    // Find peak hours
    const sortedHours = Array.from(utilizationByHour.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, count]) => ({
        hour,
        count,
        time: `${hour.toString().padStart(2, '0')}:00`,
      }))

    return {
      summary: {
        totalReservations: reservations?.length || 0,
        totalHours: Array.from(utilizationByField.values()).reduce((sum, field) => sum + field.totalHours, 0),
        totalRevenue: Array.from(utilizationByField.values()).reduce((sum, field) => sum + field.totalRevenue, 0),
        averageUtilizationRate: Array.from(utilizationByField.values()).reduce((sum, field) => sum + field.utilizationRate, 0) / fieldIds.length,
      },
      byField: Array.from(utilizationByField.values()),
      byDate: Array.from(utilizationByDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
      peakHours: sortedHours,
    }
  }, 300) // Cache for 5 minutes

  return successResponse(data)
})