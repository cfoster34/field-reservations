import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  authenticate,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'

export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authenticate user
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    
    const supabase = createClient()
    
    // Sign out from Supabase
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      return errorResponse('Failed to logout', 400, error)
    }
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        event_type: 'user_logout',
        event_data: {
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse({
      message: 'Logged out successfully',
    })
  })(req)
}