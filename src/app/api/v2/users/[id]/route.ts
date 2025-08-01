import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  authenticate, 
  authorize, 
  validateBody, 
  rateLimit,
  errorResponse,
  withErrorHandler 
} from '@/lib/api/middleware'
import { 
  createVersionedResponse,
  UserResponseTransformer
} from '@/lib/api/versioning'
import { z } from 'zod'

const userTransformer = new UserResponseTransformer()

// V2 Update User Schema
const updateUserSchemaV2 = z.object({
  fullName: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  role: z.enum(['admin', 'coach', 'member', 'viewer']).optional(),
  teamId: z.string().uuid().optional(),
  isApproved: z.boolean().optional(),
  isActive: z.boolean().optional(),
  bio: z.string().max(500).optional(),
  preferences: z.object({
    notifications: z.object({
      email: z.boolean().default(true),
      sms: z.boolean().default(false),
      push: z.boolean().default(true),
    }).optional(),
    timezone: z.string().optional(),
    language: z.string().optional(),
  }).optional(),
})

interface RouteContext {
  params: { id: string }
}

// GET /api/v2/users/[id] - Get user by ID
export async function GET(req: NextRequest, { params }: RouteContext) {
  return withErrorHandler(async () => {
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'users:get')
    if (!rateLimitResult.success) {
      return errorResponse(rateLimitResult.error, 429, {
        retryAfter: rateLimitResult.retryAfter,
      })
    }

    // Authentication
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401)
    }

    const supabase = createClient()
    const userId = params.id
    const requestingUserId = auth.user.id
    const userRole = auth.user.profile?.role
    const leagueId = auth.user.profile?.league_id

    if (!leagueId) {
      return errorResponse('User must belong to a league', 400)
    }

    // Check permissions - users can view their own profile, admins/coaches can view all
    const canViewUser = userId === requestingUserId || ['admin', 'coach'].includes(userRole)
    
    if (!canViewUser) {
      return errorResponse('Insufficient permissions to view this user', 403)
    }

    // Fetch user with related data
    const { data: user, error } = await supabase
      .from('user_profiles')
      .select(`
        *,
        team:teams(id, name, division, age_group),
        created_by:user_profiles!created_by(id, full_name),
        approved_by:user_profiles!approved_by(id, full_name)
      `)
      .eq('id', userId)
      .eq('league_id', leagueId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('User not found', 404)
      }
      return errorResponse('Failed to fetch user', 500, error)
    }

    // Transform response for v2
    const transformedUser = userTransformer.transform(user, 'v2')

    return createVersionedResponse(transformedUser, 'v2')
  })()
}

// PUT /api/v2/users/[id] - Update user
export async function PUT(req: NextRequest, { params }: RouteContext) {
  return withErrorHandler(async () => {
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'users:update', { max: 20, windowMs: 60000 })
    if (!rateLimitResult.success) {
      return errorResponse(rateLimitResult.error, 429, {
        retryAfter: rateLimitResult.retryAfter,
      })
    }

    // Authentication
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401)
    }

    // Validate request body
    const validation = await validateBody(updateUserSchemaV2)(req)
    if (!validation.valid) {
      return errorResponse('Validation failed', 400, validation.errors)
    }

    const supabase = createClient()
    const userId = params.id
    const requestingUserId = auth.user.id
    const userRole = auth.user.profile?.role
    const leagueId = auth.user.profile?.league_id
    const updateData = validation.data

    if (!leagueId) {
      return errorResponse('User must belong to a league', 400)
    }

    // Check if user exists and belongs to the same league
    const { data: existingUser, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id, role, team_id')
      .eq('id', userId)
      .eq('league_id', leagueId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return errorResponse('User not found', 404)
      }
      return errorResponse('Failed to fetch user', 500, fetchError)
    }

    // Permission checks
    const isOwnProfile = userId === requestingUserId
    const isAdmin = userRole === 'admin'
    const isCoach = userRole === 'coach'

    // Users can update their own basic info
    if (isOwnProfile) {
      // Restrict what users can update about themselves
      const allowedFields = ['fullName', 'phone', 'bio', 'preferences']
      const restrictedFields = Object.keys(updateData).filter(field => !allowedFields.includes(field))
      
      if (restrictedFields.length > 0) {
        return errorResponse(
          `Cannot update restricted fields: ${restrictedFields.join(', ')}`,
          403
        )
      }
    }
    // Admins can update anyone
    else if (isAdmin) {
      // Admins can update everything
    }
    // Coaches can update team members (limited fields)
    else if (isCoach) {
      const allowedFields = ['teamId', 'isApproved']
      const restrictedFields = Object.keys(updateData).filter(field => !allowedFields.includes(field))
      
      if (restrictedFields.length > 0) {
        return errorResponse(
          `Coaches can only update: ${allowedFields.join(', ')}`,
          403
        )
      }
    }
    // No permission
    else {
      return errorResponse('Insufficient permissions to update this user', 403)
    }

    // Prepare update data
    const dbUpdateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (updateData.fullName !== undefined) {
      dbUpdateData.full_name = updateData.fullName
    }
    if (updateData.phone !== undefined) {
      dbUpdateData.phone = updateData.phone
    }
    if (updateData.role !== undefined) {
      dbUpdateData.role = updateData.role
    }
    if (updateData.teamId !== undefined) {
      dbUpdateData.team_id = updateData.teamId
    }
    if (updateData.isApproved !== undefined) {
      dbUpdateData.is_approved = updateData.isApproved
      if (updateData.isApproved) {
        dbUpdateData.approved_at = new Date().toISOString()
        dbUpdateData.approved_by = requestingUserId
      }
    }
    if (updateData.isActive !== undefined) {
      dbUpdateData.is_active = updateData.isActive
    }
    if (updateData.bio !== undefined) {
      dbUpdateData.bio = updateData.bio
    }
    if (updateData.preferences !== undefined) {
      dbUpdateData.preferences = updateData.preferences
    }

    // Update user
    const { data: updatedUser, error: updateError } = await supabase
      .from('user_profiles')
      .update(dbUpdateData)
      .eq('id', userId)
      .eq('league_id', leagueId)
      .select(`
        *,
        team:teams(id, name, division, age_group)
      `)
      .single()

    if (updateError) {
      return errorResponse('Failed to update user', 500, updateError)
    }

    // Transform response for v2
    const transformedUser = userTransformer.transform(updatedUser, 'v2')

    return createVersionedResponse(transformedUser, 'v2')
  })()
}

// DELETE /api/v2/users/[id] - Delete user (soft delete)
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  return withErrorHandler(async () => {
    // Rate limiting
    const rateLimitResult = await rateLimit(req, 'users:delete', { max: 5, windowMs: 60000 })
    if (!rateLimitResult.success) {
      return errorResponse(rateLimitResult.error, 429, {
        retryAfter: rateLimitResult.retryAfter,
      })
    }

    // Authentication and authorization - only admins can delete users
    const auth = await authorize(['admin'])(req)
    if (!auth.authenticated || !auth.authorized) {
      return errorResponse(auth.error || 'Insufficient permissions', auth.authenticated ? 403 : 401)
    }

    const supabase = createClient()
    const userId = params.id
    const leagueId = auth.user.profile?.league_id

    if (!leagueId) {
      return errorResponse('User must belong to a league', 400)
    }

    // Prevent self-deletion
    if (userId === auth.user.id) {
      return errorResponse('Cannot delete your own account', 400)
    }

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .eq('league_id', leagueId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return errorResponse('User not found', 404)
      }
      return errorResponse('Failed to fetch user', 500, fetchError)
    }

    // Check for dependencies (reservations, etc.)
    const { count: reservationCount } = await supabase
      .from('reservations')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'confirmed')

    if (reservationCount && reservationCount > 0) {
      return errorResponse(
        'Cannot delete user with active reservations. Please cancel or transfer reservations first.',
        409,
        { activeReservations: reservationCount }
      )
    }

    try {
      // Start transaction-like operations
      // 1. Soft delete user profile
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
          deleted_by: auth.user.id,
          email: `deleted_${Date.now()}_${existingUser.id}@deleted.local`, // Anonymize email
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (updateError) {
        throw updateError
      }

      // 2. Disable auth user
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
        email_confirm: false,
        banned_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // Ban for 1 year
      })

      if (authError) {
        // Rollback user profile update
        await supabase
          .from('user_profiles')
          .update({
            is_active: true,
            deleted_at: null,
            deleted_by: null,
            email: existingUser.email,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
        
        throw authError
      }

      return createVersionedResponse({
        id: userId,
        deleted: true,
        deletedAt: new Date().toISOString(),
        message: `User ${existingUser.full_name} has been successfully deleted`,
      }, 'v2')
    } catch (error) {
      console.error('User deletion error:', error)
      return errorResponse(
        'Failed to delete user',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  })()
}