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
import { resetPasswordSchema } from '@/lib/api/validation'

export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Rate limiting - stricter for password reset
    const rateLimitResult = await rateLimit(req, 'auth:reset-password', {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 3, // 3 requests per 15 minutes
    })
    if (!rateLimitResult.success) {
      return errorResponse(rateLimitResult.error!, 429, {
        retryAfter: rateLimitResult.retryAfter,
      })
    }
    
    // Validate request body
    const validation = await validateBody(resetPasswordSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const { email } = validation.data
    const supabase = createClient()
    
    // Check if user exists
    const { data: user } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .eq('email', email)
      .single()
    
    // Don't reveal if email exists or not for security
    if (!user) {
      return successResponse({
        message: 'If an account exists with that email, a password reset link has been sent.',
      })
    }
    
    // Generate password reset link
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
    })
    
    if (error) {
      console.error('Password reset error:', error)
      // Still return success to not reveal email existence
      return successResponse({
        message: 'If an account exists with that email, a password reset link has been sent.',
      })
    }
    
    // Send password reset email via SendGrid
    if (process.env.SENDGRID_API_KEY) {
      const sgMail = require('@sendgrid/mail')
      sgMail.setApiKey(process.env.SENDGRID_API_KEY)
      
      try {
        await sgMail.send({
          to: email,
          from: process.env.SENDGRID_FROM_EMAIL!,
          subject: 'Reset Your Password - Field Reservations',
          text: `Hi ${user.full_name},\n\nYou requested to reset your password. Click the link in the email from Supabase to reset your password.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nThe Field Reservations Team`,
          html: `
            <h2>Hi ${user.full_name},</h2>
            <p>You requested to reset your password. Click the link in the email from Supabase to reset your password.</p>
            <p>If you didn't request this, please ignore this email.</p>
            <p>Best regards,<br>The Field Reservations Team</p>
          `,
        })
      } catch (error) {
        console.error('Failed to send password reset email:', error)
      }
    }
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: user.id,
        event_type: 'password_reset_requested',
        event_data: {
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse({
      message: 'If an account exists with that email, a password reset link has been sent.',
    })
  })(req)
}