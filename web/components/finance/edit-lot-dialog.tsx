"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, X, IndianRupee, Calculator } from "lucide-react";
import { useFieldGovernance } from "@/hooks/useFieldGovernance";

interface EditLotDialogProps {
    lot: any;
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function EditLotDialog({ lot, open, onClose, onSuccess }: EditLotDialogProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<any>(null);

    const type = lot?.arrival?.arrival_type || lot?.arrival_type;
    const { isVisible, isMandatory, getLabel } = useFieldGovernance(
        type === 'direct' ? 'arrivals_direct' :
            type === 'commission' ? 'arrivals_farmer' :
                type === 'commission_supplier' ? 'arrivals_supplier' :
                    'arrivals_farmer'
    );

    useEffect(() => {
        if (lot) {
            setFormData({
                supplier_rate: lot.supplier_rate || 0,
                initial_qty: lot.initial_qty || 0,
                grade: lot.grade || "A",
                variety: lot.variety || "",
                commission_percent: lot.commission_percent || 0,
                less_percent: lot.less_percent || 0,
                packing_cost: lot.packing_cost || 0,
                loading_cost: lot.loading_cost || 0,
                advance: lot.advance || 0,
                farmer_charges: lot.farmer_charges || 0
            });
        }
    }, [lot]);

    if (!lot || !formData) return null;

    // Financial Recalculations (Matching Arrivals Logic)
    const qty = Number(formData.initial_qty);
    const rate = Number(formData.supplier_rate);
    const lessPercent = Number(formData.less_percent);
    const commPercent = Number(formData.commission_percent);

    const adjustedQty = qty - (qty * lessPercent / 100);
    const adjustedValue = adjustedQty * rate;
    const commissionAmount = (adjustedValue * commPercent / 100);
    const totalExpenses = Number(formData.packing_cost) + Number(formData.loading_cost) + Number(formData.advance) + Number(formData.farmer_charges);

    // Final Payable 
    // If Direct Purchase: We pay the adjustedValue (Expenses borne by Mandi)
    // If Commission: We pay adjustedValue - commission - expenses
    const isDirect = lot.arrival_type === 'direct';
    const totalPayable = isDirect
        ? adjustedValue
        : adjustedValue - commissionAmount - totalExpenses;

    const handleSave = async () => {
        setLoading(true);
        try {
            const { error } = await supabase
                .schema('mandi')
                .from('lots')
                .update({
                    ...formData,
                    // If we change initial_qty, we should probably update current_qty if it's not sold yet
                    // For now, let's keep it simple and update both if they are currently the same
                    current_qty: lot.current_qty === lot.initial_qty ? formData.initial_qty : lot.current_qty,
                    total_weight: formData.initial_qty * (lot.unit_weight || 0)
                })
                .eq('id', lot.id);

            if (error) throw error;

            toast({ title: "Success", description: "Lot details updated." });
            onSuccess();
            onClose();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-md bg-white border-slate-200 text-black shadow-2xl rounded-2xl overflow-hidden p-0">
                <div className="p-6 space-y-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-2xl font-black italic tracking-tighter uppercase text-slate-800">
                            <span className="text-emerald-600">EDIT</span> PURCHASE BILL
                        </DialogTitle>
                        <div className="flex flex-col gap-1">
                            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{lot.item?.name || 'Unknown Item'}</span>
                            <span className="text-slate-400 text-[10px] font-mono uppercase tracking-tighter">REF: {lot.lot_code}</span>
                        </div>
                    </DialogHeader>

                    {/* Summary Widget */}
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex flex-col items-center justify-center relative overflow-hidden group">
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.2em] mb-2">Total Payable Amount</span>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-black text-emerald-600/50">₹</span>
                            <span className="text-5xl font-black text-slate-800 tracking-tighter tabular-nums">
                                {totalPayable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {isVisible('supplier_rate') && (
                            <div className="col-span-2 space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('supplier_rate', 'Purchase Rate (₹/Unit)')}</Label>
                                <div className="relative">
                                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                                    <Input
                                        type="number"
                                        required={isMandatory('supplier_rate')}
                                        value={formData.supplier_rate}
                                        onChange={(e) => setFormData({ ...formData, supplier_rate: e.target.value })}
                                        className="bg-slate-50 border-slate-200 h-12 pl-10 text-lg font-black text-black rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                </div>
                            </div>
                        )}

                        {isVisible('qty') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('qty', 'Quantity')}</Label>
                                <Input
                                    type="number"
                                    required={isMandatory('qty')}
                                    value={formData.initial_qty}
                                    onChange={(e) => setFormData({ ...formData, initial_qty: e.target.value })}
                                    className="bg-slate-50 border-slate-200 h-12 text-lg font-black text-black rounded-xl"
                                />
                            </div>
                        )}

                        {isVisible('grade') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('grade', 'Grade')}</Label>
                                <Input
                                    value={formData.grade}
                                    required={isMandatory('grade')}
                                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                                    className="bg-slate-50 border-slate-200 h-12 text-lg font-black text-black rounded-xl"
                                />
                            </div>
                        )}

                        {isVisible('variety') && (
                            <div className="col-span-2 space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('variety', 'Variety')}</Label>
                                <Input
                                    value={formData.variety}
                                    required={isMandatory('variety')}
                                    onChange={(e) => setFormData({ ...formData, variety: e.target.value })}
                                    className="bg-slate-50 border-slate-200 h-12 text-lg font-black text-black rounded-xl"
                                />
                            </div>
                        )}
                    </div>

                    <div className="pt-4 border-t border-slate-100 space-y-4">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <Calculator className="w-3 h-3" />
                            Financial Breakdown
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {isVisible('commission_percent') && (
                                <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <Label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">{getLabel('commission_percent', 'Commission %')}</Label>
                                    <Input
                                        type="number"
                                        required={isMandatory('commission_percent')}
                                        value={formData.commission_percent}
                                        onChange={(e) => setFormData({ ...formData, commission_percent: e.target.value })}
                                        className="h-8 bg-transparent border-none p-0 text-sm font-bold text-black focus-visible:ring-0"
                                    />
                                </div>
                            )}
                            {isVisible('less_percent') && (
                                <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <Label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">{getLabel('less_percent', 'Less %')}</Label>
                                    <Input
                                        type="number"
                                        required={isMandatory('less_percent')}
                                        value={formData.less_percent}
                                        onChange={(e) => setFormData({ ...formData, less_percent: e.target.value })}
                                        className="h-8 bg-transparent border-none p-0 text-sm font-bold text-black focus-visible:ring-0"
                                    />
                                </div>
                            )}
                            {isVisible('packing_cost') && (
                                <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <Label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">{getLabel('packing_cost', 'Packing Cost')}</Label>
                                    <Input
                                        type="number"
                                        required={isMandatory('packing_cost')}
                                        value={formData.packing_cost}
                                        onChange={(e) => setFormData({ ...formData, packing_cost: e.target.value })}
                                        className="h-8 bg-transparent border-none p-0 text-sm font-bold text-black focus-visible:ring-0"
                                    />
                                </div>
                            )}
                            {isVisible('loading_cost') && (
                                <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <Label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">{getLabel('loading_cost', 'Loading Cost')}</Label>
                                    <Input
                                        type="number"
                                        required={isMandatory('loading_cost')}
                                        value={formData.loading_cost}
                                        onChange={(e) => setFormData({ ...formData, loading_cost: e.target.value })}
                                        className="h-8 bg-transparent border-none p-0 text-sm font-bold text-black focus-visible:ring-0"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <Button variant="ghost" onClick={onClose} className="flex-1 h-12 rounded-xl text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:text-slate-600 hover:bg-slate-100">
                        <X className="w-4 h-4 mr-2" /> Cancel
                    </Button>
                    <Button
                        disabled={loading}
                        onClick={handleSave}
                        className="flex-1 h-12 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-200"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Save Changes</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
