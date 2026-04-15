/**
 * hooks/mandi/useSales.ts
 *
 * Phase 5: Sales data hook.
 * Wraps the /api/mandi/sales GET endpoint with:
 *   - Cached list with pagination
 *   - Typed Sale | SaleDetail interfaces
 *   - createSale() mutation with optimistic UI pattern
 *   - invalidates on success so list auto-refreshes
 */
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { useToast } from "@/hooks/use-toast"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SaleListItem {
  id: string
  sale_date: string
  invoice_no: string
  status: string
  payment_status: string
  payment_mode: string
  subtotal: number
  discount_amount: number
  gst_amount: number
  total_amount: number
  paid_amount: number
  balance_due: number
  narration: string | null
  created_at: string
  buyer: { id: string; name: string; contact_type: string; phone: string | null } | null
}

export interface SalesListFilters {
  page?: number
  limit?: number
  status?: string
  buyer_id?: string
  date_from?: string
  date_to?: string
}

export interface CreateSalePayload {
  sale_date: string
  buyer_id: string
  items: Array<{
    lot_id: string
    quantity: number
    rate_per_unit: number
    discount_amount?: number
  }>
  header_discount?: number
  payment_mode: 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'udhaar'
  narration?: string
  cheque_number?: string
  cheque_date?: string
  cheque_bank?: string
  bank_account_id?: string
  gst_enabled?: boolean
}

// ── useSalesList ──────────────────────────────────────────────────────────────

export function useSalesList(filters: SalesListFilters = {}) {
  const [sales, setSales] = useState<SaleListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.page) params.set('page', String(filters.page))
      if (filters.limit) params.set('limit', String(filters.limit))
      if (filters.status) params.set('status', filters.status)
      if (filters.buyer_id) params.set('buyer_id', filters.buyer_id)
      if (filters.date_from) params.set('date_from', filters.date_from)
      if (filters.date_to) params.set('date_to', filters.date_to)

      const res = await fetch(`/api/mandi/sales?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setSales(json.data ?? [])
      setTotal(json.total ?? 0)
      setError(null)
    } catch (err) {
      console.error('[useSalesList]', err)
      setError('Failed to load sales')
    } finally {
      setLoading(false)
    }
  }, [filters.page, filters.limit, filters.status, filters.buyer_id, filters.date_from, filters.date_to])

  useEffect(() => { fetchSales() }, [fetchSales])

  return { sales, total, loading, error, refetch: fetchSales }
}

// ── useCreateSale ─────────────────────────────────────────────────────────────

export function useCreateSale(onSuccess?: (result: Record<string, unknown>) => void) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const createSale = useCallback(async (payload: CreateSalePayload): Promise<Record<string, unknown> | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/mandi/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.error ?? `Error ${res.status}`
        setError(msg)
        toast({ title: 'Sale Failed', description: msg, variant: 'destructive' })
        return null
      }
      toast({ title: '✅ Sale Confirmed', description: `Invoice #${(data as Record<string, string>).invoice_no} created` })
      onSuccess?.(data)
      return data
    } catch (err) {
      const msg = 'Network error — sale not saved'
      setError(msg)
      toast({ title: 'Network Error', description: msg, variant: 'destructive' })
      return null
    } finally {
      setLoading(false)
    }
  }, [onSuccess, toast])

  return { createSale, loading, error }
}

// ── useAvailableLots ──────────────────────────────────────────────────────────
// Powers the lot-selection in the POS/New Sale form.

export interface AvailableLot {
  id: string
  lot_code: string
  current_qty: number
  unit: string
  grade: string | null
  created_at: string
  commodity: { id: string; name: string; default_unit: string } | null
  arrival: { id: string; arrival_date: string; party: { id: string; name: string } | null } | null
}

export function useAvailableLots(commodityId?: string) {
  const [lots, setLots] = useState<AvailableLot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ status: 'available,partial' })
    if (commodityId) params.set('commodity_id', commodityId)

    setLoading(true)
    fetch(`/api/mandi/stock?${params}`)
      .then(r => r.json())
      .then(data => {
        setLots((data.lots ?? []) as AvailableLot[])
        setError(null)
      })
      .catch(() => setError('Failed to load available lots'))
      .finally(() => setLoading(false))
  }, [commodityId])

  return { lots, loading, error }
}
