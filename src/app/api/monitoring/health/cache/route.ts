import { NextResponse } from 'next/server';

// Simple in-memory cache for health checks
const testCache = new Map<string, any>();

export async function GET() {
  const startTime = Date.now();
  const testKey = 'health-check-test';
  const testValue = { timestamp: new Date().toISOString(), random: Math.random() };
  
  try {
    // Test write
    testCache.set(testKey, testValue);
    
    // Test read
    const retrieved = testCache.get(testKey);
    
    // Test delete
    testCache.delete(testKey);
    
    const isHealthy = retrieved && 
      retrieved.timestamp === testValue.timestamp && 
      retrieved.random === testValue.random;
    
    return NextResponse.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      details: {
        canWrite: true,
        canRead: !!retrieved,
        canDelete: !testCache.has(testKey),
        cacheSize: testCache.size,
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