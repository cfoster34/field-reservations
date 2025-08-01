import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'

interface RouteParams {
  params: {
    token: string
  }
}

// GET /api/reservations/shared/[token] - Get shared reservation
export async function GET(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    const token = params.token
    const supabase = createClient()
    
    // Get reservation by share token
    const { data: reservation, error } = await supabase
      .from('reservations')
      .select(`
        *,
        field:fields(id, name, address, type),
        user:user_profiles(id, full_name),
        team:teams(id, name)
      `)
      .eq('share_token', token)
      .single()
    
    if (error || !reservation) {
      return errorResponse('Shared reservation not found', 404)
    }
    
    // Don't include sensitive information in shared view
    const publicReservation = {
      ...reservation,
      user: {
        fullName: reservation.user?.full_name
      }
    }
    
    return successResponse(publicReservation)
  })(req, { params })
}