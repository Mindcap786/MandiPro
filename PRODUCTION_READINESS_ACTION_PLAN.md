# 🎯 PRODUCTION READINESS ACTION PLAN
## MandiGrow ERP - Prioritized Implementation Roadmap

**Generated:** February 15, 2026  
**Target Production Date:** March 15, 2026 (4 weeks)  
**Status:** DRAFT - Awaiting Approval

---

## PHASE 1: CRITICAL BLOCKERS (Week 1-2)
**Goal:** Fix issues that prevent production deployment  
**Estimated Effort:** 80-120 hours

### 1.1 Database Integrity & ACID Compliance (Priority: CRITICAL)

#### Task 1.1.1: Add Transaction Wrappers
**File:** `supabase/migrations/20260216_add_transaction_wrappers.sql`
```sql
-- Wrap all RPC functions in explicit transactions
CREATE OR REPLACE FUNCTION confirm_sale_transaction(
    p_organization_id UUID,
    p_buyer_id UUID,
    p_sale_date DATE,
    p_payment_mode TEXT,
    p_total_amount NUMERIC,
    p_items JSONB,
    p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale_id UUID;
    v_voucher_id UUID;
BEGIN
    -- Start explicit transaction
    BEGIN
        -- Check idempotency
        IF EXISTS (SELECT 1 FROM sales WHERE id = p_idempotency_key) THEN
            RETURN jsonb_build_object(
                'success', true,
                'message', 'Already processed',
                'sale_id', p_idempotency_key
            );
        END IF;
        
        -- Insert sale
        INSERT INTO sales (
            id, organization_id, buyer_id, sale_date, 
            payment_mode, total_amount
        ) VALUES (
            p_idempotency_key, p_organization_id, p_buyer_id, 
            p_sale_date, p_payment_mode, p_total_amount
        ) RETURNING id INTO v_sale_id;
        
        -- Insert items
        INSERT INTO sale_items (sale_id, item_id, quantity, rate)
        SELECT 
            v_sale_id,
            (item->>'item_id')::UUID,
            (item->>'quantity')::NUMERIC,
            (item->>'rate')::NUMERIC
        FROM jsonb_array_elements(p_items) AS item;
        
        -- Create voucher
        INSERT INTO vouchers (organization_id, type, voucher_no, narration)
        VALUES (p_organization_id, 'sales', (SELECT COALESCE(MAX(bill_no), 0) + 1 FROM sales WHERE organization_id = p_organization_id), 'Sale Invoice')
        RETURNING id INTO v_voucher_id;
        
        -- Create ledger entry (Debit - Buyer owes)
        INSERT INTO ledger_entries (
            organization_id, contact_id, voucher_id,
            entry_date, debit, credit, transaction_type
        ) VALUES (
            p_organization_id, p_buyer_id, v_voucher_id,
            p_sale_date, p_total_amount, 0, 'sale'
        );
        
        -- Update inventory (if applicable)
        -- ... inventory logic here ...
        
        RETURN jsonb_build_object(
            'success', true,
            'sale_id', v_sale_id,
            'voucher_id', v_voucher_id
        );
        
    EXCEPTION
        WHEN OTHERS THEN
            -- Rollback happens automatically
            RAISE EXCEPTION 'Transaction failed: %', SQLERRM;
    END;
END;
$$;
```
**Effort:** 16 hours  
**Owner:** Backend Developer

#### Task 1.1.2: Add Database Constraints
**File:** `supabase/migrations/20260216_add_integrity_constraints.sql`
```sql
-- Add CHECK constraints
ALTER TABLE sales 
ADD CONSTRAINT sales_amount_positive CHECK (total_amount >= 0),
ADD CONSTRAINT sales_payment_mode_valid CHECK (payment_mode IN ('cash', 'credit', 'upi', 'cheque'));

ALTER TABLE ledger_entries 
ADD CONSTRAINT ledger_debit_credit_exclusive CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0) OR (debit = 0 AND credit = 0)
);

-- Add validation trigger
CREATE OR REPLACE FUNCTION validate_ledger_entry()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure voucher exists if voucher_id is set
    IF NEW.voucher_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM vouchers WHERE id = NEW.voucher_id) THEN
            RAISE EXCEPTION 'Invalid voucher_id: %', NEW.voucher_id;
        END IF;
    END IF;
    
    -- Ensure contact exists
    IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = NEW.contact_id) THEN
        RAISE EXCEPTION 'Invalid contact_id: %', NEW.contact_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_ledger_before_insert
BEFORE INSERT OR UPDATE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION validate_ledger_entry();
```
**Effort:** 8 hours  
**Owner:** Database Administrator

#### Task 1.1.3: Create Audit Log System
**File:** `supabase/migrations/20260216_create_audit_log.sql`
```sql
-- Create audit log table
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    user_id UUID REFERENCES auth.users(id),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_log (
        table_name, 
        record_id, 
        action, 
        old_data, 
        new_data, 
        user_id
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        auth.uid()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add audit triggers to critical tables
CREATE TRIGGER audit_sales
AFTER INSERT OR UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_ledger_entries
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_vouchers
AFTER INSERT OR UPDATE OR DELETE ON vouchers
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```
**Effort:** 12 hours  
**Owner:** Backend Developer

---

### 1.2 Automated Testing (Priority: CRITICAL)

#### Task 1.2.1: Setup Testing Infrastructure
**Files to create:**
- `web/jest.config.js`
- `web/jest.setup.js`
- `web/__tests__/setup.ts`

```bash
# Install dependencies
cd web
npm install --save-dev jest @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom @types/jest
```

**jest.config.js:**
```javascript
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'components/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
}

module.exports = createJestConfig(customJestConfig)
```
**Effort:** 4 hours  
**Owner:** QA Engineer

#### Task 1.2.2: Write Critical Unit Tests
**File:** `web/__tests__/lib/offline-sync.test.ts`
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useOfflineSync } from '@/lib/hooks/use-offline-sync';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';

jest.mock('@/lib/supabaseClient');
jest.mock('@/lib/db');

describe('useOfflineSync', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should sync pending sales when online', async () => {
        // Mock pending sales
        (db.sales.where as jest.Mock).mockReturnValue({
            equals: jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([
                    {
                        id: 'test-id',
                        total_amount: 1000,
                        sync_status: 'pending'
                    }
                ])
            })
        });

        // Mock successful RPC call
        (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });

        const { result } = renderHook(() => useOfflineSync('org-id'));

        await waitFor(() => {
            expect(result.current.isSyncing).toBe(false);
        });

        expect(supabase.rpc).toHaveBeenCalledWith('confirm_sale_transaction', expect.objectContaining({
            p_idempotency_key: 'test-id'
        }));
    });

    it('should handle sync failures gracefully', async () => {
        // Mock pending sales
        (db.sales.where as jest.Mock).mockReturnValue({
            equals: jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([
                    { id: 'test-id', sync_status: 'pending' }
                ])
            })
        });

        // Mock failed RPC call
        (supabase.rpc as jest.Mock).mockResolvedValue({ 
            error: { message: 'Network error' } 
        });

        const { result } = renderHook(() => useOfflineSync('org-id'));

        await waitFor(() => {
            expect(result.current.isSyncing).toBe(false);
        });

        // Verify failure was recorded
        expect(db.sales.update).toHaveBeenCalledWith('test-id', {
            sync_status: 'failed'
        });
    });
});
```
**Effort:** 24 hours  
**Owner:** QA Engineer

#### Task 1.2.3: Write Database Tests
**File:** `supabase/tests/ledger_integrity.test.sql`
```sql
-- Using pgTAP for database testing
BEGIN;
SELECT plan(5);

-- Test 1: Ledger entry must have debit OR credit, not both
SELECT throws_ok(
    $$INSERT INTO ledger_entries (organization_id, contact_id, debit, credit) 
      VALUES ('org-id', 'contact-id', 100, 50)$$,
    'Ledger entry cannot have both debit and credit'
);

-- Test 2: Sale must create corresponding ledger entry
INSERT INTO sales (organization_id, buyer_id, total_amount) 
VALUES ('org-id', 'buyer-id', 1000);

SELECT is(
    (SELECT COUNT(*) FROM ledger_entries WHERE contact_id = 'buyer-id'),
    1::bigint,
    'Sale should create ledger entry'
);

-- Test 3: Ledger balance should match sales total
SELECT is(
    (SELECT SUM(debit) - SUM(credit) FROM ledger_entries WHERE contact_id = 'buyer-id'),
    (SELECT SUM(total_amount) FROM sales WHERE buyer_id = 'buyer-id'),
    'Ledger balance should match sales total'
);

SELECT * FROM finish();
ROLLBACK;
```
**Effort:** 16 hours  
**Owner:** Database Administrator

---

### 1.3 Security Hardening (Priority: CRITICAL)

#### Task 1.3.1: Remove Service Key from Codebase
**Action Items:**
1. Move `SUPABASE_SERVICE_ROLE_KEY` to environment variables only
2. Add to `.gitignore`: `.env.local`, `.env.production.local`
3. Use Vercel/deployment platform secrets
4. Rotate existing service key

**File:** `web/.env.example`
```env
# Public keys (safe to commit)
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Private keys (NEVER commit)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```
**Effort:** 2 hours  
**Owner:** DevOps Engineer

#### Task 1.3.2: Add Rate Limiting
**File:** `web/middleware.ts`
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple in-memory rate limiter (use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT = 100; // requests per window
const WINDOW_MS = 60 * 1000; // 1 minute

export function middleware(request: NextRequest) {
    const ip = request.ip || 'unknown';
    const now = Date.now();
    
    const userLimit = rateLimitMap.get(ip);
    
    if (!userLimit || now > userLimit.resetTime) {
        rateLimitMap.set(ip, {
            count: 1,
            resetTime: now + WINDOW_MS
        });
        return NextResponse.next();
    }
    
    if (userLimit.count >= RATE_LIMIT) {
        return new NextResponse('Too Many Requests', { status: 429 });
    }
    
    userLimit.count++;
    return NextResponse.next();
}

export const config = {
    matcher: '/api/:path*',
};
```
**Effort:** 8 hours  
**Owner:** Backend Developer

#### Task 1.3.3: Add Server-Side Validation
**File:** `supabase/migrations/20260216_add_input_validation.sql`
```sql
-- Add validation function
CREATE OR REPLACE FUNCTION validate_sale_input(
    p_total_amount NUMERIC,
    p_payment_mode TEXT,
    p_items JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    -- Validate amount
    IF p_total_amount < 0 OR p_total_amount > 10000000 THEN
        RAISE EXCEPTION 'Invalid amount: %', p_total_amount;
    END IF;
    
    -- Validate payment mode
    IF p_payment_mode NOT IN ('cash', 'credit', 'upi', 'cheque') THEN
        RAISE EXCEPTION 'Invalid payment mode: %', p_payment_mode;
    END IF;
    
    -- Validate items
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Sale must have at least one item';
    END IF;
    
    RETURN TRUE;
END;
$$;

-- Use in confirm_sale_transaction
-- Add at the beginning of the function:
-- PERFORM validate_sale_input(p_total_amount, p_payment_mode, p_items);
```
**Effort:** 8 hours  
**Owner:** Backend Developer

---

### 1.4 Monitoring & Error Tracking (Priority: CRITICAL)

#### Task 1.4.1: Setup Sentry
**File:** `web/sentry.client.config.ts`
```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    
    beforeSend(event, hint) {
        // Filter sensitive data
        if (event.request) {
            delete event.request.cookies;
            delete event.request.headers?.['authorization'];
        }
        return event;
    },
    
    integrations: [
        new Sentry.BrowserTracing(),
        new Sentry.Replay({
            maskAllText: true,
            blockAllMedia: true,
        }),
    ],
});
```

**Install:**
```bash
npm install --save @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```
**Effort:** 4 hours  
**Owner:** DevOps Engineer

#### Task 1.4.2: Add Custom Error Handler
**File:** `web/lib/error-handler.ts`
```typescript
import * as Sentry from '@sentry/nextjs';
import { toast } from '@/hooks/use-toast';

export class ErrorHandler {
    static async handle(error: Error, context: string, showToUser = true) {
        // 1. Log to Sentry
        Sentry.captureException(error, {
            tags: { context },
            level: 'error',
        });
        
        // 2. Log to console in development
        if (process.env.NODE_ENV === 'development') {
            console.error(`[${context}]`, error);
        }
        
        // 3. Show user-friendly message
        if (showToUser) {
            toast({
                title: 'Error',
                description: this.getUserMessage(error),
                variant: 'destructive',
            });
        }
    }
    
    private static getUserMessage(error: Error): string {
        // Map technical errors to user-friendly messages
        if (error.message.includes('network')) {
            return 'Network error. Please check your connection.';
        }
        if (error.message.includes('permission')) {
            return 'You don\'t have permission to perform this action.';
        }
        return 'An unexpected error occurred. Please try again.';
    }
}
```
**Effort:** 4 hours  
**Owner:** Frontend Developer

---

### 1.5 Backup & Recovery (Priority: CRITICAL)

#### Task 1.5.1: Setup Automated Backups
**File:** `.github/workflows/backup.yml`
```yaml
name: Database Backup

on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM UTC
  workflow_dispatch: # Manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3
      
      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
      
      - name: Create Backup
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: |
          DATE=$(date +%Y%m%d_%H%M%S)
          supabase db dump --db-url "$DATABASE_URL" > backup_$DATE.sql
      
      - name: Upload to S3
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Sync to S3
        run: |
          aws s3 cp backup_*.sql s3://mandigrow-backups/
```
**Effort:** 8 hours  
**Owner:** DevOps Engineer

#### Task 1.5.2: Document Recovery Procedures
**File:** `docs/DISASTER_RECOVERY.md`
```markdown
# Disaster Recovery Procedures

## RTO: 4 hours
## RPO: 24 hours (daily backups)

### Recovery Steps:

1. **Identify the Issue**
   - Check Sentry for error patterns
   - Review Supabase logs
   - Verify database connectivity

2. **Restore from Backup**
   ```bash
   # Download latest backup
   aws s3 cp s3://mandigrow-backups/backup_latest.sql ./
   
   # Restore to database
   supabase db reset --db-url $DATABASE_URL
   psql $DATABASE_URL < backup_latest.sql
   ```

3. **Verify Data Integrity**
   ```sql
   -- Check record counts
   SELECT 'sales' as table, COUNT(*) FROM sales
   UNION ALL
   SELECT 'ledger_entries', COUNT(*) FROM ledger_entries;
   
   -- Verify balances
   SELECT contact_id, SUM(debit) - SUM(credit) as balance
   FROM ledger_entries
   GROUP BY contact_id;
   ```

4. **Test Critical Flows**
   - Create test sale
   - Record test payment
   - Generate ledger report

5. **Notify Users**
   - Send status update
   - Provide ETA for full recovery
```
**Effort:** 4 hours  
**Owner:** DevOps Engineer

---

## PHASE 2: HIGH PRIORITY (Week 3)
**Goal:** Improve system reliability and performance  
**Estimated Effort:** 60-80 hours

### 2.1 Enhanced Sync Logic

#### Task 2.1.1: Add Conflict Resolution
**File:** `web/lib/hooks/use-offline-sync.ts`
```typescript
// Add conflict resolution logic
const handleSyncConflict = async (localSale: Sale, serverSale: Sale) => {
    // Strategy: Last-write-wins with user confirmation
    const localTimestamp = new Date(localSale.updated_at).getTime();
    const serverTimestamp = new Date(serverSale.updated_at).getTime();
    
    if (serverTimestamp > localTimestamp) {
        // Server is newer
        const userChoice = await showConflictDialog({
            local: localSale,
            server: serverSale,
            message: 'Server has a newer version. Which one should we keep?'
        });
        
        if (userChoice === 'server') {
            await db.sales.put(serverSale);
            return 'resolved_server';
        } else {
            // Force push local version
            return 'force_push';
        }
    }
    
    return 'no_conflict';
};
```
**Effort:** 16 hours  
**Owner:** Frontend Developer

### 2.2 Performance Optimization

#### Task 2.2.1: Add Database Indexes
**File:** `supabase/migrations/20260217_add_performance_indexes.sql`
```sql
-- Add indexes for frequently queried columns
CREATE INDEX CONCURRENTLY idx_ledger_contact_date 
ON ledger_entries(contact_id, entry_date DESC);

CREATE INDEX CONCURRENTLY idx_sales_org_date 
ON sales(organization_id, sale_date DESC);

CREATE INDEX CONCURRENTLY idx_sales_buyer_status 
ON sales(buyer_id, payment_status);

CREATE INDEX CONCURRENTLY idx_vouchers_org_type_no 
ON vouchers(organization_id, type, voucher_no);

-- Add partial indexes for common filters
CREATE INDEX CONCURRENTLY idx_sales_pending 
ON sales(organization_id, sale_date DESC) 
WHERE payment_status = 'pending';

-- Analyze tables for query planner
ANALYZE sales;
ANALYZE ledger_entries;
ANALYZE vouchers;
```
**Effort:** 8 hours  
**Owner:** Database Administrator

### 2.3 Complete Mobile App

#### Task 2.3.1: Add Background Sync Service
**File:** `mobile/lib/services/background_sync_service.dart`
```dart
import 'package:workmanager/workmanager.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

class BackgroundSyncService {
  static const String syncTaskName = 'sync_pending_sales';
  
  static void initialize() {
    Workmanager().initialize(callbackDispatcher);
    
    // Schedule periodic sync every 15 minutes
    Workmanager().registerPeriodicTask(
      'sync-task',
      syncTaskName,
      frequency: Duration(minutes: 15),
      constraints: Constraints(
        networkType: NetworkType.connected,
      ),
    );
  }
  
  static void callbackDispatcher() {
    Workmanager().executeTask((task, inputData) async {
      if (task == syncTaskName) {
        await syncPendingSales();
      }
      return Future.value(true);
    });
  }
  
  static Future<void> syncPendingSales() async {
    // Implementation similar to web version
    final pendingSales = await HiveService.getPendingSales();
    
    for (final sale in pendingSales) {
      try {
        await SupabaseService.confirmSale(sale);
        await HiveService.markAsSynced(sale.id);
      } catch (e) {
        await HiveService.markAsFailed(sale.id);
      }
    }
  }
}
```
**Effort:** 24 hours  
**Owner:** Mobile Developer

---

## PHASE 3: BETA LAUNCH (Week 4)
**Goal:** Limited production deployment with monitoring

### 3.1 Beta Deployment Checklist

- [ ] Deploy to production environment
- [ ] Configure monitoring dashboards
- [ ] Setup alerting (PagerDuty/Slack)
- [ ] Onboard 5-10 pilot users
- [ ] Daily standup to review metrics
- [ ] Bug triage and hotfix process

### 3.2 Success Metrics

**Track Daily:**
- Sync success rate (target: >95%)
- Error rate (target: <1%)
- Page load time (target: <2s)
- User feedback score (target: >4/5)

**Weekly Review:**
- Data integrity checks
- Performance bottlenecks
- User pain points
- Feature requests

---

## RESOURCE ALLOCATION

### Team Structure:
- **Backend Developer (Senior):** 40 hrs/week
  - Database migrations
  - RPC functions
  - API security

- **Frontend Developer (Mid):** 40 hrs/week
  - Component testing
  - Sync logic
  - Error handling

- **Mobile Developer (Mid):** 40 hrs/week
  - Flutter app completion
  - Background sync
  - Offline storage

- **QA Engineer (Senior):** 40 hrs/week
  - Test automation
  - Manual testing
  - Bug verification

- **DevOps Engineer (Mid):** 20 hrs/week
  - CI/CD setup
  - Monitoring
  - Backup automation

### Total Effort: 180 hours/week × 4 weeks = 720 hours

---

## BUDGET ESTIMATE

### Development Costs:
- Senior Backend Developer: $80/hr × 160 hrs = $12,800
- Mid Frontend Developer: $60/hr × 160 hrs = $9,600
- Mid Mobile Developer: $60/hr × 160 hrs = $9,600
- Senior QA Engineer: $70/hr × 160 hrs = $11,200
- Mid DevOps Engineer: $65/hr × 80 hrs = $5,200

**Total Development: $48,400**

### Infrastructure Costs (Monthly):
- Supabase Pro: $25/month
- Sentry Team: $26/month
- AWS S3 (Backups): $10/month
- Vercel Pro: $20/month

**Total Infrastructure: $81/month**

### One-Time Costs:
- Security audit: $2,000
- Load testing: $1,000
- Documentation: $1,500

**Total One-Time: $4,500**

### **GRAND TOTAL: $52,900**

---

## RISK MITIGATION

### Risk 1: Timeline Slippage
**Mitigation:** 
- Daily standups
- Weekly sprint reviews
- Buffer time in estimates (20%)

### Risk 2: Data Loss During Migration
**Mitigation:**
- Test all migrations on staging first
- Keep rollback scripts ready
- Backup before every deployment

### Risk 3: User Adoption Issues
**Mitigation:**
- Comprehensive user training
- In-app tutorials
- Dedicated support channel

---

## APPROVAL REQUIRED

**Prepared By:** AI Audit Team  
**Date:** February 15, 2026

**Approvals:**
- [ ] CTO/Technical Lead
- [ ] Product Manager
- [ ] Finance/Budget Owner
- [ ] QA Lead

**Next Steps After Approval:**
1. Kickoff meeting with team
2. Setup project tracking (Jira/Linear)
3. Begin Phase 1 implementation
4. Weekly progress reports

---

*This action plan is a living document and will be updated based on progress and feedback.*
