/**
 * hooks/mandi/useArrivalsMasterData.ts
 *
 * Phase 4: Arrivals master data hook.
 * Replaces the fragile fetchMasterData() inside arrivals-form.tsx.
 * Uses SWR-like stale-while-revalidate via the existing data-cache + Supabase direct
 * (until full API route migration in Phase 4b).
 *
 * UI stays 100% identical — same contacts/items/banks/settings state shape.
 */
"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabaseClient"
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache"

const CACHE_KEY = 'arrivals_form_master'
const SCHEMA = 'mandi'

export interface ArrivalContact {
  id: string
  name: string
  type: string
  city?: string | null
}

export interface ArrivalCommodity {
  id: string
  name: string
  local_name?: string | null
  sku_code?: string | null
  default_unit: string
  custom_attributes?: Record<string, unknown> | null
}

export interface StorageLocation {
  name: string
  is_active: boolean
}

export interface BankAccount {
  id: string
  name: string
  description?: string | null
  is_default?: boolean
}

export interface ArrivalMasterData {
  contacts: ArrivalContact[]
  commodities: ArrivalCommodity[]
  storageLocations: StorageLocation[]
  bankAccounts: BankAccount[]
  defaultCommissionRate: number
  marketFeePercent: number
  nirashritPercent: number
  miscFeePercent: number
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useArrivalsMasterData(organizationId: string | undefined): ArrivalMasterData {
  const [contacts, setContacts] = useState<ArrivalContact[]>([])
  const [commodities, setCommodities] = useState<ArrivalCommodity[]>([])
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [defaultCommissionRate, setDefaultCommissionRate] = useState(0)
  const [marketFeePercent, setMarketFeePercent] = useState(0)
  const [nirashritPercent, setNirashritPercent] = useState(0)
  const [miscFeePercent, setMiscFeePercent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!organizationId) { setLoading(false); return }

    // 1. Serve from cache immediately if available
    const cached = cacheGet<{
      contacts: ArrivalContact[]
      commodities: ArrivalCommodity[]
      storage: StorageLocation[]
      banks: BankAccount[]
      settings: { commission_rate_default?: number; market_fee_percent?: number; nirashrit_percent?: number; misc_fee_percent?: number }
    }>(CACHE_KEY, organizationId)

    if (cached) {
      setContacts(cached.contacts || [])
      setCommodities(cached.commodities || [])
      setStorageLocations(sortLocations(cached.storage || []))
      setBankAccounts(filterBanks(cached.banks || []))
      setDefaultCommissionRate(Number(cached.settings?.commission_rate_default || 0))
      setMarketFeePercent(Number(cached.settings?.market_fee_percent || 0))
      setNirashritPercent(Number(cached.settings?.nirashrit_percent || 0))
      setMiscFeePercent(Number(cached.settings?.misc_fee_percent || 0))
      setLoading(false)
      if (!cacheIsStale(CACHE_KEY, organizationId)) return
    }

    // 2. Background / foreground fetch from Supabase
    try {
      const [contactsRes, commoditiesRes, storageRes, bankRes, settingsRes] = await Promise.allSettled([
        supabase.schema(SCHEMA).from("contacts").select("id, name, type, city")
          .eq("organization_id", organizationId).in("type", ["farmer", "supplier"]).order("name"),
        supabase.schema(SCHEMA).from("commodities").select("id, name, local_name, sku_code, default_unit, custom_attributes")
          .eq("organization_id", organizationId).order("name"),
        supabase.schema(SCHEMA).from("storage_locations").select("name, is_active")
          .eq("organization_id", organizationId).eq("is_active", true),
        supabase.schema(SCHEMA).from("accounts").select("id, name, description, is_default")
          .eq("organization_id", organizationId).eq("account_sub_type", "bank")
          .eq("type", "asset").eq("is_active", true).order("name"),
        supabase.schema(SCHEMA).from("mandi_settings" as never).select("commission_rate_default, market_fee_percent, nirashrit_percent, misc_fee_percent")
          .eq("organization_id", organizationId).maybeSingle(),
      ])

      const newContacts = contactsRes.status === 'fulfilled' ? (contactsRes.value.data || []) as ArrivalContact[] : contacts
      const newCommodities = commoditiesRes.status === 'fulfilled' ? (commoditiesRes.value.data || []) as ArrivalCommodity[] : commodities
      const newStorage = storageRes.status === 'fulfilled' ? (storageRes.value.data || []) as StorageLocation[] : []
      const newBanks = bankRes.status === 'fulfilled' ? (bankRes.value.data || []) as BankAccount[] : []
      const newSettings = settingsRes.status === 'fulfilled' ? (settingsRes.value as { data: Record<string, number | null> }).data : null

      setContacts(newContacts)
      setCommodities(newCommodities)
      setStorageLocations(sortLocations(newStorage))
      setBankAccounts(filterBanks(newBanks))
      setDefaultCommissionRate(Number(newSettings?.commission_rate_default || 0))
      setMarketFeePercent(Number(newSettings?.market_fee_percent || 0))
      setNirashritPercent(Number(newSettings?.nirashrit_percent || 0))
      setMiscFeePercent(Number(newSettings?.misc_fee_percent || 0))

      cacheSet(CACHE_KEY, organizationId, {
        contacts: newContacts,
        commodities: newCommodities,
        storage: newStorage,
        banks: newBanks,
        settings: newSettings || {},
      })
      setError(null)
    } catch (err) {
      console.error("[useArrivalsMasterData]", err)
      setError("Failed to load form data")
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => { fetch() }, [fetch])

  return {
    contacts, commodities, storageLocations, bankAccounts,
    defaultCommissionRate, marketFeePercent, nirashritPercent, miscFeePercent,
    loading, error, refetch: fetch,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sortLocations(locs: StorageLocation[]): StorageLocation[] {
  const unique = Array.from(new Map(locs.map(l => [l.name, l])).values())
  return unique.sort((a, b) => {
    if (a.name === 'Mandi (Yard)') return -1
    if (b.name === 'Mandi (Yard)') return 1
    if (a.name === 'Cold Storage') return -1
    if (b.name === 'Cold Storage') return 1
    return a.name.localeCompare(b.name)
  })
}

function filterBanks(banks: BankAccount[]): BankAccount[] {
  return banks.filter(b =>
    !b.name.toLowerCase().includes('cheques in hand') &&
    !b.name.toLowerCase().includes('transit')
  )
}
