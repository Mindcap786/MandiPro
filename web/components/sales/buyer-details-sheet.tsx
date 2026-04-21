"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { format } from "date-fns";
import { Loader2, ArrowUpRight, ArrowDownLeft, Receipt, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { NewPaymentDialog } from "@/components/finance/new-payment-dialog";

export function BuyerDetailsSheet({ buyer, open, onOpenChange }: { buyer: any, open: boolean, onOpenChange: (open: boolean) => void }) {
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any>(null);

    useEffect(() => {
        if (open && buyer?.contact_id) {
            fetchInvoices();
        }
    }, [open, buyer]);

    const fetchInvoices = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('sales')
            .select('id, bill_no, contact_bill_no, sale_date, total_amount, payment_status')
            .eq('buyer_id', buyer.contact_id)
            .in('payment_status', ['pending', 'partial'])
            .order('sale_date', { ascending: false });

        setInvoices(data || []);
        setLoading(false);
    };

    const handlePayAll = () => {
        setSelectedInvoiceForPayment({
            party_id: buyer.contact_id,
            amount: Math.abs(buyer.net_balance), // Full Balance
            remarks: `Settlement for ${buyer.contact_name}`
        });
        setPaymentOpen(true);
    };

    const handlePayInvoice = (inv: any) => {
        const displayBillNo = inv.contact_bill_no || inv.bill_no;
        const amountToPay = Math.abs(buyer.net_balance) < inv.total_amount
            ? Math.abs(buyer.net_balance)
            : inv.total_amount;

        setSelectedInvoiceForPayment({
            party_id: buyer.contact_id,
            amount: amountToPay,
            remarks: `Payment for Invoice #${displayBillNo}`,
            invoice_id: inv.id
        });
        setPaymentOpen(true);
    };

    if (!buyer) return null;

    const isPayable = (buyer.net_balance || 0) < 0;
    const balanceValue = Math.abs(buyer.net_balance || 0);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-md bg-white border-l border-slate-200 text-slate-900 overflow-y-auto">
                <SheetHeader className="mb-6">
                    <SheetTitle className="text-2xl font-black uppercase tracking-tighter flex flex-col gap-1 text-slate-900">
                        <span className="text-xs text-slate-500 font-extrabold tracking-widest">{buyer.contact_city}</span>
                        {buyer.contact_name}
                    </SheetTitle>
                    <SheetDescription className="text-slate-500 font-bold">
                        Manage pending dues and history.
                    </SheetDescription>
                </SheetHeader>

                {/* Balance Card */}
                <div className={`p-6 rounded-2xl text-white mb-8 relative overflow-hidden shadow-xl ${isPayable ? 'bg-red-600' : 'bg-slate-900'}`}>
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                        <Receipt className="w-24 h-24 text-white" />
                    </div>
                    <div className="relative z-10">
                        <div className="text-xs font-black text-white/70 uppercase tracking-widest mb-2">
                            {isPayable ? 'Total Payable' : 'Total Receivable'}
                        </div>
                        <div className="text-4xl font-black text-white tracking-tighter mb-4">
                            ₹{balanceValue.toLocaleString()}
                        </div>
                        <Button
                            onClick={handlePayAll}
                            className="w-full h-12 bg-white text-slate-900 font-black hover:bg-slate-100 rounded-xl uppercase tracking-wider"
                        >
                            {isPayable ? (
                                <><ArrowUpRight className="w-4 h-4 mr-2" /> Make Payment</>
                            ) : (
                                <><ArrowDownLeft className="w-4 h-4 mr-2" /> Receive Payment</>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Pending Invoices */}
                <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Pending Invoices ({invoices.length})
                </h3>

                <div className="space-y-3">
                    {loading ? (
                        <div className="text-center py-8 text-slate-500 animate-pulse font-bold">Loading invoices...</div>
                    ) : invoices.length === 0 ? (
                        <div className="p-8 text-center border dashed border-slate-200 rounded-2xl bg-slate-50 text-slate-500 text-sm font-bold">
                            <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-green-500" />
                            No pending invoices found.
                        </div>
                    ) : (
                        invoices.map((inv) => {
                            const displayBillNo = inv.contact_bill_no || inv.bill_no;
                            return (
                            <div key={inv.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all group">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="font-mono font-black text-slate-900">#{displayBillNo}</div>
                                        <div className="text-xs text-slate-500 font-bold">{format(new Date(inv.sale_date), 'dd MMM yyyy')}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-black text-slate-900">₹{inv.total_amount?.toLocaleString()}</div>
                                        <div className="text-[10px] uppercase font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full inline-block mt-1">
                                            Pending
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full mt-2 h-8 border-slate-200 hover:bg-white text-xs font-black uppercase tracking-widest text-slate-700 hover:text-blue-600 hover:border-blue-200"
                                    onClick={() => handlePayInvoice(inv)}
                                >
                                    Pay This Invoice
                                </Button>
                            </div>
                            );
                        })
                    )}
                </div>

                <NewPaymentDialog
                    defaultOpen={paymentOpen}
                    onOpenChange={setPaymentOpen}
                    initialValues={selectedInvoiceForPayment}
                    mode={isPayable ? "payment" : "receipt"}
                    onSuccess={() => {
                        fetchInvoices();
                        onOpenChange(false);
                    }}
                />
            </SheetContent>
        </Sheet>
    );
}
