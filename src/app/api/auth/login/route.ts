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
import { loginSchema } from '@/lib/api/validation'

export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'auth:login')
    if (!rateLimitResult.success) {
      return errorResponse(rateLimitResult.error!, 429, {
        retryAfter: rateLimitResult.retryAfter,
      })
    }
    
    // Validate request body
    const validation = await validateBody(loginSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const { email, password } = validation.data
    const supabase = createClient()
    
    // Sign in with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      return errorResponse('Invalid email or password', 401)
    }
    
    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()
    
    // Update last login
    await supabase
      .from('user_profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id)
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: data.user.id,
        event_type: 'user_login',
        event_data: {
          method: 'password',
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse({
      user: {
        id: data.user.id,
        email: data.user.email,
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