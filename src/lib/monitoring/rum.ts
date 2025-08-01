import * as Sentry from '@sentry/nextjs';

interface UserAction {
  type: 'click' | 'input' | 'scroll' | 'navigation' | 'error';
  target: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface PageMetrics {
  url: string;
  loadTime: number;
  renderTime: number;
  interactiveTime: number;
  resourceCount: number;
  resourceSize: number;
  errorCount: number;
}

interface UserSession {
  id: string;
  startTime: number;
  endTime?: number;
  pageViews: number;
  actions: UserAction[];
  metrics: PageMetrics[];
  device: {
    type: string;
    viewport: string;
    screen: string;
    userAgent: string;
  };
}

class RealUserMonitoring {
  private session: UserSession;
  private actionQueue: UserAction[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private observers: {
    performance?: PerformanceObserver;
    mutation?: MutationObserver;
    error?: any;
  } = {};

  constructor() {
    this.session = this.initializeSession();
    this.setupObservers();
    this.trackPageMetrics();
  }

  private initializeSession(): UserSession {
    const sessionId = window.__monitoring_session_id || this.generateSessionId();
    
    return {
      id: sessionId,
      startTime: Date.now(),
      pageViews: 0,
      actions: [],
      metrics: [],
      device: {
        type: this.getDeviceType(),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        screen: `${screen.width}x${screen.height}`,
        userAgent: navigator.userAgent,
      },
    };
  }

  private generateSessionId(): string {
    return `rum-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private getDeviceType(): string {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  private setupObservers() {
    // Performance Observer for resource timing
    if ('PerformanceObserver' in window) {
      this.observers.performance = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            this.trackResource(entry as PerformanceResourceTiming);
          } else if (entry.entryType === 'largest-contentful-paint') {
            this.trackLCP(entry);
          }
        }
      });

      this.observers.performance.observe({ 
        entryTypes: ['resource', 'largest-contentful-paint'] 
      });
    }

    // Click tracking
    document.addEventListener('click', this.handleClick.bind(this), true);

    // Input tracking (for form interactions)
    document.addEventListener('input', this.handleInput.bind(this), true);

    // Scroll tracking (throttled)
    let scrollTimer: NodeJS.Timeout;
    document.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        this.handleScroll();
      }, 500);
    }, true);

    // Error tracking
    window.addEventListener('error', this.handleError.bind(this), true);
    window.addEventListener('unhandledrejection', this.handleRejection.bind(this), true);

    // Page visibility tracking
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

    // Navigation tracking
    if ('navigation' in window.performance) {
      this.trackNavigation();
    }
  }

  private trackPageMetrics() {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    if (navigation) {
      const metrics: PageMetrics = {
        url: window.location.href,
        loadTime: navigation.loadEventEnd - navigation.fetchStart,
        renderTime: navigation.domContentLoadedEventEnd - navigation.fetchStart,
        interactiveTime: navigation.domInteractive - navigation.fetchStart,
        resourceCount: 0,
        resourceSize: 0,
        errorCount: 0,
      };

      // Count resources
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      metrics.resourceCount = resources.length;
      metrics.resourceSize = resources.reduce((total, resource) => {
        return total + (resource.transferSize || 0);
      }, 0);

      this.session.metrics.push(metrics);
      this.session.pageViews++;

      // Send to Sentry
      Sentry.setContext('rum_metrics', metrics);
    }
  }

  private trackResource(resource: PerformanceResourceTiming) {
    if (resource.duration > 1000) { // Track slow resources
      Sentry.addBreadcrumb({
        category: 'resource',
        message: `Slow resource: ${resource.name}`,
        level: 'warning',
        data: {
          duration: resource.duration,
          size: resource.transferSize,
          type: resource.initiatorType,
        },
      });
    }
  }

  private trackLCP(entry: PerformanceEntry) {
    Sentry.setMeasurement('lcp', entry.startTime, 'millisecond');
  }

  private handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const action: UserAction = {
      type: 'click',
      target: this.getElementSelector(target),
      timestamp: Date.now(),
      metadata: {
        text: target.textContent?.substring(0, 50),
        href: (target as HTMLAnchorElement).href,
      },
    };

    this.trackAction(action);
  }

  private handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const action: UserAction = {
      type: 'input',
      target: this.getElementSelector(target),
      timestamp: Date.now(),
      metadata: {
        fieldName: target.name,
        fieldType: target.type,
      },
    };

    this.trackAction(action);
  }

  private handleScroll() {
    const scrollPercentage = Math.round(
      (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
    );

    const action: UserAction = {
      type: 'scroll',
      target: 'window',
      timestamp: Date.now(),
      metadata: {
        percentage: scrollPercentage,
        position: window.scrollY,
      },
    };

    this.trackAction(action);
  }

  private handleError(event: ErrorEvent) {
    const action: UserAction = {
      type: 'error',
      target: event.filename || 'unknown',
      timestamp: Date.now(),
      metadata: {
        message: event.message,
        line: event.lineno,
        column: event.colno,
      },
    };

    this.trackAction(action);
    
    // Increment error count
    const currentMetrics = this.session.metrics[this.session.metrics.length - 1];
    if (currentMetrics) {
      currentMetrics.errorCount++;
    }
  }

  private handleRejection(event: PromiseRejectionEvent) {
    const action: UserAction = {
      type: 'error',
      target: 'promise',
      timestamp: Date.now(),
      metadata: {
        reason: event.reason?.toString(),
      },
    };

    this.trackAction(action);
  }

  private handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      this.flush();
    }
  }

  private trackNavigation() {
    const action: UserAction = {
      type: 'navigation',
      target: window.location.pathname,
      timestamp: Date.now(),
      metadata: {
        referrer: document.referrer,
        type: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type,
      },
    };

    this.trackAction(action);
  }

  private getElementSelector(element: HTMLElement): string {
    const id = element.id ? `#${element.id}` : '';
    const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
    const tag = element.tagName.toLowerCase();
    
    return `${tag}${id}${classes}`;
  }

  private trackAction(action: UserAction) {
    this.actionQueue.push(action);
    this.session.actions.push(action);

    // Send breadcrumb to Sentry
    Sentry.addBreadcrumb({
      category: 'user-action',
      message: `${action.type} on ${action.target}`,
      level: 'info',
      data: action.metadata,
    });

    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, 10000); // Flush every 10 seconds
  }

  private async flush() {
    if (this.actionQueue.length === 0) return;

    const actions = [...this.actionQueue];
    this.actionQueue = [];
    this.flushTimer = null;

    try {
      await fetch('/api/monitoring/rum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.session.id,
          actions,
          device: this.session.device,
          metrics: this.session.metrics[this.session.metrics.length - 1],
        }),
        keepalive: true,
      });
    } catch (error) {
      console.error('Failed to send RUM data:', error);
      // Re-add actions to queue
      this.actionQueue.unshift(...actions);
    }
  }

  destroy() {
    // Clean up observers and event listeners
    this.observers.performance?.disconnect();
    this.observers.mutation?.disconnect();
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    // Final flush
    this.session.endTime = Date.now();
    this.flush();
  }
}

let rumInstance: RealUserMonitoring | null = null;

export function initRUM() {
  if (typeof window === 'undefined' || rumInstance) return;
  
  rumInstance = new RealUserMonitoring();

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    rumInstance?.destroy();
  });
}

// Export for manual tracking
export function trackUserAction(type: string, metadata?: Record<string, any>) {
  if (!rumInstance) return;

  const action: UserAction = {
    type: 'navigation', // Use navigation as a generic type
    target: type,
    timestamp: Date.now(),
    metadata,
  };

  rumInstance['trackAction'](action);
}