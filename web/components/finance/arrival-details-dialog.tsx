"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { Truck, Loader2, Edit2, MapPin, Package, Scale, IndianRupee } from "lucide-react";
import { format } from "date-fns";
import { EditLotDialog } from "./edit-lot-dialog";
import { EditArrivalHeaderDialog } from "./edit-arrival-header-dialog";

interface ArrivalDetailsDialogProps {
    billId: string | null;
    onClose: () => void;
}

export function ArrivalDetailsDialog({ billId, onClose }: ArrivalDetailsDialogProps) {
    const [lots, setLots] = useState<any[]>([]);
    const [arrivalHeader, setArrivalHeader] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Edit States
    const [editingLot, setEditingLot] = useState<any>(null);
    const [editingArrival, setEditingArrival] = useState<any>(null);

    useEffect(() => {
        if (billId) {
            fetchLots();
            fetchArrivalHeader();
        }
    }, [billId]);

    const fetchArrivalHeader = async () => {
        // Find arrival_id from lot if needed
        let arrivalId = billId;
        const { data: lotData } = await supabase.schema('mandi').from('lots').select('arrival_id').eq('id', billId).single();
        if (lotData?.arrival_id) arrivalId = lotData.arrival_id;

        const { data } = await supabase
            .schema('mandi')
            .from('arrivals')
            .select('*')
            .eq('id', arrivalId)
            .single();

        if (data) setArrivalHeader(data);
    };

    const fetchLots = async () => {
        setLoading(true);
        // Try to fetch lots linked to this purchase bill first
        let { data } = await supabase
            .schema('mandi')
            .from('lots')
            .select(`
                *,
                item:items (name)
            `)
            .eq('purchase_bill_id', billId);

        // If no lots found by billId, it might be a single lot reference (like in Arrival Sync)
        if (!data || data.length === 0) {
            const { data: lotData } = await supabase
                .schema('mandi')
                .from('lots')
                .select(`
                    *,
                    item:items (name)
                `)
                .eq('id', billId);
            if (lotData) data = lotData;
        }

        if (data) setLots(data);
        setLoading(false);
    };

    return (
        <>
            <Dialog open={!!billId} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="max-w-4xl bg-white border-slate-200 text-black shadow-2xl rounded-2xl overflow-hidden p-0">
                    <DialogHeader className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-row items-center justify-between space-y-0">
                        <DialogTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-widest text-slate-800">
                            <Truck className="w-5 h-5 text-emerald-600" />
                            Arrival Details
                        </DialogTitle>
                        {arrivalHeader && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingArrival(arrivalHeader)}
                                className="bg-white border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 transition-all rounded-xl"
                            >
                                <Edit2 className="w-3 h-3 mr-2" /> Edit Info
                            </Button>
                        )}
                    </DialogHeader>

                    <div className="space-y-6 p-6">
                        {loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-emerald-600" /></div>
                        ) : (
                            <>
                                {arrivalHeader && (
                                    <div className="grid grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Arrival Date</span>
                                            <span className="text-sm font-bold text-slate-800">{format(new Date(arrivalHeader.arrival_date), 'dd MMM yyyy')}</span>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Vehicle</span>
                                            <span className="text-sm font-bold text-emerald-700">{arrivalHeader.vehicle_number || 'N/A'}</span>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Location</span>
                                            <div className="flex items-center gap-1 text-sm font-bold text-slate-700">
                                                <MapPin className="w-3 h-3 text-slate-400" />
                                                {arrivalHeader.storage_location}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Status</span>
                                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase font-black">{arrivalHeader.status}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">
                                            <tr>
                                                <th className="p-4">Item & Code</th>
                                                <th className="p-4">Qty & Rate</th>
                                                <th className="p-4">Grade</th>
                                                <th className="p-4 text-right">Total Payable</th>
                                                <th className="p-4 text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {lots.map((lot, idx) => {
                                                const qtyValue = Number(lot.initial_qty);
                                                const rateValue = Number(lot.supplier_rate);
                                                const adjustedQty = qtyValue - (qtyValue * (Number(lot.less_percent) / 100));
                                                const adjustedValue = adjustedQty * rateValue;
                                                const commAmt = (adjustedValue * (Number(lot.commission_percent) || 0)) / 100;
                                                const expenses = Number(lot.packing_cost) + Number(lot.loading_cost) + Number(lot.advance) + Number(lot.farmer_charges);
                                                const totalAmt = lot.arrival_type === 'direct' ? adjustedValue : adjustedValue - commAmt - expenses;

                                                return (
                                                    <tr key={idx} className="hover:bg-slate-50 group transition-colors">
                                                        <td className="p-4">
                                                            <div className="font-black text-slate-800">{lot.item?.name}</div>
                                                            <div className="text-[10px] font-mono text-slate-400 uppercase font-semibold">{lot.lot_code}</div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-slate-700 uppercase">{lot.initial_qty} {lot.unit}s</span>
                                                                <span className="text-[10px] text-slate-400">@</span>
                                                                <span className="font-bold text-emerald-600">₹{lot.supplier_rate}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className="text-xs font-black px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">Grade {lot.grade}</span>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <div className="font-black text-slate-900">₹{totalAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                                            <div className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter">
                                                                {lot.arrival_type === 'commission' ? 'Consignment' : 'Direct Buy'}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setEditingLot(lot)}
                                                                className="w-8 h-8 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all rounded-full"
                                                            >
                                                                <Edit2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {editingLot && (
                <EditLotDialog
                    lot={editingLot}
                    open={!!editingLot}
                    onClose={() => setEditingLot(null)}
                    onSuccess={() => fetchLots()}
                />
            )}

            {editingArrival && (
                <EditArrivalHeaderDialog
                    arrival={editingArrival}
                    open={!!editingArrival}
                    onClose={() => setEditingArrival(null)}
                    onSuccess={() => { fetchArrivalHeader(); fetchLots(); }}
                />
            )}
        </>
    );
}
