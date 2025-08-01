import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authorize,
  errorResponse,
  successResponse,
  withErrorHandler,
} from '@/lib/api/middleware'

// POST /api/analytics/custom-reports/run - Execute a custom report
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
    const { config, reportId } = body

    if (!config) {
      return errorResponse('Report configuration is required', 400)
    }

    // Record the report execution
    const executionData = {
      report_id: reportId || null,
      executed_by: userId,
      execution_type: reportId ? 'manual' : 'adhoc',
      status: 'running',
      started_at: new Date().toISOString()
    }

    const { data: execution, error: executionError } = await supabase
      .from('report_executions')
      .insert(executionData)
      .select('id')
      .single()

    if (executionError) {
      console.warn('Failed to record execution:', executionError)
    }

    // Execute the report based on configuration
    const reportData = await executeReport(supabase, leagueId, config)

    // Update execution status
    if (execution) {
      await supabase
        .from('report_executions')
        .update({
          status: 'completed',
          result_data: reportData,
          completed_at: new Date().toISOString(),
          execution_time_ms: Date.now() - new Date(executionData.started_at).getTime()
        })
        .eq('id', execution.id)

      // Update last run time for scheduled reports
      if (reportId) {
        await supabase
          .from('custom_reports')
          .update({ last_run_at: new Date().toISOString() })
          .eq('id', reportId)
      }
    }

    return successResponse(reportData)
  } catch (error) {
    console.error('Error executing custom report:', error)
    return errorResponse('Failed to execute custom report', 500)
  }
})

async function executeReport(supabase: any, leagueId: string, config: any) {
  const { dataSource, metrics, dimensions, filters, dateRange, groupBy, sortBy, sortOrder, limit } = config

  try {
    let query = buildQuery(supabase, dataSource, leagueId, metrics, dimensions, filters, dateRange)
    
    // Apply grouping if specified
    if (groupBy && groupBy !== 'none') {
      query = applyGrouping(query, groupBy, metrics)
    }

    // Apply sorting
    if (sortBy) {
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })
    }

    // Apply limit
    if (limit && limit > 0) {
      query = query.limit(Math.min(limit, 1000)) // Cap at 1000 rows
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    // Process the data based on metrics and dimensions
    return processReportData(data || [], metrics, dimensions, config)
  } catch (error) {
    console.error('Error in executeReport:', error)
    throw error
  }
}

function buildQuery(supabase: any, dataSource: string, leagueId: string, metrics: string[], dimensions: string[], filters: any[], dateRange: any) {
  let query

  switch (dataSource) {
    case 'bookings':
      query = supabase
        .from('reservations')
        .select(`
          id,
          date,
          start_time,
          end_time,
          status,
          attendees,
          created_at,
          field:fields(id, name, type),
          user:user_profiles(id, full_name, role),
          team:teams(id, name),
          payment:payments(amount, status)
        `)
        .eq('league_id', leagueId)
      break

    case 'users':
      query = supabase
        .from('user_profiles')
        .select(`
          id,
          full_name,
          email,
          role,
          created_at,
          is_active,
          team:teams(id, name),
          reservations:reservations(id, status, created_at)
        `)
        .eq('league_id', leagueId)
      break

    case 'revenue':
      query = supabase
        .from('payments')
        .select(`
          id,
          amount,
          status,
          created_at,
          stripe_subscription_id,
          reservation:reservations(
            id,
            date,
            field:fields(id, name, type)
          ),
          user:user_profiles(id, full_name, role)
        `)
        .eq('league_id', leagueId)
        .eq('status', 'completed')
      break

    case 'utilization':
      query = supabase
        .from('field_utilization_analytics')
        .select(`
          field_id,
          date,
          hour,
          utilization_rate,
          bookings_count,
          revenue,
          field:fields(id, name, type)
        `)
        .eq('league_id', leagueId)
      break

    default:
      throw new Error(`Unknown data source: ${dataSource}`)
  }

  // Apply date range filter
  if (dateRange && dateRange.from && dateRange.to) {
    const dateField = getDateFieldForDataSource(dataSource)
    query = query
      .gte(dateField, dateRange.from)
      .lte(dateField, dateRange.to)
  }

  // Apply custom filters
  if (filters && filters.length > 0) {
    filters.forEach(filter => {
      if (filter.field && filter.operator && filter.value) {
        query = applyFilter(query, filter)
      }
    })
  }

  return query
}

function getDateFieldForDataSource(dataSource: string): string {
  switch (dataSource) {
    case 'bookings':
      return 'date'
    case 'users':
      return 'created_at'
    case 'revenue':
      return 'created_at'
    case 'utilization':
      return 'date'
    default:
      return 'created_at'
  }
}

function applyFilter(query: any, filter: any) {
  const { field, operator, value } = filter

  switch (operator) {
    case 'equals':
      return query.eq(field, value)
    case 'not_equals':
      return query.neq(field, value)
    case 'contains':
      return query.ilike(field, `%${value}%`)
    case 'greater_than':
      return query.gt(field, value)
    case 'less_than':
      return query.lt(field, value)
    case 'between':
      if (Array.isArray(value) && value.length === 2) {
        return query.gte(field, value[0]).lte(field, value[1])
      }
      return query
    default:
      return query
  }
}

function applyGrouping(query: any, groupBy: string, metrics: string[]) {
  // This would need to be implemented based on your specific needs
  // For complex grouping, you might need to use raw SQL or post-process the data
  return query
}

function processReportData(data: any[], metrics: string[], dimensions: string[], config: any) {
  // Process the raw data based on the selected metrics and dimensions
  const processedData = data.map(row => {
    const processedRow: any = {}

    // Add dimension values
    dimensions.forEach(dimension => {
      processedRow[dimension] = extractDimensionValue(row, dimension)
    })

    // Calculate metric values
    metrics.forEach(metric => {
      processedRow[metric] = calculateMetricValue(row, metric, data, config)
    })

    return processedRow
  })

  // Group data if needed
  if (config.groupBy && config.groupBy !== 'none') {
    return groupDataBy(processedData, config.groupBy, metrics)
  }

  return processedData
}

function extractDimensionValue(row: any, dimension: string): any {
  switch (dimension) {
    case 'date':
      return row.date || row.created_at?.split('T')[0]
    case 'field_type':
      return row.field?.type || 'unknown'
    case 'field_name':
      return row.field?.name || 'unknown'
    case 'user_role':
      return row.user?.role || 'unknown'
    case 'team_name':
      return row.team?.name || 'unknown'
    case 'hour':
      return row.hour || new Date(row.start_time || row.created_at).getHours()
    case 'day_of_week':
      const date = new Date(row.date || row.created_at)
      return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()]
    case 'month':
      const monthDate = new Date(row.date || row.created_at)
      return monthDate.toLocaleString('default', { month: 'long', year: 'numeric' })
    default:
      return row[dimension]
  }
}

function calculateMetricValue(row: any, metric: string, allData: any[], config: any): number {
  switch (metric) {
    case 'total_revenue':
      return row.payment?.amount || row.amount || 0
    case 'total_bookings':
      return 1 // Each row represents one booking
    case 'unique_users':
      return 1 // Will be aggregated later if needed
    case 'avg_utilization':
      return row.utilization_rate || 0
    case 'cancellation_rate':
      return row.status === 'cancelled' ? 100 : 0
    case 'avg_session_duration':
      if (row.start_time && row.end_time) {
        const start = new Date(`2000-01-01T${row.start_time}`)
        const end = new Date(`2000-01-01T${row.end_time}`)
        return (end.getTime() - start.getTime()) / (1000 * 60) // minutes
      }
      return 0
    case 'conversion_rate':
      // This would need more complex calculation based on user journey data
      return 0
    case 'revenue_per_user':
      return row.payment?.amount || row.amount || 0
    default:
      return 0
  }
}

function groupDataBy(data: any[], groupBy: string, metrics: string[]) {
  const grouped = new Map()

  data.forEach(row => {
    const key = row[groupBy]
    if (!grouped.has(key)) {
      grouped.set(key, {
        [groupBy]: key,
        ...metrics.reduce((acc, metric) => {
          acc[metric] = 0
          acc[`${metric}_count`] = 0
          return acc
        }, {} as any)
      })
    }

    const group = grouped.get(key)
    metrics.forEach(metric => {
      if (metric === 'unique_users') {
        // For unique users, we'd need to track unique IDs
        group[metric] = (group[metric] || 0) + 1
      } else if (metric.includes('avg_') || metric.includes('rate')) {
        // For averages and rates, accumulate for later division
        group[metric] = ((group[metric] * group[`${metric}_count`]) + row[metric]) / (group[`${metric}_count`] + 1)
        group[`${metric}_count`] = group[`${metric}_count`] + 1
      } else {
        // For totals, just sum
        group[metric] = (group[metric] || 0) + row[metric]
      }
    })
  })

  // Clean up count fields
  const result = Array.from(grouped.values()).map(group => {
    const cleaned = { ...group }
    Object.keys(cleaned).forEach(key => {
      if (key.endsWith('_count')) {
        delete cleaned[key]
      }
    })
    return cleaned
  })

  return result
}