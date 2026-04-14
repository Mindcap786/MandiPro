import * as Sentry from '@sentry/nextjs';

export class ErrorHandler {
    /**
     * Handle and report errors
     */
    static handle(error: Error, context?: string, showToUser = false) {
        // Log to console in development
        if (process.env.NODE_ENV === 'development') {
            console.error(`[${context || 'Error'}]`, error);
        }

        // Report to Sentry
        Sentry.captureException(error, {
            tags: {
                context: context || 'unknown',
            },
            level: 'error',
        });

        // Optionally show user-friendly message
        // (You can integrate with your toast system here)
        if (showToUser && typeof window !== 'undefined') {
            // Example: toast({ title: 'Error', description: this.getUserMessage(error) });
            console.warn('Error:', this.getUserMessage(error));
        }
    }

    /**
     * Convert technical error to user-friendly message
     */
    static getUserMessage(error: Error): string {
        const message = error.message.toLowerCase();

        if (message.includes('stock') || message.includes('insufficient')) {
            return 'Inventory shortage detected. Please check current stock levels.';
        }
        
        if (message.includes('check constraint') || message.includes('violates')) {
            return 'Invalid transaction data. Please verify your amounts and try again.';
        }

        if (message.includes('unique') || message.includes('already exists')) {
            return 'This record already exists in the system.';
        }

        return 'An unexpected system error occurred. Our team has been notified. Please try again.';
    }

    /**
     * Track custom events
     */
    static trackEvent(eventName: string, data?: Record<string, any>) {
        Sentry.captureMessage(eventName, {
            level: 'info',
            extra: data,
        });
    }

    /**
     * Set user context
     */
    static setUser(user: { id: string; email?: string; name?: string }) {
        Sentry.setUser({
            id: user.id,
            email: user.email,
            username: user.name,
        });
    }

    /**
     * Clear user context (on logout)
     */
    static clearUser() {
        Sentry.setUser(null);
    }

    /**
     * Add breadcrumb for debugging
     */
    static addBreadcrumb(message: string, data?: Record<string, any>) {
        Sentry.addBreadcrumb({
            message,
            data,
            level: 'info',
        });
    }
}
