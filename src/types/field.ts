import { Sport } from './user'

export interface Field {
  id: string
  name: string
  description?: string
  location: FieldLocation
  type: FieldType
  sport: Sport[]
  capacity: number
  amenities: FieldAmenity[]
  images: string[]
  status: FieldStatus
  pricing: FieldPricing
  rules?: string
  createdAt: string
  updatedAt: string
}

export interface FieldLocation {
  address: string
  city: string
  state: string
  zipCode: string
  coordinates: {
    lat: number
    lng: number
  }
}

export enum FieldType {
  GRASS = 'grass',
  TURF = 'turf',
  DIRT = 'dirt',
  COURT = 'court',
  INDOOR = 'indoor'
}

export enum FieldStatus {
  AVAILABLE = 'available',
  MAINTENANCE = 'maintenance',
  CLOSED = 'closed'
}

export interface FieldAmenity {
  id: string
  name: string
  icon: string
}

export interface FieldPricing {
  basePrice: number // Per hour
  peakHours?: {
    start: string // HH:MM format
    end: string
    multiplier: number
  }
  weekendMultiplier?: number
  deposit?: number
}

export interface FieldAvailability {
  fieldId: string
  date: string
  slots: TimeSlot[]
}

export interface TimeSlot {
  id: string
  startTime: string // ISO string
  endTime: string // ISO string
  available: boolean
  price: number
  reservationId?: string
}