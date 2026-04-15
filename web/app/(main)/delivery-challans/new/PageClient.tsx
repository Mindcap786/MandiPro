"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2, ArrowLeft, Plus, Trash2, Truck } from "lucide-react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";

const challanItemSchema = z.object({
    item_id: z.string().min(1, "Item required"),
    quantity_dispatched: z.coerce.number().min(0.01)
});

const formSchema = z.object({
    contact_id: z.string().min(1, "Consignee required"),
    sales_order_id: z.string().optional(),
    challan_date: z.date(),
    vehicle_number: z.string().optional(),
    driver_name: z.string().optional(),
    challan_items: z.array(challanItemSchema).min(1, "Add at least one item")
});

export default function DeliveryChallansNewPageClient() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [parties, setParties] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [salesOrders, setSalesOrders] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<any>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            contact_id: "",
            sales_order_id: "",
            challan_date: new Date(),
            vehicle_number: "",
            driver_name: "",
            challan_items: [{ item_id: "", quantity_dispatched: 1 }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "challan_items"
    });

    const selectedParty = form.watch('contact_id');

    useEffect(() => {
        if (profile?.organization_id) {
            fetchMasters();
        }
    }, [profile]);

    useEffect(() => {
        if (selectedParty && profile?.organization_id) {
            fetchSalesOrders(selectedParty);
        } else {
            setSalesOrders([]);
            form.setValue('sales_order_id', "");
        }
    }, [selectedParty, profile]);

    const fetchMasters = async () => {
        const { data: contactData } = await supabase
            .from('contacts')
            .select('id, name, city')
            .eq('organization_id', profile?.organization_id);
        if (contactData) setParties(contactData);

        const { data: itemData } = await supabase
            .from('items')
            .select('id, name')
            .eq('organization_id', profile?.organization_id);
        if (itemData) setItems(itemData);
    };

    const fetchSalesOrders = async (contactId: string) => {
        const { data } = await supabase
            .from('sales_orders')
            .select('id, order_number, order_date')
            .eq('organization_id', profile?.organization_id)
            .eq('buyer_id', contactId)
            // .neq('status', 'Cancelled') // Could filter by active orders
            .order('order_date', { ascending: false })
            .limit(20);
        if (data) setSalesOrders(data);
    };

    const handleOrderSelect = async (orderId: string) => {
        if (orderId === 'none') {
            form.setValue('sales_order_id', "");
            return;
        }

        form.setValue('sales_order_id', orderId);

        // Pre-fill items from the sales order
        const { data: orderData } = await supabase
            .from('sales_orders')
            .select('*, sales_order_items(*)')
            .eq('id', orderId)
            .single();

        if (orderData && orderData.sales_order_items && orderData.sales_order_items.length > 0) {
            const prefilledItems = orderData.sales_order_items.map((item: any) => ({
                item_id: item.item_id,
                quantity_dispatched: item.quantity
            }));
            form.setValue('challan_items', prefilledItems);

            toast({
                title: "Items Loaded",
                description: `Pre-filled from Order #${orderData.order_number}.`,
            });
        }
    };

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsSubmitting(true);
        try {
            if (!profile?.organization_id) {
                throw new Error("User profile not loaded. Please refresh.");
            }

            // Generate Challan Number
            const challanNumber = `CH-${Date.now().toString().slice(-6)}`;

            // 1. Insert Delivery Challan
            const { data: challanParams, error: challanError } = await supabase
                .from('delivery_challans')
                .insert({
                    organization_id: profile.organization_id,
                    contact_id: values.contact_id,
                    sales_order_id: values.sales_order_id || null,
                    challan_number: challanNumber,
                    challan_date: values.challan_date.toISOString().split('T')[0],
                    vehicle_number: values.vehicle_number || null,
                    driver_name: values.driver_name || null,
                    status: 'Draft'
                })
                .select()
                .single();

            if (challanError) throw challanError;

            // 2. Insert Items
            const itemsToInsert = values.challan_items.map(item => ({
                delivery_challan_id: challanParams.id,
                item_id: item.item_id,
                quantity_dispatched: item.quantity_dispatched,
            }));

            const { error: itemsError } = await supabase
                .from('delivery_challan_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;

            toast({ title: "Challan Created", description: `Successfully created ${challanNumber}` });
            router.push('/delivery-challans');

        } catch (e: any) {
            console.error(e);
            toast({ title: "Failed", description: e.message || e.details, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 animate-in fade-in pb-40">
            <div className="max-w-5xl mx-auto space-y-6">
                <div>
                    <Button variant="ghost" onClick={() => router.back()} className="mb-4 text-slate-500 font-bold uppercase tracking-wider text-xs">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#0C831F] rounded-xl flex items-center justify-center text-white shadow-sm">
                            <Truck className="w-6 h-6" />
                        </div>
                        New Delivery Challan
                    </h1>
                    <p className="text-slate-500 font-bold mt-2 ml-14">Record outward dispatch of goods.</p>
                </div>

                <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-[#0C831F]" />

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 md:p-10 space-y-8">

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-[#0C831F] font-black text-[10px] uppercase tracking-[0.2em] mb-2">
                                        <div className="w-4 h-[1.5px] bg-[#0C831F]" />
                                        Consignee Details
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="contact_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-widest">Consignee / Party</FormLabel>
                                                <FormControl>
                                                    <SearchableSelect
                                                        options={parties.map(p => ({ label: `${p.name} (${p.city || '-'})`, value: p.id }))}
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        placeholder="Select Party..."
                                                        className="h-12 border-slate-200 font-bold bg-slate-50 rounded-xl shadow-none"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="sales_order_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Reference Sales Order</FormLabel>
                                                <Select onValueChange={handleOrderSelect} value={field.value || 'none'} disabled={!selectedParty || salesOrders.length === 0}>
                                                    <FormControl>
                                                        <SelectTrigger className="h-12 border-slate-200 font-bold bg-slate-50 rounded-xl shadow-none">
                                                            <SelectValue placeholder={!selectedParty ? "Select party first" : "Select reference order"} />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-white border-slate-200 rounded-xl">
                                                        <SelectItem value="none" className="text-slate-400 italic">No Reference (Standalone)</SelectItem>
                                                        {salesOrders.map(ord => (
                                                            <SelectItem key={ord.id} value={ord.id} className="font-bold py-2">
                                                                #{ord.order_number} - {format(new Date(ord.order_date), 'dd/MM/yyyy')}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="challan_date"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Dispatch Date</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button
                                                                variant={"outline"}
                                                                className={cn(
                                                                    "h-12 px-4 text-left font-bold border-slate-200 bg-slate-50 text-slate-900 rounded-xl shadow-none hover:bg-slate-100",
                                                                    !field.value && "text-muted-foreground"
                                                                )}
                                                            >
                                                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0 bg-white border-slate-200 rounded-xl shadow-2xl" align="start">
                                                        <Calendar
                                                            mode="single"
                                                            selected={field.value}
                                                            onSelect={field.onChange}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-[#0C831F] font-black text-[10px] uppercase tracking-[0.2em] mb-2">
                                        <div className="w-4 h-[1.5px] bg-[#0C831F]" />
                                        Transport Details
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="vehicle_number"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-widest">Vehicle Number</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="e.g., MH-12-AB-1234"
                                                        className="h-12 border-slate-200 bg-white shadow-inner font-bold uppercase rounded-xl text-base"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="driver_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Driver Name / Phone (Optional)</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="Name & Contact"
                                                        className="h-12 border-slate-200 bg-white shadow-inner font-bold rounded-xl text-base"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            {/* Items Section */}
                            <div className="space-y-0 border border-slate-200 rounded-xl overflow-hidden mt-8 shadow-sm">
                                <div className="bg-slate-900 text-white grid grid-cols-12 gap-4 px-5 py-3">
                                    <span className="col-span-8 text-[9px] font-black uppercase tracking-widest">Description of Goods</span>
                                    <span className="col-span-3 text-[9px] font-black uppercase tracking-widest text-center">Dispatch Qty</span>
                                </div>

                                <div className="divide-y divide-slate-100">
                                    {fields.map((field, index) => {
                                        return (
                                            <div key={field.id} className="grid grid-cols-12 gap-4 items-center px-5 py-3 hover:bg-slate-50/50 transition-colors group relative">
                                                <div className="col-span-8">
                                                    <FormField
                                                        control={form.control}
                                                        name={`challan_items.${index}.item_id`}
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

                                                <div className="col-span-3">
                                                    <FormField
                                                        control={form.control}
                                                        name={`challan_items.${index}.quantity_dispatched`}
                                                        render={({ field }) => (
                                                            <Input type="number" {...field}
                                                                className="bg-transparent border-slate-200 border-2 h-10 text-slate-900 font-black text-center rounded-lg shadow-none focus:border-[#0C831F]" />
                                                        )}
                                                    />
                                                </div>

                                                <div className="col-span-1 flex items-center justify-end">
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
                                        onClick={() => append({ item_id: "", quantity_dispatched: 1 })}
                                        className="text-[#0C831F] font-black uppercase text-[10px] tracking-widest hover:bg-green-50 w-full rounded-xl"
                                    >
                                        <Plus className="w-3.5 h-3.5 mr-2" /> Append New Item
                                    </Button>
                                </div>
                            </div>

                            <div className="pt-6">
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full h-14 bg-[#0C831F] hover:bg-[#0A6C1A] text-white font-black text-lg rounded-xl shadow-lg shadow-green-200 hover:-translate-y-0.5 transition-all"
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : `SAVE CHALLAN`}
                                </Button>
                            </div>

                        </form>
                    </Form>
                </div>
            </div>
        </div>
    );
}
