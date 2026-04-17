# MandiPro Mobile — React Native / Expo App

## Architecture

This app shares domain logic and validation with the web app via:
- `packages/domain` — Business rules (commission, invoice totals, cheque state machine, ledger engine)
- `packages/contracts` — TypeScript DTOs + TanStack Query cache keys
- `packages/validation` — Zod schemas for form validation

## Data Flow

All API calls hit the same `/api/mandi/*` endpoints as the web app.
Auth uses the same Supabase session cookie (via `@supabase/auth-helpers-expo`).

## Priority Screens (Pin-to-Pin Parity)

| Screen | Web Route | Status |
|---|---|---|
| Gate Entry | `/arrivals` → ArrivalsEntryForm | 🔴 Not started |
| Arrivals | `/arrivals` → ArrivalsHistory | 🔴 Not started |
| Quick Payment | `/finance/payments` | 🔴 Not started |
| Stock Lookup | `/stock` | 🔴 Not started |
| Dashboard Summary | `/dashboard` | 🔴 Not started |

## Shared Imports

```typescript
// Domain logic — same as web
import { calculateArrival, calculateCommissionBill } from '@mandipro/domain'
import { calculateSaleInvoice } from '@mandipro/domain'
import { getAvailableTransitions, CHEQUE_STATUS_DISPLAY } from '@mandipro/domain'
import { computeRunningBalances } from '@mandipro/domain'

// Contracts — same DTOs as web
import type { CreateArrivalDTO, Payment, Cheque } from '@mandipro/contracts'

// Validation — same Zod schemas as web
import { CreateArrivalSchema, CreatePaymentSchema } from '@mandipro/validation'
```

## Supabase Client (Mobile)

```typescript
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
```

## Setup Instructions

```bash
cd mobile
npm install
npx expo start
```

## Note on Current Architecture

The current Capacitor-based mobile implementation in `web/` is a transitional bridge.
The React Native/Expo app is the target native mobile platform with full pin-to-pin UI parity.
Both use the same Supabase backend and `/api/mandi/*` BFF routes.
