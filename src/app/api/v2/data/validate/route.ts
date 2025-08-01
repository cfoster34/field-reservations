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
import { dataMappingEngine, DataMappingEngine } from '@/lib/data-mapping/mapping-engine'
import { conflictResolver } from '@/lib/data-mapping/conflict-resolver'
import { z } from 'zod'

const validateDataSchema = z.object({
  type: z.enum(['users', 'teams', 'fields', 'reservations']),
  data: z.array(z.any()).min(1).max(1000),
  sourceFormat: z.enum(['csv', 'json', 'sportsconnect']).default('csv'),
  validationLevel: z.enum(['basic', 'strict', 'complete']).default('basic'),
  checkConflicts: z.boolean().default(false),
  mappingSchema: z.any().optional(),
})

// POST /api/v2/data/validate - Validate data before import
export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limiting
  const rateLimitResult = await rateLimit(req, 'data:validate', { max: 10, windowMs: 60000 })
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
  const validation = await validateBody(validateDataSchema)(req)
  if (!validation.valid) {
    return errorResponse('Validation failed', 400, validation.errors)
  }

  const leagueId = auth.user.profile?.league_id
  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  const { type, data, sourceFormat, validationLevel, checkConflicts, mappingSchema } = validation.data

  try {
    // Create or use provided mapping schema
    const schema = mappingSchema || createDefaultMappingSchema(type, sourceFormat)
    
    // Transform and validate data
    const transformationResult = await dataMappingEngine.transformData(data, schema, {
      skipErrors: validationLevel !== 'strict',
      maxErrors: 100,
      validateOnly: true,
    })

    let conflictResult = null
    if (checkConflicts && transformationResult.success) {
      // Check for conflicts with existing data
      conflictResult = await conflictResolver.detectConflicts(
        transformationResult.data,
        type,
        leagueId,
        {
          strictMode: validationLevel === 'strict',
          checkBusinessRules: validationLevel === 'complete',
        }
      )
    }

    // Calculate validation summary
    const summary = {
      totalRecords: data.length,
      validRecords: transformationResult.data.length,
      invalidRecords: transformationResult.errors.filter(e => e.severity === 'error').length,
      warningRecords: transformationResult.warnings.length,
      duplicateRecords: conflictResult?.conflicts.filter(c => c.type === 'duplicate').length || 0,
      conflictingRecords: conflictResult?.conflicts.length || 0,
      validationLevel,
      estimatedImportTime: calculateEstimatedImportTime(transformationResult.data.length),
    }

    const response = {
      valid: transformationResult.success && (!conflictResult || !conflictResult.hasConflicts),
      summary,
      transformation: {
        processed: transformationResult.metadata.processed,
        transformed: transformationResult.metadata.transformedRecords,
        skipped: transformationResult.metadata.skippedRecords,
        duration: transformationResult.metadata.duration,
      },
      errors: transformationResult.errors.slice(0, 50), // Limit errors for response size
      warnings: transformationResult.warnings.slice(0, 50),
      conflicts: conflictResult?.conflicts.slice(0, 20) || [],
      recommendations: generateRecommendations(transformationResult, conflictResult, validationLevel),
    }

    return createVersionedResponse(response, 'v2')
  } catch (error) {
    console.error('Data validation error:', error)
    return errorResponse(
      'Failed to validate data',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
})

function createDefaultMappingSchema(type: string, sourceFormat: string) {
  switch (type) {
    case 'users':
      return DataMappingEngine.createUserMappingSchema(sourceFormat as 'csv' | 'sportsconnect')
    case 'fields':
      return DataMappingEngine.createFieldMappingSchema(sourceFormat as 'csv' | 'sportsconnect')
    default:
      throw new Error(`Default mapping schema not available for type: ${type}`)
  }
}

function calculateEstimatedImportTime(recordCount: number): number {
  // Estimate based on ~100 records per second
  const baseTime = Math.ceil(recordCount / 100)
  const overhead = Math.ceil(recordCount / 1000) * 5 // 5 seconds overhead per 1000 records
  return baseTime + overhead
}

function generateRecommendations(
  transformationResult: any,
  conflictResult: any,
  validationLevel: string
): string[] {
  const recommendations: string[] = []

  // Error recommendations
  if (transformationResult.errors.length > 0) {
    const errorCount = transformationResult.errors.length
    if (errorCount > 10) {
      recommendations.push(`You have ${errorCount} validation errors. Consider reviewing your data format and required fields.`)
    }
    
    const fieldErrors = transformationResult.errors.reduce((acc: Record<string, number>, error: any) => {
      if (error.field) {
        acc[error.field] = (acc[error.field] || 0) + 1
      }
      return acc
    }, {})
    
    const topErrorField = Object.entries(fieldErrors)
      .sort(([,a], [,b]) => (b as number) - (a as number))[0]
    
    if (topErrorField && topErrorField[1] > 5) {
      recommendations.push(`The field "${topErrorField[0]}" has the most errors (${topErrorField[1]}). Check the data format for this field.`)
    }
  }

  // Warning recommendations
  if (transformationResult.warnings.length > 0) {
    recommendations.push(`${transformationResult.warnings.length} warnings were found. Review these before importing to ensure data quality.`)
  }

  // Conflict recommendations
  if (conflictResult?.hasConflicts) {
    const duplicates = conflictResult.conflicts.filter((c: any) => c.type === 'duplicate').length
    if (duplicates > 0) {
      recommendations.push(`${duplicates} duplicate records found. Consider using "merge" conflict resolution to update existing records.`)
    }

    const highSeverityConflicts = conflictResult.conflicts.filter((c: any) => c.severity === 'high').length
    if (highSeverityConflicts > 0) {
      recommendations.push(`${highSeverityConflicts} high-severity conflicts require manual review before importing.`)
    }
  }

  // Validation level recommendations
  if (validationLevel === 'basic' && transformationResult.errors.length === 0) {
    recommendations.push('Consider using "strict" validation for better data quality assurance.')
  }

  // Performance recommendations
  const recordCount = transformationResult.metadata.totalRecords
  if (recordCount > 1000) {
    recommendations.push('Large dataset detected. Consider importing in smaller batches for better performance.')
  }

  if (recommendations.length === 0) {
    recommendations.push('Data validation passed successfully. Your data is ready for import!')
  }

  return recommendations
}