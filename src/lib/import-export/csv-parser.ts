import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'

// CSV parsing utilities
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
}

export interface ParsedField {
  name: string
  type: string
  address: string
  hourlyRate: number
  capacity?: number
  amenities?: string[]
}

export interface ParsedReservation {
  fieldName: string
  userEmail: string
  date: string
  startTime: string
  endTime: string
  purpose?: string
  attendees?: number
}

// Parse CSV for users
export function parseUsersCSV(csvContent: string): ParsedUser[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })

  return records.map((record: any) => ({
    email: record.email || record.Email || '',
    fullName: record.full_name || record.fullName || record.name || record.Name || '',
    phone: record.phone || record.Phone || undefined,
    role: record.role || record.Role || 'member',
    teamName: record.team || record.teamName || record.Team || undefined,
  })).filter(user => user.email && user.fullName)
}

// Parse CSV for teams
export function parseTeamsCSV(csvContent: string): ParsedTeam[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })

  return records.map((record: any) => ({
    name: record.name || record.Name || record.team_name || record.teamName || '',
    coachEmail: record.coach_email || record.coachEmail || record.coach || undefined,
    ageGroup: record.age_group || record.ageGroup || record.age || undefined,
    division: record.division || record.Division || undefined,
  })).filter(team => team.name)
}

// Parse CSV for fields
export function parseFieldsCSV(csvContent: string): ParsedField[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })

  return records.map((record: any) => ({
    name: record.name || record.Name || record.field_name || record.fieldName || '',
    type: record.type || record.Type || record.field_type || record.fieldType || 'multipurpose',
    address: record.address || record.Address || record.location || record.Location || '',
    hourlyRate: parseFloat(record.hourly_rate || record.hourlyRate || record.rate || record.price || '0'),
    capacity: record.capacity ? parseInt(record.capacity) : undefined,
    amenities: record.amenities ? record.amenities.split(',').map((a: string) => a.trim()) : undefined,
  })).filter(field => field.name && field.address && field.hourlyRate > 0)
}

// Parse CSV for reservations
export function parseReservationsCSV(csvContent: string): ParsedReservation[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })

  return records.map((record: any) => ({
    fieldName: record.field || record.fieldName || record.field_name || '',
    userEmail: record.email || record.userEmail || record.user_email || '',
    date: record.date || record.Date || '',
    startTime: record.start_time || record.startTime || record.start || '',
    endTime: record.end_time || record.endTime || record.end || '',
    purpose: record.purpose || record.Purpose || record.description || undefined,
    attendees: record.attendees ? parseInt(record.attendees) : undefined,
  })).filter(reservation => 
    reservation.fieldName && 
    reservation.userEmail && 
    reservation.date && 
    reservation.startTime && 
    reservation.endTime
  )
}

// Generate CSV from data
export function generateUsersCSV(users: any[]): string {
  return stringify(users.map(user => ({
    email: user.email,
    full_name: user.full_name,
    phone: user.phone || '',
    role: user.role,
    team: user.team?.name || '',
    created_at: user.created_at,
  })), {
    header: true,
    columns: ['email', 'full_name', 'phone', 'role', 'team', 'created_at'],
  })
}

export function generateTeamsCSV(teams: any[]): string {
  return stringify(teams.map(team => ({
    name: team.name,
    coach_email: team.coach?.email || '',
    coach_name: team.coach?.full_name || '',
    age_group: team.age_group || '',
    division: team.division || '',
    member_count: team.memberCount || 0,
    created_at: team.created_at,
  })), {
    header: true,
    columns: ['name', 'coach_email', 'coach_name', 'age_group', 'division', 'member_count', 'created_at'],
  })
}

export function generateFieldsCSV(fields: any[]): string {
  return stringify(fields.map(field => ({
    name: field.name,
    type: field.type,
    status: field.status,
    address: field.address,
    hourly_rate: field.hourly_rate,
    capacity: field.capacity || '',
    amenities: field.amenities?.join(', ') || '',
  })), {
    header: true,
    columns: ['name', 'type', 'status', 'address', 'hourly_rate', 'capacity', 'amenities'],
  })
}

export function generateReservationsCSV(reservations: any[]): string {
  return stringify(reservations.map(reservation => ({
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
    created_at: reservation.created_at,
  })), {
    header: true,
    columns: ['field', 'user_email', 'user_name', 'team', 'date', 'start_time', 'end_time', 'status', 'purpose', 'attendees', 'created_at'],
  })
}

// Validate date format (YYYY-MM-DD)
export function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateString)) return false
  const date = new Date(dateString)
  return date instanceof Date && !isNaN(date.getTime())
}

// Validate time format (HH:MM)
export function isValidTime(timeString: string): boolean {
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/
  return regex.test(timeString)
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email)
}