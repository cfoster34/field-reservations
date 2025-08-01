import { NextRequest, NextResponse } from 'next/server'
import { 
  authenticate, 
  authorize, 
  validateBody, 
  rateLimit,
  errorResponse,
  withErrorHandler 
} from '@/lib/api/middleware'
import { createVersionedResponse } from '@/lib/api/versioning'
import { syncScheduler } from '@/lib/sync/sync-scheduler'
import { z } from 'zod'

// V2 Sync Schedule Schemas
const createScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  source: z.enum(['sportsconnect', 'csv', 'api']),
  syncType: z.enum(['full', 'incremental']),
  frequency: z.enum(['manual', 'hourly', 'daily', 'weekly', 'monthly']),
  scheduleExpression: z.string().optional(),
  configuration: z.object({
    syncUsers: z.boolean().default(true),
    syncTeams: z.boolean().default(true),
    syncFields: z.boolean().default(true),
    syncReservations: z.boolean().default(true),
    batchSize: z.number().min(1).max(1000).default(100),
    timeout: z.number().min(1000).max(300000).default(60000),
    retryAttempts: z.number().min(0).max(10).default(3),
    conflictResolution: z.enum(['skip', 'merge', 'prompt']).default('merge'),
    customMappings: z.record(z.any()).optional(),
  }),
  errorHandling: z.object({
    maxErrors: z.number().min(1).max(1000).default(100),
    onError: z.enum(['stop', 'continue', 'retry']).default('continue'),
    retryAttempts: z.number().min(0).max(10).default(3),
    retryDelay: z.number().min(1).max(3600).default(60),
    escalateAfter: z.number().min(1).max(100).default(5),
    notifyOnError: z.boolean().default(true),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
  notifications: z.object({
    onSuccess: z.boolean().default(true),
    onFailure: z.boolean().default(true),
    onPartialSuccess: z.boolean().default(true),
    webhookEndpoints: z.array(z.string().uuid()).default([]),
    emailRecipients: z.array(z.string().email()).default([]),
    slackWebhookUrl: z.string().url().optional(),
  }),
})

const updateScheduleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  frequency: z.enum(['manual', 'hourly', 'daily', 'weekly', 'monthly']).optional(),
  scheduleExpression: z.string().optional(),
  isActive: z.boolean().optional(),
  configuration: z.object({
    syncUsers: z.boolean().optional(),
    syncTeams: z.boolean().optional(),
    syncFields: z.boolean().optional(),
    syncReservations: z.boolean().optional(),
    batchSize: z.number().min(1).max(1000).optional(),
    timeout: z.number().min(1000).max(300000).optional(),
    retryAttempts: z.number().min(0).max(10).optional(),
    conflictResolution: z.enum(['skip', 'merge', 'prompt']).optional(),
    customMappings: z.record(z.any()).optional(),
  }).optional(),
  errorHandling: z.object({
    maxErrors: z.number().min(1).max(1000).optional(),
    onError: z.enum(['stop', 'continue', 'retry']).optional(),
    retryAttempts: z.number().min(0).max(10).optional(),
    retryDelay: z.number().min(1).max(3600).optional(),
    escalateAfter: z.number().min(1).max(100).optional(),
    notifyOnError: z.boolean().optional(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  }).optional(),
  notifications: z.object({
    onSuccess: z.boolean().optional(),
    onFailure: z.boolean().optional(),
    onPartialSuccess: z.boolean().optional(),
    webhookEndpoints: z.array(z.string().uuid()).optional(),
    emailRecipients: z.array(z.string().email()).optional(),
    slackWebhookUrl: z.string().url().optional(),
  }).optional(),
})

// GET /api/v2/sync/schedules - List sync schedules
export const GET = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting
  const rateLimitResult = await rateLimit(req, 'sync:list')
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

  const leagueId = auth.user.profile?.league_id
  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  try {
    const schedules = await syncScheduler.getSyncSchedules(leagueId)
    
    // Transform schedules for response
    const transformedSchedules = schedules.map(schedule => ({
      id: schedule.id,
      name: schedule.name,
      description: schedule.description,
      source: schedule.source,
      syncType: schedule.syncType,
      frequency: schedule.frequency,
      scheduleExpression: schedule.scheduleExpression,
      isActive: schedule.isActive,
      lastRunAt: schedule.lastRunAt,
      nextRunAt: schedule.nextRunAt,
      configuration: schedule.configuration,
      errorHandling: schedule.errorHandling,
      notifications: schedule.notifications,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    }))

    return createVersionedResponse(transformedSchedules, 'v2')
  } catch (error) {
    console.error('Failed to fetch sync schedules:', error)
    return errorResponse(
      'Failed to fetch sync schedules',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
})

// POST /api/v2/sync/schedules - Create sync schedule
export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting
  const rateLimitResult = await rateLimit(req, 'sync:create', { max: 5, windowMs: 60000 })
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

  // Validate request body
  const validation = await validateBody(createScheduleSchema)(req)
  if (!validation.valid) {
    return errorResponse('Validation failed', 400, validation.errors)
  }

  const leagueId = auth.user.profile?.league_id
  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  try {
    // Check schedule limit per league (prevent abuse)
    const existingSchedules = await syncScheduler.getSyncSchedules(leagueId)
    if (existingSchedules.length >= 10) {
      return errorResponse('Maximum number of sync schedules per league exceeded (10)', 400)
    }

    // Validate schedule expression if provided
    if (validation.data.scheduleExpression) {
      try {
        // Basic validation of cron expression format
        const parts = validation.data.scheduleExpression.split(' ')
        if (parts.length !== 5) {
          return errorResponse('Invalid schedule expression format. Expected cron format: minute hour day month dayOfWeek', 400)
        }
      } catch (error) {
        return errorResponse('Invalid schedule expression', 400, error)
      }
    }

    const schedule = await syncScheduler.createSyncSchedule(
      leagueId,
      auth.user.id,
      validation.data as any
    )

    // Transform response
    const response = {
      id: schedule.id,
      name: schedule.name,
      description: schedule.description,
      source: schedule.source,
      syncType: schedule.syncType,
      frequency: schedule.frequency,
      scheduleExpression: schedule.scheduleExpression,
      isActive: schedule.isActive,
      lastRunAt: schedule.lastRunAt,
      nextRunAt: schedule.nextRunAt,
      configuration: schedule.configuration,
      errorHandling: schedule.errorHandling,
      notifications: schedule.notifications,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    }

    return createVersionedResponse(response, 'v2')
  } catch (error) {
    console.error('Failed to create sync schedule:', error)
    return errorResponse(
      'Failed to create sync schedule',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
})

// Bulk operations for schedules
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting
  const rateLimitResult = await rateLimit(req, 'sync:bulk', { max: 3, windowMs: 60000 })
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
    operation: z.enum(['activate', 'deactivate', 'delete']),
    scheduleIds: z.array(z.string().uuid()).min(1).max(10),
  })

  // Validate request body
  const validation = await validateBody(bulkSchema)(req)
  if (!validation.valid) {
    return errorResponse('Validation failed', 400, validation.errors)
  }

  const leagueId = auth.user.profile?.league_id
  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  const { operation, scheduleIds } = validation.data

  try {
    const results = []

    for (const scheduleId of scheduleIds) {
      try {
        switch (operation) {
          case 'activate':
            await syncScheduler.updateSyncSchedule(scheduleId, leagueId, { isActive: true })
            results.push({ scheduleId, status: 'success', operation: 'activated' })
            break
          
          case 'deactivate':
            await syncScheduler.updateSyncSchedule(scheduleId, leagueId, { isActive: false })
            results.push({ scheduleId, status: 'success', operation: 'deactivated' })
            break
          
          case 'delete':
            await syncScheduler.deleteSyncSchedule(scheduleId, leagueId)
            results.push({ scheduleId, status: 'success', operation: 'deleted' })
            break
        }
      } catch (error) {
        results.push({
          scheduleId,
          status: 'error',
          operation,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const successCount = results.filter(r => r.status === 'success').length
    const errorCount = results.filter(r => r.status === 'error').length

    return createVersionedResponse({
      operation,
      total: scheduleIds.length,
      successful: successCount,
      failed: errorCount,
      results,
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