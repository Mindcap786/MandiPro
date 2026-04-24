"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import {
    Loader2, Check, FileText, ShieldCheck, Info
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PurchaseBillDetailsSheetProps {
    lotId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: () => void;
}

export function PurchaseBillDetailsSheet({ lotId, isOpen, onClose, onUpdate }: PurchaseBillDetailsSheetProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [ledgerStatement, setLedgerStatement] = useState<any>(null);
    const [ledgerLoading, setLedgerLoading] = useState(false);
    const { profile } = useAuth();

    useEffect(() => {
        if (isOpen && lotId) {
            fetchFullData();
        }
    }, [isOpen, lotId]);

    const fetchFullData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Lot
            const { data: lotData, error: lotError } = await supabase
                .schema('mandi')
                .from('lots')
                .select('*, farmer:contacts(name, city), item:commodities(name, custom_attributes), payment_status')
                .eq('id', lotId)
                .single();

            if (lotError) throw lotError;
            setData(lotData);

            // 2. Fetch Ledger
            if (lotData.contact_id) {
                fetchLedger(lotData.contact_id);
            }
        } catch (err: any) {
            toast({ title: "Error fetching data", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const fetchLedger = async (contactId: string) => {
        if (!contactId || !profile?.organization_id) return;
        setLedgerLoading(true);
        try {
            const { data: ledgerRes, error } = await supabase.schema('mandi').rpc('get_ledger_statement', {
                p_organization_id: profile.organization_id,
                p_contact_id: contactId,
                p_from_date: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
                p_to_date: format(new Date(), 'yyyy-MM-dd')
            });
            if (error) throw error;
            setLedgerStatement(ledgerRes);
        } catch (err) {
            console.error("Ledger fetch error:", err);
        } finally {
            setLedgerLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-xl bg-white border-l border-slate-200 text-slate-900 p-0 shadow-2xl flex flex-col">
                <SheetHeader className="p-8 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <SheetTitle className="text-4xl font-black italic tracking-tighter text-slate-900 uppercase flex items-center gap-3">
                                <span className="text-blue-600">LEDGER</span> VIEW
                            </SheetTitle>
                            {data?.payment_status === 'paid' && (
                                <span className="text-[10px] px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 ring-2 ring-emerald-500/20">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    Settled
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-lg font-bold text-slate-500">{data?.farmer?.name}</span>
                            {data?.lot_code && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 tracking-widest uppercase">
                                    {data.lot_code}
                                </span>
                            )}
                        </div>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">Fetching Statement...</span>
                        </div>
                    ) : (
                        <>
                            {/* Ledger Statement Section */}
                            <div className="space-y-4 pb-12">
                                <div className="flex items-center justify-between px-1">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-blue-600" />
                                        Statement of Account
                                    </h3>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase">
                                        Recent Transactions
                                    </div>
                                </div>

                                {ledgerLoading ? (
                                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
                                ) : ledgerStatement?.transactions?.length > 0 ? (
                                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                                        <div className="grid grid-cols-12 gap-2 p-3 bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                            <div className="col-span-2">Date</div>
                                            <div className="col-span-5">Particulars</div>
                                            <div className="col-span-2 text-right">Debit</div>
                                            <div className="col-span-2 text-right">Credit</div>
                                            <div className="col-span-1"></div>
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                            {ledgerStatement.transactions.map((tx: any, idx: number) => (
                                                <div key={idx} className={cn(
                                                    "grid grid-cols-12 gap-2 p-3 items-center hover:bg-slate-50/50 transition-colors",
                                                    tx.reference_id === data?.arrival_id || tx.reference_id === lotId ? "bg-blue-50/30" : ""
                                                )}>
                                                    <div className="col-span-2 text-[10px] font-bold text-slate-500">
                                                        {format(new Date(tx.date), 'dd MMM')}
                                                    </div>
                                                    <div className="col-span-5">
                                                        <p className="text-[10px] font-black text-slate-900 truncate">{tx.description}</p>
                                                        <p className="text-[8px] font-bold text-slate-400 uppercase">{tx.voucher_type}</p>
                                                    </div>
                                                    <div className="col-span-2 text-right text-[10px] font-bold text-red-600">
                                                        {tx.debit > 0 ? `₹${tx.debit.toLocaleString()}` : '-'}
                                                    </div>
                                                    <div className="col-span-2 text-right text-[10px] font-bold text-emerald-600">
                                                        {tx.credit > 0 ? `₹${tx.credit.toLocaleString()}` : '-'}
                                                    </div>
                                                    <div className="col-span-1 flex justify-end">
                                                        {(tx.reference_id === data?.arrival_id || tx.reference_id === lotId) && (
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="p-4 bg-slate-50/50 border-t border-slate-200 flex justify-between items-center">
                                            <span className="text-[10px] font-black uppercase text-slate-500">Closing Balance</span>
                                            <span className={cn(
                                                "text-sm font-black",
                                                ledgerStatement.closing_balance >= 0 ? "text-emerald-700" : "text-red-700"
                                            )}>
                                                ₹{Math.abs(ledgerStatement.closing_balance).toLocaleString()} {ledgerStatement.closing_balance >= 0 ? 'CR' : 'DR'}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-20 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No recent ledger activity</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <SheetFooter className="p-8 bg-white border-t border-slate-200 backdrop-blur-xl shrink-0">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="w-full h-14 rounded-2xl text-slate-900 font-black uppercase tracking-widest border-2 border-slate-200 hover:bg-slate-50 transition-all"
                    >
                        <Check className="w-5 h-5 mr-3 text-emerald-600" /> DONE
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
