import { NextRequest, NextResponse } from 'next/server'
import {
  errorResponse,
  successResponse,
  withErrorHandler,
} from '@/lib/api/middleware'
import { JOBS, runScheduledJob } from '@/lib/jobs/scheduler'

// POST /api/jobs/[job] - Run a scheduled job
export const POST = withErrorHandler(async (
  req: NextRequest,
  { params }: { params: { job: string } }
) => {
  // Verify the request is from a trusted source
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return errorResponse('Unauthorized', 401)
  }

  const jobName = params.job

  // Validate job name
  if (!Object.values(JOBS).includes(jobName)) {
    return errorResponse('Invalid job name', 400)
  }

  // Run the job
  const result = await runScheduledJob(jobName)

  if (!result.success) {
    return errorResponse('Job failed', 500, result.error)
  }

  return successResponse({
    job: jobName,
    result,
    executedAt: new Date().toISOString(),
  })
})

// GET /api/jobs/[job] - Get job info (for monitoring)
export const GET = withErrorHandler(async (
  req: NextRequest,
  { params }: { params: { job: string } }
) => {
  const jobName = params.job

  // Job schedule configuration
  const jobSchedules = {
    [JOBS.SEND_PENDING_NOTIFICATIONS]: {
      name: 'Send Pending Notifications',
      schedule: '*/5 * * * *', // Every 5 minutes
      description: 'Sends all pending notifications that are scheduled for now or past',
    },
    [JOBS.SEND_RESERVATION_REMINDERS]: {
      name: 'Send Reservation Reminders',
      schedule: '0 9,15,21 * * *', // 9 AM, 3 PM, 9 PM daily
      description: 'Sends reminder notifications for upcoming reservations',
    },
    [JOBS.PROCESS_EXPIRED_WAITLIST]: {
      name: 'Process Expired Waitlist',
      schedule: '0 * * * *', // Every hour
      description: 'Removes expired waitlist entries and processes waitlist for cancelled slots',
    },
    [JOBS.CLEANUP_OLD_NOTIFICATIONS]: {
      name: 'Cleanup Old Notifications',
      schedule: '0 2 * * *', // 2 AM daily
      description: 'Deletes read notifications older than 30 days',
    },
    [JOBS.UPDATE_FIELD_UTILIZATION]: {
      name: 'Update Field Utilization',
      schedule: '0 3 * * *', // 3 AM daily
      description: 'Updates the field utilization materialized view',
    },
  }

  const jobInfo = jobSchedules[jobName]

  if (!jobInfo) {
    return errorResponse('Invalid job name', 400)
  }

  return successResponse({
    job: jobName,
    ...jobInfo,
  })
})