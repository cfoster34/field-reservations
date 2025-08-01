import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateAuth,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'

interface RouteParams {
  params: {
    id: string
  }
}

// GET /api/fields/[id]/rules - Get booking rules for a field
export async function GET(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    const fieldId = params.id
    const supabase = createClient()
    
    // Get field to find league ID
    const { data: field } = await supabase
      .from('fields')
      .select('id, league_id')
      .eq('id', fieldId)
      .single()
    
    if (!field) {
      return errorResponse('Field not found', 404)
    }
    
    // Get booking rules - field-specific first, then league-wide
    const { data: rules } = await supabase
      .from('booking_rules')
      .select('*')
      .eq('league_id', field.league_id)
      .or(`field_id.eq.${fieldId},field_id.is.null`)
      .order('field_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single()
    
    if (!rules) {
      // Return default rules if none exist
      return successResponse({
        advanceBookingDays: 14,
        maxBookingsPerWeek: 3,
        maxBookingsPerDay: 1,
        minBookingDuration: 60,
        maxBookingDuration: 240,
        bufferTime: 0,
        allowRecurring: true,
        requireApproval: false,
        cancellationDeadline: 24,
        refundPolicy: {
          fullRefundHours: 48,
          partialRefundHours: 24,
          partialRefundPercentage: 50,
          noRefundHours: 12
        }
      })
    }
    
    return successResponse({
      advanceBookingDays: rules.advance_booking_days,
      maxBookingsPerWeek: rules.max_bookings_per_week,
      maxBookingsPerDay: rules.max_bookings_per_day,
      minBookingDuration: rules.min_booking_duration,
      maxBookingDuration: rules.max_booking_duration,
      bufferTime: rules.buffer_time,
      allowRecurring: rules.allow_recurring,
      requireApproval: rules.require_approval,
      cancellationDeadline: rules.cancellation_deadline,
      refundPolicy: rules.refund_policy
    })
  })(req, { params })
}