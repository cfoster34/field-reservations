import * as Sentry from '@sentry/nextjs';

// Initialize Sentry for server-side error tracking
Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Environment configuration
  environment: process.env.NEXT_PUBLIC_ENV || 'development',
  
  // Enable debug mode in development
  debug: process.env.NODE_ENV === 'development',
  
  // Set sample rate for performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Integrations
  integrations: [
    // HTTP integration for automatic request/response tracking
    new Sentry.Integrations.Http({ tracing: true }),
  ],
  
  // Filter out specific errors
  ignoreErrors: [
    // Common non-critical errors
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
  ],
  
  // Before send hook for additional filtering and data enrichment
  beforeSend(event, hint) {
    // Remove sensitive data from request headers
    if (event.request?.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.authorization;
      delete event.request.headers['x-api-key'];
    }
    
    // Add server context
    event.contexts = {
      ...event.contexts,
      runtime: {
        name: 'node',
        version: process.version,
      },
      server: {
        host: process.env.VERCEL_URL || 'localhost',
        region: process.env.VERCEL_REGION || 'local',
      },
    };
    
    // Add custom tags
    event.tags = {
      ...event.tags,
      source: 'server',
      deployment_id: process.env.VERCEL_DEPLOYMENT_ID,
    };
    
    return event;
  },
  
  // Transport options
  transportOptions: {
    // Keep events for retry
    keepalive: true,
  },
});

// Export Sentry for custom error reporting
export { Sentry };