import * as Sentry from '@sentry/nextjs';

// Initialize Sentry for client-side error tracking
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Environment configuration
  environment: process.env.NEXT_PUBLIC_ENV || 'development',
  
  // Enable debug mode in development
  debug: process.env.NODE_ENV === 'development',
  
  // Set sample rate for performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Session replay configuration
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  
  // Integrations
  integrations: [
    new Sentry.BrowserTracing({
      // Set up automatic route change tracking in Next.js
      routingInstrumentation: Sentry.nextRouterInstrumentation,
    }),
    new Sentry.Replay({
      // Mask all text content by default for privacy
      maskAllText: true,
      maskAllInputs: true,
      // Capture network bodies for debugging
      networkDetailAllowUrls: [window.location.origin],
    }),
  ],
  
  // Filter out specific errors
  ignoreErrors: [
    // Browser extensions
    'top.GLOBALS',
    // Random network errors
    'Network request failed',
    'NetworkError',
    'Failed to fetch',
    // Safari specific errors
    'Non-Error promise rejection captured',
    // React hydration errors in development
    'Hydration failed',
    'There was an error while hydrating',
  ],
  
  // Before send hook for additional filtering and data enrichment
  beforeSend(event, hint) {
    // Add user context if available
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          event.user = {
            id: user.id,
            email: user.email,
            username: user.name,
          };
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
    
    // Filter out certain errors based on message
    if (event.exception?.values?.[0]?.value?.includes('ResizeObserver')) {
      return null;
    }
    
    // Add custom tags
    event.tags = {
      ...event.tags,
      browser: getBrowserInfo(),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    };
    
    return event;
  },
  
  // Transport options
  transportOptions: {
    // Keep events for retry
    keepalive: true,
  },
});

// Helper function to get browser info
function getBrowserInfo(): string {
  const ua = navigator.userAgent;
  if (ua.indexOf('Chrome') > -1) return 'Chrome';
  if (ua.indexOf('Safari') > -1) return 'Safari';
  if (ua.indexOf('Firefox') > -1) return 'Firefox';
  if (ua.indexOf('Edge') > -1) return 'Edge';
  return 'Unknown';
}

// Export Sentry for custom error reporting
export { Sentry };