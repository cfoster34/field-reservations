// Monitoring Configuration for Field Reservations

module.exports = {
  // Sentry Configuration
  sentry: {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: {
      browserTracing: true,
      replay: true,
      profiling: true,
    },
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'development',
  },

  // Web Vitals Thresholds
  webVitals: {
    CLS: { good: 0.1, poor: 0.25 },
    FCP: { good: 1800, poor: 3000 },
    FID: { good: 100, poor: 300 },
    INP: { good: 200, poor: 500 },
    LCP: { good: 2500, poor: 4000 },
    TTFB: { good: 800, poor: 1800 },
  },

  // Alert Rules
  alerts: {
    errorRate: {
      threshold: 0.05, // 5%
      window: 5, // minutes
      severity: 'high',
      channels: ['email', 'slack'],
    },
    responseTime: {
      threshold: 3000, // 3 seconds
      window: 10,
      severity: 'medium',
      channels: ['slack'],
    },
    slowQueries: {
      threshold: 10,
      window: 15,
      severity: 'medium',
      channels: ['email'],
    },
    failedPayments: {
      threshold: 5,
      window: 30,
      severity: 'critical',
      channels: ['email', 'sms', 'pagerduty'],
    },
    securityThreat: {
      threshold: 1,
      window: 1,
      severity: 'critical',
      channels: ['email', 'sms', 'pagerduty'],
    },
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    redactedFields: [
      'password',
      'token',
      'authorization',
      'cookie',
      'api_key',
      'secret',
      'credit_card',
      'ssn',
    ],
    retention: {
      webVitals: 30, // days
      rumData: 30,
      dbLogs: 7,
      applicationLogs: 14,
      alerts: 30,
    },
  },

  // Performance Monitoring
  performance: {
    slowQueryThreshold: 1000, // ms
    apiTimeout: 30000, // ms
    pageLoadBudget: 3000, // ms
  },

  // Real User Monitoring
  rum: {
    sampleRate: 1.0, // 100% in development, reduce in production
    trackInteractions: true,
    trackErrors: true,
    trackResources: true,
    sessionTimeout: 30, // minutes
  },

  // Integration Endpoints
  integrations: {
    slack: {
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
    },
    pagerduty: {
      integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
    },
    email: {
      recipients: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
      from: process.env.SENDGRID_FROM_EMAIL || 'alerts@field-reservations.com',
    },
    sms: {
      recipients: process.env.ALERT_SMS_RECIPIENTS?.split(',') || [],
    },
    webhook: {
      url: process.env.ALERT_WEBHOOK_URL,
    },
  },

  // Dashboard Configuration
  dashboard: {
    refreshInterval: 60000, // 1 minute
    defaultPeriod: '24h',
    maxDataPoints: 1000,
    chartColors: {
      primary: '#3B82F6',
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#EF4444',
      info: '#6366F1',
    },
  },

  // Deployment Pipeline Integration
  deployment: {
    sourceMapUpload: true,
    notifyOnDeploy: true,
    autoCreateRelease: true,
    trackDeployments: true,
  },
};