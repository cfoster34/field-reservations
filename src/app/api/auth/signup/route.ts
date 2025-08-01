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
import { signupSchema } from '@/lib/api/validation'

export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'auth:signup')
    if (!rateLimitResult.success) {
      return errorResponse(rateLimitResult.error!, 429, {
        retryAfter: rateLimitResult.retryAfter,
      })
    }
    
    // Validate request body
    const validation = await validateBody(signupSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const { email, password, fullName, phone, leagueId, teamId } = validation.data
    const supabase = createClient()
    
    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .single()
    
    if (existingUser) {
      return errorResponse('Email already registered', 409)
    }
    
    // Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
        },
      },
    })
    
    if (authError) {
      return errorResponse('Failed to create account', 400, authError)
    }
    
    // Create user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user!.id,
        email,
        full_name: fullName,
        phone,
        league_id: leagueId,
        team_id: teamId,
        role: 'member',
        is_active: true,
        is_approved: false, // Require admin approval
        notification_preferences: {
          email: true,
          sms: false,
          push: true,
          reminder_hours: 24,
        },
      })
      .select()
      .single()
    
    if (profileError) {
      // Cleanup auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user!.id)
      return errorResponse('Failed to create user profile', 400, profileError)
    }
    
    // Send welcome email via SendGrid
    if (process.env.SENDGRID_API_KEY) {
      const sgMail = require('@sendgrid/mail')
      sgMail.setApiKey(process.env.SENDGRID_API_KEY)
      
      try {
        await sgMail.send({
          to: email,
          from: process.env.SENDGRID_FROM_EMAIL!,
          subject: 'Welcome to Field Reservations!',
          text: `Hi ${fullName},\n\nWelcome to Field Reservations! Your account has been created successfully.\n\nPlease verify your email by clicking the link sent to your email address.\n\nBest regards,\nThe Field Reservations Team`,
          html: `
            <h2>Hi ${fullName},</h2>
            <p>Welcome to Field Reservations! Your account has been created successfully.</p>
            <p>Please verify your email by clicking the link sent to your email address.</p>
            <p>Best regards,<br>The Field Reservations Team</p>
          `,
        })
      } catch (error) {
        console.error('Failed to send welcome email:', error)
      }
    }
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: authData.user!.id,
        event_type: 'user_signup',
        event_data: {
          method: 'email',
          league_id: leagueId,
          team_id: teamId,
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse({
      user: {
        id: authData.user!.id,
        email: authData.user!.email,
        profile,
      },
      session: authData.session ? {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at,
      } : null,
    }, 201)
  })(req)
}