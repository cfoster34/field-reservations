export interface User {
  id: string
  email: string
  name?: string
  role: UserRole
  phoneNumber?: string
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
  emailVerified: boolean
  profile?: UserProfile
}

export enum UserRole {
  ADMIN = 'admin',
  LEAGUE_MANAGER = 'league_manager',
  COACH = 'coach',
  USER = 'user'
}

export interface UserProfile {
  id: string
  userId: string
  avatar?: string
  bio?: string
  preferredSport?: Sport
  teamName?: string
  leagueId?: string
  notifications: NotificationPreferences
}

export interface NotificationPreferences {
  email: boolean
  push: boolean
  sms: boolean
  reminderHours: number // Hours before reservation to send reminder
}

export enum Sport {
  SOCCER = 'soccer',
  BASEBALL = 'baseball',
  FOOTBALL = 'football',
  BASKETBALL = 'basketball',
  TENNIS = 'tennis',
  VOLLEYBALL = 'volleyball',
  OTHER = 'other'
}

export interface AuthSession {
  user: User
  accessToken: string
  refreshToken: string
  expiresAt: number
}