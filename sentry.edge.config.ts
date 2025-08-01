import * as Sentry from '@sentry/nextjs';

// Initialize Sentry for edge runtime (middleware)
Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Environment configuration
  environment: process.env.NEXT_PUBLIC_ENV || 'development',
  
  // Enable debug mode in development
  debug: process.env.NODE_ENV === 'development',
  
  // Set sample rate for performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Before send hook for additional filtering and data enrichment
  beforeSend(event, hint) {
    // Add edge runtime context
    event.contexts = {
      ...event.contexts,
      runtime: {
        name: 'edge',
      },
    };
    
    // Add custom tags
    event.tags = {
      ...event.tags,
      source: 'edge',
      deployment_id: process.env.VERCEL_DEPLOYMENT_ID,
    };
    
    return event;
  },
});

// Export Sentry for custom error reporting
export { Sentry };