import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  authenticate,
  validateBody,
  successResponse,
  errorResponse,
  logRequest,
  cache
} from '@/lib/api/middleware'
import { updateReservationSchema } from '@/lib/api/validation'

interface RouteParams {
  params: {
    id: string
  }
}

// GET /api/reservations/[id] - Get reservation by ID
export async function GET(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authenticate user
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    
    const reservationId = params.id
    const supabase = createClient()
    
    // Get reservation
    const { data: reservation, error } = await supabase
      .from('reservations')
      .select(`
        *,
        field:fields(id, name, type, address, hourly_rate, amenities, images),
        user:user_profiles(id, full_name, email, phone),
        team:teams(id, name),
        payment:payments(id, amount, status, stripe_payment_intent_id)
      `)
      .eq('id', reservationId)
      .single()
    
    if (error || !reservation) {
      return errorResponse('Reservation not found', 404)
    }
    
    // Check access permissions
    if (auth.user.profile.role === 'member' && reservation.user_id !== auth.user.id) {
      return errorResponse('Access denied', 403)
    }
    
    if (auth.user.profile.role === 'coach' && 
        reservation.user_id !== auth.user.id && 
        reservation.team_id !== auth.user.profile.team_id) {
      return errorResponse('Access denied', 403)
    }
    
    if (auth.user.profile.role === 'league_manager' && 
        reservation.field.league_id !== auth.user.profile.league_id) {
      return errorResponse('Access denied', 403)
    }
    
    return successResponse(reservation)
  })(req, { params })
}

// PUT /api/reservations/[id] - Update reservation
export async function PUT(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authenticate user
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    
    // Validate request body
    const validation = await validateBody(updateReservationSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const reservationId = params.id
    const updateData = validation.data
    const supabase = createClient()
    
    // Get existing reservation
    const { data: reservation } = await supabase
      .from('reservations')
      .select(`
        *,
        field:fields(id, capacity)
      `)
      .eq('id', reservationId)
      .single()
    
    if (!reservation) {
      return errorResponse('Reservation not found', 404)
    }
    
    // Check permissions
    if (reservation.user_id !== auth.user.id && 
        auth.user.profile.role !== 'admin' && 
        auth.user.profile.role !== 'league_manager') {
      return errorResponse('Access denied', 403)
    }
    
    // Check if reservation can be updated
    if (reservation.status === 'cancelled') {
      return errorResponse('Cannot update cancelled reservation', 400)
    }
    
    if (reservation.status === 'completed') {
      return errorResponse('Cannot update completed reservation', 400)
    }
    
    // Check if reservation is in the past
    const reservationDate = new Date(`${reservation.date}T${reservation.start_time}`)
    if (reservationDate < new Date()) {
      return errorResponse('Cannot update past reservations', 400)
    }
    
    // Validate attendees if provided
    if (updateData.attendees && updateData.attendees > reservation.field.capacity) {
      return errorResponse(`Field capacity is ${reservation.field.capacity} people`, 400)
    }
    
    // Update reservation
    const { data: updatedReservation, error } = await supabase
      .from('reservations')
      .update({
        purpose: updateData.purpose,
        attendees: updateData.attendees,
        notes: updateData.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId)
      .select(`
        *,
        field:fields(id, name, type, address, hourly_rate),
        user:user_profiles(id, full_name, email),
        team:teams(id, name)
      `)
      .single()
    
    if (error) {
      return errorResponse('Failed to update reservation', 400, error)
    }
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        event_type: 'reservation_updated',
        event_data: {
          reservation_id: reservationId,
          fields_updated: Object.keys(updateData),
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse(updatedReservation)
  })(req, { params })
}

// DELETE /api/reservations/[id] - Delete reservation (admin only)
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authenticate and authorize admin
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    
    if (auth.user.profile.role !== 'admin') {
      return errorResponse('Only admins can delete reservations', 403)
    }
    
    const reservationId = params.id
    const supabase = createClient()
    
    // Get reservation
    const { data: reservation } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single()
    
    if (!reservation) {
      return errorResponse('Reservation not found', 404)
    }
    
    // Delete reservation
    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', reservationId)
    
    if (error) {
      return errorResponse('Failed to delete reservation', 400, error)
    }
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        event_type: 'reservation_deleted',
        event_data: {
          reservation_id: reservationId,
          field_id: reservation.field_id,
          date: reservation.date,
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse({
      message: 'Reservation deleted successfully',
    })
  })(req, { params })
}