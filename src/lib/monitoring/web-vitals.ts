import { onCLS, onFCP, onFID, onINP, onLCP, onTTFB, Metric } from 'web-vitals';
import * as Sentry from '@sentry/nextjs';

type VitalMetric = 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB';

interface WebVitalReport {
  id: string;
  name: VitalMetric;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
  url: string;
  timestamp: number;
}

// Thresholds for Web Vitals ratings
const VITAL_THRESHOLDS = {
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  FID: { good: 100, poor: 300 },
  INP: { good: 200, poor: 500 },
  LCP: { good: 2500, poor: 4000 },
  TTFB: { good: 800, poor: 1800 },
};

// Analytics endpoint for sending metrics
const ANALYTICS_ENDPOINT = '/api/monitoring/analytics';

class WebVitalsTracker {
  private queue: WebVitalReport[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isOnline: boolean = true;

  constructor() {
    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.flush();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }
  }

  private getRating(name: VitalMetric, value: number): 'good' | 'needs-improvement' | 'poor' {
    const thresholds = VITAL_THRESHOLDS[name];
    if (value <= thresholds.good) return 'good';
    if (value <= thresholds.poor) return 'needs-improvement';
    return 'poor';
  }

  private formatMetric(metric: Metric): WebVitalReport {
    return {
      id: metric.id,
      name: metric.name as VitalMetric,
      value: Math.round(metric.value),
      rating: this.getRating(metric.name as VitalMetric, metric.value),
      delta: Math.round(metric.delta),
      navigationType: metric.navigationType || 'unknown',
      url: window.location.href,
      timestamp: Date.now(),
    };
  }

  track(metric: Metric) {
    const report = this.formatMetric(metric);
    
    // Send to Sentry as a custom measurement
    Sentry.getCurrentHub().getClient()?.recordMetric({
      key: `web-vital.${metric.name.toLowerCase()}`,
      value: metric.value,
      unit: metric.name === 'CLS' ? 'score' : 'millisecond',
      tags: {
        rating: report.rating,
        navigationType: report.navigationType,
      },
    });

    // Add to queue for batch sending
    this.queue.push(report);

    // Schedule flush
    this.scheduleFlush();

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Web Vital] ${metric.name}:`, {
        value: report.value,
        rating: report.rating,
        delta: report.delta,
      });
    }
  }

  private scheduleFlush() {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, 5000); // Flush every 5 seconds
  }

  private async flush() {
    if (this.queue.length === 0 || !this.isOnline) return;

    const metrics = [...this.queue];
    this.queue = [];
    this.flushTimer = null;

    try {
      await fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics }),
        keepalive: true, // Ensure request completes even if page unloads
      });
    } catch (error) {
      // Re-add metrics to queue on failure
      this.queue.unshift(...metrics);
      console.error('Failed to send web vitals:', error);
    }
  }

  // Force flush on page unload
  forceFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

// Create singleton instance
const tracker = new WebVitalsTracker();

// Initialize Web Vitals tracking
export function initWebVitals() {
  if (typeof window === 'undefined') return;

  // Track all Web Vitals
  onCLS((metric) => tracker.track(metric));
  onFCP((metric) => tracker.track(metric));
  onFID((metric) => tracker.track(metric));
  onINP((metric) => tracker.track(metric));
  onLCP((metric) => tracker.track(metric));
  onTTFB((metric) => tracker.track(metric));

  // Flush metrics on page unload
  window.addEventListener('beforeunload', () => {
    tracker.forceFlush();
  });

  // Also flush on visibility change (mobile browsers)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      tracker.forceFlush();
    }
  });
}

// Export for manual tracking
export function trackCustomMetric(name: string, value: number, unit: string = 'millisecond') {
  Sentry.getCurrentHub().getClient()?.recordMetric({
    key: `custom.${name}`,
    value,
    unit,
    tags: {
      source: 'manual',
    },
  });
}

// Helper to measure component render time
export function measureComponentPerformance(componentName: string) {
  const startTime = performance.now();
  
  return () => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    trackCustomMetric(`component.${componentName}.render`, duration);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Component Performance] ${componentName}: ${duration.toFixed(2)}ms`);
    }
  };
}