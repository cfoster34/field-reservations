import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateBody,
  rateLimit,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { z } from 'zod'

const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
})

export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'auth:refresh')
    if (!rateLimitResult.success) {
      return errorResponse(rateLimitResult.error!, 429, {
        retryAfter: rateLimitResult.retryAfter,
      })
    }
    
    // Validate request body
    const validation = await validateBody(refreshSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const { refresh_token } = validation.data
    const supabase = createClient()
    
    // Refresh the session
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    })
    
    if (error || !data.session) {
      return errorResponse('Invalid refresh token', 401)
    }
    
    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', data.user!.id)
      .single()
    
    return successResponse({
      user: {
        id: data.user!.id,
        email: data.user!.email,
        profile,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    })
  })(req)
}