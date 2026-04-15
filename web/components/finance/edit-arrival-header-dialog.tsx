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
import { Loader2, Save, X, Calendar, Truck, MapPin } from "lucide-react";
import { useFieldGovernance } from "@/hooks/useFieldGovernance";

interface EditArrivalHeaderDialogProps {
    arrival: any;
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function EditArrivalHeaderDialog({ arrival, open, onClose, onSuccess }: EditArrivalHeaderDialogProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<any>(null);

    const { isVisible, isMandatory, getLabel } = useFieldGovernance(
        arrival?.arrival_type === 'direct' ? 'arrivals_direct' :
            arrival?.arrival_type === 'commission' ? 'arrivals_farmer' :
                arrival?.arrival_type === 'commission_supplier' ? 'arrivals_supplier' :
                    'arrivals_farmer'
    );

    useEffect(() => {
        if (arrival) {
            setFormData({
                arrival_date: arrival.arrival_date ? new Date(arrival.arrival_date).toISOString().split('T')[0] : "",
                reference_no: arrival.reference_no || "",
                storage_location: arrival.storage_location || "",
                vehicle_number: arrival.vehicle_number || "",
                vehicle_type: arrival.vehicle_type || "",
                driver_name: arrival.driver_name || "",
                driver_mobile: arrival.driver_mobile || "",
                guarantor: arrival.guarantor || "",
                hire_charges: arrival.hire_charges || 0,
                hamali_expenses: arrival.hamali_expenses || 0,
                other_expenses: arrival.other_expenses || 0
            });
        }
    }, [arrival]);

    if (!arrival || !formData) return null;

    const handleSave = async () => {
        setLoading(true);
        try {
            const { error } = await supabase
                .schema('mandi')
                .from('arrivals')
                .update(formData)
                .eq('id', arrival.id);

            if (error) throw error;

            toast({ title: "Success", description: "Arrival details updated." });
            onSuccess();
            onClose();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const isDirect = arrival?.arrival_type === 'direct';

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-xl bg-white border-slate-200 text-black shadow-2xl rounded-2xl overflow-hidden p-0">
                <div className="p-8 space-y-8">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-2xl font-black italic tracking-tighter uppercase text-slate-800">
                            <span className="text-emerald-600">EDIT</span> ARRIVAL <span className="text-emerald-600">TRANSPORT</span>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-6">
                        {/* Header Basics */}
                        {isVisible('entry_date') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('entry_date', 'Arrival Date')}</Label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                                    <Input
                                        type="date"
                                        required={isMandatory('entry_date')}
                                        value={formData.arrival_date}
                                        onChange={(e) => setFormData({ ...formData, arrival_date: e.target.value })}
                                        className="bg-slate-50 border-slate-200 h-12 pl-10 text-black font-bold rounded-xl hover:bg-slate-100 transition-colors"
                                    />
                                </div>
                            </div>
                        )}

                        {isVisible('reference_no') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('reference_no', 'Ref / Bill No')}</Label>
                                <Input
                                    value={formData.reference_no}
                                    required={isMandatory('reference_no')}
                                    onChange={(e) => setFormData({ ...formData, reference_no: e.target.value })}
                                    className="bg-slate-50 border-slate-200 h-12 text-black font-bold rounded-xl hover:bg-slate-100 transition-colors"
                                />
                            </div>
                        )}

                        {isVisible('storage_location') && (
                            <div className="col-span-2 space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('storage_location', 'Storage Location')}</Label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                                    <Input
                                        value={formData.storage_location}
                                        required={isMandatory('storage_location')}
                                        onChange={(e) => setFormData({ ...formData, storage_location: e.target.value })}
                                        className="bg-slate-50 border-slate-200 h-12 pl-10 text-black font-bold rounded-xl hover:bg-slate-100 transition-colors"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Transport Section */}
                        <div className="col-span-2 pt-4 border-t border-slate-100">
                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                                <Truck className="w-3 h-3" />
                                Vehicle & Logistics
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {isVisible('vehicle_number') && (
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('vehicle_number', 'Vehicle No')}</Label>
                                        <Input
                                            value={formData.vehicle_number}
                                            required={isMandatory('vehicle_number')}
                                            onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value.toUpperCase() })}
                                            className="bg-slate-50 border-slate-200 h-12 text-black font-black tracking-widest rounded-xl hover:bg-slate-100 transition-colors"
                                        />
                                    </div>
                                )}
                                {isVisible('vehicle_type') && (
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('vehicle_type', 'Vehicle Type')}</Label>
                                        <Input
                                            value={formData.vehicle_type}
                                            required={isMandatory('vehicle_type')}
                                            onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
                                            className="bg-slate-50 border-slate-200 h-12 text-black font-bold rounded-xl hover:bg-slate-100 transition-colors"
                                        />
                                    </div>
                                )}
                                {isVisible('driver_name') && (
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('driver_name', 'Driver Name')}</Label>
                                        <Input
                                            value={formData.driver_name}
                                            required={isMandatory('driver_name')}
                                            onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                                            className="bg-slate-50 border-slate-200 h-12 text-black font-bold rounded-xl hover:bg-slate-100 transition-colors"
                                        />
                                    </div>
                                )}
                                {isVisible('hire_charges') && (
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('hire_charges', 'Hire Charges (₹)')}</Label>
                                        <Input
                                            type="number"
                                            value={formData.hire_charges}
                                            required={isMandatory('hire_charges')}
                                            onChange={(e) => setFormData({ ...formData, hire_charges: e.target.value })}
                                            className="bg-slate-50 border-slate-200 h-12 text-black font-bold rounded-xl hover:bg-slate-100 transition-colors"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <Button variant="ghost" onClick={onClose} className="flex-1 h-12 rounded-xl text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:text-slate-600 hover:bg-slate-100">
                        <X className="w-4 h-4 mr-2" /> Cancel
                    </Button>
                    <Button
                        disabled={loading}
                        onClick={handleSave}
                        className="flex-1 h-12 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-200"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Save Transport Details</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
