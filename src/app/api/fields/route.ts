import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  authenticate,
  authorize,
  validateBody,
  successResponse,
  errorResponse,
  logRequest,
  paginatedResponse,
  cache
} from '@/lib/api/middleware'
import { createFieldSchema } from '@/lib/api/validation'

// GET /api/fields - List fields
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    const supabase = createClient()
    const searchParams = req.nextUrl.searchParams
    
    // Parse pagination params
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const sortBy = searchParams.get('sortBy') || 'display_order'
    const sortOrder = searchParams.get('sortOrder') || 'asc'
    
    // Parse filter params
    const leagueId = searchParams.get('leagueId')
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const minCapacity = searchParams.get('minCapacity')
    const maxHourlyRate = searchParams.get('maxHourlyRate')
    
    // Use cache for field list
    const cacheKey = `fields:${JSON.stringify({
      leagueId, type, status, search, minCapacity, maxHourlyRate,
      page, pageSize, sortBy, sortOrder
    })}`
    
    const result = await cache(
      cacheKey,
      async () => {
        // Build query
        let query = supabase
          .from('fields')
          .select(`
            *,
            league:leagues(id, name, slug)
          `, { count: 'exact' })
        
        // Apply filters
        if (leagueId) query = query.eq('league_id', leagueId)
        if (type) query = query.eq('type', type)
        if (status) query = query.eq('status', status)
        if (minCapacity) query = query.gte('capacity', parseInt(minCapacity))
        if (maxHourlyRate) query = query.lte('hourly_rate', parseFloat(maxHourlyRate))
        
        // Apply search
        if (search) {
          query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,address.ilike.%${search}%`)
        }
        
        // Apply sorting
        const ascending = sortOrder === 'asc'
        query = query.order(sortBy, { ascending })
        
        // Apply pagination
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1
        query = query.range(from, to)
        
        // Execute query
        const { data: fields, error, count } = await query
        
        if (error) throw error
        
        return {
          fields: fields || [],
          count: count || 0
        }
      },
      300 // Cache for 5 minutes
    )
    
    return paginatedResponse(
      result.fields,
      result.count,
      page,
      pageSize
    )
  })(req)
}

// POST /api/fields - Create field (admin/league_manager only)
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authorize admin or league manager
    const auth = await authorize(['admin', 'league_manager'])(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    if (!auth.authorized) {
      return errorResponse('Insufficient permissions', 403)
    }
    
    // Validate request body
    const validation = await validateBody(createFieldSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const fieldData = validation.data
    const supabase = createClient()
    
    // Set league_id based on user role
    let leagueId = auth.user.profile.league_id
    
    // Admins can specify league_id in request
    if (auth.user.profile.role === 'admin' && req.nextUrl.searchParams.get('leagueId')) {
      leagueId = req.nextUrl.searchParams.get('leagueId')
    }
    
    if (!leagueId) {
      return errorResponse('League ID is required', 400)
    }
    
    // Check for duplicate field name in league
    const { data: existingField } = await supabase
      .from('fields')
      .select('id')
      .eq('league_id', leagueId)
      .eq('name', fieldData.name)
      .single()
    
    if (existingField) {
      return errorResponse('A field with this name already exists in the league', 409)
    }
    
    // Create field
    const { data: newField, error } = await supabase
      .from('fields')
      .insert({
        league_id: leagueId,
        name: fieldData.name,
        type: fieldData.type,
        status: fieldData.status || 'available',
        address: fieldData.address,
        latitude: fieldData.latitude,
        longitude: fieldData.longitude,
        description: fieldData.description,
        amenities: fieldData.amenities || [],
        images: fieldData.images || [],
        capacity: fieldData.capacity,
        hourly_rate: fieldData.hourlyRate,
        rules: fieldData.rules,
        display_order: 0,
      })
      .select(`
        *,
        league:leagues(id, name, slug)
      `)
      .single()
    
    if (error) {
      return errorResponse('Failed to create field', 400, error)
    }
    
    // Create default time slots for the field (9 AM - 9 PM, every day)
    const defaultTimeSlots = []
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
      defaultTimeSlots.push({
        field_id: newField.id,
        day_of_week: dayOfWeek,
        start_time: '09:00:00',
        end_time: '21:00:00',
        is_recurring: true,
        is_available: true,
      })
    }
    
    await supabase
      .from('time_slots')
      .insert(defaultTimeSlots)
    
    // Invalidate cache
    await cache(`fields:*`, async () => null, 0)
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        league_id: leagueId,
        event_type: 'field_created',
        event_data: {
          field_id: newField.id,
          field_name: newField.name,
          field_type: newField.type,
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse(newField, 201)
  })(req)
}