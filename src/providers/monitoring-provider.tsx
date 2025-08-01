'use client';

import { useEffect } from 'react';
import { initWebVitals } from '@/lib/monitoring/web-vitals';
import { initRUM } from '@/lib/monitoring/rum';
import { usePathname } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';

export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Initialize Web Vitals tracking
    initWebVitals();

    // Initialize Real User Monitoring
    initRUM();

    // Generate session ID for tracking
    const sessionId = generateSessionId();
    if (typeof window !== 'undefined') {
      window.__monitoring_session_id = sessionId;
    }
  }, []);

  useEffect(() => {
    // Track page views
    Sentry.metrics.increment('page_view', 1, {
      tags: {
        path: pathname,
      },
    });
  }, [pathname]);

  return <>{children}</>;
}

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Extend window interface
declare global {
  interface Window {
    __monitoring_session_id: string;
  }
}