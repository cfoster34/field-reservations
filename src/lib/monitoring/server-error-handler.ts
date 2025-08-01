import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { logger } from './logger';

export interface ErrorContext {
  request: NextRequest;
  route?: string;
  userId?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

export class ServerErrorHandler {
  static async handleError(
    error: unknown,
    context: ErrorContext
  ): Promise<NextResponse> {
    const errorId = this.captureError(error, context);
    const errorResponse = this.formatErrorResponse(error, errorId);

    // Log error details
    logger.error('Server error occurred', {
      errorId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      route: context.route,
      method: context.method,
      userId: context.userId,
    });

    return errorResponse;
  }

  private static captureError(error: unknown, context: ErrorContext): string {
    // Capture error in Sentry
    const errorId = Sentry.captureException(error, {
      tags: {
        type: 'server-error',
        route: context.route,
        method: context.method,
      },
      contexts: {
        request: {
          url: context.request.url,
          method: context.request.method,
          headers: Object.fromEntries(context.request.headers.entries()),
        },
      },
      user: context.userId ? { id: context.userId } : undefined,
      extra: {
        body: context.body,
      },
    });

    return errorId;
  }

  private static formatErrorResponse(
    error: unknown,
    errorId: string
  ): NextResponse {
    // Determine error type and status code
    let status = 500;
    let message = 'Internal Server Error';
    let code = 'INTERNAL_ERROR';

    if (error instanceof Error) {
      // Handle specific error types
      if (error.message.includes('Unauthorized')) {
        status = 401;
        message = 'Unauthorized';
        code = 'UNAUTHORIZED';
      } else if (error.message.includes('Forbidden')) {
        status = 403;
        message = 'Forbidden';
        code = 'FORBIDDEN';
      } else if (error.message.includes('Not Found')) {
        status = 404;
        message = 'Not Found';
        code = 'NOT_FOUND';
      } else if (error.message.includes('Bad Request')) {
        status = 400;
        message = 'Bad Request';
        code = 'BAD_REQUEST';
      } else if (error.message.includes('Conflict')) {
        status = 409;
        message = 'Conflict';
        code = 'CONFLICT';
      } else if (error.message.includes('Rate Limit')) {
        status = 429;
        message = 'Too Many Requests';
        code = 'RATE_LIMIT_EXCEEDED';
      }
    }

    // Return error response
    return NextResponse.json(
      {
        error: {
          message,
          code,
          errorId,
          timestamp: new Date().toISOString(),
        },
      },
      { status }
    );
  }

  static async withErrorHandling<T>(
    handler: () => Promise<T>,
    context: ErrorContext
  ): Promise<T | NextResponse> {
    try {
      return await handler();
    } catch (error) {
      return this.handleError(error, context);
    }
  }
}

// Middleware wrapper for API routes
export function withServerErrorHandler(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: any) => {
    const startTime = Date.now();
    
    try {
      // Add request tracking
      Sentry.setContext('request', {
        url: req.url,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries()),
      });

      // Execute handler
      const response = await handler(req, context);
      
      // Track successful response time
      const duration = Date.now() - startTime;
      Sentry.metrics.distribution('api.response_time', duration, {
        tags: {
          route: req.nextUrl.pathname,
          method: req.method,
          status: response.status.toString(),
        },
      });

      return response;
    } catch (error) {
      // Track error response time
      const duration = Date.now() - startTime;
      Sentry.metrics.distribution('api.error_response_time', duration, {
        tags: {
          route: req.nextUrl.pathname,
          method: req.method,
        },
      });

      // Handle error
      return ServerErrorHandler.handleError(error, {
        request: req,
        route: req.nextUrl.pathname,
        method: req.method,
      });
    }
  };
}