import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateBody,
  authenticate,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { updatePasswordSchema } from '@/lib/api/validation'

export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Validate request body
    const validation = await validateBody(updatePasswordSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const { token, password } = validation.data
    const supabase = createClient()
    
    // Exchange token for session
    const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(token)
    
    if (sessionError || !sessionData.session) {
      return errorResponse('Invalid or expired reset token', 400)
    }
    
    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })
    
    if (updateError) {
      return errorResponse('Failed to update password', 400, updateError)
    }
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: sessionData.user.id,
        event_type: 'password_reset_completed',
        event_data: {
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    // Send confirmation email
    if (process.env.SENDGRID_API_KEY) {
      const sgMail = require('@sendgrid/mail')
      sgMail.setApiKey(process.env.SENDGRID_API_KEY)
      
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('id', sessionData.user.id)
        .single()
      
      if (profile) {
        try {
          await sgMail.send({
            to: profile.email,
            from: process.env.SENDGRID_FROM_EMAIL!,
            subject: 'Password Changed - Field Reservations',
            text: `Hi ${profile.full_name},\n\nYour password has been successfully changed.\n\nIf you didn't make this change, please contact support immediately.\n\nBest regards,\nThe Field Reservations Team`,
            html: `
              <h2>Hi ${profile.full_name},</h2>
              <p>Your password has been successfully changed.</p>
              <p>If you didn't make this change, please contact support immediately.</p>
              <p>Best regards,<br>The Field Reservations Team</p>
            `,
          })
        } catch (error) {
          console.error('Failed to send password change confirmation:', error)
        }
      }
    }
    
    return successResponse({
      message: 'Password updated successfully',
    })
  })(req)
}