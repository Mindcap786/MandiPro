/**
 * hooks/mandi/useCheques.ts
 *
 * Phase 6: Cheque management hooks.
 * Powers /finance/payments (cheque tab) and cheque details dialogs.
 *
 * Integrates with the cheque state machine from packages/domain.
 */
"use client"

import { useState, useEffect, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  getAvailableTransitions,
  isTerminalStatus,
  CHEQUE_STATUS_DISPLAY,
  type ChequeStatus,
} from "@/../packages/domain/src/finance/cheque-state-machine"
import type { Cheque } from "@/../packages/contracts/src"

export type { ChequeStatus }
export { getAvailableTransitions, isTerminalStatus, CHEQUE_STATUS_DISPLAY }

export interface ChequeFilters {
  status?: ChequeStatus
  cheque_type?: 'issued' | 'received'
  date_from?: string
  date_to?: string
  page?: number
  limit?: number
}

// ── useChequesList ────────────────────────────────────────────────────────────

export function useChequesList(filters: ChequeFilters = {}) {
  const [cheques, setCheques] = useState<Cheque[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCheques = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.cheque_type) params.set('cheque_type', filters.cheque_type)
      if (filters.date_from) params.set('date_from', filters.date_from)
      if (filters.date_to) params.set('date_to', filters.date_to)
      if (filters.page) params.set('page', String(filters.page))
      if (filters.limit) params.set('limit', String(filters.limit))

      const res = await fetch(`/api/mandi/cheques?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setCheques(json.data ?? [])
      setTotal(json.total ?? 0)
      setError(null)
    } catch {
      setError('Failed to load cheques')
    } finally {
      setLoading(false)
    }
  }, [filters.status, filters.cheque_type, filters.date_from, filters.date_to, filters.page, filters.limit])

  useEffect(() => { fetchCheques() }, [fetchCheques])
  return { cheques, total, loading, error, refetch: fetchCheques }
}

// ── useTransitionCheque ───────────────────────────────────────────────────────

export interface TransitionPayload {
  next_status: ChequeStatus
  cleared_date?: string
  bounce_reason?: string
}

export function useTransitionCheque(chequeId: string, onSuccess?: (newStatus: ChequeStatus) => void) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const transition = useCallback(async (payload: TransitionPayload): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/mandi/cheques/${chequeId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.error ?? `Error ${res.status}`
        setError(msg)
        toast({ title: 'Transition Failed', description: msg, variant: 'destructive' })
        return false
      }
      const display = CHEQUE_STATUS_DISPLAY[payload.next_status]
      toast({ title: `Cheque ${display.label}`, description: 'Status updated and ledger posted' })
      onSuccess?.(payload.next_status)
      return true
    } catch {
      const msg = 'Network error — cheque not updated'
      setError(msg)
      toast({ title: 'Network Error', description: msg, variant: 'destructive' })
      return false
    } finally {
      setLoading(false)
    }
  }, [chequeId, onSuccess, toast])

  return { transition, loading, error }
}
