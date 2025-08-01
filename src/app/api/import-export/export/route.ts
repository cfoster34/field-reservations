import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authenticate,
  authorize,
  errorResponse,
  successResponse,
  withErrorHandler,
} from '@/lib/api/middleware'
import { exportSchema } from '@/lib/api/validation'
import {
  generateUsersCSV,
  generateTeamsCSV,
  generateFieldsCSV,
  generateReservationsCSV,
} from '@/lib/import-export/csv-parser'

// POST /api/import-export/export - Export data to CSV or JSON
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin', 'coach'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const validation = await exportSchema.safeParse(await req.json())
  
  if (!validation.success) {
    return errorResponse('Invalid request data', 400, validation.error.errors)
  }

  const supabase = createClient()
  const { type, format, filters } = validation.data
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  // Create export log
  const { data: exportLog, error: logError } = await supabase
    .from('import_export_logs')
    .insert({
      league_id: leagueId,
      user_id: auth.user.id,
      type: 'export',
      source: format,
      file_name: `${type}_export_${Date.now()}.${format}`,
      status: 'processing',
    })
    .select()
    .single()

  if (logError) {
    return errorResponse('Failed to create export log', 500, logError)
  }

  try {
    let data
    let filename
    let contentType
    
    switch (type) {
      case 'users':
        data = await exportUsers(leagueId, filters, format, supabase)
        filename = `users_${Date.now()}.${format}`
        break
      case 'teams':
        data = await exportTeams(leagueId, filters, format, supabase)
        filename = `teams_${Date.now()}.${format}`
        break
      case 'fields':
        data = await exportFields(leagueId, filters, format, supabase)
        filename = `fields_${Date.now()}.${format}`
        break
      case 'reservations':
        data = await exportReservations(leagueId, filters, format, auth.user, supabase)
        filename = `reservations_${Date.now()}.${format}`
        break
      case 'analytics':
        data = await exportAnalytics(leagueId, filters, format, supabase)
        filename = `analytics_${Date.now()}.${format}`
        break
    }

    contentType = format === 'csv' ? 'text/csv' : 'application/json'

    // Update export log
    await supabase
      .from('import_export_logs')
      .update({
        status: 'completed',
        records_processed: data.count || 0,
        completed_at: new Date().toISOString(),
      })
      .eq('id', exportLog.id)

    // Return file data
    return new NextResponse(data.content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Count': data.count.toString(),
      },
    })
  } catch (error) {
    // Update export log with error
    await supabase
      .from('import_export_logs')
      .update({
        status: 'failed',
        error_log: { error: error instanceof Error ? error.message : 'Unknown error' },
        completed_at: new Date().toISOString(),
      })
      .eq('id', exportLog.id)

    throw error
  }
})

// Export users
async function exportUsers(leagueId: string, filters: any, format: string, supabase: any) {
  let query = supabase
    .from('user_profiles')
    .select(`
      *,
      team:teams (
        id,
        name
      )
    `)
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })

  // Apply filters
  if (filters?.role) {
    query = query.eq('role', filters.role)
  }
  if (filters?.teamId) {
    query = query.eq('team_id', filters.teamId)
  }
  if (filters?.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive)
  }

  const { data: users, error } = await query

  if (error) throw error

  const content = format === 'csv' 
    ? generateUsersCSV(users || [])
    : JSON.stringify({ users: users || [] }, null, 2)

  return { content, count: users?.length || 0 }
}

// Export teams
async function exportTeams(leagueId: string, filters: any, format: string, supabase: any) {
  let query = supabase
    .from('teams')
    .select(`
      *,
      coach:user_profiles!coach_id (
        id,
        full_name,
        email
      )
    `)
    .eq('league_id', leagueId)
    .order('name', { ascending: true })

  // Apply filters
  if (filters?.ageGroup) {
    query = query.eq('age_group', filters.ageGroup)
  }
  if (filters?.division) {
    query = query.eq('division', filters.division)
  }

  const { data: teams, error } = await query

  if (error) throw error

  // Get member counts
  const teamsWithCounts = await Promise.all(
    (teams || []).map(async (team) => {
      const { count } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', team.id)
      
      return { ...team, memberCount: count || 0 }
    })
  )

  const content = format === 'csv' 
    ? generateTeamsCSV(teamsWithCounts)
    : JSON.stringify({ teams: teamsWithCounts }, null, 2)

  return { content, count: teamsWithCounts.length }
}

// Export fields
async function exportFields(leagueId: string, filters: any, format: string, supabase: any) {
  let query = supabase
    .from('fields')
    .select('*')
    .eq('league_id', leagueId)
    .order('name', { ascending: true })

  // Apply filters
  if (filters?.type) {
    query = query.eq('type', filters.type)
  }
  if (filters?.status) {
    query = query.eq('status', filters.status)
  }

  const { data: fields, error } = await query

  if (error) throw error

  const content = format === 'csv' 
    ? generateFieldsCSV(fields || [])
    : JSON.stringify({ fields: fields || [] }, null, 2)

  return { content, count: fields?.length || 0 }
}

// Export reservations
async function exportReservations(leagueId: string, filters: any, format: string, user: any, supabase: any) {
  let query = supabase
    .from('reservations')
    .select(`
      *,
      field:fields (
        id,
        name,
        type
      ),
      user:user_profiles (
        id,
        full_name,
        email
      ),
      team:teams (
        id,
        name
      )
    `)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })

  // Filter by league through fields
  const { data: leagueFields } = await supabase
    .from('fields')
    .select('id')
    .eq('league_id', leagueId)
  
  const fieldIds = leagueFields?.map(f => f.id) || []
  query = query.in('field_id', fieldIds)

  // Apply filters
  if (filters?.startDate) {
    query = query.gte('date', filters.startDate)
  }
  if (filters?.endDate) {
    query = query.lte('date', filters.endDate)
  }
  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  if (filters?.fieldId) {
    query = query.eq('field_id', filters.fieldId)
  }
  if (filters?.teamId) {
    query = query.eq('team_id', filters.teamId)
  }

  // If user is a coach, only export their team's reservations
  if (user.profile?.role === 'coach' && user.profile?.team_id) {
    query = query.eq('team_id', user.profile.team_id)
  }

  const { data: reservations, error } = await query

  if (error) throw error

  const content = format === 'csv' 
    ? generateReservationsCSV(reservations || [])
    : JSON.stringify({ reservations: reservations || [] }, null, 2)

  return { content, count: reservations?.length || 0 }
}

// Export analytics
async function exportAnalytics(leagueId: string, filters: any, format: string, supabase: any) {
  const startDate = filters?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const endDate = filters?.endDate || new Date().toISOString().split('T')[0]

  // Get various analytics data
  const { data: utilizationStats } = await supabase
    .from('field_utilization_stats')
    .select('*')
    .eq('league_id', leagueId)
    .gte('month', startDate)
    .lte('month', endDate)

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('league_id', leagueId)
    .eq('status', 'completed')
    .gte('created_at', `${startDate}T00:00:00`)
    .lte('created_at', `${endDate}T23:59:59`)

  const analytics = {
    period: { startDate, endDate },
    utilization: utilizationStats || [],
    revenue: {
      total: payments?.reduce((sum, p) => sum + p.amount, 0) || 0,
      transactions: payments?.length || 0,
    },
    exportedAt: new Date().toISOString(),
  }

  const content = format === 'csv' 
    ? generateAnalyticsCSV(analytics)
    : JSON.stringify({ analytics }, null, 2)

  return { content, count: 1 }
}

// Generate analytics CSV
function generateAnalyticsCSV(analytics: any): string {
  // Simple CSV format for analytics
  const rows = [
    ['Metric', 'Value'],
    ['Period Start', analytics.period.startDate],
    ['Period End', analytics.period.endDate],
    ['Total Revenue', analytics.revenue.total],
    ['Total Transactions', analytics.revenue.transactions],
    ['Exported At', analytics.exportedAt],
  ]

  return rows.map(row => row.join(',')).join('\n')
}