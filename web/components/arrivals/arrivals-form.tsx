"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CalendarIcon, Camera, Plus, Trash2, Loader2, Package, ShieldAlert, Settings, Info, Check, ChevronsUpDown, Search, Landmark, Zap, Wallet, CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEnterToTab } from "@/hooks/use-enter-to-tab";
import LotQRSlip, { LotQRData, generateQRString } from "./lot-qr-slip";
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { ItemDialog } from "@/components/inventory/item-dialog";
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache";
import { useArrivalsMasterData } from "@/hooks/mandi/useArrivalsMasterData";
import { useArrivals } from "@/hooks/mandi/useArrivals";
import { useFieldGovernance } from "@/hooks/useFieldGovernance";

const itemSchema = z.object({
    item_id: z.string().optional(),
    qty: z.coerce.number().min(0, "Qty must be at least 0"),
    unit: z.string().optional(),
    grade: z.string().default('A'),
    unit_weight: z.coerce.number().min(0).default(0),
    variety: z.string().optional(),
    supplier_rate: z.coerce.number().min(0).default(0),
    commission_percent: z.coerce.number().min(0).default(0),
    less_percent: z.coerce.number().min(0).default(0),
    less_units: z.coerce.number().min(0).default(0),
    packing_cost: z.coerce.number().min(0).default(0),
    loading_cost: z.coerce.number().min(0).default(0),
    farmer_charges: z.coerce.number().min(0).default(0),
    sale_price: z.coerce.number().min(0).default(0),
    barcode: z.string().optional(),
});

const formSchema = z.object({
    entry_date: z.date(),
    reference_no: z.string().optional(),
    lot_prefix: z.string().optional(),
    contact_id: z.string().optional(),
    arrival_type: z.enum(["direct", "commission", "commission_supplier"]),
    storage_location: z.string().optional(),

    // Transport
    vehicle_number: z.string().optional(),
    vehicle_type: z.string().optional(),
    driver_name: z.string().optional(),
    driver_mobile: z.string().optional(),

    // Business
    guarantor: z.string().optional(),

    // Expenses
    loaders_count: z.coerce.number().default(0),
    hire_charges: z.coerce.number().default(0),
    hamali_expenses: z.coerce.number().default(0),
    other_expenses: z.coerce.number().default(0),

    // Advance Payment (Trip-level)
    advance: z.coerce.number().min(0).default(0),
    advance_payment_mode: z.string().default('credit'),
    advance_cheque_no: z.string().optional(),
    advance_cheque_date: z.date().optional(),
    advance_bank_name: z.string().optional(),
    advance_bank_account_id: z.string().optional(),
    advance_cheque_status: z.boolean().default(false),

    auto_print_qr: z.boolean().default(false), // User requested optional popups

    items: z.array(itemSchema).min(1, "At least one item is required"),
});

type FormValues = z.infer<typeof formSchema>;

export default function ArrivalsEntryForm() {
    const { toast } = useToast();
    const pathname = usePathname();
    const router = useRouter();
    const { profile, loading: authLoading } = useAuth();
    
    // Domain Hooks
    const { 
        contacts, 
        commodities: availableItems, 
        storageLocations, 
        bankAccounts, 
        defaultCommissionRate,
        loading: masterLoading,
        error: masterError,
        refetch: refetchMaster
    } = useArrivalsMasterData(profile?.organization_id);

    const { createArrival, isCreating } = useArrivals();

    // QR Code State

    const [arrivalType, setArrivalType] = useState<"direct" | "commission" | "commission_supplier">("direct");
    const [showUnlock, setShowUnlock] = useState(false);
    const [qrLots, setQrLots] = useState<any[]>([]);
    const [qrSlipsOpen, setQrSlipsOpen] = useState(false);
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [dialogConfig, setDialogConfig] = useState<{ title: string; message: string; type: 'success' | 'error' }>({
        title: '',
        message: '',
        type: 'success'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const { isVisible, isMandatory, getLabel, getDefaultValue } = useFieldGovernance(
        arrivalType === 'direct' ? 'arrivals_direct' :
            arrivalType === 'commission' ? 'arrivals_farmer' :
                'arrivals_supplier'
    );

    useEffect(() => {
        const timer = setTimeout(() => setShowUnlock(true), 12000);
        return () => clearTimeout(timer);
    }, []);
    const [showPreview, setShowPreview] = useState(false);
    const [search, setSearch] = useState("");
    const [openFarmer, setOpenFarmer] = useState(false);
    const [pendingValues, setPendingValues] = useState<any>(null);
    const [barcodeDuplicates, setBarcodeDuplicates] = useState<Record<number, string>>({});

    const formRef = useRef<HTMLFormElement>(null);
    useEnterToTab(formRef);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            entry_date: new Date(),
            lot_prefix: `LOT-${format(new Date(), 'yyMMdd')}`,
            arrival_type: "direct",
            storage_location: getDefaultValue('storage_location', 'select') || "",
            loaders_count: 0,
            hire_charges: 0,
            hamali_expenses: 0,
            other_expenses: 0,
            advance: 0,
            advance_payment_mode: "credit",
            advance_bank_account_id: "",
            advance_cheque_no: "",
            advance_bank_name: "",
            advance_cheque_status: false,
            auto_print_qr: false,
            items: [{
                item_id: "",
                qty: 0,
                unit: "Box",
                grade: "A",
                variety: "",
                unit_weight: 0,
                supplier_rate: 0,
                commission_percent: 0,
                less_percent: 0,
                less_units: 0,
                packing_cost: 0,
                loading_cost: 0,
                farmer_charges: 0,
                sale_price: 0,
                barcode: ""
            }]
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    const hire = form.watch('hire_charges') || 0;
    const hamali = form.watch('hamali_expenses') || 0;
    const others = form.watch('other_expenses') || 0;
    const loaders = form.watch('loaders_count') || 0;
    const totalTripDeductions = Number(hire) + Number(hamali) + Number(others);


    // Calculate financial breakdown for commission-based items
    const calculateItemFinancials = (itemIndex: number) => {
        const item = form.watch(`items.${itemIndex}`);
        if (!item) return {
            qty: 0, adjustedQty: 0, rate: 0, grossValue: 0, adjustedValue: 0,
            commissionAmount: 0, totalExpenses: 0, farmerPayment: 0,
            lessPercent: 0, commissionPercent: 0, transportShare: 0, netCost: 0
        };

        const qty = Number(item.qty) || 0;
        const rate = Number(item.supplier_rate) || 0;
        const commissionPercent = Number(item.commission_percent) || 0;
        const lessPercent = Number(item.less_percent) || 0;
        const packing = Number(item.packing_cost) || 0;
        const loading = Number(item.loading_cost) || 0;
        const otherCut = Number(item.farmer_charges) || 0;
        const arrivalType = form.watch('arrival_type');

        // Gross Sale Value
        const grossValue = qty * rate;

        // Adjusted Quantity (after Less %)
        const adjustedQty = qty - (qty * lessPercent / 100);

        // Adjusted Value (after Less % applied)
        // USER REQUEST: Other Cut is a discount to Mandi, should come under adjusted value.
        const baseAdjustedValue = adjustedQty * rate;
        const adjustedValue = baseAdjustedValue - otherCut;

        // Commission Amount (calculated on base adjusted value, NOT after the other cut)
        const commissionAmount = arrivalType === 'direct' ? 0 : (baseAdjustedValue * commissionPercent / 100);

        // Transport Expenses (arrival-level, need proportional split)
        const allItems = form.watch('items') || [];
        const totalArrivalValue = allItems.reduce((sum, itm) => {
            const iQty = Number(itm.qty) || 0;
            const iRate = Number(itm.supplier_rate) || 0;
            const iLess = Number(itm.less_percent) || 0;
            const iOtherCut = Number(itm.farmer_charges) || 0;
            const iAdjustedQty = iQty - (iQty * iLess / 100);
            const iBaseAdjusted = iAdjustedQty * iRate;
            const iAdjusted = iBaseAdjusted - iOtherCut;
            return sum + (iAdjusted > 0 ? iAdjusted : 0);
        }, 0);

        const totalTransportExpenses = Number(totalTripDeductions) || 0;

        const itemTransportShare = totalArrivalValue > 0
            ? (adjustedValue / totalArrivalValue) * totalTransportExpenses
            : 0;

        // Total Expenses (item-level + transport share)
        const totalExpenses = packing + loading + itemTransportShare;

        // farmerPayment (Before arrival-level advance)
        const farmerPayment = arrivalType === 'direct'
            ? adjustedValue
            : adjustedValue - commissionAmount - totalExpenses;

        // Net Cost (to Mandi)
        const netCost = arrivalType === 'direct'
            ? adjustedValue + totalExpenses
            : adjustedValue;

        return {
            qty,
            adjustedQty,
            rate,
            grossValue: isNaN(grossValue) ? 0 : grossValue,
            adjustedValue: isNaN(adjustedValue) ? 0 : adjustedValue,
            commissionAmount: isNaN(commissionAmount) ? 0 : commissionAmount,
            totalExpenses: isNaN(totalExpenses) ? 0 : totalExpenses,
            farmerPayment: isNaN(farmerPayment) ? 0 : farmerPayment,
            netCost: isNaN(netCost) ? 0 : netCost,
            lessPercent,
            commissionPercent,
            transportShare: isNaN(itemTransportShare) ? 0 : itemTransportShare
        };
    };

    // Derived Financials for Validation/UI
    const currentItems = form.watch('items') || [];
    const totalNetBill = currentItems.reduce((sum, _, i) => {
        const financials = calculateItemFinancials(i);
        return sum + financials.farmerPayment;
    }, 0);
    const advanceAmount = Number(form.watch('advance') || 0);
    const isOverpaid = advanceAmount > (totalNetBill + 0.1) && totalNetBill >= 0;


    const calculateTotalPayable = () => {
        return Math.max(0, Math.round(totalNetBill));
    };


    const currentArrivalType = form.watch('arrival_type');

    useEffect(() => {
        if (currentArrivalType === 'commission' || currentArrivalType === 'commission_supplier') {
            const currentItems = form.getValues('items') || [];
            currentItems.forEach((item, index) => {
                if (!item.commission_percent || item.commission_percent === 0) {
                    form.setValue(`items.${index}.commission_percent`, defaultCommissionRate);
                }
            });
        }
    }, [currentArrivalType, defaultCommissionRate, form]);

    useEffect(() => {
        const currentOrgId = String(profile?.organization_id || "");
        if (!currentOrgId || currentOrgId === '[object Object]' || currentOrgId === 'undefined') return;

        const schema = 'mandi';
        const uniqueId = Math.random().toString(36).substring(7);
        const subscription = supabase
            .channel(`arrivals-realtime-${uniqueId}`)
            .on('postgres_changes', { event: '*', schema: schema, table: 'arrivals', filter: `organization_id=eq.${currentOrgId}` }, () => refetchMaster())
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [profile, refetchMaster]);



    if (authLoading || masterLoading) {
        return (
            <div className="p-12 flex flex-col items-center justify-center gap-6 text-gray-400">
                <div className="relative">
                    <Loader2 className="w-12 h-12 animate-spin text-neon-green/50" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2 h-2 bg-neon-green rounded-full animate-pulse" />
                    </div>
                </div>
                <div className="text-center space-y-2">
                    <p className="font-bold text-white tracking-widest uppercase text-xs">Synchronizing Security...</p>
                    <p className="text-[10px] text-gray-500 font-mono tracking-tighter">ENCRYPTED TUNNEL: {profile ? 'READY' : 'ESTABLISHING'}</p>
                </div>
                {showUnlock && (
                    <Button
                        variant="ghost"
                        onClick={() => window.location.reload()}
                        className="text-[10px] text-neon-green hover:text-white hover:bg-neon-green/10 font-black tracking-widest uppercase"
                    >
                        [ TIMEOUT: FORCE RE-SYNC ]
                    </Button>
                )}
            </div>
        )
    }

    // ── AUTH CHECK ────────────────────────────────────────────────────────────
    // Redundant component-level auth blocking removed. 
    // AuthProvider handles global redirection and self-healing.
    if (!profile) return null;
    // ──────────────────────────────────────────────────────────────────────────



    const onInvalid = (errors: any) => {
        console.log("onInvalid: Validation Errors:", errors);
        const errorList: string[] = [];

        // Collect field labels/names for the summary toast
        Object.keys(errors).forEach(key => {
            if (key !== 'items' && errors[key]) {
                errorList.push(getLabel(key, key.replace('_', ' ')));
            }
        });

        if (errors.items) {
            errors.items.forEach((itemError: any, idx: number) => {
                if (itemError) {
                    Object.keys(itemError).forEach(key => {
                        if (itemError[key]) {
                            const label = getLabel(key, key.replace('_', ' '));
                            if (!errorList.includes(label)) errorList.push(label);
                        }
                    });
                }
            });
        }

        if (errorList.length > 0) {
            toast({
                title: "Missing Required Fields",
                description: `Please check: ${errorList.join(', ')}`,
                variant: "destructive"
            });

            // Focus the first error
            const firstErrorKey = Object.keys(errors)[0];
            if (firstErrorKey) {
                if (firstErrorKey === 'items' && errors.items) {
                    const firstItemIdx = errors.items.findIndex((i: any) => i !== undefined);
                    if (firstItemIdx !== -1) {
                        const firstItemErrorKey = Object.keys(errors.items[firstItemIdx])[0];
                        form.setFocus(`items.${firstItemIdx}.${firstItemErrorKey}` as any);
                    }
                } else {
                    form.setFocus(firstErrorKey as any);
                }
            }
        }
    };

    const validateMandatory = (values: FormValues) => {
        const errors: { field: string; message: string }[] = [];

        // 1. Check Header Fields
        const headerFields = ['lot_prefix', 'reference_no', 'storage_location', 'contact_id', 'vehicle_number', 'vehicle_type', 'guarantor', 'driver_name', 'driver_mobile'];
        for (const f of headerFields) {
            if (isMandatory(f)) {
                const val = (values as any)[f];
                if (!val || (typeof val === 'number' && val === 0)) {
                    errors.push({ field: f, message: `${getLabel(f, f.replace('_', ' '))} is required.` });
                }
            }
        }

        // 2. Check Item Fields
        values.items.forEach((item, idx) => {
            const itemFields = ['item_id', 'qty', 'unit', 'unit_weight', 'supplier_rate', 'commission_percent', 'less_percent', 'packing_cost', 'loading_cost', 'advance', 'farmer_charges'];
            itemFields.forEach(f => {
                if (isMandatory(f)) {
                    const val = (item as any)[f];
                    if (!val || (typeof val === 'number' && val === 0)) {
                        errors.push({ field: `items.${idx}.${f}`, message: `Item #${idx + 1}: ${getLabel(f, f.replace('_', ' '))} is required.` });
                    }
                }
            });
        });

        return errors;
    };

    const checkBarcodeUniqueness = async (items: any[]) => {
        if (!profile?.organization_id) return {};
        const schema = 'mandi';
        const duplicates: Record<number, string> = {};

        // 1. Internal Cross-Check (Duplicate in same form)
        const formBarcodes = new Map<string, number[]>();
        items.forEach((item, idx) => {
            if (item.barcode?.trim()) {
                const bc = item.barcode.trim();
                const indices = formBarcodes.get(bc) || [];
                indices.push(idx);
                formBarcodes.set(bc, indices);
            }
        });

        const formBarcodeEntries = Array.from(formBarcodes.entries());
        for (const [bc, indices] of formBarcodeEntries) {
            if (indices.length > 1) {
                // Mark all except the first one as duplicate (or all? let's mark the ones after first)
                indices.slice(1).forEach(idx => {
                    duplicates[idx] = `Duplicate barcode "${bc}" found in another item in this entry.`;
                });
            }
        }

        // 2. Database Check (Already exists in stock/lots)
        const uniqueBarcodes = Array.from(formBarcodes.keys());
        if (uniqueBarcodes.length > 0) {
            const { data, error } = await supabase
                .schema(schema)
                .from('lots')
                .select('barcode, lot_code, current_qty')
                .eq('organization_id', profile.organization_id)
                .in('barcode', uniqueBarcodes.filter(bc => bc && bc.trim() !== ''))
                .gt('current_qty', 0);

            if (data && data.length > 0) {
                data.forEach(row => {
                    const indices = formBarcodes.get(row.barcode) || [];
                    indices.forEach(idx => {
                        duplicates[idx] = `Barcode "${row.barcode}" already exists in stock (Lot: ${row.lot_code}).`;
                    });
                });
            }
        }

        return duplicates;
    };

    const onPreSubmit = async (values: z.infer<typeof formSchema>) => {
        const dynErrors = validateMandatory(values);
        if (dynErrors.length > 0) {
            toast({
                title: "Incomplete Entry",
                description: dynErrors[0].message,
                variant: "destructive"
            });
            // Focus the first invalid field
            form.setFocus(dynErrors[0].field as any);
            return;
        }

        // Check Barcode Uniqueness
        setIsSubmitting(true);
        const duplicates = await checkBarcodeUniqueness(values.items);
        setIsSubmitting(false);
        setBarcodeDuplicates(duplicates);

        if (Object.keys(duplicates).length > 0) {
            const firstIdx = Object.keys(duplicates)[0];
            toast({
                title: "Duplicate Barcode Detected",
                description: duplicates[Number(firstIdx)],
                variant: "destructive"
            });
            form.setFocus(`items.${firstIdx}.barcode` as any);
            return;
        }

        // 3. Payment Validation: Prevent Advance > Total Net Cost
        const totalAdvance = Number(values.advance) || 0;
        // totalNetBill is already calculated as a derived property above

        // Validate positive amount for non-credit modes
        if (values.advance_payment_mode !== 'credit' && totalAdvance <= 0) {
            toast({
                title: "Payment Amount Required",
                description: `Please enter a paid amount greater than 0 for ${values.advance_payment_mode.toUpperCase()} mode.`,
                variant: "destructive"
            });
            form.setFocus(`advance`);
            return;
        }

        if (totalAdvance > totalNetBill && totalNetBill > 0) {
            toast({
                title: "Invalid Payment Amount",
                description: `Total Paid (₹${totalAdvance.toLocaleString()}) cannot exceed Net Payable Amount (₹${totalNetBill.toLocaleString()}).`,
                variant: "destructive"
            });
            form.setFocus(`advance`);
            return;
        }

        // Bank Account Validation: Required for UPI/BANK and Cheque modes
        if ((values.advance_payment_mode === 'upi_bank' || values.advance_payment_mode === 'cheque') && !values.advance_bank_account_id) {
            toast({
                title: "Bank Account Required",
                description: `Select a bank account to settle ${values.advance_payment_mode === 'upi_bank' ? 'UPI/BANK payment' : 'cheque'}.`,
                variant: "destructive"
            });
            form.setFocus(`advance_bank_account_id`);
            return;
        }

        // Cheque Date Validation: Required if cheque is not instantly cleared
        if (values.advance_payment_mode === 'cheque' && !values.advance_cheque_status && !values.advance_cheque_date) {
            toast({
                title: "Cheque Clear Date Required",
                description: "If cheque will clear later, please specify the expected clearing date.",
                variant: "destructive"
            });
            form.setFocus(`advance_cheque_date`);
            return;
        }

        setPendingValues(values);
        setShowPreview(true);
    };

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setShowPreview(false);
        if (!profile?.organization_id) return;

        // Double check validation before actual DB submission
        const dynErrors = validateMandatory(values);
        if (dynErrors.length > 0) {
            toast({ title: "Validation Error", description: dynErrors[0].message, variant: "destructive" });
            return;
        }

        setIsSubmitting(true);

        try {
            const payload: any = {
                arrival_date: format(values.entry_date, 'yyyy-MM-dd'),
                party_id: values.contact_id || null,
                arrival_type: values.arrival_type,
                lot_prefix: values.lot_prefix || 'LOT',
                storage_location: values.storage_location || null,
                vehicle_number: values.vehicle_number || null,
                vehicle_type: values.vehicle_type || null,
                driver_name: values.driver_name || null,
                driver_mobile: values.driver_mobile || null,
                guarantor: values.guarantor || null,
                loaders_count: values.loaders_count,
                hire_charges: values.hire_charges,
                hamali_expenses: values.hamali_expenses,
                other_expenses: values.other_expenses,
                advance: values.advance,
                advance_payment_mode: values.advance_payment_mode,
                advance_bank_account_id: values.advance_bank_account_id || null,
                advance_cheque_no: values.advance_cheque_no || null,
                advance_cheque_date: values.advance_cheque_date ? format(values.advance_cheque_date as Date, 'yyyy-MM-dd') : null,
                advance_bank_name: values.advance_bank_name || null,
                reference_no: values.reference_no || null,
                items: values.items
            };

            const result = await createArrival(payload);
            if (!result) return; // Hook handles error toasts

            // Update QR Code state for printing
            if (result.lot_codes && result.lot_codes.length > 0) {
                 const createdLotsForQr = result.lot_codes.map((code: string, idx: number) => {
                     const item = values.items[idx];
                     const itemName = availableItems?.find(i => i.id === item.item_id)?.name || 'Unknown Item';
                     const partyName = contacts?.find(c => c.id === values.contact_id)?.name || 'Unknown Party';
                     return {
                        qrNumber: `MANDI_LOT:{"orgId":"${profile.organization_id}","lotCode":"${code}","type":"${values.arrival_type}"}`,
                        item_id: item.item_id,
                        arrivalType: values.arrival_type,
                        unitWeight: item.unit_weight,
                        lotCode: code,
                        itemName,
                        qty: item.qty,
                        unit: item.unit,
                        partyName,
                        date: values.entry_date.toISOString(),
                     }
                 });
                 setQrLots(createdLotsForQr);
                 if (form.getValues('auto_print_qr')) {
                     setTimeout(() => setQrSlipsOpen(true), 300);
                 }
            }

            setDialogConfig({
                title: "Arrival Logged",
                message: values.arrival_type === 'direct'
                    ? "Direct purchase logged. Ready for settlement."
                    : "Commission arrival logged successfully.",
                type: 'success'
            });
            setShowSuccessDialog(true);

            form.reset({
                entry_date: new Date(),
                lot_prefix: `LOT-${format(new Date(), 'yyMMdd')}`,
                arrival_type: values.arrival_type,
                storage_location: values.storage_location,
                loaders_count: 0,
                hire_charges: 0,
                hamali_expenses: 0,
                other_expenses: 0,
                advance: 0,
                advance_payment_mode: 'cash',
                advance_bank_account_id: "",
                advance_cheque_status: false,
                auto_print_qr: form.getValues('auto_print_qr'), // persist preference
                items: [{
                    item_id: "",
                    qty: 0,
                    unit: "Box",
                    grade: "A",
                    variety: "",
                    unit_weight: 0,
                    supplier_rate: 0,
                    commission_percent: getDefaultValue('commission_percent', 'number') || (values.arrival_type === 'direct' ? 0 : defaultCommissionRate),
                    less_percent: 0,
                    less_units: 0,
                    packing_cost: 0,
                    loading_cost: 0,
                    farmer_charges: 0
                }]
            });
        } catch (error: any) {
            console.error("onSubmit: Caught Error:", error);
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            console.log("onSubmit: Finally block reached. Resetting submitting state.");
            setIsSubmitting(false);
        }
    }

    return (
        <Form {...(form as any)}>
            <form ref={formRef} onSubmit={form.handleSubmit(onPreSubmit, onInvalid)} className="space-y-4">
                <div className="bg-white border border-slate-300 rounded-2xl shadow-sm relative overflow-hidden">
                    <div className="p-4 md:p-6">
                        {/* Summary Header */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 border-b border-slate-100/80 pb-8">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-md shadow-blue-500/10">
                                        <Package className="w-5 h-5" />
                                    </div>
                                    ARRIVALS <span className="text-blue-600 font-bold">(INWARD)</span>
                                </h1>
                                <p className="text-slate-700 font-semibold tracking-wide uppercase text-[9px] mt-1 ml-1">
                                    Log incoming inventory & financial details
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                                {/* Date Selection */}
                                <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl flex-1 md:flex-none min-w-[180px] hover:bg-white transition-all">
                                    <div className="text-[9px] font-bold uppercase text-slate-700 tracking-wide mb-1 px-1">Arrival Date</div>
                                    {isVisible('entry_date') && (
                                        <FormField
                                            control={form.control}
                                            name="entry_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <Button variant="ghost" className="w-full justify-start text-left font-bold text-slate-900 hover:bg-transparent h-auto p-1 text-sm">
                                                                <CalendarIcon className="mr-2 h-4 w-4 text-blue-600" />
                                                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0" align="center">
                                                            <Calendar
                                                                mode="single"
                                                                selected={field.value}
                                                                onSelect={field.onChange}
                                                                initialFocus
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                    <FormMessage className="text-[10px] mt-1" />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Top Bar: Party selection & Truck details */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50 mb-6 items-end group shadow-sm">
                            <div className="md:col-span-5 space-y-1.5">
                                <Label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide ml-1">{getLabel('contact_id', 'SUPPLIER / PARTY')}</Label>
                                {isVisible('contact_id') && (
                                    <FormField
                                        control={form.control}
                                        name="contact_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <div className="flex gap-2">
                                                    <div className="flex-1">
                                                        <SearchableSelect
                                                            options={(contacts || []).map(c => ({
                                                                label: `${c?.name || 'Unnamed'} (${c?.city || 'No City'})`,
                                                                value: c?.id
                                                            }))}
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                            placeholder={getLabel('contact_id', 'Search Supplier Database...')}
                                                            className="h-10 text-slate-900 font-semibold bg-white border-slate-300"
                                                        />
                                                    </div>
                                                    <ContactDialog onSuccess={refetchMaster}>
                                                        <Button type="button" size="icon" className="h-10 w-10 rounded-lg bg-slate-900 text-white hover:bg-blue-600 transition-all shadow-sm">
                                                            <Plus className="w-4 h-4" />
                                                        </Button>
                                                    </ContactDialog>
                                                </div>
                                                <FormMessage className="text-[10px] mt-1" />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>

                            <div className="md:col-span-3 space-y-1.5">
                                <Label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide ml-1">{getLabel('vehicle_number', 'VEHICLE NUMBER')}</Label>
                                {isVisible('vehicle_number') && (
                                    <FormField
                                        control={form.control}
                                        name="vehicle_number"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormControl>
                                                    <div className="relative group">
                                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                                                        <Input
                                                            placeholder="XX-00-YY-0000"
                                                            {...field}
                                                            required={isMandatory('vehicle_number')}
                                                            className="bg-white border-slate-300 h-10 pl-11 text-slate-900 font-bold tracking-widest focus:ring-4 focus:ring-blue-500/5 transition-all rounded-lg shadow-sm"
                                                        />
                                                    </div>
                                                </FormControl>
                                                <FormMessage className="text-[10px] mt-1" />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>
                            <div className="md:col-span-4 space-y-2">
                                <Label className="text-[11px] font-black text-slate-700 uppercase tracking-widest ml-1">{getLabel('storage_location', 'STORAGE LOCATION')}</Label>
                                {isVisible('storage_location') && (
                                    <FormField
                                        control={form.control}
                                        name="storage_location"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Select onValueChange={field.onChange} value={field.value} required={isMandatory('storage_location')}>
                                                    <FormControl>
                                                        <SelectTrigger className="bg-white border border-slate-300 h-12 text-slate-900 font-bold rounded-xl shadow-sm">
                                                            <SelectValue placeholder={getLabel('storage_location', 'Select Storage Location')} />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-white border-gray-200 text-gray-900 shadow-xl">
                                                        {storageLocations.map((loc) => (
                                                            <SelectItem key={loc.name} value={loc.name}>{loc.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage className="text-xs text-red-500 font-bold mt-1" />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Main Form Content */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
                            {/* LEFT COLUMN: Basic Info */}
                            <div className="space-y-4">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-5 w-1 bg-blue-600 rounded-full shadow-sm" />
                                            <h3 className="text-base font-bold text-slate-800 tracking-tight uppercase">Arrival <span className="text-blue-600">Header</span></h3>
                                        </div>
                                    </div>

                                    <Tabs
                                        value={arrivalType}
                                        onValueChange={(v: any) => {
                                            setArrivalType(v);
                                            form.setValue('arrival_type', v);
                                        }}
                                        className="w-full"
                                    >
                                        <TabsList className="bg-slate-100/80 p-0.5 rounded-lg h-8 w-full grid grid-cols-3 border border-slate-300 shadow-sm">
                                            <TabsTrigger value="direct" className="rounded-md font-bold uppercase tracking-wide text-[10px] data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm text-slate-600 transition-all">
                                                Direct Purchase
                                            </TabsTrigger>
                                            <TabsTrigger value="commission" className="rounded-md font-bold uppercase tracking-wide text-[10px] data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm text-slate-600 transition-all">
                                                Farmer Comm.
                                            </TabsTrigger>
                                            <TabsTrigger value="commission_supplier" className="rounded-md font-bold uppercase tracking-wide text-[10px] data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm text-slate-600 transition-all">
                                                Supplier Comm.
                                            </TabsTrigger>
                                        </TabsList>
                                    </Tabs>
                                </div>

                                <div className="grid grid-cols-1 gap-6">
                                    {/* entry_date and contact_id are now in the top bar */}
                                    {isVisible('lot_prefix') && (
                                        <FormField
                                            control={form.control}
                                            name="lot_prefix"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-bold text-slate-700 uppercase tracking-wide ml-1">{getLabel('lot_prefix', 'Lot Prefix')}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="LOT-PREFIX" {...field} required={isMandatory('lot_prefix')} className="bg-white border border-slate-300 h-9 text-xs text-slate-900 font-bold font-mono rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 tracking-wide uppercase shadow-sm" />
                                                    </FormControl>
                                                    <FormMessage className="text-[10px] mt-1" />
                                                </FormItem>
                                            )}
                                        />
                                    )}

                                    {isVisible('reference_no') && (
                                        <FormField
                                            control={form.control}
                                            name="reference_no"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-bold text-slate-700 uppercase tracking-wide ml-1">{getLabel('reference_no', 'Ref / Bill No')}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="#" {...field} required={isMandatory('reference_no')} className="bg-white border border-slate-300 h-9 text-xs text-slate-900 font-bold rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all uppercase shadow-sm" />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    )}

                                    {/* storage_location is now in the top bar */}

                                    {/* contact_id is now in the top bar */}

                                    {/* vehicle_no is now in the top bar */}
                                </div>
                            </div>

                            {/* RIGHT COLUMN: Transport & Expenses */}
                            <div className="space-y-4 lg:border-l lg:border-gray-100 lg:pl-6">
                                <div className="flex items-center gap-2">
                                    <div className="h-6 w-1 bg-green-600 rounded-full" />
                                    <h3 className="text-lg font-bold text-gray-900 tracking-tight uppercase">Transport <span className="text-green-600">& Expenses</span></h3>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {isVisible('vehicle_type') && (
                                        <FormField
                                            control={form.control}
                                            name="vehicle_type"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-bold text-slate-700 uppercase tracking-wide ml-1">{getLabel('vehicle_type', 'Vehicle Type')}</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value} required={isMandatory('vehicle_type')}>
                                                        <FormControl>
                                                            <SelectTrigger className="bg-white border border-slate-300 h-9 text-xs text-slate-900 font-bold rounded-lg shadow-sm">
                                                                <SelectValue placeholder={getLabel('vehicle_type', 'Type')} />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="bg-white border-gray-200 text-gray-900 shadow-xl">
                                                            <SelectItem value="Pickup">Pickup</SelectItem>
                                                            <SelectItem value="Truck">Truck</SelectItem>
                                                            <SelectItem value="Tempo">Tempo</SelectItem>
                                                            <SelectItem value="Tractor">Tractor</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                    {isVisible('guarantor') && (
                                        <FormField
                                            control={form.control}
                                            name="guarantor"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-bold text-slate-700 uppercase tracking-wide ml-1">{getLabel('guarantor', 'Guarantor')}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Optional" {...field} required={isMandatory('guarantor')} className="bg-white border border-slate-300 h-9 text-xs text-slate-900 font-bold rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/10" />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>

                                {isVisible('driver_name') && (
                                    <FormField
                                        control={form.control}
                                        name="driver_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-bold text-slate-700 uppercase tracking-wide ml-1">{getLabel('driver_name', 'Driver Details')}</FormLabel>
                                                <div className="flex gap-2">
                                                    <FormControl>
                                                        <Input placeholder="Driver Name" {...field} required={isMandatory('driver_name')} className="bg-white border border-slate-300 h-9 text-xs flex-1 text-slate-900 font-bold rounded-lg shadow-sm" />
                                                    </FormControl>
                                                    {isVisible('driver_mobile') && (
                                                        <Input
                                                            placeholder={getLabel('driver_mobile', 'Mobile No')}
                                                            value={form.watch('driver_mobile')}
                                                            onChange={(e) => form.setValue('driver_mobile', e.target.value)}
                                                            required={isMandatory('driver_mobile')}
                                                            className="bg-white border-slate-300 h-9 text-xs flex-1 text-slate-900 font-bold rounded-lg text-center shadow-sm focus:ring-2 focus:ring-green-500/10"
                                                        />
                                                    )}
                                                </div>
                                            </FormItem>
                                        )}
                                    />
                                )}

                                <div className="p-4 bg-slate-50/50 rounded-xl space-y-3 border border-slate-100">
                                    <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wide mb-2">Trip Expenses</div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {isVisible('hamali_expenses') && (
                                            <FormField
                                                control={form.control}
                                                name="hamali_expenses"
                                                render={({ field }) => (
                                                    <FormItem className="space-y-0.5">
                                                        <FormLabel className="text-[8px] uppercase text-slate-700 truncate font-bold">{getLabel('hamali_expenses', 'Loading')}</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" {...field} required={isMandatory('hamali_expenses')} className="bg-white border border-slate-300 h-8 text-xs text-center text-slate-900 font-bold rounded-md focus:border-green-500/30 shadow-sm" />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                        {isVisible('hire_charges') && (
                                            <FormField
                                                control={form.control}
                                                name="hire_charges"
                                                render={({ field }) => (
                                                    <FormItem className="space-y-0.5">
                                                        <FormLabel className="text-[8px] uppercase text-slate-700 truncate font-bold">{getLabel('hire_charges', 'Advance')}</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" {...field} required={isMandatory('hire_charges')} className="bg-white border border-slate-300 h-8 text-xs text-center text-slate-900 font-bold rounded-md focus:border-green-500/30 shadow-sm" />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                        {isVisible('other_expenses') && (
                                            <FormField
                                                control={form.control}
                                                name="other_expenses"
                                                render={({ field }) => (
                                                    <FormItem className="space-y-0.5">
                                                        <FormLabel className="text-[8px] uppercase text-slate-700 truncate font-bold">{getLabel('other_expenses', 'Other')}</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" {...field} required={isMandatory('other_expenses')} className="bg-white border border-slate-300 h-8 text-xs text-center text-slate-900 font-bold rounded-md focus:border-green-500/30 shadow-sm" />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </div>

                                    {/* Contextual Note for Transport Expenses */}
                                    {(isVisible('hamali_expenses') || isVisible('hire_charges') || isVisible('other_expenses')) && totalTripDeductions > 0 && (
                                        <div className="mt-3 p-3 rounded-lg border border-blue-100 bg-blue-50">
                                            <div className="flex items-start gap-2">
                                                <Info className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                                                <p className="text-[9px] text-gray-600 leading-relaxed">
                                                    {arrivalType === 'direct' ? (
                                                        <span>
                                                            <strong className="text-gray-900">Direct Purchase:</strong> Transport expenses <strong className="text-orange-600">borne by Mandi</strong> (not deducted from supplier payment).
                                                        </span>
                                                    ) : (
                                                        <span>
                                                            <strong className="text-blue-700">Commission:</strong> Transport expenses will be <strong className="text-gray-900">proportionally deducted</strong> from {arrivalType === 'commission_supplier' ? 'supplier' : 'farmer'} payment based on item value.
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ITEMS LOADER SECTION */}
                        <div className="pt-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="h-5 w-1 bg-purple-600 rounded-full shadow-sm" />
                                    <h3 className="text-base font-bold text-slate-800 tracking-tight uppercase">Consignment <span className="text-purple-600">Details</span></h3>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => append({ 
                                        item_id: "", 
                                        qty: 1, 
                                        unit: "Box", 
                                        grade: "A", 
                                        variety: "", 
                                        unit_weight: 0, 
                                        supplier_rate: 0, 
                                        commission_percent: (currentArrivalType === 'commission' || currentArrivalType === 'commission_supplier') ? defaultCommissionRate : 0, 
                                        less_percent: 0, 
                                        less_units: 0, 
                                        packing_cost: 0, 
                                        loading_cost: 0, 
                                        farmer_charges: 0,
                                        sale_price: 0,
                                        barcode: ""
                                    })}
                                    className="bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 font-bold text-[10px] uppercase tracking-wide h-8 px-4 rounded-lg transition-all shadow-sm"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1" /> ADD LINE ITEM
                                </Button>
                            </div>

                            <div className="space-y-3">
                                {fields.map((field, index) => (
                                    <div key={field.id} className="relative bg-white border border-gray-200 p-4 rounded-xl hover:border-blue-300 transition-all group shadow-sm hover:shadow-md">
                                        {/* SERIAL NUMBER */}
                                        <div className="absolute -left-2.5 -top-2.5 w-6 h-6 bg-slate-900 border-2 border-white text-white rounded-full flex items-center justify-center text-[10px] font-black shadow-lg z-10 group-hover:bg-purple-600 transition-colors">
                                            {index + 1}
                                        </div>
                                        <div className="grid grid-cols-12 gap-4 items-start">

                                            {/* TOP ROW: Commodity Definition */}
                                            <div className="col-span-12 lg:col-span-12 grid grid-cols-12 gap-4">
                                                {isVisible('item_id') && (
                                                    <div className="col-span-12 md:col-span-5 lg:col-span-5">
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.item_id`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <FormLabel className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">{getLabel('item_id', 'Commodity')}</FormLabel>
                                                                        <ItemDialog onSuccess={refetchMaster}>
                                                                            <Button type="button" variant="link" className="h-auto p-0 text-blue-600 text-[9px] font-bold uppercase tracking-widest hover:text-blue-800 transition-colors">
                                                                                + ADD
                                                                            </Button>
                                                                        </ItemDialog>
                                                                    </div>
                                                                    <SearchableSelect
                                                                        options={availableItems.map(i => {
                                                                            const specs = i.custom_attributes ? 
                                                                                Object.entries(i.custom_attributes)
                                                                                    .map(([k, v]) => `${k}: ${v}`)
                                                                                    .join(", ") : "";
                                                                            const label = [
                                                                                i.name,
                                                                                i.local_name ? `(${i.local_name})` : "",
                                                                                i.sku_code ? `[${i.sku_code}]` : "",
                                                                                specs ? `- {${specs}}` : ""
                                                                            ].filter(Boolean).join(" ");
                                                                            return { value: i.id, label };
                                                                        })}
                                                                        value={field.value}
                                                                        onChange={(val) => {
                                                                            field.onChange(val);
                                                                            const selectedItem = availableItems.find(i => i.id === val);
                                                                            if (selectedItem?.default_unit) {
                                                                                form.setValue(`items.${index}.unit`, selectedItem.default_unit);
                                                                            }
                                                                        }}
                                                                        placeholder={getLabel('item_id', 'Select Item')}
                                                                        className="bg-white border border-slate-300 text-slate-900 font-bold h-9 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/10 shadow-sm"
                                                                    />
                                                                    <FormMessage className="text-[9px] mt-0.5" />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                )}

                                                {isVisible('qty') && (
                                                    <div className="col-span-12 md:col-span-3">
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.qty`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel className="text-[9px] font-bold text-slate-700 uppercase tracking-wide mb-0.5 block">{getLabel('qty', 'Quantity / Nugs')}</FormLabel>
                                                                    <FormControl>
                                                                        <Input type="number" {...field} required={isMandatory('qty')} className="bg-white border border-slate-300 h-9 text-xs text-slate-900 font-bold rounded-lg text-center focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 shadow-sm" />
                                                                    </FormControl>
                                                                    <FormMessage className="text-[9px] mt-0.5" />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                )}

                                                {isVisible('unit') && (
                                                    <div className="col-span-12 md:col-span-4">
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.unit`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel className="text-[9px] font-bold text-slate-700 uppercase tracking-wide mb-0.5 block">{getLabel('unit', 'Packaging Unit')}</FormLabel>
                                                                    <Select onValueChange={field.onChange} value={field.value} required={isMandatory('unit')}>
                                                                        <FormControl>
                                                                            <SelectTrigger className="bg-white border border-slate-300 h-9 text-xs text-slate-900 font-bold rounded-lg text-center focus:border-blue-500/50 shadow-sm">
                                                                                <SelectValue placeholder="Unit" />
                                                                            </SelectTrigger>
                                                                        </FormControl>
                                                                        <SelectContent className="bg-white border-slate-300 text-black font-black shadow-xl rounded-lg">
                                                                            <SelectItem value="Box" className="font-bold text-xs focus:bg-slate-50">Box</SelectItem>
                                                                            <SelectItem value="Crate" className="font-bold text-xs focus:bg-slate-50">Crate</SelectItem>
                                                                            <SelectItem value="Kgs" className="font-bold text-xs focus:bg-slate-50">Kgs</SelectItem>
                                                                            <SelectItem value="Tons" className="font-bold text-xs focus:bg-slate-50">Tons</SelectItem>
                                                                            <SelectItem value="Nug" className="font-bold text-xs focus:bg-slate-50">Nug</SelectItem>
                                                                            <SelectItem value="Pieces" className="font-bold text-xs focus:bg-slate-50">Pieces</SelectItem>
                                                                            <SelectItem value="Carton" className="font-bold text-xs focus:bg-slate-50">Carton</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <FormMessage className="text-[9px] mt-0.5" />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* SECOND ROW: Pricing & Weight */}
                                            <div className="col-span-12 lg:col-span-12 grid grid-cols-12 gap-3">
                                                {isVisible('supplier_rate') && (
                                                    <div className="col-span-12 md:col-span-4">
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.supplier_rate`}
                                                            render={({ field }) => (
                                                                <FormItem className="space-y-0.5">
                                                                    <FormLabel className="text-[9px] font-bold text-slate-700 uppercase tracking-wide mb-0.5 block">{getLabel('supplier_rate', 'Rate')}</FormLabel>
                                                                    <FormControl>
                                                                        <Input type="number" {...field} required={isMandatory('supplier_rate')} className="h-9 bg-white border border-slate-300 text-slate-900 font-bold text-center rounded-lg text-xs shadow-sm" />
                                                                    </FormControl>
                                                                    <FormMessage className="text-[9px] mt-0.5" />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                )}

                                                <div className="col-span-12 md:col-span-4">
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.sale_price`}
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-0.5">
                                                                <FormLabel className="text-[9px] font-bold text-blue-700 uppercase tracking-wide mb-0.5 block">
                                                                    Sale Price
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" {...field} className="h-9 bg-blue-50/50 border-blue-100 text-slate-900 font-bold text-center rounded-lg text-xs shadow-sm" />
                                                                </FormControl>
                                                                <FormMessage className="text-[9px] mt-0.5" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                <div className="col-span-12 md:col-span-4">
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.unit_weight`}
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-0.5">
                                                                <FormLabel className="text-[9px] font-bold text-slate-700 uppercase tracking-wide mb-0.5 block">Weight / Unit</FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" {...field} className="h-9 bg-white border border-slate-300 text-slate-900 font-bold text-center rounded-lg text-xs shadow-sm" />
                                                                </FormControl>
                                                                <FormMessage className="text-[9px] mt-0.5" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </div>

                                            {/* FINANCIALS PANEL */}
                                            <div className="col-span-12 bg-slate-50/80 rounded-lg p-3 border border-slate-100 mt-1">
                                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">

                                                     {/* Wholesale price field removed */}
                                                    {isVisible('commission_percent') && arrivalType !== 'direct' && (
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.commission_percent`}
                                                            render={({ field }) => (
                                                                <FormItem className="space-y-0.5">
                                                                    <FormLabel className="text-[8px] font-bold uppercase text-blue-600">{getLabel('commission_percent', 'Comm %')}</FormLabel>
                                                                    <FormControl>
                                                                        <Input type="number" {...field} required={isMandatory('commission_percent')} className="h-8 bg-blue-50 border border-blue-200 text-blue-700 font-bold text-center rounded-md text-xs shadow-sm" />
                                                                    </FormControl>
                                                                </FormItem>
                                                            )}
                                                        />
                                                    )}

                                                    {isVisible('less_percent') && (
                                                        <div className="col-span-12 lg:col-span-3 grid grid-cols-3 gap-2 bg-slate-100/50 p-2 rounded-lg border border-slate-200 relative group/discount">
                                                            <FormField
                                                                control={form.control}
                                                                name={`items.${index}.less_percent`}
                                                                render={({ field }) => (
                                                                    <FormItem className="space-y-0.5">
                                                                        <FormLabel className="text-[8px] font-bold uppercase text-slate-700">{getLabel('less_percent', 'Less %')}</FormLabel>
                                                                        <FormControl>
                                                                            <Input type="number" {...field}
                                                                                onChange={(e) => {
                                                                                    field.onChange(e);
                                                                                    const val = Number(e.target.value) || 0;
                                                                                    const iQty = Number(form.watch(`items.${index}.qty`)) || 0;
                                                                                    if (iQty > 0) {
                                                                                        const calcUnits = iQty * val / 100;
                                                                                        form.setValue(`items.${index}.less_units`, Number(calcUnits.toFixed(2)));
                                                                                    }
                                                                                }}
                                                                                required={isMandatory('less_percent')} className="h-8 bg-white border border-slate-300 text-slate-900 font-bold text-center rounded-md text-xs shadow-sm" />
                                                                        </FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <FormField
                                                                control={form.control}
                                                                name={`items.${index}.less_units`}
                                                                render={({ field }) => (
                                                                    <FormItem className="space-y-0.5">
                                                                        <FormLabel className="text-[8px] font-bold uppercase text-slate-700 text-center block">Less Units</FormLabel>
                                                                        <FormControl>
                                                                            <div className="relative">
                                                                                <Input type="number" {...field}
                                                                                    onChange={(e) => {
                                                                                        field.onChange(e);
                                                                                        const val = Number(e.target.value) || 0;
                                                                                        const iQty = Number(form.watch(`items.${index}.qty`)) || 0;
                                                                                        if (iQty > 0) {
                                                                                            const calcPercent = (val / iQty) * 100;
                                                                                            form.setValue(`items.${index}.less_percent`, Number(calcPercent.toFixed(2)));
                                                                                        } else {
                                                                                            form.setValue(`items.${index}.less_percent`, 0);
                                                                                        }
                                                                                    }}
                                                                                    className="h-8 bg-white border border-slate-300 text-red-600 font-bold text-center rounded-md text-xs shadow-sm pl-4 pr-1" />
                                                                                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-red-500 text-[10px] font-bold select-none pointer-events-none">-</span>
                                                                            </div>
                                                                        </FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            {isVisible('farmer_charges') && (
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`items.${index}.farmer_charges`}
                                                                    render={({ field }) => (
                                                                        <FormItem className="space-y-0.5">
                                                                            <FormLabel className="text-[8px] font-bold uppercase text-red-700">{getLabel('farmer_charges', 'Other Cut')}</FormLabel>
                                                                            <FormControl>
                                                                                <Input type="number" {...field} required={isMandatory('farmer_charges')} className="h-8 bg-red-50 border border-red-200 text-red-600 font-bold text-center rounded-md text-xs shadow-sm" />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            )}
                                                            <div className="col-span-3 text-[7px] font-bold text-slate-500 uppercase tracking-tighter mt-1 opacity-70 group-hover/discount:opacity-100 transition-opacity">
                                                                {arrivalType === 'commission'
                                                                    ? "Less% and Other Cut are discounts deducted from farmer payment."
                                                                    : "Less% and Other Cut are discounts deducted from supplier payment."}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="col-span-12 lg:col-span-2 grid grid-cols-2 gap-2 bg-blue-50/50 p-2 rounded-lg border border-blue-100 relative group/mandi">
                                                        {isVisible('packing_cost') && (
                                                            <FormField
                                                                control={form.control}
                                                                name={`items.${index}.packing_cost`}
                                                                render={({ field }) => (
                                                                    <FormItem className="space-y-0.5">
                                                                        <FormLabel className="text-[8px] font-bold uppercase text-slate-700">{getLabel('packing_cost', 'Packing')}</FormLabel>
                                                                        <FormControl>
                                                                            <Input type="number" {...field} required={isMandatory('packing_cost')} className="h-8 bg-white border border-slate-300 text-slate-900 font-bold text-center rounded-md text-xs shadow-sm" />
                                                                        </FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        )}
                                                        {isVisible('loading_cost') && (
                                                            <FormField
                                                                control={form.control}
                                                                name={`items.${index}.loading_cost`}
                                                                render={({ field }) => (
                                                                    <FormItem className="space-y-0.5">
                                                                        <FormLabel className="text-[8px] font-bold uppercase text-slate-700">{getLabel('loading_cost', 'Loading')}</FormLabel>
                                                                        <FormControl>
                                                                            <Input type="number" {...field} required={isMandatory('loading_cost')} className="h-8 bg-white border border-slate-300 text-slate-900 font-bold text-center rounded-md text-xs shadow-sm" />
                                                                        </FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        )}
                                                        <div className="col-span-2 text-[7px] font-bold text-blue-600 uppercase tracking-tighter mt-1 opacity-70 group-hover/mandi:opacity-100 transition-opacity">
                                                            {arrivalType === 'direct'
                                                                ? "Packing, Loading, and Transport are borne by Mandi."
                                                                : arrivalType === 'commission_supplier'
                                                                    ? "Packing, Loading, and Transport are borne by Supplier."
                                                                    : "Packing, Loading, and Transport are borne by Farmer."}
                                                        </div>
                                                    </div>


                                                </div>

                                            </div>

                                            {/* FINANCIAL BREAKDOWN DISPLAY */}
                                            {(() => {
                                                const financials = calculateItemFinancials(index);
                                                const arrivalType = form.watch('arrival_type');
                                                const itemUnit = form.watch(`items.${index}.unit`) || 'kg';

                                                if (financials.rate === 0 || financials.qty === 0) return null;

                                                return (
                                                    <div className="col-span-12 mt-2 p-3 bg-slate-50/50 rounded-lg border border-slate-300/60">
                                                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
                                                            <div>
                                                                <div className="text-[9px] font-bold text-slate-700 uppercase tracking-wide mb-1">Gross Value</div>
                                                                <div className="text-sm font-bold text-slate-900 tabular-nums">₹{financials.grossValue.toFixed(0)}</div>
                                                                <div className="text-[8px] text-slate-700 font-medium mt-0.5">{financials.qty} {itemUnit} × ₹{financials.rate}</div>
                                                            </div>

                                                            {(financials.lessPercent > 0 || financials.adjustedValue !== financials.grossValue) && (
                                                                <div>
                                                                    <div className="text-[9px] font-bold text-orange-600 uppercase tracking-widest mb-1">Adjusted Value</div>
                                                                    <div className="text-sm font-bold text-orange-600 tabular-nums">₹{financials.adjustedValue.toFixed(0)}</div>
                                                                    <div className="text-[8px] text-orange-400 mt-0.5 font-medium">After cuts/discounts</div>
                                                                </div>
                                                            )}

                                                            {arrivalType !== 'direct' && (
                                                                <div>
                                                                    <div className="text-[9px] font-bold text-purple-600 uppercase tracking-widest mb-1">Commission</div>
                                                                    <div className="text-sm font-bold text-purple-600 tabular-nums">₹{financials.commissionAmount.toFixed(0)}</div>
                                                                    <div className="text-[8px] text-purple-400 mt-0.5 font-medium">{financials.commissionPercent}% of adjusted</div>
                                                                </div>
                                                            )}

                                                            <div>
                                                                <div className="text-[9px] font-bold text-red-600 uppercase tracking-widest mb-1">Expenses & Cuts</div>
                                                                <div className="text-sm font-bold text-red-600 tabular-nums">₹{(financials.totalExpenses + (Number(form.watch(`items.${index}.farmer_charges`)) || 0)).toFixed(0)}</div>
                                                                <div className="text-[8px] text-red-400 mt-0.5 font-medium">Incl. Other Cut</div>
                                                            </div>

                                                            <div className="md:col-span-1 border-r border-slate-300/50">
                                                                <div className="text-[9px] font-bold text-green-600 uppercase tracking-widest mb-1">
                                                                    {arrivalType === 'direct' ? 'Net Cost' : (arrivalType === 'commission_supplier' ? 'Supplier Gets' : 'Farmer Gets')}
                                                                </div>
                                                                <div className="text-lg font-bold text-green-600 tabular-nums">
                                                                    ₹{arrivalType === 'direct' ? financials.netCost.toFixed(0) : financials.farmerPayment.toFixed(0)}
                                                                </div>
                                                                <div className="text-[8px] text-green-600/60 mt-0.5 font-medium">
                                                                    {arrivalType === 'direct' ? 'Stock Value' : 'Net payable'}
                                                                </div>
                                                            </div>

                                                            <div className="md:col-span-1">
                                                                <div className="text-[9px] font-bold text-slate-700 uppercase tracking-wide mb-1">Unit Cost</div>
                                                                <div className="text-lg font-bold text-slate-700 tabular-nums">
                                                                    ₹{(financials.netCost / financials.qty).toFixed(2)}
                                                                </div>
                                                                <div className="text-[8px] text-slate-700 mt-0.5 font-medium underline decoration-slate-200">Per {itemUnit}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* DELETE BUTTON */}
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => remove(index)}
                                                className="text-red-500 hover:text-white hover:bg-red-500 rounded-lg h-8 w-8 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Consolidated Advance / Amount Paid Section */}
                            {isVisible('advance') && (
                                <div className="mt-6 border-t pt-6">
                                    <div className="max-w-md bg-emerald-50/40 border border-emerald-100 rounded-3xl p-6 space-y-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                                                <Wallet className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest leading-none">Advance / Amount Paid</h3>
                                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter mt-1">Settled at the trip level</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormField
                                                control={form.control}
                                                name="advance"
                                                render={({ field }) => (
                                                    <FormItem className="space-y-1">
                                                        <FormLabel className="text-[9px] font-black uppercase text-slate-600 tracking-widest ml-1">Paid Amount</FormLabel>
                                                        <FormControl>
                                                            <div className="relative group">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 font-black text-sm group-focus-within:scale-110 transition-transform">₹</span>
                                                                <Input 
                                                                    type="number" 
                                                                    {...field} 
                                                                    disabled={form.watch('advance_payment_mode') === 'credit'}
                                                                    className={cn(
                                                                        "h-12 bg-white border border-emerald-100 pl-8 text-lg font-black text-slate-900 rounded-2xl shadow-sm focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/5 transition-all",
                                                                        form.watch('advance_payment_mode') === 'credit' && "opacity-50 cursor-not-allowed bg-slate-50"
                                                                    )}
                                                                    placeholder="0"
                                                                />
                                                            </div>
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="advance_payment_mode"
                                                render={({ field }) => (
                                                    <FormItem className="space-y-1">
                                                        <FormLabel className="text-[9px] font-black uppercase text-slate-600 tracking-widest ml-1">Payment Mode</FormLabel>
                                                        <div className="flex bg-white/50 backdrop-blur-sm border border-emerald-100 rounded-2xl p-1 gap-1 h-12">
                                                            {[
                                                                { value: 'credit', label: 'Udhaar' },
                                                                { value: 'cash', label: 'Cash' },
                                                                { value: 'upi_bank', label: 'UPI / BANK' },
                                                                { value: 'cheque', label: 'Cheque' },
                                                            ].map(mode => (
                                                                <button
                                                                    key={mode.value}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        field.onChange(mode.value);
                                                                        
                                                                        // Auto-populate logic
                                                                        if (mode.value === 'credit') {
                                                                            form.setValue('advance', 0, { shouldValidate: true });
                                                                        } else {
                                                                            // Only populate if it's currently 0 or we want a fresh total
                                                                            const total = calculateTotalPayable();
                                                                            form.setValue('advance', total, { shouldValidate: true });
                                                                        }

                                                                        if ((mode.value === 'upi_bank' || mode.value === 'cheque') && bankAccounts.length > 0) {
                                                                            const current = form.getValues('advance_bank_account_id');
                                                                            if (!current) {
                                                                                const def = bankAccounts.find(b => b.is_default) || bankAccounts[0];
                                                                                if (def) form.setValue('advance_bank_account_id', def.id, { shouldValidate: true });
                                                                            }
                                                                        }
                                                                    }}
                                                                    className={cn(
                                                                        "flex-1 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all duration-200",
                                                                        field.value === mode.value
                                                                            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                                                                            : "text-slate-400 hover:text-slate-600 hover:bg-white"
                                                                    )}
                                                                >
                                                                    {mode.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>

                                        {form.watch('advance_payment_mode') === 'upi_bank' && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300 mt-4">
                                                <FormField
                                                    control={form.control}
                                                    name="advance_bank_account_id"
                                                    render={({ field }) => (
                                                        <FormItem className="space-y-1">
                                                            <FormLabel className="text-[9px] font-black uppercase text-blue-600 tracking-widest ml-1">Settle To</FormLabel>
                                                            <Select value={field.value || ''} onValueChange={field.onChange}>
                                                                <FormControl>
                                                                    <SelectTrigger className="h-10 bg-white border-blue-100 rounded-xl text-xs font-bold shadow-sm">
                                                                        <SelectValue placeholder="Select bank..." />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent className="bg-white z-[200]">
                                                                    {bankAccounts.map(b => (
                                                                        <SelectItem key={b.id} value={b.id} className="text-xs font-medium">
                                                                            {b.name}{b.is_default ? ' ⭐' : ''}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        )}

                                        {form.watch('advance_payment_mode') === 'cheque' && (
                                            <div className="w-full p-5 bg-slate-50/80 border border-slate-200/80 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2 shadow-sm mt-4">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
                                                    <div className="flex items-center gap-2 text-slate-800">
                                                        <Landmark className="w-4 h-4 text-indigo-600" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Cheque Settlement</span>
                                                    </div>
                                                    
                                                    <label className={`flex items-center gap-2 cursor-pointer shadow-sm select-none px-3 py-1.5 rounded-full border transition-all duration-200 w-fit ${
                                                        form.watch("advance_cheque_status")
                                                        ? 'bg-emerald-100 border-emerald-500 shadow-sm shadow-emerald-200'
                                                        : 'bg-white border-slate-200 hover:bg-slate-50'
                                                    }`}>
                                                        <span className={cn("text-[10px] font-black uppercase tracking-wider", form.watch("advance_cheque_status") ? 'text-emerald-800' : 'text-slate-600')}>
                                                            {form.watch("advance_cheque_status") ? '⚡ Cleared Instantly' : '📅 Clear Later'}
                                                        </span>
                                                        <Switch
                                                            checked={form.watch("advance_cheque_status")}
                                                            onCheckedChange={(checked) => form.setValue("advance_cheque_status", checked)}
                                                            className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-200 border border-slate-300 scale-90"
                                                        />
                                                    </label>
                                                </div>

                                                {form.watch("advance_cheque_status") && (
                                                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-emerald-800">
                                                        <Zap className="w-4 h-4 shrink-0 text-emerald-600" />
                                                        <span className="text-[11px] font-bold leading-tight">Payment marked as fully paid. A payment voucher will clear accounts payable instantly.</span>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <FormField
                                                        control={form.control}
                                                        name="advance_bank_account_id"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-1">
                                                                <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-600">📥 Settle From (Bank Account)</FormLabel>
                                                                <Select value={field.value || ''} onValueChange={field.onChange}>
                                                                    <FormControl>
                                                                        <SelectTrigger className="bg-white border-slate-200 h-10 text-xs font-bold text-slate-800 shadow-sm">
                                                                            <SelectValue placeholder="Select bank..." />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent className="bg-white z-[200]">
                                                                        {bankAccounts.map(b => (
                                                                            <SelectItem key={b.id} value={b.id} className="text-xs font-bold py-2">
                                                                                {b.name}{b.is_default ? ' ⭐' : ''}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name="advance_cheque_no"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-1">
                                                                <FormLabel className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Cheque No</FormLabel>
                                                                <FormControl>
                                                                    <Input {...field} placeholder="000123" className="h-10 text-xs font-bold border-slate-200 bg-white placeholder:text-slate-400" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name="advance_bank_name"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-1">
                                                                <FormLabel className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Party's Bank Name</FormLabel>
                                                                <FormControl>
                                                                    <Input {...field} placeholder="e.g. SBI, HDFC" className="h-10 text-xs font-bold border-slate-200 bg-white placeholder:text-slate-400" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                {!form.watch("advance_cheque_status") && (
                                                    <FormField
                                                        control={form.control}
                                                        name="advance_cheque_date"
                                                        render={({ field }) => (
                                                            <FormItem className="flex flex-col space-y-1">
                                                                <FormLabel className="text-[10px] font-black uppercase tracking-wider text-slate-600">Expected Clearing Date</FormLabel>
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <FormControl>
                                                                            <Button variant={"outline"} className={cn("h-10 text-left font-bold text-xs border-slate-200 bg-white", !field.value && "text-muted-foreground w-1/2")}>
                                                                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                                            </Button>
                                                                        </FormControl>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="w-auto p-0" align="start">
                                                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus required />
                                                                    </PopoverContent>
                                                                </Popover>
                                                            </FormItem>
                                                        )}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* FOOTER ACTIONS */}
                        <div className="pt-6 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-gray-100 mt-4">
                            <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-slate-50/50 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex flex-col">
                                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Total Quantity</div>
                                    <div className="text-lg font-black text-slate-900 tracking-tighter tabular-nums leading-none">
                                        {fields.reduce((sum, f, i) => sum + (Number(form.watch(`items.${i}.qty`)) || 0), 0)}
                                    </div>
                                </div>
                                
                                <div className="w-px h-8 bg-slate-200 hidden md:block" />
                                
                                <div className="flex flex-col">
                                    <div className="text-[8px] font-black text-blue-600 uppercase tracking-widest mb-0.5">Total Net Value</div>
                                    <div className="text-lg font-black text-blue-700 tracking-tighter tabular-nums leading-none">
                                        ₹{fields.reduce((sum, f, i) => {
                                            const financials = calculateItemFinancials(i);
                                            return sum + (form.watch('arrival_type') === 'direct' ? financials.netCost : financials.adjustedValue);
                                        }, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </div>
                                </div>

                                <div className="w-px h-8 bg-slate-200 hidden md:block" />

                                <div className="flex flex-col">
                                    <div className="text-[8px] font-black text-rose-600 uppercase tracking-widest mb-0.5">Advance Paid</div>
                                    <div className="text-lg font-black text-rose-700 tracking-tighter tabular-nums leading-none">
                                        ₹{Number(form.watch('advance') || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </div>
                                </div>

                                <div className="w-px h-10 bg-slate-300 hidden md:block mx-1" />

                                <div className="flex flex-col">
                                    <div className={cn(
                                        "text-[8px] font-black uppercase tracking-widest mb-0.5",
                                        isOverpaid ? "text-red-500 animate-pulse" : "text-emerald-600"
                                    )}>
                                        {isOverpaid ? 'Overpaid Amount' : 'Final Payable Balance'}
                                    </div>
                                    <div className={cn(
                                        "text-2xl font-black tracking-tighter tabular-nums leading-none",
                                        isOverpaid ? "text-red-700" : "text-emerald-700"
                                    )}>
                                        ₹{(totalNetBill - advanceAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </div>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={isSubmitting || isOverpaid}
                                className={cn(
                                    "font-bold text-xs h-10 px-6 rounded-lg shadow-md transition-all tracking-widest uppercase hover:scale-[1.02]",
                                    isOverpaid ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none hover:scale-100" : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg"
                                )}
                            >
                                {isSubmitting ? (
                                    <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> SAVING...</>
                                ) : (
                                    "LOG ARRIVAL"
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </form>

            {/* Confirmation Dialog */}
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogContent className="max-w-2xl bg-white border-slate-300 shadow-2xl rounded-3xl p-0 overflow-hidden">
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                            <div className="flex justify-between items-start">
                                <DialogTitle className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
                                        <Check className="w-6 h-6" />
                                    </div>
                                    Confirm Consignment
                                </DialogTitle>
                                {pendingValues && (
                                    <div className="px-3 py-1 bg-red-50 border border-red-200 rounded-lg text-red-600 font-black uppercase text-xs tracking-widest animate-pulse">
                                        {pendingValues.arrival_type === 'direct' ? 'Direct Purchase' :
                                            pendingValues.arrival_type === 'commission_supplier' ? 'Supplier Commission' :
                                                'Farmer Commission'}
                                    </div>
                                )}
                            </div>
                            <DialogDescription className="text-slate-600 font-medium mt-1">
                                Please review the details before logging this arrival.
                            </DialogDescription>
                        </DialogHeader>

                        {pendingValues && (
                            <div className="space-y-6">
                                {/* Party & Vehicle Summary */}
                                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                    <div>
                                        <div className="text-[9px] font-black text-slate-700 uppercase tracking-widest mb-1">Supplier / Party</div>
                                        <div className="text-sm font-black text-slate-900">
                                            {contacts.find(c => c.id === pendingValues.contact_id)?.name || "Unknown Party"}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-black text-slate-700 uppercase tracking-widest mb-1">Vehicle No.</div>
                                        <div className="text-sm font-black text-slate-900 uppercase tracking-wider">
                                            {pendingValues.vehicle_number || "N/A"}
                                        </div>
                                    </div>
                                </div>

                                {/* Items Summary */}
                                <div className="space-y-3">
                                    <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <Package className="w-3 h-3 text-blue-600" />
                                        COMMODITY DETAILS
                                    </div>
                                    <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                                        {pendingValues.items.map((item: any, idx: number) => {
                                            const itemName = availableItems.find(i => i.id === item.item_id)?.name || "Unknown Item";
                                            return (
                                                <div key={idx} className="p-4 flex items-center justify-between bg-white text-sm">
                                                    <div className="space-y-0.5">
                                                        <div className="font-black text-slate-900">{itemName}</div>
                                                        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                                                            {item.variety || 'Standard'} • {item.grade || 'A'} Grade
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-black text-slate-900 text-base">{item.qty} {item.unit}</div>
                                                        <div className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                                                            Total Weight: {(Number(item.qty) * Number(item.unit_weight || 0)).toFixed(2)} KG
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Financial Summary */}
                                <div className="bg-slate-900 p-6 rounded-2xl shadow-xl flex justify-between items-center text-white">
                                    <div>
                                        <div className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Total Consignment Value</div>
                                        <div className="text-3xl font-black tracking-tight">
                                            ₹{(() => {
                                                const total = pendingValues.items.reduce((sum: number, item: any) => {
                                                    const iQty = Number(item.qty) || 0;
                                                    const iRate = Number(item.supplier_rate) || 0;
                                                    const iLess = Number(item.less_percent) || 0;
                                                    const iAdjustedQty = iQty - (iQty * iLess / 100);
                                                    return sum + (iAdjustedQty * iRate);
                                                }, 0);
                                                return isNaN(total) ? "0" : total.toLocaleString('en-IN', { maximumFractionDigits: 0 });
                                            })()}
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                        <div className="text-[9px] font-black text-green-400 uppercase tracking-widest mb-1">Status</div>
                                        <div className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black tracking-widest uppercase">Ready to Log</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <DialogFooter className="mt-8 flex gap-3">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setShowPreview(false)}
                                className="flex-1 h-12 rounded-xl font-black text-slate-700 uppercase tracking-widest hover:text-slate-900 hover:bg-slate-100"
                            >
                                Back to Edit
                            </Button>
                            
                            {/* Auto-Trigger Checkbox Component */}
                            <FormField
                                control={form.control}
                                name="auto_print_qr"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center gap-2 space-y-0 px-3 py-2 bg-slate-100 rounded-xl justify-center">
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                                className="data-[state=checked]:bg-indigo-600"
                                            />
                                        </FormControl>
                                        <FormLabel className="text-[10px] font-black uppercase text-slate-500 tracking-widest cursor-pointer mt-0">
                                            Auto-Popup QR Slips
                                        </FormLabel>
                                    </FormItem>
                                )}
                            />

                            <Button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => onSubmit(pendingValues)}
                                className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" /> : "Confirm & Save Entry"}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
            <LotQRSlip 
                lots={qrLots} 
                open={qrSlipsOpen} 
                onClose={() => setQrSlipsOpen(false)} 
            />
            <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
                <DialogContent className="max-w-md p-0 overflow-hidden border-none rounded-[32px] shadow-2xl bg-white">
                    <div className={cn(
                        "p-12 text-white flex flex-col items-center text-center relative overflow-hidden",
                        dialogConfig.type === 'success' ? "bg-emerald-500" : "bg-red-500"
                    )}>
                        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent opacity-50" />
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl relative z-10 mb-6">
                            {dialogConfig.type === 'success' ? (
                                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                            ) : (
                                <AlertTriangle className="w-12 h-12 text-red-500" />
                            )}
                        </div>
                        <h2 className="text-3xl font-black tracking-tight uppercase relative z-10">{dialogConfig.title}</h2>
                    </div>

                    <div className="p-10 space-y-8 text-center bg-white">
                        <p className="text-slate-600 font-bold leading-relaxed">{dialogConfig.message}</p>
                        <div className="flex gap-4">
                            {currentArrivalType === 'direct' && dialogConfig.type === 'success' && (
                                <Button 
                                    variant="outline"
                                    className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] border-slate-200 hover:bg-white transition-all shadow-sm active:scale-95"
                                    onClick={() => router.push('/purchase/bills')}
                                >
                                    View Bills
                                </Button>
                            )}
                            <Button 
                                className={cn(
                                    "flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl active:scale-95",
                                    dialogConfig.type === 'success' ? "bg-slate-900 hover:bg-black text-white" : "bg-red-500 hover:bg-red-600 text-white"
                                )}
                                onClick={() => setShowSuccessDialog(false)}
                            >
                                {dialogConfig.type === 'success' ? 'Continue Entry' : 'Dismiss'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </Form>
    );
}
