import { Sport } from './user'

export interface League {
  id: string
  name: string
  description?: string
  sport: Sport
  logo?: string
  website?: string
  contactEmail: string
  contactPhone?: string
  address: LeagueAddress
  settings: LeagueSettings
  createdAt: string
  updatedAt: string
}

export interface LeagueAddress {
  street: string
  city: string
  state: string
  zipCode: string
}

export interface LeagueSettings {
  maxReservationsPerWeek: number
  advanceBookingDays: number
  cancellationHours: number // Hours before reservation when cancellation is allowed
  requireDeposit: boolean
  depositPercentage: number
  autoApproveReservations: boolean
}

export interface Team {
  id: string
  leagueId: string
  name: string
  coachId: string
  players: TeamPlayer[]
  division?: string
  createdAt: string
  updatedAt: string
}

export interface TeamPlayer {
  id: string
  userId: string
  teamId: string
  jerseyNumber?: string
  position?: string
  joinedAt: string
}