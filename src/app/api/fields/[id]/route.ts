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
  cache
} from '@/lib/api/middleware'
import { updateFieldSchema } from '@/lib/api/validation'

interface RouteParams {
  params: {
    id: string
  }
}

// GET /api/fields/[id] - Get field by ID
export async function GET(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    const fieldId = params.id
    const supabase = createClient()
    
    // Use cache for field data
    const field = await cache(
      `field:${fieldId}`,
      async () => {
        const { data, error } = await supabase
          .from('fields')
          .select(`
            *,
            league:leagues(id, name, slug),
            time_slots(*)
          `)
          .eq('id', fieldId)
          .single()
        
        if (error) throw error
        return data
      },
      300 // Cache for 5 minutes
    )
    
    if (!field) {
      return errorResponse('Field not found', 404)
    }
    
    return successResponse(field)
  })(req, { params })
}

// PUT /api/fields/[id] - Update field (admin/league_manager only)
export async function PUT(req: NextRequest, { params }: RouteParams) {
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
    const validation = await validateBody(updateFieldSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const fieldId = params.id
    const updateData = validation.data
    const supabase = createClient()
    
    // Get existing field
    const { data: existingField } = await supabase
      .from('fields')
      .select('id, league_id, name')
      .eq('id', fieldId)
      .single()
    
    if (!existingField) {
      return errorResponse('Field not found', 404)
    }
    
    // Check permissions
    if (auth.user.profile.role === 'league_manager' && 
        existingField.league_id !== auth.user.profile.league_id) {
      return errorResponse('Cannot update fields from different league', 403)
    }
    
    // Check for duplicate name if name is being updated
    if (updateData.name && updateData.name !== existingField.name) {
      const { data: duplicateField } = await supabase
        .from('fields')
        .select('id')
        .eq('league_id', existingField.league_id)
        .eq('name', updateData.name)
        .single()
      
      if (duplicateField) {
        return errorResponse('A field with this name already exists in the league', 409)
      }
    }
    
    // Update field
    const { data: updatedField, error } = await supabase
      .from('fields')
      .update({
        name: updateData.name,
        type: updateData.type,
        status: updateData.status,
        address: updateData.address,
        latitude: updateData.latitude,
        longitude: updateData.longitude,
        description: updateData.description,
        amenities: updateData.amenities,
        images: updateData.images,
        capacity: updateData.capacity,
        hourly_rate: updateData.hourlyRate,
        rules: updateData.rules,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fieldId)
      .select(`
        *,
        league:leagues(id, name, slug)
      `)
      .single()
    
    if (error) {
      return errorResponse('Failed to update field', 400, error)
    }
    
    // Invalidate cache
    await cache(`field:${fieldId}`, async () => null, 0)
    await cache(`fields:*`, async () => null, 0)
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        league_id: existingField.league_id,
        event_type: 'field_updated',
        event_data: {
          field_id: fieldId,
          field_name: updatedField.name,
          fields_updated: Object.keys(updateData),
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse(updatedField)
  })(req, { params })
}

// DELETE /api/fields/[id] - Delete field (admin only)
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  return withErrorHandler(async (req) => {
    // Log request
    logRequest(req)
    
    // Authorize admin only
    const auth = await authorize(['admin'])(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error!, 401)
    }
    if (!auth.authorized) {
      return errorResponse('Insufficient permissions', 403)
    }
    
    const fieldId = params.id
    const supabase = createClient()
    
    // Check for active reservations
    const { data: activeReservations } = await supabase
      .from('reservations')
      .select('id')
      .eq('field_id', fieldId)
      .in('status', ['pending', 'confirmed'])
      .gte('date', new Date().toISOString().split('T')[0])
    
    if (activeReservations && activeReservations.length > 0) {
      return errorResponse(
        'Cannot delete field with active reservations. Please cancel all reservations first.',
        400
      )
    }
    
    // Get field details before deletion
    const { data: field } = await supabase
      .from('fields')
      .select('name, league_id')
      .eq('id', fieldId)
      .single()
    
    if (!field) {
      return errorResponse('Field not found', 404)
    }
    
    // Soft delete - set status to inactive
    const { error } = await supabase
      .from('fields')
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', fieldId)
    
    if (error) {
      return errorResponse('Failed to delete field', 400, error)
    }
    
    // Invalidate cache
    await cache(`field:${fieldId}`, async () => null, 0)
    await cache(`fields:*`, async () => null, 0)
    
    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert({
        user_id: auth.user.id,
        league_id: field.league_id,
        event_type: 'field_deleted',
        event_data: {
          field_id: fieldId,
          field_name: field.name,
          ip: req.ip,
          user_agent: req.headers.get('user-agent'),
        },
      })
    
    return successResponse({
      message: 'Field deleted successfully',
    })
  })(req, { params })
}