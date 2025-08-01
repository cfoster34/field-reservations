import { z } from 'zod'

export interface FieldMapping {
  source: string
  target: string
  transform?: string | TransformFunction
  required?: boolean
  defaultValue?: any
  validation?: z.ZodSchema<any>
  condition?: string | ConditionFunction
}

export interface DataMappingSchema {
  id: string
  name: string
  description?: string
  sourceType: 'csv' | 'json' | 'xml' | 'sportsconnect' | 'api'
  targetType: 'user' | 'team' | 'field' | 'reservation' | 'payment'
  version: string
  fields: FieldMapping[]
  globalTransforms?: GlobalTransform[]
  validation?: ValidationRule[]
  metadata: {
    createdAt: string
    updatedAt: string
    createdBy: string
  }
}

export interface GlobalTransform {
  type: 'filter' | 'sort' | 'group' | 'deduplicate'
  condition?: string | ConditionFunction
  parameters?: Record<string, any>
}

export interface ValidationRule {
  field: string
  rule: string | ValidationFunction
  message: string
  severity: 'error' | 'warning'
}

export interface TransformationResult {
  success: boolean
  data: any[]
  errors: TransformationError[]
  warnings: TransformationWarning[]
  metadata: {
    totalRecords: number
    processedRecords: number
    skippedRecords: number
    transformedRecords: number
    duration: number
  }
}

export interface TransformationError {
  row: number
  field?: string
  message: string
  severity: 'error' | 'warning'
  rawValue?: any
  transformedValue?: any
}

export interface TransformationWarning {
  row: number
  field?: string
  message: string
  rawValue?: any
  transformedValue?: any
}

export type TransformFunction = (value: any, row: any, context: TransformContext) => any
export type ConditionFunction = (value: any, row: any, context: TransformContext) => boolean
export type ValidationFunction = (value: any, row: any, context: TransformContext) => boolean

export interface TransformContext {
  sourceData: any[]
  currentRow: any
  rowIndex: number
  fieldMappings: FieldMapping[]
  metadata: Record<string, any>
  cache: Map<string, any>
}

// Built-in transform functions
const BUILT_IN_TRANSFORMS = {
  // String transforms
  'trim': (value: any) => typeof value === 'string' ? value.trim() : value,
  'upper': (value: any) => typeof value === 'string' ? value.toUpperCase() : value,
  'lower': (value: any) => typeof value === 'string' ? value.toLowerCase() : value,
  'title': (value: any) => typeof value === 'string' 
    ? value.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
    : value,
  'removeSpaces': (value: any) => typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  'normalizePhone': (value: any) => typeof value === 'string' 
    ? value.replace(/\D/g, '').replace(/^1/, '') // Remove non-digits and leading 1
    : value,
  'extractDomain': (value: any) => typeof value === 'string' && value.includes('@')
    ? value.split('@')[1]
    : value,

  // Number transforms
  'parseInt': (value: any) => {
    const parsed = parseInt(String(value), 10)
    return isNaN(parsed) ? null : parsed
  },
  'parseFloat': (value: any) => {
    const parsed = parseFloat(String(value))
    return isNaN(parsed) ? null : parsed
  },
  'round': (value: any, decimals = 0) => {
    const num = parseFloat(String(value))
    return isNaN(num) ? null : Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals)
  },
  'abs': (value: any) => {
    const num = parseFloat(String(value))
    return isNaN(num) ? null : Math.abs(num)
  },
  'max': (value: any, max: number) => {
    const num = parseFloat(String(value))
    return isNaN(num) ? null : Math.min(num, max)
  },
  'min': (value: any, min: number) => {
    const num = parseFloat(String(value))
    return isNaN(num) ? null : Math.max(num, min)
  },

  // Date transforms
  'parseDate': (value: any) => {
    if (!value) return null
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0]
  },
  'formatDate': (value: any, format = 'YYYY-MM-DD') => {
    if (!value) return null
    const date = new Date(value)
    if (isNaN(date.getTime())) return null
    
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    
    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
  },
  'parseTime': (value: any) => {
    if (!value) return null
    const timeMatch = String(value).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
    if (!timeMatch) return null
    
    const hours = parseInt(timeMatch[1], 10)
    const minutes = parseInt(timeMatch[2], 10)
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  },

  // Array transforms
  'split': (value: any, separator = ',') => typeof value === 'string' 
    ? value.split(separator).map(item => item.trim()).filter(item => item.length > 0)
    : value,
  'join': (value: any, separator = ', ') => Array.isArray(value) 
    ? value.join(separator)
    : value,
  'unique': (value: any) => Array.isArray(value) 
    ? [...new Set(value)]
    : value,

  // Boolean transforms
  'toBool': (value: any) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim()
      return ['true', '1', 'yes', 'y', 'on', 'enabled'].includes(lower)
    }
    if (typeof value === 'number') return value !== 0
    return false
  },

  // Conditional transforms
  'default': (value: any, defaultValue: any) => value || defaultValue,
  'nullIfEmpty': (value: any) => (value === '' || value === null || value === undefined) ? null : value,
  'emptyIfNull': (value: any) => (value === null || value === undefined) ? '' : value,

  // Lookup transforms
  'lookup': (value: any, mapping: Record<string, any>) => mapping[value] || value,
  'mapRole': (value: any) => {
    const roleMapping: Record<string, string> = {
      'administrator': 'admin',
      'manager': 'admin',
      'coach': 'coach',
      'player': 'member',
      'member': 'member',
      'parent': 'member',
      'viewer': 'viewer',
      'guest': 'viewer',
    }
    return roleMapping[String(value).toLowerCase()] || 'member'
  },
  'mapFieldType': (value: any) => {
    const typeMapping: Record<string, string> = {
      'soccer field': 'soccer',
      'football field': 'football',
      'basketball court': 'basketball',
      'tennis court': 'tennis',
      'baseball field': 'baseball',
      'multi-purpose': 'multipurpose',
      'general': 'multipurpose',
    }
    return typeMapping[String(value).toLowerCase()] || 'multipurpose'
  },
}

// Built-in condition functions
const BUILT_IN_CONDITIONS = {
  'notEmpty': (value: any) => value !== null && value !== undefined && value !== '',
  'isEmpty': (value: any) => value === null || value === undefined || value === '',
  'isEmail': (value: any) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  'isPhone': (value: any) => typeof value === 'string' && /^\+?[\d\s\-\(\)]{10,}$/.test(value),
  'isNumeric': (value: any) => !isNaN(parseFloat(String(value))),
  'isDate': (value: any) => !isNaN(new Date(value).getTime()),
  'contains': (value: any, substring: string) => String(value).toLowerCase().includes(substring.toLowerCase()),
  'equals': (value: any, target: any) => value === target,
  'in': (value: any, options: any[]) => options.includes(value),
  'matches': (value: any, pattern: string) => new RegExp(pattern).test(String(value)),
}

export class DataMappingEngine {
  private transformFunctions: Map<string, TransformFunction> = new Map()
  private conditionFunctions: Map<string, ConditionFunction> = new Map()
  private validationFunctions: Map<string, ValidationFunction> = new Map()

  constructor() {
    // Register built-in functions
    Object.entries(BUILT_IN_TRANSFORMS).forEach(([name, fn]) => {
      this.transformFunctions.set(name, fn as TransformFunction)
    })

    Object.entries(BUILT_IN_CONDITIONS).forEach(([name, fn]) => {
      this.conditionFunctions.set(name, fn as ConditionFunction)
      this.validationFunctions.set(name, fn as ValidationFunction)
    })
  }

  // Register custom transform functions
  registerTransform(name: string, fn: TransformFunction): void {
    this.transformFunctions.set(name, fn)
  }

  registerCondition(name: string, fn: ConditionFunction): void {
    this.conditionFunctions.set(name, fn)
  }

  registerValidation(name: string, fn: ValidationFunction): void {
    this.validationFunctions.set(name, fn)
  }

  // Transform data using mapping schema
  async transformData(
    sourceData: any[],
    mappingSchema: DataMappingSchema,
    options: {
      skipErrors?: boolean
      maxErrors?: number
      validateOnly?: boolean
    } = {}
  ): Promise<TransformationResult> {
    const startTime = Date.now()
    const { skipErrors = false, maxErrors = 100, validateOnly = false } = options

    const result: TransformationResult = {
      success: true,
      data: [],
      errors: [],
      warnings: [],
      metadata: {
        totalRecords: sourceData.length,
        processedRecords: 0,
        skippedRecords: 0,
        transformedRecords: 0,
        duration: 0,
      },
    }

    if (sourceData.length === 0) {
      result.metadata.duration = Date.now() - startTime
      return result
    }

    // Apply global filters first
    let filteredData = sourceData
    if (mappingSchema.globalTransforms) {
      filteredData = await this.applyGlobalTransforms(sourceData, mappingSchema.globalTransforms)
    }

    // Process each record
    for (let rowIndex = 0; rowIndex < filteredData.length; rowIndex++) {
      const sourceRow = filteredData[rowIndex]
      result.metadata.processedRecords++

      try {
        // Create transform context
        const context: TransformContext = {
          sourceData: filteredData,
          currentRow: sourceRow,
          rowIndex,
          fieldMappings: mappingSchema.fields,
          metadata: {},
          cache: new Map(),
        }

        // Transform the row
        const transformedRow = await this.transformRow(sourceRow, mappingSchema.fields, context)

        // Validate the transformed row
        if (mappingSchema.validation) {
          const validationErrors = await this.validateRow(transformedRow, mappingSchema.validation, context)
          result.errors.push(...validationErrors.filter(e => e.severity === 'error'))
          result.warnings.push(...validationErrors.filter(e => e.severity === 'warning'))
        }

        // Check if we should skip this row due to errors
        const hasErrors = result.errors.filter(e => e.row === rowIndex + 1).length > 0
        if (hasErrors && skipErrors) {
          result.metadata.skippedRecords++
          continue
        }

        if (!validateOnly && !hasErrors) {
          result.data.push(transformedRow)
          result.metadata.transformedRecords++
        }

        // Stop if we've hit the error limit
        if (result.errors.length >= maxErrors) {
          result.success = false
          break
        }
      } catch (error) {
        result.errors.push({
          row: rowIndex + 1,
          message: error instanceof Error ? error.message : 'Unknown transformation error',
          severity: 'error',
          rawValue: sourceRow,
        })

        if (!skipErrors) {
          result.success = false
          break
        }

        result.metadata.skippedRecords++
      }
    }

    // Set overall success flag
    result.success = result.success && result.errors.length === 0

    result.metadata.duration = Date.now() - startTime
    return result
  }

  private async applyGlobalTransforms(data: any[], transforms: GlobalTransform[]): Promise<any[]> {
    let result = [...data]

    for (const transform of transforms) {
      switch (transform.type) {
        case 'filter':
          if (transform.condition) {
            const conditionFn = this.parseCondition(transform.condition)
            result = result.filter((row, index) => 
              conditionFn(row, row, { 
                sourceData: result, 
                currentRow: row, 
                rowIndex: index,
                fieldMappings: [],
                metadata: {},
                cache: new Map(),
              })
            )
          }
          break

        case 'sort':
          if (transform.parameters?.field) {
            const field = transform.parameters.field
            const order = transform.parameters.order || 'asc'
            result.sort((a, b) => {
              const aVal = a[field]
              const bVal = b[field]
              if (aVal < bVal) return order === 'asc' ? -1 : 1
              if (aVal > bVal) return order === 'asc' ? 1 : -1
              return 0
            })
          }
          break

        case 'deduplicate':
          if (transform.parameters?.key) {
            const key = transform.parameters.key
            const seen = new Set()
            result = result.filter(row => {
              const keyValue = row[key]
              if (seen.has(keyValue)) return false
              seen.add(keyValue)
              return true
            })
          }
          break

        case 'group':
          // Implementation for grouping if needed
          break
      }
    }

    return result
  }

  private async transformRow(
    sourceRow: any,
    fieldMappings: FieldMapping[],
    context: TransformContext
  ): Promise<any> {
    const transformedRow: any = {}

    for (const mapping of fieldMappings) {
      try {
        // Check condition if specified
        if (mapping.condition) {
          const conditionFn = this.parseCondition(mapping.condition)
          if (!conditionFn(sourceRow[mapping.source], sourceRow, context)) {
            continue
          }
        }

        // Get source value
        let value = this.getNestedValue(sourceRow, mapping.source)

        // Apply default value if needed
        if ((value === null || value === undefined || value === '') && mapping.defaultValue !== undefined) {
          value = mapping.defaultValue
        }

        // Apply transform if specified
        if (mapping.transform) {
          const transformFn = this.parseTransform(mapping.transform)
          value = transformFn(value, sourceRow, context)
        }

        // Validate if schema provided
        if (mapping.validation) {
          try {
            value = mapping.validation.parse(value)
          } catch (error) {
            if (mapping.required) {
              throw new Error(`Validation failed for field ${mapping.target}: ${error}`)
            }
            // Skip optional fields that fail validation
            continue
          }
        }

        // Set transformed value
        this.setNestedValue(transformedRow, mapping.target, value)
      } catch (error) {
        if (mapping.required) {
          throw new Error(`Required field ${mapping.target} transformation failed: ${error}`)
        }
        // Continue with other fields for optional fields
      }
    }

    return transformedRow
  }

  private async validateRow(
    row: any,
    validationRules: ValidationRule[],
    context: TransformContext
  ): Promise<TransformationError[]> {
    const errors: TransformationError[] = []

    for (const rule of validationRules) {
      try {
        const value = this.getNestedValue(row, rule.field)
        const validationFn = this.parseValidation(rule.rule)
        
        if (!validationFn(value, row, context)) {
          errors.push({
            row: context.rowIndex + 1,
            field: rule.field,
            message: rule.message,
            severity: rule.severity,
            rawValue: value,
          })
        }
      } catch (error) {
        errors.push({
          row: context.rowIndex + 1,
          field: rule.field,
          message: `Validation error: ${error}`,
          severity: 'error',
        })
      }
    }

    return errors
  }

  private parseTransform(transform: string | TransformFunction): TransformFunction {
    if (typeof transform === 'function') {
      return transform
    }

    // Parse string-based transform (e.g., "trim|upper" or "default:member")
    const transforms = transform.split('|')
    
    return (value: any, row: any, context: TransformContext) => {
      let result = value

      for (const transformStr of transforms) {
        const [funcName, ...args] = transformStr.split(':')
        const transformFn = this.transformFunctions.get(funcName.trim())
        
        if (!transformFn) {
          throw new Error(`Unknown transform function: ${funcName}`)
        }

        result = transformFn(result, row, context, ...args)
      }

      return result
    }
  }

  private parseCondition(condition: string | ConditionFunction): ConditionFunction {
    if (typeof condition === 'function') {
      return condition
    }

    // Parse string-based condition (e.g., "notEmpty" or "contains:@")
    const [funcName, ...args] = condition.split(':')
    const conditionFn = this.conditionFunctions.get(funcName.trim())
    
    if (!conditionFn) {
      throw new Error(`Unknown condition function: ${funcName}`)
    }

    return (value: any, row: any, context: TransformContext) => {
      return conditionFn(value, row, context, ...args)
    }
  }

  private parseValidation(validation: string | ValidationFunction): ValidationFunction {
    if (typeof validation === 'function') {
      return validation
    }

    // Parse string-based validation
    const [funcName, ...args] = validation.split(':')
    const validationFn = this.validationFunctions.get(funcName.trim())
    
    if (!validationFn) {
      throw new Error(`Unknown validation function: ${funcName}`)
    }

    return (value: any, row: any, context: TransformContext) => {
      return validationFn(value, row, context, ...args)
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined
    }, obj)
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.')
    const lastKey = keys.pop()!
    
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {}
      }
      return current[key]
    }, obj)
    
    target[lastKey] = value
  }

  // Create pre-defined mapping schemas for common use cases
  static createUserMappingSchema(sourceFormat: 'csv' | 'sportsconnect'): DataMappingSchema {
    const baseSchema: DataMappingSchema = {
      id: `user-${sourceFormat}-mapping`,
      name: `User Import from ${sourceFormat.toUpperCase()}`,
      description: `Standard mapping for importing users from ${sourceFormat}`,
      sourceType: sourceFormat === 'csv' ? 'csv' : 'sportsconnect',
      targetType: 'user',
      version: '1.0.0',
      fields: [],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system',
      },
    }

    if (sourceFormat === 'csv') {
      baseSchema.fields = [
        {
          source: 'email',
          target: 'email',
          required: true,
          transform: 'trim|lower',
          validation: z.string().email(),
        },
        {
          source: 'name',
          target: 'fullName',
          required: true,
          transform: 'trim|title',
          validation: z.string().min(1).max(100),
        },
        {
          source: 'phone',
          target: 'phone',
          transform: 'normalizePhone',
          condition: 'notEmpty',
        },
        {
          source: 'role',
          target: 'role',
          transform: 'mapRole',
          defaultValue: 'member',
        },
        {
          source: 'team',
          target: 'teamName',
          transform: 'trim',
          condition: 'notEmpty',
        },
      ]
    } else if (sourceFormat === 'sportsconnect') {
      baseSchema.fields = [
        {
          source: 'email',
          target: 'email',
          required: true,
          transform: 'trim|lower',
        },
        {
          source: 'firstName',
          target: 'firstName',
          required: true,
          transform: 'trim|title',
        },
        {
          source: 'lastName',
          target: 'lastName',
          required: true,
          transform: 'trim|title',
        },
        {
          source: 'phone',
          target: 'phone',
          transform: 'normalizePhone',
        },
        {
          source: 'role',
          target: 'role',
          transform: 'mapRole',
        },
      ]

      // Add computed field for full name
      baseSchema.fields.push({
        source: '',
        target: 'fullName',
        transform: (value: any, row: any) => `${row.firstName} ${row.lastName}`.trim(),
        required: true,
      })
    }

    return baseSchema
  }

  static createFieldMappingSchema(sourceFormat: 'csv' | 'sportsconnect'): DataMappingSchema {
    return {
      id: `field-${sourceFormat}-mapping`,
      name: `Field Import from ${sourceFormat.toUpperCase()}`,
      description: `Standard mapping for importing fields from ${sourceFormat}`,
      sourceType: sourceFormat === 'csv' ? 'csv' : 'sportsconnect',
      targetType: 'field',
      version: '1.0.0',
      fields: [
        {
          source: 'name',
          target: 'name',
          required: true,
          transform: 'trim',
          validation: z.string().min(1).max(100),
        },
        {
          source: 'type',
          target: 'type',
          required: true,
          transform: 'mapFieldType',
        },
        {
          source: 'address',
          target: 'address',
          required: true,
          transform: 'trim',
          validation: z.string().min(1).max(200),
        },
        {
          source: 'hourlyRate',
          target: 'hourlyRate',
          required: true,
          transform: 'parseFloat',
          validation: z.number().min(0),
        },
        {
          source: 'capacity',
          target: 'capacity',
          transform: 'parseInt',
          condition: 'isNumeric',
        },
        {
          source: 'amenities',
          target: 'amenities',
          transform: 'split:,',
          condition: 'notEmpty',
        },
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system',
      },
    }
  }
}

// Singleton instance
export const dataMappingEngine = new DataMappingEngine()