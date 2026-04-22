"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Loader2, Search, User, FileText, ArrowLeft, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { useLanguage } from "@/components/i18n/language-provider";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useRouter } from "next/navigation";

const saleOrderItemSchema = z.object({
    item_id: z.string().min(1, "Item required"),
    quantity: z.coerce.number().min(1),
    unit_price: z.coerce.number().min(0),
    total_price: z.coerce.number().min(0)
});

const formSchema = z.object({
    order_date: z.date(),
    buyer_id: z.string().min(1, "Buyer required"),
    notes: z.string().optional(),
    order_items: z.array(saleOrderItemSchema).min(1, "Add items to order"),
});

export default function SalesOrdersNewPageClient() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const { t } = useLanguage();

    const [buyers, setBuyers] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<any>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            order_date: new Date(),
            buyer_id: "",
            notes: "",
            order_items: [{ item_id: "", quantity: 1, unit_price: 0, total_price: 0 }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "order_items"
    });

    useEffect(() => {
        if (profile?.organization_id) {
            fetchMasters();
        }
    }, [profile]);

    const fetchMasters = async () => {
        // Buyers
        const { data: buyerData } = await supabase
            .from('contacts')
            .select('id, name, city')
            .eq('organization_id', profile?.organization_id)
            .eq('contact_type', 'buyer');
        if (buyerData) setBuyers(buyerData);

        // Items
        const { data: itemData } = await supabase
            .from('commodities')
            .select('id, name')
            .eq('organization_id', profile?.organization_id);
        if (itemData) setItems(itemData);
    };

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsSubmitting(true);
        try {
            if (!profile?.organization_id) {
                throw new Error("User profile not loaded. Please refresh.");
            }

            const totalAmount = values.order_items.reduce((sum, i) => sum + i.total_price, 0);

            // Generate order number (simple approach, better to do in DB)
            const orderNumber = `SO-${Date.now().toString().slice(-6)}`;

            // 1. Insert Sales Order
            const { data: orderParams, error: orderError } = await supabase
                .from('sales_orders')
                .insert({
                    organization_id: profile.organization_id,
                    buyer_id: values.buyer_id,
                    order_number: orderNumber,
                    order_date: values.order_date.toISOString().split('T')[0],
                    total_amount: totalAmount,
                    notes: values.notes || null,
                    status: 'Draft'
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // 2. Insert Items
            const itemsToInsert = values.order_items.map(item => ({
                sales_order_id: orderParams.id,
                item_id: item.item_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.total_price
            }));

            const { error: itemsError } = await supabase
                .from('sales_order_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;

            toast({ title: "Sales Order Created", description: `Order ${orderNumber} saved successfully.` });
            router.push('/sales-orders');

        } catch (e: any) {
            console.error(e);
            toast({ title: "Failed to create order", description: e.message || e.details, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 animate-in fade-in pb-40">
            <div className="max-w-7xl mx-auto space-y-6">
                <div>
                    <Button variant="ghost" onClick={() => router.back()} className="mb-4 text-slate-500 font-bold uppercase tracking-wider text-xs">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#0C831F] rounded-xl flex items-center justify-center text-white shadow-sm">
                            <Plus className="w-6 h-6" />
                        </div>
                        {t('sales_orders.new_order') || 'Create Sales Order'}
                    </h1>
                    <p className="text-slate-500 font-bold mt-2 ml-14">Draft a quote or order before invoicing.</p>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="bg-[#FCFCFC] border-2 border-slate-200 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.05)] relative overflow-hidden w-full max-w-7xl mx-auto">
                            {/* Decorative Top Bar */}
                            <div className="h-1 bg-[#0C831F] w-full" />

                            <div className="p-6 md:p-8">
                                {/* Header Area */}
                                <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8 border-b border-slate-100 pb-6">
                                    <div className="space-y-0.5">
                                        <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
                                            <div className="w-8 h-8 bg-[#0C831F] rounded flex items-center justify-center text-white">
                                                <ClipboardList className="w-5 h-5" />
                                            </div>
                                            SALES ORDER
                                        </h2>
                                        <p className="text-slate-400 font-bold tracking-[0.2em] uppercase text-[9px] ml-1">
                                            Proforma / Quote • Mandi Pro
                                        </p>
                                    </div>

                                    <div className="text-right flex flex-col md:flex-row items-end md:items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
                                        <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg flex flex-col items-start min-w-[180px]">
                                            <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-0.5">Order Date</div>
                                            <FormField
                                                control={form.control}
                                                name="order_date"
                                                render={({ field }) => (
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <Button variant="ghost" className="p-0 h-auto font-black text-slate-900 hover:bg-transparent text-base">
                                                                {field.value ? format(field.value, "PPP") : "Select Date"}
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0 bg-white border-slate-200 shadow-2xl" align="end">
                                                            <Calendar
                                                                mode="single"
                                                                selected={field.value}
                                                                onSelect={field.onChange}
                                                                initialFocus
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                )}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Party Details */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-[#0C831F] font-black text-[10px] uppercase tracking-[0.2em] mb-2">
                                            <div className="w-4 h-[1.5px] bg-[#0C831F]" />
                                            Order For (Buyer)
                                        </div>
                                        <FormField
                                            control={form.control}
                                            name="buyer_id"
                                            render={({ field }) => (
                                                <div className="space-y-2">
                                                    <div className="flex gap-2">
                                                        <div className="flex-1">
                                                            <SearchableSelect
                                                                options={(buyers || []).map(b => ({ label: `${b?.name || 'Unknown Buyer'} (${b?.city || '-'})`, value: b?.id || '' }))}
                                                                value={field.value}
                                                                onChange={field.onChange}
                                                                placeholder="Select Buyer/Customer"
                                                                searchPlaceholder="Search buyer database..."
                                                                className="bg-transparent border-t-0 border-l-0 border-r-0 border-b-2 border-slate-100 rounded-none h-10 text-xl font-black text-slate-900 focus:border-[#0C831F] transition-all shadow-none px-0"
                                                            />
                                                        </div>
                                                        <ContactDialog onSuccess={fetchMasters}>
                                                            <Button type="button" size="icon" className="h-10 w-10 rounded-lg bg-slate-900 text-white hover:bg-[#0C831F] transition-all shadow-sm">
                                                                <Plus className="w-5 h-5" />
                                                            </Button>
                                                        </ContactDialog>
                                                    </div>
                                                    {field.value && (
                                                        <div className="text-slate-400 text-xs font-medium italic">
                                                            {buyers.find(b => b.id === field.value)?.city || 'Location not specified'}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        />
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-[#0C831F] font-black text-[10px] uppercase tracking-[0.2em] mb-2">
                                            <div className="w-4 h-[1.5px] bg-[#0C831F]" />
                                            Notes / Terms
                                        </div>
                                        <FormField
                                            control={form.control}
                                            name="notes"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Input
                                                            {...field}
                                                            placeholder="Delivery instructions, validity, etc."
                                                            className="bg-transparent border-t-0 border-l-0 border-r-0 border-b-2 border-slate-100 rounded-none h-10 text-base font-bold text-slate-900 focus:border-[#0C831F] transition-all shadow-none px-0"
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>

                                {/* Items Section - Compact Table */}
                                <div className="space-y-0 border border-slate-200 rounded-xl overflow-hidden mb-8 shadow-sm">
                                    <div className="bg-slate-900 text-white grid grid-cols-12 gap-4 px-5 py-3">
                                        <span className="col-span-5 text-[9px] font-black uppercase tracking-widest">Description of Goods</span>
                                        <span className="col-span-2 text-[9px] font-black uppercase tracking-widest text-center">Qty</span>
                                        <span className="col-span-2 text-[9px] font-black uppercase tracking-widest text-center">Unit Price (₹)</span>
                                        <span className="col-span-3 text-[9px] font-black uppercase tracking-widest text-right">Ext. Amount</span>
                                    </div>

                                    <div className="divide-y divide-slate-100">
                                        {fields.map((field, index) => {
                                            return (
                                                <div key={field.id} className="grid grid-cols-12 gap-4 items-center px-5 py-3 hover:bg-slate-50/50 transition-colors group relative">
                                                    <div className="col-span-5">
                                                        <FormField
                                                            control={form.control}
                                                            name={`order_items.${index}.item_id`}
                                                            render={({ field }) => (
                                                                <SearchableSelect
                                                                    options={(items || []).map(i => ({ label: i?.name || 'Unknown Item', value: i?.id || '' }))}
                                                                    value={field.value}
                                                                    onChange={field.onChange}
                                                                    placeholder="Select Item"
                                                                    className="bg-transparent border-none text-slate-800 font-bold h-auto p-0 text-sm shadow-none focus:ring-0"
                                                                />
                                                            )}
                                                        />
                                                    </div>

                                                    <div className="col-span-2">
                                                        <FormField
                                                            control={form.control}
                                                            name={`order_items.${index}.quantity`}
                                                            render={({ field }) => (
                                                                <Input type="number" {...field}
                                                                    onChange={e => {
                                                                        field.onChange(e);
                                                                        const rate = form.getValues(`order_items.${index}.unit_price`);
                                                                        form.setValue(`order_items.${index}.total_price`, Number(e.target.value) * rate);
                                                                    }}
                                                                    className="bg-transparent border-slate-200 border-2 h-10 text-slate-900 font-black text-center rounded-lg shadow-none focus:border-[#0C831F]" />
                                                            )}
                                                        />
                                                    </div>

                                                    <div className="col-span-2">
                                                        <FormField
                                                            control={form.control}
                                                            name={`order_items.${index}.unit_price`}
                                                            render={({ field }) => (
                                                                <div className="relative">
                                                                    <Input type="number" {...field}
                                                                        onChange={e => {
                                                                            field.onChange(e);
                                                                            const qty = form.getValues(`order_items.${index}.quantity`);
                                                                            form.setValue(`order_items.${index}.total_price`, Number(e.target.value) * qty);
                                                                        }}
                                                                        className="bg-transparent border-slate-200 border-2 h-10 text-slate-900 font-black text-center rounded-lg shadow-none focus:border-[#0C831F] pl-4" />
                                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-black">₹</span>
                                                                </div>
                                                            )}
                                                        />
                                                    </div>

                                                    <div className="col-span-3 flex items-center justify-end gap-3">
                                                        <div className="font-bold text-slate-800 text-sm">
                                                            ₹{form.watch(`order_items.${index}.total_price`)?.toLocaleString() || 0}
                                                        </div>
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all h-8 w-8">
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="border-t border-slate-100 p-4 bg-slate-50/30">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => append({ item_id: "", quantity: 1, unit_price: 0, total_price: 0 })}
                                            className="text-[#0C831F] font-black uppercase text-[10px] tracking-widest hover:bg-green-50 w-full rounded-xl"
                                        >
                                            <Plus className="w-3.5 h-3.5 mr-2" /> Append New Item Row
                                        </Button>
                                    </div>
                                </div>

                                {/* Summary Block - Compact */}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                                    <div className="md:col-span-7 space-y-6">
                                        <div className="text-slate-400 text-[9px] font-medium leading-relaxed max-w-sm mt-8">
                                            * This is a quotation/order. No ledger entries or stock deductions are made until converted to an invoice.
                                        </div>
                                    </div>

                                    <div className="md:col-span-5 relative">
                                        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg relative z-10">
                                            {(() => {
                                                const items = form.watch('order_items') || [];
                                                const safeItems = Array.isArray(items) ? items : [];
                                                const grandTotal = safeItems.reduce((sum, i) => sum + (Number(i?.total_price) || 0), 0);

                                                return (
                                                    <>
                                                        <div className="pt-2 mb-6 text-right">
                                                            <div className="text-[9px] font-black tracking-[0.3em] uppercase text-slate-400 mb-1">Total Order Value</div>
                                                            <div className="text-4xl font-black tracking-tight leading-none text-[#0C831F]">
                                                                ₹{grandTotal.toLocaleString()}
                                                            </div>
                                                        </div>
                                                    </>
                                                );
                                            })()}

                                            <Button type="submit" disabled={isSubmitting} className="w-full h-12 bg-white text-slate-900 font-black text-base rounded-xl hover:bg-slate-900 hover:text-white transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm border border-slate-200">
                                                {isSubmitting ? <Loader2 className="animate-spin" /> : (
                                                    <>
                                                        SAVE ORDER <ArrowLeft className="w-4 h-4 rotate-180" />
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                        {/* Decorative Effect */}
                                        <div className="absolute top-2 -right-2 w-full h-full bg-slate-100 rounded-2xl -z-10" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </Form>
            </div>
        </div>
    );
}
