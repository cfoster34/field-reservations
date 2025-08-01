import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as Sentry from '@sentry/nextjs';

export async function POST(request: NextRequest) {
  try {
    const { metrics } = await request.json();
    
    if (!Array.isArray(metrics) || metrics.length === 0) {
      return NextResponse.json(
        { error: 'Invalid metrics data' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Get user session if available
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // Prepare metrics for database insertion
    const dbMetrics = metrics.map(metric => ({
      user_id: userId,
      metric_name: metric.name,
      metric_value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      navigation_type: metric.navigationType,
      url: metric.url,
      timestamp: new Date(metric.timestamp).toISOString(),
      session_id: request.headers.get('x-session-id') || null,
      user_agent: request.headers.get('user-agent') || null,
    }));

    // Store metrics in database
    const { error } = await supabase
      .from('web_vitals')
      .insert(dbMetrics);

    if (error) {
      throw error;
    }

    // Also send aggregated data to Sentry for monitoring
    metrics.forEach(metric => {
      Sentry.metrics.distribution(
        `web_vitals.${metric.name.toLowerCase()}`,
        metric.value,
        {
          tags: {
            rating: metric.rating,
            navigation_type: metric.navigationType,
          },
        }
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing web vitals:', error);
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to store metrics' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || '24h';
    const metric = searchParams.get('metric') || 'all';
    
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
      default:
        startDate.setDate(now.getDate() - 1);
    }

    let query = supabase
      .from('web_vitals')
      .select('*')
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: false });

    if (metric !== 'all') {
      query = query.eq('metric_name', metric);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate aggregated statistics
    const stats = data.reduce((acc, record) => {
      const metricName = record.metric_name;
      
      if (!acc[metricName]) {
        acc[metricName] = {
          count: 0,
          sum: 0,
          good: 0,
          needsImprovement: 0,
          poor: 0,
          values: [],
        };
      }
      
      acc[metricName].count += 1;
      acc[metricName].sum += record.metric_value;
      acc[metricName].values.push(record.metric_value);
      
      switch (record.rating) {
        case 'good':
          acc[metricName].good += 1;
          break;
        case 'needs-improvement':
          acc[metricName].needsImprovement += 1;
          break;
        case 'poor':
          acc[metricName].poor += 1;
          break;
      }
      
      return acc;
    }, {});

    // Calculate percentiles and averages
    const aggregated = Object.entries(stats).map(([metric, data]: [string, any]) => {
      const sorted = data.values.sort((a: number, b: number) => a - b);
      const p75Index = Math.floor(sorted.length * 0.75);
      const p90Index = Math.floor(sorted.length * 0.90);
      const p99Index = Math.floor(sorted.length * 0.99);
      
      return {
        metric,
        count: data.count,
        average: Math.round(data.sum / data.count),
        p75: sorted[p75Index] || 0,
        p90: sorted[p90Index] || 0,
        p99: sorted[p99Index] || 0,
        distribution: {
          good: (data.good / data.count) * 100,
          needsImprovement: (data.needsImprovement / data.count) * 100,
          poor: (data.poor / data.count) * 100,
        },
      };
    });

    return NextResponse.json({
      period,
      metrics: aggregated,
      totalRecords: data.length,
    });
  } catch (error) {
    console.error('Error retrieving web vitals:', error);
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to retrieve metrics' },
      { status: 500 }
    );
  }
}