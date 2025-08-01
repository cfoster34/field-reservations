import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateAuth,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { reminderService } from '@/lib/calendar/reminder-service'

// GET /api/calendar/reminders - List user's calendar reminders
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const supabase = createClient()
    const searchParams = req.nextUrl.searchParams
    
    // Filter parameters
    const status = searchParams.get('status') // pending, sent, failed, cancelled
    const reservationId = searchParams.get('reservation_id')
    const reminderType = searchParams.get('type') // email, sms, push, webhook
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    
    let query = supabase
      .from('calendar_reminders')
      .select(`
        *,
        reservation:reservations(
          id,
          date,
          start_time,
          end_time,
          purpose,
          field:fields(name)
        )
      `)
      .eq('user_id', auth.user.id)
      .order('scheduled_for', { ascending: false })
      .range(offset, offset + limit - 1)
    
    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }
    
    if (reservationId) {
      query = query.eq('reservation_id', reservationId)
    }
    
    if (reminderType) {
      query = query.eq('reminder_type', reminderType)
    }
    
    const { data: reminders, error, count } = await query
    
    if (error) {
      return errorResponse('Failed to fetch reminders', 500, error)
    }
    
    return successResponse({
      reminders: reminders || [],
      total: count || 0,
      stats: await reminderService.getReminderStats()
    })
  })(req)
}

// POST /api/calendar/reminders - Create reminder for reservation
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const body = await req.json()
    const {
      reservation_id,
      methods = ['email'],
      timings = [
        { minutes: 1440, enabled: true }, // 24 hours
        { minutes: 60, enabled: true }    // 1 hour
      ],
      custom_message,
      webhook_url
    } = body
    
    if (!reservation_id) {
      return errorResponse('reservation_id is required', 400)
    }
    
    const supabase = createClient()
    
    // Verify user owns the reservation
    const { data: reservation, error: reservationError } = await supabase
      .from('reservations')
      .select('id, date, start_time, user_id')
      .eq('id', reservation_id)
      .eq('user_id', auth.user.id)
      .single()
    
    if (reservationError || !reservation) {
      return errorResponse('Reservation not found', 404)
    }
    
    try {
      const reservationDateTime = new Date(`${reservation.date}T${reservation.start_time}`)
      
      const reminders = await reminderService.createReminders(
        reservation_id,
        auth.user.id,
        reservationDateTime,
        {
          enabled: true,
          methods,
          timings,
          customMessage: custom_message,
          webhookUrl: webhook_url
        }
      )
      
      return successResponse({
        message: 'Reminders created successfully',
        reminders,
        count: reminders.length
      })
      
    } catch (error) {
      console.error('Failed to create reminders:', error)
      return errorResponse('Failed to create reminders', 500, error)
    }
  })(req)
}

// DELETE /api/calendar/reminders - Cancel reminder
export async function DELETE(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    const { reminderId, reservationId } = await req.json()
    
    const supabase = createClient()
    
    if (reminderId) {
      // Cancel specific reminder
      const { error } = await supabase
        .from('calendar_reminders')
        .update({ status: 'cancelled' })
        .eq('id', reminderId)
        .eq('user_id', auth.user.id)
        .eq('status', 'pending')
      
      if (error) {
        return errorResponse('Failed to cancel reminder', 500, error)
      }
      
      return successResponse({
        message: 'Reminder cancelled successfully'
      })
      
    } else if (reservationId) {
      // Cancel all reminders for reservation
      await reminderService.cancelReminders(reservationId)
      
      return successResponse({
        message: 'All reminders cancelled for reservation'
      })
      
    } else {
      return errorResponse('Either reminderId or reservationId is required', 400)
    }
  })(req)
}