import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const startTime = Date.now();
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '0.1.0',
    checks: {
      api: 'healthy',
      database: 'checking',
      cache: 'checking',
      payments: 'checking',
    },
    metrics: {
      responseTime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    },
  };

  try {
    // Check database connectivity
    const supabase = await createClient();
    const { error: dbError } = await supabase
      .from('users')
      .select('count')
      .limit(1)
      .single();

    health.checks.database = dbError ? 'unhealthy' : 'healthy';

    // Cache check would go here
    health.checks.cache = 'healthy'; // Placeholder

    // Payment provider check would go here
    health.checks.payments = 'healthy'; // Placeholder

    // Determine overall health
    const unhealthyChecks = Object.values(health.checks).filter(
      (status) => status !== 'healthy'
    );
    
    if (unhealthyChecks.length > 0) {
      health.status = 'degraded';
    }

    health.metrics.responseTime = Date.now() - startTime;

    return NextResponse.json(health, {
      status: health.status === 'healthy' ? 200 : 503,
    });
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.api = 'unhealthy';
    health.metrics.responseTime = Date.now() - startTime;

    return NextResponse.json(health, { status: 503 });
  }
}