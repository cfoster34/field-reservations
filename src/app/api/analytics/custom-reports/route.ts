import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authorize,
  errorResponse,
  successResponse,
  withErrorHandler,
  cache,
} from '@/lib/api/middleware'

// GET /api/analytics/custom-reports - Get saved custom reports
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin', 'coach'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const supabase = createClient()
  const leagueId = auth.user.profile?.league_id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  try {
    const { data: reports, error } = await supabase
      .from('custom_reports')
      .select(`
        id,
        name,
        description,
        report_config,
        is_scheduled,
        schedule_config,
        last_run_at,
        next_run_at,
        created_at,
        updated_at,
        created_by,
        creator:user_profiles!created_by(full_name, email)
      `)
      .eq('league_id', leagueId)
      .order('updated_at', { ascending: false })

    if (error) {
      throw error
    }

    return successResponse(reports || [])
  } catch (error) {
    console.error('Error fetching custom reports:', error)
    return errorResponse('Failed to fetch custom reports', 500)
  }
})

// POST /api/analytics/custom-reports - Create a new custom report
export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await authorize(['admin', 'coach'])(req)
  
  if (!auth.authenticated || !auth.authorized) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const supabase = createClient()
  const leagueId = auth.user.profile?.league_id
  const userId = auth.user.id

  if (!leagueId) {
    return errorResponse('User must belong to a league', 400)
  }

  try {
    const body = await req.json()
    const { name, description, config, isScheduled, scheduleConfig } = body

    // Validate required fields
    if (!name || !config) {
      return errorResponse('Name and config are required', 400)
    }

    // Validate report config
    if (!config.metrics || !Array.isArray(config.metrics) || config.metrics.length === 0) {
      return errorResponse('At least one metric must be selected', 400)
    }

    if (!config.dimensions || !Array.isArray(config.dimensions) || config.dimensions.length === 0) {
      return errorResponse('At least one dimension must be selected', 400)
    }

    const reportData = {
      league_id: leagueId,
      created_by: userId,
      name,
      description: description || null,
      report_config: config,
      is_scheduled: isScheduled || false,
      schedule_config: scheduleConfig || null,
      next_run_at: isScheduled && scheduleConfig ? calculateNextRun(scheduleConfig) : null
    }

    const { data: report, error } = await supabase
      .from('custom_reports')
      .insert(reportData)
      .select(`
        id,
        name,
        description,
        report_config,
        is_scheduled,
        schedule_config,
        last_run_at,
        next_run_at,
        created_at,
        updated_at
      `)
      .single()

    if (error) {
      throw error
    }

    return successResponse(report, 201)
  } catch (error) {
    console.error('Error creating custom report:', error)
    return errorResponse('Failed to create custom report', 500)
  }
})

function calculateNextRun(scheduleConfig: any): string {
  const now = new Date()
  const [hours, minutes] = scheduleConfig.time.split(':').map(Number)
  
  let nextRun = new Date()
  nextRun.setHours(hours, minutes, 0, 0)

  // If the scheduled time has passed today, move to the next occurrence
  if (nextRun <= now) {
    switch (scheduleConfig.frequency) {
      case 'daily':
        nextRun.setDate(nextRun.getDate() + 1)
        break
      case 'weekly':
        nextRun.setDate(nextRun.getDate() + 7)
        break
      case 'monthly':
        nextRun.setMonth(nextRun.getMonth() + 1)
        break
    }
  }

  return nextRun.toISOString()
}