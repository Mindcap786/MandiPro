"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
    Search, Filter, ArrowUpDown, MoreHorizontal,
    CheckCircle2, XCircle, ChevronLeft, ChevronRight, Eye, MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";
import DownloadInvoiceButton from "@/components/billing/download-invoice-button";

import Link from "next/link";
import { NewPaymentDialog } from "@/components/finance/new-payment-dialog";
import { useLanguage } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";
import ShareInvoiceWhatsApp from "@/components/billing/share-invoice-whatsapp";

export default function SalesTable({ data, isLoading }: { data: any[], isLoading: boolean }) {
    const { t } = useLanguage();
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    // Payment Dialog State
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

    const handleRecordPayment = async (row: any) => {
        if (!row) return;
        console.log("handleRecordPayment Row:", row);
        const displayBillNo = row.contact_bill_no || row.bill_no;

        let pendingAmount = Number(row.total_amount_inc_tax || row.total_amount || 0);

        // Fetch accurate pending balance from DB logic (Perfect Accountant)
        try {
            const { data, error } = await supabase
                .schema('mandi')
                .rpc('get_invoice_balance', { p_invoice_id: row.id });

            // Safe data extraction for RPC response (handle both single and array)
            const result = Array.isArray(data) ? data[0] : data;

            if (result && !error) {
                pendingAmount = Number(result.balance_due);
            }
        } catch (e) {
            console.error("Failed to fetch invoice balance", e);
        }

        setSelectedInvoice({
            party_id: row.buyer_id || row.contact?.id,
            amount: pendingAmount,
            remarks: `Payment for Invoice #${displayBillNo}`,
            invoice_id: row.id
        });
        setPaymentOpen(true);
    };

    // Data is filtered by parent
    const filteredData = data;

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    if (isLoading) {
        return <div className="p-12 text-center text-gray-500 animate-pulse">{t('common.loading')}</div>;
    }

    return (
        <div className="space-y-4">
            {/* Payment Modal */}
            <NewPaymentDialog
                defaultOpen={paymentOpen}
                onOpenChange={setPaymentOpen}
                initialValues={selectedInvoice}
                onSuccess={() => { }} // Could refresh data here if needed
                mode="receipt"
            />

            {/* Premium Table */}
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-xl">
                <table className="premium-table w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="pl-6 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('bill_no')}>
                                {t('sales.invoice_no')} <ArrowUpDown className="inline w-3 h-3 ml-1 opacity-50" />
                            </th>
                            <th className="pl-4 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('sale_date')}>
                                {t('sales.date')}
                            </th>
                            <th className="pl-4 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('buyer')}>
                                {t('sales.buyer')}
                            </th>
                            <th className="py-5 text-right w-[140px] pr-8 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('total_amount')}>
                                {t('sales.amount')}
                            </th>
                            <th className="py-5 text-right w-[120px] pr-8 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors">
                                {t('sales.profit')}
                            </th>
                            <th className="py-5 text-center w-[120px] text-black font-black uppercase tracking-widest text-xs">{t('sales.status')}</th>
                            <th className="py-5 text-right pr-6 text-black font-black uppercase tracking-widest text-xs">{t('sales.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="text-center py-12 text-gray-500">
                                    {t('sales.no_records')}
                                </td>
                            </tr>
                        ) : filteredData.map((row) => {
                            const displayBillNo = row.contact_bill_no || row.bill_no;
                            // Use total_amount_inc_tax from database if available (it should be now), else fallback.
                            // Database computes this with all charges correctly.
                            const grandTotal = Number(row.total_amount_inc_tax) || Number(row.total_amount) || 0;

                            const totalPaid = row.vouchers
                                ?.filter((v: any) => v.type?.toLowerCase() === 'receipt')
                                .filter((v: any) => v.cheque_status?.toLowerCase() !== 'cancelled' && v.cheque_status?.toLowerCase() !== 'v_cancelled')
                                .reduce((sum: number, v: any) => sum + (Number(v.amount) || 0), 0) || 0;

                            const pendingAmt = grandTotal - totalPaid;

                            // Trade profit is intentionally hidden in list view for performance (no nested items fetched).
                            const tradeProfit = 0;

                            return (
                                <tr key={row.id} className="group hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
                                    <td className="pl-6 text-left font-mono font-black text-black group-hover:text-blue-600 transition-colors">
                                        #{row.contact_bill_no || row.bill_no}
                                    </td>
                                    <td className="pl-4 text-left text-black font-black">
                                        {row.sale_date ? format(new Date(row.sale_date), 'dd MMM yyyy') : 'N/A'}
                                    </td>
                                    <td className="pl-4 text-left font-black text-black text-base hover:text-blue-600 transition-colors cursor-pointer">
                                        <Link href={`/sales?search=${encodeURIComponent(row.contact?.name || '')}`}>
                                            {row.contact?.name}
                                        </Link>
                                    </td>
                                    <td className="text-right w-[140px] pr-8">
                                        <div className="flex flex-col items-end">
                                            <span className="font-mono font-black text-black text-lg tracking-tight">₹{grandTotal.toLocaleString()}</span>
                                            {pendingAmt > 0 && Math.round(pendingAmt) !== Math.round(grandTotal) && (
                                                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest mt-0.5">
                                                    Pending: ₹{pendingAmt.toLocaleString()}
                                                </span>
                                            )}
                                            {pendingAmt > 0 && Math.round(pendingAmt) === Math.round(grandTotal) && (
                                                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest mt-0.5">
                                                    Pending: ₹{pendingAmt.toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="text-right w-[120px] pr-8 font-mono font-bold text-base tracking-tight">
                                        <span className={tradeProfit > 0 ? "text-green-600" : tradeProfit < 0 ? "text-red-600" : "text-slate-400"}>
                                            —
                                        </span>
                                    </td>
                                    <td className="text-center w-[120px]">
                                        <div className="flex flex-col gap-1 items-center">
                                            {(() => {
                                                const dbStatus = (row.payment_status || '').toLowerCase();
                                                
                                                // 2. Smart Cheque Logic (Check actual vouchers)
                                                const activeCheques = row.vouchers?.filter((v: any) => 
                                                    v.payment_mode === 'cheque' && 
                                                    !v.is_cleared && 
                                                    v.cheque_status !== 'Cancelled' && 
                                                    v.cheque_status !== 'v_cancelled'
                                                ) || [];
                                                const isPendingCheque = activeCheques.length > 0;
                                                
                                                // Adjust visual logic if paid amount perfectly exactly matches
                                                const isMathFullyPaid = (totalPaid >= (grandTotal - 1) && grandTotal > 0);
                                                
                                                // DB Status explicitly governs badges, math is secondary 
                                                const isFullPaid = !isPendingCheque && (dbStatus === 'paid' || isMathFullyPaid);
                                                const isPartiallyPaid = !isFullPaid && !isPendingCheque && (dbStatus === 'partial' || (totalPaid > 0 && totalPaid < (grandTotal - 1)));
                                                const isOverdue = !isFullPaid && !isPendingCheque && row.due_date && new Date(row.due_date) < new Date() && dbStatus !== 'paid';

                                                return (
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest
                                                        ${isPendingCheque ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                                                            isFullPaid ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                                            isPartiallyPaid ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                                            isOverdue ? 'bg-red-600 text-white shadow-sm' : 
                                                            'bg-red-50 text-red-600 border border-red-200'}
                                                    `}>
                                                        {isPendingCheque ? (
                                                            <><span className="mr-1">🕒</span> {t('sales.status_pending') || 'PENDING'} CHEQUE</>
                                                        ) : isFullPaid ? (
                                                            <><CheckCircle2 className="w-3 h-3 mr-1" /> {t('sales.status_paid') || 'PAID'}</>
                                                        ) : isPartiallyPaid ? (
                                                            <><span className="mr-1">🌗</span> PARTIAL</>
                                                        ) : isOverdue ? (
                                                            <><XCircle className="w-3 h-3 mr-1" /> OVERDUE</>
                                                        ) : (
                                                            <><XCircle className="w-3 h-3 mr-1" /> {t('sales.status_pending') || 'PENDING'}</>
                                                        )}
                                                    </span>
                                                )
                                            })()}
                                        </div>
                                    </td>
                                    <td className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="bg-white border-slate-200 text-slate-900 w-48 shadow-xl rounded-xl">
                                                <DropdownMenuLabel className="uppercase text-[10px] tracking-widest text-slate-400">{t('sales.actions')}</DropdownMenuLabel>

                                                {/* View Invoice */}
                                                <DropdownMenuItem asChild>
                                                    <Link href={`/sales/invoice/${row.id}`} className="flex items-center w-full cursor-pointer hover:bg-slate-50 focus:bg-slate-50 rounded-lg m-1">
                                                        <Eye className="w-4 h-4 mr-2 text-blue-600" /> {t('sales.view_invoice')}
                                                    </Link>
                                                </DropdownMenuItem>

                                                <DropdownMenuSeparator className="bg-slate-100" />

                                                {/* Download PDF - Directly render button which handles click internally */}
                                                <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                                                    <div className="w-full p-0 outline-none ring-0 hover:bg-slate-50 rounded-lg m-1">
                                                        <DownloadInvoiceButton sale={row} />
                                                    </div>
                                                </DropdownMenuItem>

                                                <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                                                    <div className="w-full p-0 outline-none ring-0 hover:bg-slate-50 rounded-lg m-1">
                                                        <ShareInvoiceWhatsApp sale={row} />
                                                    </div>
                                                </DropdownMenuItem>

                                                {/* Record Payment / Manage Cheque */}
                                                {(() => {
                                                    const effectiveStatus = (row.payment_status || '').toLowerCase();
                                                    const isPartial = effectiveStatus === 'partial';
                                                    
                                                    const activeCheques = row.vouchers?.filter((v: any) => 
                                                        v.payment_mode === 'cheque' && 
                                                        !v.is_cleared && 
                                                        v.cheque_status !== 'Cancelled' && 
                                                        v.cheque_status !== 'v_cancelled'
                                                    ) || [];
                                                    const isPendingCheque = activeCheques.length > 0;

                                                    if (isPendingCheque) {
                                                        return (
                                                            <DropdownMenuItem asChild>
                                                                <Link 
                                                                    href="/finance/reconciliation" 
                                                                    className="cursor-pointer bg-orange-50 text-orange-700 hover:bg-orange-100 focus:bg-orange-100 font-bold flex items-center rounded-lg m-1"
                                                                >
                                                                    <span className="mr-2">🕒</span> Manage Cheque
                                                                </Link>
                                                            </DropdownMenuItem>
                                                        );
                                                    }

                                                    if (effectiveStatus === 'pending' || isPartial || Number(row.payment_summary?.balance_due) > 0) {
                                                        return (
                                                            <DropdownMenuItem
                                                                onClick={() => handleRecordPayment(row)}
                                                                className="cursor-pointer bg-green-50 text-green-700 hover:bg-green-100 focus:bg-green-100 font-bold flex items-center rounded-lg m-1"
                                                            >
                                                                {t('sales.record_payment')}
                                                            </DropdownMenuItem>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination (Visual Only for now) */}
            {/* Pagination Controls Removed - Handled by Parent Page */}
        </div>
    );
}
