/**
 * hooks/admin/useAdminDashboard.ts
 *
 * Phase 8: Admin dashboard hook.
 * Replaces the raw Supabase queries in admin/page.tsx.
 * Auto-refreshes every 30s (matches server cache TTL).
 */
"use client"

import { useState, useEffect, useCallback, useRef } from "react"

interface PlatformMetrics {
  total_mandis: number
  active_mandis: number
  trial_mandis: number
  grace_period_mandis: number
  suspended_mandis: number
  churn_risk_count: number
  negative_stock_count: number
  negative_ledger_count: number
  mrr: number
  arr: number
  health_score: number
  recent_audit_count: number
  critical_alerts_count: number
  system_status: 'healthy' | 'degraded' | 'critical'
}

const DEFAULT_METRICS: PlatformMetrics = {
  total_mandis: 0, active_mandis: 0, trial_mandis: 0,
  grace_period_mandis: 0, suspended_mandis: 0,
  churn_risk_count: 0, negative_stock_count: 0, negative_ledger_count: 0,
  mrr: 0, arr: 0, health_score: 100,
  recent_audit_count: 0, critical_alerts_count: 0, system_status: 'healthy'
}

export function useAdminMetrics(autoRefreshMs = 30_000) {
  const [metrics, setMetrics] = useState<PlatformMetrics>(DEFAULT_METRICS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/metrics')
      if (res.status === 403) {
        setError('Access denied — super admin required')
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: PlatformMetrics = await res.json()
      setMetrics(data)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      console.error('[useAdminMetrics]', err)
      setError('Failed to load platform metrics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
    if (autoRefreshMs > 0) {
      timerRef.current = setInterval(fetchMetrics, autoRefreshMs)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchMetrics, autoRefreshMs])

  return { metrics, loading, error, lastUpdated, refetch: fetchMetrics }
}
