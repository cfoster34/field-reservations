import { NextRequest, NextResponse } from 'next/server'
import {
  authorize,
  errorResponse,
  successResponse,
  withErrorHandler,
} from '@/lib/api/middleware'
import { JOBS, runScheduledJob } from '@/lib/jobs/scheduler'

// POST /api/jobs/run-all - Run all scheduled jobs (admin only, for testing)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  // Only allow in development mode unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_MANUAL_JOBS) {
    return errorResponse('Manual job execution not allowed in production', 403)
  }

  const results: Record<string, any> = {}

  // Run all jobs
  for (const [jobKey, jobName] of Object.entries(JOBS)) {
    try {
      results[jobKey] = await runScheduledJob(jobName)
    } catch (error) {
      results[jobKey] = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  const allSuccessful = Object.values(results).every(r => r.success)

  return successResponse({
    success: allSuccessful,
    results,
    executedAt: new Date().toISOString(),
  })
})