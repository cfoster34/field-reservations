import pino from 'pino';
import * as Sentry from '@sentry/nextjs';

// Log levels
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

interface LogContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  route?: string;
  method?: string;
  [key: string]: any;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: Error;
}

class Logger {
  private pinoLogger: pino.Logger;
  private logQueue: LogEntry[] = [];
  private flushInterval = 30000; // 30 seconds
  private flushTimer: NodeJS.Timeout | null = null;
  private maxQueueSize = 1000;

  constructor() {
    // Configure Pino logger
    this.pinoLogger = pino({
      level: process.env.LOG_LEVEL || 'info',
      formatters: {
        level: (label) => ({ level: label }),
        bindings: () => ({}),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          'password',
          'token',
          'authorization',
          'cookie',
          'api_key',
          'secret',
          'credit_card',
          'ssn',
        ],
        censor: '[REDACTED]',
      },
      // Pretty print in development
      ...(process.env.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }),
    });

    this.startFlushTimer();
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = Object.values(LogLevel);
    const currentLevelIndex = levels.indexOf(this.pinoLogger.level as LogLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private async sendToSentry(level: LogLevel, message: string, context?: LogContext, error?: Error) {
    // Only send warnings and above to Sentry
    if (['warn', 'error', 'fatal'].includes(level)) {
      if (error) {
        Sentry.captureException(error, {
          level: level === 'warn' ? 'warning' : level as any,
          extra: context,
        });
      } else {
        Sentry.captureMessage(message, {
          level: level === 'warn' ? 'warning' : level as any,
          extra: context,
        });
      }
    }

    // Add as breadcrumb for all levels
    Sentry.addBreadcrumb({
      category: 'log',
      message,
      level: level as any,
      data: context,
    });
  }

  private async log(level: LogLevel, message: string, context?: LogContext, error?: Error) {
    if (!this.shouldLog(level)) return;

    // Log with Pino
    const logData = { ...context, error: error?.stack };
    this.pinoLogger[level](logData, message);

    // Send to Sentry
    await this.sendToSentry(level, message, context, error);

    // Add to queue for batch sending
    const entry = this.formatMessage(level, message, context);
    if (error) entry.error = error;
    
    this.logQueue.push(entry);

    // Flush if queue is getting large
    if (this.logQueue.length >= this.maxQueueSize) {
      this.flush();
    }
  }

  trace(message: string, context?: LogContext) {
    this.log(LogLevel.TRACE, message, context);
  }

  debug(message: string, context?: LogContext) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, contextOrError?: LogContext | Error, error?: Error) {
    if (contextOrError instanceof Error) {
      this.log(LogLevel.ERROR, message, undefined, contextOrError);
    } else {
      this.log(LogLevel.ERROR, message, contextOrError, error);
    }
  }

  fatal(message: string, contextOrError?: LogContext | Error, error?: Error) {
    if (contextOrError instanceof Error) {
      this.log(LogLevel.FATAL, message, undefined, contextOrError);
    } else {
      this.log(LogLevel.FATAL, message, contextOrError, error);
    }
  }

  // Create a child logger with additional context
  child(context: LogContext): Logger {
    const childLogger = Object.create(this);
    childLogger.defaultContext = { ...this.defaultContext, ...context };
    return childLogger;
  }

  private defaultContext?: LogContext;

  // Manually flush logs
  async flush() {
    if (this.logQueue.length === 0) return;

    const logs = [...this.logQueue];
    this.logQueue = [];

    try {
      // Send logs to monitoring endpoint
      await fetch('/api/monitoring/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs }),
        keepalive: true,
      });
    } catch (error) {
      console.error('Failed to send logs:', error);
      // Re-add logs to queue on failure (with limit)
      if (this.logQueue.length < this.maxQueueSize) {
        this.logQueue.unshift(...logs.slice(0, this.maxQueueSize - this.logQueue.length));
      }
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

// Create singleton logger instance
export const logger = new Logger();

// Request-scoped logger factory
export function createRequestLogger(context: LogContext): Logger {
  return logger.child(context);
}

// Performance logging utilities
export function logPerformance(operation: string, duration: number, context?: LogContext) {
  const level = duration > 1000 ? LogLevel.WARN : LogLevel.INFO;
  logger[level](`${operation} completed in ${duration}ms`, {
    ...context,
    duration,
    operation,
  });
}

// Structured logging helpers
export function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  context?: LogContext
) {
  const level = statusCode >= 500 ? LogLevel.ERROR : 
                statusCode >= 400 ? LogLevel.WARN : 
                LogLevel.INFO;
  
  logger[level](`${method} ${path} ${statusCode}`, {
    ...context,
    method,
    path,
    statusCode,
    duration,
    type: 'api_request',
  });
}

export function logDatabaseQuery(
  query: string,
  duration: number,
  rowCount?: number,
  context?: LogContext
) {
  const level = duration > 1000 ? LogLevel.WARN : LogLevel.DEBUG;
  
  logger[level](`Database query executed`, {
    ...context,
    query: query.substring(0, 200), // Truncate long queries
    duration,
    rowCount,
    type: 'db_query',
  });
}

// Cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('exit', () => logger.destroy());
  process.on('SIGINT', () => logger.destroy());
  process.on('SIGTERM', () => logger.destroy());
}