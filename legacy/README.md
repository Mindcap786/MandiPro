# Legacy Mobile Archive

**Status:** Frozen. Reference only. **Do not build. Do not deploy.**

## Contents

- `mobile_flutter_archive/` — original Flutter ERP mobile app (incomplete).
- `mobile_rn_archive/` — React Native prototype (incomplete).

## Why this exists

Both trees predate the current mobile strategy. The ERP's single source of
truth is now the Next.js app in [`../web/`](../web/), and the production
mobile runtime is the Capacitor wrapper living inside `web/`
(`web/capacitor.config.ts`, `web/android/`).

These archives are retained **only** for:

1. Feature salvage (screens/flows not yet present in `web/`).
2. Reference while implementing Capacitor plugins (camera, offline queue,
   push, biometric, barcode).
3. Historical context.

## Rules

- Do not add new features here.
- Do not wire these into CI or any build pipeline.
- Do not share API keys / Supabase credentials from these trees — treat any
  env files inside as stale and potentially rotated.
- Anything worth keeping must be **reimplemented in `web/`** (as a page,
  component, or Capacitor plugin integration), never revived in place.

See [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for the current mobile
architecture contract.
