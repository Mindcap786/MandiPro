"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { supabase } from "@/lib/supabaseClient"
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache"
import { cn } from "@/lib/utils"
import {
    BookOpen, BarChart3, FileText, Scale, Wallet, Landmark,
    TrendingUp, TrendingDown, Receipt as ReceiptIcon, Users, ChevronRight, Activity,
    Search, RefreshCcw, Loader2, Bell, FileBarChart2,
    ShoppingCart, Tag, X, ChevronLeft, MessageCircle,
    Truck, Gavel, Store, RotateCcw, IndianRupee, Zap,
    PieChart, PackageSearch, LineChart, Tractor, UserCheck, MapPin,
    Warehouse, Settings, Shield, Palette, CreditCard, ShieldCheck, QrCode, Sliders,
    Briefcase, ArrowDownLeft, ArrowUpRight
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
    // ── Fetch stats ----------------------------------------------------------
    const fetchStats = useCallback(async (isManualRefresh = false) => {
        if (!orgId) return
        const isStale = cacheIsStale('finance_stats', orgId)
        if (!isStale && !isManualRefresh && summary.receivables !== 0) return

        if (!isManualRefresh && !summary.receivables) setLoadingStats(true)
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
    }, [orgId, summary.receivables])

    // ── Fetch bank accounts --------------------------------------------------
    const fetchBankAccounts = useCallback(async () => {
        if (!orgId) return
        // Use the cache if available and not manual
        const cached = cacheGet<any>('finance_bank_accounts', orgId)
        if (cached && !cacheIsStale('finance_bank_accounts', orgId)) {
            setBankAccounts(cached.accounts || [])
            setBankBalances(cached.balances || {})
            return
        }

        const { data: accounts } = await supabase
            .schema('mandi').from('accounts').select('id, name, opening_balance, description, account_sub_type')
            .eq('organization_id', orgId).eq('type', 'asset').eq('is_active', true)
            .or("account_sub_type.eq.bank,name.ilike.%bank%,name.ilike.%HDFC%,name.ilike.%SBI%").order('name')
        
        if (!accounts || accounts.length === 0) { 
            setBankAccounts([])
            setBankBalances({})
            return 
        }

        const filtered = accounts.filter((acc: any) => !/(transit|cheques?\s*in\s*hand)/i.test(acc.name))
        
        // Optimized check: Instead of fetching ALL ledger entries, we fetch current balance per account
        const { data: currentBalances } = await supabase
            .schema('mandi')
            .from('ledger_entries')
            .select('account_id, debit, credit')
            .in('account_id', filtered.map(a => a.id))
            .eq('organization_id', orgId)
            .eq('status', 'active')

        const map: Record<string, number> = {}
        filtered.forEach((acc: any) => { 
            const entries = (currentBalances || []).filter(e => e.account_id === acc.id)
            const balance = entries.reduce((s, e) => s + (Number(e.debit) - Number(e.credit)), 0)
            map[acc.id] = Number(acc.opening_balance || 0) + balance
        })

        setBankAccounts(filtered)
        setBankBalances(map)
        cacheSet('finance_bank_accounts', orgId, { accounts: filtered, balances: map })
    }, [orgId])

    // ── Fetch party list -----------------------------------------------------
    const fetchParties = useCallback(async (pageNum: number, isManualRefresh = false) => {
        if (!orgId) return
        
        const cacheKey = `finance_parties_${filterType}_${subFilter}_${debouncedSearch}_${pageNum}`
        const isStale = cacheIsStale(cacheKey, orgId)
        
        if (!isStale && !isManualRefresh && partyList.length > 0) return

        if (!isManualRefresh && partyList.length === 0) setLoadingList(true)
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
                cacheSet(cacheKey, orgId, { data, count })
            }
        } catch { } finally { setLoadingList(false) }
    }, [orgId, filterType, subFilter, debouncedSearch, partyList.length])

    // ── On mount & filter changes --------------------------------------------
    useEffect(() => { 
        if (orgId) {
            fetchStats()
            fetchBankAccounts()
        }
    }, [orgId, fetchStats, fetchBankAccounts])

    useEffect(() => { 
        if (orgId) {
            setPage(0)
            fetchParties(0)
        }
    }, [filterType, subFilter, debouncedSearch, orgId, fetchParties])

    // ── Derived values -------------------------------------------------------
    const totalBank = Object.values(bankBalances).reduce((s, v) => s + v, 0)
    const cashBal   = Number(summary?.cash?.balance || 0)
    const receivable       = Number(summary?.receivables || 0)
    const supplierPayable  = Math.abs(Number(summary?.supplier_payables || 0)) + Math.abs(Number(summary?.farmer_payables || 0))

    return (
        <div className="bg-[#F2F2F7] min-h-dvh pb-28">
            {/* ── Mobile Header ─────────────────────────────────────────── */}
            <div className="bg-white px-4 pt-6 pb-4 border-b border-slate-100 shadow-sm sticky top-0 z-40">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">Financial Hub</h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Business Liquidity & Party Balances</p>
                    </div>
                </div>
            </div>

            {/* ── Summary Cards (Horizontal Scroll) ─────────────────────── */}
            <div className="px-4 pt-4 pb-2">
                <div className="-mx-4 px-4 flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {/* Cash */}
                    <SummaryChip
                        label="Cash in Hand"
                        value={cashBal}
                        color="#D97706"
                        bg="#FFFBEB"
                        icon={<Activity className="w-3 h-3" />}
                        loading={loadingStats}
                    />
                    {/* Bank */}
                    <button onClick={() => setShowBankSheet(true)} className="flex-shrink-0 focus:outline-none">
                        <SummaryChip
                            label={`Bank Balance`}
                            value={totalBank}
                            color="#2563EB"
                            bg="#EFF6FF"
                            icon={<Landmark className="w-3 h-3" />}
                            loading={loadingStats}
                            arrow
                        />
                    </button>
                    {/* Receivable */}
                    <button onClick={() => { setFilterType('buyer'); setSubFilter('receivable') }} className="flex-shrink-0 focus:outline-none">
                        <SummaryChip
                            label="Receivable"
                            value={receivable}
                            color="#16A34A"
                            bg="#F0FDF4"
                            icon={<ArrowDownLeft className="w-3 h-3" />}
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
                            icon={<ArrowUpRight className="w-3 h-3" />}
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
                                "flex-shrink-0 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 border-2",
                                filterType === f
                                    ? "text-white shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1)] border-transparent"
                                    : "bg-white text-[#6B7280] border-[#E5E7EB]"
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
                <div className="space-y-3">
                    {loadingList && partyList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
                            <Loader2 className="w-8 h-8 animate-spin text-[#1A6B3C]" />
                            <span className="text-xs font-black text-[#6B7280] uppercase tracking-widest animate-pulse">Filtering Parties...</span>
                        </div>
                    ) : partyList.length === 0 ? (
                        <div className="py-16 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100 flex flex-col items-center gap-3">
                            <Search className="w-10 h-10 text-slate-100" />
                            <p className="text-xs font-black text-[#9CA3AF] uppercase tracking-widest">No parties matching filters</p>
                        </div>
                    ) : partyList.map(row => (
                        <NativeCard
                            key={row.contact_id}
                            divided={false}
                            className="p-4 active:scale-[0.98] transition-all"
                            onClick={() => setSelectedParty({ id: row.contact_id, name: row.contact_name, type: row.contact_type })}
                        >
                            <div className="flex items-center gap-4">
                                {/* Type Avatar */}
                                <div
                                    className="w-12 h-12 rounded-[1.25rem] flex items-center justify-center flex-shrink-0 shadow-sm border border-black/5"
                                    style={{ backgroundColor: TYPE_BADGE[row.contact_type]?.bg || '#F3F4F6' }}
                                >
                                    <span
                                        className="text-sm font-black text-slate-800"
                                        style={{ color: TYPE_BADGE[row.contact_type]?.text || '#374151' }}
                                    >
                                        {row.contact_name?.charAt(0).toUpperCase()}
                                    </span>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-sm font-black text-[#1A1A2E] truncate leading-none">{row.contact_name}</h3>
                                        <span className="text-[8px] font-black uppercase tracking-tighter bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded border border-slate-200">
                                            {row.contact_type}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-tight flex items-center gap-1">
                                        <MapPin className="w-2.5 h-2.5" />
                                        {row.contact_city || 'No City'}
                                    </p>
                                </div>

                                {/* Balance */}
                                <div className="text-right flex flex-col items-end pr-1">
                                    <p
                                        className="text-base font-[1000] tracking-tighter leading-none mb-1"
                                        style={{ color: row.net_balance >= 0 ? '#16A34A' : '#DC2626' }}
                                    >
                                        ₹{Math.abs(row.net_balance).toLocaleString('en-IN')}
                                    </p>
                                    <span 
                                        className={cn(
                                            "text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest border",
                                            row.net_balance >= 0 ? "bg-[#DCFCE7] text-[#16A34A] border-[#BBF7D0]" : "bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]"
                                        )}
                                    >
                                        {row.net_balance >= 0 ? 'NAAM (DR)' : 'JAMA (CR)'}
                                    </span>
                                </div>

                                {/* WhatsApp shortcut */}
                                <button
                                    onClick={e => {
                                        e.stopPropagation()
                                        const bal = Math.abs(row.net_balance || 0).toLocaleString('en-IN')
                                        const side = (row.net_balance || 0) >= 0 ? 'DR' : 'CR'
                                        const text = `*Balance Summary: ${row.contact_name}*\nOutstanding: ₹${bal} ${side}\nCity: ${row.contact_city || '-'}\n\n_Sent via MandiPro_`
                                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
                                    }}
                                    className="w-10 h-10 rounded-full bg-[#F0FDF4] border border-[#DCFCE7] flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform ml-1"
                                >
                                    <MessageCircle className="w-5 h-5 text-[#16A34A]" />
                                </button>
                            </div>
                        </NativeCard>
                    ))}
                </div>

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
    label, value, color, bg, loading, arrow, icon
}: { label: string; value: number; color: string; bg: string; loading?: boolean; arrow?: boolean; icon?: React.ReactNode }) {
    return (
        <div
            className="flex-shrink-0 rounded-[2rem] px-5 py-4 min-w-[160px] shadow-sm border border-black/5 relative overflow-hidden transition-transform active:scale-95"
            style={{ backgroundColor: bg }}
        >
            <div className="absolute top-0 right-0 w-16 h-16 opacity-5 bg-black rounded-full -mr-8 -mt-8"></div>
            <div className="flex items-center gap-2 mb-1.5 overflow-hidden">
                <span className="shrink-0" style={{ color }}>{icon}</span>
                <p className="text-[9px] font-black uppercase tracking-widest truncate" style={{ color }}>
                    {label}
                </p>
                {arrow && <ChevronRight className="shrink-0 w-2.5 h-2.5 ml-auto" style={{ color }} />}
            </div>
            {loading ? (
                <div className="h-6 flex items-center">
                    <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: color, borderTopColor: 'transparent' }} />
                </div>
            ) : (
                <p className="text-lg font-[1000] font-mono tracking-tighter text-[#1A1A2E] leading-none">
                    ₹{Math.abs(value).toLocaleString('en-IN')}
                </p>
            )}
        </div>
    )
}
