'use client';

import React, { Component, ErrorInfo, ReactNode, Suspense } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Loader2 } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AsyncErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to Sentry with context
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      tags: {
        component: 'AsyncErrorBoundary',
        name: this.props.name || 'unknown',
      },
    });
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // Default error UI for async components
      return (
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-gray-600">Failed to load this section</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    // Wrap children in Suspense for async components
    return (
      <Suspense
        fallback={
          this.props.loadingFallback || (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )
        }
      >
        {this.props.children}
      </Suspense>
    );
  }
}