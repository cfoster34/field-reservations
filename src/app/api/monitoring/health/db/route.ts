import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const startTime = Date.now();
  
  try {
    const supabase = await createClient();
    
    // Test basic connectivity
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1)
      .single();
    
    if (error) {
      throw error;
    }
    
    // Test write capability
    const { error: writeError } = await supabase
      .from('audit_logs')
      .insert({
        user_id: 'system',
        action: 'health_check',
        details: { timestamp: new Date().toISOString() },
      });
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'healthy',
      responseTime,
      timestamp: new Date().toISOString(),
      details: {
        canRead: !error,
        canWrite: !writeError,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}