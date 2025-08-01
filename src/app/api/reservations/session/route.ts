import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  withErrorHandler, 
  validateAuth,
  validateBody,
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { z } from 'zod'

const createSessionSchema = z.object({
  fieldId: z.string().uuid(),
  slots: z.array(z.object({
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    price: z.number().optional()
  })).min(1),
  recurringMode: z.boolean(),
  recurringPattern: z.object({
    type: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().min(1),
    endDate: z.string()
  }).optional(),
  purpose: z.string(),
  attendees: z.number().min(1),
  notes: z.string().optional(),
  teamId: z.string().uuid().optional()
})

// POST /api/reservations/session - Create a booking session
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    // Validate request body
    const validation = await validateBody(createSessionSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const { 
      fieldId, 
      slots, 
      recurringMode, 
      recurringPattern,
      purpose,
      attendees,
      notes,
      teamId
    } = validation.data
    
    const supabase = createClient()
    
    // Calculate total price
    const { data: field } = await supabase
      .from('fields')
      .select('hourly_rate')
      .eq('id', fieldId)
      .single()
    
    if (!field) {
      return errorResponse('Field not found', 404)
    }
    
    let totalPrice = 0
    for (const slot of slots) {
      const duration = (new Date(`2000-01-01T${slot.endTime}`).getTime() - 
                       new Date(`2000-01-01T${slot.startTime}`).getTime()) / (1000 * 60 * 60)
      totalPrice += (slot.price || field.hourly_rate) * duration
    }
    
    // If recurring, multiply by occurrences
    if (recurringMode && recurringPattern) {
      const occurrences = calculateRecurringOccurrences(
        new Date(slots[0].date),
        recurringPattern
      )
      totalPrice *= occurrences
    }
    
    // Create booking session
    const { data: session, error } = await supabase
      .from('booking_sessions')
      .insert({
        user_id: auth.user.id,
        field_id: fieldId,
        selected_slots: {
          slots,
          recurringMode,
          recurringPattern,
          purpose,
          attendees,
          notes,
          teamId
        },
        total_price: totalPrice,
        status: 'active',
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
      })
      .select()
      .single()
    
    if (error) {
      return errorResponse('Failed to create booking session', 500, error)
    }
    
    return successResponse({
      sessionId: session.id,
      expiresAt: session.expires_at,
      totalPrice: session.total_price
    })
  })(req)
}

// Helper function to calculate recurring occurrences
function calculateRecurringOccurrences(
  startDate: Date,
  pattern: { type: string; interval: number; endDate: string }
): number {
  const endDate = new Date(pattern.endDate)
  let count = 0
  let currentDate = new Date(startDate)
  
  while (currentDate <= endDate && count < 52) { // Max 52 occurrences
    count++
    
    switch (pattern.type) {
      case 'daily':
        currentDate.setDate(currentDate.getDate() + pattern.interval)
        break
      case 'weekly':
        currentDate.setDate(currentDate.getDate() + (pattern.interval * 7))
        break
      case 'monthly':
        currentDate.setMonth(currentDate.getMonth() + pattern.interval)
        break
    }
  }
  
  return count
}