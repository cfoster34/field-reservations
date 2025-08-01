import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  authenticate,
  validateBody,
  successResponse,
  errorResponse,
  logRequest,
  paginatedResponse,
  rateLimit
} from '@/lib/api/middleware'
import { createReservationSchema } from '@/lib/api/validation'

// GET /api/reservations - List reservations
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authenticate user
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    
    const supabase = createClient()
    const searchParams = req.nextUrl.searchParams
    
    // Parse pagination params
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const sortBy = searchParams.get('sortBy') || 'date'
    const sortOrder = searchParams.get('sortOrder') || 'asc'
    
    // Parse filter params
    const userId = searchParams.get('userId')
    const fieldId = searchParams.get('fieldId')
    const teamId = searchParams.get('teamId')
    const status = searchParams.get('status')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    
    // Build query
    let query = supabase
      .from('reservations')
      .select(`
        *,
        field:fields(id, name, type, address, hourly_rate),
        user:user_profiles(id, full_name, email),
        team:teams(id, name)
      `, { count: 'exact' })
    
    // Apply filters based on user role
    if (auth.user.profile.role === 'member') {
      // Members can only see their own reservations
      query = query.eq('user_id', auth.user.id)
    } else if (auth.user.profile.role === 'coach') {
      // Coaches can see their team's reservations
      query = query.or(`user_id.eq.${auth.user.id},team_id.eq.${auth.user.profile.team_id}`)
    } else if (auth.user.profile.role === 'league_manager') {
      // League managers can see all reservations in their league
      query = query.in('field_id', 
        supabase
          .from('fields')
          .select('id')
          .eq('league_id', auth.user.profile.league_id)
      )
    }
    // Admins can see all reservations (no additional filtering)
    
    // Apply other filters
    if (userId) query = query.eq('user_id', userId)
    if (fieldId) query = query.eq('field_id', fieldId)
    if (teamId) query = query.eq('team_id', teamId)
    if (status) query = query.eq('status', status)
    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo) query = query.lte('date', dateTo)
    
    // Apply sorting
    const ascending = sortOrder === 'asc'
    if (sortBy === 'date') {
      query = query.order('date', { ascending }).order('start_time', { ascending })
    } else {
      query = query.order(sortBy, { ascending })
    }
    
    // Apply pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)
    
    // Execute query
    const { data: reservations, error, count } = await query
    
    if (error) {
      return errorResponse('Failed to fetch reservations', 400, error)
    }
    
    return paginatedResponse(
      reservations || [],
      count || 0,
      page,
      pageSize
    )
  })(req)
}

// POST /api/reservations - Create reservation
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Rate limiting for reservation creation
    const rateLimitResult = await rateLimit(req, 'reservations:create', {
      windowMs: 60 * 1000, // 1 minute
      max: 10, // 10 reservations per minute
    })
    if (!rateLimitResult.success) {
      return errorResponse(rateLimitResult.error!, 429, {
        retryAfter: rateLimitResult.retryAfter,
      })
    }
    
    // Authenticate user
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    
    // Check if user is approved
    if (!auth.user.profile.is_approved) {
      return errorResponse('Your account needs to be approved before making reservations', 403)
    }
    
    // Validate request body
    const validation = await validateBody(createReservationSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const reservationData = validation.data
    const supabase = createClient()
    
    // Check if this is from a booking session
    const sessionId = req.headers.get('x-booking-session')
    let bookingSession = null
    
    if (sessionId) {
      // Validate booking session
      const { data: session } = await supabase
        .from('booking_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', auth.user.id)
        .eq('status', 'active')
        .single()
      
      if (!session || new Date(session.expires_at) < new Date()) {
        return errorResponse('Invalid or expired booking session', 400)
      }
      
      bookingSession = session
    }
    
    // Get field details
    const { data: field } = await supabase
      .from('fields')
      .select('*')
      .eq('id', reservationData.fieldId)
      .single()
    
    if (!field) {
      return errorResponse('Field not found', 404)
    }
    
    if (field.status !== 'available') {
      return errorResponse('Field is not available for booking', 400)
    }
    
    // Check field capacity
    if (reservationData.attendees > field.capacity) {
      return errorResponse(`Field capacity is ${field.capacity} people`, 400)
    }
    
    // Check availability using database function
    const { data: hasConflict } = await supabase
      .rpc('check_reservation_conflict', {
        p_field_id: reservationData.fieldId,
        p_date: reservationData.date,
        p_start_time: reservationData.startTime,
        p_end_time: reservationData.endTime,
      })
    
    if (hasConflict) {
      return errorResponse('Time slot is already reserved', 409)
    }
    
    // Calculate total price
    const startHour = parseInt(reservationData.startTime.split(':')[0])
    const endHour = parseInt(reservationData.endTime.split(':')[0])
    const hours = endHour - startHour
    const totalPrice = hours * field.hourly_rate
    
    // Handle recurring bookings
    if (reservationData.recurringPattern) {
      // Use the database function to create recurring reservations
      const { data: recurringResults, error: recurringError } = await supabase
        .rpc('create_recurring_reservations', {
          p_user_id: auth.user.id,
          p_field_id: reservationData.fieldId,
          p_team_id: reservationData.teamId || auth.user.profile.team_id,
          p_start_date: reservationData.date,
          p_start_time: reservationData.startTime,
          p_end_time: reservationData.endTime,
          p_pattern: reservationData.recurringPattern,
          p_purpose: reservationData.purpose,
          p_attendees: reservationData.attendees,
          p_notes: reservationData.notes
        })
      
      if (recurringError) {
        return errorResponse('Failed to create recurring reservations', 400, recurringError)
      }
      
      // Get the created reservations
      const successfulReservations = recurringResults.filter((r: any) => r.success)
      const failedReservations = recurringResults.filter((r: any) => !r.success)
      
      if (successfulReservations.length === 0) {
        return errorResponse('All recurring reservations failed due to conflicts', 409)
      }
      
      // Update booking session if exists
      if (bookingSession) {
        await supabase
          .from('booking_sessions')
          .update({ status: 'completed' })
          .eq('id', sessionId)
      }
      
      return successResponse({
        message: `Created ${successfulReservations.length} recurring reservations`,
        successful: successfulReservations,
        failed: failedReservations,
        totalPrice: totalPrice * successfulReservations.length
      }, 201)
    }
    
    // Create single reservation
    const { data: newReservation, error } = await supabase
      .from('reservations')
      .insert({
        field_id: reservationData.fieldId,
        user_id: auth.user.id,
        team_id: reservationData.teamId || auth.user.profile.team_id,
        date: reservationData.date,
        start_time: reservationData.startTime,
        end_time: reservationData.endTime,
        status: 'pending',
        purpose: reservationData.purpose,
        attendees: reservationData.attendees,
        notes: reservationData.notes,
        share_token: generateShareToken(),
        metadata: reservationData.metadata
      })
      .select(`
        *,
        field:fields(id, name, type, address, hourly_rate),
        user:user_profiles(id, full_name, email),
        team:teams(id, name)
      `)
      .single()
    
    if (error) {
      return errorResponse('Failed to create reservation', 400, error)
    }
    
    // Create payment record
    await supabase
      .from('payments')
      .insert({
        user_id: auth.user.id,
        league_id: field.league_id,
        reservation_id: newReservation.id,
        amount: totalPrice,
        status: 'pending',
        description: `Reservation for ${field.name} on ${reservationData.date}`,
        metadata: {
          field_id: field.id,
          field_name: field.name,
          date: reservationData.date,
          time: `${reservationData.startTime} - ${reservationData.endTime}`,
        },
      })
    
    // Schedule reminder notification
    const reservationDateTime = new Date(`${reservationData.date}T${reservationData.startTime}`)
    const reminderTime = new Date(reservationDateTime.getTime() - (auth.user.profile.notification_preferences.reminder_hours * 60 * 60 * 1000))
    
    await supabase
      .from('notifications')
      .insert({
        user_id: auth.user.id,
        type: 'email',
        title: 'Reservation Reminder',
        content: `Reminder: You have a reservation at ${field.name} on ${reservationData.date} from ${reservationData.startTime} to ${reservationData.endTime}`,
        data: {
          reservation_id: newReservation.id,
          field_name: field.name,
          date: reservationData.date,
          start_time: reservationData.startTime,
          end_time: reservationData.endTime,
        },
        scheduled_for: reminderTime.toISOString(),
      })
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        league_id: field.league_id,
        event_type: 'reservation_created',
        event_data: {
          reservation_id: newReservation.id,
          field_id: field.id,
          field_name: field.name,
          date: reservationData.date,
          total_price: totalPrice,
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    // Update booking session if exists
    if (bookingSession) {
      await supabase
        .from('booking_sessions')
        .update({ status: 'completed' })
        .eq('id', sessionId)
    }
    
    return successResponse({
      reservation: newReservation,
      payment: {
        amount: totalPrice,
        status: 'pending',
      },
    }, 201)
  })(req)
}

// Helper function to generate share token
function generateShareToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}