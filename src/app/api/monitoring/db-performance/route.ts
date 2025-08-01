import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as Sentry from '@sentry/nextjs';

export async function POST(request: NextRequest) {
  try {
    const { stats, metrics, timestamp } = await request.json();
    
    if (!stats || !metrics) {
      return NextResponse.json(
        { error: 'Invalid performance data' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Store aggregated stats
    const { error: statsError } = await supabase
      .from('db_performance_stats')
      .insert({
        total_queries: stats.totalQueries,
        total_duration: stats.totalDuration,
        avg_duration: stats.totalQueries > 0 ? stats.totalDuration / stats.totalQueries : 0,
        slow_queries: stats.slowQueries,
        error_queries: stats.errorQueries,
        query_by_table: stats.queryByTable,
        query_by_operation: stats.queryByOperation,
        timestamp: new Date(timestamp).toISOString(),
      });

    if (statsError) {
      console.error('Error storing DB performance stats:', statsError);
    }

    // Store sample of individual queries for analysis
    if (metrics.length > 0) {
      const queryLogs = metrics.map((metric: any) => ({
        query: metric.query.substring(0, 500), // Truncate long queries
        table_name: metric.table,
        operation: metric.operation,
        duration: metric.duration,
        row_count: metric.rowCount,
        is_error: metric.error || false,
        is_slow: metric.duration > 1000,
        timestamp: new Date(metric.timestamp).toISOString(),
      }));

      const { error: logsError } = await supabase
        .from('db_query_logs')
        .insert(queryLogs);

      if (logsError) {
        console.error('Error storing query logs:', logsError);
      }
    }

    // Send alerts for concerning patterns
    if (stats.errorQueries > 10 || stats.slowQueries > 20) {
      Sentry.captureMessage('High number of problematic database queries', {
        level: 'warning',
        extra: {
          errorQueries: stats.errorQueries,
          slowQueries: stats.slowQueries,
          totalQueries: stats.totalQueries,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing DB performance data:', error);
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to process performance data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || '24h';
    const table = searchParams.get('table');
    
    const supabase = await createClient();
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '1h':
        startDate.setHours(now.getHours() - 1);
        break;
      case '24h':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
    }

    // Get performance stats
    const { data: stats, error: statsError } = await supabase
      .from('db_performance_stats')
      .select('*')
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: false });

    if (statsError) throw statsError;

    // Get slow queries
    let slowQueriesQuery = supabase
      .from('db_query_logs')
      .select('*')
      .eq('is_slow', true)
      .gte('timestamp', startDate.toISOString())
      .order('duration', { ascending: false })
      .limit(50);

    if (table) {
      slowQueriesQuery = slowQueriesQuery.eq('table_name', table);
    }

    const { data: slowQueries, error: slowError } = await slowQueriesQuery;

    if (slowError) throw slowError;

    // Calculate aggregated metrics
    const aggregated = {
      totalQueries: stats.reduce((sum, s) => sum + (s.total_queries || 0), 0),
      totalDuration: stats.reduce((sum, s) => sum + (s.total_duration || 0), 0),
      avgDuration: 0,
      slowQueryCount: stats.reduce((sum, s) => sum + (s.slow_queries || 0), 0),
      errorQueryCount: stats.reduce((sum, s) => sum + (s.error_queries || 0), 0),
      queryByTable: {},
      queryByOperation: {},
    };

    // Aggregate by table and operation
    stats.forEach(stat => {
      if (stat.query_by_table) {
        Object.entries(stat.query_by_table).forEach(([table, count]) => {
          aggregated.queryByTable[table] = 
            (aggregated.queryByTable[table] || 0) + (count as number);
        });
      }
      
      if (stat.query_by_operation) {
        Object.entries(stat.query_by_operation).forEach(([op, count]) => {
          aggregated.queryByOperation[op] = 
            (aggregated.queryByOperation[op] || 0) + (count as number);
        });
      }
    });

    aggregated.avgDuration = aggregated.totalQueries > 0 
      ? aggregated.totalDuration / aggregated.totalQueries 
      : 0;

    return NextResponse.json({
      period,
      aggregated,
      slowQueries,
      recentStats: stats.slice(0, 10),
    });
  } catch (error) {
    console.error('Error retrieving DB performance data:', error);
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to retrieve performance data' },
      { status: 500 }
    );
  }
}