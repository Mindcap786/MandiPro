# 🔧 CRITICAL FIX #2: Setup Sentry Monitoring

**Issue:** No error tracking or monitoring system in place

**Impact:** Cannot detect production errors, no visibility into user issues

**Priority:** CRITICAL

**Estimated Time:** 15-20 minutes

---

## 🚀 QUICK SETUP GUIDE

### Step 1: Create Sentry Account (2 minutes)

1. Go to: https://sentry.io/signup/
2. Sign up with your email or GitHub
3. Choose "Next.js" as your platform
4. Note your DSN (Data Source Name) - looks like:
   ```
   https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
   ```

---

### Step 2: Install Sentry (1 minute)

```bash
cd web
npm install --save @sentry/nextjs
```

---

### Step 3: Run Sentry Wizard (5 minutes)

```bash
npx @sentry/wizard@latest -i nextjs
```

**The wizard will:**
- ✅ Create `sentry.client.config.ts`
- ✅ Create `sentry.server.config.ts`
- ✅ Create `sentry.edge.config.ts`
- ✅ Update `next.config.js`
- ✅ Add `.sentryclirc` to `.gitignore`

**Follow the prompts:**
1. Login to Sentry (browser will open)
2. Select your project
3. Confirm configuration
4. Done!

---

### Step 4: Configure Environment Variables (2 minutes)

Add to `web/.env.local`:

```env
# Sentry Configuration
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn-here@sentry.io/your-project-id
SENTRY_ORG=your-org-name
SENTRY_PROJECT=mandigrow-erp
SENTRY_AUTH_TOKEN=your-auth-token

# Optional: Control error reporting
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
NEXT_PUBLIC_SENTRY_TRACE_SAMPLE_RATE=0.1
```

**Important:** Add to `.gitignore`:
```
.sentryclirc
.env*.local
```

---

### Step 5: Customize Sentry Configuration (5 minutes)

The wizard creates basic configs. Let's enhance them:

#### **`web/sentry.client.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Environment
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  
  // Performance Monitoring
  tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACE_SAMPLE_RATE || "0.1"),
  
  // Session Replay
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
  
  integrations: [
    new Sentry.BrowserTracing({
      // Track navigation performance
      tracePropagationTargets: ["localhost", /^https:\/\/.*\.supabase\.co/],
    }),
    new Sentry.Replay({
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
      const url = new URL(event.request.url);
      url.searchParams.delete('token');
      url.searchParams.delete('apikey');
      event.request.url = url.toString();
    }
    
    return event;
  },
  
  // Ignore common errors
  ignoreErrors: [
    // Browser extensions
    'top.GLOBALS',
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
  ],
});
```

#### **`web/sentry.server.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  
  tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACE_SAMPLE_RATE || "0.1"),
  
  // Server-specific config
  beforeSend(event, hint) {
    // Remove sensitive data from server events
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    
    return event;
  },
});
```

---

### Step 6: Add Error Boundary (5 minutes)

Create `web/components/error-boundary.tsx`:

```typescript
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
              <details className="mt-4 p-3 bg-gray-100 rounded text-xs">
                <summary className="cursor-pointer font-semibold">Error Details</summary>
                <pre className="mt-2 overflow-auto">{this.state.error.toString()}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

Update `web/app/layout.tsx` to use the error boundary:

```typescript
import { ErrorBoundary } from '@/components/error-boundary';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
```

---

### Step 7: Add Custom Error Handler (Optional)

Create `web/lib/error-handler.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';
import { toast } from '@/hooks/use-toast';

export class ErrorHandler {
  /**
   * Handle and report errors
   */
  static handle(error: Error, context?: string, showToUser = true) {
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
    
    // Show user-friendly message
    if (showToUser) {
      toast({
        title: 'Error',
        description: this.getUserMessage(error),
        variant: 'destructive',
      });
    }
  }
  
  /**
   * Convert technical error to user-friendly message
   */
  private static getUserMessage(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch')) {
      return 'Network error. Please check your connection and try again.';
    }
    
    if (message.includes('permission') || message.includes('unauthorized')) {
      return 'You don\'t have permission to perform this action.';
    }
    
    if (message.includes('not found') || message.includes('404')) {
      return 'The requested resource was not found.';
    }
    
    if (message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    
    return 'An unexpected error occurred. Please try again.';
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
}
```

**Usage example:**

```typescript
// In your components
try {
  await supabase.rpc('some_function');
} catch (error) {
  ErrorHandler.handle(error as Error, 'RPC Call Failed');
}

// Track custom events
ErrorHandler.trackEvent('Sale Created', { amount: 1000, buyer: 'ABC' });

// Set user context after login
ErrorHandler.setUser({
  id: user.id,
  email: user.email,
  name: user.name,
});
```

---

## ✅ VERIFICATION

### 1. Test Error Tracking

Add a test error button to your dashboard:

```typescript
// In any component (temporary)
<button onClick={() => {
  throw new Error('Test Sentry Error');
}}>
  Test Sentry
</button>
```

Click it, then check:
1. Sentry dashboard: https://sentry.io/
2. You should see the error appear within seconds
3. Click on the error to see full details

### 2. Check Sentry Dashboard

Go to https://sentry.io/ and verify:
- ✅ Errors are being captured
- ✅ Performance metrics are tracked
- ✅ Session replays are recorded (if enabled)
- ✅ User context is attached

### 3. Verify Source Maps

Sentry should show readable stack traces (not minified). If not:
1. Check `next.config.js` has Sentry plugin
2. Verify `SENTRY_AUTH_TOKEN` is set
3. Source maps are uploaded during build

---

## 📊 MONITORING SETUP

### Key Metrics to Monitor

1. **Error Rate**
   - Target: < 1% of requests
   - Alert if > 5%

2. **Response Time**
   - Target: < 2 seconds
   - Alert if > 5 seconds

3. **Crash-Free Sessions**
   - Target: > 99%
   - Alert if < 95%

### Set Up Alerts

In Sentry dashboard:
1. Go to **Alerts** → **Create Alert**
2. Set up alerts for:
   - New issues
   - Spike in error rate
   - Performance degradation
3. Configure notification channels (email, Slack, etc.)

---

## 🔍 TROUBLESHOOTING

### Issue: "Sentry DSN not found"
**Solution:** Make sure `NEXT_PUBLIC_SENTRY_DSN` is set in `.env.local`

### Issue: Errors not appearing in Sentry
**Solution:**
1. Check DSN is correct
2. Verify internet connection
3. Check browser console for Sentry errors
4. Try in production mode: `npm run build && npm start`

### Issue: Source maps not working
**Solution:**
1. Verify `SENTRY_AUTH_TOKEN` is set
2. Check `next.config.js` has `withSentryConfig`
3. Rebuild: `npm run build`

### Issue: Too many errors
**Solution:**
1. Increase `ignoreErrors` list
2. Add `beforeSend` filters
3. Adjust sample rates

---

## 📋 PRODUCTION CHECKLIST

Before deploying to production:

- [ ] Sentry DSN configured
- [ ] Environment set to "production"
- [ ] Sample rates configured (10% for performance)
- [ ] Sensitive data filtered (tokens, passwords)
- [ ] Error boundary implemented
- [ ] Alerts configured
- [ ] Team members invited to Sentry project
- [ ] Source maps uploading correctly
- [ ] Test error captured successfully

---

## 💰 PRICING

**Free Tier:**
- 5,000 errors/month
- 10,000 performance units/month
- 50 replays/month
- Perfect for pilot launch!

**Paid Plans:**
- Start at $26/month
- Upgrade when you exceed free tier

---

## 📊 IMPACT ON PRODUCTION READINESS

**Before Fix:**
- Overall Score: 82/100
- Critical Issues: 3
- Status: CONDITIONAL GO ⚠️

**After Fix:**
- Overall Score: 86/100 (+4 points)
- Critical Issues: 2 (down from 3) ✅
- Status: CONDITIONAL GO ⚠️

---

## 🎯 NEXT STEPS

After Sentry is set up:

1. ✅ **Verify monitoring works** (test error)
2. ✅ **Configure alerts** (email/Slack)
3. ⏭️ **Move to next critical issue:**
   - Configure automated backups (8 hours)
   - Add automated tests (80 hours)

---

## 📝 FILES TO CREATE

1. `web/sentry.client.config.ts` (created by wizard)
2. `web/sentry.server.config.ts` (created by wizard)
3. `web/sentry.edge.config.ts` (created by wizard)
4. `web/components/error-boundary.tsx` (manual)
5. `web/lib/error-handler.ts` (manual)

---

**Time to Complete:** 15-20 minutes  
**Difficulty:** Easy  
**Risk:** Low (safe to implement)

---

*This fix resolves 1 of 3 remaining critical issues blocking production deployment.*
