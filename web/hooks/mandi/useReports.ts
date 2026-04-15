/**
 * hooks/mandi/useReports.ts
 *
 * Phase 6+7: Report hooks — Day Book, Party Ledger, P&L.
 * All fetch from typed API routes. PrintableLedger and day-book components
 * receive data from these hooks instead of making raw Supabase calls.
 */
"use client"

import { useState, useEffect, useCallback } from "react"
import type { DayBookResponse, LedgerReportResponse } from "@/../packages/contracts/src"

// ── useDayBook ────────────────────────────────────────────────────────────────

export function useDayBook(date: string | null, mode: 'cash' | 'bank' | 'all' = 'all') {
  const [data, setData] = useState<DayBookResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!date) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ date, mode })
      const res = await window.fetch(`/api/mandi/reports/daybook?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch {
      setError('Failed to load day book')
    } finally {
      setLoading(false)
    }
  }, [date, mode])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

// ── usePartyLedger ────────────────────────────────────────────────────────────

export function usePartyLedger(partyId: string | null, dateFrom: string | null, dateTo: string | null) {
  const [data, setData] = useState<LedgerReportResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!partyId || !dateFrom || !dateTo) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ party_id: partyId, date_from: dateFrom, date_to: dateTo })
      const res = await window.fetch(`/api/mandi/reports/ledger?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch {
      setError('Failed to load ledger')
    } finally {
      setLoading(false)
    }
  }, [partyId, dateFrom, dateTo])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

// ── usePnlReport ──────────────────────────────────────────────────────────────

export interface PnlSummary {
  date_from: string
  date_to: string
  gross_revenue: number
  total_commission: number
  total_market_fees: number
  total_expenses: number
  net_profit: number
  by_commodity: Array<{
    commodity_id: string
    commodity_name: string
    gross_revenue: number
    net_profit: number
    lots_sold: number
  }>
}

export function usePnlReport(dateFrom: string | null, dateTo: string | null, commodityId?: string) {
  const [data, setData] = useState<PnlSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
      if (commodityId) params.set('commodity_id', commodityId)
      const res = await window.fetch(`/api/mandi/reports/pnl?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch {
      setError('Failed to load P&L report')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, commodityId])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}
