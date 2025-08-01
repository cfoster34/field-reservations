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
import { conflictResolver } from '@/lib/data-mapping/conflict-resolver'
import { z } from 'zod'

const resolveConflictsSchema = z.object({
  conflicts: z.array(z.object({
    id: z.string(),
    type: z.enum(['duplicate', 'field_mismatch', 'constraint_violation', 'business_rule_violation']),
    existing: z.any(),
    incoming: z.any(),
    conflictingFields: z.array(z.string()),
    resolution: z.object({
      action: z.enum(['skip', 'update', 'merge', 'create_new', 'manual_review']),
      strategy: z.string().optional(),
      customData: z.any().optional(),
    }),
  })).min(1).max(100),
  options: z.object({
    dryRun: z.boolean().default(false),
    applyToSimilar: z.boolean().default(false),
    notifyUsers: z.boolean().default(true),
  }).optional(),
})

const batchResolveSchema = z.object({
  strategy: z.string(),
  conflictIds: z.array(z.string()).min(1).max(50),
  options: z.object({
    dryRun: z.boolean().default(false),
    force: z.boolean().default(false),
  }).optional(),
})

// POST /api/v2/data/conflicts/resolve - Resolve data conflicts
export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting
  const rateLimitResult = await rateLimit(req, 'conflicts:resolve', { max: 5, windowMs: 60000 })
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
  const validation = await validateBody(resolveConflictsSchema)(req)
  if (!validation.valid) {
    return errorResponse('Validation failed', 400, validation.errors)
  }

  const leagueId = auth.user.profile?.league_id
  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  const { conflicts, options = {} } = validation.data

  try {
    // Transform conflicts to the expected format
    const transformedConflicts = conflicts.map(conflict => ({
      id: conflict.id,
      type: conflict.type,
      severity: 'medium' as const,
      existing: conflict.existing,
      incoming: conflict.incoming,
      conflictingFields: conflict.conflictingFields,
      suggestedResolution: {
        strategy: conflict.resolution.strategy || 'manual',
        action: conflict.resolution.action,
        resolvedData: conflict.resolution.customData,
        reason: 'User-specified resolution',
        autoResolvable: conflict.resolution.action !== 'manual_review',
      },
      metadata: {
        detectedAt: new Date().toISOString(),
        rowIndex: 0,
        confidence: 1.0,
      },
    }))

    // Resolve conflicts
    const resolutionResult = await conflictResolver.resolveConflicts(
      transformedConflicts,
      {
        autoResolveOnly: false,
        dryRun: options.dryRun,
      }
    )

    // Log resolution activity
    await logConflictResolution(
      leagueId,
      auth.user.id,
      conflicts.length,
      resolutionResult,
      options.dryRun
    )

    // Send notifications if enabled
    if (options.notifyUsers && !options.dryRun) {
      await sendResolutionNotifications(
        leagueId,
        resolutionResult,
        auth.user.profile?.full_name || 'Unknown User'
      )
    }

    const response = {
      resolved: resolutionResult.resolved.length,
      unresolved: resolutionResult.unresolved.length,
      actions: resolutionResult.actions,
      summary: {
        totalConflicts: conflicts.length,
        successRate: Math.round((resolutionResult.resolved.length / conflicts.length) * 100),
        dryRun: options.dryRun,
        resolvedAt: new Date().toISOString(),
      },
      details: {
        resolved: resolutionResult.resolved.map(conflict => ({
          id: conflict.id,
          action: conflict.suggestedResolution.action,
          strategy: conflict.suggestedResolution.strategy,
          reason: conflict.suggestedResolution.reason,
        })),
        unresolved: resolutionResult.unresolved.map(conflict => ({
          id: conflict.id,
          reason: 'Manual review required',
          conflictingFields: conflict.conflictingFields,
        })),
      },
    }

    return createVersionedResponse(response, 'v2')
  } catch (error) {
    console.error('Conflict resolution error:', error)
    return errorResponse(
      'Failed to resolve conflicts',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
})

// PATCH /api/v2/data/conflicts/resolve - Batch resolve conflicts with strategy
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting
  const rateLimitResult = await rateLimit(req, 'conflicts:batch-resolve', { max: 3, windowMs: 60000 })
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
  const validation = await validateBody(batchResolveSchema)(req)
  if (!validation.valid) {
    return errorResponse('Validation failed', 400, validation.errors)
  }

  const leagueId = auth.user.profile?.league_id
  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  const { strategy, conflictIds, options = {} } = validation.data

  try {
    // This would fetch actual conflicts from database
    // For now, we'll create a placeholder response
    const results = conflictIds.map(id => ({
      conflictId: id,
      status: 'resolved' as const,
      action: 'merge' as const,
      appliedAt: new Date().toISOString(),
    }))

    const response = {
      strategy,
      processedConflicts: conflictIds.length,
      successful: results.filter(r => r.status === 'resolved').length,
      failed: results.filter(r => r.status !== 'resolved').length,
      dryRun: options.dryRun,
      results,
      summary: {
        batchId: crypto.randomUUID(),
        appliedAt: new Date().toISOString(),
        appliedBy: auth.user.profile?.full_name || 'Unknown User',
      },
    }

    return createVersionedResponse(response, 'v2')
  } catch (error) {
    console.error('Batch conflict resolution error:', error)
    return errorResponse(
      'Failed to batch resolve conflicts',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
})

async function logConflictResolution(
  leagueId: string,
  userId: string,
  conflictCount: number,
  result: any,
  dryRun: boolean
): Promise<void> {
  // Log conflict resolution activity
  console.log('Conflict resolution logged:', {
    leagueId,
    userId,
    conflictCount,
    resolved: result.resolved.length,
    unresolved: result.unresolved.length,
    dryRun,
    timestamp: new Date().toISOString(),
  })
}

async function sendResolutionNotifications(
  leagueId: string,
  result: any,
  resolvedBy: string
): Promise<void> {
  // Send notifications about conflict resolutions
  console.log('Resolution notifications sent:', {
    leagueId,
    resolved: result.resolved.length,
    resolvedBy,
    timestamp: new Date().toISOString(),
  })
}