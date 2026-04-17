# MandiGrow Architecture Contract

## Single Source of Truth

**All ERP business logic lives in [`web/`](web/).**

This includes: arrival, sales, ledger, reports, billing engine, subscription
engine, admin portal, RBAC, and all Supabase RPC interactions.

No business logic is permitted outside `web/`.

## Runtimes

| Runtime          | Location                                   | Role                                   |
| ---------------- | ------------------------------------------ | -------------------------------------- |
| Web ERP          | `web/` (Next.js)                           | Primary ERP. SSOT for all logic.       |
| Capacitor Mobile | `web/capacitor.config.ts`, `web/android/`  | Thin native wrapper over the web build. |
| Legacy (frozen)  | `legacy/mobile_flutter_archive/`, `legacy/mobile_rn_archive/` | Reference only. Not built, not shipped. |

## Mobile = Web + Capacitor

The mobile app is **not** a separate codebase. It is the exact same Next.js
build, loaded inside a Capacitor WebView, with native capabilities exposed
through Capacitor plugins.

### Build flow

```bash
cd web
npm run build
npx cap sync
npx cap run android
```

Any change to the ERP is automatically picked up by the mobile app on the
next `cap sync`. There is no mobile-side logic to keep in lockstep.

## Where native features belong

All native capabilities are added as **Capacitor plugins inside `web/`**,
never as standalone mobile code:

- Camera / invoice capture → `@capacitor/camera`
- File export / share      → `@capacitor/filesystem`, `@capacitor/share`
- Push notifications       → `@capacitor/push-notifications`
- Biometric login          → `capacitor-biometric-auth` (or equivalent)
- Offline queue / sync     → IndexedDB + background sync, wrapped in a
  `web/lib/offline/` module; replay against the same Supabase RPCs the
  online path uses
- Barcode scanning         → `@capacitor-community/barcode-scanner`

## Rules

1. **Never** add ERP logic to `legacy/**`. Those trees are frozen.
2. **Never** create a parallel mobile codebase. If a feature needs native
   access, add a Capacitor plugin in `web/` and call it from the existing
   Next.js code.
3. **Never** duplicate env config. The only live environment file is
   `web/.env.local`. Capacitor inherits it via the web build.
4. Offline features must queue against the **same** API surface the online
   path uses, so there is exactly one code path per business operation.

## Legacy salvage process

When a feature exists in `legacy/` but not in `web/`:

1. Read the legacy implementation for reference.
2. Re-implement it as a Next.js page/component in `web/`.
3. If it requires native access, add the Capacitor plugin in `web/`.
4. Do **not** copy files out of `legacy/` into `web/` wholesale.

## Release safety checklist

Before any mobile release, verify on both web and Capacitor Android:

- [ ] Login (web users + mobile users)
- [ ] Arrival entry
- [ ] Sales entry
- [ ] Ledger / reports
- [ ] Admin portal access
- [ ] Billing / subscription screens

Behavior must be identical — because it is literally the same build.
