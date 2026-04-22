"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useEffect } from "react";
import { 
    Plus, Trash2, Loader2, User, 
    Package, CheckCircle2, AlertCircle, Save, ArrowLeft,
    Zap, Truck, Settings2, Calculator, Info, Landmark,
    CalendarCheck, History, Tag
} from "lucide-react";
import { formatCommodityName } from "@/lib/utils/commodity-utils";
import { Button } from "@/components/ui/button";
import { 
    Form, FormControl, FormField, FormItem, 
    FormLabel, FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/components/i18n/language-provider";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { LotSelector } from "./lot-selector";
import { confirmSaleTransactionWithFallback } from "@/lib/mandi/confirm-sale-transaction";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const formSchema = z.object({
    lot_id: z.string().min(1, "Select a Lot first"),
    sale_date: z.string().min(1, "Date required"),
    distributions: z.array(z.object({
        buyer_id: z.string().min(1, "Buyer required"),
        qty: z.coerce.number().min(0.01, "Qty required"),
        rate: z.coerce.number().min(0.01, "Rate required"),
        loading_charges: z.coerce.number().min(0).default(0),
        unloading_charges: z.coerce.number().min(0).default(0),
        other_expenses: z.coerce.number().min(0).default(0),
        market_fee: z.coerce.number().min(0).default(0),
        nirashrit: z.coerce.number().min(0).default(0),
        misc_fee: z.coerce.number().min(0).default(0),
        grand_total: z.coerce.number().min(0).optional(),
        payment_mode: z.string().min(1, "Payment mode required").default("credit"),
        bank_account_id: z.string().optional(),
        cheque_no: z.string().optional(),
        cheque_date: z.string().optional(),
        cheque_status: z.boolean().default(false),
        bank_name: z.string().optional(),
        amount_received: z.coerce.number().min(0).optional(),
        gst_total: z.coerce.number().min(0).default(0),
        cgst_amount: z.coerce.number().min(0).default(0),
        sgst_amount: z.coerce.number().min(0).default(0),
        igst_amount: z.coerce.number().min(0).default(0),
        is_igst: z.boolean().default(false),
        discount_percent: z.coerce.number().min(0).max(100).default(0),
        discount_amount: z.coerce.number().min(0).default(0),
    })).min(1, "Add at least one buyer"),
});

type FormValues = z.infer<typeof formSchema>;

export function BulkLotSaleForm() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const { t } = useLanguage();
    const router = useRouter();
    const [selectedLot, setSelectedLot] = useState<any>(null);
    const [buyers, setBuyers] = useState<any[]>([]);
    const [commodities, setCommodities] = useState<any[]>([]);
    const [selectedCommodityId, setSelectedCommodityId] = useState<string | null>(null);
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResults, setSubmitResults] = useState<{index: number, status: 'pending' | 'success' | 'error', message?: string}[]>([]);
    const [taxSettings, setTaxSettings] = useState({ market_fee_percent: 0.0, nirashrit_percent: 0.0, misc_fee_percent: 0.0, default_credit_days: 0, state_code: null as string | null });
    const [priceHistory, setPriceHistory] = useState<Record<string, Record<string, number>>>({}); // buyer_id -> { item_id -> price }
    const [buyerWarnings, setBuyerWarnings] = useState<Record<string, { overLimit: boolean; balance: number }>>({});

    const fetchPriceHistory = async (buyerId: string) => {
        if (priceHistory[buyerId]) return;
        const { data } = await supabase
            .schema('mandi')
            .from('sale_items')
            .select('rate, item_id, sales!inner(buyer_id)')
            .eq('sales.buyer_id', buyerId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (data) {
            const history: Record<string, number> = {};
            data.forEach((d: any) => {
                if (!history[d.item_id]) history[d.item_id] = d.rate;
            });
            setPriceHistory(prev => ({ ...prev, [buyerId]: history }));
        }
    };

    const fetchCreditStatus = async (buyerId: string) => {
        if (buyerWarnings[buyerId]) return;
        try {
            const { data, error } = await supabase
                .schema('mandi')
                .from('view_party_balances')
                .select('net_balance')
                .eq('contact_id', buyerId)
                .eq('organization_id', profile?.organization_id)
                .maybeSingle();

            if (!error && data) {
                const buyerInfo = buyers.find(b => b.id === buyerId);
                const balance = Number(data.net_balance);
                const overLimit = buyerInfo?.credit_limit ? balance > buyerInfo.credit_limit : false;
                
                setBuyerWarnings(prev => ({
                    ...prev,
                    [buyerId]: { overLimit, balance }
                }));
            }
        } catch {
            // Silently fail
        }
    };

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            lot_id: "",
            sale_date: new Date().toISOString().split('T')[0],
            distributions: [{ 
                buyer_id: "", 
                qty: 0, 
                rate: 0, 
                loading_charges: 0, 
                unloading_charges: 0,
                other_expenses: 0,
                market_fee: 0,
                nirashrit: 0,
                misc_fee: 0,
                grand_total: 0,
                payment_mode: "credit",
                bank_account_id: "",
                cheque_no: "",
                cheque_date: new Date().toISOString().split('T')[0],
                cheque_status: false,
                bank_name: "",
                amount_received: 0,
                gst_total: 0,
                cgst_amount: 0,
                sgst_amount: 0,
                igst_amount: 0,
                is_igst: false,
                discount_percent: 0,
                discount_amount: 0
            }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "distributions"
    });

    useEffect(() => {
        const fetchMasters = async () => {
            if (!profile?.organization_id) return;
            
            // Fetch Buyers - EXPLICIT MANI SCHEMA
            const { data: bData } = await supabase
                .schema('mandi')
                .from("contacts")
                .select("id, name, contact_type, city, status, state_code, gstin")
                .eq("organization_id", profile.organization_id)
                .eq("contact_type", "buyer")
                .or("status.is.null,status.eq.active")
                .order("name");
            if (bData) setBuyers(bData.map(b => ({ ...b, label: `${b.name} (${b.city || "-"})`, value: b.id })));

            // Fetch Commodities - EXPLICIT MANDI SCHEMA
            const { data: cData } = await supabase
                .schema('mandi')
                .from("commodities")
                .select("id, name, local_name, sku_code, custom_attributes, gst_rate")
                .eq("organization_id", profile.organization_id)
                .order("name");
            if (cData) setCommodities(cData.map(c => ({ ...c, label: formatCommodityName(c.name, c.custom_attributes), value: c.id })));

            // Fetch Bank Accounts - EXPLICIT MANDI SCHEMA
            const { data: bankData } = await supabase
                .schema('mandi')
                .from("accounts")
                .select("id, name, is_default")
                .eq("organization_id", profile.organization_id)
                .eq("account_sub_type", "bank")
                .eq("type", "asset")
                .eq("is_active", true);
            
            if (bankData) {
                const filteredBanks = bankData.filter(b => 
                    !b.name.toLowerCase().includes('cheques in hand') && 
                    !b.name.toLowerCase().includes('transit')
                );
                setBankAccounts(filteredBanks.map(b => ({ label: b.name, value: b.id, isDefault: b.is_default })));
            }

            // Fetch Mandi Settings - EXPLICIT MANDI SCHEMA
            const { data: sData } = await supabase
                .schema('mandi')
                .from("mandi_settings")
                .select("*")
                .eq("organization_id", profile.organization_id)
                .maybeSingle();
            
            if (sData) {
                setTaxSettings({
                    market_fee_percent: Number(sData.market_fee_percent) || 0,
                    nirashrit_percent: Number(sData.nirashrit_percent) || 0,
                    misc_fee_percent: Number(sData.misc_fee_percent) || 0,
                    default_credit_days: Number(sData.default_credit_days) || 0,
                    state_code: sData.state_code || null
                });
            }
        };
        fetchMasters();
    }, [profile]);

    const handleLotSelect = (lot: any) => {
        setSelectedLot(lot);
        form.setValue("lot_id", lot.id);
        if (lot.sale_price) {
            const dists = form.getValues("distributions");
            dists.forEach((_, i) => form.setValue(`distributions.${i}.rate`, lot.sale_price));
        }
    };

    const totalQtyDistributed = form.watch("distributions").reduce((sum, d) => sum + (Number(d.qty) || 0), 0);
    const remainingInLot = selectedLot ? Number(selectedLot.current_qty) - totalQtyDistributed : 0;

    // Row-based auto-calculation logic
    useEffect(() => {
        const subscription = form.watch((value: any, { name, type }) => {
            if (!name?.startsWith("distributions.")) return;
            
            const indexMatch = name.match(/\d+/);
            if (!indexMatch) return;
            const index = parseInt(indexMatch[0]);
            
            const dist = value.distributions?.[index];
            if (!dist) return;

            const qty = Number(dist.qty) || 0;
            const rate = Number(dist.rate) || 0;
            const loading = Number(dist.loading_charges) || 0;
            const unloading = Number(dist.unloading_charges) || 0;
            const other = Number(dist.other_expenses) || 0;
            
            const subtotal = qty * rate;
            const discount = Number(dist.discount_amount) || 0;
            const taxableSubtotal = Math.max(0, subtotal - discount);

            const mf = Math.round(taxableSubtotal * (taxSettings.market_fee_percent / 100));
            const nr = Math.round(taxableSubtotal * (taxSettings.nirashrit_percent / 100));
            const misc = Math.round(taxableSubtotal * (taxSettings.misc_fee_percent / 100));
            
            // GST Detection & Calculation
            const itemInfo = commodities.find(c => c.id === selectedLot?.item_id);
            const buyerInfo = buyers.find(b => b.id === dist.buyer_id);
            const gstRate = itemInfo?.gst_rate || 0;
            const isIgst = (taxSettings.state_code && buyerInfo?.state_code && taxSettings.state_code !== buyerInfo.state_code) || false;
            
            const gstTotal = Math.round((taxableSubtotal * gstRate) / 100);
            const cgst = isIgst ? 0 : Math.round(gstTotal / 2);
            const sgst = isIgst ? 0 : Math.round(gstTotal / 2);
            const igst = isIgst ? gstTotal : 0;

            const gTotal = taxableSubtotal + mf + nr + misc + gstTotal + loading + unloading + other;

            // Sync calculated values back to form
            const currentDist = form.getValues(`distributions.${index}`);
            let changed = false;
            
            if (currentDist.market_fee !== mf) { form.setValue(`distributions.${index}.market_fee`, mf); changed = true; }
            if (currentDist.nirashrit !== nr) { form.setValue(`distributions.${index}.nirashrit`, nr); changed = true; }
            if (currentDist.misc_fee !== misc) { form.setValue(`distributions.${index}.misc_fee`, misc); changed = true; }
            if (currentDist.gst_total !== gstTotal) { form.setValue(`distributions.${index}.gst_total`, gstTotal); changed = true; }
            if (currentDist.cgst_amount !== cgst) { form.setValue(`distributions.${index}.cgst_amount`, cgst); changed = true; }
            if (currentDist.sgst_amount !== sgst) { form.setValue(`distributions.${index}.sgst_amount`, sgst); changed = true; }
            if (currentDist.igst_amount !== igst) { form.setValue(`distributions.${index}.igst_amount`, igst); changed = true; }
            if (currentDist.is_igst !== isIgst) { form.setValue(`distributions.${index}.is_igst`, isIgst); changed = true; }

            if (currentDist.grand_total !== gTotal) {
                form.setValue(`distributions.${index}.grand_total`, gTotal);
                changed = true;
                
                // Auto-update amount_received
                const currentReceived = Number(currentDist.amount_received) || 0;
                const oldGTotal = Number(currentDist.grand_total) || 0;
                if (currentDist.payment_mode !== 'credit' && (currentReceived === 0 || currentReceived === oldGTotal)) {
                    form.setValue(`distributions.${index}.amount_received`, gTotal);
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [form, taxSettings, commodities, selectedLot]);

    const onSubmit = async (values: FormValues) => {
        if (!selectedLot) return;
        if (remainingInLot < 0) {
            toast({
                title: "Over Stock!",
                description: `You are trying to distribute ${totalQtyDistributed.toFixed(2)} units but only ${selectedLot.current_qty} available.`,
                variant: "destructive"
            });
            return;
        }

        // VALIDATION: Ensure direct arrivals have a purchase rate before selling
        // This mirrors the logic in new-sale-form.tsx
        if ((selectedLot.arrival_type || 'direct') === 'direct' && (!selectedLot.supplier_rate || Number(selectedLot.supplier_rate) <= 0)) {
            toast({
                title: "Purchase Price Missing",
                description: `Please enter the purchase rate for ${selectedLot.lot_code} in Arrivals before selling.`,
                variant: "destructive"
            });
            return;
        }

        setIsSubmitting(true);
        const initialResults = values.distributions.map((_, i) => ({ index: i, status: 'pending' as const }));
        setSubmitResults(initialResults);

        for (let i = 0; i < values.distributions.length; i++) {
            const dist = values.distributions[i];
            
            try {
                // Fetch buyer & commodity info for tax calculations
                const buyerInfo = buyers.find(b => b.id === dist.buyer_id);
                const itemInfo = commodities.find(c => c.id === selectedLot.item_id);
                const subtotal = dist.qty * dist.rate;
                const discount = Number(dist.discount_amount) || 0;
                const taxableSubtotal = Math.max(0, subtotal - discount);

                const gstRate = itemInfo?.gst_rate || 0;
                // Since mandi.commodities doesn't have is_gst_exempt, we derive it from gst_rate
                const isExempt = gstRate === 0;
                
                let itemTax = 0;
                let cgst = 0, sgst = 0, igst = 0;
                
                if (!isExempt && gstRate > 0) {
                    itemTax = (taxableSubtotal * gstRate) / 100;
                    // Default to CGST/SGST as mandi contacts lack state_code for IGST detection
                    cgst = itemTax / 2;
                    sgst = itemTax / 2;
                }

                // Determine due date for credit sales
                const dueDate = (dist.payment_mode === 'credit' && taxSettings.default_credit_days > 0)
                    ? new Date(new Date(values.sale_date).getTime() + taxSettings.default_credit_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    : null;

                const idempotencyKey = crypto.randomUUID();

                const params = {
                    organizationId: profile!.organization_id,
                    buyerId: dist.buyer_id,
                    saleDate: values.sale_date,
                    paymentMode: dist.payment_mode === 'upi' ? 'UPI/BANK' : dist.payment_mode,
                    totalAmount: subtotal,
                    items: [{
                        item_id: selectedLot.item_id, 
                        lot_id: selectedLot.id,      
                        qty: dist.qty,
                        rate: dist.rate,
                        amount: subtotal,
                        unit: selectedLot.unit,
                        gst_rate: gstRate,
                        gst_amount: Number(dist.gst_total) || 0,
                        hsn_code: itemInfo?.hsn_code || null
                    }],
                    loadingCharges: Number(dist.loading_charges) || 0,
                    unloadingCharges: Number(dist.unloading_charges) || 0,
                    otherExpenses: Number(dist.other_expenses) || 0,
                    marketFee: Number(dist.market_fee) || 0,
                    nirashrit: Number(dist.nirashrit) || 0,
                    miscFee: Number(dist.misc_fee) || 0,
                    discountAmount: discount,
                    discountPercent: Number(dist.discount_percent) || 0,
                    cgstAmount: Number(dist.cgst_amount) || 0,
                    sgstAmount: Number(dist.sgst_amount) || 0,
                    igstAmount: Number(dist.igst_amount) || 0,
                    gstTotal: Number(dist.gst_total) || 0,
                    bankAccountId: dist.bank_account_id || null,
                    chequeNo: dist.cheque_no || null,
                    chequeDate: dist.cheque_date || null,
                    chequeStatus: !!dist.cheque_status,
                    bankName: dist.bank_name || null,
                    amountReceived: dist.payment_mode === 'credit' ? 0 : (Number(dist.amount_received) || 0),
                    dueDate,
                    idempotencyKey,
                    // New meta fields
                    placeOfSupply: dist.is_igst ? (buyerInfo?.state_code || null) : (taxSettings.state_code || null),
                    buyerGstin: buyerInfo?.gstin || null,
                    isIgst: !!dist.is_igst
                };

                const { error } = await confirmSaleTransactionWithFallback(params as any);
                if (error) throw error;

                // Purchase ledger is handled at arrival time by post_arrival_ledger.
                // No need to re-post purchase cost on sale.

                setSubmitResults(prev => prev.map(r => r.index === i ? { ...r, status: 'success' } : r));
            } catch (err: any) {
                console.error(`Error in row ${i}:`, err);
                setSubmitResults(prev => prev.map(r => r.index === i ? { ...r, status: 'error', message: err.message || "Failed" } : r));
            }
        }

        setIsSubmitting(false);
        const allSuccess = submitResults.every(r => r.status === 'success');
        if (allSuccess) {
            toast({ title: "Bulk Distribution Complete!", description: `Successfully created ${values.distributions.length} invoices.` });
            router.push("/sales");
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-4 space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-3xl font-[1000] tracking-tighter uppercase flex items-center gap-3 text-black">
                        <div className="bg-purple-600 p-2 rounded-xl">
                            <Zap className="w-6 h-6 text-white fill-white" />
                        </div>
                        BULK <span className="text-purple-600">LOT DISTRIBUTION</span>
                    </h1>
                    <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em]">One Lot → Multiple Customers • Instant Distribution</p>
                </div>
                <Button variant="ghost" onClick={() => router.back()} className="rounded-xl font-bold uppercase text-xs tracking-widest gap-2 text-slate-500">
                    <ArrowLeft className="w-4 h-4" /> Back
                </Button>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-12 gap-6">
                        <div className="col-span-12 lg:col-span-4 space-y-6">
                            <Card className="border-slate-200 shadow-xl rounded-3xl overflow-hidden bg-slate-50/50">
                                <CardHeader className="bg-white border-b border-slate-100">
                                    <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Step 1: Pick Stock</CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-6 text-black">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Pick Commodity / Fruit (Optional)</Label>
                                            <SearchableSelect 
                                                options={commodities} 
                                                value={selectedCommodityId || ""} 
                                                onChange={(val) => {
                                                    setSelectedCommodityId(val || null);
                                                    if (selectedLot) {
                                                        setSelectedLot(null);
                                                        form.setValue("lot_id", "");
                                                    }
                                                }} 
                                                placeholder="All Fruits..." 
                                                className="h-11 rounded-xl bg-white" 
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Pick Stock Lot</Label>
                                            <LotSelector 
                                                onSelect={handleLotSelect} 
                                                selectedLotId={form.watch("lot_id")} 
                                                commodityId={selectedCommodityId || undefined} 
                                            />
                                        </div>
                                    </div>
                                    {selectedLot && (
                                        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                                            <div className="flex flex-col gap-1 border-b border-slate-100 pb-3 mb-1">
                                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">Commodity Identity</span>
                                                <span className="text-sm font-[1000] text-slate-900 uppercase tracking-tight">
                                                    {(() => {
                                                        const item = commodities.find(c => c.id === selectedLot.item_id);
                                                        return formatCommodityName(item?.name || "Unknown", selectedLot.custom_attributes || item?.custom_attributes);
                                                    })()}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Available Stock</span>
                                                <Badge className="bg-blue-50 text-blue-600 border-blue-100 text-xs font-black px-3 py-1 rounded-full uppercase">
                                                    {selectedLot.lot_code} • {selectedLot.current_qty} {selectedLot.unit}
                                                </Badge>
                                            </div>
                                            <div className="pt-4 border-t border-slate-100 flex items-center justify-between font-black">
                                                <span className="text-[10px] uppercase text-slate-400 tracking-widest">Remaining After</span>
                                                <span className={cn("text-lg tracking-tighter", remainingInLot < 0 ? "text-red-600" : "text-green-600")}>
                                                    {remainingInLot.toFixed(2)} {selectedLot.unit}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="space-y-4 pt-4 border-t border-slate-100">
                                        <FormField
                                            control={form.control}
                                            name="sale_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Sales Date</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} className="bg-white border-slate-200 h-11 rounded-xl font-bold" />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="col-span-12 lg:col-span-8">
                            <Card className="border-slate-200 shadow-xl rounded-3xl overflow-hidden min-h-[500px]">
                                <CardHeader className="bg-white border-b border-slate-100 flex flex-row items-center justify-between">
                                    <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Step 2: Assign Customers</CardTitle>
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        onClick={() => append({ 
                                            buyer_id: "", 
                                            qty: 0, 
                                            rate: Number(selectedLot?.sale_price) || 0, 
                                            loading_charges: 0, 
                                            unloading_charges: 0,
                                            other_expenses: 0,
                                            market_fee: 0,
                                            nirashrit: 0,
                                            misc_fee: 0,
                                            grand_total: 0,
                                            payment_mode: "credit",
                                            bank_account_id: "",
                                            cheque_no: "",
                                            cheque_date: new Date().toISOString().split('T')[0],
                                            cheque_status: false,
                                            bank_name: "",
                                            amount_received: 0,
                                            gst_total: 0,
                                            cgst_amount: 0,
                                            sgst_amount: 0,
                                            igst_amount: 0,
                                            is_igst: false,
                                            discount_percent: 0,
                                            discount_amount: 0
                                        })} 
                                        className="rounded-xl border-slate-200 font-bold uppercase text-[10px] tracking-widest bg-slate-50 hover:bg-slate-100 text-slate-600 gap-2 h-9 px-4"
                                    >
                                        <Plus className="w-3 h-3" /> Add Buyer
                                    </Button>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-black">
                                            <thead className="bg-slate-50/50 border-b border-slate-100">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] w-[35%]">Customer / Buyer</th>
                                                    <th className="px-3 py-4 text-center text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Qty</th>
                                                    <th className="px-3 py-4 text-center text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Rate</th>
                                                    <th className="px-3 py-4 text-center text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] w-[60px]">Extra</th>
                                                    <th className="px-4 py-4 text-right text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Net Total</th>
                                                    <th className="px-4 py-4 text-right text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] w-[50px]"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {fields.map((field, index) => (
                                                    <tr key={field.id} className="group hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <FormField
                                                                control={form.control}
                                                                name={`distributions.${index}.buyer_id`}
                                                                render={({ field }) => (
                                                                    <FormItem className="space-y-0">
                                                                        <div className="relative group/buyer">
                                                                            <SearchableSelect 
                                                                                options={buyers} 
                                                                                value={field.value} 
                                                                                onChange={(val) => {
                                                                                    field.onChange(val);
                                                                                    if (val) {
                                                                                        fetchPriceHistory(val);
                                                                                        fetchCreditStatus(val);
                                                                                    }
                                                                                }} 
                                                                                placeholder="Select Customer..." 
                                                                                className={cn(
                                                                                    "h-10 rounded-xl transition-all",
                                                                                    buyerWarnings[field.value]?.overLimit && "border-red-300 bg-red-50/20"
                                                                                )} 
                                                                            />
                                                                            {field.value && (
                                                                                <div className="absolute -top-1.5 -right-1.5 flex gap-1 animate-in zoom-in-50">
                                                                                    {priceHistory[field.value]?.[selectedLot?.item_id] && (
                                                                                        <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-100 text-[8px] font-black uppercase px-1.5 h-4 flex items-center gap-1 shadow-sm">
                                                                                            <History className="w-2 h-2" />
                                                                                            ₹{priceHistory[field.value][selectedLot.item_id]}
                                                                                        </Badge>
                                                                                    )}
                                                                                    {buyerWarnings[field.value] && (
                                                                                        <Badge variant="outline" className={cn(
                                                                                            "text-[8px] font-black uppercase px-1.5 h-4 flex items-center gap-1 shadow-sm",
                                                                                            buyerWarnings[field.value].overLimit ? "bg-red-600 text-white border-red-600" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                                                                                        )}>
                                                                                            <Landmark className="w-2 h-2" />
                                                                                            ₹{Math.abs(buyerWarnings[field.value].balance).toLocaleString()}
                                                                                        </Badge>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </td>
                                                        <td className="px-3 py-4 text-center font-black">
                                                            <Input type="number" step="0.01" {...form.register(`distributions.${index}.qty`)} className="h-10 text-center font-black rounded-xl border-slate-200" />
                                                        </td>
                                                        <td className="px-3 py-4">
                                                            <Input type="number" step="0.01" {...form.register(`distributions.${index}.rate`)} className="h-10 text-center font-black rounded-xl border-slate-200" />
                                                        </td>
                                                        <td className="px-3 py-4 text-center">
                                                            <Dialog>
                                                                <DialogTrigger asChild>
                                                                    <Button variant="outline" size="sm" className="h-9 w-9 p-0 rounded-xl border-slate-200 shadow-sm relative">
                                                                        <Settings2 className="w-4 h-4 text-slate-500" />
                                                                        {(form.watch(`distributions.${index}.other_expenses`) > 0 || 
                                                                          form.watch(`distributions.${index}.payment_mode`) !== 'credit') && (
                                                                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-purple-600 rounded-full border-2 border-white" />
                                                                        )}
                                                                    </Button>
                                                                </DialogTrigger>
                                                                <DialogContent className="max-w-2xl p-0 rounded-[2.5rem] overflow-hidden border-none shadow-2xl">
                                                                    <DialogHeader className="p-8 bg-slate-50 border-b border-slate-100">
                                                                        <DialogTitle className="text-xl font-[1000] tracking-tighter uppercase flex items-center gap-3">
                                                                            <div className="bg-purple-600 p-2 rounded-xl">
                                                                                <Landmark className="w-5 h-5 text-white" />
                                                                            </div>
                                                                            Payment & Fee Details
                                                                        </DialogTitle>
                                                                    </DialogHeader>
                                                                    <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                                                        <div className="grid grid-cols-2 gap-8">
                                                                            <div className="space-y-6">
                                                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                                                                    <Landmark className="w-3 h-3" /> Payment Configuration
                                                                                </h4>
                                                                                
                                                                                <div className="space-y-2">
                                                                                    <Label className="text-[10px] font-black uppercase text-slate-500">Payment Mode</Label>
                                                                                    <select 
                                                                                        {...form.register(`distributions.${index}.payment_mode`)}
                                                                                        className="w-full bg-slate-50 border border-slate-200 h-12 rounded-2xl px-4 font-bold text-sm outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
                                                                                        onChange={(e) => {
                                                                                            const mode = e.target.value;
                                                                                            form.setValue(`distributions.${index}.payment_mode`, mode);
                                                                                            if (mode !== 'credit') {
                                                                                                const gTotal = form.getValues(`distributions.${index}.grand_total`);
                                                                                                form.setValue(`distributions.${index}.amount_received`, gTotal);
                                                                                            } else {
                                                                                                form.setValue(`distributions.${index}.amount_received`, 0);
                                                                                            }
                                                                                            
                                                                                            // Auto-select default bank if UPI/Cheque
                                                                                            if ((mode === 'upi' || mode === 'cheque') && bankAccounts.length > 0) {
                                                                                                const currentBank = form.getValues(`distributions.${index}.bank_account_id`);
                                                                                                if (!currentBank) {
                                                                                                    const defaultBank = bankAccounts.find(a => a.isDefault) || bankAccounts[0];
                                                                                                    form.setValue(`distributions.${index}.bank_account_id`, defaultBank.value);
                                                                                                }
                                                                                            }
                                                                                        }}
                                                                                    >
                                                                                        <option value="credit">UDHAAR (CREDIT)</option>
                                                                                        <option value="cash">CASH (PAID)</option>
                                                                                        <option value="upi">UPI / BANK</option>
                                                                                        <option value="cheque">CHEQUE</option>
                                                                                    </select>
                                                                                </div>

                                                                                {(form.watch(`distributions.${index}.payment_mode`) === 'upi' || 
                                                                                  form.watch(`distributions.${index}.payment_mode`) === 'cheque') && (
                                                                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                                                                        <div className="space-y-2">
                                                                                            <Label className="text-[10px] font-black uppercase text-slate-500">Bank Account</Label>
                                                                                            <select 
                                                                                                {...form.register(`distributions.${index}.bank_account_id`)}
                                                                                                className="w-full bg-slate-50 border border-slate-200 h-12 rounded-2xl px-4 font-bold text-sm outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
                                                                                            >
                                                                                                <option value="">Select Bank...</option>
                                                                                                {bankAccounts.map(acc => (
                                                                                                    <option key={acc.value} value={acc.value}>{acc.label}</option>
                                                                                                ))}
                                                                                            </select>
                                                                                        </div>
                                                                                        {form.watch(`distributions.${index}.payment_mode`) === 'cheque' && (
                                                                                            <div className="space-y-4 pt-4 border-t border-dashed border-slate-200">
                                                                                                <div className="flex items-center justify-between bg-purple-50 p-4 rounded-2xl border border-purple-100">
                                                                                                    <div className="space-y-0.5">
                                                                                                        <Label className="text-[10px] font-black uppercase text-purple-600">Cleared Instantly</Label>
                                                                                                        <p className="text-[9px] text-purple-500 font-bold">Record immediately in ledger</p>
                                                                                                    </div>
                                                                                                    <Switch 
                                                                                                        checked={form.watch(`distributions.${index}.cheque_status`)}
                                                                                                        onCheckedChange={(val) => form.setValue(`distributions.${index}.cheque_status`, val)}
                                                                                                    />
                                                                                                </div>
                                                                                                <div className="grid grid-cols-2 gap-4">
                                                                                                    <div className={cn("space-y-2", form.watch(`distributions.${index}.cheque_status`) ? "col-span-2" : "col-span-1")}>
                                                                                                        <Label className="text-[10px] font-black uppercase text-slate-500">Cheque No</Label>
                                                                                                        <Input {...form.register(`distributions.${index}.cheque_no`)} className="h-11 rounded-xl" />
                                                                                                    </div>
                                                                                                    {!form.watch(`distributions.${index}.cheque_status`) && (
                                                                                                        <div className="space-y-2 animate-in fade-in zoom-in-95">
                                                                                                            <Label className="text-[10px] font-black uppercase text-slate-500">Cheque Date</Label>
                                                                                                            <Input type="date" {...form.register(`distributions.${index}.cheque_date`)} className="h-11 rounded-xl" />
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                                <div className="space-y-2">
                                                                                                    <Label className="text-[10px] font-black uppercase text-slate-500">Party Bank Name</Label>
                                                                                                    <Input {...form.register(`distributions.${index}.bank_name`)} placeholder="e.g. SBI, HDFC" className="h-11 rounded-xl" />
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )}

                                                                                {form.watch(`distributions.${index}.payment_mode`) !== 'credit' && (
                                                                                    <div className="space-y-2 pt-2">
                                                                                        <Label className="text-[10px] font-black uppercase text-slate-500">Amount Received</Label>
                                                                                        <div className="relative">
                                                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">₹</span>
                                                                                            <Input type="number" {...form.register(`distributions.${index}.amount_received`)} className="h-12 pl-8 rounded-2xl font-black text-lg text-green-600 bg-green-50/30 border-green-100" />
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            <div className="space-y-6">
                                                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                                                                    <Tag className="w-3 h-3" /> Item Discounts
                                                                                </h4>

                                                                                <div className="grid grid-cols-2 gap-4">
                                                                                    <FormField
                                                                                        control={form.control}
                                                                                        name={`distributions.${index}.discount_percent`}
                                                                                        render={({ field: f }) => (
                                                                                            <FormItem>
                                                                                                <FormLabel className="text-[10px] font-black uppercase text-slate-500">Discount (%)</FormLabel>
                                                                                                <Input
                                                                                                    type="number"
                                                                                                    {...f}
                                                                                                    onChange={(e) => {
                                                                                                        f.onChange(e);
                                                                                                        const pct = Number(e.target.value) || 0;
                                                                                                        const subtotal = (Number(form.getValues(`distributions.${index}.qty`)) || 0) * (Number(form.getValues(`distributions.${index}.rate`)) || 0);
                                                                                                        const amt = Math.round((subtotal * pct) / 100);
                                                                                                        form.setValue(`distributions.${index}.discount_amount`, amt);
                                                                                                    }}
                                                                                                    className="h-11 rounded-xl font-bold text-emerald-600 bg-emerald-50/30 border-emerald-100"
                                                                                                />
                                                                                            </FormItem>
                                                                                        )}
                                                                                    />
                                                                                    <FormField
                                                                                        control={form.control}
                                                                                        name={`distributions.${index}.discount_amount`}
                                                                                        render={({ field: f }) => (
                                                                                            <FormItem>
                                                                                                <FormLabel className="text-[10px] font-black uppercase text-slate-500">Discount Amt (₹)</FormLabel>
                                                                                                <Input
                                                                                                    type="number"
                                                                                                    {...f}
                                                                                                    onChange={(e) => {
                                                                                                        f.onChange(e);
                                                                                                        const amt = Number(e.target.value) || 0;
                                                                                                        const subtotal = (Number(form.getValues(`distributions.${index}.qty`)) || 0) * (Number(form.getValues(`distributions.${index}.rate`)) || 0);
                                                                                                        if (subtotal > 0) {
                                                                                                            const pct = Number(((amt / subtotal) * 100).toFixed(2));
                                                                                                            form.setValue(`distributions.${index}.discount_percent`, pct);
                                                                                                        } else {
                                                                                                            form.setValue(`distributions.${index}.discount_percent`, 0);
                                                                                                        }
                                                                                                    }}
                                                                                                    className="h-11 rounded-xl font-bold text-emerald-600 bg-emerald-50/30 border-emerald-100"
                                                                                                />
                                                                                            </FormItem>
                                                                                        )}
                                                                                    />
                                                                                </div>

                                                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                                                                    <Calculator className="w-3 h-3" /> Additional Fees & Taxes
                                                                                </h4>
                                                                                
                                                                                <div className="grid grid-cols-2 gap-4">
                                                                                    <div className="space-y-2">
                                                                                        <Label className="text-[10px] font-black uppercase text-slate-500">Loading</Label>
                                                                                        <Input type="number" {...form.register(`distributions.${index}.loading_charges`)} className="h-11 rounded-xl font-bold" />
                                                                                    </div>
                                                                                    <div className="space-y-2">
                                                                                        <Label className="text-[10px] font-black uppercase text-slate-500">Unloading</Label>
                                                                                        <Input type="number" {...form.register(`distributions.${index}.unloading_charges`)} className="h-11 rounded-xl font-bold" />
                                                                                    </div>
                                                                                </div>

                                                                                <div className="space-y-2">
                                                                                    <Label className="text-[10px] font-black uppercase text-slate-500">Other Expenses / Fees</Label>
                                                                                    <Input type="number" {...form.register(`distributions.${index}.other_expenses`)} className="h-12 rounded-2xl font-bold" />
                                                                                </div>

                                                                                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4 shadow-inner">
                                                                                    <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Tax Breakdown</h4>
                                                                                    <div className="space-y-3">
                                                                                        <div className="flex justify-between items-center text-xs font-bold">
                                                                                            <span className="text-slate-500">Market Fee ({taxSettings.market_fee_percent}%)</span>
                                                                                            <span className="bg-white px-3 py-1 rounded-full border border-slate-100 shadow-sm">₹{form.watch(`distributions.${index}.market_fee`)}</span>
                                                                                        </div>
                                                                                        <div className="flex justify-between items-center text-xs font-bold">
                                                                                            <span className="text-slate-500">Nirashrit ({taxSettings.nirashrit_percent}%)</span>
                                                                                            <span className="bg-white px-3 py-1 rounded-full border border-slate-100 shadow-sm">₹{form.watch(`distributions.${index}.nirashrit`)}</span>
                                                                                        </div>
                                                                                        <div className="flex justify-between items-center text-xs font-bold">
                                                                                            <span className="text-slate-500">Misc Fee ({taxSettings.misc_fee_percent}%)</span>
                                                                                            <span className="bg-white px-3 py-1 rounded-full border border-slate-100 shadow-sm">₹{form.watch(`distributions.${index}.misc_fee`)}</span>
                                                                                        </div>
                                                                                        {Number(form.watch(`distributions.${index}.gst_total`)) > 0 && (
                                                                                            <div className="flex justify-between items-center text-xs font-bold border-t border-slate-100 pt-2 text-purple-600">
                                                                                                <span className="uppercase text-[9px] tracking-widest font-black">
                                                                                                    {form.watch(`distributions.${index}.is_igst`) ? 'IGST' : 'CGST + SGST'}
                                                                                                </span>
                                                                                                <span>₹{form.watch(`distributions.${index}.gst_total`)}</span>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                                                                                        <span className="text-[10px] font-black uppercase text-slate-400">Total Tax & GST</span>
                                                                                        <span className="text-lg font-[1000] tracking-tighter">₹{(
                                                                                            Number(form.watch(`distributions.${index}.market_fee`)) + 
                                                                                            Number(form.watch(`distributions.${index}.nirashrit`)) + 
                                                                                            Number(form.watch(`distributions.${index}.misc_fee`)) +
                                                                                            Number(form.watch(`distributions.${index}.gst_total`))
                                                                                        ).toLocaleString()}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <DialogFooter className="p-8 bg-white border-t border-slate-100">
                                                                        <DialogTrigger asChild>
                                                                            <Button className="w-full h-14 rounded-2xl bg-black hover:bg-slate-800 text-white font-black uppercase tracking-widest gap-2 shadow-xl">
                                                                                <CalendarCheck className="w-5 h-5" /> Save Row Details
                                                                            </Button>
                                                                        </DialogTrigger>
                                                                    </DialogFooter>
                                                                </DialogContent>
                                                            </Dialog>
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            <div className="text-sm font-black text-slate-900 leading-tight">
                                                                ₹{Number(form.watch(`distributions.${index}.grand_total`) || 0).toLocaleString()}
                                                            </div>
                                                            {Number(form.watch(`distributions.${index}.qty`) || 0) > 0 && (
                                                                <div className="text-[8px] font-black uppercase text-slate-400 tracking-widest mt-0.5">
                                                                    Avg: ₹{(Number(form.watch(`distributions.${index}.grand_total`) || 0) / Number(form.watch(`distributions.${index}.qty`) || 1)).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            <Button type="button" variant="ghost" onClick={() => remove(index)} className={cn("h-8 w-8 p-0 text-slate-300 hover:text-red-500 rounded-lg", fields.length === 1 && "opacity-0")}>
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Payment Summary Footer */}
                                    <div className="bg-slate-50/50 border-t border-slate-100 p-8 grid grid-cols-1 md:grid-cols-4 gap-8">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                                <Package className="w-3 h-3" /> Item Value
                                            </p>
                                            <p className="text-xl font-black tracking-tighter">
                                                ₹{form.watch("distributions").reduce((sum, d) => sum + (Number(d.qty) * Number(d.rate) || 0), 0).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                                <Landmark className="w-3 h-3" /> Cumulative Taxes
                                            </p>
                                            <p className="text-xl font-black tracking-tighter text-blue-600">
                                                ₹{form.watch("distributions").reduce((sum, d) => sum + (Number(d.market_fee) + Number(d.nirashrit) + Number(d.misc_fee) || 0), 0).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                                <Truck className="w-3 h-3" /> Total Logistics
                                            </p>
                                            <p className="text-xl font-black tracking-tighter text-purple-600">
                                                ₹{form.watch("distributions").reduce((sum, d) => sum + (Number(d.loading_charges) + Number(d.unloading_charges) + Number(d.other_expenses) || 0), 0).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                                <Calculator className="w-3 h-3" /> Final Payable
                                            </p>
                                            <p className="text-2xl font-[1000] tracking-tighter text-green-600">
                                                ₹{form.watch("distributions").reduce((sum, d) => sum + (Number(d.grand_total) || 0), 0).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                                <div className="bg-slate-50 p-8 border-t border-slate-100 flex items-center justify-between mt-auto">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Quantity</p>
                                        <p className="text-3xl font-[1000] tracking-tighter text-black">{totalQtyDistributed.toFixed(2)}</p>
                                    </div>
                                    <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-black px-12 h-14 rounded-2xl shadow-xl gap-3" disabled={isSubmitting || !selectedLot || fields.length === 0 || remainingInLot < 0}>
                                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} CONFIRM BULK SALE
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    </div>
                </form>
            </Form>

            {isSubmitting && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-black">
                    <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] bg-white">
                        <CardHeader className="text-center p-8">
                            <CardTitle className="text-2xl font-[1000] tracking-tighter uppercase">Processing Invoices</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 pt-0 space-y-3 max-h-[400px] overflow-y-auto">
                            {submitResults.map((res, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 text-black">
                                    <div className="flex items-center gap-3">
                                        {res.status === 'pending' && <Loader2 className="w-4 h-4 animate-spin text-purple-600" />}
                                        {res.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                        {res.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                        <span className="text-xs font-black uppercase">{buyers.find(b => b.value === form.getValues(`distributions.${res.index}.buyer_id`))?.label || "Customer"}</span>
                                    </div>
                                    <Badge className={cn("text-[10px] font-black uppercase", res.status === 'success' ? "bg-green-100 text-green-600" : "bg-slate-200 text-slate-500")}>
                                        {res.status}
                                    </Badge>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
