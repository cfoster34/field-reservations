import { NextRequest } from 'next/server'
import { 
  withErrorHandler, 
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { reminderService } from '@/lib/calendar/reminder-service'

// POST /api/calendar/reminders/process - Process pending reminders (cron job)
export async function POST(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    // Verify this is a cron job or internal request
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return errorResponse('Unauthorized', 401)
    }
    
    try {
      const results = await reminderService.processPendingReminders()
      
      return successResponse({
        message: 'Reminder processing completed',
        results
      })
      
    } catch (error) {
      console.error('Failed to process reminders:', error)
      return errorResponse('Failed to process reminders', 500, error)
    }
  })(req)
}

// GET /api/calendar/reminders/process - Get processing status
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    try {
      const stats = await reminderService.getReminderStats()
      
      return successResponse({
        stats,
        lastProcessed: new Date().toISOString()
      })
      
    } catch (error) {
      console.error('Failed to get reminder stats:', error)
      return errorResponse('Failed to get reminder stats', 500, error)
    }
  })(req)
}