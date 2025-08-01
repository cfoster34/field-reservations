import { createClient } from '@/lib/supabase/server'
import { SportsConnectClient, SportsConnectSyncResult, createSportsConnectClient } from './client'
import { format } from 'date-fns'

export interface SyncOptions {
  syncUsers?: boolean
  syncTeams?: boolean
  syncFields?: boolean
  syncReservations?: boolean
  since?: string
  batchSize?: number
  dryRun?: boolean
}

export interface SyncProgress {
  stage: 'users' | 'teams' | 'fields' | 'reservations' | 'complete'
  processed: number
  total: number
  errors: number
  currentItem?: string
}

export class SportsConnectSyncService {
  private client: SportsConnectClient
  private supabase: any
  private leagueId: string
  private userId: string
  private progressCallback?: (progress: SyncProgress) => void

  constructor(
    leagueId: string,
    userId: string,
    config?: any,
    progressCallback?: (progress: SyncProgress) => void
  ) {
    this.client = createSportsConnectClient(config)
    this.supabase = createClient()
    this.leagueId = leagueId
    this.userId = userId
    this.progressCallback = progressCallback
  }

  async performFullSync(options: SyncOptions = {}): Promise<SportsConnectSyncResult> {
    const {
      syncUsers = true,
      syncTeams = true,
      syncFields = true,
      syncReservations = true,
      since,
      batchSize = 100,
      dryRun = false,
    } = options

    // Create sync log
    const syncLog = await this.createSyncLog('full', dryRun)
    
    const result: SportsConnectSyncResult = {
      users: { created: 0, updated: 0, errors: [] },
      teams: { created: 0, updated: 0, errors: [] },
      fields: { created: 0, updated: 0, errors: [] },
      reservations: { created: 0, updated: 0, errors: [] },
      lastSyncAt: new Date().toISOString(),
    }

    try {
      // Health check first
      await this.client.healthCheck()

      // Sync users
      if (syncUsers) {
        await this.syncUsers(result.users, since, batchSize, dryRun)
      }

      // Sync teams
      if (syncTeams) {
        await this.syncTeams(result.teams, since, batchSize, dryRun)
      }

      // Sync fields
      if (syncFields) {
        await this.syncFields(result.fields, since, batchSize, dryRun)
      }

      // Sync reservations
      if (syncReservations) {
        await this.syncReservations(result.reservations, since, batchSize, dryRun)
      }

      // Update sync log with success
      await this.updateSyncLog(syncLog.id, 'completed', result)

      // Update last sync timestamp
      if (!dryRun) {
        await this.updateLastSyncTimestamp()
      }

      this.progressCallback?.({
        stage: 'complete',
        processed: 0,
        total: 0,
        errors: 0,
      })

      return result
    } catch (error) {
      // Update sync log with error
      await this.updateSyncLog(syncLog.id, 'failed', result, error)
      throw error
    }
  }

  private async syncUsers(
    result: SportsConnectSyncResult['users'],
    since?: string,
    batchSize = 100,
    dryRun = false
  ): Promise<void> {
    this.progressCallback?.({
      stage: 'users',
      processed: 0,
      total: 0,
      errors: 0,
      currentItem: 'Fetching users...',
    })

    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { users, total } = await this.client.getUsers({
        since,
        limit: batchSize,
        offset,
      })

      this.progressCallback?.({
        stage: 'users',
        processed: offset,
        total,
        errors: result.errors.length,
      })

      for (const user of users) {
        try {
          this.progressCallback?.({
            stage: 'users',
            processed: offset + users.indexOf(user),
            total,
            errors: result.errors.length,
            currentItem: `Processing user: ${user.email}`,
          })

          if (!dryRun) {
            const existingUser = await this.findExistingUser(user.email)
            
            if (existingUser) {
              await this.updateUser(existingUser.id, user)
              result.updated++
            } else {
              await this.createUser(user)
              result.created++
            }
          } else {
            result.created++
          }
        } catch (error) {
          result.errors.push({
            id: user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      offset += users.length
      hasMore = users.length === batchSize && offset < total
    }
  }

  private async syncTeams(
    result: SportsConnectSyncResult['teams'],
    since?: string,
    batchSize = 100,
    dryRun = false
  ): Promise<void> {
    this.progressCallback?.({
      stage: 'teams',
      processed: 0,
      total: 0,
      errors: 0,
      currentItem: 'Fetching teams...',
    })

    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { teams, total } = await this.client.getTeams({
        since,
        limit: batchSize,
        offset,
      })

      this.progressCallback?.({
        stage: 'teams',
        processed: offset,
        total,
        errors: result.errors.length,
      })

      for (const team of teams) {
        try {
          this.progressCallback?.({
            stage: 'teams',
            processed: offset + teams.indexOf(team),
            total,
            errors: result.errors.length,
            currentItem: `Processing team: ${team.name}`,
          })

          if (!dryRun) {
            const existingTeam = await this.findExistingTeam(team.name)
            
            if (existingTeam) {
              await this.updateTeam(existingTeam.id, team)
              result.updated++
            } else {
              await this.createTeam(team)
              result.created++
            }
          } else {
            result.created++
          }
        } catch (error) {
          result.errors.push({
            id: team.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      offset += teams.length
      hasMore = teams.length === batchSize && offset < total
    }
  }

  private async syncFields(
    result: SportsConnectSyncResult['fields'],
    since?: string,
    batchSize = 100,
    dryRun = false
  ): Promise<void> {
    this.progressCallback?.({
      stage: 'fields',
      processed: 0,
      total: 0,
      errors: 0,
      currentItem: 'Fetching fields...',
    })

    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { fields, total } = await this.client.getFields({
        since,
        availability: true,
        limit: batchSize,
        offset,
      })

      this.progressCallback?.({
        stage: 'fields',
        processed: offset,
        total,
        errors: result.errors.length,
      })

      for (const field of fields) {
        try {
          this.progressCallback?.({
            stage: 'fields',
            processed: offset + fields.indexOf(field),
            total,
            errors: result.errors.length,
            currentItem: `Processing field: ${field.name}`,
          })

          if (!dryRun) {
            const existingField = await this.findExistingField(field.name)
            
            if (existingField) {
              await this.updateField(existingField.id, field)
              result.updated++
            } else {
              await this.createField(field)
              result.created++
            }
          } else {
            result.created++
          }
        } catch (error) {
          result.errors.push({
            id: field.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      offset += fields.length
      hasMore = fields.length === batchSize && offset < total
    }
  }

  private async syncReservations(
    result: SportsConnectSyncResult['reservations'],
    since?: string,
    batchSize = 100,
    dryRun = false
  ): Promise<void> {
    this.progressCallback?.({
      stage: 'reservations',
      processed: 0,
      total: 0,
      errors: 0,
      currentItem: 'Fetching reservations...',
    })

    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { reservations, total } = await this.client.getReservations({
        since,
        limit: batchSize,
        offset,
      })

      this.progressCallback?.({
        stage: 'reservations',
        processed: offset,
        total,
        errors: result.errors.length,
      })

      for (const reservation of reservations) {
        try {
          this.progressCallback?.({
            stage: 'reservations',
            processed: offset + reservations.indexOf(reservation),
            total,
            errors: result.errors.length,
            currentItem: `Processing reservation: ${reservation.id}`,
          })

          if (!dryRun) {
            const existingReservation = await this.findExistingReservation(reservation.id)
            
            if (existingReservation) {
              await this.updateReservation(existingReservation.id, reservation)
              result.updated++
            } else {
              await this.createReservation(reservation)
              result.created++
            }
          } else {
            result.created++
          }
        } catch (error) {
          result.errors.push({
            id: reservation.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      offset += reservations.length
      hasMore = reservations.length === batchSize && offset < total
    }
  }

  // Database operations
  private async findExistingUser(email: string) {
    const { data } = await this.supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .eq('league_id', this.leagueId)
      .single()
    
    return data
  }

  private async createUser(sportsConnectUser: any) {
    // Create auth user first
    const { data: authData, error: authError } = await this.supabase.auth.admin.createUser({
      email: sportsConnectUser.email,
      email_confirm: true,
      user_metadata: {
        full_name: `${sportsConnectUser.firstName} ${sportsConnectUser.lastName}`,
      },
    })

    if (authError) throw authError

    // Create user profile
    await this.supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        email: sportsConnectUser.email,
        full_name: `${sportsConnectUser.firstName} ${sportsConnectUser.lastName}`,
        phone: sportsConnectUser.phone,
        role: sportsConnectUser.role,
        league_id: this.leagueId,
        external_id: sportsConnectUser.id,
        external_source: 'sportsconnect',
        is_approved: true,
        approved_at: new Date().toISOString(),
        approved_by: this.userId,
      })
  }

  private async updateUser(userId: string, sportsConnectUser: any) {
    await this.supabase
      .from('user_profiles')
      .update({
        full_name: `${sportsConnectUser.firstName} ${sportsConnectUser.lastName}`,
        phone: sportsConnectUser.phone,
        role: sportsConnectUser.role,
        external_id: sportsConnectUser.id,
        external_source: 'sportsconnect',
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
  }

  private async findExistingTeam(name: string) {
    const { data } = await this.supabase
      .from('teams')
      .select('id')
      .eq('name', name)
      .eq('league_id', this.leagueId)
      .single()
    
    return data
  }

  private async createTeam(sportsConnectTeam: any) {
    // Find coach if exists
    let coachId = null
    if (sportsConnectTeam.coachId) {
      const { data: coach } = await this.supabase
        .from('user_profiles')
        .select('id')
        .eq('external_id', sportsConnectTeam.coachId)
        .eq('league_id', this.leagueId)
        .single()
      
      coachId = coach?.id
    }

    await this.supabase
      .from('teams')
      .insert({
        league_id: this.leagueId,
        name: sportsConnectTeam.name,
        coach_id: coachId,
        age_group: sportsConnectTeam.ageGroup,
        division: sportsConnectTeam.division,
        sport_type: sportsConnectTeam.sportType,
        season: sportsConnectTeam.season,
        external_id: sportsConnectTeam.id,
        external_source: 'sportsconnect',
      })
  }

  private async updateTeam(teamId: string, sportsConnectTeam: any) {
    // Find coach if exists
    let coachId = null
    if (sportsConnectTeam.coachId) {
      const { data: coach } = await this.supabase
        .from('user_profiles')
        .select('id')
        .eq('external_id', sportsConnectTeam.coachId)
        .eq('league_id', this.leagueId)
        .single()
      
      coachId = coach?.id
    }

    await this.supabase
      .from('teams')
      .update({
        coach_id: coachId,
        age_group: sportsConnectTeam.ageGroup,
        division: sportsConnectTeam.division,
        sport_type: sportsConnectTeam.sportType,
        season: sportsConnectTeam.season,
        external_id: sportsConnectTeam.id,
        external_source: 'sportsconnect',
        updated_at: new Date().toISOString(),
      })
      .eq('id', teamId)
  }

  private async findExistingField(name: string) {
    const { data } = await this.supabase
      .from('fields')
      .select('id')
      .eq('name', name)
      .eq('league_id', this.leagueId)
      .single()
    
    return data
  }

  private async createField(sportsConnectField: any) {
    await this.supabase
      .from('fields')
      .insert({
        league_id: this.leagueId,
        name: sportsConnectField.name,
        type: sportsConnectField.type,
        address: sportsConnectField.address,
        coordinates: sportsConnectField.coordinates,
        amenities: sportsConnectField.amenities,
        hourly_rate: sportsConnectField.hourlyRate,
        capacity: sportsConnectField.capacity,
        availability: sportsConnectField.availability,
        external_id: sportsConnectField.id,
        external_source: 'sportsconnect',
        status: 'available',
      })
  }

  private async updateField(fieldId: string, sportsConnectField: any) {
    await this.supabase
      .from('fields')
      .update({
        type: sportsConnectField.type,
        address: sportsConnectField.address,
        coordinates: sportsConnectField.coordinates,
        amenities: sportsConnectField.amenities,
        hourly_rate: sportsConnectField.hourlyRate,
        capacity: sportsConnectField.capacity,
        availability: sportsConnectField.availability,
        external_id: sportsConnectField.id,
        external_source: 'sportsconnect',
        updated_at: new Date().toISOString(),
      })
      .eq('id', fieldId)
  }

  private async findExistingReservation(externalId: string) {
    const { data } = await this.supabase
      .from('reservations')
      .select('id')
      .eq('external_id', externalId)
      .single()
    
    return data
  }

  private async createReservation(sportsConnectReservation: any) {
    // Find field
    const { data: field } = await this.supabase
      .from('fields')
      .select('id')
      .eq('external_id', sportsConnectReservation.fieldId)
      .eq('league_id', this.leagueId)
      .single()

    if (!field) throw new Error(`Field not found for external ID: ${sportsConnectReservation.fieldId}`)

    // Find user
    const { data: user } = await this.supabase
      .from('user_profiles')
      .select('id')
      .eq('external_id', sportsConnectReservation.userId)
      .eq('league_id', this.leagueId)
      .single()

    if (!user) throw new Error(`User not found for external ID: ${sportsConnectReservation.userId}`)

    // Find team if specified
    let teamId = null
    if (sportsConnectReservation.teamId) {
      const { data: team } = await this.supabase
        .from('teams')
        .select('id')
        .eq('external_id', sportsConnectReservation.teamId)
        .eq('league_id', this.leagueId)
        .single()
      
      teamId = team?.id
    }

    await this.supabase
      .from('reservations')
      .insert({
        field_id: field.id,
        user_id: user.id,
        team_id: teamId,
        date: sportsConnectReservation.date,
        start_time: sportsConnectReservation.startTime,
        end_time: sportsConnectReservation.endTime,
        status: sportsConnectReservation.status,
        purpose: sportsConnectReservation.purpose,
        attendees: sportsConnectReservation.attendees,
        cost: sportsConnectReservation.cost,
        external_id: sportsConnectReservation.id,
        external_source: 'sportsconnect',
        confirmed_at: sportsConnectReservation.status === 'confirmed' ? new Date().toISOString() : null,
      })
  }

  private async updateReservation(reservationId: string, sportsConnectReservation: any) {
    // Find team if specified
    let teamId = null
    if (sportsConnectReservation.teamId) {
      const { data: team } = await this.supabase
        .from('teams')
        .select('id')
        .eq('external_id', sportsConnectReservation.teamId)
        .eq('league_id', this.leagueId)
        .single()
      
      teamId = team?.id
    }

    await this.supabase
      .from('reservations')
      .update({
        team_id: teamId,
        date: sportsConnectReservation.date,
        start_time: sportsConnectReservation.startTime,
        end_time: sportsConnectReservation.endTime,
        status: sportsConnectReservation.status,
        purpose: sportsConnectReservation.purpose,
        attendees: sportsConnectReservation.attendees,
        cost: sportsConnectReservation.cost,
        external_id: sportsConnectReservation.id,
        external_source: 'sportsconnect',
        confirmed_at: sportsConnectReservation.status === 'confirmed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId)
  }

  // Sync logging
  private async createSyncLog(type: string, dryRun: boolean) {
    const { data, error } = await this.supabase
      .from('sync_logs')
      .insert({
        league_id: this.leagueId,
        user_id: this.userId,
        sync_type: type,
        source: 'sportsconnect',
        status: 'running',
        dry_run: dryRun,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  private async updateSyncLog(logId: string, status: string, result: SportsConnectSyncResult, error?: any) {
    await this.supabase
      .from('sync_logs')
      .update({
        status,
        result,
        error_message: error ? (error instanceof Error ? error.message : JSON.stringify(error)) : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', logId)
  }

  private async updateLastSyncTimestamp() {
    await this.supabase
      .from('league_settings')
      .upsert({
        league_id: this.leagueId,
        key: 'sportsconnect_last_sync',
        value: new Date().toISOString(),
      })
  }

  async getLastSyncTimestamp(): Promise<string | null> {
    const { data } = await this.supabase
      .from('league_settings')
      .select('value')
      .eq('league_id', this.leagueId)
      .eq('key', 'sportsconnect_last_sync')
      .single()

    return data?.value || null
  }

  async getSyncHistory(limit = 10) {
    const { data } = await this.supabase
      .from('sync_logs')
      .select('*')
      .eq('league_id', this.leagueId)
      .eq('source', 'sportsconnect')
      .order('started_at', { ascending: false })
      .limit(limit)

    return data || []
  }
}