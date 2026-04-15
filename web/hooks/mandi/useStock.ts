/**
 * hooks/mandi/useStock.ts
 *
 * Phase 7: Stock management hook.
 * Powers the /stock page with live lot data and commodity summary.
 */
"use client"

import { useState, useEffect, useCallback } from "react"
import type { StockResponse, StockSummary } from "@/../packages/contracts/src"

export interface StockFilters {
  commodity_id?: string
  status?: string      // comma-separated: 'available,partial'
  include_empty?: boolean
}

export function useStock(filters: StockFilters = {}) {
  const [data, setData] = useState<StockResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStock = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.commodity_id) params.set('commodity_id', filters.commodity_id)
      if (filters.status) params.set('status', filters.status)
      if (filters.include_empty) params.set('include_empty', 'true')

      const res = await fetch(`/api/mandi/stock?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch {
      setError('Failed to load stock data')
    } finally {
      setLoading(false)
    }
  }, [filters.commodity_id, filters.status, filters.include_empty])

  useEffect(() => { fetchStock() }, [fetchStock])

  return {
    lots: data?.lots ?? [],
    summary: data?.summary ?? [] as StockSummary[],
    loading,
    error,
    refetch: fetchStock,
  }
}
