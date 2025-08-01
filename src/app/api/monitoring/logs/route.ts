import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as Sentry from '@sentry/nextjs';

export async function POST(request: NextRequest) {
  try {
    const { logs } = await request.json();
    
    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json(
        { error: 'Invalid logs data' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Get user session if available
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // Prepare logs for database insertion
    const dbLogs = logs.map(log => ({
      level: log.level,
      message: log.message,
      timestamp: log.timestamp,
      user_id: userId || log.context?.userId,
      session_id: log.context?.sessionId,
      request_id: log.context?.requestId,
      route: log.context?.route,
      method: log.context?.method,
      context: log.context,
      error_stack: log.error?.stack,
      error_message: log.error?.message,
    }));

    // Store logs in database
    const { error } = await supabase
      .from('application_logs')
      .insert(dbLogs);

    if (error) {
      throw error;
    }

    // Track log levels in Sentry
    const logCounts = logs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(logCounts).forEach(([level, count]) => {
      Sentry.metrics.increment(`logs.${level}`, count);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing logs:', error);
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to store logs' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get('level');
    const period = searchParams.get('period') || '24h';
    const route = searchParams.get('route');
    const userId = searchParams.get('userId');
    const search = searchParams.get('search');
    
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

    // Build query
    let query = supabase
      .from('application_logs')
      .select('*')
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1000);

    // Apply filters
    if (level) {
      query = query.eq('level', level);
    }
    
    if (route) {
      query = query.eq('route', route);
    }
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    if (search) {
      query = query.or(`message.ilike.%${search}%,error_message.ilike.%${search}%`);
    }

    const { data: logs, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate log statistics
    const stats = {
      total: logs.length,
      byLevel: logs.reduce((acc, log) => {
        acc[log.level] = (acc[log.level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      errorRate: logs.filter(log => ['error', 'fatal'].includes(log.level)).length / logs.length,
      topRoutes: getTopItems(logs, 'route', 10),
      topErrors: getTopErrors(logs, 10),
    };

    return NextResponse.json({
      period,
      stats,
      logs: logs.slice(0, 100), // Return first 100 logs
    });
  } catch (error) {
    console.error('Error retrieving logs:', error);
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to retrieve logs' },
      { status: 500 }
    );
  }
}

function getTopItems(logs: any[], field: string, limit: number): Record<string, number> {
  const counts: Record<string, number> = {};
  
  logs.forEach(log => {
    const value = log[field];
    if (value) {
      counts[value] = (counts[value] || 0) + 1;
    }
  });
  
  return Object.fromEntries(
    Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
  );
}

function getTopErrors(logs: any[], limit: number): Array<{ message: string; count: number }> {
  const errorCounts: Record<string, number> = {};
  
  logs
    .filter(log => log.error_message)
    .forEach(log => {
      errorCounts[log.error_message] = (errorCounts[log.error_message] || 0) + 1;
    });
  
  return Object.entries(errorCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([message, count]) => ({ message, count }));
}