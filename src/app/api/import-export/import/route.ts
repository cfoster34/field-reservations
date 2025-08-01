import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  authorize,
  errorResponse,
  successResponse,
  withErrorHandler,
} from '@/lib/api/middleware'
import { z } from 'zod'
import {
  parseUsersCSV,
  parseTeamsCSV,
  parseFieldsCSV,
  parseReservationsCSV,
  isValidDate,
  isValidTime,
  isValidEmail,
} from '@/lib/import-export/csv-parser'

const importSchema = z.object({
  type: z.enum(['users', 'teams', 'fields', 'reservations']),
  source: z.enum(['csv', 'sportsconnect']),
  data: z.string(), // CSV content or JSON data
})

// POST /api/import-export/import - Import data from CSV or SportsConnect
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const body = await req.json()
  const validation = importSchema.safeParse(body)
  
  if (!validation.success) {
    return errorResponse('Invalid request data', 400, validation.error.errors)
  }

  const supabase = createClient()
  const { type, source, data } = validation.data
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  // Create import log
  const { data: importLog, error: logError } = await supabase
    .from('import_export_logs')
    .insert({
      league_id: leagueId,
      user_id: auth.user.id,
      type: 'import',
      source,
      file_name: `${type}_import_${Date.now()}.${source}`,
      status: 'processing',
    })
    .select()
    .single()

  if (logError) {
    return errorResponse('Failed to create import log', 500, logError)
  }

  try {
    let result
    
    switch (type) {
      case 'users':
        result = await importUsers(data, source, leagueId, supabase)
        break
      case 'teams':
        result = await importTeams(data, source, leagueId, supabase)
        break
      case 'fields':
        result = await importFields(data, source, leagueId, supabase)
        break
      case 'reservations':
        result = await importReservations(data, source, leagueId, auth.user.id, supabase)
        break
    }

    // Update import log
    await supabase
      .from('import_export_logs')
      .update({
        status: 'completed',
        records_processed: result.processed,
        records_failed: result.failed,
        error_log: result.errors.length > 0 ? result.errors : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', importLog.id)

    return successResponse({
      importId: importLog.id,
      processed: result.processed,
      failed: result.failed,
      errors: result.errors,
    })
  } catch (error) {
    // Update import log with error
    await supabase
      .from('import_export_logs')
      .update({
        status: 'failed',
        error_log: { error: error instanceof Error ? error.message : 'Unknown error' },
        completed_at: new Date().toISOString(),
      })
      .eq('id', importLog.id)

    throw error
  }
})

// Import users
async function importUsers(data: string, source: string, leagueId: string, supabase: any) {
  const users = source === 'csv' ? parseUsersCSV(data) : JSON.parse(data).users
  const results = { processed: 0, failed: 0, errors: [] as any[] }

  for (const userData of users) {
    try {
      // Validate email
      if (!isValidEmail(userData.email)) {
        results.failed++
        results.errors.push({ row: results.processed + results.failed, error: 'Invalid email', data: userData })
        continue
      }

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', userData.email)
        .single()

      if (existingUser) {
        // Update existing user
        await supabase
          .from('user_profiles')
          .update({
            league_id: leagueId,
            full_name: userData.fullName,
            phone: userData.phone,
            role: userData.role || 'member',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingUser.id)
      } else {
        // Create auth user first
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: userData.email,
          email_confirm: true,
          user_metadata: {
            full_name: userData.fullName,
          },
        })

        if (authError) {
          throw authError
        }

        // Create user profile
        await supabase
          .from('user_profiles')
          .insert({
            id: authData.user.id,
            email: userData.email,
            full_name: userData.fullName,
            phone: userData.phone,
            role: userData.role || 'member',
            league_id: leagueId,
            is_approved: true,
            approved_at: new Date().toISOString(),
            approved_by: auth.user.id,
          })
      }

      // Assign to team if specified
      if (userData.teamName) {
        const { data: team } = await supabase
          .from('teams')
          .select('id')
          .eq('league_id', leagueId)
          .eq('name', userData.teamName)
          .single()

        if (team) {
          await supabase
            .from('user_profiles')
            .update({ team_id: team.id })
            .eq('email', userData.email)
        }
      }

      results.processed++
    } catch (error) {
      results.failed++
      results.errors.push({
        row: results.processed + results.failed,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: userData,
      })
    }
  }

  return results
}

// Import teams
async function importTeams(data: string, source: string, leagueId: string, supabase: any) {
  const teams = source === 'csv' ? parseTeamsCSV(data) : JSON.parse(data).teams
  const results = { processed: 0, failed: 0, errors: [] as any[] }

  for (const teamData of teams) {
    try {
      // Check if team already exists
      const { data: existingTeam } = await supabase
        .from('teams')
        .select('id')
        .eq('league_id', leagueId)
        .eq('name', teamData.name)
        .single()

      if (existingTeam) {
        results.failed++
        results.errors.push({ row: results.processed + results.failed, error: 'Team already exists', data: teamData })
        continue
      }

      // Find coach if specified
      let coachId = null
      if (teamData.coachEmail) {
        const { data: coach } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('email', teamData.coachEmail)
          .eq('league_id', leagueId)
          .single()
        
        coachId = coach?.id
      }

      // Create team
      await supabase
        .from('teams')
        .insert({
          league_id: leagueId,
          name: teamData.name,
          coach_id: coachId,
          age_group: teamData.ageGroup,
          division: teamData.division,
        })

      results.processed++
    } catch (error) {
      results.failed++
      results.errors.push({
        row: results.processed + results.failed,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: teamData,
      })
    }
  }

  return results
}

// Import fields
async function importFields(data: string, source: string, leagueId: string, supabase: any) {
  const fields = source === 'csv' ? parseFieldsCSV(data) : JSON.parse(data).fields
  const results = { processed: 0, failed: 0, errors: [] as any[] }

  const validFieldTypes = ['soccer', 'baseball', 'football', 'basketball', 'tennis', 'multipurpose']

  for (const fieldData of fields) {
    try {
      // Validate field type
      if (!validFieldTypes.includes(fieldData.type)) {
        fieldData.type = 'multipurpose'
      }

      // Check if field already exists
      const { data: existingField } = await supabase
        .from('fields')
        .select('id')
        .eq('league_id', leagueId)
        .eq('name', fieldData.name)
        .single()

      if (existingField) {
        // Update existing field
        await supabase
          .from('fields')
          .update({
            type: fieldData.type,
            address: fieldData.address,
            hourly_rate: fieldData.hourlyRate,
            capacity: fieldData.capacity,
            amenities: fieldData.amenities,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingField.id)
      } else {
        // Create new field
        await supabase
          .from('fields')
          .insert({
            league_id: leagueId,
            name: fieldData.name,
            type: fieldData.type,
            address: fieldData.address,
            hourly_rate: fieldData.hourlyRate,
            capacity: fieldData.capacity,
            amenities: fieldData.amenities,
            status: 'available',
          })
      }

      results.processed++
    } catch (error) {
      results.failed++
      results.errors.push({
        row: results.processed + results.failed,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: fieldData,
      })
    }
  }

  return results
}

// Import reservations
async function importReservations(data: string, source: string, leagueId: string, userId: string, supabase: any) {
  const reservations = source === 'csv' ? parseReservationsCSV(data) : JSON.parse(data).reservations
  const results = { processed: 0, failed: 0, errors: [] as any[] }

  for (const reservationData of reservations) {
    try {
      // Validate date and time
      if (!isValidDate(reservationData.date)) {
        results.failed++
        results.errors.push({ row: results.processed + results.failed, error: 'Invalid date format', data: reservationData })
        continue
      }

      if (!isValidTime(reservationData.startTime) || !isValidTime(reservationData.endTime)) {
        results.failed++
        results.errors.push({ row: results.processed + results.failed, error: 'Invalid time format', data: reservationData })
        continue
      }

      // Find field
      const { data: field } = await supabase
        .from('fields')
        .select('id')
        .eq('league_id', leagueId)
        .eq('name', reservationData.fieldName)
        .single()

      if (!field) {
        results.failed++
        results.errors.push({ row: results.processed + results.failed, error: 'Field not found', data: reservationData })
        continue
      }

      // Find user
      const { data: user } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', reservationData.userEmail)
        .eq('league_id', leagueId)
        .single()

      if (!user) {
        results.failed++
        results.errors.push({ row: results.processed + results.failed, error: 'User not found', data: reservationData })
        continue
      }

      // Check for conflicts
      const { data: hasConflict } = await supabase
        .rpc('check_reservation_conflict', {
          p_field_id: field.id,
          p_date: reservationData.date,
          p_start_time: reservationData.startTime,
          p_end_time: reservationData.endTime,
        })

      if (hasConflict) {
        results.failed++
        results.errors.push({ row: results.processed + results.failed, error: 'Time slot conflict', data: reservationData })
        continue
      }

      // Create reservation
      await supabase
        .from('reservations')
        .insert({
          field_id: field.id,
          user_id: user.id,
          date: reservationData.date,
          start_time: reservationData.startTime,
          end_time: reservationData.endTime,
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          purpose: reservationData.purpose,
          attendees: reservationData.attendees,
        })

      results.processed++
    } catch (error) {
      results.failed++
      results.errors.push({
        row: results.processed + results.failed,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: reservationData,
      })
    }
  }

  return results
}