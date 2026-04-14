"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Loader2, ArrowLeft, Plus, CheckCircle2, AlertTriangle, Truck, CalendarIcon, Landmark, Zap, ChevronDown, ChevronUp, Users, PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { LotSelector } from "@/components/sales/lot-selector";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { QRCodeSVG } from 'qrcode.react';
import { confirmSaleTransactionWithFallback } from '@/lib/mandi/confirm-sale-transaction';
import { calculateSaleTotals } from '@/lib/sales-tax';

/* -------------------------------------------------------------------------- */
/*                               ZOD SCHEMA                                   */
/* -------------------------------------------------------------------------- */

const distributionSchema = z.object({
    buyer_id: z.string().min(1, "Buyer is required"),
    qty: z.coerce.number({ message: "Must be a number" }).min(0.01, "Quantity required"),
    rate: z.coerce.number({ message: "Must be a number" }).min(0, "Invalid rate"),
    payment_mode: z.enum(['credit', 'cash', 'UPI/BANK', 'cheque', 'upi']).default('credit'),
    amount_received: z.coerce.number().default(0),
    due_date: z.date().optional().nullable(),
    bank_account_id: z.string().optional().nullable(),
    cheque_no: z.string().optional().nullable(),
    cheque_date: z.date().optional().nullable(),
    cheque_status: z.boolean().default(false),
    bank_name: z.string().optional().nullable(),
    loading_charges: z.coerce.number({ message: "Invalid number" }).min(0).default(0),
    unloading_charges: z.coerce.number({ message: "Invalid number" }).min(0).default(0),
    other_expenses: z.coerce.number({ message: "Invalid number" }).min(0).default(0),
    discount_percent: z.coerce.number().min(0).max(100).optional(),
    discount_amount: z.coerce.number().min(0).optional(),
});

const formSchema = z.object({
    sale_date: z.date({ message: "Date required" }),
    lot_id: z.string().min(1, "Please select a stock lot"),
    distributions: z.array(distributionSchema).min(1, "Add at least one buyer")
});

type FormValues = z.infer<typeof formSchema>;

/* -------------------------------------------------------------------------- */
/*                               COMPONENT                                    */
/* -------------------------------------------------------------------------- */

const NewInvoiceForm = () => {
    const { profile } = useAuth();
    const { language } = useLanguage();
    const { toast } = useToast();
    const router = useRouter();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingValues, setPendingValues] = useState<FormValues | null>(null);

    // Masters
    const [buyers, setBuyers] = useState<any[]>([]);
    const [lots, setLots] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [orgSettings, setOrgSettings] = useState<any>(null);
    const [taxSettings, setTaxSettings] = useState({ market_fee_percent: 0.0, nirashrit_percent: 0.0, misc_fee_percent: 0.0, gst_enabled: false, gst_type: 'intra', cgst_percent: 0, sgst_percent: 0, igst_percent: 0 });
    const [defaultCreditDays, setDefaultCreditDays] = useState<number>(15);
    const [orgStateCode, setOrgStateCode] = useState<string | null>(null);
    const [maxInvoiceAmount, setMaxInvoiceAmount] = useState<number>(0);

    // Selected Lot Context
    const [selectedCommodityId, setSelectedCommodityId] = useState<string | null>(null);
    const [selectedLot, setSelectedLot] = useState<any>(null);

    // UI State for Expandable Rows
    const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({ 0: true });

    const lastCalculatedTotals = useRef<Record<number, number>>({});
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        mode: "onChange",
        defaultValues: {
            sale_date: new Date(),
            lot_id: "",
            distributions: [{
                buyer_id: "",
                qty: 0,
                rate: 0,
                payment_mode: "credit",
                amount_received: 0,
                due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
                bank_account_id: "",
                cheque_no: "",
                cheque_date: new Date(),
                cheque_status: false,
                bank_name: "",
                loading_charges: 0,
                unloading_charges: 0,
                other_expenses: 0
            }]
        } as any
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "distributions"
    });

    const watchedDistributions = form.watch('distributions');
    const totalDistributedQty = watchedDistributions?.reduce((sum, d) => sum + (Number(d.qty) || 0), 0) || 0;
    const remainingInLot = selectedLot ? selectedLot.current_qty - totalDistributedQty : 0;

    // Load Data
    const fetchMasters = async () => {
        if (!profile?.organization_id) return;
        const orgId = profile.organization_id;
        try {
            const [
                { data: buyerData },
                { data: bankData },
                { data: orgData },
                { data: itemData },
                { data: lotData },
                { data: settingsData }
            ] = await Promise.all([
                supabase.schema('mandi').from('contacts').select('id, name, type, city, status')
                    .eq('organization_id', orgId)
                    .eq('type', 'buyer')
                    .or('status.is.null,status.eq.active')
                    .order('name'),
                supabase.schema('mandi').from('accounts').select('id, name, is_default, description')
                    .eq('organization_id', orgId)
                    .eq('account_sub_type', 'bank')
                    .not('name', 'ilike', '%transit%')
                    .not('name', 'ilike', '%charge%'),
                supabase.schema('core').from('organizations').select('name, settings').eq('id', orgId).single(),
                supabase.schema('mandi').from('commodities').select('id, name, local_name, sku_code, gst_rate')
                    .eq('organization_id', orgId)
                    .order('name'),
                supabase.schema('mandi').from('lots').select('id, lot_code, arrival_id, current_qty, unit, sale_price, item_id, supplier_rate, arrival_type, contact_id, contacts(name)').eq('organization_id', orgId).gt('current_qty', 0).eq('status', 'active'),
                supabase.schema('mandi').from('mandi_settings' as any).select('*').eq('organization_id', orgId).maybeSingle()
            ]);

            if (buyerData) setBuyers(buyerData);
            if (bankData) setBankAccounts(bankData);
            if (orgData) setOrgSettings({ name: orgData.name, ...orgData.settings });
            if (itemData) setItems(itemData);
            if (lotData) setLots(lotData);
            if (settingsData) {
                setOrgStateCode(settingsData.state_code);
                setTaxSettings({
                    market_fee_percent: Number(settingsData.market_fee_percent) || 0,
                    nirashrit_percent: Number(settingsData.nirashrit_percent) || 0,
                    misc_fee_percent: Number(settingsData.misc_fee_percent) || 0,
                    gst_enabled: settingsData.gst_enabled || false,
                    gst_type: settingsData.gst_type || 'intra',
                    cgst_percent: Number(settingsData.cgst_percent) || 0,
                    sgst_percent: Number(settingsData.sgst_percent) || 0,
                    igst_percent: Number(settingsData.igst_percent) || 0,
                });
                if (settingsData.default_credit_days != null) setDefaultCreditDays(Number(settingsData.default_credit_days));
                if (settingsData.max_invoice_amount != null) setMaxInvoiceAmount(Number(settingsData.max_invoice_amount));
            }
        } catch (e) {
            console.error("Masters error:", e);
        }
    };

    useEffect(() => { fetchMasters(); }, [profile?.organization_id]);

    // Sync amount_received with total whenever charges or basis change

    // We only want to auto-sync if the basis (qty, rate, charges) changes.
    // If the user manually edits amount_received, this useEffect should NOT trigger.
const syncBasis = watchedDistributions?.map(d => ({
    qty: d.qty,
    rate: d.rate,
    payment_mode: d.payment_mode,
    l: d.loading_charges,
    u: d.unloading_charges,
    o: d.other_expenses,
    da: d.discount_amount,
    dp: d.discount_percent
}));

    useEffect(() => {
        watchedDistributions?.forEach((d, index) => {
            const buyerInfo = buyers.find(b => b.id === d.buyer_id);
            const itemInfo = items.find(i => i.id === selectedLot?.item_id);
            const rowTotals = calculateSaleTotals({
                items: [{
                    amount: (Number(d.qty) || 0) * (Number(d.rate) || 0),
                    gst_rate: itemInfo?.gst_rate,
                    is_gst_exempt: itemInfo?.is_gst_exempt,
                }],
                taxSettings,
                orgStateCode,
                buyerStateCode: buyerInfo?.state_code,
                loadingCharges: d.loading_charges,
                unloadingCharges: d.unloading_charges,
                otherExpenses: d.other_expenses,
                discountAmount: Number(d.discount_amount) || 0,
            });
            const newRowTotal = rowTotals.grandTotal;

            const lastRowTotal = lastCalculatedTotals.current[index];

            if (d.payment_mode !== 'credit') {
                // Only auto-sync if the calculated row total basis has actually changed.
                // This prevents adding another buyer from resetting existing manual overrides.
                if (newRowTotal !== lastRowTotal) {
                    form.setValue(`distributions.${index}.amount_received`, newRowTotal, { shouldDirty: true });
                    lastCalculatedTotals.current[index] = newRowTotal;
                }
            } else {
                // Force 0 for credit
                if (Number(d.amount_received) !== 0) {
                    form.setValue(`distributions.${index}.amount_received`, 0, { shouldDirty: true });
                }
                lastCalculatedTotals.current[index] = 0;
            }
        });
    }, [JSON.stringify(syncBasis), JSON.stringify(taxSettings), items, selectedLot]);

    const handleLotSelect = (lot: any | null) => {
        form.setValue('lot_id', lot?.id || "");
        if (!lot) {
            setSelectedLot(null);
            return;
        }
        setSelectedLot(lot);
        // Pre-fill rate for distributions if available
        if (lot.sale_price) {
            const currentDist = form.getValues('distributions');
            currentDist.forEach((_, idx) => {
                form.setValue(`distributions.${idx}.rate`, Number(lot.sale_price));
            });
        }
    };

    const toggleRow = (index: number) => {
        setExpandedRows(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const handleConfirmPost = async () => {
        if (!pendingValues || !selectedLot) return;
        setIsSubmitting(true);
        setShowConfirm(false);

        try {
            for (const dist of pendingValues.distributions) {
                const buyerInfo = buyers.find(b => b.id === dist.buyer_id);
                const itemInfo = items.find(i => i.id === selectedLot.item_id);
                const totals = calculateSaleTotals({
                    items: [{
                        amount: dist.qty * dist.rate,
                        gst_rate: itemInfo?.gst_rate,
                        is_gst_exempt: itemInfo?.is_gst_exempt,
                    }],
                    taxSettings,
                    orgStateCode,
                    buyerStateCode: buyerInfo?.state_code,
                    loadingCharges: dist.loading_charges,
                    unloadingCharges: dist.unloading_charges,
                    otherExpenses: dist.other_expenses,
                    discountAmount: Number(dist.discount_amount) || 0,
                });
                const totalItemsRaw = totals.subTotal;
                
                const idempotencyKey = crypto.randomUUID();

                const { error, data: rpcResponse, warning } = await confirmSaleTransactionWithFallback({
                    organizationId: profile!.organization_id,
                    buyerId: dist.buyer_id,
                    saleDate: pendingValues.sale_date.toISOString().split('T')[0],
                    paymentMode: dist.payment_mode,
                    totalAmount: totalItemsRaw,
                    items: [{
                        item_id: selectedLot.item_id,
                        lot_id: selectedLot.id,
                        qty: dist.qty,
                        rate: dist.rate,
                        amount: totalItemsRaw,
                        unit: selectedLot.unit
                    }],
                    marketFee: totals.marketFee,
                    nirashrit: totals.nirashrit,
                    miscFee: totals.miscFee,
                    loadingCharges: dist.loading_charges,
                    unloadingCharges: dist.unloading_charges,
                    otherExpenses: dist.other_expenses,
                    idempotencyKey,
                    dueDate: dist.due_date ? dist.due_date.toISOString().split('T')[0] : null,
                    bankAccountId: dist.bank_account_id || null,
                    chequeNo: dist.cheque_no || null,
                    chequeDate: dist.cheque_date ? dist.cheque_date.toISOString().split('T')[0] : null,
                    chequeStatus: dist.cheque_status,
                    bankName: dist.bank_name || null,
                    amountReceived: dist.amount_received,
                    cgstAmount: totals.cgstAmount,
                    sgstAmount: totals.sgstAmount,
                    igstAmount: totals.igstAmount,
                    gstTotal: totals.gstTotal,
                    discountAmount: Number(dist.discount_amount) || 0,
                    discountPercent: Number(dist.discount_percent) || 0,
                    placeOfSupply: totals.isIgst ? (buyerInfo?.state_code || null) : (orgStateCode || null),
                    buyerGstin: buyerInfo?.gstin || null,
                    isIgst: totals.isIgst,
                });

                if (error) throw error;
            }

            // Purchase ledger is handled at arrival time by post_arrival_ledger.
            // No need to re-post purchase cost on sale.

            toast({ title: "Invoices Posted", description: `Successfully billed ${pendingValues.distributions.length} buyers.` });
            router.push('/sales');
        } catch (e: any) {
            console.error(e);
            toast({ title: "Error Saving", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(val => { 
                if (remainingInLot < 0) {
                    toast({ 
                        title: "Quantity Exceeded", 
                        description: `You are trying to sell ${Math.abs(remainingInLot).toFixed(2)} ${selectedLot?.unit || 'units'} more than available stock.`, 
                        variant: "destructive" 
                    });
                    return;
                }

                // Check for Max Invoice Limit per buyer
                if (maxInvoiceAmount > 0) {
                    const exceededDist = val.distributions.find((d: any) => {
                        const buyerInfo = buyers.find(b => b.id === d.buyer_id);
                        const itemInfo = items.find(i => i.id === selectedLot?.item_id);
                        const rowTotals = calculateSaleTotals({
                            items: [{
                                amount: (Number(d.qty) || 0) * (Number(d.rate) || 0),
                                gst_rate: itemInfo?.gst_rate,
                                is_gst_exempt: itemInfo?.is_gst_exempt,
                            }],
                            taxSettings,
                            orgStateCode,
                            buyerStateCode: buyerInfo?.state_code,
                            loadingCharges: d.loading_charges,
                            unloadingCharges: d.unloading_charges,
                            otherExpenses: d.other_expenses,
                            discountAmount: Number(d.discount_amount) || 0,
                        });
                        return rowTotals.grandTotal > maxInvoiceAmount;
                    });

                    if (exceededDist) {
                        const buyerName = buyers.find(b => b.id === exceededDist.buyer_id)?.name || "a buyer";
                        toast({
                            title: "Invoice Limit Exceeded",
                            description: `Invoice for ${buyerName} exceeds the maximum limit of ₹${maxInvoiceAmount.toLocaleString()}.`,
                            variant: "destructive"
                        });
                        return;
                    }
                }

                setPendingValues(val); 
                setShowConfirm(true); 
            }, (errors) => {
                console.error("Validation Errors:", errors);
                toast({ 
                    title: "Ready to Review?", 
                    description: "Please check all buyer fields. Some information is missing or incorrect.", 
                    variant: "destructive" 
                });
            })} className="space-y-4">
                <div className="bg-[#FCFCFC] border-2 border-slate-300 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.05)] relative overflow-hidden w-full max-w-5xl mx-auto">
                    {/* Invoice Top Bar - Decorative */}
                    <div className="h-1 bg-indigo-600 w-full" />

                    <div className="p-4 md:p-6">
                        {/* Header Area */}
                        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8 border-b border-slate-100 pb-6">
                            <div className="space-y-0.5">
                                <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-2">
                                    <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center text-white">
                                        <Users className="w-4 h-4" />
                                    </div>
                                    MULTI-BUYER INVOICE
                                </h2>
                                <p className="text-slate-700 font-bold tracking-[0.2em] uppercase text-[8px] ml-1">
                                    Sell One Lot to Multiple Customers
                                </p>
                            </div>

                            <div className="text-right flex items-center justify-end gap-3 w-full md:w-auto mt-4 md:mt-0">
                                <div className="bg-slate-50 border border-slate-100 p-2 px-3 rounded-lg flex flex-col items-start min-w-[140px]">
                                    <div className="text-[8px] font-black uppercase text-slate-700 tracking-widest mb-0.5">Date of Issue</div>
                                    <FormField
                                        control={form.control}
                                        name="sale_date"
                                        render={({ field }) => (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" className="p-0 h-auto font-black text-slate-900 hover:bg-transparent text-sm border-b-2 border-transparent">
                                                        {field.value ? format(field.value, "PP") : "Select Date"}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0 bg-white" align="end">
                                                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                                </PopoverContent>
                                            </Popover>
                                        )}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Top Context: Stock Selection */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-[0.2em] mb-2">
                                    <div className="w-4 h-[1.5px] bg-indigo-600" /> SOURCE STOCK
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Select Item (Optional)</Label>
                                        <SearchableSelect 
                                            options={items.map(i => ({ label: i.name, value: i.id }))} 
                                            value={selectedCommodityId || ""} 
                                            onChange={(val) => {
                                                setSelectedCommodityId(val);
                                                handleLotSelect(null);
                                            }} 
                                            placeholder="All Items..." 
                                            className="h-10 bg-white" 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Select Stock Lot</Label>
                                        <LotSelector onSelect={handleLotSelect} selectedLotId={form.watch('lot_id')} commodityId={selectedCommodityId || undefined} />
                                        {form.formState.errors.lot_id && (
                                            <p className="text-[9px] font-black uppercase text-red-500 mt-1">{form.formState.errors.lot_id.message}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {selectedLot && (
                                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex flex-col justify-center animate-in fade-in">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Lot Availability</span>
                                        <Badge className="bg-emerald-100 text-emerald-800 border-none shadow-none text-[10px]">{selectedLot.lot_code}</Badge>
                                    </div>
                                    <div className="flex justify-between items-end border-b border-emerald-200/50 pb-2 mb-2">
                                        <span className="text-sm font-bold text-emerald-700">Starting Stock</span>
                                        <span className="text-xl font-black text-emerald-900">{selectedLot.current_qty} {selectedLot.unit}</span>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <span className="text-[10px] font-bold uppercase text-emerald-600/70">Remaining after distribution</span>
                                        <span className={cn("text-lg font-black tracking-tighter", remainingInLot < 0 ? "text-red-600" : "text-emerald-700")}>
                                            {remainingInLot.toFixed(2)} {selectedLot.unit}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Expandable Distributions Grid */}
                        <div className="space-y-6 mb-8">
                            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-[0.2em]">
                                    <div className="w-4 h-[1.5px] bg-indigo-600" /> DISTRIBUTIONS
                                </div>
                                <div className="flex items-center gap-4">
                                    {remainingInLot < 0 && (
                                        <div className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl animate-bounce shadow-xl">
                                            <AlertTriangle className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase tracking-tighter">Stock Overlimit!</span>
                                        </div>
                                    )}
                                    <Button type="button" variant="outline" onClick={() => append({ 
                                        buyer_id: "", qty: selectedLot ? remainingInLot : 0, rate: selectedLot?.sale_price || 0, 
                                        payment_mode: "credit", amount_received: 0, loading_charges: 0, unloading_charges: 0, other_expenses: 0, cheque_status: false 
                                    })} className="text-xs font-bold uppercase tracking-widest h-8 rounded-lg text-slate-600">
                                        <Plus className="w-3 h-3 mr-1" /> Add Buyer
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {fields.map((field, index) => {
                                    const isExpanded = !!expandedRows[index];
                                    const distQty = Number(form.watch(`distributions.${index}.qty`)) || 0;
                                    const distRate = Number(form.watch(`distributions.${index}.rate`)) || 0;
                                    const buyerInfo = buyers.find(b => b.id === form.watch(`distributions.${index}.buyer_id`));
                                    const itemInfo = items.find(i => i.id === selectedLot?.item_id);
                                    const rowTotals = calculateSaleTotals({
                                        items: [{
                                            amount: distQty * distRate,
                                            gst_rate: itemInfo?.gst_rate,
                                            is_gst_exempt: itemInfo?.is_gst_exempt,
                                        }],
                                        taxSettings,
                                        orgStateCode,
                                        buyerStateCode: buyerInfo?.state_code,
                                        loadingCharges: form.watch(`distributions.${index}.loading_charges`),
                                        unloadingCharges: form.watch(`distributions.${index}.unloading_charges`),
                                        otherExpenses: form.watch(`distributions.${index}.other_expenses`),
                                        discountAmount: Number(form.watch(`distributions.${index}.discount_amount`)) || 0,
                                    });

                                    return (
                                        <div key={field.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm transition-all focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
                                            {/* Summary Row (Always Visible) */}
                                            <div className="bg-slate-50 flex flex-col md:flex-row gap-4 p-4 items-center">
                                                <div className="w-full md:w-1/3">
                                                    <FormField control={form.control} name={`distributions.${index}.buyer_id`} render={({ field: f }) => (
                                                        <FormItem className="space-y-0">
                                                            <div className="flex gap-2">
                                                                <SearchableSelect 
                                                                    options={buyers.map(b => ({ label: `${b.name} (${b.city})`, value: b.id }))} 
                                                                    value={f.value} 
                                                                    onChange={f.onChange} 
                                                                    placeholder="Select Buyer..." 
                                                                    className="bg-white border-slate-300 h-10 font-bold" 
                                                                />
                                                                <ContactDialog defaultType="buyer" onSuccess={fetchMasters}><Button type="button" size="icon" className="h-10 w-10 shrink-0 bg-slate-900 text-white rounded-xl"><Plus className="w-4 h-4"/></Button></ContactDialog>
                                                            </div>
                                                            <FormMessage className="text-[9px] font-black uppercase text-red-500" />
                                                        </FormItem>
                                                    )} />
                                                </div>

                                                <div className="flex gap-2 w-full md:w-auto flex-1">
                                                    <FormField control={form.control} name={`distributions.${index}.qty`} render={({ field: f }) => (
                                                        <FormItem className="flex-1 space-y-1 relative">
                                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Qty</span>
                                                            <Input type="number" {...f} className="h-10 text-center font-black rounded-lg border-slate-300 bg-white" />
                                                            <FormMessage className="text-[9px] font-black uppercase text-red-500" />
                                                        </FormItem>
                                                    )}/>
                                                    <FormField control={form.control} name={`distributions.${index}.rate`} render={({ field: f }) => (
                                                        <FormItem className="flex-1 space-y-1 relative">
                                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Rate (₹)</span>
                                                            <Input type="number" {...f} className="h-10 text-center font-black rounded-lg border-slate-300 bg-white" />
                                                            <FormMessage className="text-[9px] font-black uppercase text-red-500" />
                                                        </FormItem>
                                                    )}/>
                                                </div>

                                                    <div className="flex items-center gap-4 min-w-[200px] justify-end">
                                                    <div className="flex flex-col text-right cursor-pointer" onClick={() => toggleRow(index)}>
                                                        <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Net Payable</span>
                                                        <span className="text-xl font-[1000] tracking-tighter text-slate-900">₹{rowTotals.grandTotal.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                                                    </div>
                                                    <Button type="button" variant="outline" size="icon" onClick={() => toggleRow(index)} className="h-10 w-10 shrink-0 rounded-xl bg-white border-slate-200">
                                                        {isExpanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="h-10 w-10 shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl">
                                                        <Trash2 className="w-4 h-4"/>
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Expandable Details Area (Mirrors new-sale-form bottom panel) */}
                                            {isExpanded && (
                                                <div className="p-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-8 bg-white animate-in slide-in-from-top-2">
                                                    <div className="md:col-span-7 space-y-6">
                                                        {/* Payment Mode Selection */}
                                                        <div className="flex gap-4 items-center">
                                                            <div className="w-1/2">
                                                                <Label className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1 block">Payment Terms</Label>
                                                                <FormField control={form.control} name={`distributions.${index}.payment_mode`} render={({ field: f }) => (
                                                                    <Select value={f.value} onValueChange={(val) => {
                                                                        f.onChange(val);
                                                                        if(val === 'credit') form.setValue(`distributions.${index}.amount_received`, 0);
                                                                        else form.setValue(`distributions.${index}.amount_received`, Math.round(rowTotals.grandTotal));

                                                                        // Automatically select default bank if UPI/Cheque
                                                                        if (val === 'UPI/BANK' || val === 'cheque') {
                                                                            if (!form.getValues(`distributions.${index}.bank_account_id`)) {
                                                                                const defaultBank = bankAccounts.find(b => b.is_default) || bankAccounts[0];
                                                                                if (defaultBank) {
                                                                                    form.setValue(`distributions.${index}.bank_account_id`, defaultBank.id);
                                                                                }
                                                                            }
                                                                        }
                                                                    }}>
                                                                        <SelectTrigger className="h-10 bg-slate-50 border-slate-200 font-bold focus:ring-0 shadow-none">
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="credit" className="font-bold py-2 uppercase tracking-tight">Credit (Udhaar)</SelectItem>
                                                                            <SelectItem value="cash" className="font-bold py-2 uppercase tracking-tight">Cash Paid</SelectItem>
                                                                            <SelectItem value="UPI/BANK" className="font-bold py-2 text-indigo-600 uppercase tracking-tight">UPI / Bank</SelectItem>
                                                                            <SelectItem value="cheque" className="font-bold py-2 text-indigo-600 uppercase tracking-tight">Cheque</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                )}/>
                                                            </div>
                                                            {form.watch(`distributions.${index}.payment_mode`) === 'credit' && (
                                                                <div className="w-1/2">
                                                                    <Label className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1 block">Due Date</Label>
                                                                    <FormField control={form.control} name={`distributions.${index}.due_date`} render={({ field: f }) => (
                                                                        <Popover>
                                                                            <PopoverTrigger asChild>
                                                                                <Button variant="outline" className="w-full h-10 border-slate-200 bg-slate-50 font-bold justify-start text-left shadow-none">
                                                                                    {f.value ? format(f.value, "PP") : "Pick date"}
                                                                                    <CalendarIcon className="ml-auto w-4 h-4 opacity-50" />
                                                                                </Button>
                                                                            </PopoverTrigger>
                                                                            <PopoverContent className="p-0 bg-white"><Calendar mode="single" selected={f.value || undefined} onSelect={f.onChange} initialFocus/></PopoverContent>
                                                                        </Popover>
                                                                    )}/>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Cheque / Bank Options */}
                                                        {form.watch(`distributions.${index}.payment_mode`) === "UPI/BANK" && (
                                                             <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-sm">
                                                                 <FormField control={form.control} name={`distributions.${index}.bank_account_id`} render={({ field: f }) => (
                                                                     <FormItem>
                                                                         <FormLabel className="text-[9px] font-black uppercase tracking-widest text-slate-600">📥 Settle To (Bank Account)</FormLabel>
                                                                         <Select value={f.value || ''} onValueChange={f.onChange}>
                                                                             <SelectTrigger className="bg-white h-10 font-bold mt-1 shadow-sm"><SelectValue placeholder="Select deposit account..." /></SelectTrigger>
                                                                             <SelectContent className="bg-white">{bankAccounts.map(b => <SelectItem key={b.id} value={b.id} className="font-bold py-2">{b.name}</SelectItem>)}</SelectContent>
                                                                         </Select>
                                                                     </FormItem>
                                                                 )}/>
                                                             </div>
                                                        )}

                                                        {form.watch(`distributions.${index}.payment_mode`) === "cheque" && (
                                                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4 shadow-sm">
                                                                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                                                                    <div className="flex items-center gap-2"><Landmark className="w-4 h-4 text-indigo-600"/><span className="text-[10px] font-black uppercase tracking-widest">Cheque Details</span></div>
                                                                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                                                                        <span className="text-[9px] font-black uppercase">Cleared Instantly</span>
                                                                        <Switch checked={form.watch(`distributions.${index}.cheque_status`)} onCheckedChange={(c) => form.setValue(`distributions.${index}.cheque_status`, c)} className="scale-75" />
                                                                    </label>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <FormField control={form.control} name={`distributions.${index}.bank_account_id`} render={({ field: f }) => (
                                                                         <FormItem><FormLabel className="text-[9px] font-black uppercase tracking-widest text-slate-600">Settle To</FormLabel><Select value={f.value || ''} onValueChange={f.onChange}><SelectTrigger className="bg-white h-10 font-bold shadow-sm"><SelectValue placeholder="Bank account" /></SelectTrigger><SelectContent className="bg-white">{bankAccounts.map(b => <SelectItem key={b.id} value={b.id} className="font-bold">{b.name}</SelectItem>)}</SelectContent></Select></FormItem>
                                                                    )}/>
                                                                    <FormField control={form.control} name={`distributions.${index}.cheque_no`} render={({ field: f }) => (
                                                                        <FormItem><FormLabel className="text-[9px] font-black uppercase tracking-widest text-slate-600">Cheque No</FormLabel><Input {...f} value={f.value || ''} className="h-10 bg-white font-bold"/></FormItem>
                                                                    )}/>
                                                                    <FormField control={form.control} name={`distributions.${index}.bank_name`} render={({ field: f }) => (
                                                                        <FormItem><FormLabel className="text-[9px] font-black uppercase tracking-widest text-slate-600">Party Bank</FormLabel><Input {...f} value={f.value || ''} className="h-10 bg-white font-bold"/></FormItem>
                                                                    )}/>
                                                                    {!form.watch(`distributions.${index}.cheque_status`) && (
                                                                         <FormField control={form.control} name={`distributions.${index}.cheque_date`} render={({ field: f }) => (
                                                                            <FormItem><FormLabel className="text-[9px] font-black uppercase tracking-widest text-slate-600">Clear Date</FormLabel><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-10 bg-white font-bold">{f.value ? format(f.value, "PP") : "Date"}</Button></PopoverTrigger><PopoverContent className="p-0 bg-white"><Calendar mode="single" selected={f.value || undefined} onSelect={f.onChange}/></PopoverContent></Popover></FormItem>
                                                                        )}/>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Item Discounts */}
                                                        <div className="border-l-4 border-emerald-500 bg-slate-50 p-4 rounded-r-xl mb-4">
                                                            <div className="flex items-center gap-2 text-slate-900 font-black text-[10px] uppercase tracking-[0.1em] mb-3">
                                                                <div className="w-3.5 h-3.5 flex items-center justify-center rounded bg-emerald-100 text-emerald-600">
                                                                    🏷️
                                                                </div>
                                                                Item Discounts
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`distributions.${index}.discount_percent`}
                                                                    render={({ field: f }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-[8px] uppercase font-black text-slate-700 tracking-wider">
                                                                                Discount (%)
                                                                            </FormLabel>
                                                                            <Input 
                                                                                type="number" 
                                                                                {...f} 
                                                                                onChange={(e) => {
                                                                                    f.onChange(e);
                                                                                    const pct = Number(e.target.value) || 0;
                                                                                    const itemsSubtotal = (Number(form.getValues(`distributions.${index}.qty`)) || 0) * (Number(form.getValues(`distributions.${index}.rate`)) || 0);
                                                                                    const calcAmount = (itemsSubtotal * pct) / 100;
                                                                                    form.setValue(`distributions.${index}.discount_amount`, Number(calcAmount.toFixed(2)));
                                                                                }}
                                                                                className="bg-white border-slate-200 h-9 font-bold text-xs shadow-none text-emerald-700 focus-visible:ring-emerald-500" 
                                                                            />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`distributions.${index}.discount_amount`}
                                                                    render={({ field: f }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-[8px] uppercase font-black text-slate-700 tracking-wider">
                                                                                Discount Amount (₹)
                                                                            </FormLabel>
                                                                            <Input 
                                                                                type="number" 
                                                                                {...f} 
                                                                                onChange={(e) => {
                                                                                    f.onChange(e);
                                                                                    const amt = Number(e.target.value) || 0;
                                                                                    const itemsSubtotal = (Number(form.getValues(`distributions.${index}.qty`)) || 0) * (Number(form.getValues(`distributions.${index}.rate`)) || 0);
                                                                                    if (itemsSubtotal > 0) {
                                                                                        const calcPct = (amt / itemsSubtotal) * 100;
                                                                                        form.setValue(`distributions.${index}.discount_percent`, Number(calcPct.toFixed(2)));
                                                                                    } else {
                                                                                        form.setValue(`distributions.${index}.discount_percent`, 0);
                                                                                    }
                                                                                }}
                                                                                className="bg-white border-slate-200 h-9 font-bold text-xs shadow-none text-emerald-700 focus-visible:ring-emerald-500" 
                                                                            />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Buyer Logistics */}
                                                        <div className="border-l-4 border-indigo-600 bg-slate-50 p-4 rounded-r-xl">
                                                            <div className="flex items-center gap-2 text-slate-900 font-black text-[10px] uppercase tracking-[0.1em] mb-3"><Truck className="w-3.5 h-3.5"/> Buyer Logistics & Surcharge</div>
                                                            <div className="grid grid-cols-3 gap-4">
                                                                <FormField control={form.control} name={`distributions.${index}.loading_charges`} render={({ field: f }) => (
                                                                    <FormItem><FormLabel className="text-[8px] uppercase font-black text-slate-700 tracking-wider">Loading</FormLabel><Input type="number" {...f} className="bg-white border-slate-200 h-9 font-bold text-xs shadow-none"/><FormMessage className="text-[8px] uppercase text-red-500"/></FormItem>
                                                                )}/>
                                                                <FormField control={form.control} name={`distributions.${index}.unloading_charges`} render={({ field: f }) => (
                                                                    <FormItem><FormLabel className="text-[8px] uppercase font-black text-slate-700 tracking-wider">Unloading</FormLabel><Input type="number" {...f} className="bg-white border-slate-200 h-9 font-bold text-xs shadow-none"/><FormMessage className="text-[8px] uppercase text-red-500"/></FormItem>
                                                                )}/>
                                                                <FormField control={form.control} name={`distributions.${index}.other_expenses`} render={({ field: f }) => (
                                                                    <FormItem><FormLabel className="text-[8px] uppercase font-black text-slate-700 tracking-wider">Other</FormLabel><Input type="number" {...f} className="bg-white border-slate-200 h-9 font-bold text-xs shadow-none"/><FormMessage className="text-[8px] uppercase text-red-500"/></FormItem>
                                                                )}/>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Payment Summary Panel */}
                                                    <div className="md:col-span-5 relative">
                                                        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg relative h-full flex flex-col">
                                                            <div className="space-y-2 pb-3 border-b border-white/10 flex-1">
                                                                <div className="flex justify-between items-center text-[9px] font-black tracking-widest uppercase text-white/50"><span>Taxable Val</span><span className="text-white">₹{rowTotals.subTotal.toLocaleString()}</span></div>
                                                                <div className="flex justify-between items-center text-[9px] font-black tracking-widest uppercase text-white/50"><span>GST</span><span className="text-indigo-400">+ ₹{rowTotals.gstTotal.toLocaleString()}</span></div>
                                                                <div className="flex justify-between items-center text-[9px] font-black tracking-widest uppercase text-white/50"><span>Fees & Charges</span><span className="text-indigo-400">+ ₹{(rowTotals.marketFee + rowTotals.nirashrit + rowTotals.miscFee + rowTotals.extraCharges).toLocaleString()}</span></div>
                                                            </div>

                                                            <div className="pt-3 mt-auto space-y-4">
                                                                <div>
                                                                    <div className="text-[9px] font-black tracking-[0.3em] uppercase text-indigo-400 mb-0.5">Net Invoice Total</div>
                                                                    <div className="text-3xl font-black tracking-tight leading-none">₹{rowTotals.grandTotal.toLocaleString(undefined, {maximumFractionDigits:0})}</div>
                                                                    {Number(distQty) > 0 && (
                                                                        <div className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mt-1">
                                                                            Avg Rate: ₹{(rowTotals.grandTotal / Number(distQty)).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {form.watch(`distributions.${index}.payment_mode`) !== 'credit' && (
                                                                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-2">
                                                                        <Label className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Amount Received</Label>
                                                                        <FormField control={form.control} name={`distributions.${index}.amount_received`} render={({ field: f }) => (
                                                                            <div className="relative">
                                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 font-bold">₹</span>
                                                                                <Input type="number" {...f} className="pl-8 bg-white/10 border-none h-10 text-lg font-black text-white focus:ring-1 focus:ring-indigo-500 rounded-xl" />
                                                                            </div>
                                                                        )}/>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Submit Actions */}
                        <div className="pt-6 border-t border-slate-100 flex justify-end gap-4">
                            <Button type="submit" disabled={isSubmitting || fields.length === 0} className={cn("h-12 px-8 font-black uppercase tracking-widest rounded-xl transition-all shadow-lg text-xs", remainingInLot < 0 ? "bg-red-600 hover:bg-red-700 text-white" : "bg-slate-900 text-white hover:bg-indigo-600")}>
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : "Review & Post Invoices"} <ArrowLeft className="w-4 h-4 rotate-180 ml-2"/>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Final Confirmation Dialog */}
                <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
                    <DialogContent className="max-w-2xl bg-white rounded-3xl p-0 overflow-hidden text-black">
                        <DialogHeader className="p-8 pb-4 bg-slate-50 border-b border-slate-100">
                            <DialogTitle className="text-2xl font-[1000] uppercase italic tracking-tighter">Confirm Distributions</DialogTitle>
                            <DialogDescription className="text-slate-500 font-bold text-xs uppercase tracking-widest">You are about to issue {pendingValues?.distributions.length} invoices</DialogDescription>
                        </DialogHeader>
                        <div className="p-8 overflow-y-auto max-h-[60vh]">
                            <div className="space-y-4">
                                {pendingValues?.distributions.map((d, i) => {
                                    const bName = buyers.find(b => b.id === d.buyer_id)?.name || 'Unknown';
                                    const buyerInfo = buyers.find(b => b.id === d.buyer_id);
                                    const itemInfo = items.find(item => item.id === selectedLot?.item_id);
                                    const totals = calculateSaleTotals({
                                        items: [{
                                            amount: d.qty * d.rate,
                                            gst_rate: itemInfo?.gst_rate,
                                            is_gst_exempt: itemInfo?.is_gst_exempt,
                                        }],
                                        taxSettings,
                                        orgStateCode,
                                        buyerStateCode: buyerInfo?.state_code,
                                        loadingCharges: d.loading_charges,
                                        unloadingCharges: d.unloading_charges,
                                        otherExpenses: d.other_expenses,
                                        discountAmount: Number(d.discount_amount) || 0,
                                    });
                                    const addOns = totals.gstTotal + totals.marketFee + totals.nirashrit + totals.miscFee + totals.extraCharges;
                                    
                                    return (
                                        <div key={i} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                                            <div className="flex flex-col gap-1">
                                                <span className="font-black text-slate-800">{bName}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold uppercase text-slate-400">{d.qty} unit × ₹{d.rate} ({d.payment_mode})</span>
                                                    {addOns > 0 && (
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                                                            + ₹{addOns.toLocaleString()} Add-ons
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="font-[1000] text-xl text-slate-900 tracking-tighter">₹{totals.grandTotal.toLocaleString()}</div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100">
                            <Button variant="outline" onClick={() => setShowConfirm(false)} className="bg-white rounded-xl h-11 text-xs font-black uppercase">Cancel</Button>
                            <Button onClick={handleConfirmPost} disabled={isSubmitting} className="bg-indigo-600 hover:bg-slate-900 text-white rounded-xl h-11 text-xs font-black uppercase">
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : "Confirm & Post"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </form>
        </Form>
    );
};

export default NewInvoiceForm;
