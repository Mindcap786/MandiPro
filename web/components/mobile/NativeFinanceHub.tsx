"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { supabase } from "@/lib/supabaseClient"
import { cacheGet, cacheSet } from "@/lib/data-cache"
import { cn } from "@/lib/utils"
import {
    BookOpen, BarChart3, FileText, Scale, Wallet, Landmark,
    TrendingUp, TrendingDown, Receipt as ReceiptIcon, Users, ChevronRight, Activity,
    Search, RefreshCcw, Loader2, Bell, FileBarChart2,
    ShoppingCart, Tag, X, ChevronLeft, MessageCircle,
    Truck, Gavel, Store, RotateCcw, IndianRupee, Zap,
    PieChart, PackageSearch, LineChart, Tractor, UserCheck, MapPin,
    Warehouse, Settings, Shield, Palette, CreditCard, ShieldCheck, QrCode, Sliders,
    Briefcase,
} from "lucide-react"
import Link from "next/link"
import { NativeCard } from "@/components/mobile/NativeCard"
import { LedgerStatementDialog } from "@/components/finance/ledger-statement-dialog"

// ─── Constants ──────────────────────────────────────────────────────────────
const PAGE_SIZE = 15

const FILTER_TYPES = ['all', 'buyer', 'supplier'] as const
type FilterType = typeof FILTER_TYPES[number]
type SubFilter = 'all' | 'receivable' | 'payable'


// ─── Colour maps ──────────────────────────────────────────────────────────────
const FILTER_COLORS: Record<FilterType, string> = {
    all:      "#1A6B3C",
    buyer:    "#2563EB",
    supplier: "#D97706",
}
const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
    buyer:    { bg: "#EFF6FF", text: "#1D4ED8" },
    supplier: { bg: "#FFFBEB", text: "#B45309" },
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function NativeFinanceHub() {
    const { profile } = useAuth()
    const orgId = profile?.organization_id

    // ── Summary data ---------------------------------------------------------
    const [summary, setSummary] = useState<any>(() => {
        const c = orgId ? cacheGet<any>('finance_stats', orgId) : null
        return c?.summary || { receivables: 0, farmer_payables: 0, supplier_payables: 0, cash: { balance: 0 }, bank: { balance: 0 } }
    })
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    const [bankBalances, setBankBalances] = useState<Record<string, number>>({})
    const [loadingStats, setLoadingStats] = useState(false)

    // ── Party list -----------------------------------------------------------
    const [partyList, setPartyList] = useState<any[]>(() => {
        const c = orgId ? cacheGet<any>('finance_stats', orgId) : null
        return c?.partyList || []
    })
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(0)
    const [loadingList, setLoadingList] = useState(false)

    // ── Filters/search -------------------------------------------------------
    const [filterType, setFilterType] = useState<FilterType>('all')
    const [subFilter, setSubFilter] = useState<SubFilter>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')

    // ── Ledger dialog --------------------------------------------------------
    const [selectedParty, setSelectedParty] = useState<{ id: string; name: string; type?: string } | null>(null)

    // ── Bank sheet -----------------------------------------------------------
    const [showBankSheet, setShowBankSheet] = useState(false)

    // ── Debounce search -------------------------------------------------------
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 500)
        return () => clearTimeout(t)
    }, [searchQuery])

    // ── Fetch stats ----------------------------------------------------------
    const fetchStats = useCallback(async () => {
        if (!orgId) return
        setLoadingStats(true)
        try {
            const { data, error }: any = await (supabase.schema('mandi').rpc('get_financial_summary', { p_org_id: orgId }) as any)
            if (!error && data) {
                setSummary(data)
                const existing = cacheGet<any>('finance_stats', orgId) || {}
                cacheSet('finance_stats', orgId, { ...existing, summary: data })
            }
        } catch { } finally {
            setLoadingStats(false)
        }
    }, [orgId])

    // ── Fetch bank accounts --------------------------------------------------
    const fetchBankAccounts = useCallback(async () => {
        if (!orgId) return
        const { data: accounts } = await supabase
            .schema('mandi').from('accounts').select('id, name, opening_balance, description, account_sub_type')
            .eq('organization_id', orgId).eq('type', 'asset').eq('is_active', true)
            .or("account_sub_type.eq.bank,name.ilike.%bank%,name.ilike.%HDFC%,name.ilike.%SBI%").order('name')
        if (!accounts || accounts.length === 0) { setBankAccounts([]); setBankBalances({}); return }
        const filtered = accounts.filter((acc: any) => !/(transit|cheques?\s*in\s*hand)/i.test(acc.name))
        setBankAccounts(filtered)
        const ids = filtered.map((a: any) => a.id)
        const { data: entries } = await supabase.schema('mandi').from('ledger_entries')
            .select('account_id, debit, credit').in('account_id', ids).eq('organization_id', orgId)
        const map: Record<string, number> = {}
        ids.forEach((id: string) => { map[id] = 0 })
        ;(entries || []).forEach((e: any) => { map[e.account_id] = (map[e.account_id] || 0) + (Number(e.debit) - Number(e.credit)) })
        accounts.forEach((acc: any) => { map[acc.id] = (map[acc.id] || 0) + Number(acc.opening_balance || 0) })
        setBankBalances(map)
    }, [orgId])

    // ── Fetch party list -----------------------------------------------------
    const fetchParties = useCallback(async (pageNum: number) => {
        if (!orgId) return
        setLoadingList(true)
        try {
            const from = pageNum * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            let query = supabase.schema('mandi').from('view_party_balances')
                .select('*', { count: 'exact' }).eq('organization_id', orgId).range(from, to)
            if (filterType !== 'all') query = query.eq('contact_type', filterType)
            if (subFilter === 'receivable') query = query.gt('net_balance', 0)
            else if (subFilter === 'payable') query = query.lt('net_balance', 0)
            if (debouncedSearch) query = query.or(`contact_name.ilike.%${debouncedSearch}%,contact_city.ilike.%${debouncedSearch}%`)
            const { data, count, error }: any = await query
            if (!error && data) {
                setPartyList(data)
                setTotalCount(count || 0)
                const existing = cacheGet<any>('finance_stats', orgId) || {}
                cacheSet('finance_stats', orgId, { ...existing, partyList: data })
            }
        } catch { } finally { setLoadingList(false) }
    }, [orgId, filterType, subFilter, debouncedSearch])

    // ── On mount & filter changes --------------------------------------------
    useEffect(() => { fetchStats(); fetchBankAccounts() }, [orgId])
    useEffect(() => { setPage(0); fetchParties(0) }, [filterType, subFilter, debouncedSearch, orgId])

    // ── Derived values -------------------------------------------------------
    const totalBank = Object.values(bankBalances).reduce((s, v) => s + v, 0)
    const cashBal   = Number(summary?.cash?.balance || 0)
    const receivable       = Number(summary?.receivables || 0)
    const supplierPayable  = Math.abs(Number(summary?.supplier_payables || 0)) + Math.abs(Number(summary?.farmer_payables || 0))

    return (
        <div className="bg-[#F2F2F7] min-h-dvh pb-28">

            {/* ── Summary Cards ─────────────────────────────────────────── */}
            <div className="px-4 pt-3 pb-1">
                <div className="-mx-4 px-4 flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {/* Cash */}
                    <SummaryChip
                        label="Cash in Hand"
                        value={cashBal}
                        color="#D97706"
                        bg="#FFFBEB"
                        loading={loadingStats}
                    />
                    {/* Bank */}
                    <button onClick={() => setShowBankSheet(true)} className="flex-shrink-0 focus:outline-none">
                        <SummaryChip
                            label={`Bank Balance${bankAccounts.length > 0 ? ` (${bankAccounts.length})` : ''}`}
                            value={totalBank}
                            color="#2563EB"
                            bg="#EFF6FF"
                            loading={loadingStats}
                            arrow
                        />
                    </button>
                    {/* Receivable */}
                    <button onClick={() => { setFilterType('buyer'); setSubFilter('receivable') }} className="flex-shrink-0 focus:outline-none">
                        <SummaryChip
                            label="Receivable (Buyers)"
                            value={receivable}
                            color="#16A34A"
                            bg="#F0FDF4"
                            loading={loadingStats}
                            arrow
                        />
                    </button>
                    {/* Payables */}
                    <button onClick={() => { setFilterType('supplier'); setSubFilter('payable') }} className="flex-shrink-0 focus:outline-none">
                        <SummaryChip
                            label="Payables"
                            value={supplierPayable}
                            color="#DC2626"
                            bg="#FEF2F2"
                            loading={loadingStats}
                            arrow
                        />
                    </button>
                </div>
            </div>

            {/* ── Party Ledger Section ──────────────────────────────────── */}
            <div className="px-4 pt-3 pb-1">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">Party Balances</p>
                    <button
                        onClick={() => { fetchStats(); fetchBankAccounts(); fetchParties(page) }}
                        className="flex items-center gap-1 text-[#2563EB] text-xs font-bold active:opacity-60"
                    >
                        <RefreshCcw className={cn("w-3.5 h-3.5", loadingList && "animate-spin")} />
                        Refresh
                    </button>
                </div>

                {/* Filter Tabs — ALL / BUYER / SUPPLIER / FARMER */}
                <div className="-mx-4 px-4 flex gap-2 mb-3 overflow-x-auto scrollbar-none pb-0.5">
                    {FILTER_TYPES.map(f => (
                        <button
                            key={f}
                            onClick={() => { setFilterType(f); setPage(0) }}
                            className={cn(
                                "flex-shrink-0 px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-wider transition-all active:scale-95",
                                filterType === f
                                    ? "text-white shadow-sm"
                                    : "bg-white text-[#6B7280] border border-[#E5E7EB]"
                            )}
                            style={filterType === f ? { backgroundColor: FILTER_COLORS[f] } : {}}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {/* Sub-filter — ALL / RECEIVABLE / PAYABLE */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                    {(['all', 'receivable', 'payable'] as SubFilter[]).map(s => (
                        <button
                            key={s}
                            onClick={() => { setSubFilter(s); setPage(0) }}
                            className={cn(
                                "py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border",
                                subFilter === s
                                    ? "bg-[#1A6B3C] text-white border-transparent"
                                    : "bg-white text-[#6B7280] border-[#E5E7EB]"
                            )}
                        >
                            {s}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                    <input
                        className="w-full h-10 pl-9 pr-4 bg-white border border-[#E5E7EB] rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1A6B3C]/30"
                        placeholder="Search by name or city..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                            <X className="w-4 h-4 text-[#9CA3AF]" />
                        </button>
                    )}
                </div>

                {/* Party Cards */}
                <NativeCard divided>
                    {loadingList && partyList.length === 0 ? (
                        <div className="flex items-center justify-center gap-2 py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-[#1A6B3C]" />
                            <span className="text-sm font-semibold text-[#6B7280]">Loading...</span>
                        </div>
                    ) : partyList.length === 0 ? (
                        <div className="py-10 text-center text-sm font-semibold text-[#9CA3AF]">
                            No parties matching filters
                        </div>
                    ) : partyList.map(row => (
                        <button
                            key={row.contact_id}
                            onClick={() => setSelectedParty({ id: row.contact_id, name: row.contact_name, type: row.contact_type })}
                            className="w-full text-left flex items-center gap-3 px-4 py-3.5 active:bg-[#F2F2F7] transition-colors"
                        >
                            {/* Type Badge */}
                            <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: TYPE_BADGE[row.contact_type]?.bg || '#F3F4F6' }}
                            >
                                <span
                                    className="text-[9px] font-black uppercase"
                                    style={{ color: TYPE_BADGE[row.contact_type]?.text || '#374151' }}
                                >
                                    {row.contact_type?.charAt(0).toUpperCase()}
                                </span>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[#1A1A2E] truncate">{row.contact_name}</p>
                                <p className="text-xs text-[#9CA3AF] mt-0.5 flex items-center gap-1">
                                    <span
                                        className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase"
                                        style={{
                                            backgroundColor: TYPE_BADGE[row.contact_type]?.bg,
                                            color: TYPE_BADGE[row.contact_type]?.text
                                        }}
                                    >
                                        {row.contact_type}
                                    </span>
                                    {row.contact_city && <span className="truncate">{row.contact_city}</span>}
                                </p>
                            </div>

                            {/* Balance */}
                            <div className="flex flex-col items-end flex-shrink-0">
                                <span
                                    className="text-sm font-black font-mono"
                                    style={{ color: row.net_balance >= 0 ? '#16A34A' : '#DC2626' }}
                                >
                                    ₹{Math.abs(row.net_balance).toLocaleString('en-IN')}
                                </span>
                                <span className="text-[9px] font-black uppercase" style={{ color: row.net_balance >= 0 ? '#86EFAC' : '#FCA5A5' }}>
                                    {row.net_balance >= 0 ? 'DR' : 'CR'}
                                </span>
                            </div>

                            {/* WhatsApp quick share */}
                            <button
                                onClick={e => {
                                    e.stopPropagation()
                                    const bal = Math.abs(row.net_balance || 0).toLocaleString('en-IN')
                                    const side = (row.net_balance || 0) >= 0 ? 'DR' : 'CR'
                                    const text = `*Balance: ${row.contact_name}*\nOutstanding: ₹${bal} ${side}\nCity: ${row.contact_city || '-'}`
                                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
                                }}
                                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#F0FDF4] flex-shrink-0 active:opacity-60"
                            >
                                <MessageCircle className="w-4 h-4 text-[#16A34A]" />
                            </button>
                        </button>
                    ))}
                </NativeCard>

                {/* Pagination */}
                {totalCount > PAGE_SIZE && (
                    <div className="flex items-center justify-between mt-3 px-1">
                        <p className="text-[10px] text-[#9CA3AF] font-semibold">
                            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                        </p>
                        <div className="flex gap-2">
                            <button
                                disabled={page === 0}
                                onClick={() => { const p = page - 1; setPage(p); fetchParties(p) }}
                                className="w-8 h-8 bg-white rounded-xl border border-[#E5E7EB] flex items-center justify-center disabled:opacity-30 active:bg-[#F2F2F7]"
                            >
                                <ChevronLeft className="w-4 h-4 text-[#374151]" />
                            </button>
                            <button
                                disabled={(page + 1) * PAGE_SIZE >= totalCount}
                                onClick={() => { const p = page + 1; setPage(p); fetchParties(p) }}
                                className="w-8 h-8 bg-white rounded-xl border border-[#E5E7EB] flex items-center justify-center disabled:opacity-30 active:bg-[#F2F2F7]"
                            >
                                <ChevronRight className="w-4 h-4 text-[#374151]" />
                            </button>
                        </div>
                    </div>
                )}
            </div>


            {/* ── Bank Accounts Bottom Sheet ────────────────────────────── */}
            {showBankSheet && (
                <div
                    className="fixed inset-0 bg-black/40 z-50 flex items-end"
                    onClick={() => setShowBankSheet(false)}
                >
                    <div
                        className="w-full bg-white rounded-t-3xl max-h-[70vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-[#F2F2F7] flex items-center justify-between">
                            <div>
                                <p className="text-base font-black text-[#1A1A2E]">Bank Accounts</p>
                                <p className="text-xs text-[#6B7280] font-semibold mt-0.5">
                                    Total: ₹{totalBank.toLocaleString('en-IN')}
                                </p>
                            </div>
                            <button onClick={() => setShowBankSheet(false)} className="w-8 h-8 bg-[#F2F2F7] rounded-full flex items-center justify-center">
                                <X className="w-4 h-4 text-[#374151]" />
                            </button>
                        </div>
                        <div className="p-4 space-y-3">
                            {bankAccounts.length === 0 ? (
                                <p className="text-center text-sm text-[#9CA3AF] py-6">No bank accounts found</p>
                            ) : bankAccounts.map((acc: any) => {
                                let meta: any = {}
                                try { meta = JSON.parse(acc.description || '{}') } catch { }
                                return (
                                    <div key={acc.id} className="bg-[#EFF6FF] rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-[#1A1A2E]">{acc.name}</p>
                                            {meta.bank_name && <p className="text-xs text-[#6B7280] mt-0.5">{meta.bank_name}</p>}
                                            {meta.account_number && <p className="text-xs text-[#6B7280]">A/C: {meta.account_number}</p>}
                                        </div>
                                        <span className="text-base font-black text-[#1D4ED8] font-mono flex-shrink-0">
                                            ₹{(bankBalances[acc.id] || 0).toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Ledger Statement Dialog ───────────────────────────────── */}
            <LedgerStatementDialog
                isOpen={!!selectedParty}
                onClose={() => setSelectedParty(null)}
                contactId={selectedParty?.id || ''}
                contactName={selectedParty?.name || ''}
                contactType={selectedParty?.type || ''}
                organizationId={orgId}
            />
        </div>
    )
}

// ─── Summary Chip ─────────────────────────────────────────────────────────────
function SummaryChip({
    label, value, color, bg, loading, arrow
}: { label: string; value: number; color: string; bg: string; loading?: boolean; arrow?: boolean }) {
    return (
        <div
            className="flex-shrink-0 rounded-2xl px-4 py-3 min-w-[140px]"
            style={{ backgroundColor: bg }}
        >
            <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color }}>
                {label} {arrow && <ChevronRight className="inline w-2.5 h-2.5" />}
            </p>
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color }} />
            ) : (
                <p className="text-base font-black font-mono text-[#1A1A2E]">
                    ₹{value.toLocaleString('en-IN')}
                </p>
            )}
        </div>
    )
}
