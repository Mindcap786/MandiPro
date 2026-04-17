# MandiGrow Intelligent Stock Alert System — Integration Guide

To wire everything up without modifying existing code significantly, simply inject the new hooks and components into your existing layout structures.

## 1. Native Top Bar (Alert Bell)
**File**: `web/components/mobile/NativeTopBar.tsx` (or your equivalent Header)
**Injection**:
```tsx
import { AlertBell } from '@/components/alerts/AlertBell';

export function NativeTopBar() {
  return (
    <header className="flex items-center justify-between...">
        {/* Existing Title/Logo */}
        <div>MandiGrow</div>
        
        {/* NEW ALERT BELL INJECTION */}
        <AlertBell />
    </header>
  )
}
```

## 2. Capacitor Push Initialization
**File**: `web/components/capacitor/capacitor-provider.tsx` (or wherever app init happens)
**Injection**:
```tsx
import { initializePushNotifications } from '@/lib/push-notifications';
import { useAuth } from '@/components/auth/auth-provider';
import { useRouter } from 'next/navigation';

export function CapacitorProvider({ children }) {
    const { profile } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (profile?.id && profile?.organization_id) {
            initializePushNotifications(profile.id, profile.organization_id, router);
        }
    }, [profile]);

    return <>{children}</>;
}
```

## 3. Stock List Realtime Hook & Summary Card
**File**: `web/app/(main)/stock/page.tsx`
**Injection**:
```tsx
import { useStockAlerts } from '@/hooks/use-stock-alerts';
import { StockAlertSummaryCard } from '@/components/alerts/StockAlertSummaryCard';

export default function StockPage() {
    // 1. Initialize the hook here (it auto-subscribes and manages toasts)
    useStockAlerts(); 

    return (
        <NativePageWrapper>
            {/* 2. Place the Summary Card above the existing list. It will auto-hide if empty. */}
            <StockAlertSummaryCard />
            
            {/* ... EXISTING FILTERS & LIST ... */}
        </NativePageWrapper>
    );
}
```

## 4. Commodity Detail Banner
**File**: `web/components/inventory/lot-stock-dialog.tsx` (or your equivalent Detail Screen where `<LotRow>` lives)
**Injection**:
```tsx
import { StockAlertBanner } from '@/components/alerts/StockAlertBanner';

export function LotStockDialog({ itemId, itemName }) {
    // 1. Existing fetch hooks ...

    return (
        <DialogContent>
            {/* ... Header ... */}
            
            {/* 2. Inject Banner above the Lots List */}
            <StockAlertBanner commodityId={itemId} commodityName={itemName} />

            {/* ... Existing <LotRow> rendering loop remains untouched ... */}
        </DialogContent>
    );
}
```

## 5. Expose Threshold Settings
**File**: `web/app/(main)/settings/alerts/page.tsx` (Create this file)
**Content**:
```tsx
import { AlertConfigScreen } from '@/components/settings/AlertConfigScreen';
import { NativePageWrapper } from '@/components/mobile/NativePageWrapper';

export default function AlertSettingsPage() {
    return (
        <NativePageWrapper>
            <AlertConfigScreen />
        </NativePageWrapper>
    );
}
```

## 6. Database Triggers & Edge Dispatcher Setup
1. **Migrations**: Apply `supabase/migrations/20260410110001_stock_alert_system.sql` using Supabase CLI: `supabase db push`.
2. **Edge Function Deploy**: Deploy via CLI: `supabase functions deploy dispatch-stock-alert`.
3. **Database Webhooks**: In your Supabase Dashboard -> Database -> Webhooks, create a new Webhook:
    - Target Table: `public.stock_alerts`
    - Events: `INSERT`
    - Method: `POST`
    - URL: `https://<PROJECT_REF>.supabase.co/functions/v1/dispatch-stock-alert`
