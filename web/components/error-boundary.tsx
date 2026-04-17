'use client';

import React from 'react';
import * as Sentry from '@sentry/nextjs';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("CAUGHT_BY_BOUNDARY:", error);

        /* 
        // Debug server deactivated for production stability
        fetch('http://localhost:3001', {
            method: 'POST',
            body: error.stack || error.message,
        }).catch(err => console.error("Could not send debug info", err));
        */

        // Log to Sentry
        Sentry.captureException(error, {
            contexts: {
                react: {
                    componentStack: errorInfo.componentStack,
                },
            },
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
                        <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
                            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="mt-4 text-xl font-semibold text-center text-gray-900">
                            Something went wrong
                        </h2>
                        <p className="mt-2 text-sm text-center text-gray-600">
                            We've been notified and are working on a fix.
                        </p>
                        <div className="mt-6 flex gap-3">
                            <button
                                onClick={() => window.location.reload()}
                                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                            >
                                Reload Page
                            </button>
                            <button
                                onClick={() => this.setState({ hasError: false })}
                                className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <details className="mt-4 p-3 bg-gray-100 rounded text-xs" open>
                                <summary className="cursor-pointer font-semibold">Error Details</summary>
                                <pre className="mt-2 overflow-auto whitespace-pre-wrap">{this.state.error.toString()}</pre>
                                <pre className="mt-2 overflow-auto whitespace-pre-wrap text-red-700">{this.state.error.stack}</pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
