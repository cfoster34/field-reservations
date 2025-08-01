import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  authenticate, 
  authorize, 
  validateBody, 
  rateLimit,
  cache,
  errorResponse,
  successResponse,
  paginatedResponse,
  withErrorHandler 
} from '@/lib/api/middleware'
import { 
  createVersionedResponse,
  UserResponseTransformer,
  transformPaginationForVersion
} from '@/lib/api/versioning'
import { z } from 'zod'

const userTransformer = new UserResponseTransformer()

// V2 User Schema
const createUserSchemaV2 = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(100),
  phone: z.string().optional(),
  role: z.enum(['admin', 'coach', 'member', 'viewer']).default('member'),
  teamId: z.string().uuid().optional(),
})

const updateUserSchemaV2 = z.object({
  fullName: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  role: z.enum(['admin', 'coach', 'member', 'viewer']).optional(),
  teamId: z.string().uuid().optional(),
  isApproved: z.boolean().optional(),
})

const querySchemaV2 = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(['admin', 'coach', 'member', 'viewer']).optional(),
  teamId: z.string().uuid().optional(),
  isApproved: z.boolean().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'fullName', 'email', 'role']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

// GET /api/v2/users - List users with filtering and pagination
export const GET = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting
  const rateLimitResult = await rateLimit(req, 'users:list')
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
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  // Parse and validate query parameters
  const url = new URL(req.url)
  const queryParams = Object.fromEntries(url.searchParams.entries())
  const query = querySchemaV2.parse(queryParams)

  // Build query
  let dbQuery = supabase
    .from('user_profiles')
    .select(`
      *,
      team:teams(id, name)
    `)
    .eq('league_id', leagueId)

  // Apply filters
  if (query.search) {
    dbQuery = dbQuery.or(`full_name.ilike.%${query.search}%,email.ilike.%${query.search}%`)
  }

  if (query.role) {
    dbQuery = dbQuery.eq('role', query.role)
  }

  if (query.teamId) {
    dbQuery = dbQuery.eq('team_id', query.teamId)
  }

  if (query.isApproved !== undefined) {
    dbQuery = dbQuery.eq('is_approved', query.isApproved)
  }

  // Get total count
  const { count } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact' })
    .eq('league_id', leagueId)

  // Apply sorting and pagination
  const from = (query.page - 1) * query.pageSize
  const to = from + query.pageSize - 1

  dbQuery = dbQuery
    .order(query.sortBy, { ascending: query.sortOrder === 'asc' })
    .range(from, to)

  // Execute query with caching
  const cacheKey = `users:${leagueId}:${JSON.stringify(query)}`
  const { data: users, error } = await cache(cacheKey, () => dbQuery, 300) // 5 minutes cache

  if (error) {
    return errorResponse('Failed to fetch users', 500, error)
  }

  // Transform data for v2
  const transformedUsers = users.map(user => userTransformer.transform(user, 'v2'))

  // Create paginated response
  const pagination = {
    page: query.page,
    pageSize: query.pageSize,
    total: count || 0,
    totalPages: Math.ceil((count || 0) / query.pageSize),
    hasNext: query.page < Math.ceil((count || 0) / query.pageSize),
    hasPrev: query.page > 1,
  }

  return createVersionedResponse(transformedUsers, 'v2', null, pagination)
})

// POST /api/v2/users - Create a new user
export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting
  const rateLimitResult = await rateLimit(req, 'users:create', { max: 10, windowMs: 60000 })
  if (!rateLimitResult.success) {
    return errorResponse(rateLimitResult.error, 429, {
      retryAfter: rateLimitResult.retryAfter,
    })
  }

  // Authentication and authorization
  const auth = await authorize(['admin', 'coach'])(req)
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Insufficient permissions', auth.authenticated ? 403 : 401)
  }

  // Validate request body
  const validation = await validateBody(createUserSchemaV2)(req)
  if (!validation.valid) {
    return errorResponse('Validation failed', 400, validation.errors)
  }

  const supabase = createClient()
  const userData = validation.data
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  try {
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', userData.email)
      .single()

    if (existingUser) {
      return errorResponse('User with this email already exists', 409)
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: userData.email,
      email_confirm: true,
      user_metadata: {
        full_name: userData.fullName,
      },
    })

    if (authError) {
      throw authError
    }

    // Create user profile
    const { data: newUser, error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        email: userData.email,
        full_name: userData.fullName,
        phone: userData.phone,
        role: userData.role,
        team_id: userData.teamId,
        league_id: leagueId,
        is_approved: true,
        approved_at: new Date().toISOString(),
        approved_by: auth.user.id,
      })
      .select(`
        *,
        team:teams(id, name)
      `)
      .single()

    if (profileError) {
      throw profileError
    }

    // Transform response for v2
    const transformedUser = userTransformer.transform(newUser, 'v2')

    return createVersionedResponse(transformedUser, 'v2', null, null)
  } catch (error) {
    console.error('User creation error:', error)
    return errorResponse(
      'Failed to create user',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
})

// PUT /api/v2/users/bulk - Bulk operations
export const PUT = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting for bulk operations
  const rateLimitResult = await rateLimit(req, 'users:bulk', { max: 5, windowMs: 60000 })
  if (!rateLimitResult.success) {
    return errorResponse(rateLimitResult.error, 429, {
      retryAfter: rateLimitResult.retryAfter,
    })
  }

  // Authentication and authorization
  const auth = await authorize(['admin'])(req)
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Insufficient permissions', auth.authenticated ? 403 : 401)
  }

  const bulkSchema = z.object({
    operation: z.enum(['approve', 'deactivate', 'activate', 'update_role', 'assign_team']),
    userIds: z.array(z.string().uuid()).min(1).max(100),
    data: z.object({
      role: z.enum(['admin', 'coach', 'member', 'viewer']).optional(),
      teamId: z.string().uuid().optional(),
      isApproved: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }).optional(),
  })

  // Validate request body
  const validation = await validateBody(bulkSchema)(req)
  if (!validation.valid) {
    return errorResponse('Validation failed', 400, validation.errors)
  }

  const supabase = createClient()
  const { operation, userIds, data } = validation.data
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  try {
    let updateData: any = { updated_at: new Date().toISOString() }

    switch (operation) {
      case 'approve':
        updateData = {
          ...updateData,
          is_approved: true,
          approved_at: new Date().toISOString(),
          approved_by: auth.user.id,
        }
        break
      
      case 'deactivate':
        updateData = { ...updateData, is_active: false }
        break
      
      case 'activate':
        updateData = { ...updateData, is_active: true }
        break
      
      case 'update_role':
        if (!data?.role) {
          return errorResponse('Role is required for update_role operation', 400)
        }
        updateData = { ...updateData, role: data.role }
        break
      
      case 'assign_team':
        updateData = { ...updateData, team_id: data?.teamId }
        break
    }

    // Perform bulk update
    const { data: updatedUsers, error } = await supabase
      .from('user_profiles')
      .update(updateData)
      .in('id', userIds)
      .eq('league_id', leagueId)
      .select(`
        *,
        team:teams(id, name)
      `)

    if (error) {
      throw error
    }

    // Transform response for v2
    const transformedUsers = updatedUsers.map(user => userTransformer.transform(user, 'v2'))

    return createVersionedResponse({
      operation,
      affected: updatedUsers.length,
      users: transformedUsers,
    }, 'v2')
  } catch (error) {
    console.error('Bulk operation error:', error)
    return errorResponse(
      'Failed to perform bulk operation',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
})