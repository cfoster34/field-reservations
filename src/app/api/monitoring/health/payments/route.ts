import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';

export async function GET() {
  const startTime = Date.now();
  
  try {
    // Test Stripe connectivity by retrieving balance
    const balance = await stripe.balance.retrieve();
    
    const isHealthy = balance && typeof balance.available !== 'undefined';
    
    return NextResponse.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      details: {
        provider: 'stripe',
        connected: isHealthy,
        livemode: balance?.livemode || false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        details: {
          provider: 'stripe',
          connected: false,
        },
      },
      { status: 503 }
    );
  }
}