"use client";

import React, { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Save, X, Truck, Package, Edit2, Check, User, MapPin, Tag, Scale, Percent, IndianRupee, BadgeDollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import LotQRSlip, { LotQRData } from "./lot-qr-slip";
import { Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { formatCommodityName } from "@/lib/utils/commodity-utils";

interface ArrivalDetailsSheetProps {
    arrivalId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: () => void;
}

const EMPTY_EDIT = {
    supplier_rate: "",
    initial_qty: "",
    unit: "",
    unit_weight: "",
    sale_price: "",
    commission_percent: "",
    less_percent: "",
    packing_cost: "",
    loading_cost: "",
    advance: "",
    farmer_charges: "",
    storage_location: "",
    barcode: "",
};

export function ArrivalDetailsSheet({ arrivalId, isOpen, onClose, onUpdate }: ArrivalDetailsSheetProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [arrival, setArrival] = useState<any>(null);
    const [lots, setLots] = useState<any[]>([]);
    const [editingLotId, setEditingLotId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<typeof EMPTY_EDIT>({ ...EMPTY_EDIT });
    const [qrSlipsOpen, setQrSlipsOpen] = useState(false);

    useEffect(() => {
        if (isOpen && arrivalId) {
            fetchDetails();
        }
    }, [isOpen, arrivalId]);

    const fetchDetails = async () => {
        setLoading(true);
        try {
            const { data: arrivalData, error: arrivalError } = await supabase.schema("mandi")
                .from('arrivals')
                .select(`*, contacts(name, city)`)
                .eq('id', arrivalId)
                .single();

            if (arrivalError) throw arrivalError;
            setArrival(arrivalData);

            const { data: lotsData, error: lotsError } = await supabase.schema("mandi")
                .from('lots')
                .select(`*, item:commodities(name, custom_attributes)`)
                .eq('arrival_id', arrivalId)
                .order('created_at', { ascending: true });

            if (lotsError) throw lotsError;
            setLots(lotsData || []);
        } catch (err: any) {
            console.error("fetchDetails Error:", err);
            toast({ title: "Error Loading Details", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const startEditing = (lot: any) => {
        setEditingLotId(lot.id);
        setEditForm({
            supplier_rate: lot.supplier_rate ?? "",
            initial_qty: lot.initial_qty ?? "",
            unit: lot.unit ?? "",
            unit_weight: lot.unit_weight ?? "",
            sale_price: lot.sale_price ?? "",
            commission_percent: lot.commission_percent ?? "",
            less_percent: lot.less_percent ?? "",
            packing_cost: lot.packing_cost ?? "",
            loading_cost: lot.loading_cost ?? "",
            advance: lot.advance ?? "",
            farmer_charges: lot.farmer_charges ?? "",
            storage_location: lot.storage_location ?? "",
            barcode: lot.barcode ?? "",
        });
    };

    const cancelEditing = () => {
        setEditingLotId(null);
        setEditForm({ ...EMPTY_EDIT });
    };

    const saveLot = async () => {
        if (!editingLotId) return;

        const lot = lots.find(l => l.id === editingLotId);
        if (!lot) return;

        setSaving(true);

        const newInitialQty = parseFloat(editForm.initial_qty?.toString() || "0") || 0;
        const newUnitWeight = parseFloat(editForm.unit_weight?.toString() || "0") || 0;

        const updatePayload = {
            supplier_rate: parseFloat(editForm.supplier_rate?.toString() || "0") || 0,
            initial_qty: newInitialQty,
            // If no qty has been sold yet, sync current_qty to match initial_qty
            current_qty: lot.current_qty === lot.initial_qty ? newInitialQty : lot.current_qty,
            unit: editForm.unit || lot.unit,
            unit_weight: newUnitWeight,
            total_weight: newInitialQty * newUnitWeight,
            sale_price: editForm.sale_price !== "" ? parseFloat(editForm.sale_price.toString()) : null,
            commission_percent: parseFloat(editForm.commission_percent?.toString() || "0") || 0,
            less_percent: parseFloat(editForm.less_percent?.toString() || "0") || 0,
            packing_cost: parseFloat(editForm.packing_cost?.toString() || "0") || 0,
            loading_cost: parseFloat(editForm.loading_cost?.toString() || "0") || 0,
            advance: parseFloat(editForm.advance?.toString() || "0") || 0,
            farmer_charges: parseFloat(editForm.farmer_charges?.toString() || "0") || 0,
            storage_location: editForm.storage_location || lot.storage_location,
            barcode: editForm.barcode || null,
        };

        const { error } = await supabase.schema("mandi")
            .from('lots')
            .update(updatePayload)
            .eq('id', editingLotId);

        setSaving(false);

        if (error) {
            toast({ title: "Failed to update", description: error.message, variant: "destructive" });
        } else {
            toast({ title: "Lot Updated", description: "All changes saved successfully." });
            setEditingLotId(null);
            setEditForm({ ...EMPTY_EDIT });
            fetchDetails();
            onUpdate();
        }
    };

    const field = (label: string, value: string | number | null | undefined, icon?: React.ReactNode) => (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-[9px] uppercase font-bold text-gray-500 tracking-widest">
                {icon && <span className="opacity-70">{icon}</span>}
                {label}
            </div>
            <div className="text-sm font-bold text-white">
                {value !== null && value !== undefined && value !== "" ? String(value) : <span className="text-gray-600 italic text-[11px]">—</span>}
            </div>
        </div>
    );

    const inputField = (label: string, key: keyof typeof EMPTY_EDIT, type = "number") => (
        <div className="space-y-1">
            <Label className="text-[9px] uppercase font-bold text-gray-500">{label}</Label>
            <Input
                type={type}
                value={editForm[key]}
                onChange={(e) => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                className="h-8 bg-white/5 border-white/10 text-xs font-bold text-white"
            />
        </div>
    );

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:w-[540px] md:w-[680px] bg-[#050510] border-l border-white/10 text-white p-0 overflow-y-auto">
                <div className="h-full flex flex-col">
                    {/* Header — minimal, just title + reprint */}
                    <SheetHeader className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex-row items-center justify-between">
                        <div className="flex flex-col">
                            <SheetTitle className="text-xl font-black italic tracking-tighter text-white uppercase">
                                ARRIVAL <span className="text-neon-green">DETAILS</span>
                            </SheetTitle>
                            {arrival && (
                                <div className="mt-1">
                                    <span className={cn(
                                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                                        arrival.status === 'paid' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                        arrival.status === 'partial' ? "bg-sky-500/10 text-sky-400 border-sky-500/20" :
                                        arrival.status === 'pending' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                        "bg-white/10 text-white/50 border-white/10"
                                    )}>
                                        {arrival.status || 'Received'}
                                    </span>
                                </div>
                            )}
                        </div>
                        {arrival && (
                            <Button
                                size="sm"
                                onClick={() => setQrSlipsOpen(true)}
                                className="h-7 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full px-4 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                            >
                                <Printer className="w-3 h-3" /> Re-Print QRs
                            </Button>
                        )}
                    </SheetHeader>


                    {/* Lots Body */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {loading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-neon-green" /></div>
                        ) : (
                            <div className="space-y-4">
                                <div className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-2">
                                    Received Items ({lots.length} Lot{lots.length !== 1 ? 's' : ''})
                                </div>

                                {lots.map((lot) => (
                                    <div key={lot.id} className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden transition-all hover:bg-white/[0.045]">
                                        {/* Lot Title Row */}
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
                                                    <Package className="w-4 h-4 text-gray-500" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-white">{formatCommodityName(lot.item?.name, lot.item?.custom_attributes) || 'Unknown Item'}</div>
                                                    <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{lot.lot_code}</div>
                                                </div>
                                            </div>
                                            {editingLotId !== lot.id && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => startEditing(lot)}
                                                    className="h-8 px-3 hover:bg-neon-blue/20 hover:text-neon-blue rounded-full text-xs font-bold text-gray-400"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                                                </Button>
                                            )}
                                        </div>

                                        {editingLotId === lot.id ? (
                                            /* ─────────── EDIT MODE ─────────── */
                                            <div className="p-4 space-y-4">
                                                <div className="text-[9px] uppercase font-black text-neon-blue tracking-widest">Editing Basic Lot Details</div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    {inputField("Quantity", "initial_qty")}
                                                    {inputField("Unit", "unit", "text")}
                                                    {inputField("Supplier Rate (₹)", "supplier_rate")}
                                                    {inputField("Sale Price (₹)", "sale_price")}
                                                </div>

                                                <div className="flex justify-end gap-2 mt-2">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={cancelEditing}
                                                        className="h-8 text-[10px] hover:bg-white/10 text-gray-400"
                                                        disabled={saving}
                                                    >
                                                        <X className="w-3 h-3 mr-1" /> Cancel
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={saveLot}
                                                        disabled={saving}
                                                        className="h-8 bg-neon-green text-black hover:bg-white text-[10px] font-black"
                                                    >
                                                        {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                                                        Save All Changes
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            /* ─────────── READ MODE ─────────── */
                                            <div className="p-4 flex flex-col gap-3">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="text-xl font-black text-white">{formatCommodityName(lot.item?.name, lot.item?.custom_attributes) || 'Unknown'}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Date</div>
                                                        <div className="text-sm font-bold text-gray-300">
                                                            {arrival?.arrival_date ? format(new Date(arrival.arrival_date), 'dd MMM yyyy') : '—'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex gap-8 mt-2 p-3 bg-white/5 rounded-xl border border-white/5">
                                                    <div>
                                                        <div className="text-[9px] uppercase tracking-widest font-bold text-gray-500 mb-1">Quantity</div>
                                                        <div className="text-lg font-black text-white">{lot.current_qty} <span className="text-[10px] text-gray-400">{lot.unit}</span></div>
                                                    </div>
                                                    {arrival?.contacts?.name && (
                                                        <div>
                                                            <div className="text-[9px] uppercase tracking-widest font-bold text-gray-500 mb-1">Party Name</div>
                                                            <div className="text-lg font-black text-white">{arrival.contacts.name}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {lots.length === 0 && (
                                    <div className="p-8 text-center border border-dashed border-white/10 rounded-xl">
                                        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">No Items Found</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </SheetContent>

            {/* QR Reprint Sheet */}
            <LotQRSlip
                open={qrSlipsOpen}
                onClose={() => setQrSlipsOpen(false)}
                lots={lots.map(lot => ({
                    lotId: lot.id,
                    lotCode: lot.lot_code,
                    qrNumber: lot.qr_code || 'No QR',
                    orgId: arrival?.organization_id || '',
                    arrivalType: arrival?.arrival_type || 'direct',
                    itemName: formatCommodityName(lot.item?.name, lot.item?.custom_attributes) || 'Unknown',
                    partyName: arrival?.contacts?.name || '',
                    qty: lot.initial_qty,
                    initialQty: lot.initial_qty,
                    unit: lot.unit || 'Box',
                    date: format(new Date(arrival?.arrival_date || arrival?.created_at || Date.now()), 'dd MMM yyyy'),
                    type: arrival?.arrival_type === 'direct' ? 'DIRECT PURCHASE' : arrival?.arrival_type === 'commission' ? 'FARMER COMM.' : 'SUPP. COMM.'
                }))}
            />
        </Sheet>
    );
}
