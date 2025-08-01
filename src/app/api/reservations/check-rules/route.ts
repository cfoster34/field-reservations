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

const checkRulesSchema = z.object({
  fieldId: z.string().uuid(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string()
})

// POST /api/reservations/check-rules - Check booking rules
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Validate auth
    const auth = await validateAuth()(req)
    if (!auth.valid) {
      return errorResponse('Unauthorized', 401)
    }
    
    // Validate request body
    const validation = await validateBody(checkRulesSchema)(req)
    if (!validation.valid) {
      return errorResponse('Invalid request data', 400, validation.errors)
    }
    
    const { fieldId, date, startTime, endTime } = validation.data
    const supabase = createClient()
    
    // Call the database function to check booking rules
    const { data: rulesCheck, error } = await supabase
      .rpc('check_booking_rules', {
        p_user_id: auth.user.id,
        p_field_id: fieldId,
        p_date: date,
        p_start_time: startTime,
        p_end_time: endTime
      })
    
    if (error) {
      return errorResponse('Failed to check booking rules', 500, error)
    }
    
    // Process the results
    const failedRules = rulesCheck.filter((rule: any) => !rule.passed)
    const allowed = failedRules.length === 0
    
    return successResponse({
      allowed,
      reasons: failedRules.map((rule: any) => rule.message),
      ruleChecks: rulesCheck
    })
  })(req)
}