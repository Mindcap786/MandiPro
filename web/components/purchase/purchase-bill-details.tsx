"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
    Loader2, Check, FileText, ShieldCheck, Info, Edit2, 
    Save, X, Plus, Trash2, Calendar as CalendarIcon, Package, Truck, Landmark
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useArrivalsMasterData } from "@/hooks/mandi/useArrivalsMasterData";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatCommodityName } from "@/lib/utils/commodity-utils";

const itemSchema = z.object({
    id: z.string().optional(),
    item_id: z.string().min(1, "Required"),
    qty: z.coerce.number().min(0),
    unit: z.string().default("Box"),
    unit_weight: z.coerce.number().default(0),
    supplier_rate: z.coerce.number().default(0),
    commission_percent: z.coerce.number().default(0),
    less_percent: z.coerce.number().default(0),
    less_units: z.coerce.number().default(0),
    packing_cost: z.coerce.number().default(0),
    loading_cost: z.coerce.number().default(0),
    farmer_charges: z.coerce.number().default(0),
    lot_code: z.string().optional(),
    storage_location: z.string().optional(),
});

const formSchema = z.object({
    arrival_date: z.date(),
    contact_id: z.string().min(1, "Required"),
    arrival_type: z.enum(["direct", "commission", "commission_supplier"]),
    storage_location: z.string().optional(),
    vehicle_number: z.string().optional(),
    vehicle_type: z.string().optional(),
    driver_name: z.string().optional(),
    driver_mobile: z.string().optional(),
    guarantor: z.string().optional(),
    hire_charges: z.coerce.number().default(0),
    hamali_expenses: z.coerce.number().default(0),
    other_expenses: z.coerce.number().default(0),
    items: z.array(itemSchema).min(1),
});

type FormValues = z.infer<typeof formSchema>;

interface PurchaseBillDetailsSheetProps {
    lotId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: () => void;
}

export function PurchaseBillDetailsSheet({ lotId, isOpen, onClose, onUpdate }: PurchaseBillDetailsSheetProps) {
    const { toast } = useToast();
    const { profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [ledgerStatement, setLedgerStatement] = useState<any>(null);
    const [ledgerLoading, setLedgerLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    const { 
        contacts: masterContacts, 
        commodities: masterCommodities, 
        storageLocations: masterLocations 
    } = useArrivalsMasterData(profile?.organization_id);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            items: []
        }
    });

    const { fields } = useFieldArray({
        control: form.control,
        name: "items"
    });

    useEffect(() => {
        if (isOpen && lotId) {
            fetchFullData();
            setIsEditing(false);
        }
    }, [isOpen, lotId]);

    const fetchFullData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Lot with its Arrival
            const { data: lotData, error: lotError } = await supabase
                .schema('mandi')
                .from('lots')
                .select('*, arrival:arrivals(*), farmer:contacts(name, city), item:commodities(name, custom_attributes)')
                .eq('id', lotId)
                .single();

            if (lotError) throw lotError;
            
            // 2. Fetch all lots for this arrival
            const { data: allLots, error: lotsError } = await supabase
                .schema('mandi')
                .from('lots')
                .select('*, item:commodities(name, custom_attributes)')
                .eq('arrival_id', lotData.arrival_id)
                .order('created_at', { ascending: true });

            if (lotsError) throw lotsError;

            const arrival = lotData.arrival;
            setData({ ...lotData, arrival, all_lots: allLots });

            // 3. Populate Form
            form.reset({
                arrival_date: new Date(arrival.arrival_date),
                contact_id: arrival.party_id,
                arrival_type: arrival.arrival_type,
                storage_location: arrival.storage_location || "",
                vehicle_number: arrival.vehicle_number || "",
                vehicle_type: arrival.vehicle_type || "",
                driver_name: arrival.driver_name || "",
                driver_mobile: arrival.driver_mobile || "",
                guarantor: arrival.guarantor || "",
                hire_charges: arrival.hire_charges || 0,
                hamali_expenses: arrival.hamali_expenses || 0,
                other_expenses: arrival.other_expenses || 0,
                items: allLots.map((l: any) => ({
                    id: l.id,
                    item_id: l.item_id,
                    qty: l.initial_qty,
                    unit: l.unit,
                    unit_weight: l.unit_weight || 0,
                    supplier_rate: l.supplier_rate || 0,
                    commission_percent: l.commission_percent || 0,
                    less_percent: l.less_percent || 0,
                    less_units: l.less_units || 0,
                    packing_cost: l.packing_cost || 0,
                    loading_cost: l.loading_cost || 0,
                    farmer_charges: l.farmer_charges || 0,
                    lot_code: l.lot_code,
                    storage_location: l.storage_location
                }))
            });

            // 4. Fetch Ledger
            if (arrival.party_id) {
                fetchLedger(arrival.party_id);
            }
        } catch (err: any) {
            toast({ title: "Error fetching data", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (values: FormValues) => {
        if (!data?.arrival_id) return;
        setSaving(true);
        try {
            // 1. Update Arrival
            const { error: arrivalError } = await supabase
                .schema('mandi')
                .from('arrivals')
                .update({
                    arrival_date: format(values.arrival_date, 'yyyy-MM-dd'),
                    party_id: values.contact_id,
                    arrival_type: values.arrival_type,
                    storage_location: values.storage_location || null,
                    vehicle_number: values.vehicle_number || null,
                    vehicle_type: values.vehicle_type || null,
                    driver_name: values.driver_name || null,
                    driver_mobile: values.driver_mobile || null,
                    guarantor: values.guarantor || null,
                    hire_charges: values.hire_charges,
                    hamali_expenses: values.hamali_expenses,
                    other_expenses: values.other_expenses,
                })
                .eq('id', data.arrival_id);

            if (arrivalError) throw arrivalError;

            // 2. Update Lots
            for (const item of values.items) {
                if (item.id) {
                    const oldLot = data.all_lots?.find((l: any) => l.id === item.id);
                    const qtyDiff = item.qty - (oldLot?.initial_qty || 0);

                    const { error: lotError } = await supabase
                        .schema('mandi')
                        .from('lots')
                        .update({
                            item_id: item.item_id,
                            initial_qty: item.qty,
                            current_qty: (oldLot?.current_qty || 0) + qtyDiff,
                            unit: item.unit,
                            unit_weight: item.unit_weight,
                            supplier_rate: item.supplier_rate,
                            commission_percent: item.commission_percent,
                            less_percent: item.less_percent,
                            less_units: item.less_units,
                            packing_cost: item.packing_cost,
                            loading_cost: item.loading_cost,
                            farmer_charges: item.farmer_charges,
                            storage_location: item.storage_location || null
                        })
                        .eq('id', item.id);
                    if (lotError) throw lotError;
                }
            }

            toast({ title: "Bill Updated", description: "Financial records and stock have been synchronized." });
            setIsEditing(false);
            onUpdate();
            fetchFullData();
        } catch (err: any) {
            toast({ title: "Update Failed", description: err.message, variant: "destructive" });
        } finally {
            setSaving(false);
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
            <SheetContent className="w-full sm:max-w-[800px] p-0 bg-white border-l border-slate-200 overflow-hidden flex flex-col">
                <SheetHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between shrink-0">
                    <div>
                        <SheetTitle className="text-xl font-black italic tracking-tighter text-black uppercase flex items-center gap-2">
                            <span className="text-blue-600">PURCHASE</span> BILL
                            {data?.lot_code && (
                                <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md border border-blue-100 italic-none not-italic">
                                    {data.lot_code}
                                </span>
                            )}
                        </SheetTitle>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                            {isEditing ? "Editing Record" : "View Details & Ledger"}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {!isEditing ? (
                            <Button
                                onClick={() => setIsEditing(true)}
                                className="h-8 bg-slate-900 text-white hover:bg-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest px-4 flex items-center gap-2"
                            >
                                <Edit2 className="w-3 h-3" />
                                Edit Bill
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setIsEditing(false);
                                        form.reset();
                                    }}
                                    className="h-8 text-slate-500 hover:text-slate-900 text-[10px] font-black uppercase tracking-widest"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={form.handleSubmit(handleSave)}
                                    disabled={saving}
                                    className="h-8 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-[10px] font-black uppercase tracking-widest px-4 flex items-center gap-2 shadow-lg shadow-blue-200"
                                >
                                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                    Save Changes
                                </Button>
                            </>
                        )}
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-0">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-400">
                            <Loader2 className="w-10 h-10 animate-spin text-blue-500/20" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Decrypting Records...</p>
                        </div>
                    ) : isEditing ? (
                        <div className="p-6 space-y-8">
                            {/* Form Sections */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Basic Info */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
                                        <FileText className="w-4 h-4 text-blue-500" />
                                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">General Info</h3>
                                    </div>
                                    
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase text-slate-400">Purchase Date</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" className="w-full justify-start text-left font-bold h-10 rounded-xl">
                                                    <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                                                    {form.watch('arrival_date') ? format(form.watch('arrival_date'), "PPP") : <span>Pick a date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={form.watch('arrival_date')}
                                                    onSelect={(date) => date && form.setValue('arrival_date', date)}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase text-slate-400">Supplier / Farmer</Label>
                                        <SearchableSelect
                                            options={masterContacts?.map(c => ({ label: c.name, value: c.id })) || []}
                                            value={form.watch('contact_id')}
                                            onChange={(val) => form.setValue('contact_id', val)}
                                            placeholder="Select party..."
                                            className="h-10 rounded-xl font-bold"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase text-slate-400">Purchase Type</Label>
                                        <Select 
                                            value={form.watch('arrival_type')} 
                                            onValueChange={(val: any) => form.setValue('arrival_type', val)}
                                        >
                                            <SelectTrigger className="h-10 rounded-xl font-bold">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white">
                                                <SelectItem value="direct">Direct Purchase</SelectItem>
                                                <SelectItem value="commission">Farmer Commission</SelectItem>
                                                <SelectItem value="commission_supplier">Supplier Commission</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Logistics */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
                                        <Truck className="w-4 h-4 text-blue-500" />
                                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Logistics</h3>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Vehicle No</Label>
                                            <Input 
                                                {...form.register('vehicle_number')} 
                                                className="h-10 rounded-xl font-bold"
                                                placeholder="e.g. MH-12-AB-1234"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Location</Label>
                                            <Select 
                                                value={form.watch('storage_location')} 
                                                onValueChange={(val) => form.setValue('storage_location', val)}
                                            >
                                                <SelectTrigger className="h-10 rounded-xl font-bold">
                                                    <SelectValue placeholder="Select Location" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white">
                                                    {masterLocations?.map(loc => (
                                                        <SelectItem key={loc.id} value={loc.name}>{loc.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Driver Name</Label>
                                            <Input {...form.register('driver_name')} className="h-10 rounded-xl font-bold" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Driver Mobile</Label>
                                            <Input {...form.register('driver_mobile')} className="h-10 rounded-xl font-bold" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Items Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                    <div className="flex items-center gap-2">
                                        <Package className="w-4 h-4 text-blue-500" />
                                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Items & Lots</h3>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4 relative group/item hover:border-blue-200 transition-all">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black bg-white px-2 py-1 rounded-lg border border-slate-200 text-slate-400 uppercase tracking-tighter">
                                                    Lot: {form.watch(`items.${index}.lot_code`) || 'NEW'}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="col-span-2">
                                                    <Label className="text-[8px] font-black uppercase text-slate-400">Commodity</Label>
                                                    <SearchableSelect
                                                        options={masterCommodities?.map(i => ({ 
                                                            label: formatCommodityName(i.name, i.custom_attributes), 
                                                            value: i.id 
                                                        })) || []}
                                                        value={form.watch(`items.${index}.item_id`)}
                                                        onChange={(val) => form.setValue(`items.${index}.item_id`, val)}
                                                        placeholder="Search product..."
                                                        className="h-10 rounded-xl font-bold bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-[8px] font-black uppercase text-slate-400">Quantity</Label>
                                                    <Input 
                                                        type="number"
                                                        {...form.register(`items.${index}.qty`)} 
                                                        className="h-10 rounded-xl font-bold bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-[8px] font-black uppercase text-slate-400">Rate</Label>
                                                    <Input 
                                                        type="number"
                                                        {...form.register(`items.${index}.supplier_rate`)} 
                                                        className="h-10 rounded-xl font-bold bg-white"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                                                <div>
                                                    <Label className="text-[8px] font-black uppercase text-slate-400">Unit</Label>
                                                    <Input {...form.register(`items.${index}.unit`)} className="h-8 rounded-lg font-bold bg-white text-xs" />
                                                </div>
                                                <div>
                                                    <Label className="text-[8px] font-black uppercase text-slate-400">Comm %</Label>
                                                    <Input type="number" {...form.register(`items.${index}.commission_percent`)} className="h-8 rounded-lg font-bold bg-white text-xs" />
                                                </div>
                                                <div>
                                                    <Label className="text-[8px] font-black uppercase text-slate-400">Less %</Label>
                                                    <Input type="number" {...form.register(`items.${index}.less_percent`)} className="h-8 rounded-lg font-bold bg-white text-xs" />
                                                </div>
                                                <div>
                                                    <Label className="text-[8px] font-black uppercase text-slate-400">Packing</Label>
                                                    <Input type="number" {...form.register(`items.${index}.packing_cost`)} className="h-8 rounded-lg font-bold bg-white text-xs" />
                                                </div>
                                                <div>
                                                    <Label className="text-[8px] font-black uppercase text-slate-400">Loading</Label>
                                                    <Input type="number" {...form.register(`items.${index}.loading_cost`)} className="h-8 rounded-lg font-bold bg-white text-xs" />
                                                </div>
                                                <div>
                                                    <Label className="text-[8px] font-black uppercase text-slate-400">Other Cut</Label>
                                                    <Input type="number" {...form.register(`items.${index}.farmer_charges`)} className="h-8 rounded-lg font-bold bg-white text-xs" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Expenses Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                    <Landmark className="w-4 h-4 text-blue-500" />
                                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Trip Expenses</h3>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase text-slate-400">Hire Charges</Label>
                                        <Input type="number" {...form.register('hire_charges')} className="h-10 rounded-xl font-bold" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase text-slate-400">Hamali</Label>
                                        <Input type="number" {...form.register('hamali_expenses')} className="h-10 rounded-xl font-bold" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase text-slate-400">Others</Label>
                                        <Input type="number" {...form.register('other_expenses')} className="h-10 rounded-xl font-bold" />
                                    </div>
                                </div>
                            </div>

                            <div className="h-20" /> {/* Spacer */}
                        </div>
                    ) : (
                        <div className="p-8">
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
                        </div>
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
