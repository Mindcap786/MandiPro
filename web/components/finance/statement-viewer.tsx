"use client";

import { useEffect, useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Download, Printer, Search, ArrowLeft, MessageCircle, X, ArrowDownLeft, ArrowUpRight, Loader2, Wallet, Activity, Calendar as CalendarIconLucide, TrendingUp } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
// @react-pdf/renderer loaded on-demand — not on initial mount
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import { isNativePlatform } from "@/lib/capacitor-utils";
import { NativeCard } from "@/components/mobile/NativeCard";
import { NativeSectionLabel } from "@/components/mobile/NativeInput";
import { cn } from "@/lib/utils";
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache";
import { formatCurrency } from "@/lib/accounting-logic";

interface StatementViewerProps {
    contactId: string;
    contactName?: string;
    contactType?: string; // 'buyer' | 'supplier' | 'farmer'
    onClose?: () => void;
}

export default function StatementViewer({ contactId, contactName, contactType, onClose }: StatementViewerProps) {
    const { profile } = useAuth();
    const { branding } = usePlatformBranding();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => {
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        return {
            from: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start of month
            to: endOfDay // End of current day
        };
    });
    const [data, setData] = useState<{
        opening_balance: number;
        closing_balance: number;
        last_activity?: string;
        transactions: any[];
    } | null>(() => {
        if (typeof window === 'undefined') return null;
        const orgId = profile?.organization_id;
        if (!orgId || !contactId) return null;
        
        // Try to get initially cached data for the current date range
        const cacheKey = `ledger_${contactId}_${format(dateRange.from, 'yyyyMMdd')}_${format(dateRange.to, 'yyyyMMdd')}`;
        return cacheGet<any>(cacheKey, orgId);
    });

    const [isPrinting, setIsPrinting] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const formatLedgerDesc = (tx: any) => {
        // Use the narration directly from DB — it's now pre-enriched by post_arrival_ledger
        const rawDesc = (tx.narration || tx.description || tx.particulars || '').trim();
        // Clean trailing .0000 floats for readability
        let desc = rawDesc.replace(/(\d+)\.0+(?=\s|[A-Za-z]|$)/g, '$1');
        
        // Return the DB narration if it has useful content (not a UUID reference)
        if (desc && !desc.match(/^[0-9a-fA-F-]{36}$/)) {
            return desc;
        }

        // Fallback: build from products if narration is empty/UUID
        if (tx.products && Array.isArray(tx.products) && tx.products.length > 0) {
            const detailStr = tx.products
                .filter((p: any) => p.name)
                .map((p: any) => `${p.name} ${p.qty || 0} ${p.unit || ''}`.trim())
                .join(', ');
            if (detailStr) return detailStr;
        }

        return 'Transaction';
    };

    // Build the entries array the same way for both PDF download and PDF print
    const buildPDFEntries = (transactions: any[], openingBalance: number) => {
        let runningBal = openingBalance;
        return (transactions || []).map(tx => {
            const debit = Number(tx.debit || 0);
            const credit = Number(tx.credit || 0);
            runningBal = Number(tx.running_balance ?? (runningBal + (debit - credit)));
            
            // Build products array from RPC response (now standardized as 'products' key)
            let resolvedProducts: any[] = [];
            if (Array.isArray(tx.products)) {
                resolvedProducts = tx.products.map((p: any) => ({
                    name: p.name || '',
                    qty: Number(p.qty || 0),
                    unit: p.unit || '',
                    rate: Number(p.rate || 0),
                    amount: Number(p.amount || 0)
                }));
            }
            
            return {
                entry_date: tx.date || tx.created_at || tx.entry_date,
                description: formatLedgerDesc(tx),
                debit,
                credit,
                running_balance: runningBal,
                line_items: tx.line_items || '',
                products: resolvedProducts,
                charges: tx.charges || []
            };
        });
    };

    const buildPDFDoc = async () => {
        const { pdf } = await import('@react-pdf/renderer');
        const { LedgerPDFReport } = await import('./ledger-pdf-report');
        const React = await import('react');
        const entries = buildPDFEntries(data!.transactions || [], data!.opening_balance || 0);
        const doc = React.createElement(LedgerPDFReport, {
            organization: profile?.organization,
            contactName: contactName || 'Statement',
            startDate: dateRange.from,
            endDate: dateRange.to,
            openingBalance: data!.opening_balance || 0,
            entries,
            summary: {
                totalDebit: (data!.transactions || []).reduce((s: number, tx: any) => s + Number(tx.debit || 0), 0),
                totalCredit: (data!.transactions || []).reduce((s: number, tx: any) => s + Number(tx.credit || 0), 0),
                finalBalance: data!.closing_balance || 0,
            },
            branding,
        });
        return { pdf, doc };
    };

    const handlePrint = async () => {
        if (!data || isPrinting) return;
        setIsPrinting(true);
        try {
            const { pdf, doc } = await buildPDFDoc();
            const { printBlob } = await import('@/lib/capacitor-share');
            const blob = await pdf(doc as any).toBlob();
            await printBlob(blob, `Statement-${contactName}-${format(dateRange.from, 'ddMMMyy')}.pdf`);
        } catch (e) {
            console.error('[StatementPrint]', e);
        } finally {
            setIsPrinting(false);
        }
    };

    const [isDownloading, setIsDownloading] = useState(false);
    const handlePDFDownload = async () => {
        if (!data || isDownloading) return;
        setIsDownloading(true);
        try {
            const { pdf, doc } = await buildPDFDoc();
            const blob = await pdf(doc as any).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Statement-${contactName}-${format(dateRange.from, 'ddMMMyy')}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('[StatementDownload]', e);
        } finally {
            setIsDownloading(false);
        }
    };

    const fetchStatement = async (retryCount = 0, isManualRefresh = false) => {
        const currentOrgId = String(profile?.organization_id || "");
        if (!currentOrgId || currentOrgId === '[object Object]' || currentOrgId === 'undefined' || !contactId) return;

        const cacheKey = `ledger_${contactId}_${format(dateRange.from, 'yyyyMMdd')}_${format(dateRange.to, 'yyyyMMdd')}`;
        const isStale = cacheIsStale(cacheKey, currentOrgId);

        // If not stale and we already have data, skip the fetch unless it's a manual refresh
        if (!isStale && !isManualRefresh && data && data.transactions.length > 0) {
            setLoading(false);
            return;
        }

        // Abort previous request if any
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        // Only show full loading if we have no cached data
        if (!data || isManualRefresh) setLoading(true);

        try {
            const rpcName = 'get_ledger_statement';
            const { data: rpcData, error } = await supabase.rpc(rpcName, {
                p_organization_id: currentOrgId,
                p_contact_id: contactId,
                p_from_date: format(dateRange.from, 'yyyy-MM-dd'),
                p_to_date: format(dateRange.to, 'yyyy-MM-dd')
            }).abortSignal(signal);

            if (signal.aborted) return;
            
            if (error) {
                console.error("RPC Error (get_ledger_statement):", error);
                toast({
                    title: "Ledger Loading Failed",
                    description: error.message || "Failed to retrieve transactions from database.",
                    variant: "destructive"
                });
                throw error;
            }

            if (rpcData && Array.isArray(rpcData.transactions)) {
                const processed = {
                    opening_balance: rpcData.opening_balance || 0,
                    closing_balance: rpcData.closing_balance || 0,
                    last_activity: rpcData.last_activity,
                    transactions: rpcData.transactions
                };
                setData(processed);
                cacheSet(cacheKey, currentOrgId, processed);
            } else {
                const empty = {
                    opening_balance: 0,
                    closing_balance: 0,
                    last_activity: undefined,
                    transactions: []
                };
                setData(empty);
                cacheSet(cacheKey, currentOrgId, empty);
            }

        } catch (e: any) {
            if (e.name === 'AbortError' || e.message?.includes('aborted')) {
                if (abortControllerRef.current === controller && retryCount < 2) {
                    setTimeout(() => fetchStatement(retryCount + 1), 1000);
                    return;
                }
            } else {
                console.error("Statement Fetch Error:", e);
            }
        } finally {
            if (abortControllerRef.current === controller) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        fetchStatement();
        return () => abortControllerRef.current?.abort();
    }, [contactId, dateRange.from, dateRange.to]);

    const asNumber = (value: any) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
    };

    if (isNativePlatform()) {
        return (
            <div className="flex flex-col h-full bg-[#F2F2F7]">
                {/* ── Mobile Header ─────────────────────────────────────────── */}
                <div className="bg-white px-4 py-5 border-b border-slate-100 shadow-sm sticky top-0 z-40 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {onClose && (
                            <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center active:scale-90 transition-transform">
                                <ArrowLeft className="w-5 h-5 text-slate-800" />
                            </button>
                        )}
                        <div>
                            <h2 className="text-lg font-black text-slate-900 tracking-tight leading-none mb-1">Statement</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate max-w-[150px]">
                                {contactName}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="bg-slate-50 border-slate-200 h-10 px-3 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-wider"
                                >
                                    <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />
                                    {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 border-none rounded-3xl overflow-hidden shadow-2xl" align="end">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange.from}
                                    selected={dateRange as any}
                                    onSelect={(val: any) => {
                                        if (val?.from) {
                                            const fromDate = new Date(val.from);
                                            fromDate.setHours(0, 0, 0, 0);
                                            const toDate = val.to ? new Date(val.to) : new Date(val.from);
                                            toDate.setHours(23, 59, 59, 999);
                                            setDateRange({ from: fromDate, to: toDate });
                                        }
                                    }}
                                    className="bg-white text-black font-bold p-4"
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pb-24">
                    {/* ── Mobile Summary Horizontal Scroll ──────────────────────── */}
                    <div className="px-4 pt-4 pb-2">
                        <div className="-mx-4 px-4 flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            {/* Closing Balance */}
                            <div className={cn(
                                "flex-shrink-0 rounded-[2rem] px-5 py-4 min-w-[200px] shadow-lg relative overflow-hidden text-white transition-all",
                                (data?.closing_balance || 0) >= 0 ? "bg-emerald-600 shadow-emerald-100" : "bg-rose-600 shadow-rose-100"
                            )}>
                                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -mr-12 -mt-12 opacity-40"></div>
                                <p className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-80">Closing Balance</p>
                                <p className="text-xl font-[1000] font-mono tracking-tighter">
                                    {formatCurrency(data?.closing_balance || 0)}
                                </p>
                            </div>

                            {/* Financial Health / Activity */}
                            <div className="flex-shrink-0 rounded-[2rem] px-5 py-4 min-w-[180px] bg-white border border-slate-100 shadow-sm">
                                <p className="text-[9px] font-black uppercase tracking-widest mb-1 text-slate-400">Financial Health</p>
                                <div className="flex flex-col gap-0.5">
                                    <p className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                        <Activity className="w-3 h-3 text-indigo-500" />
                                        {data?.last_activity ? format(new Date(data.last_activity), "dd MMM") : 'No Activity'}
                                    </p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Last Transaction Date</p>
                                </div>
                            </div>

                            {/* Period Info */}
                            <div className="flex-shrink-0 rounded-[2rem] px-5 py-4 min-w-[180px] bg-white border border-slate-100 shadow-sm">
                                <p className="text-[9px] font-black uppercase tracking-widest mb-1 text-slate-400">Statement Period</p>
                                <div className="flex flex-col gap-0.5">
                                    <p className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                        <TrendingUp className="w-3 h-3 text-emerald-500" />
                                        {Math.floor((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 3600 * 24))} Days
                                    </p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Analyzed Range</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Transaction Feed ────────────────────────────────────────── */}
                    <div className="p-4 space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <NativeSectionLabel>Transactions ({data?.transactions?.length || 0})</NativeSectionLabel>
                            <div className="flex gap-2">
                                <button
                                    onClick={handlePrint}
                                    disabled={isPrinting}
                                    className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center active:scale-95 disabled:opacity-50"
                                >
                                    {isPrinting ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <Printer className="w-4 h-4 text-slate-600" />}
                                </button>
                                <button
                                    onClick={() => {
                                        const text = `*Statement: ${contactName}*\nBalance: ${formatCurrency(data?.closing_balance || 0)}\nPeriod: ${format(dateRange.from, 'dd-MM-yy')} to ${format(dateRange.to, 'dd-MM-yy')}`;
                                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                                    }}
                                    className="w-10 h-10 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] flex items-center justify-center active:scale-95"
                                >
                                    <MessageCircle className="w-4 h-4 text-[#16A34A]" />
                                </button>
                            </div>
                        </div>

                        {loading && (!data || data.transactions.length === 0) ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">Fetching Ledger...</p>
                            </div>
                        ) : data?.transactions.length === 0 ? (
                            <div className="py-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-100 px-8">
                                <Search className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                                <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em] mb-2">No entries found</p>
                                <p className="text-[10px] text-slate-300 font-bold uppercase">Try changing the date range</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Opening Balance Card */}
                                <NativeCard className="p-5 bg-gradient-to-br from-slate-50 to-white border-slate-100 shadow-sm relative overflow-hidden">
                                     <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-50/50 rounded-full blur-2xl -mr-10 -mt-10"></div>
                                     <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{format(dateRange.from, "dd MMM yyyy")}</p>
                                            <h4 className="text-sm font-black text-slate-800">Opening Balance Forward</h4>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-base font-black font-mono text-slate-700">{formatCurrency(data?.opening_balance || 0)}</p>
                                        </div>
                                     </div>
                                </NativeCard>

                                {/* Grouped Transactions (By Date for better legibility) */}
                                {(() => {
                                    let currentBal = data?.opening_balance || 0;
                                    return data?.transactions.map((tx, idx) => {
                                        const debit = Number(tx.debit || 0);
                                        const credit = Number(tx.credit || 0);
                                        currentBal = asNumber(tx.running_balance ?? (currentBal + (debit - credit)));

                                        const isCredit = credit > 0;
                                        const amountVal = isCredit ? credit : debit;
                                        const colorClass = isCredit ? 'text-emerald-700' : 'text-rose-700';

                                        return (
                                            <NativeCard key={idx} className="p-4 space-y-3 active:scale-[0.98] transition-all">
                                                <div className="flex items-start justify-between">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                            <span className={cn(
                                                                "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg",
                                                                isCredit ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                                                            )}>
                                                                {isCredit ? 'Cash/Item Received' : 'Cash/Item Sent'}
                                                            </span>
                                                            <span className="text-[9px] font-mono text-slate-400 uppercase">
                                                                #{tx.bill_number || tx.voucher_no || 'TXN'}
                                                            </span>
                                                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">
                                                                {format(new Date(tx.date || tx.created_at), "dd MMM, h:mm a")}
                                                            </span>
                                                        </div>
                                                        <h3 className="text-sm font-black text-slate-900 leading-tight">
                                                            {formatLedgerDesc(tx)}
                                                        </h3>
                                                        
                                                        {tx.products && tx.products.length > 0 && (
                                                            <div className="mt-2 text-[10px] text-slate-500 font-bold bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100 flex flex-wrap gap-x-3 gap-y-1">
                                                                {tx.products.filter((p:any)=>p.name).map((p:any, i:number) => (
                                                                    <span key={i} className="flex items-center gap-1 shrink-0">
                                                                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                                                                        {p.name} ({p.qty}{p.unit})
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    <div className="text-right pl-4">
                                                        <p className={cn("text-lg font-[1000] tracking-tighter leading-none", colorClass)}>
                                                            {isCredit ? '+' : '-'}₹{amountVal.toLocaleString('en-IN')}
                                                        </p>
                                                        <p className={cn(
                                                                "text-[8px] font-black uppercase mt-1 tracking-widest opacity-60",
                                                                isCredit ? "text-emerald-500" : "text-rose-500"
                                                        )}>
                                                            {isCredit ? 'Credit' : 'Debit'}
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                                        Type: {(tx.voucher_type || tx.transaction_type || 'TXN').replace(/_/g, ' ')}
                                                    </span>
                                                    <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                                        Bal: ₹{Math.abs(currentBal).toLocaleString('en-IN')} {currentBal < 0 ? 'Cr' : 'Dr'}
                                                    </span>
                                                </div>
                                            </NativeCard>
                                        );
                                    });
                                })()}
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile Bottom FAB for Actions */}
                <div className="fixed bottom-6 right-6 flex flex-col gap-3 group print:hidden">
                    <button 
                        onClick={() => {
                            const end = new Date();
                            const start = new Date();
                            start.setDate(start.getDate() - 30);
                            setDateRange({ from: start, to: end });
                        }}
                        className="w-12 h-12 bg-white text-slate-700 rounded-full shadow-2xl flex items-center justify-center border border-slate-100 active:scale-90 transition-all"
                        title="Last 30 Days"
                    >
                        <CalendarIconLucide className="w-5 h-5" />
                    </button>
                    <button 
                         onClick={handlePDFDownload}
                         disabled={isDownloading}
                         className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-[0_12px_24px_-8px_rgba(79,70,229,0.5)] flex items-center justify-center active:scale-90 transition-all disabled:opacity-50"
                    >
                        {isDownloading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Download className="w-6 h-6" />}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#F0F2F5] print:bg-white print:h-auto">
            {/* Header Control Bar */}
            <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 shadow-sm print:hidden">
                <div className="flex items-center gap-4">
                    {onClose && (
                        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100 h-10 w-10">
                            <ArrowLeft className="w-5 h-5 text-slate-800" />
                        </Button>
                    )}
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-9 px-4 font-black text-slate-700 hover:bg-white hover:shadow-sm rounded-lg transition-all">
                                    <CalendarIcon className="w-4 h-4 mr-2" />
                                    {format(dateRange.from, "dd MMM")} - {format(dateRange.to, "dd MMM yyyy")}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 border-slate-200 shadow-2xl rounded-2xl" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange.from}
                                    selected={dateRange as any}
                                    onSelect={(val: any) => {
                                        if (val?.from) {
                                            const fromDate = new Date(val.from);
                                            fromDate.setHours(0, 0, 0, 0);
                                            const toDate = val.to ? new Date(val.to) : new Date(val.from);
                                            toDate.setHours(23, 59, 59, 999);
                                            setDateRange({ from: fromDate, to: toDate });
                                        }
                                    }}
                                    numberOfMonths={1}
                                    className="bg-white text-black p-4"
                                />
                            </PopoverContent>
                        </Popover>
                        <Button size="sm" onClick={() => fetchStatement(0)} disabled={loading} className="bg-emerald-600 text-white font-black hover:bg-emerald-700 h-9 px-6 rounded-lg ml-1 shadow-sm uppercase tracking-wider text-xs">
                            {loading ? "..." : "Load"}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap md:flex-nowrap gap-2 md:gap-3 w-full md:w-auto mt-2 md:mt-0">
                    <Button variant="outline" size="sm" onClick={() => {
                        const text = `*Statement of Account*\n` +
                            `Contact: ${contactName}\n` +
                            `Period: ${format(dateRange.from, 'dd-MM-yyyy')} to ${format(dateRange.to, 'dd-MM-yyyy')}\n` +
                            `Opening Balance: ${formatCurrency(data?.opening_balance || 0)}\n` +
                            `Closing Balance: ${formatCurrency(data?.closing_balance || 0)}\n\n` +
                            `_Generated via MindT_`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                    }} className="flex-1 md:flex-none border-emerald-100 bg-emerald-50 text-emerald-700 font-bold px-2 md:px-4 h-10 hover:bg-emerald-100 rounded-xl transition-all text-xs md:text-sm">
                        <MessageCircle className="w-4 h-4 mr-1.5 md:mr-2 shrink-0" /> Share
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data || isPrinting}
                        onClick={handlePrint}
                        className="flex-1 md:flex-none border-slate-200 bg-white text-slate-600 font-bold px-2 md:px-4 h-10 hover:bg-slate-50 rounded-xl transition-all shadow-sm text-xs md:text-sm"
                    >
                        {isPrinting
                            ? <Loader2 className="w-4 h-4 mr-1.5 md:mr-2 animate-spin shrink-0" />
                            : <Printer className="w-4 h-4 mr-1.5 md:mr-2 shrink-0" />}
                        <span className="truncate">{isPrinting ? 'Generating...' : 'Print'}</span>
                    </Button>
                    {data && (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isDownloading}
                            onClick={handlePDFDownload}
                            className="flex-1 md:flex-none border-blue-100 bg-blue-50 text-blue-700 font-bold px-2 md:px-4 h-10 hover:bg-blue-100 rounded-xl transition-all shadow-sm text-xs md:text-sm"
                        >
                            <Download className="w-4 h-4 mr-1.5 md:mr-2 shrink-0" />
                            <span className="truncate">{isDownloading ? "..." : "PDF"}</span>
                        </Button>
                    )}
                    {onClose && (
                        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 h-10 w-10 shrink-0 hidden md:flex">
                            <X className="w-5 h-5" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-8 lg:p-12 print:hidden">
                {/* Print Header */}
                <div className="mb-10 hidden print:flex justify-between items-start border-b-2 border-slate-900 pb-6">
                    <div>
                        <h1 className="text-3xl font-[1000] uppercase tracking-tighter text-black mb-1">{profile?.organization?.name || "Mandi Pro"}</h1>
                        <p className="text-slate-500 font-bold text-sm tracking-widest uppercase">Statement of Account</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Generated On</p>
                        <p className="font-mono text-sm font-bold">{format(new Date(), "PPpp")}</p>
                    </div>
                </div>

                {/* Account Details Summary */}
                <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-300" /> Account Of
                        </p>
                        <h3 className="text-2xl font-black text-slate-800 leading-tight">{contactName}</h3>
                        <p className="text-xs text-slate-500 capitalize font-bold mt-1 bg-slate-100 w-fit px-2 py-0.5 rounded border border-slate-200">{contactType || 'Party Account'}</p>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400" /> Financial Health
                        </p>
                        <div className="flex flex-col gap-1">
                            <p className="text-sm font-bold text-slate-700">Last Active: <span className="font-mono text-slate-500">{data?.last_activity ? format(new Date(data.last_activity), "dd MMM yyyy") : 'No Activity'}</span></p>
                            <p className="text-sm font-bold text-slate-700">Days Since: <span className="font-mono text-slate-500">{data?.last_activity ? Math.floor((new Date().getTime() - new Date(data.last_activity).getTime()) / (1000 * 60 * 60 * 24)) : '-'} days</span></p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Start Date
                        </p>
                        <p className="font-mono font-black text-lg text-emerald-700">
                            {format(dateRange.from, "dd MMM yyyy")}
                        </p>
                        <p className="text-[10px] font-bold text-slate-300 uppercase mt-0.5 tracking-tight">to {format(dateRange.to, "dd MMM yyyy")}</p>
                    </div>
                    <div className={`${(data?.closing_balance || 0) >= 0 ? 'bg-emerald-600 shadow-emerald-100 border-emerald-500' : 'bg-rose-600 shadow-rose-100 border-rose-500'} p-6 rounded-2xl shadow-xl text-white flex flex-col justify-between transition-all duration-500`}>
                        <p className={`text-[10px] font-black ${(data?.closing_balance || 0) >= 0 ? 'text-emerald-100' : 'text-rose-100'} uppercase tracking-widest mb-2 flex items-center gap-2`}>
                            <span className="w-2 h-2 rounded-full bg-white opacity-40 animate-pulse" /> Closing Balance
                        </p>
                        <div className="text-3xl font-black tracking-tighter">
                            {formatCurrency(data?.closing_balance || 0)}
                        </div>
                    </div>
                </div>

                {data && (
                    <div className="space-y-6">
                        {/* Opening Balance Card */}
                        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-amber-50 rounded-full blur-[40px] -mr-16 -mt-16 pointer-events-none opacity-60"></div>
                            <div className="relative z-10 flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{format(dateRange.from, "dd MMM yyyy")}</span>
                                <span className="text-xl font-black text-slate-800">Opening Balance Forward</span>
                            </div>
                            <div className="relative z-10 text-left md:text-right">
                                <span className="text-2xl font-[1000] tracking-tighter text-slate-700">{formatCurrency(data.opening_balance)}</span>
                            </div>
                        </div>

                        {/* Transactions Feed */}
                        <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                            {(() => {
                                let currentBalance = data.opening_balance || 0;

                                const transactions = data.transactions || [];

                                if (transactions.length === 0) {
                                    const hasBalance = (data.closing_balance || 0) !== 0;

                                    return (
                                        <div className="p-16 text-center flex flex-col items-center justify-center bg-white rounded-[2rem]">
                                            <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mb-6 shadow-inner">
                                                <Search className="w-8 h-8 text-slate-200" />
                                            </div>
                                            <p className="text-lg font-black text-slate-800 mb-2">No Transactions Found</p>
                                            <p className="text-sm font-bold text-slate-400 max-w-xs mx-auto mb-8">There are no activities for this party in the selected date range.</p>
                                            
                                            {hasBalance && (
                                                <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 max-w-md mx-auto">
                                                    <p className="text-amber-700 font-black text-sm uppercase tracking-widest mb-4 flex items-center justify-center gap-2">
                                                        <ArrowLeft className="w-4 h-4" /> Missing Details?
                                                    </p>
                                                    <p className="text-[13px] text-amber-600 font-bold mb-6">
                                                        This party has a balance of {formatCurrency(data.closing_balance)}, but the transactions happened outside this month.
                                                    </p>
                                                    <Button 
                                                        onClick={() => {
                                                            const ninetyDaysAgo = new Date();
                                                            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                                                            ninetyDaysAgo.setHours(0, 0, 0, 0);
                                                            setDateRange(prev => ({ ...prev, from: ninetyDaysAgo }));
                                                        }}
                                                        className="bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl px-8 h-12 shadow-lg shadow-amber-200 uppercase tracking-widest text-xs"
                                                    >
                                                        Search Past 3 Months
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                return transactions.map((tx, idx) => {
                                    const debit = Number(tx.debit || 0);
                                    const credit = Number(tx.credit || 0);
                                    currentBalance = asNumber(tx.running_balance ?? (currentBalance + (debit - credit)));

                                    const isCredit = credit > 0;
                                    const amountVal = isCredit ? credit : debit;

                                    const colorClass = isCredit ? 'text-emerald-600' : 'text-rose-600';
                                    
                                    const bgClass = isCredit ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100';

                                    let formattedDate = "-";
                                    try {
                                        const d = new Date(tx.date || tx.created_at);
                                        if (!isNaN(d.getTime())) {
                                            formattedDate = format(d, "dd MMM yy");
                                        }
                                    } catch (e) { }

                                    return (
                                        <div key={idx} className="p-5 sm:p-6 border-b border-slate-100 hover:bg-slate-50/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 group last:border-0 relative">
                                            {/* Left side: Icon + Details */}
                                            <div className="flex items-start sm:items-center gap-5 flex-1 w-full">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105 ${bgClass}`}>
                                                    {isCredit ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                                                </div>
                                                <div className="flex flex-col flex-1 min-w-0">
                                                    <span className="font-bold text-slate-800 text-base leading-tight group-hover:text-black transition-colors break-words">
                                                        {formatLedgerDesc(tx)}
                                                    </span>

                                                    {/* Product Line Items - Display as formatted text */}
                                                    {tx.line_items && tx.line_items.trim().length > 0 && (
                                                        <div className="mt-2.5 mb-1.5 bg-gradient-to-br from-emerald-50 to-teal-50 p-3 rounded-xl border border-emerald-100 w-full">
                                                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 opacity-75">📦 Item Details</p>
                                                            <div className="space-y-1.5">
                                                                {tx.line_items.split('\n').filter((line: string) => line.trim()).map((line: string, idx: number) => {
                                                                    const parts = line.split(' | ');
                                                                    const commodity = parts[0] || 'Item';
                                                                    const details = parts.slice(1).join(' | ');
                                                                    
                                                                    return (
                                                                        <div key={idx} className="flex items-start gap-2 text-xs pb-1.5 border-b border-emerald-100 last:border-0">
                                                                            <span className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 shrink-0"></span>
                                                                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                                                                <span className="font-bold text-slate-800">{commodity}</span>
                                                                                {details && (
                                                                                    <span className="text-slate-600 font-mono text-[11px]">
                                                                                        {details}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Products Details — enriched by post_arrival_ledger with rate/gross/commission/net */}
                                                    {(tx.billing_details?.items || (tx.products && Array.isArray(tx.products) && tx.products.some((p: any) => p.name))) && (
                                                        <div className="mt-3 mb-2 flex flex-col gap-2 w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
                                                            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-1">
                                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em]">Item Description</span>
                                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] text-right">Details & Amount</span>
                                                            </div>
                                                            {(tx.billing_details?.items || tx.products).filter((p: any) => p.name).map((p: any, pIdx: number) => (
                                                                <div key={pIdx} className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0 border-dashed">
                                                                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0"></div>
                                                                        <div className="flex flex-col gap-0.5 min-w-0">
                                                                            <span className="text-sm font-black text-slate-700">{p.name || p.item_name}</span>
                                                                            {(p.lot_code || p.lot_no) && (
                                                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                                                                    Lot: {p.lot_code || `#${p.lot_no}`}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col items-end shrink-0">
                                                                        <span className="text-xs text-slate-600 font-mono font-bold">
                                                                            {asNumber(p.qty).toLocaleString('en-IN', { maximumFractionDigits: 2 })}{' '}
                                                                            <span className="opacity-70">{p.unit}</span>
                                                                            {asNumber(p.rate) > 0 && (
                                                                                <> @ ₹{asNumber(p.rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</>
                                                                            )}
                                                                        </span>
                                                                        <span className="text-[12px] text-emerald-600 font-black mt-0.5">
                                                                            ₹{asNumber(p.net_amount ?? p.amount ?? p.line_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Additional Charges (Fees, Labor, etc) */}
                                                    {tx.charges && tx.charges.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                                                            {tx.charges.map((c: any, cIdx: number) => (
                                                                <span key={cIdx} className="text-[9px] font-black uppercase tracking-tight bg-slate-50 text-slate-400 border border-slate-200 px-2 py-0.5 rounded-md flex items-center gap-1.5 group-hover:bg-white group-hover:border-slate-300 transition-colors">
                                                                    {c.label}: <span className="text-slate-600">₹{Number(c.amount).toLocaleString('en-IN')}</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-sm">
                                                            {formattedDate}
                                                        </span>
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest border border-dashed border-slate-300 px-2 py-0.5 rounded-md truncate max-w-[150px] sm:max-w-none">
                                                            {/* Use bill_number (e.g. "Bill #283") — never show raw UUID */}
                                                            {(tx.voucher_type || tx.transaction_type || 'TXN').replace(/_/g, ' ')}
                                                            {' / '}
                                                            {tx.bill_number || tx.voucher_no || '---'}
                                                        </span>
                                                        {tx.account_name && (
                                                            <span className="text-[10px] font-bold text-slate-400 truncate max-w-[120px] sm:max-w-[200px]">
                                                                • {tx.account_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right side: Amount and Balance */}
                                            <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 w-full sm:w-auto mt-3 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-slate-100 border-dashed">
                                                <span className={`text-xl font-[1000] tracking-tighter ${colorClass}`}>
                                                    {amountVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                <span className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 shadow-sm">
                                                    Bal: {formatCurrency(currentBalance)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                )}

                <div className="mt-8 text-center text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] print:block hidden">
                    --- End of Statement ---
                </div>
            </div>

            {/* PrintableLedger removed — Print now generates the same PDF as Download */}
        </div>
    );
}
