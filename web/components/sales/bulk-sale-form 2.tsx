"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useEffect } from "react";
import { 
    Plus, Trash2, Loader2, User, 
    Package, CheckCircle2, AlertCircle, Save, ArrowLeft,
    Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
    Form, FormControl, FormField, FormItem, 
    FormLabel, FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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

const bulkItemSchema = z.object({
    buyer_id: z.string().min(1, "Buyer required"),
    qty: z.coerce.number().min(0.01, "Qty required"),
    rate: z.coerce.number().min(0.01, "Rate required"),
    loading_charges: z.coerce.number().min(0),
    unloading_charges: z.coerce.number().min(0),
});

const formSchema = z.object({
    lot_id: z.string().min(1, "Select a Lot first"),
    sale_date: z.string().min(1, "Date required"),
    payment_mode: z.string().min(1, "Payment mode required"),
    distributions: z.array(z.object({
        buyer_id: z.string().min(1, "Buyer required"),
        qty: z.coerce.number().min(0.01, "Qty required"),
        rate: z.coerce.number().min(0.01, "Rate required"),
        loading_charges: z.coerce.number().min(0),
        unloading_charges: z.coerce.number().min(0),
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResults, setSubmitResults] = useState<{index: number, status: 'pending' | 'success' | 'error', message?: string}[]>([]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            lot_id: "",
            sale_date: new Date().toISOString().split('T')[0],
            payment_mode: "cash",
            distributions: [{ buyer_id: "", qty: 0, rate: 0, loading_charges: 0, unloading_charges: 0 }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "distributions"
    });

    // Fetch Buyers
    useEffect(() => {
        const fetchBuyers = async () => {
            if (!profile?.organization_id) return;
            const { data } = await supabase
                .from("contacts")
                .select("id, name")
                .eq("organization_id", profile.organization_id)
                .eq("type", "Buyer")
                .order("name");
            if (data) setBuyers(data.map(b => ({ label: b.name, value: b.id })));
        };
        fetchBuyers();
    }, [profile]);

    const handleLotSelect = (lot: any) => {
        setSelectedLot(lot);
        form.setValue("lot_id", lot.id);
        // Pre-fill rate if the lot has a sale_price or suggested price
        if (lot.sale_price) {
            const dists = form.getValues("distributions");
            dists.forEach((_, i) => form.setValue(`distributions.${i}.rate`, lot.sale_price));
        }
    };

    const totalQtyDistributed = form.watch("distributions").reduce((sum, d) => sum + (Number(d.qty) || 0), 0);
    const remainingInLot = selectedLot ? Number(selectedLot.current_qty) - totalQtyDistributed : 0;

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

        setIsSubmitting(true);
        const initialResults = values.distributions.map((_, i) => ({ index: i, status: 'pending' as const }));
        setSubmitResults(initialResults);

        for (let i = 0; i < values.distributions.length; i++) {
            const dist = values.distributions[i];
            
            try {
                const params = {
                    organizationId: profile!.organization_id,
                    buyerId: dist.buyer_id,
                    saleDate: values.sale_date,
                    paymentMode: values.payment_mode,
                    totalAmount: (dist.qty * dist.rate) + Number(dist.loading_charges) + Number(dist.unloading_charges),
                    items: [{
                        item_id: selectedLot.item_id,
                        lot_id: selectedLot.id,
                        qty: dist.qty,
                        rate: dist.rate,
                        amount: dist.qty * dist.rate,
                        unit: selectedLot.unit
                    }],
                    loadingCharges: Number(dist.loading_charges),
                    unloadingCharges: Number(dist.unloading_charges),
                };

                const { error } = await confirmSaleTransactionWithFallback(params);

                if (error) throw error;

                setSubmitResults(prev => prev.map(r => r.index === i ? { ...r, status: 'success' } : r));
            } catch (err: any) {
                console.error(`Error in row ${i}:`, err);
                setSubmitResults(prev => prev.map(r => r.index === i ? { ...r, status: 'error', message: err.message || "Failed" } : r));
            }
        }

        setIsSubmitting(false);
        // We stay on the page if there were errors to show them
        const allSuccess = values.distributions.every((_, i) => 
            submitResults.some(r => r.index === i && r.status === 'success')
        );

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
                        {/* LEFT: Lot Selection */}
                        <div className="col-span-12 lg:col-span-4 space-y-6">
                            <Card className="border-slate-200 shadow-xl rounded-3xl overflow-hidden bg-slate-50/50">
                                <CardHeader className="bg-white border-b border-slate-100">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Step 1: Pick Stock</CardTitle>
                                        {selectedLot && (
                                            <Badge className="bg-purple-50 text-purple-600 border-none text-[9px] font-black uppercase">
                                                Active Lot
                                            </Badge>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-6 space-y-6 text-black">
                                    <LotSelector onSelect={handleLotSelect} selectedLotId={form.watch("lot_id")} />
                                    
                                    {selectedLot && (
                                        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Available Stock</span>
                                                <Badge className="bg-blue-50 text-blue-600 border-blue-100 text-xs font-black px-3 py-1 rounded-full uppercase">
                                                    {selectedLot.current_qty} {selectedLot.unit}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Selected Item</span>
                                                <span className="text-sm font-black text-black uppercase">{selectedLot.items?.name}</span>
                                            </div>
                                            <div className="pt-4 border-t border-slate-100 flex items-center justify-between font-black">
                                                <span className="text-[10px] uppercase text-slate-400 tracking-widest">Remaining After</span>
                                                <span className={cn(
                                                    "text-lg tracking-tighter",
                                                    remainingInLot < 0 ? "text-red-600" : "text-green-600"
                                                )}>
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
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="payment_mode"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Payment Mode</FormLabel>
                                                    <FormControl>
                                                        <select 
                                                            {...field} 
                                                            className="w-full bg-white border border-slate-200 h-11 rounded-xl px-3 font-bold text-sm focus:ring-2 focus:ring-purple-500/20 outline-none"
                                                        >
                                                            <option value="cash">CASH (PAID)</option>
                                                            <option value="credit">UDHAAR (CREDIT)</option>
                                                            <option value="upi">UPI / ONLINE</option>
                                                        </select>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* RIGHT: Distribution Table */}
                        <div className="col-span-12 lg:col-span-8">
                            <Card className="border-slate-200 shadow-xl rounded-3xl overflow-hidden min-h-[500px]">
                                <CardHeader className="bg-white border-b border-slate-100 flex flex-row items-center justify-between">
                                    <div className="space-y-1">
                                        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Step 2: Assign Customers</CardTitle>
                                        <CardDescription className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">List all buyers and their shares from this lot</CardDescription>
                                    </div>
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        onClick={() => append({ buyer_id: "", qty: 1, rate: Number(selectedLot?.sale_price) || 0, loading_charges: 0, unloading_charges: 0 })}
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
                                                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] w-[40%]">Customer / Buyer</th>
                                                    <th className="px-4 py-4 text-center text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Qty</th>
                                                    <th className="px-4 py-4 text-center text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Rate</th>
                                                    <th className="px-4 py-4 text-center text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Ldg</th>
                                                    <th className="px-4 py-4 text-right text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] w-[80px]"></th>
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
                                                                        <SearchableSelect 
                                                                            options={buyers} 
                                                                            value={field.value} 
                                                                            onChange={field.onChange} 
                                                                            placeholder="Select Customer..."
                                                                            className="h-10 rounded-xl"
                                                                        />
                                                                        <FormMessage className="text-[10px]" />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <FormField
                                                                control={form.control}
                                                                name={`distributions.${index}.qty`}
                                                                render={({ field }) => (
                                                                    <FormItem className="space-y-0">
                                                                        <FormControl>
                                                                            <Input type="number" step="0.01" {...field} className="h-10 text-center font-black rounded-xl border-slate-200" />
                                                                        </FormControl>
                                                                        <FormMessage className="text-[10px]" />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <FormField
                                                                control={form.control}
                                                                name={`distributions.${index}.rate`}
                                                                render={({ field }) => (
                                                                    <FormItem className="space-y-0">
                                                                        <FormControl>
                                                                            <Input type="number" step="0.01" {...field} className="h-10 text-center font-black rounded-xl border-slate-200" />
                                                                        </FormControl>
                                                                        <FormMessage className="text-[10px]" />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <FormField
                                                                control={form.control}
                                                                name={`distributions.${index}.loading_charges`}
                                                                render={({ field }) => (
                                                                    <FormItem className="space-y-0">
                                                                        <FormControl>
                                                                            <Input type="number" step="1" {...field} className="h-10 text-center font-bold text-slate-500 rounded-xl border-slate-200" />
                                                                        </FormControl>
                                                                        <FormMessage className="text-[10px]" />
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            <Button 
                                                                type="button" 
                                                                variant="ghost" 
                                                                onClick={() => remove(index)}
                                                                className={cn(
                                                                    "h-8 w-8 p-0 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors",
                                                                    fields.length === 1 && "opacity-0 cursor-default pointer-events-none"
                                                                )}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {fields.length === 0 && (
                                        <div className="p-20 text-center space-y-4">
                                            <Package className="w-12 h-12 text-slate-200 mx-auto" />
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No distribution rows added.</p>
                                        </div>
                                    )}
                                </CardContent>
                                <div className="bg-slate-50 p-8 border-t border-slate-100 flex items-center justify-between mt-auto">
                                    <div className="flex gap-12">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Quantity</p>
                                            <p className="text-3xl font-[1000] tracking-tighter text-black">{totalQtyDistributed.toFixed(2)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Sales Value</p>
                                            <p className="text-3xl font-[1000] tracking-tighter text-purple-600">
                                                ₹ {form.watch("distributions").reduce((sum, d) => sum + (Number(d.qty) * Number(d.rate)), 0).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    <Button 
                                        type="submit" 
                                        className="bg-purple-600 hover:bg-purple-700 text-white font-black px-12 h-14 rounded-2xl shadow-2xl shadow-purple-500/20 gap-3 transition-all active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                                        disabled={isSubmitting || !selectedLot || fields.length === 0 || remainingInLot < 0}
                                    >
                                        {isSubmitting ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <Save className="w-5 h-5" />
                                        )}
                                        CONFIRM BULK SALE
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    </div>
                </form>
            </Form>

            {/* Results Overlay during submission */}
            {isSubmitting && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-md border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] rounded-[2.5rem] bg-white text-black">
                        <CardHeader className="text-center p-8">
                            <CardTitle className="text-2xl font-[1000] tracking-tighter uppercase">Processing <span className="text-purple-600">Invoices</span></CardTitle>
                            <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-500">Generating {fields.length} transactions...</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 pt-0 space-y-3">
                            <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                {submitResults.map((res, i) => {
                                    const dist = form.getValues(`distributions.${res.index}`);
                                    const buyerName = buyers.find(b => b.value === dist.buyer_id)?.label || `Customer ${res.index + 1}`;
                                    return (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                {res.status === 'pending' && <Loader2 className="w-4 h-4 animate-spin text-purple-600" />}
                                                {res.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                                {res.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                                <span className="text-xs font-black uppercase text-black truncate max-w-[150px]">{buyerName}</span>
                                            </div>
                                            <Badge className={cn(
                                                "text-[10px] font-black uppercase rounded-lg border-none px-2 py-0.5",
                                                res.status === 'pending' && "bg-slate-200 text-slate-500",
                                                res.status === 'success' && "bg-green-100 text-green-600",
                                                res.status === 'error' && "bg-red-100 text-red-600"
                                            )}>
                                                {res.status}
                                            </Badge>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
