import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

export interface ConflictResolutionStrategy {
  id: string
  name: string
  description: string
  type: 'automatic' | 'manual' | 'hybrid'
  priority: number
  conditions: ConflictCondition[]
  actions: ConflictAction[]
}

export interface ConflictCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'exists' | 'custom'
  value?: any
  customFunction?: (existing: any, incoming: any) => boolean
}

export interface ConflictAction {
  type: 'skip' | 'update' | 'merge' | 'create_new' | 'prompt' | 'custom'
  fields?: string[] // Which fields to apply the action to
  mergeStrategy?: 'prefer_existing' | 'prefer_incoming' | 'combine' | 'custom'
  customFunction?: (existing: any, incoming: any) => any
}

export interface ConflictDetectionResult {
  hasConflicts: boolean
  conflicts: DataConflict[]
  summary: {
    totalRecords: number
    conflictingRecords: number
    conflictTypes: Record<string, number>
  }
}

export interface DataConflict {
  id: string
  type: 'duplicate' | 'field_mismatch' | 'constraint_violation' | 'business_rule_violation'
  severity: 'high' | 'medium' | 'low'
  existing: any
  incoming: any
  conflictingFields: string[]
  suggestedResolution: ConflictResolution
  metadata: {
    detectedAt: string
    rowIndex: number
    confidence: number
  }
}

export interface ConflictResolution {
  strategy: string
  action: 'skip' | 'update' | 'merge' | 'create_new' | 'manual_review'
  resolvedData?: any
  reason: string
  autoResolvable: boolean
}

export interface ConflictResolutionResult {
  resolved: DataConflict[]
  unresolved: DataConflict[]
  actions: {
    skipped: number
    updated: number
    merged: number
    created: number
    manualReview: number
  }
}

// Pre-defined conflict resolution strategies
const DEFAULT_STRATEGIES: ConflictResolutionStrategy[] = [
  {
    id: 'user-email-duplicate',
    name: 'User Email Duplicate',
    description: 'Handle duplicate user emails by updating existing user data',
    type: 'automatic',
    priority: 1,
    conditions: [
      { field: 'email', operator: 'equals', value: null },
    ],
    actions: [
      { 
        type: 'merge', 
        mergeStrategy: 'prefer_incoming',
        fields: ['fullName', 'phone', 'role'] 
      },
    ],
  },
  {
    id: 'team-name-duplicate',
    name: 'Team Name Duplicate',
    description: 'Skip teams with duplicate names in the same league',
    type: 'automatic',
    priority: 1,
    conditions: [
      { field: 'name', operator: 'equals', value: null },
      { field: 'leagueId', operator: 'equals', value: null },
    ],
    actions: [
      { type: 'skip' },
    ],
  },
  {
    id: 'field-name-duplicate',
    name: 'Field Name Duplicate',
    description: 'Update existing field data when names match',
    type: 'automatic',
    priority: 1,
    conditions: [
      { field: 'name', operator: 'equals', value: null },
      { field: 'leagueId', operator: 'equals', value: null },
    ],
    actions: [
      { 
        type: 'update',
        fields: ['type', 'address', 'hourlyRate', 'capacity', 'amenities']
      },
    ],
  },
  {
    id: 'reservation-time-conflict',
    name: 'Reservation Time Conflict',
    description: 'Detect and handle overlapping reservations',
    type: 'manual',
    priority: 2,
    conditions: [
      { field: 'fieldId', operator: 'equals', value: null },
      { field: 'date', operator: 'equals', value: null },
      { 
        field: 'timeRange', 
        operator: 'custom',
        customFunction: (existing, incoming) => {
          return this.hasTimeOverlap(existing, incoming)
        }
      },
    ],
    actions: [
      { type: 'prompt' },
    ],
  },
  {
    id: 'user-role-change',
    name: 'User Role Change',
    description: 'Handle role changes with business rule validation',
    type: 'hybrid',
    priority: 3,
    conditions: [
      { field: 'email', operator: 'equals', value: null },
      { field: 'role', operator: 'not_equals', value: null },
    ],
    actions: [
      { 
        type: 'custom',
        customFunction: (existing, incoming) => {
          return this.validateRoleChange(existing, incoming)
        }
      },
    ],
  },
]

export class ConflictResolver {
  private supabase: any
  private strategies: Map<string, ConflictResolutionStrategy> = new Map()

  constructor() {
    this.supabase = createClient()
    
    // Register default strategies
    DEFAULT_STRATEGIES.forEach(strategy => {
      this.strategies.set(strategy.id, strategy)
    })
  }

  // Register custom conflict resolution strategy
  registerStrategy(strategy: ConflictResolutionStrategy): void {
    this.strategies.set(strategy.id, strategy)
  }

  // Detect conflicts in incoming data
  async detectConflicts(
    incomingData: any[],
    targetType: 'user' | 'team' | 'field' | 'reservation',
    leagueId: string,
    options: {
      strictMode?: boolean
      checkBusinessRules?: boolean
      customStrategies?: string[]
    } = {}
  ): Promise<ConflictDetectionResult> {
    const { strictMode = false, checkBusinessRules = true } = options

    const conflicts: DataConflict[] = []
    const conflictTypes: Record<string, number> = {}

    // Get existing data for comparison
    const existingData = await this.getExistingData(targetType, leagueId)

    for (let i = 0; i < incomingData.length; i++) {
      const incomingRecord = incomingData[i]
      
      // Check for duplicates
      const duplicateConflicts = await this.checkDuplicates(
        incomingRecord,
        existingData,
        targetType,
        i
      )
      conflicts.push(...duplicateConflicts)

      // Check field mismatches
      const fieldConflicts = await this.checkFieldMismatches(
        incomingRecord,
        existingData,
        targetType,
        i,
        strictMode
      )
      conflicts.push(...fieldConflicts)

      // Check constraint violations
      const constraintConflicts = await this.checkConstraintViolations(
        incomingRecord,
        targetType,
        i
      )
      conflicts.push(...constraintConflicts)

      // Check business rule violations
      if (checkBusinessRules) {
        const businessRuleConflicts = await this.checkBusinessRuleViolations(
          incomingRecord,
          existingData,
          targetType,
          leagueId,
          i
        )
        conflicts.push(...businessRuleConflicts)
      }
    }

    // Count conflict types
    conflicts.forEach(conflict => {
      conflictTypes[conflict.type] = (conflictTypes[conflict.type] || 0) + 1
    })

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      summary: {
        totalRecords: incomingData.length,
        conflictingRecords: new Set(conflicts.map(c => c.metadata.rowIndex)).size,
        conflictTypes,
      },
    }
  }

  // Resolve conflicts using registered strategies
  async resolveConflicts(
    conflicts: DataConflict[],
    options: {
      autoResolveOnly?: boolean
      strategy?: string
      dryRun?: boolean
    } = {}
  ): Promise<ConflictResolutionResult> {
    const { autoResolveOnly = false, strategy, dryRun = false } = options

    const result: ConflictResolutionResult = {
      resolved: [],
      unresolved: [],
      actions: {
        skipped: 0,
        updated: 0,
        merged: 0,
        created: 0,
        manualReview: 0,
      },
    }

    for (const conflict of conflicts) {
      try {
        // Find applicable strategy
        const applicableStrategy = strategy 
          ? this.strategies.get(strategy)
          : this.findApplicableStrategy(conflict)

        if (!applicableStrategy) {
          result.unresolved.push(conflict)
          result.actions.manualReview++
          continue
        }

        // Skip manual strategies if auto-resolve only
        if (autoResolveOnly && applicableStrategy.type === 'manual') {
          result.unresolved.push(conflict)
          result.actions.manualReview++
          continue
        }

        // Apply resolution strategy
        const resolution = await this.applyResolutionStrategy(
          conflict,
          applicableStrategy,
          dryRun
        )

        conflict.suggestedResolution = resolution
        result.resolved.push(conflict)

        // Update action counts
        switch (resolution.action) {
          case 'skip':
            result.actions.skipped++
            break
          case 'update':
            result.actions.updated++
            break
          case 'merge':
            result.actions.merged++
            break
          case 'create_new':
            result.actions.created++
            break
          case 'manual_review':
            result.actions.manualReview++
            break
        }
      } catch (error) {
        console.error('Error resolving conflict:', error)
        result.unresolved.push(conflict)
        result.actions.manualReview++
      }
    }

    return result
  }

  private async getExistingData(
    targetType: 'user' | 'team' | 'field' | 'reservation',
    leagueId: string
  ): Promise<any[]> {
    let tableName: string
    let selectFields: string

    switch (targetType) {
      case 'user':
        tableName = 'user_profiles'
        selectFields = 'id, email, full_name, phone, role, team_id, created_at, updated_at'
        break
      case 'team':
        tableName = 'teams'
        selectFields = 'id, name, coach_id, age_group, division, created_at, updated_at'
        break
      case 'field':
        tableName = 'fields'
        selectFields = 'id, name, type, address, hourly_rate, capacity, amenities, created_at, updated_at'
        break
      case 'reservation':
        tableName = 'reservations'
        selectFields = 'id, field_id, user_id, date, start_time, end_time, status, created_at, updated_at'
        break
      default:
        throw new Error(`Unsupported target type: ${targetType}`)
    }

    const { data, error } = await this.supabase
      .from(tableName)
      .select(selectFields)
      .eq('league_id', leagueId)

    if (error) {
      throw new Error(`Failed to fetch existing ${targetType} data: ${error.message}`)
    }

    return data || []
  }

  private async checkDuplicates(
    incomingRecord: any,
    existingData: any[],
    targetType: string,
    rowIndex: number
  ): Promise<DataConflict[]> {
    const conflicts: DataConflict[] = []

    // Define unique fields for each type
    const uniqueFields: Record<string, string[]> = {
      user: ['email'],
      team: ['name'],
      field: ['name'],
      reservation: ['fieldId', 'date', 'startTime', 'endTime'],
    }

    const fields = uniqueFields[targetType] || []

    for (const existing of existingData) {
      const isDuplicate = fields.every(field => {
        const incomingValue = this.getFieldValue(incomingRecord, field)
        const existingValue = this.getFieldValue(existing, field)
        return incomingValue === existingValue
      })

      if (isDuplicate) {
        conflicts.push({
          id: `duplicate-${targetType}-${rowIndex}-${existing.id}`,
          type: 'duplicate',
          severity: 'high',
          existing,
          incoming: incomingRecord,
          conflictingFields: fields,
          suggestedResolution: {
            strategy: 'merge',
            action: 'merge',
            reason: `Duplicate ${targetType} found based on ${fields.join(', ')}`,
            autoResolvable: true,
          },
          metadata: {
            detectedAt: new Date().toISOString(),
            rowIndex,
            confidence: 0.95,
          },
        })
      }
    }

    return conflicts
  }

  private async checkFieldMismatches(
    incomingRecord: any,
    existingData: any[],
    targetType: string,
    rowIndex: number,
    strictMode: boolean
  ): Promise<DataConflict[]> {
    const conflicts: DataConflict[] = []

    // Find potential matches (same unique identifier but different data)
    const identifierFields: Record<string, string[]> = {
      user: ['email'],
      team: ['name'],
      field: ['name'],
      reservation: ['fieldId', 'date'],
    }

    const identifiers = identifierFields[targetType] || []
    
    for (const existing of existingData) {
      const isMatch = identifiers.every(field => {
        const incomingValue = this.getFieldValue(incomingRecord, field)
        const existingValue = this.getFieldValue(existing, field)
        return incomingValue === existingValue
      })

      if (isMatch) {
        const conflictingFields = this.findConflictingFields(
          existing,
          incomingRecord,
          strictMode
        )

        if (conflictingFields.length > 0) {
          const severity = this.calculateConflictSeverity(conflictingFields, targetType)
          
          conflicts.push({
            id: `mismatch-${targetType}-${rowIndex}-${existing.id}`,
            type: 'field_mismatch',
            severity,
            existing,
            incoming: incomingRecord,
            conflictingFields,
            suggestedResolution: {
              strategy: 'update',
              action: 'update',
              reason: `Field mismatches detected: ${conflictingFields.join(', ')}`,
              autoResolvable: severity !== 'high',
            },
            metadata: {
              detectedAt: new Date().toISOString(),
              rowIndex,
              confidence: 0.8,
            },
          })
        }
      }
    }

    return conflicts
  }

  private async checkConstraintViolations(
    incomingRecord: any,
    targetType: string,
    rowIndex: number
  ): Promise<DataConflict[]> {
    const conflicts: DataConflict[] = []

    // Define constraints for each type
    const constraints: Record<string, Array<{ field: string; rule: string; message: string }>> = {
      user: [
        { field: 'email', rule: 'email', message: 'Invalid email format' },
        { field: 'fullName', rule: 'required', message: 'Full name is required' },
        { field: 'role', rule: 'enum:admin,coach,member,viewer', message: 'Invalid role' },
      ],
      team: [
        { field: 'name', rule: 'required', message: 'Team name is required' },
        { field: 'name', rule: 'maxLength:100', message: 'Team name too long' },
      ],
      field: [
        { field: 'name', rule: 'required', message: 'Field name is required' },
        { field: 'hourlyRate', rule: 'number:min:0', message: 'Hourly rate must be positive' },
        { field: 'type', rule: 'enum:soccer,baseball,football,basketball,tennis,multipurpose', message: 'Invalid field type' },
      ],
      reservation: [
        { field: 'date', rule: 'date', message: 'Invalid date format' },
        { field: 'startTime', rule: 'time', message: 'Invalid start time format' },
        { field: 'endTime', rule: 'time', message: 'Invalid end time format' },
      ],
    }

    const typeConstraints = constraints[targetType] || []

    for (const constraint of typeConstraints) {
      const value = this.getFieldValue(incomingRecord, constraint.field)
      const isValid = this.validateConstraint(value, constraint.rule)

      if (!isValid) {
        conflicts.push({
          id: `constraint-${targetType}-${rowIndex}-${constraint.field}`,
          type: 'constraint_violation',
          severity: 'high',
          existing: null,
          incoming: incomingRecord,
          conflictingFields: [constraint.field],
          suggestedResolution: {
            strategy: 'skip',
            action: 'skip',
            reason: constraint.message,
            autoResolvable: false,
          },
          metadata: {
            detectedAt: new Date().toISOString(),
            rowIndex,
            confidence: 1.0,
          },
        })
      }
    }

    return conflicts
  }

  private async checkBusinessRuleViolations(
    incomingRecord: any,
    existingData: any[],
    targetType: string,
    leagueId: string,
    rowIndex: number
  ): Promise<DataConflict[]> {
    const conflicts: DataConflict[] = []

    // Implement business rule checks based on target type
    switch (targetType) {
      case 'user':
        // Check if user is being assigned to a team that doesn't exist
        if (incomingRecord.teamName) {
          const teamExists = existingData.some(team => team.name === incomingRecord.teamName)
          if (!teamExists) {
            conflicts.push({
              id: `business-rule-${targetType}-${rowIndex}-invalid-team`,
              type: 'business_rule_violation',
              severity: 'medium',
              existing: null,
              incoming: incomingRecord,
              conflictingFields: ['teamName'],
              suggestedResolution: {
                strategy: 'skip_field',
                action: 'update',
                reason: 'Referenced team does not exist',
                autoResolvable: true,
              },
              metadata: {
                detectedAt: new Date().toISOString(),
                rowIndex,
                confidence: 0.9,
              },
            })
          }
        }
        break

      case 'reservation':
        // Check for time conflicts
        const timeConflicts = existingData.filter(existing => 
          existing.field_id === incomingRecord.fieldId &&
          existing.date === incomingRecord.date &&
          this.hasTimeOverlap(existing, incomingRecord) &&
          existing.status !== 'cancelled'
        )

        if (timeConflicts.length > 0) {
          conflicts.push({
            id: `business-rule-${targetType}-${rowIndex}-time-conflict`,
            type: 'business_rule_violation',
            severity: 'high',
            existing: timeConflicts[0],
            incoming: incomingRecord,
            conflictingFields: ['date', 'startTime', 'endTime'],
            suggestedResolution: {
              strategy: 'skip',
              action: 'skip',
              reason: 'Time slot conflict with existing reservation',
              autoResolvable: false,
            },
            metadata: {
              detectedAt: new Date().toISOString(),
              rowIndex,
              confidence: 1.0,
            },
          })
        }
        break
    }

    return conflicts
  }

  private findApplicableStrategy(conflict: DataConflict): ConflictResolutionStrategy | null {
    const applicableStrategies = Array.from(this.strategies.values())
      .filter(strategy => this.isStrategyApplicable(strategy, conflict))
      .sort((a, b) => a.priority - b.priority)

    return applicableStrategies[0] || null
  }

  private isStrategyApplicable(
    strategy: ConflictResolutionStrategy,
    conflict: DataConflict
  ): boolean {
    return strategy.conditions.every(condition => {
      const existingValue = this.getFieldValue(conflict.existing, condition.field)
      const incomingValue = this.getFieldValue(conflict.incoming, condition.field)

      switch (condition.operator) {
        case 'equals':
          return existingValue === incomingValue
        case 'not_equals':
          return existingValue !== incomingValue
        case 'contains':
          return String(existingValue).includes(String(condition.value))
        case 'exists':
          return existingValue !== null && existingValue !== undefined
        case 'custom':
          return condition.customFunction?.(conflict.existing, conflict.incoming) || false
        default:
          return false
      }
    })
  }

  private async applyResolutionStrategy(
    conflict: DataConflict,
    strategy: ConflictResolutionStrategy,
    dryRun: boolean
  ): Promise<ConflictResolution> {
    const action = strategy.actions[0] // Use first action for simplicity

    switch (action.type) {
      case 'skip':
        return {
          strategy: strategy.id,
          action: 'skip',
          reason: `Skipped due to strategy: ${strategy.name}`,
          autoResolvable: true,
        }

      case 'update':
        const updateData = this.prepareUpdateData(conflict, action)
        if (!dryRun) {
          // Perform actual update
          await this.performUpdate(conflict, updateData)
        }
        return {
          strategy: strategy.id,
          action: 'update',
          resolvedData: updateData,
          reason: `Updated using strategy: ${strategy.name}`,
          autoResolvable: true,
        }

      case 'merge':
        const mergedData = this.performMerge(conflict, action)
        if (!dryRun) {
          // Perform actual merge
          await this.performUpdate(conflict, mergedData)
        }
        return {
          strategy: strategy.id,
          action: 'merge',
          resolvedData: mergedData,
          reason: `Merged using strategy: ${strategy.name}`,
          autoResolvable: true,
        }

      case 'create_new':
        if (!dryRun) {
          // Create new record with modified data
          await this.performCreate(conflict)
        }
        return {
          strategy: strategy.id,
          action: 'create_new',
          resolvedData: conflict.incoming,
          reason: `Created new record using strategy: ${strategy.name}`,
          autoResolvable: true,
        }

      case 'prompt':
        return {
          strategy: strategy.id,
          action: 'manual_review',
          reason: `Manual review required by strategy: ${strategy.name}`,
          autoResolvable: false,
        }

      case 'custom':
        const customResult = action.customFunction?.(conflict.existing, conflict.incoming)
        return {
          strategy: strategy.id,
          action: 'update',
          resolvedData: customResult,
          reason: `Custom resolution using strategy: ${strategy.name}`,
          autoResolvable: true,
        }

      default:
        throw new Error(`Unknown action type: ${action.type}`)
    }
  }

  // Helper methods
  private getFieldValue(record: any, field: string): any {
    return field.split('.').reduce((obj, key) => obj?.[key], record)
  }

  private findConflictingFields(existing: any, incoming: any, strictMode: boolean): string[] {
    const conflicting: string[] = []
    
    // Compare all fields in incoming record
    for (const [key, incomingValue] of Object.entries(incoming)) {
      const existingValue = existing[key]
      
      if (this.valuesConflict(existingValue, incomingValue, strictMode)) {
        conflicting.push(key)
      }
    }
    
    return conflicting
  }

  private valuesConflict(existing: any, incoming: any, strictMode: boolean): boolean {
    if (existing === incoming) return false
    if (existing === null || existing === undefined) return false
    if (incoming === null || incoming === undefined) return false
    
    if (strictMode) {
      return existing !== incoming
    } else {
      // Lenient comparison - consider string/number equivalents
      return String(existing).toLowerCase() !== String(incoming).toLowerCase()
    }
  }

  private calculateConflictSeverity(
    conflictingFields: string[],
    targetType: string
  ): 'high' | 'medium' | 'low' {
    const criticalFields: Record<string, string[]> = {
      user: ['email', 'role'],
      team: ['name', 'coach_id'],
      field: ['name', 'type'],
      reservation: ['field_id', 'date', 'start_time', 'end_time'],
    }
    
    const critical = criticalFields[targetType] || []
    const hasCriticalConflict = conflictingFields.some(field => critical.includes(field))
    
    if (hasCriticalConflict) return 'high'
    if (conflictingFields.length > 3) return 'medium'
    return 'low'
  }

  private validateConstraint(value: any, rule: string): boolean {
    const [type, ...params] = rule.split(':')
    
    switch (type) {
      case 'required':
        return value !== null && value !== undefined && value !== ''
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
      case 'number':
        const num = parseFloat(String(value))
        if (isNaN(num)) return false
        if (params.includes('min')) {
          const min = parseFloat(params[params.indexOf('min') + 1])
          if (num < min) return false
        }
        return true
      case 'enum':
        return params.includes(String(value))
      case 'date':
        return !isNaN(new Date(value).getTime())
      case 'time':
        return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value))
      case 'maxLength':
        return String(value).length <= parseInt(params[0])
      default:
        return true
    }
  }

  private hasTimeOverlap(existing: any, incoming: any): boolean {
    const existingStart = this.timeToMinutes(existing.start_time || existing.startTime)
    const existingEnd = this.timeToMinutes(existing.end_time || existing.endTime)
    const incomingStart = this.timeToMinutes(incoming.start_time || incoming.startTime)
    const incomingEnd = this.timeToMinutes(incoming.end_time || incoming.endTime)
    
    return (incomingStart < existingEnd) && (incomingEnd > existingStart)
  }

  private timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
  }

  private prepareUpdateData(conflict: DataConflict, action: ConflictAction): any {
    const updateData: any = {}
    const fieldsToUpdate = action.fields || Object.keys(conflict.incoming)
    
    fieldsToUpdate.forEach(field => {
      if (conflict.incoming[field] !== undefined) {
        updateData[field] = conflict.incoming[field]
      }
    })
    
    return updateData
  }

  private performMerge(conflict: DataConflict, action: ConflictAction): any {
    const mergedData = { ...conflict.existing }
    
    switch (action.mergeStrategy) {
      case 'prefer_existing':
        // Only update fields that are null/undefined in existing
        Object.entries(conflict.incoming).forEach(([key, value]) => {
          if (mergedData[key] === null || mergedData[key] === undefined) {
            mergedData[key] = value
          }
        })
        break
        
      case 'prefer_incoming':
        // Update with incoming data, keeping existing for null/undefined incoming values
        Object.entries(conflict.incoming).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            mergedData[key] = value
          }
        })
        break
        
      case 'combine':
        // Combine arrays, concatenate strings, prefer incoming for others
        Object.entries(conflict.incoming).forEach(([key, value]) => {
          const existingValue = mergedData[key]
          
          if (Array.isArray(existingValue) && Array.isArray(value)) {
            mergedData[key] = [...new Set([...existingValue, ...value])]
          } else if (typeof existingValue === 'string' && typeof value === 'string') {
            mergedData[key] = `${existingValue}; ${value}`
          } else if (value !== null && value !== undefined) {
            mergedData[key] = value
          }
        })
        break
        
      default:
        Object.assign(mergedData, conflict.incoming)
    }
    
    return mergedData
  }

  private async performUpdate(conflict: DataConflict, updateData: any): Promise<void> {
    // Implementation would depend on the target type and database schema
    // This is a placeholder for the actual update logic
    console.log('Performing update:', { conflict: conflict.id, updateData })
  }

  private async performCreate(conflict: DataConflict): Promise<void> {
    // Implementation would depend on the target type and database schema
    // This is a placeholder for the actual create logic
    console.log('Performing create:', { conflict: conflict.id, data: conflict.incoming })
  }

  private validateRoleChange(existing: any, incoming: any): any {
    // Business rule: Only admins can create other admins
    if (incoming.role === 'admin' && existing.role !== 'admin') {
      return { ...incoming, role: existing.role } // Keep existing role
    }
    return incoming
  }
}

// Singleton instance
export const conflictResolver = new ConflictResolver()