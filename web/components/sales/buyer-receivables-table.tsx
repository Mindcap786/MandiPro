"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ArrowUpRight, Search, TrendingUp, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { BuyerDetailsSheet } from "./buyer-details-sheet";
import { useLanguage } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

export default function BuyerReceivablesTable({ globalSearch = "", statusFilter = "all", dateRange }: { globalSearch?: string, statusFilter?: string, dateRange?: any }) {
    const { profile } = useAuth();
    const { t } = useLanguage();
    const [buyers, setBuyers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Sheet State
    const [selectedBuyer, setSelectedBuyer] = useState<any>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    // Buyer Type Filter State
    const [buyerTypeFilter, setBuyerTypeFilter] = useState<'all' | 'debtors' | 'creditors'>('all');

    const fetchBuyers = async () => {
        if (!profile?.organization_id) return;
        setLoading(true);

        try {
            let matchedBuyerIds: number[] | null = null;

            if (statusFilter !== 'all' || dateRange?.from || dateRange?.to) {
                let salesQuery = supabase.schema('mandi').from('sales').select('buyer_id').eq('organization_id', profile.organization_id);

                if (statusFilter !== 'all') {
                    if (statusFilter === 'overdue') {
                        salesQuery = salesQuery.eq('payment_status', 'pending').lt('due_date', new Date().toISOString());
                    } else {
                        salesQuery = salesQuery.eq('payment_status', statusFilter);
                    }
                }
                if (dateRange?.from) {
                    salesQuery = salesQuery.gte('sale_date', dateRange.from.toISOString());
                }
                if (dateRange?.to) {
                    salesQuery = salesQuery.lte('sale_date', dateRange.to.toISOString());
                }

                const { data: salesData, error: salesError } = await salesQuery;
                if (salesError) throw salesError;

                matchedBuyerIds = Array.from(new Set((salesData || []).map(s => s.buyer_id).filter(Boolean)));
            }

            let query = supabase
                .schema('mandi')
                .from('view_party_balances')
                .select('*')
                .eq('organization_id', profile.organization_id)
                .eq('contact_type', 'buyer');

            if (matchedBuyerIds !== null) {
                if (matchedBuyerIds.length > 0) {
                    query = query.in('contact_id', matchedBuyerIds);
                } else {
                    query = query.eq('contact_id', -1);
                }
            }

            if (statusFilter === 'all' && (!dateRange || !dateRange.from)) {
                query = query.neq('net_balance', 0);
            }

            query = query.order('net_balance', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            setBuyers(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBuyers();
    }, [profile, statusFilter, dateRange]);

    const filteredBuyers = buyers.filter(b => {
        const matchesSearch = (b.contact_name || "").toLowerCase().includes(globalSearch.toLowerCase()) ||
            (b.contact_city || "").toLowerCase().includes(globalSearch.toLowerCase());

        let matchesType = true;
        if (buyerTypeFilter === 'debtors') matchesType = (b.net_balance || 0) > 0;
        if (buyerTypeFilter === 'creditors') matchesType = (b.net_balance || 0) < 0;

        return matchesSearch && matchesType;
    });

    const totalReceivables = filteredBuyers.filter(b => (b.net_balance || 0) > 0).reduce((acc, curr) => acc + curr.net_balance, 0);
    const totalPayables = filteredBuyers.filter(b => (b.net_balance || 0) < 0).reduce((acc, curr) => acc + Math.abs(curr.net_balance), 0);

    return (
        <div className="space-y-6">
            <BuyerDetailsSheet
                buyer={selectedBuyer}
                open={sheetOpen}
                onOpenChange={(val) => {
                    setSheetOpen(val);
                    if (!val) fetchBuyers(); // Refresh list on close in case payment made
                }}
            />

            {/* Header Stats */}
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-6 rounded-2xl bg-white border border-slate-200 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-3 bg-blue-50 rounded-xl text-blue-600 border border-blue-100">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('sales.total_receivables')}</div>
                        <div className="text-2xl font-black text-slate-900 tracking-tighter tabular-nums">
                            ₹{totalReceivables.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                    </div>
                </div>
                <div className="p-6 rounded-2xl bg-white border border-slate-200 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-3 bg-red-50 rounded-xl text-red-600 border border-red-100">
                        <TrendingUp className="w-6 h-6 rotate-180" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Payables</div>
                        <div className="text-2xl font-black text-slate-900 tracking-tighter tabular-nums">
                            ₹{totalPayables.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Toggle */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit mb-4">
                <Button
                    variant="ghost"
                    onClick={() => setBuyerTypeFilter('all')}
                    className={cn(
                        "h-10 rounded-lg px-6 font-bold transition-all text-xs uppercase tracking-wider",
                        buyerTypeFilter === 'all' ? "bg-white text-black shadow-sm" : "text-slate-500 hover:text-black"
                    )}
                >
                    All Parties
                </Button>
                <Button
                    variant="ghost"
                    onClick={() => setBuyerTypeFilter('debtors')}
                    className={cn(
                        "h-10 rounded-lg px-6 font-bold transition-all text-xs uppercase tracking-wider",
                        buyerTypeFilter === 'debtors' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-blue-600"
                    )}
                >
                    Debtors
                </Button>
                <Button
                    variant="ghost"
                    onClick={() => setBuyerTypeFilter('creditors')}
                    className={cn(
                        "h-10 rounded-lg px-6 font-bold transition-all text-xs uppercase tracking-wider",
                        buyerTypeFilter === 'creditors' ? "bg-white text-red-600 shadow-sm" : "text-slate-500 hover:text-red-600"
                    )}
                >
                    Creditors (Payable)
                </Button>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-xl">
                <table className="premium-table w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="pl-6 py-5 text-left text-slate-500 font-bold uppercase tracking-widest text-xs">{t('sales.buyer_name')}</th>
                            <th className="py-5 text-left text-slate-500 font-bold uppercase tracking-widest text-xs">{t('sales.city')}</th>
                            <th className="py-5 text-right pr-6 text-slate-500 font-bold uppercase tracking-widest text-xs">{t('sales.total_pending')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={3} className="p-12 text-center text-slate-500 animate-pulse font-bold">{t('common.loading')}</td></tr>
                        ) : filteredBuyers.length === 0 ? (
                            <tr><td colSpan={3} className="p-12 text-center text-slate-500 font-bold">{t('sales.no_receivables')}</td></tr>
                        ) : filteredBuyers.map((buyer) => (
                            <tr
                                key={buyer.contact_id}
                                className="group cursor-pointer hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0"
                                onClick={() => {
                                    setSelectedBuyer(buyer);
                                    setSheetOpen(true);
                                }}
                            >
                                <td className="pl-6 py-4">
                                    <div className="font-bold text-slate-900 text-base group-hover:text-blue-600 transition-colors">
                                        {buyer.contact_name}
                                    </div>
                                    <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">{buyer.contact_type}</div>
                                </td>
                                <td className="py-4 text-slate-500 font-medium">
                                    {buyer.contact_city || '-'}
                                </td>
                                <td className="pr-6 py-4 text-right">
                                    <div className={cn(
                                        "font-mono font-bold text-xl tracking-tight",
                                        buyer.net_balance < 0 ? "text-red-600" : "text-slate-900"
                                    )}>
                                        ₹{Math.abs(buyer.net_balance || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        {buyer.net_balance < 0 && <span className="ml-1 text-xs font-black uppercase text-red-400 tracking-widest block md:inline">(Payable)</span>}
                                    </div>
                                    <div className="text-[10px] text-blue-600 font-bold uppercase tracking-widest flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                        View Details <ArrowUpRight className="w-3 h-3" />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
