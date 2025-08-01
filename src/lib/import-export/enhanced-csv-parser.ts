import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { z } from 'zod'
import { 
  ImportProgressTracker, 
  ImportError, 
  createProgressTracker,
  formatFileSize 
} from './progress-tracker'

export interface ParsedData {
  users?: ParsedUser[]
  teams?: ParsedTeam[]
  fields?: ParsedField[]
  reservations?: ParsedReservation[]
}

export interface ParsedUser {
  email: string
  fullName: string
  phone?: string
  role?: string
  teamName?: string
}

export interface ParsedTeam {
  name: string
  coachEmail?: string
  ageGroup?: string
  division?: string
  sportType?: string
  season?: string
}

export interface ParsedField {
  name: string
  type: string
  address: string
  hourlyRate: number
  capacity?: number
  amenities?: string[]
  coordinates?: { lat: number; lng: number }
}

export interface ParsedReservation {
  fieldName: string
  userEmail: string
  teamName?: string
  date: string
  startTime: string
  endTime: string
  purpose?: string
  attendees?: number
  cost?: number
}

export interface ValidationRule {
  field: string
  required?: boolean
  type?: 'string' | 'number' | 'email' | 'date' | 'time'
  min?: number
  max?: number
  pattern?: RegExp
  options?: string[]
  custom?: (value: any, row: any) => string | null
}

export interface ImportOptions {
  delimiter?: string
  skipEmptyLines?: boolean
  trimFields?: boolean
  validateData?: boolean
  allowPartialImport?: boolean
  batchSize?: number
  progressCallback?: (progress: any) => void
}

const userValidationRules: ValidationRule[] = [
  { field: 'email', required: true, type: 'email' },
  { field: 'fullName', required: true, type: 'string', min: 1, max: 100 },
  { field: 'phone', type: 'string', pattern: /^\+?[\d\s\-\(\)]+$/ },
  { field: 'role', type: 'string', options: ['admin', 'coach', 'member', 'viewer'] },
]

const teamValidationRules: ValidationRule[] = [
  { field: 'name', required: true, type: 'string', min: 1, max: 100 },
  { field: 'coachEmail', type: 'email' },
  { field: 'ageGroup', type: 'string', max: 50 },
  { field: 'division', type: 'string', max: 50 },
  { field: 'sportType', type: 'string', max: 50 },
  { field: 'season', type: 'string', max: 20 },
]

const fieldValidationRules: ValidationRule[] = [
  { field: 'name', required: true, type: 'string', min: 1, max: 100 },
  { field: 'type', required: true, type: 'string', options: ['soccer', 'baseball', 'football', 'basketball', 'tennis', 'multipurpose'] },
  { field: 'address', required: true, type: 'string', min: 1, max: 200 },
  { field: 'hourlyRate', required: true, type: 'number', min: 0 },
  { field: 'capacity', type: 'number', min: 1 },
]

const reservationValidationRules: ValidationRule[] = [
  { field: 'fieldName', required: true, type: 'string', min: 1 },
  { field: 'userEmail', required: true, type: 'email' },
  { field: 'date', required: true, type: 'date' },
  { field: 'startTime', required: true, type: 'time' },
  { field: 'endTime', required: true, type: 'time' },
  { field: 'attendees', type: 'number', min: 1 },
  { field: 'cost', type: 'number', min: 0 },
]

export class EnhancedCSVParser {
  private options: ImportOptions
  private tracker?: ImportProgressTracker

  constructor(options: ImportOptions = {}) {
    this.options = {
      delimiter: ',',
      skipEmptyLines: true,
      trimFields: true,
      validateData: true,
      allowPartialImport: false,
      batchSize: 100,
      ...options,
    }
  }

  async parseCSV(
    csvContent: string,
    type: 'users' | 'teams' | 'fields' | 'reservations',
    trackProgress = true
  ): Promise<{ data: ParsedData; tracker?: ImportProgressTracker }> {
    const contentBytes = new Blob([csvContent]).size
    
    if (trackProgress) {
      this.tracker = createProgressTracker(type, 0, contentBytes)
      this.tracker.updateStage('parsing', 'Parsing CSV content...')
    }

    try {
      // Parse CSV
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: this.options.skipEmptyLines,
        trim: this.options.trimFields,
        delimiter: this.options.delimiter,
      })

      if (this.tracker) {
        this.tracker.progress.total = records.length
        this.tracker.updateProgress(0, 'Validating data...')
        this.tracker.updateStage('validating')
      }

      // Parse and validate data
      let parsedData: ParsedData = {}
      
      switch (type) {
        case 'users':
          parsedData.users = await this.parseAndValidateUsers(records)
          break
        case 'teams':
          parsedData.teams = await this.parseAndValidateTeams(records)
          break
        case 'fields':
          parsedData.fields = await this.parseAndValidateFields(records)
          break
        case 'reservations':
          parsedData.reservations = await this.parseAndValidateReservations(records)
          break
      }

      if (this.tracker) {
        this.tracker.updateStage('complete', 'Parsing completed')
      }

      return { data: parsedData, tracker: this.tracker }
    } catch (error) {
      if (this.tracker) {
        this.tracker.addError({
          row: 0,
          message: error instanceof Error ? error.message : 'Parse error',
          severity: 'error',
        })
        this.tracker.complete(false)
      }
      throw error
    }
  }

  private async parseAndValidateUsers(records: any[]): Promise<ParsedUser[]> {
    const users: ParsedUser[] = []
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      
      if (this.tracker) {
        this.tracker.updateProgress(i + 1, `Validating user: ${record.email || 'Unknown'}`)
      }

      try {
        const user: ParsedUser = {
          email: this.normalizeField(record.email || record.Email || ''),
          fullName: this.normalizeField(record.full_name || record.fullName || record.name || record.Name || ''),
          phone: this.normalizeField(record.phone || record.Phone) || undefined,
          role: this.normalizeField(record.role || record.Role) || 'member',
          teamName: this.normalizeField(record.team || record.teamName || record.Team) || undefined,
        }

        // Validate user
        const errors = this.validateRecord(user, userValidationRules, i + 1)
        if (errors.length > 0) {
          if (this.tracker) {
            this.tracker.addErrors(errors)
          }
          
          if (!this.options.allowPartialImport) {
            continue
          }
        }

        users.push(user)
        
        if (this.tracker) {
          this.tracker.incrementCreated()
        }
      } catch (error) {
        if (this.tracker) {
          this.tracker.addError({
            row: i + 1,
            message: error instanceof Error ? error.message : 'Validation error',
            data: record,
            severity: 'error',
          })
        }
      }

      // Batch processing pause
      if (i > 0 && i % this.options.batchSize! === 0) {
        await new Promise(resolve => setTimeout(resolve, 1))
      }
    }

    return users
  }

  private async parseAndValidateTeams(records: any[]): Promise<ParsedTeam[]> {
    const teams: ParsedTeam[] = []
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      
      if (this.tracker) {
        this.tracker.updateProgress(i + 1, `Validating team: ${record.name || 'Unknown'}`)
      }

      try {
        const team: ParsedTeam = {
          name: this.normalizeField(record.name || record.Name || record.team_name || record.teamName || ''),
          coachEmail: this.normalizeField(record.coach_email || record.coachEmail || record.coach) || undefined,
          ageGroup: this.normalizeField(record.age_group || record.ageGroup || record.age) || undefined,
          division: this.normalizeField(record.division || record.Division) || undefined,
          sportType: this.normalizeField(record.sport_type || record.sportType || record.sport) || undefined,
          season: this.normalizeField(record.season || record.Season) || undefined,
        }

        // Validate team
        const errors = this.validateRecord(team, teamValidationRules, i + 1)
        if (errors.length > 0) {
          if (this.tracker) {
            this.tracker.addErrors(errors)
          }
          
          if (!this.options.allowPartialImport) {
            continue
          }
        }

        teams.push(team)
        
        if (this.tracker) {
          this.tracker.incrementCreated()
        }
      } catch (error) {
        if (this.tracker) {
          this.tracker.addError({
            row: i + 1,
            message: error instanceof Error ? error.message : 'Validation error',
            data: record,
            severity: 'error',
          })
        }
      }

      // Batch processing pause
      if (i > 0 && i % this.options.batchSize! === 0) {
        await new Promise(resolve => setTimeout(resolve, 1))
      }
    }

    return teams
  }

  private async parseAndValidateFields(records: any[]): Promise<ParsedField[]> {
    const fields: ParsedField[] = []
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      
      if (this.tracker) {
        this.tracker.updateProgress(i + 1, `Validating field: ${record.name || 'Unknown'}`)
      }

      try {
        const field: ParsedField = {
          name: this.normalizeField(record.name || record.Name || record.field_name || record.fieldName || ''),
          type: this.normalizeField(record.type || record.Type || record.field_type || record.fieldType || 'multipurpose'),
          address: this.normalizeField(record.address || record.Address || record.location || record.Location || ''),
          hourlyRate: this.parseNumber(record.hourly_rate || record.hourlyRate || record.rate || record.price || '0'),
          capacity: record.capacity ? this.parseNumber(record.capacity) : undefined,
          amenities: record.amenities ? this.parseArray(record.amenities) : undefined,
          coordinates: this.parseCoordinates(record.latitude || record.lat, record.longitude || record.lng),
        }

        // Validate field
        const errors = this.validateRecord(field, fieldValidationRules, i + 1)
        if (errors.length > 0) {
          if (this.tracker) {
            this.tracker.addErrors(errors)
          }
          
          if (!this.options.allowPartialImport) {
            continue
          }
        }

        fields.push(field)
        
        if (this.tracker) {
          this.tracker.incrementCreated()
        }
      } catch (error) {
        if (this.tracker) {
          this.tracker.addError({
            row: i + 1,
            message: error instanceof Error ? error.message : 'Validation error',
            data: record,
            severity: 'error',
          })
        }
      }

      // Batch processing pause
      if (i > 0 && i % this.options.batchSize! === 0) {
        await new Promise(resolve => setTimeout(resolve, 1))
      }
    }

    return fields
  }

  private async parseAndValidateReservations(records: any[]): Promise<ParsedReservation[]> {
    const reservations: ParsedReservation[] = []
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      
      if (this.tracker) {
        this.tracker.updateProgress(i + 1, `Validating reservation: ${record.fieldName || 'Unknown'}`)
      }

      try {
        const reservation: ParsedReservation = {
          fieldName: this.normalizeField(record.field || record.fieldName || record.field_name || ''),
          userEmail: this.normalizeField(record.email || record.userEmail || record.user_email || ''),
          teamName: this.normalizeField(record.team || record.teamName || record.team_name) || undefined,
          date: this.normalizeField(record.date || record.Date || ''),
          startTime: this.normalizeField(record.start_time || record.startTime || record.start || ''),
          endTime: this.normalizeField(record.end_time || record.endTime || record.end || ''),
          purpose: this.normalizeField(record.purpose || record.Purpose || record.description) || undefined,
          attendees: record.attendees ? this.parseNumber(record.attendees) : undefined,
          cost: record.cost ? this.parseNumber(record.cost) : undefined,
        }

        // Validate reservation
        const errors = this.validateRecord(reservation, reservationValidationRules, i + 1)
        if (errors.length > 0) {
          if (this.tracker) {
            this.tracker.addErrors(errors)
          }
          
          if (!this.options.allowPartialImport) {
            continue
          }
        }

        reservations.push(reservation)
        
        if (this.tracker) {
          this.tracker.incrementCreated()
        }
      } catch (error) {
        if (this.tracker) {
          this.tracker.addError({
            row: i + 1,
            message: error instanceof Error ? error.message : 'Validation error',
            data: record,
            severity: 'error',
          })
        }
      }

      // Batch processing pause
      if (i > 0 && i % this.options.batchSize! === 0) {
        await new Promise(resolve => setTimeout(resolve, 1))
      }
    }

    return reservations
  }

  private validateRecord(record: any, rules: ValidationRule[], rowNumber: number): ImportError[] {
    if (!this.options.validateData) return []
    
    const errors: ImportError[] = []

    for (const rule of rules) {
      const value = record[rule.field]
      const error = this.validateField(value, rule, rowNumber, rule.field)
      
      if (error) {
        errors.push(error)
      }
    }

    return errors
  }

  private validateField(value: any, rule: ValidationRule, rowNumber: number, fieldName: string): ImportError | null {
    // Required field validation
    if (rule.required && (value === null || value === undefined || value === '')) {
      return {
        row: rowNumber,
        field: fieldName,
        message: `${fieldName} is required`,
        severity: 'error',
      }
    }

    // Skip validation for empty optional fields
    if (!rule.required && (value === null || value === undefined || value === '')) {
      return null
    }

    // Type validation
    if (rule.type) {
      const typeError = this.validateType(value, rule.type, rowNumber, fieldName)
      if (typeError) return typeError
    }

    // Length validation
    if (rule.min !== undefined && typeof value === 'string' && value.length < rule.min) {
      return {
        row: rowNumber,
        field: fieldName,
        message: `${fieldName} must be at least ${rule.min} characters`,
        severity: 'error',
      }
    }

    if (rule.max !== undefined && typeof value === 'string' && value.length > rule.max) {
      return {
        row: rowNumber,
        field: fieldName,
        message: `${fieldName} must be at most ${rule.max} characters`,
        severity: 'error',
      }
    }

    // Numeric range validation
    if (rule.min !== undefined && typeof value === 'number' && value < rule.min) {
      return {
        row: rowNumber,
        field: fieldName,
        message: `${fieldName} must be at least ${rule.min}`,
        severity: 'error',
      }
    }

    if (rule.max !== undefined && typeof value === 'number' && value > rule.max) {
      return {
        row: rowNumber,
        field: fieldName,
        message: `${fieldName} must be at most ${rule.max}`,
        severity: 'error',
      }
    }

    // Pattern validation
    if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
      return {
        row: rowNumber,
        field: fieldName,
        message: `${fieldName} format is invalid`,
        severity: 'error',
      }
    }

    // Options validation
    if (rule.options && !rule.options.includes(value)) {
      return {
        row: rowNumber,
        field: fieldName,
        message: `${fieldName} must be one of: ${rule.options.join(', ')}`,
        severity: 'error',
      }
    }

    // Custom validation
    if (rule.custom) {
      const customError = rule.custom(value, {})
      if (customError) {
        return {
          row: rowNumber,
          field: fieldName,
          message: customError,
          severity: 'error',
        }
      }
    }

    return null
  }

  private validateType(value: any, type: string, rowNumber: number, fieldName: string): ImportError | null {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            row: rowNumber,
            field: fieldName,
            message: `${fieldName} must be a string`,
            severity: 'error',
          }
        }
        break

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return {
            row: rowNumber,
            field: fieldName,
            message: `${fieldName} must be a valid number`,
            severity: 'error',
          }
        }
        break

      case 'email':
        if (typeof value !== 'string' || !this.isValidEmail(value)) {
          return {
            row: rowNumber,
            field: fieldName,
            message: `${fieldName} must be a valid email address`,
            severity: 'error',
          }
        }
        break

      case 'date':
        if (!this.isValidDate(value)) {
          return {
            row: rowNumber,
            field: fieldName,
            message: `${fieldName} must be a valid date (YYYY-MM-DD)`,
            severity: 'error',
          }
        }
        break

      case 'time':
        if (!this.isValidTime(value)) {
          return {
            row: rowNumber,
            field: fieldName,
            message: `${fieldName} must be a valid time (HH:MM)`,
            severity: 'error',
          }
        }
        break
    }

    return null
  }

  private normalizeField(value: any): string {
    if (value === null || value === undefined) return ''
    return String(value).trim()
  }

  private parseNumber(value: any): number {
    if (typeof value === 'number') return value
    const parsed = parseFloat(String(value))
    return isNaN(parsed) ? 0 : parsed
  }

  private parseArray(value: any): string[] {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      return value.split(',').map(item => item.trim()).filter(item => item.length > 0)
    }
    return []
  }

  private parseCoordinates(lat: any, lng: any): { lat: number; lng: number } | undefined {
    const latitude = this.parseNumber(lat)
    const longitude = this.parseNumber(lng)
    
    if (latitude === 0 && longitude === 0) return undefined
    if (latitude < -90 || latitude > 90) return undefined
    if (longitude < -180 || longitude > 180) return undefined
    
    return { lat: latitude, lng: longitude }
  }

  private isValidEmail(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return regex.test(email)
  }

  private isValidDate(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/
    if (!regex.test(dateString)) return false
    const date = new Date(dateString)
    return date instanceof Date && !isNaN(date.getTime())
  }

  private isValidTime(timeString: string): boolean {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/
    return regex.test(timeString)
  }

  // Enhanced CSV generation with metadata
  generateCSV(data: any[], type: string, includeMetadata = true): string {
    if (data.length === 0) return ''

    let csvData = [...data]
    let columns: string[] = []

    // Add metadata if requested
    if (includeMetadata) {
      const metadata = {
        exportType: type,
        exportDate: new Date().toISOString(),
        totalRecords: data.length,
        generatedBy: 'Field Reservations System',
      }
      
      // Add metadata as comment lines
      const metadataLines = Object.entries(metadata)
        .map(([key, value]) => `# ${key}: ${value}`)
        .join('\n')
      
      // Note: CSV doesn't officially support comments, but many parsers handle lines starting with #
    }

    switch (type) {
      case 'users':
        columns = ['email', 'full_name', 'phone', 'role', 'team', 'created_at', 'last_login']
        csvData = data.map(user => ({
          email: user.email,
          full_name: user.full_name,
          phone: user.phone || '',
          role: user.role,
          team: user.team?.name || '',
          created_at: user.created_at,
          last_login: user.last_login || '',
        }))
        break

      case 'teams':
        columns = ['name', 'coach_email', 'coach_name', 'age_group', 'division', 'sport_type', 'season', 'member_count', 'created_at']
        csvData = data.map(team => ({
          name: team.name,
          coach_email: team.coach?.email || '',
          coach_name: team.coach?.full_name || '',
          age_group: team.age_group || '',
          division: team.division || '',
          sport_type: team.sport_type || '',
          season: team.season || '',
          member_count: team.memberCount || 0,
          created_at: team.created_at,
        }))
        break

      case 'fields':
        columns = ['name', 'type', 'status', 'address', 'hourly_rate', 'capacity', 'amenities', 'coordinates']
        csvData = data.map(field => ({
          name: field.name,
          type: field.type,
          status: field.status,
          address: field.address,
          hourly_rate: field.hourly_rate,
          capacity: field.capacity || '',
          amenities: field.amenities?.join(', ') || '',
          coordinates: field.coordinates ? `${field.coordinates.lat},${field.coordinates.lng}` : '',
        }))
        break

      case 'reservations':
        columns = ['field', 'user_email', 'user_name', 'team', 'date', 'start_time', 'end_time', 'status', 'purpose', 'attendees', 'cost', 'created_at']
        csvData = data.map(reservation => ({
          field: reservation.field?.name || '',
          user_email: reservation.user?.email || '',
          user_name: reservation.user?.full_name || '',
          team: reservation.team?.name || '',
          date: reservation.date,
          start_time: reservation.start_time,
          end_time: reservation.end_time,
          status: reservation.status,
          purpose: reservation.purpose || '',
          attendees: reservation.attendees || '',
          cost: reservation.cost || '',
          created_at: reservation.created_at,
        }))
        break
    }

    return stringify(csvData, {
      header: true,
      columns,
    })
  }
}