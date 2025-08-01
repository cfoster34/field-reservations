import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as Sentry from '@sentry/nextjs';

export async function POST(request: NextRequest) {
  try {
    const { sessionId, actions, device, metrics } = await request.json();
    
    if (!sessionId || !Array.isArray(actions)) {
      return NextResponse.json(
        { error: 'Invalid RUM data' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Get user session if available
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // Store RUM session data
    const { error: sessionError } = await supabase
      .from('rum_sessions')
      .upsert({
        id: sessionId,
        user_id: userId,
        device_type: device?.type,
        viewport: device?.viewport,
        screen_resolution: device?.screen,
        user_agent: device?.userAgent,
        page_views: metrics?.pageViews || 1,
        error_count: metrics?.errorCount || 0,
        updated_at: new Date().toISOString(),
      });

    if (sessionError) {
      console.error('Error storing RUM session:', sessionError);
    }

    // Store user actions
    if (actions.length > 0) {
      const dbActions = actions.map(action => ({
        session_id: sessionId,
        user_id: userId,
        action_type: action.type,
        target: action.target,
        timestamp: new Date(action.timestamp).toISOString(),
        metadata: action.metadata,
      }));

      const { error: actionsError } = await supabase
        .from('rum_actions')
        .insert(dbActions);

      if (actionsError) {
        console.error('Error storing RUM actions:', actionsError);
      }
    }

    // Store page metrics if provided
    if (metrics) {
      const { error: metricsError } = await supabase
        .from('rum_page_metrics')
        .insert({
          session_id: sessionId,
          user_id: userId,
          url: metrics.url,
          load_time: metrics.loadTime,
          render_time: metrics.renderTime,
          interactive_time: metrics.interactiveTime,
          resource_count: metrics.resourceCount,
          resource_size: metrics.resourceSize,
          error_count: metrics.errorCount,
          timestamp: new Date().toISOString(),
        });

      if (metricsError) {
        console.error('Error storing page metrics:', metricsError);
      }
    }

    // Send aggregated metrics to Sentry
    if (metrics) {
      Sentry.metrics.distribution('rum.page_load_time', metrics.loadTime, {
        tags: { device_type: device?.type },
      });
      Sentry.metrics.distribution('rum.resource_count', metrics.resourceCount);
      Sentry.metrics.increment('rum.page_views', 1);
    }

    // Track action types
    const actionCounts = actions.reduce((acc, action) => {
      acc[action.type] = (acc[action.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(actionCounts).forEach(([type, count]) => {
      Sentry.metrics.increment(`rum.actions.${type}`, count);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing RUM data:', error);
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to process RUM data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');
    const period = searchParams.get('period') || '24h';
    
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

    if (sessionId) {
      // Get specific session data
      const { data: session, error: sessionError } = await supabase
        .from('rum_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      const { data: actions, error: actionsError } = await supabase
        .from('rum_actions')
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: true });

      if (actionsError) throw actionsError;

      const { data: metrics, error: metricsError } = await supabase
        .from('rum_page_metrics')
        .select('*')
        .eq('session_id', sessionId);

      if (metricsError) throw metricsError;

      return NextResponse.json({
        session,
        actions,
        metrics,
      });
    } else {
      // Get aggregated data
      const { data: sessions, error: sessionsError } = await supabase
        .from('rum_sessions')
        .select('*')
        .gte('updated_at', startDate.toISOString());

      if (sessionsError) throw sessionsError;

      const { data: actionStats, error: actionStatsError } = await supabase
        .from('rum_actions')
        .select('action_type')
        .gte('timestamp', startDate.toISOString());

      if (actionStatsError) throw actionStatsError;

      // Calculate statistics
      const stats = {
        totalSessions: sessions.length,
        uniqueUsers: new Set(sessions.map(s => s.user_id).filter(Boolean)).size,
        avgPageViews: sessions.reduce((sum, s) => sum + (s.page_views || 0), 0) / sessions.length,
        avgErrorCount: sessions.reduce((sum, s) => sum + (s.error_count || 0), 0) / sessions.length,
        deviceTypes: sessions.reduce((acc, s) => {
          acc[s.device_type || 'unknown'] = (acc[s.device_type || 'unknown'] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        actionTypes: actionStats.reduce((acc, a) => {
          acc[a.action_type] = (acc[a.action_type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      return NextResponse.json({
        period,
        stats,
        sessions: sessions.slice(0, 100), // Return latest 100 sessions
      });
    }
  } catch (error) {
    console.error('Error retrieving RUM data:', error);
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to retrieve RUM data' },
      { status: 500 }
    );
  }
}