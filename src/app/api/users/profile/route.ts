import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  authenticate,
  validateBody,
  successResponse,
  errorResponse,
  logRequest,
  cache
} from '@/lib/api/middleware'
import { updateProfileSchema } from '@/lib/api/validation'

// GET /api/users/profile - Get current user profile
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authenticate user
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    
    const supabase = createClient()
    
    // Use cache for profile data
    const profile = await cache(
      `user_profile:${auth.user.id}`,
      async () => {
        const { data, error } = await supabase
          .from('user_profiles')
          .select(`
            *,
            league:leagues(id, name, slug),
            team:teams(id, name, coach_id)
          `)
          .eq('id', auth.user.id)
          .single()
        
        if (error) throw error
        return data
      },
      60 // Cache for 1 minute
    )
    
    if (!profile) {
      return errorResponse('Profile not found', 404)
    }
    
    return successResponse(profile)
  })(req)
}

// PUT /api/users/profile - Update current user profile
export async function PUT(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authenticate user
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    
    // Validate request body
    const validation = await validateBody(updateProfileSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const supabase = createClient()
    const updateData = validation.data
    
    // Update profile
    const { data: updatedProfile, error } = await supabase
      .from('user_profiles')
      .update({
        full_name: updateData.fullName,
        phone: updateData.phone,
        avatar_url: updateData.avatarUrl,
        notification_preferences: updateData.notificationPreferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.user.id)
      .select(`
        *,
        league:leagues(id, name, slug),
        team:teams(id, name, coach_id)
      `)
      .single()
    
    if (error) {
      return errorResponse('Failed to update profile', 400, error)
    }
    
    // Invalidate cache
    await cache(`user_profile:${auth.user.id}`, async () => null, 0)
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        event_type: 'profile_updated',
        event_data: {
          fields_updated: Object.keys(updateData),
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse(updatedProfile)
  })(req)
}

// DELETE /api/users/profile - Delete user account
export async function DELETE(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authenticate user
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    
    const supabase = createClient()
    
    // Check for active reservations
    const { data: activeReservations } = await supabase
      .from('reservations')
      .select('id')
      .eq('user_id', auth.user.id)
      .in('status', ['pending', 'confirmed'])
      .gte('date', new Date().toISOString().split('T')[0])
    
    if (activeReservations && activeReservations.length > 0) {
      return errorResponse(
        'Cannot delete account with active reservations. Please cancel all reservations first.',
        400
      )
    }
    
    // Soft delete - mark as inactive
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.user.id)
    
    if (updateError) {
      return errorResponse('Failed to delete account', 400, updateError)
    }
    
    // Delete auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(auth.user.id)
    
    if (authError) {
      console.error('Failed to delete auth user:', authError)
    }
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        event_type: 'account_deleted',
        event_data: {
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse({
      message: 'Account deleted successfully',
    })
  })(req)
}