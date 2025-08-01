import { createClient } from '@/lib/supabase/server'
import { webhookManager } from '@/lib/webhooks/webhook-manager'
import { z } from 'zod'

export interface LeagueManagementConnector {
  id: string
  leagueId: string
  name: string
  provider: 'leagueapps' | 'teamsnap' | 'sportngin' | 'stack' | 'goalline' | 'custom'
  isActive: boolean
  configuration: ConnectorConfiguration
  credentials: EncryptedCredentials
  syncSettings: SyncSettings
  lastSyncAt?: string
  nextSyncAt?: string
  syncFrequency: 'realtime' | 'hourly' | 'daily' | 'weekly' | 'manual'
  errorCount: number
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface ConnectorConfiguration {
  apiEndpoint: string
  apiVersion: string
  organizationId?: string
  leagueId?: string
  seasonId?: string
  customFields: Record<string, string>
  rateLimit: {
    requestsPerMinute: number
    requestsPerHour: number
  }
  timeout: number
  retryAttempts: number
  webhookUrl?: string
  features: {
    syncUsers: boolean
    syncTeams: boolean
    syncSchedules: boolean
    syncResults: boolean
    syncStandings: boolean
    syncRegistrations: boolean
  }
}

export interface EncryptedCredentials {
  apiKey?: string
  clientId?: string
  clientSecret?: string
  accessToken?: string
  refreshToken?: string
  username?: string
  password?: string
  customAuth?: Record<string, string>
}

export interface SyncSettings {
  dataMapping: {
    userFields: Record<string, string>
    teamFields: Record<string, string>
    gameFields: Record<string, string>
  }
  filters: {
    dateRange?: {
      start: string
      end: string
    }
    divisions?: string[]
    ageGroups?: string[]
    seasons?: string[]
  }
  transformations: {
    userTransforms: string[]
    teamTransforms: string[]
    scheduleTransforms: string[]
  }
  conflictResolution: {
    duplicateUsers: 'skip' | 'merge' | 'update'
    duplicateTeams: 'skip' | 'merge' | 'update'
    duplicateGames: 'skip' | 'merge' | 'update'
  }
}

export interface ConnectorSyncResult {
  success: boolean
  connector: string
  startedAt: string
  completedAt: string
  duration: number
  data: {
    users: { imported: number; updated: number; skipped: number; errors: number }
    teams: { imported: number; updated: number; skipped: number; errors: number }
    schedules: { imported: number; updated: number; skipped: number; errors: number }
    results: { imported: number; updated: number; skipped: number; errors: number }
    standings: { imported: number; updated: number; skipped: number; errors: number }
    registrations: { imported: number; updated: number; skipped: number; errors: number }
  }
  errors: Array<{
    type: string
    message: string
    details?: any
  }>
  warnings: Array<{
    type: string
    message: string
  }>
}

// Provider-specific connectors
abstract class BaseConnector {
  protected connector: LeagueManagementConnector
  protected supabase: any

  constructor(connector: LeagueManagementConnector) {
    this.connector = connector
    this.supabase = createClient()
  }

  abstract authenticate(): Promise<boolean>
  abstract syncUsers(): Promise<any>
  abstract syncTeams(): Promise<any>
  abstract syncSchedule(): Promise<any>
  abstract syncResults(): Promise<any>
  abstract syncStandings(): Promise<any>
  abstract syncRegistrations(): Promise<any>
  abstract healthCheck(): Promise<boolean>

  protected async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.connector.configuration.apiEndpoint}${endpoint}`
    const headers = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
      ...options.headers,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.connector.configuration.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} - ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  protected abstract getAuthHeaders(): Record<string, string>

  protected async handleRateLimit(): Promise<void> {
    // Implement rate limiting logic
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

// LeagueApps Connector
class LeagueAppsConnector extends BaseConnector {
  async authenticate(): Promise<boolean> {
    try {
      const response = await this.makeRequest('/auth/verify')
      return response.success === true
    } catch (error) {
      return false
    }
  }

  async syncUsers(): Promise<any> {
    const users = await this.makeRequest('/members')
    const results = { imported: 0, updated: 0, skipped: 0, errors: 0 }

    for (const user of users.data || []) {
      try {
        const transformedUser = this.transformUser(user)
        
        // Check if user exists
        const existingUser = await this.findExistingUser(transformedUser.email)
        
        if (existingUser) {
          if (this.connector.syncSettings.conflictResolution.duplicateUsers === 'update') {
            await this.updateUser(existingUser.id, transformedUser)
            results.updated++
          } else {
            results.skipped++
          }
        } else {
          await this.createUser(transformedUser)
          results.imported++
        }
      } catch (error) {
        results.errors++
      }
    }

    return results
  }

  async syncTeams(): Promise<any> {
    const teams = await this.makeRequest('/teams')
    const results = { imported: 0, updated: 0, skipped: 0, errors: 0 }

    for (const team of teams.data || []) {
      try {
        const transformedTeam = this.transformTeam(team)
        
        const existingTeam = await this.findExistingTeam(transformedTeam.name)
        
        if (existingTeam) {
          if (this.connector.syncSettings.conflictResolution.duplicateTeams === 'update') {
            await this.updateTeam(existingTeam.id, transformedTeam)
            results.updated++
          } else {
            results.skipped++
          }
        } else {
          await this.createTeam(transformedTeam)
          results.imported++
        }
      } catch (error) {
        results.errors++
      }
    }

    return results
  }

  async syncSchedule(): Promise<any> {
    const games = await this.makeRequest('/schedule')
    const results = { imported: 0, updated: 0, skipped: 0, errors: 0 }

    for (const game of games.data || []) {
      try {
        const transformedGame = this.transformGame(game)
        
        const existingGame = await this.findExistingGame(transformedGame.externalId)
        
        if (existingGame) {
          if (this.connector.syncSettings.conflictResolution.duplicateGames === 'update') {
            await this.updateGame(existingGame.id, transformedGame)
            results.updated++
          } else {
            results.skipped++
          }
        } else {
          await this.createGame(transformedGame)
          results.imported++
        }
      } catch (error) {
        results.errors++
      }
    }

    return results
  }

  async syncResults(): Promise<any> {
    const results = await this.makeRequest('/results')
    return this.processResults(results.data || [])
  }

  async syncStandings(): Promise<any> {
    const standings = await this.makeRequest('/standings')
    return this.processStandings(standings.data || [])
  }

  async syncRegistrations(): Promise<any> {
    const registrations = await this.makeRequest('/registrations')
    return this.processRegistrations(registrations.data || [])
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest('/health')
      return response.status === 'healthy'
    } catch (error) {
      return false
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.connector.credentials.apiKey}`,
      'X-Organization-ID': this.connector.configuration.organizationId || '',
    }
  }

  private transformUser(user: any): any {
    const mapping = this.connector.syncSettings.dataMapping.userFields
    
    return {
      email: user[mapping.email || 'email'],
      fullName: user[mapping.fullName || 'name'],
      phone: user[mapping.phone || 'phone'],
      dateOfBirth: user[mapping.dateOfBirth || 'dob'],
      emergencyContact: user[mapping.emergencyContact || 'emergency_contact'],
      registrationId: user.id,
      externalId: user.id,
      externalSource: 'leagueapps',
    }
  }

  private transformTeam(team: any): any {
    const mapping = this.connector.syncSettings.dataMapping.teamFields
    
    return {
      name: team[mapping.name || 'name'],
      division: team[mapping.division || 'division'],
      ageGroup: team[mapping.ageGroup || 'age_group'],
      coachName: team[mapping.coachName || 'coach_name'],
      coachEmail: team[mapping.coachEmail || 'coach_email'],
      externalId: team.id,
      externalSource: 'leagueapps',
    }
  }

  private transformGame(game: any): any {
    const mapping = this.connector.syncSettings.dataMapping.gameFields
    
    return {
      homeTeam: game[mapping.homeTeam || 'home_team'],
      awayTeam: game[mapping.awayTeam || 'away_team'],
      date: game[mapping.date || 'date'],
      time: game[mapping.time || 'time'],
      location: game[mapping.location || 'location'],
      field: game[mapping.field || 'field'],
      referee: game[mapping.referee || 'referee'],
      status: game[mapping.status || 'status'],
      externalId: game.id,
      externalSource: 'leagueapps',
    }
  }

  // Database operations
  private async findExistingUser(email: string): Promise<any> {
    const { data } = await this.supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .eq('league_id', this.connector.leagueId)
      .single()
    
    return data
  }

  private async createUser(userData: any): Promise<void> {
    await this.supabase
      .from('user_profiles')
      .insert({
        ...userData,
        league_id: this.connector.leagueId,
      })
  }

  private async updateUser(userId: string, userData: any): Promise<void> {
    await this.supabase
      .from('user_profiles')
      .update({
        ...userData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
  }

  private async findExistingTeam(name: string): Promise<any> {
    const { data } = await this.supabase
      .from('teams')
      .select('id')
      .eq('name', name)
      .eq('league_id', this.connector.leagueId)
      .single()
    
    return data
  }

  private async createTeam(teamData: any): Promise<void> {
    await this.supabase
      .from('teams')
      .insert({
        ...teamData,
        league_id: this.connector.leagueId,
      })
  }

  private async updateTeam(teamId: string, teamData: any): Promise<void> {
    await this.supabase
      .from('teams')
      .update({
        ...teamData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', teamId)
  }

  private async findExistingGame(externalId: string): Promise<any> {
    const { data } = await this.supabase
      .from('games')
      .select('id')
      .eq('external_id', externalId)
      .single()
    
    return data
  }

  private async createGame(gameData: any): Promise<void> {
    await this.supabase
      .from('games')
      .insert(gameData)
  }

  private async updateGame(gameId: string, gameData: any): Promise<void> {
    await this.supabase
      .from('games')
      .update({
        ...gameData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
  }

  private async processResults(results: any[]): Promise<any> {
    // Process game results
    return { imported: 0, updated: 0, skipped: 0, errors: 0 }
  }

  private async processStandings(standings: any[]): Promise<any> {
    // Process team standings
    return { imported: 0, updated: 0, skipped: 0, errors: 0 }
  }

  private async processRegistrations(registrations: any[]): Promise<any> {
    // Process registrations
    return { imported: 0, updated: 0, skipped: 0, errors: 0 }
  }
}

// TeamSnap Connector
class TeamSnapConnector extends BaseConnector {
  async authenticate(): Promise<boolean> {
    try {
      const response = await this.makeRequest('/me')
      return !!response.id
    } catch (error) {
      return false
    }
  }

  async syncUsers(): Promise<any> {
    // TeamSnap-specific user sync implementation
    return { imported: 0, updated: 0, skipped: 0, errors: 0 }
  }

  async syncTeams(): Promise<any> {
    // TeamSnap-specific team sync implementation
    return { imported: 0, updated: 0, skipped: 0, errors: 0 }
  }

  async syncSchedule(): Promise<any> {
    // TeamSnap-specific schedule sync implementation
    return { imported: 0, updated: 0, skipped: 0, errors: 0 }
  }

  async syncResults(): Promise<any> {
    return { imported: 0, updated: 0, skipped: 0, errors: 0 }
  }

  async syncStandings(): Promise<any> {
    return { imported: 0, updated: 0, skipped: 0, errors: 0 }
  }

  async syncRegistrations(): Promise<any> {
    return { imported: 0, updated: 0, skipped: 0, errors: 0 }
  }

  async healthCheck(): Promise<boolean> {
    return true
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.connector.credentials.accessToken}`,
    }
  }
}

// Main Connector Manager
export class LeagueManagementConnectorManager {
  private supabase: any
  private connectors = new Map<string, BaseConnector>()

  constructor() {
    this.supabase = createClient()
  }

  async createConnector(
    leagueId: string,
    userId: string,
    provider: string,
    configuration: ConnectorConfiguration,
    credentials: EncryptedCredentials,
    syncSettings: SyncSettings
  ): Promise<LeagueManagementConnector> {
    const connector = {
      league_id: leagueId,
      created_by: userId,
      name: `${provider} Integration`,
      provider,
      is_active: false, // Start inactive until tested
      configuration,
      credentials: await this.encryptCredentials(credentials),
      sync_settings: syncSettings,
      sync_frequency: 'daily',
      error_count: 0,
    }

    const { data: created, error } = await this.supabase
      .from('league_management_connectors')
      .insert(connector)
      .select()
      .single()

    if (error) throw error

    const transformedConnector = this.transformConnector(created)
    
    // Test the connection
    const testResult = await this.testConnection(transformedConnector.id)
    if (testResult.success) {
      await this.updateConnector(transformedConnector.id, { isActive: true })
      transformedConnector.isActive = true
    }

    return transformedConnector
  }

  async updateConnector(
    connectorId: string,
    updates: Partial<LeagueManagementConnector>
  ): Promise<LeagueManagementConnector> {
    const { data: updated, error } = await this.supabase
      .from('league_management_connectors')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectorId)
      .select()
      .single()

    if (error) throw error

    return this.transformConnector(updated)
  }

  async deleteConnector(connectorId: string): Promise<void> {
    const { error } = await this.supabase
      .from('league_management_connectors')
      .delete()
      .eq('id', connectorId)

    if (error) throw error

    // Remove from cache
    this.connectors.delete(connectorId)
  }

  async getConnectors(leagueId: string): Promise<LeagueManagementConnector[]> {
    const { data: connectors, error } = await this.supabase
      .from('league_management_connectors')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return connectors.map(this.transformConnector)
  }

  async syncConnector(connectorId: string): Promise<ConnectorSyncResult> {
    const connector = await this.getConnector(connectorId)
    if (!connector || !connector.isActive) {
      throw new Error('Connector not found or inactive')
    }

    const startTime = Date.now()
    const result: ConnectorSyncResult = {
      success: true,
      connector: connector.provider,
      startedAt: new Date().toISOString(),
      completedAt: '',
      duration: 0,
      data: {
        users: { imported: 0, updated: 0, skipped: 0, errors: 0 },
        teams: { imported: 0, updated: 0, skipped: 0, errors: 0 },
        schedules: { imported: 0, updated: 0, skipped: 0, errors: 0 },
        results: { imported: 0, updated: 0, skipped: 0, errors: 0 },
        standings: { imported: 0, updated: 0, skipped: 0, errors: 0 },
        registrations: { imported: 0, updated: 0, skipped: 0, errors: 0 },
      },
      errors: [],
      warnings: [],
    }

    try {
      const connectorInstance = this.getConnectorInstance(connector)

      // Authenticate
      const authenticated = await connectorInstance.authenticate()
      if (!authenticated) {
        throw new Error('Authentication failed')
      }

      // Sync data based on configuration
      if (connector.configuration.features.syncUsers) {
        result.data.users = await connectorInstance.syncUsers()
      }

      if (connector.configuration.features.syncTeams) {
        result.data.teams = await connectorInstance.syncTeams()
      }

      if (connector.configuration.features.syncSchedules) {
        result.data.schedules = await connectorInstance.syncSchedule()
      }

      if (connector.configuration.features.syncResults) {
        result.data.results = await connectorInstance.syncResults()
      }

      if (connector.configuration.features.syncStandings) {
        result.data.standings = await connectorInstance.syncStandings()
      }

      if (connector.configuration.features.syncRegistrations) {
        result.data.registrations = await connectorInstance.syncRegistrations()
      }

      result.completedAt = new Date().toISOString()
      result.duration = Date.now() - startTime

      // Update last sync time
      await this.updateConnector(connectorId, {
        lastSyncAt: result.completedAt,
        errorCount: 0,
      })

      // Send success webhook
      await webhookManager.triggerWebhook(
        connector.leagueId,
        'sync.completed',
        {
          connector: {
            id: connector.id,
            name: connector.name,
            provider: connector.provider,
          },
          result,
        }
      )

      return result
    } catch (error) {
      result.success = false
      result.completedAt = new Date().toISOString()
      result.duration = Date.now() - startTime
      result.errors.push({
        type: 'sync_error',
        message: error instanceof Error ? error.message : 'Unknown sync error',
        details: error,
      })

      // Update error count
      await this.updateConnector(connectorId, {
        errorCount: connector.errorCount + 1,
      })

      // Send error webhook
      await webhookManager.triggerWebhook(
        connector.leagueId,
        'sync.failed',
        {
          connector: {
            id: connector.id,
            name: connector.name,
            provider: connector.provider,
          },
          error: result,
        }
      )

      return result
    }
  }

  async testConnection(connectorId: string): Promise<{ success: boolean; message: string }> {
    try {
      const connector = await this.getConnector(connectorId)
      if (!connector) {
        return { success: false, message: 'Connector not found' }
      }

      const connectorInstance = this.getConnectorInstance(connector)
      
      const authenticated = await connectorInstance.authenticate()
      if (!authenticated) {
        return { success: false, message: 'Authentication failed' }
      }

      const healthy = await connectorInstance.healthCheck()
      if (!healthy) {
        return { success: false, message: 'Health check failed' }
      }

      return { success: true, message: 'Connection successful' }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      }
    }
  }

  private getConnectorInstance(connector: LeagueManagementConnector): BaseConnector {
    let instance = this.connectors.get(connector.id)
    
    if (!instance) {
      switch (connector.provider) {
        case 'leagueapps':
          instance = new LeagueAppsConnector(connector)
          break
        case 'teamsnap':
          instance = new TeamSnapConnector(connector)
          break
        default:
          throw new Error(`Unsupported provider: ${connector.provider}`)
      }
      
      this.connectors.set(connector.id, instance)
    }
    
    return instance
  }

  private async getConnector(connectorId: string): Promise<LeagueManagementConnector | null> {
    const { data: connector, error } = await this.supabase
      .from('league_management_connectors')
      .select('*')
      .eq('id', connectorId)
      .single()

    if (error) return null
    return this.transformConnector(connector)
  }

  private async encryptCredentials(credentials: EncryptedCredentials): Promise<EncryptedCredentials> {
    // In production, use proper encryption
    return credentials
  }

  private transformConnector(connector: any): LeagueManagementConnector {
    return {
      id: connector.id,
      leagueId: connector.league_id,
      name: connector.name,
      provider: connector.provider,
      isActive: connector.is_active,
      configuration: connector.configuration,
      credentials: connector.credentials,
      syncSettings: connector.sync_settings,
      lastSyncAt: connector.last_sync_at,
      nextSyncAt: connector.next_sync_at,
      syncFrequency: connector.sync_frequency,
      errorCount: connector.error_count,
      createdAt: connector.created_at,
      updatedAt: connector.updated_at,
      createdBy: connector.created_by,
    }
  }
}

// Singleton instance
export const leagueManagementConnectorManager = new LeagueManagementConnectorManager()