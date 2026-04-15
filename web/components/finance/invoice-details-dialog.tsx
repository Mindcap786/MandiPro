"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, ShoppingCart } from "lucide-react";

interface InvoiceDetailsDialogProps {
    saleId: string | null;
    onClose: () => void;
}

export function InvoiceDetailsDialog({ saleId, onClose }: InvoiceDetailsDialogProps) {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (saleId) {
            fetchInvoiceItems();
        }
    }, [saleId]);

    const fetchInvoiceItems = async () => {
        setLoading(true);
        // Chain: sale_items -> lots -> items
        const { data, error } = await supabase
            .schema('mandi')
            .from('sale_items')
            .select(`
                qty, rate, amount, unit,
                lots (
                    item:items (name)
                )
            `)
            .eq('sale_id', saleId);

        if (data) {
            setItems(data);
        }
        setLoading(false);
    };

    return (
        <Dialog open={!!saleId} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-xl bg-zinc-900 border-white/10 text-white">
                <DialogHeader className="border-b border-white/10 pb-4">
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                        <ShoppingCart className="w-5 h-5 text-neon-green" />
                        Invoice Details
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4">
                    {loading ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-neon-green" /></div>
                    ) : (
                        <div className="border border-white/10 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-white/5 text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                                    <tr>
                                        <th className="p-3 text-left">Item</th>
                                        <th className="p-3 text-right">Qty</th>
                                        <th className="p-3 text-right">Rate</th>
                                        <th className="p-3 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {items.length === 0 ? (
                                        <tr><td colSpan={4} className="p-4 text-center text-gray-500">No items found</td></tr>
                                    ) : (
                                        items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-white/[0.02]">
                                                <td className="p-3 font-bold">{item.lots?.item?.name || 'Unknown Item'}</td>
                                                <td className="p-3 text-right text-gray-400">
                                                    {item.qty} <span className="text-[10px] uppercase">{item.unit}</span>
                                                </td>
                                                <td className="p-3 text-right font-mono text-gray-400">₹{item.rate}</td>
                                                <td className="p-3 text-right font-mono font-bold text-neon-green">₹{item.amount}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
