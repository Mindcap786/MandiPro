"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, ArrowUpRight, Loader2, Download, MessageCircle, RefreshCcw, Wallet, Landmark, Search, ChevronLeft, ChevronRight, Printer } from "lucide-react";

import { motion } from "framer-motion";
import { LedgerStatementDialog } from "./ledger-statement-dialog";
import { AdjustBalanceDialog } from "./opening-balance-dialog";
import { Input } from "@/components/ui/input";
import { PrintableFinancialReport } from "./printable-financial-report";
import SmartShareFinanceButton from "./smart-share-finance-button";
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import { summarizeVoucherHealth } from "@/lib/finance/voucher-integrity";

export default function FinancialDashboard() {
    const { profile } = useAuth();
    const { branding } = usePlatformBranding();

    // Pre-load from cache for instant render on re-navigation
    const orgId = profile?.organization_id;
    const cachedFinance = orgId ? cacheGet<any>('finance_stats', orgId) : null;

    // 1. Data States
    const [partyList, setPartyList] = useState<any[]>(cachedFinance?.partyList || []);
    const [summary, setSummary] = useState<any>(cachedFinance?.summary || {
        receivables: 0, farmer_payables: 0, supplier_payables: 0,
        cash: { id: null, balance: 0, name: '' }, bank: { id: null, balance: 0, name: '' }
    });
    const [bankAccounts, setBankAccounts] = useState<any[]>(cachedFinance?.bankAccounts || []);
    const [bankBalances, setBankBalances] = useState<Record<string, number>>(cachedFinance?.bankBalances || {});
    const [voucherHealth, setVoucherHealth] = useState<{ imbalancedCount: number; worstImbalance: number } | null>(null);

    // 2. Pagination & Status States
    const PAGE_SIZE = 10;
    const [page, setPage] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const [loadingList, setLoadingList] = useState(false);
    const [loadingStats, setLoadingStats] = useState(false);
    const [loadingPrint, setLoadingPrint] = useState(false);
    const [printData, setPrintData] = useState<any[]>([]);
    const printRef = useRef<HTMLDivElement>(null);

    // 3. Selection & Filter States
    const [selectedParty, setSelectedParty] = useState<{ id: string, name: string, type?: string } | null>(null);
    const [filterType, setFilterType] = useState<'all' | 'buyer' | 'supplier' | 'farmer'>('all');
    const [subFilter, setSubFilter] = useState<'all' | 'receivable' | 'payable'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const loadTimeout = useRef<any>(null);

    useEffect(() => {
        if (!orgId) return;

        const cached = cacheGet<any>('finance_stats', orgId);
        if (!cached) return;

        setPartyList(cached.partyList || []);
        setSummary(cached.summary || {
            receivables: 0, farmer_payables: 0, supplier_payables: 0,
            cash: { id: null, balance: 0, name: '' }, bank: { id: null, balance: 0, name: '' }
        });
        setBankAccounts(cached.bankAccounts || []);
        setBankBalances(cached.bankBalances || {});
    }, [orgId]);

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Initial Stats Fetch
    useEffect(() => {
        if (profile?.organization_id) {
            fetchStats();
            fetchBankAccounts();
            fetchVoucherHealth();
        }

        // RE-FETCH ON FOCUS: Ensure data is fresh if user was away or in another tab
        const onFocus = () => {
            if (profile?.organization_id) {
                fetchStats();
                fetchBankAccounts();
                fetchVoucherHealth();
            }
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [profile?.organization_id]);

    // Scan the last 90 days of ledger entries for vouchers whose Dr ≠ Cr.
    // This runs once on mount and on focus — it's a cheap integrity check so
    // we can warn the mandi owner about corrupt vouchers that would otherwise
    // silently inflate the KPIs on this page.
    const fetchVoucherHealth = useCallback(async () => {
        if (!profile?.organization_id) return;
        try {
            const since = new Date();
            since.setDate(since.getDate() - 90);
            const { data, error } = await supabase
                .schema('mandi')
                .from('ledger_entries')
                .select('voucher_id, debit, credit')
                .eq('organization_id', profile.organization_id)
                .gte('entry_date', since.toISOString())
                .limit(50000);
            if (error || !data) return;
            const health = summarizeVoucherHealth(data as any);
            setVoucherHealth({
                imbalancedCount: health.imbalancedCount,
                worstImbalance: health.worstImbalance,
            });
        } catch (e) {
            console.error('[VoucherHealth]', e);
        }
    }, [profile?.organization_id]);

    // Reset Page on Filter Change — stale-while-revalidate pattern
    useEffect(() => {
        setPage(0);
        // Clear the list only if it's a structural change (org/search) to give immediate feedback
        if (debouncedSearch) setPartyList([]); 
        fetchParties(0);
    }, [filterType, subFilter, debouncedSearch, profile?.organization_id]);

    // Fetch Lightweight Stats
    const fetchStats = useCallback(async () => {
        if (!profile?.organization_id) { setLoadingStats(false); return; }
        // background revalidation on mount (even if cache is fresh)
        // if (!cacheIsStale('finance_stats', profile.organization_id)) return;
        setLoadingStats(true);
        try {
            // FIX: Add cache-busting parameter to prevent 304 Not Modified responses
            // 304s cause empty data because browser cache is stale
            const timestamp = Date.now();
            const { data, error }: any = await (supabase
                .schema('mandi')
                .rpc('get_financial_summary', {
                    p_org_id: profile.organization_id,
                    // @ts-ignore - cache bust parameter
                    _cache_bust: timestamp
                }) as any);
            if (!error && data) {
                setSummary(data);
                // Save stats to cache (bank data added by fetchBankAccounts)
                const existing = cacheGet<any>('finance_stats', profile.organization_id) || {};
                cacheSet('finance_stats', profile.organization_id, { ...existing, summary: data });
            }
        } catch (error) {
            console.error("Finance Stats Error:", error);
        } finally {
            setLoadingStats(false);
        }
    }, [profile?.organization_id]);

    const fetchBankAccounts = async () => {
        if (!profile?.organization_id) return;
        // Background revalidation on mount
        // if (!cacheIsStale('finance_stats', profile.organization_id)) return;

        // FIX: Add cache-busting to prevent 304 responses with empty data
        const timestamp = Date.now();

        const { data: accounts } = await supabase
            .schema('mandi')
            .from('accounts')
            .select('id, name, opening_balance, description, account_sub_type')
            .eq('organization_id', profile.organization_id)
            .eq('type', 'asset')
            .eq('is_active', true)
            .or("account_sub_type.eq.bank,name.ilike.%bank%,name.ilike.%HDFC%,name.ilike.%SBI%")
            .order('name')
            .then(res => {
                // Force cache revalidation on every fetch
                return { ...res, count: timestamp };
            });

        if (!accounts || accounts.length === 0) {
            setBankAccounts([]);
            setBankBalances({});
            return;
        }

        const transitRegex = /(transit|cheques?\s*in\s*hand)/i;
        const filteredAccounts = accounts.filter(acc => !transitRegex.test(acc.name));

        if (filteredAccounts.length === 0) {
            setBankAccounts([]);
            setBankBalances({});
            return;
        }

        setBankAccounts(filteredAccounts);
        const ids = filteredAccounts.map((a: any) => a.id);
        const { data: entries } = await supabase
            .schema('mandi')
            .from('ledger_entries')
            .select('account_id, debit, credit')
            .in('account_id', ids)
            .eq('organization_id', profile.organization_id)
            .then(res => {
                // Force cache revalidation
                return { ...res, _ts: timestamp };
            });
        const map: Record<string, number> = {};
        ids.forEach((id: string) => { map[id] = 0; });
        (entries || []).forEach((e: any) => {
            map[e.account_id] = (map[e.account_id] || 0) + (Number(e.debit) - Number(e.credit));
        });
        accounts.forEach((acc: any) => {
            map[acc.id] = (map[acc.id] || 0) + Number(acc.opening_balance || 0);
        });
        setBankBalances(map);
        // Save to cache
        const existing = cacheGet<any>('finance_stats', profile.organization_id) || {};
        cacheSet('finance_stats', profile.organization_id, { ...existing, bankAccounts: accounts, bankBalances: map });
    };

    // Fetch Paginated List with total count for pagination controls
    const fetchParties = useCallback(async (pageNumber: number) => {
        if (!profile?.organization_id) {
            setLoadingList(false);
            return;
        }

        setLoadingList(true);
        try {
            const from = pageNumber * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            // FORCE FRESH: Add cache-busting parameter to prevent 304 Not Modified
            const timestamp = Date.now();

            let query = supabase
                .schema('mandi')
                .from('view_party_balances')
                .select('*', { count: 'exact' })
                .eq('organization_id', profile.organization_id)
                .range(from, to)
                .order('net_balance', { ascending: false }) // Sort by highest outstanding
                .order('contact_name');

            if (filterType !== 'all') {
                query = query.eq('contact_type', filterType);
            }

            if (subFilter === 'receivable') {
                query = query.gt('net_balance', 0.01);
            } else if (subFilter === 'payable') {
                query = query.lt('net_balance', -0.01);
            }

            if (debouncedSearch) {
                query = query.or(`contact_name.ilike.%${debouncedSearch}%,contact_city.ilike.%${debouncedSearch}%`);
            }

            const { data, error, count }: any = await query.then(res => {
                return { ...res, _cache_bust: timestamp };
            });

            if (error) {
                console.error("Dashboard List Error:", error);
                throw error;
            }

            if (data) {
                setPartyList(data);
                setTotalCount(count || 0);
                
                // Update cache with fresh data
                const existing = cacheGet<any>('finance_stats', profile.organization_id) || {};
                cacheSet('finance_stats', profile.organization_id, { ...existing, partyList: data });
            }
        } catch (error) {
            console.error("Dashboard List Fetch Failed:", error);
        } finally {
            setLoadingList(false);
        }
    }, [profile?.organization_id, filterType, subFilter, debouncedSearch, PAGE_SIZE]);

    const handlePrintReport = async () => {
        setLoadingPrint(true);
        try {
            let query = supabase
                .schema('mandi')
                .from('view_party_balances')
                .select('*')
                .eq('organization_id', profile?.organization_id);

            if (filterType !== 'all') query = query.eq('contact_type', filterType);
            if (subFilter === 'receivable') query = query.gt('net_balance', 0);
            else if (subFilter === 'payable') query = query.lt('net_balance', 0);
            if (debouncedSearch) query = query.or(`contact_name.ilike.%${debouncedSearch}%,contact_city.ilike.%${debouncedSearch}%`);

            const { data: reportData, error }: any = await query;
            if (error) throw error;
            if (!reportData || reportData.length === 0) {
                alert("No data available for this report.");
                return;
            }

            const { generateFinancePDF } = await import('@/lib/generate-finance-pdf');
            const { printBlob } = await import('@/lib/capacitor-share');
            const blob = await generateFinancePDF(
                reportData,
                filterType,
                subFilter,
                profile?.organization?.name || 'MandiGrow Organisation',
                branding
            );
            const label = filterType === 'all' ? 'All_Parties' :
                filterType.charAt(0).toUpperCase() + filterType.slice(1) + 's';
            const filename = `${label}_Balances_${new Date().toISOString().slice(0,10)}.pdf`;
            await printBlob(blob, filename);
        } catch (e: any) {
            console.error('[PrintReport]', e);
            alert(`Failed to generate report: ${e?.message || e}`);
        } finally {
            setLoadingPrint(false);
        }
    };

    const totalReceivable = Number(summary.receivables || 0);
    const totalFarmerPayable = Math.abs(Number(summary.farmer_payables || 0));
    const totalSupplierPayable = Math.abs(Number(summary.supplier_payables || 0));

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <>
            <motion.div
                initial="hidden"
                animate="show"
                variants={containerVariants}
                className="space-y-8 p-8 pb-24 print:hidden"
            >
                {/* Header Actions */}
                <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none opacity-50"></div>
                    <div className="relative z-10">
                        <h1 className="text-4xl font-[1000] text-slate-800 tracking-tighter uppercase mb-2">
                            Financials
                        </h1>
                        <p className="text-slate-500 font-bold text-lg flex items-center gap-2">
                            <Landmark className="w-5 h-5 text-[#0C831F]" />
                            Company Balances & Ledgers
                        </p>
                    </div>
                    <div className="flex gap-4 relative z-10">
                        <Button
                            onClick={() => {
                                fetchStats();
                                fetchParties(page);
                            }}
                            variant="outline"
                            size="icon"
                            className="rounded-xl border-slate-200 hover:bg-slate-50 text-slate-400 bg-white shadow-sm"
                        >
                            <RefreshCcw className={cn("w-5 h-5", (loadingList || loadingStats) && "animate-spin")} />
                        </Button>
                        <SmartShareFinanceButton 
                            orgId={profile?.organization_id || ""}
                            filterType={filterType}
                            subFilter={subFilter}
                            searchQuery={debouncedSearch}
                            organizationName={profile?.organization?.name || "MandiGrow Organization"}
                            branding={branding}
                        />
                        <Button
                            disabled={loadingPrint}
                            onClick={handlePrintReport}
                            className="bg-black text-white hover:bg-slate-800 font-bold gap-2 min-w-[180px] shadow-lg rounded-xl transition-all active:scale-95"
                        >
                            {loadingPrint ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                            {filterType === 'all' ? 'Print All Balances' : `Print ${filterType.charAt(0).toUpperCase() + filterType.slice(1)} Balances`}
                        </Button>
                    </div>
                </motion.div>

                {/* Data Health Banner — surfaces imbalanced vouchers in the last
                    90 days so the owner knows the KPIs below may be affected by
                    corrupt data. Links the fix back to the Day Book + audit SQL. */}
                {voucherHealth && voucherHealth.imbalancedCount > 0 && (
                    <motion.div variants={itemVariants} className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5 flex items-start gap-4">
                        <div className="flex-shrink-0 mt-0.5">
                            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-xl">⚠️</div>
                        </div>
                        <div className="flex-1">
                            <p className="font-black text-amber-800 text-sm uppercase tracking-wide">
                                {voucherHealth.imbalancedCount} voucher{voucherHealth.imbalancedCount === 1 ? '' : 's'} with broken double-entry (last 90 days)
                            </p>
                            <p className="text-xs text-amber-700 font-medium mt-1 leading-relaxed">
                                These vouchers have Debit ≠ Credit (largest imbalance: ₹{Math.round(voucherHealth.worstImbalance).toLocaleString('en-IN')}).
                                Open the <b>Day Book</b> to see them marked ⚠️, and run{' '}
                                <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-[10px]">scripts/audit-daybook-and-finance.sql</code> (Q1) for the exact voucher IDs.
                            </p>
                        </div>
                    </motion.div>
                )}

                {/* KPI Cards — single row, compact & equal */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {/* Cash in Hand */}
                    <LiquidAssetCard
                        organizationId={profile?.organization_id}
                        type="cash"
                        initialData={summary.cash}
                        loading={loadingStats}
                        onRefresh={fetchStats}
                    />

                    {/* Bank Balance — compact, click for details */}
                    {bankAccounts.length === 0 ? (
                        <LiquidAssetCard
                            organizationId={profile?.organization_id}
                            type="bank"
                            initialData={summary.bank}
                            loading={loadingStats}
                            onRefresh={fetchStats}
                        />
                    ) : (
                        <>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Card className="bg-blue-50 border border-blue-100 shadow-sm rounded-2xl overflow-hidden cursor-pointer hover:shadow-md hover:border-blue-200 transition-all">
                                        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-blue-700 flex items-center gap-1.5">
                                                <Landmark className="w-3.5 h-3.5" /> Bank Balance
                                            </CardTitle>
                                            <span className="text-[9px] text-blue-400 font-black uppercase tracking-widest">{bankAccounts.length} accts</span>
                                        </CardHeader>
                                        <CardContent className="px-4 pb-4">
                                            <div className="text-2xl font-black text-slate-800 tracking-tighter">
                                                ₹{Object.values(bankBalances).reduce((s, v) => s + v, 0).toLocaleString('en-IN')}
                                            </div>
                                            <p className="text-[10px] text-blue-400 font-bold mt-1 uppercase tracking-widest">Tap to view details →</p>
                                        </CardContent>
                                    </Card>
                                </DialogTrigger>
                                <DialogContent className="bg-white rounded-3xl border-slate-200 p-0 max-w-md">
                                    <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
                                        <DialogTitle className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
                                            <Landmark className="w-5 h-5 text-blue-600" /> Bank Accounts
                                        </DialogTitle>
                                        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                                            Total: ₹{Object.values(bankBalances).reduce((s, v) => s + v, 0).toLocaleString('en-IN')}
                                        </p>
                                    </DialogHeader>
                                    <div className="px-6 py-4 space-y-3">
                                        {bankAccounts.map((acc: any) => {
                                            // Parse JSON description safely
                                            let bankMeta: any = {};
                                            try { bankMeta = JSON.parse(acc.description || '{}'); } catch { }
                                            const bankName = bankMeta?.bank_name || '';
                                            const acctNum = bankMeta?.account_number || '';
                                            const ifsc = bankMeta?.ifsc_code || '';
                                            const hasDetails = bankName || acctNum || ifsc;

                                            return (
                                                <div key={acc.id} className="bg-blue-50 rounded-2xl px-4 py-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-slate-800">{acc.name}</p>
                                                            {hasDetails && (
                                                                <div className="text-[10px] text-slate-400 font-medium mt-0.5 space-y-0.5">
                                                                    {bankName && <p>Bank: {bankName}</p>}
                                                                    {acctNum && <p>A/C: {acctNum}</p>}
                                                                    {ifsc && <p>IFSC: {ifsc}</p>}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                            <span className="text-base font-black text-blue-700 font-mono">
                                                                ₹{(bankBalances[acc.id] || 0).toLocaleString('en-IN')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </>
                    )}

                    {/* Receivable */}
                    <Card className="bg-emerald-50 border border-emerald-100 shadow-sm hover:shadow-md transition-all rounded-2xl group">
                        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                Receivable (Buyers)
                            </CardTitle>
                            <div className="p-1 rounded-lg bg-emerald-100/50 group-hover:bg-emerald-100 transition-colors">
                                <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                            </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <div className={cn(
                                "font-black text-slate-800",
                                (loadingStats ? 0 : totalReceivable).toLocaleString('en-IN').length > 10 ? "text-lg" : "text-2xl"
                            )}>
                                {loadingStats ? (
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                                        <span className="text-slate-300">₹0</span>
                                    </div>
                                ) : (
                                    <>₹{totalReceivable.toLocaleString('en-IN')}</>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payable Farmers */}
                    <Card className="bg-rose-50 border border-rose-100 shadow-sm hover:shadow-md transition-all rounded-2xl group">
                        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-rose-700">
                                Payable (Farmers)
                            </CardTitle>
                            <div className="p-1 rounded-lg bg-rose-100/50 group-hover:bg-rose-100 transition-colors">
                                <ArrowUpRight className="h-3.5 w-3.5 text-rose-600" />
                            </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <div className={cn(
                                "font-black text-slate-800",
                                (loadingStats ? 0 : totalFarmerPayable).toLocaleString('en-IN').length > 10 ? "text-lg" : "text-2xl"
                            )}>
                                {loadingStats ? (
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                                        <span className="text-slate-300">₹0</span>
                                    </div>
                                ) : (
                                    <>₹{totalFarmerPayable.toLocaleString('en-IN')}</>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payable Suppliers */}
                    <Card className="bg-orange-50 border border-orange-100 shadow-sm hover:shadow-md transition-all rounded-2xl group">
                        <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-700">
                                Payable (Suppliers)
                            </CardTitle>
                            <div className="p-1 rounded-lg bg-orange-100/50 group-hover:bg-orange-100 transition-colors">
                                <ArrowUpRight className="h-3.5 w-3.5 text-orange-600" />
                            </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <div className={cn(
                                "font-black text-slate-800",
                                totalSupplierPayable.toLocaleString('en-IN').length > 10 ? "text-lg" : "text-2xl"
                            )}>
                                ₹{totalSupplierPayable.toLocaleString('en-IN')}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Unified Ledger View */}
                <motion.div variants={itemVariants} className="space-y-4">
                    <div className="flex flex-col gap-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4 relative z-10">
                            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit border border-slate-200 shadow-inner">
                                {['all', 'buyer', 'supplier', 'farmer'].map((filter) => (
                                    <button
                                        key={filter}
                                        onClick={() => setFilterType(filter as any)}
                                        className={cn(
                                            "px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                                            filterType === filter
                                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                                                : 'text-slate-500 hover:text-emerald-600 hover:bg-white/50'
                                        )}
                                    >
                                        {filter}
                                    </button>
                                ))}
                            </div>

                            <div className="relative flex-1 max-w-md w-full">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Search by name or city..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-11 bg-slate-50 border-slate-200 h-11 rounded-xl text-slate-800 font-bold focus:ring-emerald-500 focus:border-emerald-500 transition-all placeholder:text-slate-400 shadow-inner"
                                />
                            </div>

                            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit border border-slate-200 shadow-inner">
                                {(['all', 'receivable', 'payable'] as const).map((sub) => (
                                    <button
                                        key={sub}
                                        onClick={() => setSubFilter(sub)}
                                        className={cn(
                                            "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                            subFilter === sub
                                                ? 'bg-white text-emerald-700 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-700'
                                        )}
                                    >
                                        {sub}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-inner bg-slate-50/30">
                            <table className="w-full text-left">
                                <thead className="bg-white/80 backdrop-blur-sm border-b border-slate-100">
                                    <tr>
                                        <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Context</th>
                                        <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Party Name</th>
                                        <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">City</th>
                                        <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Outstanding</th>
                                        <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {loadingList && partyList.length === 0 ? (
                                        <tr><td colSpan={5} className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs animate-pulse">Loading Ledgers...</td></tr>
                                    ) : partyList.length === 0 ? (
                                        <tr><td colSpan={5} className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No records matching filters</td></tr>
                                    ) : partyList.map((row) => (
                                        <tr key={row.contact_id}
                                            onClick={() => setSelectedParty({ id: row.contact_id, name: row.contact_name, type: row.contact_type })}
                                            className="hover:bg-emerald-50/50 cursor-pointer transition-colors group border-transparent">
                                            <td className="p-5">
                                                <span className={cn(
                                                    "px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border",
                                                    row.contact_type === 'buyer' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                        row.contact_type === 'farmer' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                            'bg-amber-50 text-amber-600 border-amber-100'
                                                )}>
                                                    {row.contact_type}
                                                </span>
                                            </td>
                                            <td className="p-5 font-black text-slate-800 text-lg tracking-tight group-hover:text-emerald-700 transition-colors">
                                                {row.contact_name}
                                            </td>
                                            <td className="p-5 text-slate-400 font-bold text-sm tracking-wide">
                                                {row.contact_city || '-'}
                                            </td>
                                            <td className={cn(
                                                "p-5 text-right font-mono font-black text-xl",
                                                row.net_balance >= 0 ? "text-emerald-600" : "text-rose-600"
                                            )}>
                                                ₹ {Math.abs(row.net_balance).toLocaleString('en-IN')}
                                                <span className="text-[10px] ml-1 opacity-50 font-black">
                                                    {row.net_balance >= 0 ? 'DR' : 'CR'}
                                                </span>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex justify-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all duration-300">
                                                    <Button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedParty({ id: row.contact_id, name: row.contact_name, type: row.contact_type });
                                                        }}
                                                        size="sm" variant="ghost" className="w-9 h-9 p-0 text-slate-400 hover:text-emerald-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-slate-100"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const bal = Math.abs(row.net_balance || 0).toLocaleString('en-IN');
                                                            const side = (row.net_balance || 0) >= 0 ? 'DR' : 'CR';
                                                            const text = `*Balance Statement: ${row.contact_name}*\nOutstanding: ₹${bal} ${side}\nCity: ${row.contact_city || '-'}`;
                                                            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                                                        }}
                                                        size="sm" variant="ghost" className="w-9 h-9 p-0 text-slate-400 hover:text-emerald-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-slate-100"
                                                    >
                                                        <MessageCircle className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pagination Controls */}
                    {totalCount > PAGE_SIZE && (
                        <div className="flex items-center justify-between pt-4 px-1">
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} parties
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={() => {
                                        const prev = page - 1;
                                        setPage(prev);
                                        fetchParties(prev);
                                    }}
                                    disabled={page === 0 || loadingList}
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9 rounded-xl border-slate-200 bg-white shadow-sm disabled:opacity-40"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>

                                {/* Page number pills */}
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.ceil(totalCount / PAGE_SIZE) }, (_, i) => i)
                                        .filter(i => Math.abs(i - page) <= 2)
                                        .map(i => (
                                            <button
                                                key={i}
                                                onClick={() => { setPage(i); fetchParties(i); }}
                                                disabled={loadingList}
                                                className={cn(
                                                    "h-9 min-w-[36px] px-3 rounded-xl text-xs font-black transition-all",
                                                    i === page
                                                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-200"
                                                        : "bg-white border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700"
                                                )}
                                            >
                                                {i + 1}
                                            </button>
                                        ))
                                    }
                                </div>

                                <Button
                                    onClick={() => {
                                        const next = page + 1;
                                        setPage(next);
                                        fetchParties(next);
                                    }}
                                    disabled={(page + 1) * PAGE_SIZE >= totalCount || loadingList}
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9 rounded-xl border-slate-200 bg-white shadow-sm disabled:opacity-40"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </motion.div>

                <LedgerStatementDialog
                    isOpen={!!selectedParty}
                    onClose={() => setSelectedParty(null)}
                    contactId={selectedParty?.id || ''}
                    contactName={selectedParty?.name || ''}
                    contactType={selectedParty?.type || ''}
                    organizationId={profile?.organization_id}
                />
            </motion.div >

            {/* Printable Report Component - Hidden in screen view, visible in print */}
            < PrintableFinancialReport
                ref={printRef}
                data={printData}
                filterType={filterType}
                subFilter={subFilter}
                organizationName={profile?.organization?.name || "MandiGrow Organization"}
                branding={branding}
            />
        </>
    );
}

function LiquidAssetCard({
    organizationId,
    type,
    initialData,
    loading,
    onRefresh
}: {
    organizationId?: string,
    type: 'cash' | 'bank',
    initialData?: { id: string | null, balance: number, name: string },
    loading: boolean,
    onRefresh: () => void
}) {
    const isCash = type === 'cash';
    const balance = initialData?.balance || 0;
    const accountId = initialData?.id;
    const accountName = initialData?.name || (isCash ? 'Cash' : 'Bank');

    return (
        <Card className={cn(
            "p-0 border shadow-sm rounded-2xl hover:translate-y-[-4px] transition-all group overflow-hidden",
            isCash ? 'bg-amber-50 border-amber-100' : 'bg-blue-50 border-blue-100'
        )}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-white/40 pt-6 px-6">
                <CardTitle className={cn(
                    "text-[10px] font-black uppercase tracking-widest flex items-center gap-2",
                    isCash ? 'text-amber-700' : 'text-blue-700'
                )}>
                    {isCash ? 'Cash In Hand' : 'Bank Balance'}
                </CardTitle>
                <div className={cn(
                    "p-1.5 rounded-lg bg-white/60",
                    isCash ? 'text-amber-500' : 'text-blue-500'
                )}>
                    <Wallet className="h-4 w-4" />
                </div>
            </CardHeader>
            <CardContent className="pt-4 pb-6 px-6">
                {loading ? <Loader2 className="h-6 w-6 animate-spin text-slate-400" /> : (
                    <div className={cn(
                        "font-black text-slate-800 transition-all duration-300",
                        balance.toLocaleString('en-IN').length > 12 ? "text-lg" :
                            balance.toLocaleString('en-IN').length > 10 ? "text-xl" :
                                "text-2xl"
                    )}>
                        ₹ {balance.toLocaleString('en-IN')}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
