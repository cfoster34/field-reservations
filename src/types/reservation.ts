import { Field } from './field'
import { User } from './user'
import { Payment } from './payment'

export interface Reservation {
  id: string
  userId: string
  user?: User
  fieldId: string
  field?: Field
  date: string
  startTime: string // ISO string
  endTime: string // ISO string
  status: ReservationStatus
  purpose: string
  attendees: number
  notes?: string
  totalPrice: number
  depositPaid: boolean
  payment?: Payment
  createdAt: string
  updatedAt: string
  cancelledAt?: string
  cancelReason?: string
  recurringId?: string // Links recurring bookings
  recurringPattern?: RecurringPattern
  conflictsWith?: string[] // IDs of conflicting reservations
  rescheduledFrom?: string // Original reservation ID if rescheduled
  shareToken?: string // For sharing bookings
  metadata?: Record<string, any>
}

export enum ReservationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show'
}

export interface ReservationCreate {
  fieldId: string
  date: string
  startTime: string
  endTime: string
  purpose: string
  attendees: number
  notes?: string
  recurringPattern?: RecurringPattern
  metadata?: Record<string, any>
}

export interface ReservationUpdate {
  purpose?: string
  attendees?: number
  notes?: string
}

export interface ReservationFilter {
  userId?: string
  fieldId?: string
  status?: ReservationStatus
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
}

export interface ReservationStats {
  total: number
  upcoming: number
  completed: number
  cancelled: number
  totalRevenue: number
}

export interface RecurringPattern {
  type: 'daily' | 'weekly' | 'monthly'
  interval: number // e.g., every 2 weeks
  daysOfWeek?: number[] // 0-6 for weekly patterns
  dayOfMonth?: number // for monthly patterns
  endDate?: string
  occurrences?: number // max number of occurrences
}

export interface TimeSlot {
  date: string
  startTime: string
  endTime: string
  available: boolean
  price?: number
  conflicts?: ConflictInfo[]
}

export interface ConflictInfo {
  reservationId: string
  userId: string
  userName?: string
  teamName?: string
  type: 'full' | 'partial'
}

export interface BookingRules {
  advanceBookingDays: number // How far in advance can book
  maxBookingsPerWeek: number
  maxBookingsPerDay: number
  minBookingDuration: number // in minutes
  maxBookingDuration: number // in minutes
  bufferTime: number // minutes between bookings
  allowRecurring: boolean
  requireApproval: boolean
  cancellationDeadline: number // hours before booking
  refundPolicy: RefundPolicy
}

export interface RefundPolicy {
  fullRefundHours: number // Full refund if cancelled X hours before
  partialRefundHours: number // Partial refund if cancelled X hours before
  partialRefundPercentage: number // Percentage for partial refund
  noRefundHours: number // No refund if cancelled within X hours
}

export interface BookingSession {
  id: string
  userId: string
  fieldId: string
  selectedSlots: TimeSlot[]
  totalPrice: number
  expiresAt: string
  status: 'active' | 'expired' | 'completed'
}