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

// GET /api/reservations/session/[id] - Get booking session details
export async function GET(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    const sessionId = params.id
    const supabase = createClient()
    
    // Get session with related data
    const { data: session, error } = await supabase
      .from('booking_sessions')
      .select(`
        *,
        fields(id, name, address, hourly_rate),
        user_profiles(id, full_name, email)
      `)
      .eq('id', sessionId)
      .single()
    
    if (error || !session) {
      return errorResponse('Session not found', 404)
    }
    
    // Check if session is expired
    if (new Date(session.expires_at) < new Date() && session.status === 'active') {
      // Update status to expired
      await supabase
        .from('booking_sessions')
        .update({ status: 'expired' })
        .eq('id', sessionId)
      
      return errorResponse('Session expired', 410)
    }
    
    // If session is completed, get the created reservations
    let reservations = []
    if (session.status === 'completed') {
      const { data } = await supabase
        .from('reservations')
        .select('*')
        .eq('user_id', session.user_id)
        .eq('field_id', session.field_id)
        .gte('created_at', session.created_at)
        .order('date', { ascending: true })
      
      reservations = data || []
    }
    
    const sessionData = session.selected_slots
    
    return successResponse({
      id: session.id,
      field: session.fields,
      user: session.user_profiles,
      ...sessionData,
      totalPrice: session.total_price,
      status: session.status,
      expiresAt: session.expires_at,
      reservations,
      recurringBookings: sessionData.recurringMode ? reservations : undefined,
      shareToken: reservations[0]?.share_token
    })
  })(req, { params })
}