/**
 * packages/domain/src/finance/cheque-state-machine.ts
 *
 * Pure business logic — no React, no Supabase, no UI.
 * Importable in web (Next.js) and mobile (React Native/Expo).
 *
 * The cheque state machine is also enforced server-side in:
 *   /api/mandi/cheques/[id]/transition/route.ts
 *
 * These MUST stay in sync.
 */

export type ChequeStatus = 'pending' | 'presented' | 'cleared' | 'bounced' | 'cancelled'

export interface ChequeTransition {
    from: ChequeStatus
    to: ChequeStatus
    label: string
    requiresClearedDate?: boolean
    requiresBounceReason?: boolean
    confirmationMessage: string
    color: 'green' | 'red' | 'amber' | 'slate'
}

// ── Valid Transitions ─────────────────────────────────────────────────────────

const TRANSITIONS: ChequeTransition[] = [
    {
        from: 'pending',
        to: 'presented',
        label: 'Mark as Presented',
        confirmationMessage: 'Mark this cheque as presented to the bank?',
        color: 'amber',
    },
    {
        from: 'pending',
        to: 'cancelled',
        label: 'Cancel Cheque',
        confirmationMessage: 'Cancel this cheque? This action cannot be undone.',
        color: 'slate',
    },
    {
        from: 'presented',
        to: 'cleared',
        label: 'Mark as Cleared',
        requiresClearedDate: true,
        confirmationMessage: 'Mark this cheque as cleared? This will post the final ledger entry.',
        color: 'green',
    },
    {
        from: 'presented',
        to: 'bounced',
        label: 'Mark as Bounced',
        requiresBounceReason: true,
        confirmationMessage: 'Mark this cheque as bounced? The ledger will be reversed.',
        color: 'red',
    },
    {
        from: 'presented',
        to: 'cancelled',
        label: 'Cancel',
        confirmationMessage: 'Cancel this cheque in presented state?',
        color: 'slate',
    },
    {
        from: 'bounced',
        to: 'cancelled',
        label: 'Write Off',
        confirmationMessage: 'Write off this bounced cheque as cancelled?',
        color: 'slate',
    },
]

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get all valid transitions FROM a given status.
 * Used to render action buttons in the cheque detail view.
 */
export function getAvailableTransitions(from: ChequeStatus): ChequeTransition[] {
    return TRANSITIONS.filter(t => t.from === from)
}

/**
 * Check if a specific transition is allowed.
 */
export function isTransitionValid(from: ChequeStatus, to: ChequeStatus): boolean {
    return TRANSITIONS.some(t => t.from === from && t.to === to)
}

/**
 * Get the transition definition (for confirmation dialog copy and required fields).
 */
export function getTransition(from: ChequeStatus, to: ChequeStatus): ChequeTransition | null {
    return TRANSITIONS.find(t => t.from === from && t.to === to) ?? null
}

/**
 * Status display config — used for badges in both web and mobile.
 */
export const CHEQUE_STATUS_DISPLAY: Record<ChequeStatus, {
    label: string
    color: string
    bgColor: string
    borderColor: string
}> = {
    pending:   { label: 'Pending',   color: 'text-amber-700',   bgColor: 'bg-amber-50',   borderColor: 'border-amber-200' },
    presented: { label: 'Presented', color: 'text-blue-700',    bgColor: 'bg-blue-50',    borderColor: 'border-blue-200' },
    cleared:   { label: 'Cleared',   color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
    bounced:   { label: 'Bounced',   color: 'text-red-700',     bgColor: 'bg-red-50',     borderColor: 'border-red-200' },
    cancelled: { label: 'Cancelled', color: 'text-slate-500',   bgColor: 'bg-slate-50',   borderColor: 'border-slate-200' },
}

/**
 * True if the cheque is in a terminal state (no further transitions possible).
 */
export function isTerminalStatus(status: ChequeStatus): boolean {
    return status === 'cleared' || status === 'cancelled'
}
