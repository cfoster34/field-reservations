import { format, addHours, getTimezoneOffset } from 'date-fns'
import { zonedTimeToUtc, utcToZonedTime, format as formatTz } from 'date-fns-tz'
import { TimezoneHandler } from './timezone-handler'

interface Reservation {
  id: string
  date: string
  start_time: string
  end_time: string
  purpose: string
  attendees: number
  notes?: string
  status: string
  field: {
    id: string
    name: string
    address?: string
    type: string
  }
  user: {
    id: string
    full_name: string
  }
  team?: {
    id: string
    name: string
  }
  created_at: string
  updated_at: string
}

interface CalendarOptions {
  name: string
  description?: string
  timezone?: string
  color?: string
  refreshInterval?: number
}

export class ICalGenerator {
  private timezone: string
  private prodId: string

  constructor(timezone: string = 'UTC') {
    this.timezone = timezone
    this.prodId = '-//Field Reservations System//EN'
  }

  /**
   * Generate a complete iCal calendar with proper formatting
   */
  generateCalendar(
    reservations: Reservation[], 
    options: CalendarOptions
  ): string {
    const lines: string[] = []
    
    // Calendar header
    lines.push('BEGIN:VCALENDAR')
    lines.push('VERSION:2.0')
    lines.push(`PRODID:${this.prodId}`)
    lines.push('CALSCALE:GREGORIAN')
    lines.push('METHOD:PUBLISH')
    
    // Calendar properties
    lines.push(`X-WR-CALNAME:${this.escapeText(options.name)}`)
    lines.push(`X-WR-TIMEZONE:${this.timezone}`)
    
    if (options.description) {
      lines.push(`X-WR-CALDESC:${this.escapeText(options.description)}`)
    }
    
    if (options.color) {
      lines.push(`X-APPLE-CALENDAR-COLOR:${options.color}`)
      lines.push(`X-OUTLOOK-COLOR:${options.color}`)
    }
    
    if (options.refreshInterval) {
      lines.push(`X-PUBLISHED-TTL:PT${options.refreshInterval}M`)
      lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${options.refreshInterval}M`)
    }

    // Add timezone information
    lines.push(...this.generateTimezone())

    // Add events
    for (const reservation of reservations) {
      lines.push(...this.generateEvent(reservation))
    }

    // Calendar footer
    lines.push('END:VCALENDAR')

    return lines.join('\r\n')
  }

  /**
   * Generate timezone component with DST rules using TimezoneHandler
   */
  private generateTimezone(): string[] {
    if (this.timezone === 'UTC') {
      return []
    }

    // Use TimezoneHandler to generate proper VTIMEZONE component
    return TimezoneHandler.generateVTimezone(this.timezone)
  }

  /**
   * Generate a single VEVENT with proper formatting
   */
  private generateEvent(reservation: Reservation): string[] {
    const lines: string[] = []
    
    // Parse dates
    const startDateTime = new Date(`${reservation.date}T${reservation.start_time}`)
    const endDateTime = new Date(`${reservation.date}T${reservation.end_time}`)
    const createdDate = new Date(reservation.created_at)
    const modifiedDate = new Date(reservation.updated_at)
    const now = new Date()

    // Format dates for iCal
    const dtStart = this.formatDateTime(startDateTime)
    const dtEnd = this.formatDateTime(endDateTime)
    const dtStamp = this.formatDateTime(now)
    const created = this.formatDateTime(createdDate)
    const lastModified = this.formatDateTime(modifiedDate)

    lines.push('BEGIN:VEVENT')
    
    // Required fields
    lines.push(`UID:reservation-${reservation.id}@fieldreservations.com`)
    lines.push(`DTSTART${this.timezone === 'UTC' ? '' : `;TZID=${this.timezone}`}:${dtStart}`)
    lines.push(`DTEND${this.timezone === 'UTC' ? '' : `;TZID=${this.timezone}`}:${dtEnd}`)
    lines.push(`DTSTAMP:${dtStamp}`)
    
    // Event details
    const summary = this.buildSummary(reservation)
    lines.push(`SUMMARY:${this.escapeText(summary)}`)
    
    const description = this.buildDescription(reservation)
    lines.push(`DESCRIPTION:${this.escapeText(description)}`)
    
    // Location
    const location = reservation.field.address || reservation.field.name
    lines.push(`LOCATION:${this.escapeText(location)}`)
    
    // Status mapping
    const status = this.mapStatus(reservation.status)
    lines.push(`STATUS:${status}`)
    
    // Priority based on field type
    const priority = this.getPriority(reservation.field.type)
    lines.push(`PRIORITY:${priority}`)
    
    // Categories
    const categories = this.getCategories(reservation)
    if (categories.length > 0) {
      lines.push(`CATEGORIES:${categories.join(',')}`)
    }
    
    // Timestamps
    lines.push(`CREATED:${created}`)
    lines.push(`LAST-MODIFIED:${lastModified}`)
    
    // Organizer (field management)
    lines.push(`ORGANIZER;CN="${this.escapeText(reservation.user.full_name)}":mailto:noreply@fieldreservations.com`)
    
    // Attendees count as a custom property
    lines.push(`X-FIELD-ATTENDEES:${reservation.attendees}`)
    lines.push(`X-FIELD-TYPE:${reservation.field.type}`)
    lines.push(`X-RESERVATION-ID:${reservation.id}`)
    
    // Team information if available
    if (reservation.team) {
      lines.push(`X-TEAM-NAME:${this.escapeText(reservation.team.name)}`)
      lines.push(`X-TEAM-ID:${reservation.team.id}`)
    }
    
    // Add reminders for confirmed reservations
    if (reservation.status === 'confirmed') {
      lines.push(...this.generateAlarms())
    }
    
    lines.push('END:VEVENT')
    
    return lines
  }

  /**
   * Generate alarm components for reminders
   */
  private generateAlarms(): string[] {
    const lines: string[] = []
    
    // 24 hour reminder
    lines.push('BEGIN:VALARM')
    lines.push('TRIGGER:-P1D')
    lines.push('ACTION:DISPLAY')
    lines.push('DESCRIPTION:Field reservation reminder - 24 hours')
    lines.push('END:VALARM')
    
    // 1 hour reminder
    lines.push('BEGIN:VALARM')
    lines.push('TRIGGER:-PT1H')
    lines.push('ACTION:DISPLAY')
    lines.push('DESCRIPTION:Field reservation reminder - 1 hour')
    lines.push('END:VALARM')
    
    return lines
  }

  /**
   * Build event summary
   */
  private buildSummary(reservation: Reservation): string {
    const parts = [reservation.field.name]
    
    if (reservation.team) {
      parts.push(reservation.team.name)
    }
    
    if (reservation.purpose && reservation.purpose !== 'General Use') {
      parts.push(reservation.purpose)
    }
    
    return parts.join(' - ')
  }

  /**
   * Build event description
   */
  private buildDescription(reservation: Reservation): string {
    const parts: string[] = []
    
    parts.push(`Field: ${reservation.field.name}`)
    parts.push(`Purpose: ${reservation.purpose}`)
    parts.push(`Expected Attendees: ${reservation.attendees}`)
    
    if (reservation.team) {
      parts.push(`Team: ${reservation.team.name}`)
    }
    
    if (reservation.notes) {
      parts.push(`Notes: ${reservation.notes}`)
    }
    
    parts.push(`Status: ${reservation.status.toUpperCase()}`)
    parts.push(`Reservation ID: ${reservation.id}`)
    
    return parts.join('\\n')
  }

  /**
   * Map reservation status to iCal status
   */
  private mapStatus(status: string): string {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return 'CONFIRMED'
      case 'pending':
        return 'TENTATIVE'
      case 'cancelled':
        return 'CANCELLED'
      default:
        return 'TENTATIVE'
    }
  }

  /**
   * Get priority based on field type
   */
  private getPriority(fieldType: string): number {
    switch (fieldType.toLowerCase()) {
      case 'championship':
      case 'tournament':
        return 1 // High priority
      case 'practice':
        return 9 // Low priority
      default:
        return 5 // Medium priority
    }
  }

  /**
   * Get categories for the event
   */
  private getCategories(reservation: Reservation): string[] {
    const categories: string[] = []
    
    categories.push('Sports')
    categories.push(reservation.field.type)
    
    if (reservation.team) {
      categories.push('Team Event')
    }
    
    if (reservation.purpose.toLowerCase().includes('tournament')) {
      categories.push('Tournament')
    } else if (reservation.purpose.toLowerCase().includes('practice')) {
      categories.push('Practice')
    }
    
    return categories
  }

  /**
   * Format date time for iCal using TimezoneHandler
   */
  private formatDateTime(date: Date): string {
    if (this.timezone === 'UTC') {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    }
    
    // Use TimezoneHandler for proper timezone conversion
    const convertedDate = TimezoneHandler.convertTimezone(date, 'UTC', this.timezone)
    return TimezoneHandler.formatInTimezone(convertedDate, this.timezone, 'yyyyMMdd\'T\'HHmmss')
  }

  /**
   * Escape text for iCal format
   */
  private escapeText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '')
  }

  /**
   * Fold long lines according to RFC 5545
   */
  static foldLines(content: string): string {
    const lines = content.split('\r\n')
    const foldedLines: string[] = []
    
    for (const line of lines) {
      if (line.length <= 75) {
        foldedLines.push(line)
      } else {
        // Split line at 75 character boundary
        let remaining = line
        let first = true
        
        while (remaining.length > 75) {
          const splitAt = first ? 75 : 74 // Account for space prefix on continuation lines
          foldedLines.push((first ? '' : ' ') + remaining.substring(0, splitAt))
          remaining = remaining.substring(splitAt)
          first = false
        }
        
        if (remaining.length > 0) {
          foldedLines.push((first ? '' : ' ') + remaining)
        }
      }
    }
    
    return foldedLines.join('\r\n')
  }
}

/**
 * Generate iCal content for reservations
 */
export function generateICalendar(
  reservations: Reservation[], 
  options: CalendarOptions,
  timezone: string = 'UTC'
): string {
  const generator = new ICalGenerator(timezone)
  const content = generator.generateCalendar(reservations, options)
  return ICalGenerator.foldLines(content)
}

/**
 * Generate iCal for a single reservation
 */
export function generateSingleEvent(
  reservation: Reservation,
  timezone: string = 'UTC'
): string {
  const generator = new ICalGenerator(timezone)
  const options: CalendarOptions = {
    name: `${reservation.field.name} Reservation`,
    description: `Field reservation for ${reservation.purpose}`,
    timezone
  }
  
  const content = generator.generateCalendar([reservation], options)
  return ICalGenerator.foldLines(content)
}