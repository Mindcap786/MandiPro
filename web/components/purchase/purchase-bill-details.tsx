"use client";

import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/lib/supabaseClient";
import {
    Loader2, Save, X, Truck, Package, Calendar as CalendarIcon,
    ChevronDown, ChevronUp, Tag, Plus, Check, Info, Search,
    User, Phone, Hash, MapPin, IndianRupee, Scale, Calculator,
    ShieldCheck, FileText, Landmark, Zap, Download, Eye, AlertCircle, ArrowRight, Trash2
} from "lucide-react";
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";
import { useFieldGovernance } from "@/hooks/useFieldGovernance";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { cacheDelete, cacheClearPrefix } from "@/lib/data-cache";
import { calculateArrivalLevelExpenses, calculateLotSettlementAmount } from "@/lib/purchase-payables";
import { formatCommodityName } from "@/lib/utils/commodity-utils";
import { WastageDialog } from "@/components/inventory/wastage-dialog";

interface PurchaseBillDetailsSheetProps {
    lotId: string | null;
    isOpen: boolean;
    isLocked?: boolean;
    onClose: () => void;
    onUpdate: () => void;
}

export function PurchaseBillDetailsSheet({ lotId, isOpen, isLocked, onClose, onUpdate }: PurchaseBillDetailsSheetProps) {
    const AMOUNT_EPSILON = 0.01;
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [data, setData] = useState<any>(null);
    const [arrival, setArrival] = useState<any>(null);
    const [arrivalLots, setArrivalLots] = useState<any[]>([]);
    const [storageLocations, setStorageLocations] = useState<any[]>([]);
    const [availableItems, setAvailableItems] = useState<any[]>([]);
    const [openItemPicker, setOpenItemPicker] = useState(false);
    const [itemSearch, setItemSearch] = useState("");
    const { profile } = useAuth();

    // Section Toggles
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        header: true,
        transport: true,
        consignment: true
    });

    // Form States
    const [formData, setFormData] = useState<any>({
        // Arrival Header
        arrival_date: "",
        storage_location: "",
        reference_no: "",
        arrival_type: "",
        lot_prefix: "",
        // Transport
        vehicle_number: "",
        vehicle_type: "",
        driver_name: "",
        driver_mobile: "",
        guarantor: "",
        hire_charges: 0,
        hamali_expenses: 0,
        other_expenses: 0,
        loaders_count: 0,
        // Consignment (Lot)
        item_id: "",
        unit: "",
        unit_weight: 0,
        supplier_rate: 0,
        initial_qty: 0,
        grade: "",
        supplier_id: "",
        variety: "",
        barcode: "",
        commission_percent: 0,
        less_percent: 0,
        less_units: 0,
        packing_cost: 0,
        loading_cost: 0,
        advance: 0,
        advance_payment_mode: 'cash',
        advance_bank_account_id: "",
        advance_cheque_no: "",
        advance_bank_name: "",
        advance_cheque_date: null as Date | null,
        advance_cheque_status: false,
        farmer_charges: 0,
        sale_price: 0
    });

    const [availableContacts, setAvailableContacts] = useState<any[]>([]);

    // Governance
    const moduleKey = formData.arrival_type === 'direct' ? 'arrivals_direct' :
        formData.arrival_type === 'commission' ? 'arrivals_farmer' :
            'arrivals_supplier';

    const { isVisible, isMandatory, getLabel } = useFieldGovernance(moduleKey);

    const [showWastage, setShowWastage] = useState(false);

    useEffect(() => {
        if (isOpen && lotId) {
            fetchFullData();
        }
    }, [isOpen, lotId]);

    const fetchFullData = async () => {
        setLoading(true);
        setArrivalLots([]);
        try {
            // 1. Fetch Lot
            const { data: lotData, error: lotError } = await supabase
                .schema('mandi')
                .from('lots')
                .select('*, farmer:contacts(name, city), item:commodities(name, custom_attributes), payment_status, sale_items(amount, qty, rate)')
                .eq('id', lotId)
                .single();

            if (lotError) throw lotError;
            setData(lotData);

            // 2. Fetch Arrival
            if (lotData.arrival_id) {
                const { data: arrivalData, error: arrivalError } = await supabase
                    .schema('mandi')
                    .from('arrivals')
                    .select('*')
                    .eq('id', lotData.arrival_id)
                    .single();
                if (arrivalError) throw arrivalError;
                setArrival(arrivalData);

                const { data: relatedLots, error: relatedLotsError } = await supabase
                    .schema('mandi')
                    .from('lots')
                    .select('id, arrival_id, arrival_type, initial_qty, supplier_rate, less_percent, farmer_charges, packing_cost, loading_cost, advance, commission_percent, sale_items(amount, qty, rate)')
                    .eq('arrival_id', lotData.arrival_id);

                if (relatedLotsError) throw relatedLotsError;
                setArrivalLots(relatedLots || []);

                // Populate Form
                setFormData({
                    supplier_id: lotData.contact_id || "",
                    arrival_date: arrivalData.arrival_date ? new Date(arrivalData.arrival_date).toISOString().split('T')[0] : "",
                    storage_location: arrivalData.storage_location || "",
                    reference_no: arrivalData.reference_no || "",
                    lot_prefix: lotData.lot_code || "",
                    vehicle_number: arrivalData.vehicle_number || "",
                    vehicle_type: arrivalData.vehicle_type || "",
                    driver_name: arrivalData.driver_name || "",
                    driver_mobile: arrivalData.driver_mobile || "",
                    guarantor: arrivalData.guarantor || "",
                    hire_charges: arrivalData.hire_charges || 0,
                    hamali_expenses: arrivalData.hamali_expenses || 0,
                    other_expenses: arrivalData.other_expenses || 0,
                    loaders_count: arrivalData.loaders_count || 0,
                    arrival_type: (() => {
                        const t = arrivalData.arrival_type || lotData.arrival_type || 'direct';
                        if (t === 'farmer') return 'commission';
                        if (t === 'supplier') return 'commission_supplier';
                        return t;
                    })(),
                    item_id: lotData.item_id || "",
                    unit: lotData.unit || "Box",
                    unit_weight: lotData.unit_weight || 0,
                    supplier_rate: lotData.supplier_rate || 0,
                    initial_qty: lotData.initial_qty || 0,
                    grade: lotData.custom_attributes?.grade || lotData.grade || "",
                    variety: lotData.custom_attributes?.variety || lotData.variety || "",
                    barcode: lotData.barcode || "",
                    commission_percent: lotData.commission_percent || 0,
                    less_percent: lotData.less_percent || 0,
                    less_units: lotData.less_units || 0,
                    packing_cost: lotData.packing_cost || 0,
                    loading_cost: lotData.loading_cost || 0,
                    advance: Number(lotData.advance || arrivalData.advance_amount || 0),
                    advance_payment_mode: lotData.advance_payment_mode || arrivalData.advance_payment_mode || 'cash',
                    advance_bank_account_id: lotData.advance_bank_account_id || arrivalData.advance_bank_account_id || "",
                    advance_cheque_no: lotData.advance_cheque_no || arrivalData.advance_cheque_no || "",
                    advance_bank_name: lotData.advance_bank_name || arrivalData.advance_bank_name || "",
                    advance_cheque_date: lotData.advance_cheque_date ? new Date(lotData.advance_cheque_date) : (arrivalData.advance_cheque_date ? new Date(arrivalData.advance_cheque_date) : null),
                    advance_cheque_status: lotData.advance_cheque_status || arrivalData.advance_cheque_status || false,
                    farmer_charges: lotData.farmer_charges || 0,
                    sale_price: lotData.sale_price || 0
                });

                // 3. Fetch Master Data
                if (profile?.organization_id) {
                    const [storageRes, itemsRes, bankRes, contactsRes] = await Promise.all([
                        supabase.schema('mandi').from("storage_locations").select("name").eq("organization_id", profile.organization_id).eq("is_active", true),
                        supabase.schema('mandi').from("commodities").select("id, name, default_unit, custom_attributes").eq("organization_id", profile.organization_id),
                        supabase.schema('mandi').from("accounts").select("id, name, is_default").eq("organization_id", profile.organization_id).eq("type", 'asset').eq('account_sub_type', 'bank'),
                        supabase.schema('mandi').from("contacts").select("id, name, city").eq("organization_id", profile.organization_id).in("type", ["farmer", "supplier"])
                    ]);
                    if (storageRes.data) setStorageLocations(storageRes.data);
                    if (itemsRes.data) setAvailableItems(itemsRes.data);
                    if (bankRes.data) setBankAccounts(bankRes.data);
                    if (contactsRes.data) setAvailableContacts(contactsRes.data);
                }
            } else {
                setArrival(null);
            }
        } catch (err: any) {
            toast({ title: "Error fetching data", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const handleSave = async () => {
        // Validation
        const fieldsToCheck = [
            { key: 'arrival_date', type: 'string', label: getLabel('arrival_date', 'Arrival Date') },
            { key: 'reference_no', type: 'string', label: getLabel('reference_no', 'Reference No') },
            { key: 'lot_prefix', type: 'string', label: getLabel('lot_prefix', 'Lot Prefix') },
            { key: 'storage_location', type: 'string', label: getLabel('storage_location', 'Storage Destination') },
            // Transport
            { key: 'vehicle_number', type: 'string', label: getLabel('vehicle_number', 'Vehicle No') },
            { key: 'vehicle_type', type: 'string', label: getLabel('vehicle_type', 'Vehicle Type') },
            { key: 'driver_name', type: 'string', label: getLabel('driver_name', 'Driver Name') },
            { key: 'driver_mobile', type: 'string', label: getLabel('driver_mobile', 'Driver Mobile') },
            { key: 'guarantor', type: 'string', label: getLabel('guarantor', 'Guarantor') },
            { key: 'hire_charges', type: 'number', label: getLabel('hire_charges', 'Hire Charges') },
            { key: 'hamali_expenses', type: 'number', label: getLabel('hamali_expenses', 'Hamali Exps') },
            { key: 'other_expenses', type: 'number', label: getLabel('other_expenses', 'Other Exps') },
            // Consignment
            { key: 'grade', type: 'string', label: getLabel('grade', 'Grade') },
            { key: 'variety', type: 'string', label: getLabel('variety', 'Variety') },
            { key: 'barcode', type: 'string', label: getLabel('barcode', 'Barcode') },
            { key: 'commission_percent', type: 'number', label: getLabel('commission_percent', 'Commission %') },
            { key: 'loading_cost', type: 'number', label: getLabel('loading_cost', 'Loading Cost') },
            { key: 'packing_cost', type: 'number', label: getLabel('packing_cost', 'Packing Cost') },
            { key: 'advance', type: 'number', label: getLabel('advance', 'Cash Advance') },
            { key: 'farmer_charges', type: 'number', label: getLabel('farmer_charges', 'Other Cut') },
        ];

        const missingFields: string[] = [];

        fieldsToCheck.forEach(field => {
            if (isVisible(field.key) && isMandatory(field.key)) {
                if (field.key === 'lot_prefix' && lotId) return; // Skip validation for existing lot edits
                
                const val = formData[field.key as keyof typeof formData];
                if (field.type === 'string') {
                    if (!val || (val as string).trim() === '') missingFields.push(field.label);
                } else if (field.type === 'number') {
                    if (val === 0 || val === undefined || val === null || val === '') missingFields.push(field.label);
                }
            }
        });

        if (missingFields.length > 0) {
            toast({
                title: "Missing Required Fields",
                description: `Please fill the following mandatory fields: ${missingFields.join(', ')}`,
                variant: "destructive"
            });
            return;
        }

        setSaving(true);
        try {
            // 1. Update Arrival (Shared Header)
            const { error: arrivalErr } = await supabase
                .schema('mandi')
                .from('arrivals')
                .update({
                    arrival_date: format(formData.arrival_date, 'yyyy-MM-dd'),
                    reference_no: formData.reference_no,
                    storage_location: formData.storage_location,
                    vehicle_number: formData.vehicle_number,
                    vehicle_type: formData.vehicle_type,
                    driver_name: formData.driver_name,
                    driver_mobile: formData.driver_mobile,
                    guarantor: formData.guarantor,
                    hire_charges: formData.hire_charges,
                    hamali_expenses: formData.hamali_expenses,
                    other_expenses: formData.other_expenses,
                    loaders_count: formData.loaders_count,
                    advance_amount: formData.advance, // Sync advance to arrival level too
                    advance_payment_mode: formData.advance_payment_mode === 'upi_bank' ? 'bank' : formData.advance_payment_mode,
                    advance_bank_account_id: formData.advance_bank_account_id || null,
                    advance_cheque_no: formData.advance_cheque_no,
                    advance_bank_name: formData.advance_bank_name,
                    advance_cheque_date: formData.advance_cheque_date ? format(formData.advance_cheque_date, 'yyyy-MM-dd') : null,
                    advance_cheque_status: formData.advance_cheque_status
                })
                .eq('id', data.arrival_id);

            if (arrivalErr) throw arrivalErr;

            // 2. Update Lot
            const { error: lotErr } = await supabase
                .schema('mandi')
                .from('lots')
                .update({
                    contact_id: formData.supplier_id,
                    item_id: formData.item_id,
                    lot_code: formData.lot_prefix,
                    arrival_type: formData.arrival_type,
                    storage_location: formData.storage_location,
                    unit: formData.unit,
                    unit_weight: formData.unit_weight,
                    supplier_rate: formData.supplier_rate,
                    initial_qty: formData.initial_qty,
                    current_qty: formData.initial_qty,
                    custom_attributes: {
                        variety: formData.variety || null,
                        grade: formData.grade || null
                    },
                    barcode: formData.barcode,
                    commission_percent: formData.commission_percent,
                    less_percent: formData.less_percent,
                    less_units: formData.less_units,
                    packing_cost: formData.packing_cost,
                    loading_cost: formData.loading_cost,
                    advance: formData.advance,
                    advance_payment_mode: formData.advance_payment_mode === 'upi_bank' ? 'bank' : formData.advance_payment_mode,
                    advance_bank_account_id: formData.advance_bank_account_id || null,
                    advance_cheque_no: formData.advance_cheque_no,
                    advance_cheque_date: formData.advance_cheque_date ? format(formData.advance_cheque_date, 'yyyy-MM-dd') : null,
                    advance_bank_name: formData.advance_bank_name,
                    advance_cheque_status: formData.advance_cheque_status,
                    farmer_charges: formData.farmer_charges,
                    other_cut: formData.farmer_charges, // Sync other_cut with farmer_charges
                    sale_price: formData.sale_price,
                    total_weight: formData.initial_qty * (formData.unit_weight || data.unit_weight || 1)
                })
                .eq('id', lotId);
            if (lotErr) throw lotErr;

            // 3. Recalculate Ledger Entries for this Arrival (Idempotent)
            const { error: rpcErr } = await supabase.schema('mandi').rpc('post_arrival_ledger', { p_arrival_id: data.arrival_id });
            if (rpcErr) {
                console.error("Ledger update failed on edit:", rpcErr);
                toast({ title: "Ledger Sync Warning", description: "Changes saved, but ledger update failed. Please contact support.", variant: "destructive" });
            }

            // 4. Invalidate all relevant caches to ensure profit recalculation and updated ledgers
            if (profile?.organization_id) {
                cacheDelete('sales_page', profile.organization_id);
                cacheClearPrefix('purchase_bills', profile.organization_id);
                cacheClearPrefix('finance_overview', profile.organization_id);
                cacheClearPrefix('daybook', profile.organization_id);
            }

            toast({ title: "Changes Saved", description: "Inward record has been updated successfully." });
            onUpdate();
            onClose();
        } catch (err: any) {
            toast({ title: "Update Failed", description: err.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const editableLot = useMemo(() => ({
        ...data,
        arrival_type: formData.arrival_type,
        initial_qty: Number(formData.initial_qty) || 0,
        supplier_rate: Number(formData.supplier_rate) || 0,
        less_percent: Number(formData.less_percent) || 0,
        farmer_charges: Number(formData.farmer_charges) || 0,
        packing_cost: Number(formData.packing_cost) || 0,
        loading_cost: Number(formData.loading_cost) || 0,
        advance: Number(formData.advance) || 0,
        commission_percent: Number(formData.commission_percent) || 0,
        sale_items: data?.sale_items || [],
    }), [data, formData]);

    const rawLotSettlement = useMemo(
        () => calculateLotSettlementAmount(editableLot),
        [editableLot]
    );

    const arrivalExpenseShare = useMemo(() => {
        if (!data?.arrival_id || formData.arrival_type === "direct") return 0;

        const arrivalExpenseTotal = calculateArrivalLevelExpenses({
            hire_charges: formData.hire_charges,
            hamali_expenses: formData.hamali_expenses,
            other_expenses: formData.other_expenses,
        });

        if (arrivalExpenseTotal <= AMOUNT_EPSILON) return 0;

        const relatedLots = arrivalLots.length > 0 ? arrivalLots : [editableLot];
        const weightedLots = relatedLots.map((lot) => {
            const currentLot = lot.id === data?.id ? editableLot : lot;
            return {
                id: currentLot.id,
                settlement: Math.max(calculateLotSettlementAmount(currentLot), 0),
            };
        });

        const totalWeightedSettlement = weightedLots.reduce((sum, lot) => sum + lot.settlement, 0);
        const currentLotSettlement = weightedLots.find((lot) => lot.id === data?.id)?.settlement || 0;

        if (totalWeightedSettlement <= AMOUNT_EPSILON || currentLotSettlement <= AMOUNT_EPSILON) {
            return 0;
        }

        return (currentLotSettlement / totalWeightedSettlement) * arrivalExpenseTotal;
    }, [AMOUNT_EPSILON, arrivalLots, data?.arrival_id, data?.id, editableLot, formData.arrival_type, formData.hamali_expenses, formData.hire_charges, formData.other_expenses]);

    const totalPayable = useMemo(
        () => rawLotSettlement - arrivalExpenseShare,
        [arrivalExpenseShare, rawLotSettlement]
    );

    const payableBalance = totalPayable > AMOUNT_EPSILON ? totalPayable : 0;
    const extraAdvance = totalPayable < -AMOUNT_EPSILON ? Math.abs(totalPayable) : 0;

    // Sold Out Check
    const isPaid = data?.payment_status === 'paid';
    const isActuallySoldOut = data?.current_qty !== undefined && data.current_qty <= 0; // Purely inventory check
    const isSoldOut = isLocked; // Driven tightly by the global FIFO ledger logic in dialog

    const SectionHeader = ({ id, icon: Icon, title, isExpanded }: any) => {
        // Dynamic status check for header indicators
        const isHeaderComplete = id === 'header' && formData.arrival_date && formData.reference_no;
        const isTransportComplete = id === 'transport' && formData.vehicle_number;
        
        return (
            <button
                onClick={() => toggleSection(id)}
                className={cn(
                    "w-full flex items-center justify-between p-4 border transition-all group shadow-sm rounded-xl",
                    isExpanded ? "bg-white border-blue-200 ring-4 ring-blue-500/5" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                )}
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-8 h-8 rounded-lg border flex items-center justify-center group-hover:scale-110 transition-transform",
                        isExpanded ? "bg-blue-600 border-blue-500 text-white" : "bg-white border-slate-200 text-blue-600"
                    )}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col items-start">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">{title}</span>
                        {!isExpanded && (
                            <span className="text-[9px] text-slate-400 font-medium">
                                {id === 'header' ? (formData.reference_no || 'No Reference') : 
                                 id === 'transport' ? (formData.vehicle_number || 'No Vehicle') : 
                                 'Tap to expand'}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {((id === 'header' && isHeaderComplete) || (id === 'transport' && isTransportComplete)) && !isExpanded && (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
            </button>
        );
    };

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-xl bg-white border-l border-slate-200 text-slate-900 p-0 shadow-2xl flex flex-col">
                <SheetHeader className="p-8 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <SheetTitle className="text-4xl font-black italic tracking-tighter text-slate-900 uppercase flex items-center gap-3">
                                <span className={isSoldOut ? "text-red-500" : "text-blue-600"}>{isSoldOut ? 'VIEW' : 'EDIT'}</span> RECORD
                            </SheetTitle>
                            {isActuallySoldOut && !isPaid && (
                                <span className="text-[10px] px-3 py-1 bg-amber-100 text-amber-700 rounded-full font-bold uppercase tracking-wider animate-pulse">
                                   Sold • Waiting for Payment
                                </span>
                            )}
                            {isSoldOut && (
                                <span className="text-[10px] px-3 py-1 bg-slate-900 text-white rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 ring-2 ring-blue-500/20">
                                    <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                                    Sold & Locked
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-lg font-bold text-slate-500">{data?.farmer?.name}</span>
                            {data?.lot_code && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-white/5 text-gray-500 border border-white/10 tracking-widest uppercase">
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
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">Resolving Triple Sections...</span>
                        </div>
                    ) : (
                        <>
                            {/* Summary Card */}
                            <div className={cn(
                                "border rounded-2xl p-6 flex flex-col items-center justify-center relative overflow-hidden transition-all shadow-sm",
                                isSoldOut ? "bg-red-50 border-red-200" : isActuallySoldOut ? "bg-amber-50 border-amber-200" : payableBalance > AMOUNT_EPSILON ? "bg-blue-50 border-blue-200" : "bg-emerald-50 border-emerald-200"
                            )}>
                                <div className={cn(
                                    "absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full",
                                    isSoldOut ? "bg-red-100" : payableBalance > AMOUNT_EPSILON ? "bg-blue-100" : "bg-emerald-100"
                                )} />
                                <span className={cn(
                                    "text-[10px] font-black uppercase tracking-[0.2em] mb-2",
                                    isSoldOut ? "text-red-600" : isActuallySoldOut ? "text-amber-600" : payableBalance > AMOUNT_EPSILON ? "text-blue-600" : "text-emerald-600"
                                )}>
                                    {isSoldOut ? "Consignment Fully Settled & Locked" : isActuallySoldOut ? "Consignment Sold Out" : payableBalance > AMOUNT_EPSILON ? "Balance To Pay" : "No Additional Payment Due"}
                                </span>
                                <div className="flex items-baseline gap-2">
                                    <span className={cn("text-2xl font-black", isSoldOut ? "text-red-300" : isActuallySoldOut ? "text-amber-300" : payableBalance > AMOUNT_EPSILON ? "text-blue-300" : "text-emerald-300")}>₹</span>
                                    <span className={cn("text-5xl font-black tracking-tighter tabular-nums", isSoldOut ? "text-red-900" : isActuallySoldOut ? "text-amber-900" : payableBalance > AMOUNT_EPSILON ? "text-slate-900" : "text-emerald-900")}>
                                        {payableBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </span>
                                </div>
                                {!isSoldOut && extraAdvance > AMOUNT_EPSILON && (
                                    <div className="mt-4 flex items-center gap-2 text-[9px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-100 px-3 py-1.5 rounded-full border border-emerald-200">
                                        <Info className="w-3 h-3" />
                                        Advance exceeds payable by ₹{extraAdvance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </div>
                                )}
                                {isActuallySoldOut && !isPaid && (
                                    <div className="mt-4 flex items-center gap-2 text-[9px] font-bold text-amber-600 uppercase tracking-wider bg-amber-100 px-3 py-1.5 rounded-full border border-amber-200">
                                        <Info className="w-3 h-3" />
                                        Inventory is zero but bill is not yet fully paid. Edits remain open.
                                    </div>
                                )}
                                {isSoldOut && (
                                    <div className="mt-4 flex items-center gap-2 text-[9px] font-bold text-red-600 uppercase tracking-wider bg-red-100 px-3 py-1.5 rounded-full border border-red-200">
                                        <ShieldCheck className="w-3 h-3" />
                                        Record is fully settled and locked for audit.
                                    </div>
                                )}
                            </div>

                            {/* 1. Arrival Header */}
                            <div className="space-y-4">
                                <SectionHeader id="header" icon={CalendarIcon} title="Arrival Header" isExpanded={expandedSections.header} />
                                {expandedSections.header && (
                                    <div className="grid grid-cols-2 gap-4 p-4 pt-0 transition-all animate-in slide-in-from-top-2">
                                        <div className="col-span-2 space-y-2">
                                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Supplier / Party</Label>
                                            <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })} disabled={isSoldOut}>
                                                <SelectTrigger className="bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20">
                                                    <SelectValue placeholder="Select Supplier" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white border-slate-200 text-slate-900 shadow-xl max-h-[300px]">
                                                    {availableContacts.map(c => (
                                                        <SelectItem key={c.id} value={c.id}>{c.name} {c.city ? `(${c.city})` : ''}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Arrival Date</Label>
                                            <div className="relative">
                                                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" />
                                                <Input
                                                    type="date"
                                                    value={formData.arrival_date}
                                                    onChange={(e) => setFormData({ ...formData, arrival_date: e.target.value })}
                                                    className="bg-white border-slate-200 h-11 pl-10 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20"
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        </div>
                                        {isVisible('reference_no') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    {getLabel('reference_no', 'Ref / Bill No')} {isMandatory('reference_no') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <Input
                                                    value={formData.reference_no}
                                                    onChange={(e) => setFormData({ ...formData, reference_no: e.target.value })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20", isMandatory('reference_no') && !formData.reference_no && "border-red-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}
                                        {isVisible('lot_prefix') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    {getLabel('lot_prefix', 'Lot Prefix')} {isMandatory('lot_prefix') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <Input
                                                    value={formData.lot_prefix}
                                                    onChange={(e) => setFormData({ ...formData, lot_prefix: e.target.value.toUpperCase() })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500/20", isMandatory('lot_prefix') && !formData.lot_prefix && "border-red-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Arrival Type</Label>
                                            <Select value={formData.arrival_type} onValueChange={(v) => setFormData({ ...formData, arrival_type: v })} disabled={isSoldOut}>
                                                <SelectTrigger className="bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20">
                                                    <SelectValue placeholder="Select Type" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white border-slate-200 text-slate-900 shadow-xl">
                                                    <SelectItem value="commission">Farmer Owned (Comm)</SelectItem>
                                                    <SelectItem value="commission_supplier">Supplier Owned (Comm)</SelectItem>
                                                    <SelectItem value="direct">Mandi Owned (Direct)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-2 space-y-2">
                                            {isVisible('storage_location') && (
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                        {getLabel('storage_location', 'Storage Destination')} {isMandatory('storage_location') && <span className="text-red-500">*</span>}
                                                    </Label>
                                                    <div className="flex p-1 bg-slate-100 border border-slate-200 rounded-xl gap-1 flex-wrap">
                                                        {storageLocations.map((loc) => {
                                                            const locName = loc.name;
                                                            return (
                                                                <button
                                                                    key={locName}
                                                                    type="button"
                                                                    onClick={() => setFormData({ ...formData, storage_location: locName })}
                                                                    className={cn(
                                                                        "flex-1 min-w-[100px] h-10 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                                                        formData.storage_location === locName
                                                                            ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                                                                            : "text-slate-500 hover:text-slate-900 hover:bg-white shadow-sm bg-white border border-transparent hover:border-slate-200"
                                                                    )}
                                                                    disabled={isSoldOut}
                                                                >
                                                                    {locName}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 2. Transport & Expenses */}
                            <div className="space-y-4">
                                <SectionHeader id="transport" icon={Truck} title="Transport & Expenses" isExpanded={expandedSections.transport} />
                                {expandedSections.transport && (
                                    <div className="grid grid-cols-2 gap-4 p-4 pt-0 transition-all animate-in slide-in-from-top-2">
                                        {isVisible('vehicle_number') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    {getLabel('vehicle_number', 'Vehicle No')} {isMandatory('vehicle_number') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <Input
                                                    value={formData.vehicle_number}
                                                    onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value.toUpperCase() })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold tracking-widest focus:ring-2 focus:ring-blue-500/20", isMandatory('vehicle_number') && !formData.vehicle_number && "border-red-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}
                                        {isVisible('vehicle_type') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    {getLabel('vehicle_type', 'Vehicle Type')} {isMandatory('vehicle_type') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <Select value={formData.vehicle_type} onValueChange={(v) => setFormData({ ...formData, vehicle_type: v })} disabled={isSoldOut}>
                                                    <SelectTrigger className="bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20">
                                                        <SelectValue placeholder="Type" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-white border-slate-200 text-slate-900 shadow-xl">
                                                        <SelectItem value="Pickup">Pickup</SelectItem>
                                                        <SelectItem value="Truck">Truck</SelectItem>
                                                        <SelectItem value="Tempo">Tempo</SelectItem>
                                                        <SelectItem value="Tractor">Tractor</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                        {isVisible('guarantor') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    {getLabel('guarantor', 'Guarantor')} {isMandatory('guarantor') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <Input
                                                    value={formData.guarantor}
                                                    onChange={(e) => setFormData({ ...formData, guarantor: e.target.value })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20", isMandatory('guarantor') && !formData.guarantor && "border-red-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}
                                        {isVisible('driver_name') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    {getLabel('driver_name', 'Driver Name')} {isMandatory('driver_name') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <Input
                                                    value={formData.driver_name}
                                                    onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20", isMandatory('driver_name') && !formData.driver_name && "border-red-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}
                                        {isVisible('driver_mobile') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    {getLabel('driver_mobile', 'Driver Mobile')} {isMandatory('driver_mobile') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <Input
                                                    value={formData.driver_mobile}
                                                    onChange={(e) => setFormData({ ...formData, driver_mobile: e.target.value })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20", isMandatory('driver_mobile') && !formData.driver_mobile && "border-red-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}
                                        {isVisible('hamali_expenses') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    {getLabel('hamali_expenses', 'Loading (₹)')} {isMandatory('hamali_expenses') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <Input
                                                    type="number"
                                                    value={formData.hamali_expenses}
                                                    onChange={(e) => setFormData({ ...formData, hamali_expenses: e.target.value === "" ? "" : Number(e.target.value) })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20", isMandatory('hamali_expenses') && formData.hamali_expenses === 0 && "border-amber-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                Loaders Count
                                            </Label>
                                            <Input
                                                type="number"
                                                value={formData.loaders_count}
                                                onChange={(e) => setFormData({ ...formData, loaders_count: e.target.value === "" ? "" : Number(e.target.value) })}
                                                className="bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20"
                                                disabled={isSoldOut}
                                            />
                                        </div>
                                        {isVisible('hire_charges') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    {getLabel('hire_charges', 'Advance (₹)')} {isMandatory('hire_charges') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <Input
                                                    type="number"
                                                    value={formData.hire_charges}
                                                    onChange={(e) => setFormData({ ...formData, hire_charges: e.target.value === "" ? "" : Number(e.target.value) })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20", isMandatory('hire_charges') && formData.hire_charges === 0 && "border-amber-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}
                                        {isVisible('other_expenses') && (
                                            <div className="col-span-2 space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    {getLabel('other_expenses', 'Other (₹)')} {isMandatory('other_expenses') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <Input
                                                    type="number"
                                                    value={formData.other_expenses}
                                                    onChange={(e) => setFormData({ ...formData, other_expenses: e.target.value === "" ? "" : Number(e.target.value) })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20", isMandatory('other_expenses') && formData.other_expenses === 0 && "border-amber-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 3. Consignment Details */}
                            <div className="space-y-4 pb-12">
                                <SectionHeader id="consignment" icon={Package} title="Consignment Details" isExpanded={expandedSections.consignment} />
                                {expandedSections.consignment && (
                                    <div className="grid grid-cols-2 gap-4 p-4 pt-0 transition-all animate-in slide-in-from-top-2">
                                        <div className="col-span-2 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Item Selection</Label>
                                            </div>
                                            <Popover open={openItemPicker} onOpenChange={setOpenItemPicker}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        className="w-full justify-between bg-white border-slate-200 h-12 text-slate-900 font-bold px-4 hover:bg-slate-50 focus:ring-2 focus:ring-blue-500/20"
                                                        disabled={isSoldOut}
                                                    >
                                                        {formData.item_id ? formatCommodityName(availableItems.find(i => i.id === formData.item_id)?.name || "", { ...availableItems.find(i => i.id === formData.item_id)?.custom_attributes, variety: formData.variety, grade: formData.grade }) : "Select Item..."}
                                                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 shadow-2xl overflow-hidden rounded-xl">
                                                    <div className="flex flex-col">
                                                        <div className="p-2 border-b border-slate-100">
                                                            <div className="relative">
                                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                                <Input
                                                                    placeholder="Search item..."
                                                                    value={itemSearch}
                                                                    onChange={(e) => setItemSearch(e.target.value)}
                                                                    className="bg-slate-50 border-transparent h-10 pl-10 text-slate-900 placeholder:text-slate-400 focus:border-blue-500/20"
                                                                    disabled={isSoldOut}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="max-h-[250px] overflow-y-auto custom-scrollbar p-1">
                                                            {availableItems
                                                                .filter(item => item.name.toLowerCase().includes(itemSearch.toLowerCase()))
                                                                .map((item) => (
                                                                    <div
                                                                        key={item.id}
                                                                        onClick={() => {
                                                                            if (isSoldOut) return;
                                                                            setFormData(prev => ({
                                                                                ...prev,
                                                                                item_id: item.id,
                                                                                unit: item.default_unit || prev.unit
                                                                            }));
                                                                            setOpenItemPicker(false);
                                                                            setItemSearch("");
                                                                        }}
                                                                        className={cn(
                                                                            "flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-all",
                                                                            formData.item_id === item.id ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                                                                            isSoldOut && "opacity-50 cursor-not-allowed hover:bg-transparent"
                                                                        )}
                                                                    >
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-8 h-8 rounded bg-white flex items-center justify-center border border-slate-200 text-[10px] font-black uppercase text-slate-500 shadow-sm">
                                                                                {item.name.substring(0, 2)}
                                                                            </div>
                                                                            <span className="font-bold text-sm">{formatCommodityName(item.name, item.custom_attributes)}</span>
                                                                        </div>
                                                                        {formData.item_id === item.id && <Check className="h-4 w-4 text-blue-600" />}
                                                                    </div>
                                                                ))}
                                                            {availableItems.filter(item => item.name.toLowerCase().includes(itemSearch.toLowerCase())).length === 0 && (
                                                                <div className="p-4 text-center text-xs text-slate-500 italic">No items found</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="col-span-2 grid grid-cols-3 gap-4">
                                            {isVisible('supplier_rate') && (
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('supplier_rate', 'Purchase Rate')} {isMandatory('supplier_rate') && <span className="text-red-500">*</span>}</Label>
                                                    <div className="relative">
                                                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-600" />
                                                        <Input
                                                            type="number"
                                                            value={formData.supplier_rate}
                                                            onChange={(e) => setFormData({ ...formData, supplier_rate: e.target.value === "" ? "" : Number(e.target.value) })}
                                                            className={cn("bg-white border-slate-200 h-11 pl-9 text-base font-bold text-slate-900", isMandatory('supplier_rate') && formData.supplier_rate === 0 && "border-red-500")}
                                                            disabled={isSoldOut}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    Sale Price {isMandatory('sale_price') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <div className="relative">
                                                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-600" />
                                                    <Input
                                                        type="number"
                                                        value={formData.sale_price}
                                                        onChange={(e) => setFormData({ ...formData, sale_price: e.target.value === "" ? "" : Number(e.target.value) })}
                                                        className={cn("bg-white border-slate-200 h-11 pl-9 text-base font-bold text-slate-900", isMandatory('sale_price') && formData.sale_price === 0 && "border-red-500")}
                                                        disabled={isSoldOut}
                                                    />
                                                </div>
                                            </div>

                                        </div>
                                        {isVisible('qty') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('qty', 'Lot Quantity')} {isMandatory('qty') && <span className="text-red-500">*</span>}</Label>
                                                <Input
                                                    type="number"
                                                    value={formData.initial_qty}
                                                    onChange={(e) => setFormData({ ...formData, initial_qty: e.target.value === "" ? "" : Number(e.target.value) })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold", isMandatory('qty') && formData.initial_qty === 0 && "border-red-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}
                                        {isVisible('unit') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('unit', 'Unit')} {isMandatory('unit') && <span className="text-red-500">*</span>}</Label>
                                                <Select
                                                    value={formData.unit}
                                                    onValueChange={(val) => setFormData({ ...formData, unit: val })}
                                                    disabled={isSoldOut}
                                                >
                                                    <SelectTrigger className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold", isMandatory('unit') && !formData.unit && "border-red-500")}>
                                                        <SelectValue placeholder="Select unit" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {["Box", "Crate", "Kgs", "Tons", "Nug", "Pieces", "Carton"].map((u) => (
                                                            <SelectItem key={u} value={u}>{u}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                        {isVisible('unit_weight') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{getLabel('unit_weight', 'Unit Weight (Kg)')} {isMandatory('unit_weight') && <span className="text-red-500">*</span>}</Label>
                                                <Input
                                                    type="number"
                                                    value={formData.unit_weight}
                                                    onChange={(e) => setFormData({ ...formData, unit_weight: e.target.value === "" ? "" : Number(e.target.value) })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold", isMandatory('unit_weight') && formData.unit_weight === 0 && "border-red-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-4">
                                            {isVisible('variety') && (
                                                <div className="space-y-2">
                                                    <Input
                                                        value={formData.variety}
                                                        onChange={(e) => setFormData({ ...formData, variety: e.target.value })}
                                                        placeholder={getLabel('variety', 'Variety (e.g. Red)')}
                                                        className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20", isMandatory('variety') && !formData.variety && "border-red-500")}
                                                        disabled={isSoldOut}
                                                    />
                                                </div>
                                            )}
                                            {isVisible('grade') && (
                                                <div className="space-y-2">
                                                    <Input
                                                        value={formData.grade}
                                                        onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                                                        placeholder={getLabel('grade', 'Grade (e.g. A)')}
                                                        className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20", isMandatory('grade') && !formData.grade && "border-red-500")}
                                                        disabled={isSoldOut}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        {isVisible('barcode') && (
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                    {getLabel('barcode', 'Barcode')} {isMandatory('barcode') && <span className="text-red-500">*</span>}
                                                </Label>
                                                <Input
                                                    value={formData.barcode}
                                                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                                                    className={cn("bg-white border-slate-200 h-11 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500/20", isMandatory('barcode') && !formData.barcode && "border-red-500")}
                                                    disabled={isSoldOut}
                                                />
                                            </div>
                                        )}

                                        <div className="col-span-2 pt-4 border-t border-white/5 space-y-4">
                                            <div className="flex items-center gap-2 text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">
                                                <Calculator className="w-3 h-3" /> Commission & Expenses
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {isVisible('commission_percent') && formData.arrival_type !== 'direct' && (
                                                    <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                                                        <Label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                                                            {getLabel('commission_percent', 'Commission %')} {isMandatory('commission_percent') && <span className="text-red-500">*</span>}
                                                        </Label>
                                                        <Input
                                                            type="number"
                                                            value={formData.commission_percent}
                                                            onChange={(e) => setFormData({ ...formData, commission_percent: e.target.value === "" ? "" : Number(e.target.value) })}
                                                            className={cn("h-8 bg-transparent border-none p-0 text-lg font-bold text-slate-900 focus-visible:ring-0", isMandatory('commission_percent') && formData.commission_percent === 0 && "border-b border-amber-500/50")}
                                                            disabled={isSoldOut}
                                                        />
                                                    </div>
                                                )}
                                                {formData.arrival_type !== 'direct' && (
                                                    <div className="col-span-2 space-y-2">
                                                        <div className="grid grid-cols-3 gap-3 bg-slate-100/50 p-3 rounded-xl border border-slate-200 relative group/discount">
                                                            {isVisible('less_percent') && (
                                                                <div className="space-y-1.5 italic">
                                                                    <Label className="text-[8px] font-bold text-amber-600 uppercase tracking-wider">Less %</Label>
                                                                    <Input
                                                                        type="number"
                                                                        value={formData.less_percent}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value === "" ? 0 : Number(e.target.value);
                                                                            setFormData({
                                                                                ...formData,
                                                                                less_percent: val,
                                                                                less_units: (formData.initial_qty * val) / 100
                                                                            });
                                                                        }}
                                                                        className="h-8 bg-transparent border-none p-0 text-lg font-bold text-amber-900 focus-visible:ring-0"
                                                                        disabled={isSoldOut}
                                                                    />
                                                                </div>
                                                            )}
                                                            <div className="space-y-1.5">
                                                                <Label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Less Units</Label>
                                                                <Input
                                                                    type="number"
                                                                    value={formData.less_units}
                                                                    onChange={(e) => setFormData({ ...formData, less_units: e.target.value === "" ? "" : Number(e.target.value) })}
                                                                    className="h-8 bg-transparent border-none p-0 text-lg font-bold text-slate-700 focus-visible:ring-0"
                                                                    disabled={isSoldOut}
                                                                />
                                                            </div>
                                                            {isVisible('farmer_charges') && formData.arrival_type === 'commission' && (
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-[8px] font-bold text-orange-600 uppercase tracking-wider">Other Cut (₹)</Label>
                                                                    <Input
                                                                        type="number"
                                                                        value={formData.farmer_charges}
                                                                        onChange={(e) => setFormData({ ...formData, farmer_charges: e.target.value === "" ? "" : Number(e.target.value) })}
                                                                        className="h-8 bg-transparent border-none p-0 text-lg font-bold text-orange-900 focus-visible:ring-0"
                                                                        disabled={isSoldOut}
                                                                    />
                                                                </div>
                                                            )}
                                                            <div className="col-span-3 text-[7px] font-bold text-slate-500 uppercase tracking-tighter opacity-70 group-hover/discount:opacity-100 transition-opacity">
                                                                {formData.arrival_type === 'commission'
                                                                    ? "Less% and Other Cut are discounts deducted from farmer payment."
                                                                    : "Less% acts as a discount deducted from supplier payment."}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="col-span-2 grid grid-cols-2 gap-3 bg-blue-50/50 p-3 rounded-xl border border-blue-100 relative group/mandi">
                                                    {isVisible('loading_cost') && (
                                                        <div className="space-y-1.5">
                                                            <Label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                                                                {getLabel('loading_cost', 'Loading Cost (₹)')} {isMandatory('loading_cost') && <span className="text-red-500">*</span>}
                                                            </Label>
                                                            <Input
                                                                type="number"
                                                                value={formData.loading_cost}
                                                                onChange={(e) => setFormData({ ...formData, loading_cost: e.target.value === "" ? "" : Number(e.target.value) })}
                                                                className={cn("h-8 bg-transparent border-none p-0 text-sm font-bold text-slate-900 focus-visible:ring-0", isMandatory('loading_cost') && formData.loading_cost === 0 && "border-b border-amber-500/50")}
                                                                disabled={isSoldOut}
                                                            />
                                                        </div>
                                                    )}
                                                    {isVisible('packing_cost') && (
                                                        <div className="space-y-1.5">
                                                            <Label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                                                                {getLabel('packing_cost', 'Packing Cost (₹)')} {isMandatory('packing_cost') && <span className="text-red-500">*</span>}
                                                            </Label>
                                                            <Input
                                                                type="number"
                                                                value={formData.packing_cost}
                                                                onChange={(e) => setFormData({ ...formData, packing_cost: e.target.value === "" ? "" : Number(e.target.value) })}
                                                                className={cn("h-8 bg-transparent border-none p-0 text-sm font-bold text-slate-900 focus-visible:ring-0", isMandatory('packing_cost') && formData.packing_cost === 0 && "border-b border-amber-500/50")}
                                                                disabled={isSoldOut}
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="col-span-2 text-[7px] font-bold text-blue-600 uppercase tracking-tighter opacity-70 group-hover/mandi:opacity-100 transition-opacity">
                                                        {formData.arrival_type === 'direct'
                                                            ? "Packing, Loading, and Transport are borne by Mandi."
                                                            : formData.arrival_type === 'commission_supplier'
                                                                ? "Packing, Loading, and Transport are borne by Supplier."
                                                                : "Packing, Loading, and Transport are borne by Farmer."}
                                                    </div>
                                                </div>
                                                 {isVisible('advance') && (
                                                    <div className="col-span-2 space-y-6 p-6 rounded-3xl bg-[#F8FAFC]/80 border-2 border-slate-200/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative group/advance overflow-hidden">
                                                        {/* Decorative Background */}
                                                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />
                                                        
                                                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                                            <div className="space-y-1">
                                                                <Label className="text-[12px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                                                    <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                                                                    PAYMENT SETTLEMENT
                                                                </Label>
                                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Choose mode & specify amount</p>
                                                            </div>
                                                            <div className="flex bg-slate-200/50 p-1 rounded-2xl gap-1 border border-slate-200/50 shadow-inner">
                                                                {[
                                                                    { value: 'credit', label: 'UDHAAR', icon: ShieldCheck },
                                                                    { value: 'cash', label: 'CASH', icon: IndianRupee },
                                                                    { value: 'upi_bank', label: 'UPI/BANK', icon: Zap },
                                                                    { value: 'cheque', label: 'CHEQUE', icon: Landmark },
                                                                ].map(mode => (
                                                                    <button
                                                                        key={mode.value}
                                                                        type="button"
                                                                        onClick={() => setFormData({ ...formData, advance_payment_mode: mode.value as any })}
                                                                        className={cn(
                                                                            "px-4 h-9 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all flex items-center gap-2",
                                                                            formData.advance_payment_mode === mode.value
                                                                                ? "bg-slate-900 text-white shadow-xl shadow-slate-900/10 scale-[1.02]"
                                                                                : "text-slate-500 hover:text-slate-900 hover:bg-white/80"
                                                                        )}
                                                                        disabled={isSoldOut}
                                                                    >
                                                                        <mode.icon className={cn("w-3.5 h-3.5", formData.advance_payment_mode === mode.value ? "text-blue-400" : "text-slate-400")} />
                                                                        {mode.label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {formData.advance_payment_mode !== 'credit' && (
                                                            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                                                                    <div className="space-y-2 relative group/amount">
                                                                        <div className="flex items-center justify-between px-1">
                                                                            <Label className="text-[10px] font-black underline decoration-blue-500/20 underline-offset-4 text-slate-600 uppercase tracking-widest">Amount Payable (₹)</Label>
                                                                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">MAX: ₹{payableBalance.toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="relative group/input shadow-sm hover:shadow-md transition-shadow duration-300 rounded-2xl overflow-hidden">
                                                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-300 group-focus-within/input:text-blue-600 transition-colors">₹</div>
                                                                            <Input
                                                                                type="number"
                                                                                placeholder="0.00"
                                                                                value={formData.advance || ""}
                                                                                onChange={(e) => {
                                                                                    const val = Number(e.target.value);
                                                                                    if (val > payableBalance) {
                                                                                        setFormData({ ...formData, advance: payableBalance });
                                                                                        toast({ 
                                                                                            title: "Amount Capped", 
                                                                                            description: `Payment cannot exceed the total payable balance of ₹${payableBalance.toLocaleString()}.`, 
                                                                                            variant: "default",
                                                                                            className: "bg-amber-50 border-amber-200 text-amber-900"
                                                                                        });
                                                                                    } else {
                                                                                        setFormData({ ...formData, advance: e.target.value === "" ? "" : val });
                                                                                    }
                                                                                }}
                                                                                className="h-16 pl-10 pr-6 border-2 border-slate-200 bg-white rounded-2xl text-3xl font-[1000] tracking-tighter text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none"
                                                                                disabled={isSoldOut}
                                                                            />
                                                                        </div>
                                                                        <p className="text-[9px] font-bold text-slate-400 italic px-1 uppercase tracking-tighter">Enter amount to settle manually or leave as balance</p>
                                                                    </div>

                                                                    {(formData.advance_payment_mode === 'upi_bank' || formData.advance_payment_mode === 'cheque') && (
                                                                        <div className="space-y-2 animate-in slide-in-from-right-4 duration-300">
                                                                            <Label className="text-[10px] font-black text-slate-600 uppercase tracking-widest pl-1">📥 SETTLE TO (BANK ACCOUNT)</Label>
                                                                            <Select 
                                                                                value={formData.advance_bank_account_id} 
                                                                                onValueChange={(v) => setFormData({ ...formData, advance_bank_account_id: v })}
                                                                                disabled={isSoldOut}
                                                                            >
                                                                                <SelectTrigger className="h-16 bg-white border-2 border-slate-200 rounded-2xl font-black text-sm px-6 hover:border-slate-300 focus:ring-4 focus:ring-blue-500/5 transition-all shadow-sm">
                                                                                    <SelectValue placeholder="Select bank destination..." />
                                                                                </SelectTrigger>
                                                                                <SelectContent className="bg-white border-slate-200 shadow-2xl p-2 rounded-2xl">
                                                                                    {bankAccounts.map((b: any) => (
                                                                                        <SelectItem key={b.id} value={b.id} className="font-black py-4 uppercase tracking-tighter text-slate-700 hover:text-blue-700 focus:bg-blue-50 focus:text-blue-700 rounded-xl transition-all border-b last:border-0 border-slate-50">{b.name}</SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {formData.advance_payment_mode === 'cheque' && (
                                                                    <div className="p-6 bg-amber-50/50 border-2 border-amber-100 rounded-3xl space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 shadow-inner">
                                                                        <div className="flex items-center justify-between bg-white/80 p-3 px-5 rounded-2xl border border-amber-100 shadow-sm">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className={cn(
                                                                                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm rotate-3",
                                                                                    formData.advance_cheque_status ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                                                                                )}>
                                                                                    <ShieldCheck className={cn("w-6 h-6", formData.advance_cheque_status ? "animate-bounce" : "opacity-50")} />
                                                                                </div>
                                                                                <div>
                                                                                    <span className={cn("text-[11px] font-[1000] uppercase tracking-widest block", formData.advance_cheque_status ? "text-emerald-800" : "text-amber-800")}>
                                                                                        {formData.advance_cheque_status ? 'MARK CLEARED' : 'CLEAR LATER'}
                                                                                    </span>
                                                                                    <p className={cn("text-[8px] font-bold uppercase tracking-widest opacity-60", formData.advance_cheque_status ? "text-emerald-600" : "text-amber-600")}>
                                                                                        {formData.advance_cheque_status ? 'Instantly update ledger' : 'Requires reconciliation'}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                            <Switch
                                                                                checked={formData.advance_cheque_status}
                                                                                onCheckedChange={(v) => setFormData({ ...formData, advance_cheque_status: v })}
                                                                                className="data-[state=checked]:bg-emerald-600 scale-125"
                                                                                disabled={isSoldOut}
                                                                            />
                                                                        </div>

                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                            <div className="space-y-2">
                                                                                <Label className="text-[9px] font-black text-amber-700/60 uppercase tracking-[0.2em] pl-1 flex items-center gap-1.5">
                                                                                    <Hash className="w-3 h-3" /> CHEQUE NUMBER
                                                                                </Label>
                                                                                <Input
                                                                                    value={formData.advance_cheque_no}
                                                                                    onChange={(e) => setFormData({ ...formData, advance_cheque_no: e.target.value })}
                                                                                    className="h-12 bg-white border-2 border-amber-200/50 rounded-2xl px-5 font-black text-slate-800 placeholder:text-amber-900/20 focus:border-amber-400 focus:ring-4 focus:ring-amber-500/5 transition-all shadow-sm"
                                                                                    placeholder="Enter 6-digit no..."
                                                                                    disabled={isSoldOut}
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-2">
                                                                                <Label className="text-[9px] font-black text-amber-700/60 uppercase tracking-[0.2em] pl-1 flex items-center gap-1.5">
                                                                                    <Landmark className="w-3 h-3" /> PARTY BANK NAME
                                                                                </Label>
                                                                                <Input
                                                                                    value={formData.advance_bank_name}
                                                                                    onChange={(e) => setFormData({ ...formData, advance_bank_name: e.target.value.toUpperCase() })}
                                                                                    className="h-12 bg-white border-2 border-amber-200/50 rounded-2xl px-5 font-black text-slate-800 placeholder:text-amber-900/20 focus:border-amber-400 focus:ring-4 focus:ring-amber-500/5 transition-all shadow-sm"
                                                                                    placeholder="SBI, HDFC, etc..."
                                                                                    disabled={isSoldOut}
                                                                                />
                                                                            </div>
                                                                            {!formData.advance_cheque_status && (
                                                                                <div className="col-span-2 space-y-2 animate-in slide-in-from-bottom-2 duration-300">
                                                                                    <Label className="text-[9px] font-black text-amber-700/60 uppercase tracking-[0.2em] pl-1 flex items-center gap-1.5">
                                                                                        <CalendarIcon className="w-3 h-3" /> EXPECTED CLEARING DATE
                                                                                    </Label>
                                                                                    <Input
                                                                                        type="date"
                                                                                        value={formData.advance_cheque_date ? formData.advance_cheque_date.toISOString().split('T')[0] : ""}
                                                                                        onChange={(e) => setFormData({ ...formData, advance_cheque_date: e.target.value ? new Date(e.target.value) : null })}
                                                                                        className="h-12 bg-white border-2 border-amber-200/50 rounded-2xl px-5 font-black text-slate-800 focus:border-amber-400 focus:ring-4 focus:ring-amber-500/5 transition-all shadow-sm"
                                                                                        disabled={isSoldOut}
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        
                                                        <div className="flex items-center gap-2 bg-white/40 p-3 rounded-2xl border border-white isolate">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                                            <p className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest opacity-80">
                                                                {formData.advance_payment_mode === 'credit' 
                                                                    ? "No advance payment will be recorded in the ledger." 
                                                                    : "Financial ledger entries will be generated automatically upon save."}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <SheetFooter className="p-8 bg-white border-t border-slate-200 backdrop-blur-xl shrink-0">
                    <div className="flex flex-col gap-4 w-full">
                        {!isSoldOut && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowWastage(true)}
                                className="w-full h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700 transition-all"
                            >
                                <Trash2 className="w-4 h-4 mr-2" /> Report Loss to {formData.arrival_type === 'direct' ? 'Mandi' : 'Supplier'}
                            </Button>
                        )}
                        <div className="flex gap-4 w-full">
                            <Button
                                variant="ghost"
                                onClick={onClose}
                                className="flex-1 h-14 rounded-2xl text-slate-500 font-bold border border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                            >
                                <X className="w-4 h-4 mr-2" /> CANCEL
                            </Button>
                            {!isSoldOut && (
                                <Button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex-[2] h-14 rounded-2xl bg-blue-600 text-white font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <><Save className="w-5 h-5 mr-3" /> COMMIT CHANGES</>}
                                </Button>
                            )}
                            {isSoldOut && (
                                <Button
                                    disabled
                                    className="flex-[2] h-14 rounded-2xl bg-red-50 text-red-500 font-black uppercase tracking-widest border border-red-200 cursor-not-allowed"
                                >
                                    <ShieldCheck className="w-5 h-5 mr-3" /> SETTLED & LOCKED
                                </Button>
                            )}
                        </div>
                    </div>
                </SheetFooter>
            </SheetContent>

            <WastageDialog
                isOpen={showWastage}
                onClose={() => setShowWastage(false)}
                lot={{
                    ...data,
                    ...formData,
                    id: lotId,
                    current_qty: data?.current_qty, // Use actual current stock from DB
                    arrival_type: formData.arrival_type // Ensure dialog knows current type
                }}
                onSuccess={() => {
                    onUpdate();
                    onClose();
                }}
            />
        </Sheet>
    );
}
