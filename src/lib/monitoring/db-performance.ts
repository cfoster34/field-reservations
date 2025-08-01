import * as Sentry from '@sentry/nextjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

interface QueryMetrics {
  query: string;
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
  duration: number;
  rowCount?: number;
  error?: boolean;
  timestamp: number;
}

interface QueryStats {
  totalQueries: number;
  totalDuration: number;
  slowQueries: number;
  errorQueries: number;
  queryByTable: Record<string, number>;
  queryByOperation: Record<string, number>;
}

class DatabasePerformanceMonitor {
  private metrics: QueryMetrics[] = [];
  private slowQueryThreshold = 1000; // 1 second
  private flushInterval = 60000; // 1 minute
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startFlushTimer();
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  trackQuery(metrics: QueryMetrics) {
    this.metrics.push(metrics);

    // Log slow queries
    if (metrics.duration > this.slowQueryThreshold) {
      logger.warn('Slow database query detected', {
        query: metrics.query,
        table: metrics.table,
        duration: metrics.duration,
        operation: metrics.operation,
      });

      // Send to Sentry
      Sentry.captureMessage('Slow database query', {
        level: 'warning',
        tags: {
          table: metrics.table,
          operation: metrics.operation,
        },
        extra: {
          query: metrics.query,
          duration: metrics.duration,
          rowCount: metrics.rowCount,
        },
      });
    }

    // Track metrics in Sentry
    Sentry.metrics.distribution('db.query_duration', metrics.duration, {
      tags: {
        table: metrics.table,
        operation: metrics.operation,
        error: metrics.error ? 'true' : 'false',
      },
    });

    if (metrics.rowCount !== undefined) {
      Sentry.metrics.distribution('db.row_count', metrics.rowCount, {
        tags: {
          table: metrics.table,
          operation: metrics.operation,
        },
      });
    }
  }

  getStats(): QueryStats {
    const stats: QueryStats = {
      totalQueries: this.metrics.length,
      totalDuration: 0,
      slowQueries: 0,
      errorQueries: 0,
      queryByTable: {},
      queryByOperation: {},
    };

    this.metrics.forEach(metric => {
      stats.totalDuration += metric.duration;
      
      if (metric.duration > this.slowQueryThreshold) {
        stats.slowQueries++;
      }
      
      if (metric.error) {
        stats.errorQueries++;
      }
      
      stats.queryByTable[metric.table] = (stats.queryByTable[metric.table] || 0) + 1;
      stats.queryByOperation[metric.operation] = (stats.queryByOperation[metric.operation] || 0) + 1;
    });

    return stats;
  }

  async flush() {
    if (this.metrics.length === 0) return;

    const stats = this.getStats();
    const metrics = [...this.metrics];
    this.metrics = [];

    try {
      // Send aggregated stats to monitoring endpoint
      await fetch('/api/monitoring/db-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats,
          metrics: metrics.slice(0, 100), // Send sample of queries
          timestamp: Date.now(),
        }),
      });
    } catch (error) {
      logger.error('Failed to send database performance metrics', { error });
      // Re-add metrics on failure
      this.metrics.unshift(...metrics);
    }
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

// Create singleton instance
const dbMonitor = new DatabasePerformanceMonitor();

// Supabase client wrapper with performance monitoring
export function createMonitoredSupabaseClient<T extends SupabaseClient>(
  client: T
): T {
  const handler: ProxyHandler<T> = {
    get(target, prop) {
      const value = target[prop as keyof T];
      
      // Intercept table methods
      if (typeof value === 'function' && ['from', 'rpc'].includes(String(prop))) {
        return new Proxy(value.bind(target), {
          apply(fn, thisArg, args) {
            const result = fn(...args);
            
            // Wrap query builder methods
            if (prop === 'from') {
              return wrapQueryBuilder(result, args[0]);
            } else if (prop === 'rpc') {
              return wrapRpcCall(result, args[0]);
            }
            
            return result;
          },
        });
      }
      
      return value;
    },
  };

  return new Proxy(client, handler);
}

function wrapQueryBuilder(queryBuilder: any, table: string): any {
  const operations = ['select', 'insert', 'update', 'delete'];
  
  const handler: ProxyHandler<any> = {
    get(target, prop) {
      const value = target[prop];
      
      if (typeof value === 'function' && operations.includes(String(prop))) {
        return new Proxy(value.bind(target), {
          apply(fn, thisArg, args) {
            const result = fn(...args);
            return wrapQuery(result, table, String(prop) as any);
          },
        });
      }
      
      return value;
    },
  };

  return new Proxy(queryBuilder, handler);
}

function wrapQuery(query: any, table: string, operation: QueryMetrics['operation']): any {
  const startTime = performance.now();
  
  // Wrap the query execution
  const originalThen = query.then.bind(query);
  
  query.then = function (onFulfilled?: any, onRejected?: any) {
    return originalThen(
      (result: any) => {
        const duration = performance.now() - startTime;
        
        dbMonitor.trackQuery({
          query: query.toString?.() || `${operation} ${table}`,
          table,
          operation,
          duration,
          rowCount: Array.isArray(result?.data) ? result.data.length : undefined,
          error: false,
          timestamp: Date.now(),
        });
        
        return onFulfilled?.(result) ?? result;
      },
      (error: any) => {
        const duration = performance.now() - startTime;
        
        dbMonitor.trackQuery({
          query: query.toString?.() || `${operation} ${table}`,
          table,
          operation,
          duration,
          error: true,
          timestamp: Date.now(),
        });
        
        if (onRejected) {
          return onRejected(error);
        }
        throw error;
      }
    );
  };
  
  return query;
}

function wrapRpcCall(rpcCall: any, functionName: string): any {
  const startTime = performance.now();
  
  const originalThen = rpcCall.then.bind(rpcCall);
  
  rpcCall.then = function (onFulfilled?: any, onRejected?: any) {
    return originalThen(
      (result: any) => {
        const duration = performance.now() - startTime;
        
        dbMonitor.trackQuery({
          query: `rpc ${functionName}`,
          table: functionName,
          operation: 'rpc',
          duration,
          error: false,
          timestamp: Date.now(),
        });
        
        return onFulfilled?.(result) ?? result;
      },
      (error: any) => {
        const duration = performance.now() - startTime;
        
        dbMonitor.trackQuery({
          query: `rpc ${functionName}`,
          table: functionName,
          operation: 'rpc',
          duration,
          error: true,
          timestamp: Date.now(),
        });
        
        if (onRejected) {
          return onRejected(error);
        }
        throw error;
      }
    );
  };
  
  return rpcCall;
}

// Export monitor instance for manual tracking
export { dbMonitor };

// Cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('exit', () => dbMonitor.destroy());
  process.on('SIGINT', () => dbMonitor.destroy());
  process.on('SIGTERM', () => dbMonitor.destroy());
}