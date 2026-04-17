import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Environment
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,

    // Performance Monitoring
    tracesSampleRate: 0.1, // 10% of transactions

    // Session Replay
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

    integrations: [
        Sentry.replayIntegration({
            // Mask sensitive data
            maskAllText: true,
            blockAllMedia: true,
        }),
    ],

    // Filter sensitive data
    beforeSend(event, hint) {
        // Remove sensitive headers
        if (event.request?.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
        }

        // Remove sensitive query params
        if (event.request?.url) {
            try {
                const url = new URL(event.request.url);
                url.searchParams.delete('token');
                url.searchParams.delete('apikey');
                event.request.url = url.toString();
            } catch (e) {
                // Invalid URL, skip
            }
        }

        return event;
    },

    // Ignore common errors
    ignoreErrors: [
        // Browser extensions
        'top.GLOBALS',
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        // Network errors (handled by app)
        'NetworkError',
        'Failed to fetch',
    ],
});
