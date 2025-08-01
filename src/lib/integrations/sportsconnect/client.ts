import { z } from 'zod'

// SportsConnect API Client
export interface SportsConnectConfig {
  apiKey: string
  baseUrl: string
  version: string
  organizationId: string
  timeout: number
}

export interface SportsConnectUser {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  role: string
  teamIds: string[]
  createdAt: string
  updatedAt: string
}

export interface SportsConnectTeam {
  id: string
  name: string
  coachId?: string
  ageGroup?: string
  division?: string
  sportType: string
  season: string
  memberIds: string[]
  createdAt: string
  updatedAt: string
}

export interface SportsConnectField {
  id: string
  name: string
  type: string
  address: string
  coordinates?: {
    lat: number
    lng: number
  }
  amenities: string[]
  hourlyRate: number
  capacity?: number
  availability: {
    dayOfWeek: number
    startTime: string
    endTime: string
  }[]
  createdAt: string
  updatedAt: string
}

export interface SportsConnectReservation {
  id: string
  fieldId: string
  userId: string
  teamId?: string
  date: string
  startTime: string
  endTime: string
  status: 'pending' | 'confirmed' | 'cancelled'
  purpose?: string
  attendees?: number
  cost: number
  createdAt: string
  updatedAt: string
}

export interface SportsConnectSyncResult {
  users: {
    created: number
    updated: number
    errors: Array<{ id: string; error: string }>
  }
  teams: {
    created: number
    updated: number
    errors: Array<{ id: string; error: string }>
  }
  fields: {
    created: number
    updated: number
    errors: Array<{ id: string; error: string }>
  }
  reservations: {
    created: number
    updated: number
    errors: Array<{ id: string; error: string }>
  }
  lastSyncAt: string
}

const sportsConnectUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  role: z.string(),
  teamIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const sportsConnectTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  coachId: z.string().optional(),
  ageGroup: z.string().optional(),
  division: z.string().optional(),
  sportType: z.string(),
  season: z.string(),
  memberIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const sportsConnectFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  address: z.string(),
  coordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }).optional(),
  amenities: z.array(z.string()),
  hourlyRate: z.number(),
  capacity: z.number().optional(),
  availability: z.array(z.object({
    dayOfWeek: z.number(),
    startTime: z.string(),
    endTime: z.string(),
  })),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const sportsConnectReservationSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  userId: z.string(),
  teamId: z.string().optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  status: z.enum(['pending', 'confirmed', 'cancelled']),
  purpose: z.string().optional(),
  attendees: z.number().optional(),
  cost: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export class SportsConnectClient {
  private config: SportsConnectConfig
  private cache = new Map<string, { data: any; expiry: number }>()

  constructor(config: SportsConnectConfig) {
    this.config = config
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}/v${this.config.version}/${endpoint}`
    
    const headers = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': this.config.organizationId,
      ...options.headers,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`SportsConnect API Error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('SportsConnect API request timeout')
      }
      throw error
    }
  }

  private getCacheKey(endpoint: string, params?: Record<string, any>): string {
    return `${endpoint}:${JSON.stringify(params || {})}`
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (cached && cached.expiry > Date.now()) {
      return cached.data
    }
    this.cache.delete(key)
    return null
  }

  private setToCache<T>(key: string, data: T, ttl = 300000): void { // 5 minutes default
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl,
    })
  }

  // Users API
  async getUsers(params?: {
    since?: string
    teamId?: string
    role?: string
    limit?: number
    offset?: number
  }): Promise<{ users: SportsConnectUser[]; total: number }> {
    const cacheKey = this.getCacheKey('users', params)
    const cached = this.getFromCache<{ users: SportsConnectUser[]; total: number }>(cacheKey)
    
    if (cached) {
      return cached
    }

    const queryParams = new URLSearchParams()
    if (params?.since) queryParams.append('since', params.since)
    if (params?.teamId) queryParams.append('team_id', params.teamId)
    if (params?.role) queryParams.append('role', params.role)
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())

    const endpoint = `users${queryParams.toString() ? `?${queryParams}` : ''}`
    const response = await this.makeRequest<{ users: any[]; total: number }>(endpoint)
    
    const validatedUsers = response.users.map(user => sportsConnectUserSchema.parse(user))
    const result = { users: validatedUsers, total: response.total }
    
    this.setToCache(cacheKey, result)
    return result
  }

  async createUser(user: Omit<SportsConnectUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<SportsConnectUser> {
    const response = await this.makeRequest<SportsConnectUser>('users', {
      method: 'POST',
      body: JSON.stringify(user),
    })
    
    return sportsConnectUserSchema.parse(response)
  }

  async updateUser(id: string, updates: Partial<SportsConnectUser>): Promise<SportsConnectUser> {
    const response = await this.makeRequest<SportsConnectUser>(`users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
    
    return sportsConnectUserSchema.parse(response)
  }

  // Teams API
  async getTeams(params?: {
    since?: string
    sportType?: string
    season?: string
    division?: string
    limit?: number
    offset?: number
  }): Promise<{ teams: SportsConnectTeam[]; total: number }> {
    const cacheKey = this.getCacheKey('teams', params)
    const cached = this.getFromCache<{ teams: SportsConnectTeam[]; total: number }>(cacheKey)
    
    if (cached) {
      return cached
    }

    const queryParams = new URLSearchParams()
    if (params?.since) queryParams.append('since', params.since)
    if (params?.sportType) queryParams.append('sport_type', params.sportType)
    if (params?.season) queryParams.append('season', params.season)
    if (params?.division) queryParams.append('division', params.division)
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())

    const endpoint = `teams${queryParams.toString() ? `?${queryParams}` : ''}`
    const response = await this.makeRequest<{ teams: any[]; total: number }>(endpoint)
    
    const validatedTeams = response.teams.map(team => sportsConnectTeamSchema.parse(team))
    const result = { teams: validatedTeams, total: response.total }
    
    this.setToCache(cacheKey, result)
    return result
  }

  async createTeam(team: Omit<SportsConnectTeam, 'id' | 'createdAt' | 'updatedAt'>): Promise<SportsConnectTeam> {
    const response = await this.makeRequest<SportsConnectTeam>('teams', {
      method: 'POST',
      body: JSON.stringify(team),
    })
    
    return sportsConnectTeamSchema.parse(response)
  }

  async updateTeam(id: string, updates: Partial<SportsConnectTeam>): Promise<SportsConnectTeam> {
    const response = await this.makeRequest<SportsConnectTeam>(`teams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
    
    return sportsConnectTeamSchema.parse(response)
  }

  // Fields API
  async getFields(params?: {
    since?: string
    type?: string
    availability?: boolean
    limit?: number
    offset?: number
  }): Promise<{ fields: SportsConnectField[]; total: number }> {
    const cacheKey = this.getCacheKey('fields', params)
    const cached = this.getFromCache<{ fields: SportsConnectField[]; total: number }>(cacheKey)
    
    if (cached) {
      return cached
    }

    const queryParams = new URLSearchParams()
    if (params?.since) queryParams.append('since', params.since)
    if (params?.type) queryParams.append('type', params.type)
    if (params?.availability) queryParams.append('include_availability', 'true')
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())

    const endpoint = `fields${queryParams.toString() ? `?${queryParams}` : ''}`
    const response = await this.makeRequest<{ fields: any[]; total: number }>(endpoint)
    
    const validatedFields = response.fields.map(field => sportsConnectFieldSchema.parse(field))
    const result = { fields: validatedFields, total: response.total }
    
    this.setToCache(cacheKey, result, 600000) // 10 minutes for fields
    return result
  }

  // Reservations API
  async getReservations(params?: {
    since?: string
    fieldId?: string
    userId?: string
    teamId?: string
    dateFrom?: string
    dateTo?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<{ reservations: SportsConnectReservation[]; total: number }> {
    const cacheKey = this.getCacheKey('reservations', params)
    const cached = this.getFromCache<{ reservations: SportsConnectReservation[]; total: number }>(cacheKey)
    
    if (cached) {
      return cached
    }

    const queryParams = new URLSearchParams()
    if (params?.since) queryParams.append('since', params.since)
    if (params?.fieldId) queryParams.append('field_id', params.fieldId)
    if (params?.userId) queryParams.append('user_id', params.userId)
    if (params?.teamId) queryParams.append('team_id', params.teamId)
    if (params?.dateFrom) queryParams.append('date_from', params.dateFrom)
    if (params?.dateTo) queryParams.append('date_to', params.dateTo)
    if (params?.status) queryParams.append('status', params.status)
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())

    const endpoint = `reservations${queryParams.toString() ? `?${queryParams}` : ''}`
    const response = await this.makeRequest<{ reservations: any[]; total: number }>(endpoint)
    
    const validatedReservations = response.reservations.map(reservation => 
      sportsConnectReservationSchema.parse(reservation)
    )
    const result = { reservations: validatedReservations, total: response.total }
    
    this.setToCache(cacheKey, result, 60000) // 1 minute for reservations
    return result
  }

  async createReservation(reservation: Omit<SportsConnectReservation, 'id' | 'createdAt' | 'updatedAt'>): Promise<SportsConnectReservation> {
    const response = await this.makeRequest<SportsConnectReservation>('reservations', {
      method: 'POST',
      body: JSON.stringify(reservation),
    })
    
    return sportsConnectReservationSchema.parse(response)
  }

  async updateReservation(id: string, updates: Partial<SportsConnectReservation>): Promise<SportsConnectReservation> {
    const response = await this.makeRequest<SportsConnectReservation>(`reservations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
    
    return sportsConnectReservationSchema.parse(response)
  }

  async cancelReservation(id: string, reason?: string): Promise<SportsConnectReservation> {
    const response = await this.makeRequest<SportsConnectReservation>(`reservations/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
    
    return sportsConnectReservationSchema.parse(response)
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return await this.makeRequest<{ status: string; timestamp: string }>('health')
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear()
  }

  // Get cache stats
  getCacheStats(): { size: number; entries: Array<{ key: string; expiry: number }> } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, value]) => ({
        key,
        expiry: value.expiry,
      })),
    }
  }
}

// Default configuration
export const createSportsConnectClient = (config: Partial<SportsConnectConfig>): SportsConnectClient => {
  const defaultConfig: SportsConnectConfig = {
    apiKey: process.env.SPORTSCONNECT_API_KEY || '',
    baseUrl: process.env.SPORTSCONNECT_BASE_URL || 'https://api.sportsconnect.com',
    version: process.env.SPORTSCONNECT_API_VERSION || '1',
    organizationId: process.env.SPORTSCONNECT_ORG_ID || '',
    timeout: 30000,
  }

  return new SportsConnectClient({ ...defaultConfig, ...config })
}