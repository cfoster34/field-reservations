import { zonedTimeToUtc, utcToZonedTime, format as formatTz } from 'date-fns-tz'
import { format, parseISO, isValid } from 'date-fns'

interface TimezoneInfo {
  iana: string
  display: string
  offset: string
  abbreviation: string
  isDst: boolean
  utcOffset: number // minutes
}

interface TimezoneRule {
  iana: string
  standardOffset: number // minutes from UTC
  dstOffset: number // minutes from UTC during DST
  dstStart?: {
    month: number
    week: number // 1-5, or -1 for last
    dayOfWeek: number // 0=Sunday, 6=Saturday
    time: string // HH:mm
  }
  dstEnd?: {
    month: number
    week: number
    dayOfWeek: number
    time: string
  }
}

export class TimezoneHandler {
  private static timezoneRules: TimezoneRule[] = [
    // US Timezones
    {
      iana: 'America/New_York',
      standardOffset: -300, // EST: UTC-5
      dstOffset: -240, // EDT: UTC-4
      dstStart: { month: 3, week: 2, dayOfWeek: 0, time: '02:00' }, // 2nd Sunday in March
      dstEnd: { month: 11, week: 1, dayOfWeek: 0, time: '02:00' } // 1st Sunday in November
    },
    {
      iana: 'America/Chicago',
      standardOffset: -360, // CST: UTC-6
      dstOffset: -300, // CDT: UTC-5
      dstStart: { month: 3, week: 2, dayOfWeek: 0, time: '02:00' },
      dstEnd: { month: 11, week: 1, dayOfWeek: 0, time: '02:00' }
    },
    {
      iana: 'America/Denver',
      standardOffset: -420, // MST: UTC-7
      dstOffset: -360, // MDT: UTC-6
      dstStart: { month: 3, week: 2, dayOfWeek: 0, time: '02:00' },
      dstEnd: { month: 11, week: 1, dayOfWeek: 0, time: '02:00' }
    },
    {
      iana: 'America/Los_Angeles',
      standardOffset: -480, // PST: UTC-8
      dstOffset: -420, // PDT: UTC-7
      dstStart: { month: 3, week: 2, dayOfWeek: 0, time: '02:00' },
      dstEnd: { month: 11, week: 1, dayOfWeek: 0, time: '02:00' }
    },
    // European Timezones
    {
      iana: 'Europe/London',
      standardOffset: 0, // GMT: UTC+0
      dstOffset: 60, // BST: UTC+1
      dstStart: { month: 3, week: -1, dayOfWeek: 0, time: '01:00' }, // Last Sunday in March
      dstEnd: { month: 10, week: -1, dayOfWeek: 0, time: '02:00' } // Last Sunday in October
    },
    {
      iana: 'Europe/Paris',
      standardOffset: 60, // CET: UTC+1
      dstOffset: 120, // CEST: UTC+2
      dstStart: { month: 3, week: -1, dayOfWeek: 0, time: '02:00' },
      dstEnd: { month: 10, week: -1, dayOfWeek: 0, time: '03:00' }
    },
    // Other major timezones
    {
      iana: 'UTC',
      standardOffset: 0,
      dstOffset: 0
    },
    {
      iana: 'America/Phoenix',
      standardOffset: -420, // MST: UTC-7 (no DST)
      dstOffset: -420
    },
    {
      iana: 'America/Anchorage',
      standardOffset: -540, // AKST: UTC-9
      dstOffset: -480, // AKDT: UTC-8
      dstStart: { month: 3, week: 2, dayOfWeek: 0, time: '02:00' },
      dstEnd: { month: 11, week: 1, dayOfWeek: 0, time: '02:00' }
    },
    {
      iana: 'Pacific/Honolulu',
      standardOffset: -600, // HST: UTC-10 (no DST)
      dstOffset: -600
    }
  ]

  private static commonTimezones: TimezoneInfo[] = [
    { iana: 'UTC', display: 'UTC (Coordinated Universal Time)', offset: '+00:00', abbreviation: 'UTC', isDst: false, utcOffset: 0 },
    { iana: 'America/New_York', display: 'Eastern Time (US & Canada)', offset: '-05:00', abbreviation: 'EST', isDst: false, utcOffset: -300 },
    { iana: 'America/Chicago', display: 'Central Time (US & Canada)', offset: '-06:00', abbreviation: 'CST', isDst: false, utcOffset: -360 },
    { iana: 'America/Denver', display: 'Mountain Time (US & Canada)', offset: '-07:00', abbreviation: 'MST', isDst: false, utcOffset: -420 },
    { iana: 'America/Los_Angeles', display: 'Pacific Time (US & Canada)', offset: '-08:00', abbreviation: 'PST', isDst: false, utcOffset: -480 },
    { iana: 'America/Phoenix', display: 'Arizona (Mountain Standard Time)', offset: '-07:00', abbreviation: 'MST', isDst: false, utcOffset: -420 },
    { iana: 'America/Anchorage', display: 'Alaska Time', offset: '-09:00', abbreviation: 'AKST', isDst: false, utcOffset: -540 },
    { iana: 'Pacific/Honolulu', display: 'Hawaii Time', offset: '-10:00', abbreviation: 'HST', isDst: false, utcOffset: -600 },
    { iana: 'Europe/London', display: 'Greenwich Mean Time', offset: '+00:00', abbreviation: 'GMT', isDst: false, utcOffset: 0 },
    { iana: 'Europe/Paris', display: 'Central European Time', offset: '+01:00', abbreviation: 'CET', isDst: false, utcOffset: 60 },
    { iana: 'Europe/Berlin', display: 'Central European Time', offset: '+01:00', abbreviation: 'CET', isDst: false, utcOffset: 60 },
    { iana: 'Asia/Tokyo', display: 'Japan Standard Time', offset: '+09:00', abbreviation: 'JST', isDst: false, utcOffset: 540 },
    { iana: 'Australia/Sydney', display: 'Australian Eastern Time', offset: '+10:00', abbreviation: 'AEST', isDst: false, utcOffset: 600 }
  ]

  /**
   * Get timezone information for a given IANA timezone
   */
  static getTimezoneInfo(timezone: string, date?: Date): TimezoneInfo {
    const targetDate = date || new Date()
    
    try {
      // Try to get timezone info using modern browser/Node.js APIs
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        const formatter = new Intl.DateTimeFormat('en', {
          timeZone: timezone,
          timeZoneName: 'short'
        })
        
        const parts = formatter.formatToParts(targetDate)
        const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value || ''
        
        // Calculate offset
        const utcDate = new Date(targetDate.toISOString())
        const zonedDate = new Date(targetDate.toLocaleString('en-US', { timeZone: timezone }))
        const offsetMs = utcDate.getTime() - zonedDate.getTime()
        const offsetMinutes = Math.round(offsetMs / (1000 * 60))
        
        const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
        const offsetMins = Math.abs(offsetMinutes) % 60
        const offsetSign = offsetMinutes <= 0 ? '+' : '-'
        const offsetString = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`
        
        // Check if DST is active
        const isDst = this.isDstActive(timezone, targetDate)
        
        // Find display name
        const commonTz = this.commonTimezones.find(tz => tz.iana === timezone)
        const displayName = commonTz?.display || timezone.replace('_', ' ').replace('/', ' - ')
        
        return {
          iana: timezone,
          display: displayName,
          offset: offsetString,
          abbreviation: timeZoneName,
          isDst,
          utcOffset: -offsetMinutes // Note: inverted because we calculated zone offset
        }
      }
    } catch (error) {
      console.warn(`Failed to get timezone info for ${timezone}:`, error)
    }
    
    // Fallback to manual timezone data
    return this.getTimezoneInfoFallback(timezone, targetDate)
  }

  /**
   * Fallback method for getting timezone info
   */
  private static getTimezoneInfoFallback(timezone: string, date: Date): TimezoneInfo {
    const rule = this.timezoneRules.find(r => r.iana === timezone)
    const commonTz = this.commonTimezones.find(tz => tz.iana === timezone)
    
    if (!rule) {
      // Return UTC if timezone not found
      return {
        iana: 'UTC',
        display: 'UTC (Coordinated Universal Time)',
        offset: '+00:00',
        abbreviation: 'UTC',
        isDst: false,
        utcOffset: 0
      }
    }
    
    const isDst = this.isDstActive(timezone, date)
    const currentOffset = isDst ? rule.dstOffset : rule.standardOffset
    
    const offsetHours = Math.floor(Math.abs(currentOffset) / 60)
    const offsetMins = Math.abs(currentOffset) % 60
    const offsetSign = currentOffset >= 0 ? '+' : '-'
    const offsetString = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`
    
    return {
      iana: timezone,
      display: commonTz?.display || timezone.replace('_', ' ').replace('/', ' - '),
      offset: offsetString,
      abbreviation: this.getTimezoneAbbreviation(timezone, isDst),
      isDst,
      utcOffset: currentOffset
    }
  }

  /**
   * Check if DST is currently active for a timezone
   */
  static isDstActive(timezone: string, date: Date): boolean {
    const rule = this.timezoneRules.find(r => r.iana === timezone)
    
    if (!rule || !rule.dstStart || !rule.dstEnd) {
      return false // No DST rules defined
    }
    
    const year = date.getFullYear()
    const dstStart = this.calculateDstTransition(year, rule.dstStart)
    const dstEnd = this.calculateDstTransition(year, rule.dstEnd)
    
    // Handle Southern Hemisphere (DST spans year boundary)
    if (dstStart > dstEnd) {
      return date >= dstStart || date < dstEnd
    } else {
      return date >= dstStart && date < dstEnd
    }
  }

  /**
   * Calculate DST transition date for a given year
   */
  private static calculateDstTransition(year: number, rule: {
    month: number
    week: number
    dayOfWeek: number
    time: string
  }): Date {
    const [hours, minutes] = rule.time.split(':').map(n => parseInt(n))
    
    if (rule.week === -1) {
      // Last occurrence of dayOfWeek in the month
      const lastDayOfMonth = new Date(year, rule.month, 0)
      let targetDate = new Date(lastDayOfMonth)
      
      while (targetDate.getDay() !== rule.dayOfWeek) {
        targetDate.setDate(targetDate.getDate() - 1)
      }
      
      targetDate.setHours(hours, minutes, 0, 0)
      return targetDate
    } else {
      // Nth occurrence of dayOfWeek in the month
      const firstDayOfMonth = new Date(year, rule.month - 1, 1)
      let targetDate = new Date(firstDayOfMonth)
      
      // Find first occurrence of the target day
      while (targetDate.getDay() !== rule.dayOfWeek) {
        targetDate.setDate(targetDate.getDate() + 1)
      }
      
      // Add weeks to get to the nth occurrence
      targetDate.setDate(targetDate.getDate() + (rule.week - 1) * 7)
      targetDate.setHours(hours, minutes, 0, 0)
      
      return targetDate
    }
  }

  /**
   * Get timezone abbreviation
   */
  private static getTimezoneAbbreviation(timezone: string, isDst: boolean): string {
    const abbreviations: Record<string, { standard: string, dst: string }> = {
      'America/New_York': { standard: 'EST', dst: 'EDT' },
      'America/Chicago': { standard: 'CST', dst: 'CDT' },
      'America/Denver': { standard: 'MST', dst: 'MDT' },
      'America/Los_Angeles': { standard: 'PST', dst: 'PDT' },
      'America/Phoenix': { standard: 'MST', dst: 'MST' },
      'America/Anchorage': { standard: 'AKST', dst: 'AKDT' },
      'Pacific/Honolulu': { standard: 'HST', dst: 'HST' },
      'Europe/London': { standard: 'GMT', dst: 'BST' },
      'Europe/Paris': { standard: 'CET', dst: 'CEST' },
      'Europe/Berlin': { standard: 'CET', dst: 'CEST' },
      'UTC': { standard: 'UTC', dst: 'UTC' }
    }
    
    const abbr = abbreviations[timezone]
    if (abbr) {
      return isDst ? abbr.dst : abbr.standard
    }
    
    // Fallback to timezone name
    return timezone.split('/').pop()?.toUpperCase() || 'UNK'
  }

  /**
   * Convert date/time from one timezone to another
   */
  static convertTimezone(
    dateTime: Date | string,
    fromTimezone: string,
    toTimezone: string
  ): Date {
    try {
      const date = typeof dateTime === 'string' ? parseISO(dateTime) : dateTime
      
      if (!isValid(date)) {
        throw new Error('Invalid date provided')
      }
      
      // If converting from UTC, treat the date as UTC
      if (fromTimezone === 'UTC') {
        return utcToZonedTime(date, toTimezone)
      }
      
      // If converting to UTC, treat the date as being in the source timezone
      if (toTimezone === 'UTC') {
        return zonedTimeToUtc(date, fromTimezone)
      }
      
      // Convert through UTC
      const utcDate = zonedTimeToUtc(date, fromTimezone)
      return utcToZonedTime(utcDate, toTimezone)
      
    } catch (error) {
      console.error('Timezone conversion error:', error)
      return typeof dateTime === 'string' ? parseISO(dateTime) : dateTime
    }
  }

  /**
   * Format date in specific timezone
   */
  static formatInTimezone(
    date: Date | string,
    timezone: string,
    formatString: string = 'yyyy-MM-dd HH:mm:ss'
  ): string {
    try {
      const targetDate = typeof date === 'string' ? parseISO(date) : date
      
      if (!isValid(targetDate)) {
        return 'Invalid date'
      }
      
      if (timezone === 'UTC') {
        return format(targetDate, formatString)
      }
      
      return formatTz(targetDate, formatString, { timeZone: timezone })
      
    } catch (error) {
      console.error('Date formatting error:', error)
      return 'Format error'
    }
  }

  /**
   * Get user's detected timezone
   */
  static detectUserTimezone(): string {
    try {
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    } catch (error) {
      console.warn('Failed to detect user timezone:', error)
    }
    
    // Fallback based on UTC offset
    const offset = new Date().getTimezoneOffset()
    const offsetMap: Record<number, string> = {
      0: 'UTC',
      300: 'America/New_York',
      360: 'America/Chicago',
      420: 'America/Denver',
      480: 'America/Los_Angeles',
      600: 'Pacific/Honolulu'
    }
    
    return offsetMap[offset] || 'UTC'
  }

  /**
   * Get list of common timezones for UI selection
   */
  static getCommonTimezones(): TimezoneInfo[] {
    return this.commonTimezones.map(tz => ({
      ...tz,
      ...this.getTimezoneInfo(tz.iana)
    }))
  }

  /**
   * Validate timezone string
   */
  static isValidTimezone(timezone: string): boolean {
    try {
      if (timezone === 'UTC') return true
      
      // Try to create a date formatter with the timezone
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        new Intl.DateTimeFormat('en', { timeZone: timezone })
        return true
      }
      
      // Fallback to known timezone list
      return this.timezoneRules.some(rule => rule.iana === timezone)
      
    } catch (error) {
      return false
    }
  }

  /**
   * Get upcoming DST transitions for a timezone
   */
  static getUpcomingDstTransitions(
    timezone: string,
    months: number = 12
  ): Array<{
    date: Date
    type: 'start' | 'end'
    offsetBefore: number
    offsetAfter: number
  }> {
    const rule = this.timezoneRules.find(r => r.iana === timezone)
    
    if (!rule || !rule.dstStart || !rule.dstEnd) {
      return []
    }
    
    const transitions = []
    const now = new Date()
    const endDate = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000)
    
    let currentYear = now.getFullYear()
    
    while (currentYear <= endDate.getFullYear() + 1) {
      const dstStart = this.calculateDstTransition(currentYear, rule.dstStart)
      const dstEnd = this.calculateDstTransition(currentYear, rule.dstEnd)
      
      if (dstStart >= now && dstStart <= endDate) {
        transitions.push({
          date: dstStart,
          type: 'start' as const,
          offsetBefore: rule.standardOffset,
          offsetAfter: rule.dstOffset
        })
      }
      
      if (dstEnd >= now && dstEnd <= endDate) {
        transitions.push({
          date: dstEnd,
          type: 'end' as const,
          offsetBefore: rule.dstOffset,
          offsetAfter: rule.standardOffset
        })
      }
      
      currentYear++
    }
    
    return transitions.sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  /**
   * Generate VTIMEZONE component for iCal
   */
  static generateVTimezone(timezone: string, year?: number): string[] {
    if (timezone === 'UTC') {
      return []
    }
    
    const rule = this.timezoneRules.find(r => r.iana === timezone)
    
    if (!rule) {
      return []
    }
    
    const lines: string[] = []
    const targetYear = year || new Date().getFullYear()
    
    lines.push('BEGIN:VTIMEZONE')
    lines.push(`TZID:${timezone}`)
    
    // Standard time component
    lines.push('BEGIN:STANDARD')
    lines.push(`DTSTART:${targetYear}0101T000000`)
    
    const standardOffsetHours = Math.floor(Math.abs(rule.standardOffset) / 60)
    const standardOffsetMins = Math.abs(rule.standardOffset) % 60
    const standardOffsetSign = rule.standardOffset >= 0 ? '+' : '-'
    const standardOffsetStr = `${standardOffsetSign}${standardOffsetHours.toString().padStart(2, '0')}${standardOffsetMins.toString().padStart(2, '0')}`
    
    lines.push(`TZOFFSETFROM:${rule.dstOffset ? this.formatOffset(rule.dstOffset) : standardOffsetStr}`)
    lines.push(`TZOFFSETTO:${standardOffsetStr}`)
    lines.push(`TZNAME:${this.getTimezoneAbbreviation(timezone, false)}`)
    
    if (rule.dstEnd) {
      const dstEndRule = this.formatRecurrenceRule(rule.dstEnd)
      lines.push(`RRULE:FREQ=YEARLY;${dstEndRule}`)
    }
    
    lines.push('END:STANDARD')
    
    // Daylight time component (if applicable)
    if (rule.dstStart && rule.dstOffset !== rule.standardOffset) {
      lines.push('BEGIN:DAYLIGHT')
      lines.push(`DTSTART:${targetYear}0101T000000`)
      
      const dstOffsetStr = this.formatOffset(rule.dstOffset)
      
      lines.push(`TZOFFSETFROM:${standardOffsetStr}`)
      lines.push(`TZOFFSETTO:${dstOffsetStr}`)
      lines.push(`TZNAME:${this.getTimezoneAbbreviation(timezone, true)}`)
      
      const dstStartRule = this.formatRecurrenceRule(rule.dstStart)
      lines.push(`RRULE:FREQ=YEARLY;${dstStartRule}`)
      
      lines.push('END:DAYLIGHT')
    }
    
    lines.push('END:VTIMEZONE')
    
    return lines
  }

  /**
   * Format offset for VTIMEZONE
   */
  private static formatOffset(offsetMinutes: number): string {
    const hours = Math.floor(Math.abs(offsetMinutes) / 60)
    const mins = Math.abs(offsetMinutes) % 60
    const sign = offsetMinutes >= 0 ? '+' : '-'
    return `${sign}${hours.toString().padStart(2, '0')}${mins.toString().padStart(2, '0')}`
  }

  /**
   * Format recurrence rule for DST transitions
   */
  private static formatRecurrenceRule(rule: {
    month: number
    week: number
    dayOfWeek: number
    time: string
  }): string {
    const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
    const monthNames = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    
    const dayName = dayNames[rule.dayOfWeek]
    const monthName = monthNames[rule.month]
    
    if (rule.week === -1) {
      return `BYMONTH=${rule.month};BYDAY=-1${dayName}`
    } else {
      return `BYMONTH=${rule.month};BYDAY=${rule.week}${dayName}`
    }
  }
}

export const timezoneHandler = TimezoneHandler