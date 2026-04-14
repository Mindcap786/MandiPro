"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

const formSchema = z.object({
    party_id: z.string().min(1, "Select a party"),
    amount: z.coerce.number().min(1, "Amount must be > 0"),
    payment_mode: z.enum(["cash", "upi_bank", "cheque"]),
    payment_date: z.date(),
    invoice_id: z.string().optional(),  // ✅ NEW: Which invoice is this payment for?
    remarks: z.string().optional(),
    cheque_no: z.string().optional(),
    bank_name: z.string().optional(),
    cheque_date: z.date().optional(),
    advance_cheque_status: z.boolean().optional(),
});

export function NewReceiptDialog({ onSuccess }: { onSuccess?: () => void }) {
    const { profile } = useAuth();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [parties, setParties] = useState<any[]>([]);
    const [invoices, setInvoices] = useState<any[]>([]);  // ✅ NEW: Track unpaid invoices
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);  // ✅ NEW

    const form = useForm<any>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            payment_date: new Date(),
            payment_mode: "cash",
            amount: 0,
            advance_cheque_status: false,
            invoice_id: "",  // ✅ NEW
        },
    });

    useEffect(() => {
        if (open && profile?.organization_id) {
            fetchParties();
        }
    }, [open, profile]);

    // ✅ NEW: Fetch unpaid invoices when party is selected
    useEffect(() => {
        if (selectedPartyId && profile?.organization_id) {
            fetchUnpaidInvoices(selectedPartyId);
        }
    }, [selectedPartyId, profile?.organization_id]);

    const fetchParties = async () => {
        // Fetch users who owe money? For now fetch all buyers/farmers
        const { data } = await supabase
            .schema('mandi')
            .from('contacts')
            .select('id, name, type, city')
            .eq('organization_id', profile?.organization_id);
        if (data) setParties(data);
    };

    // ✅ NEW: Fetch unpaid invoices for selected party
    const fetchUnpaidInvoices = async (partyId: string) => {
        try {
            const { data } = await supabase
                .schema('mandi')
                .from('sales')
                .select('id, bill_no, total_amount_inc_tax, payment_status, created_at')
                .eq('buyer_id', partyId)
                .eq('organization_id', profile?.organization_id)
                .in('payment_status', ['pending', 'partial'])
                .order('created_at', { ascending: false });
            
            if (data) setInvoices(data);
            else setInvoices([]);
        } catch (error) {
            console.error('Error fetching invoices:', error);
            setInvoices([]);
        }
    };

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsSubmitting(true);
        try {
            // ✅ Call new record_payment RPC with invoice_id
            const { data, error } = await supabase
                .schema('mandi')
                .rpc('record_payment', {
                    p_organization_id: profile?.organization_id,
                    p_party_id: values.party_id,
                    p_amount: values.amount,
                    p_date: values.payment_date.toISOString().split('T')[0],  // Date format
                    p_mode: values.payment_mode === 'upi_bank' ? 'bank' : values.payment_mode,
                    p_invoice_id: values.invoice_id || null,  // ✅ Invoice linkage
                    p_remarks: values.remarks || null,
                    p_cheque_no: values.payment_mode === 'cheque' ? values.cheque_no : null,
                    p_cheque_date: (values.payment_mode === 'cheque' && values.cheque_date) 
                        ? values.cheque_date.toISOString().split('T')[0] 
                        : null,
                    p_bank_name: values.payment_mode === 'cheque' ? values.bank_name : null,
                });

            if (error) {
                console.error('RPC Error:', error);
                throw error;
            }

            const linkedInvoice = data?.[0]?.linked_invoice_bill_no;
            const message = linkedInvoice && linkedInvoice !== 'Advance Payment'
                ? `Payment received for Invoice #${linkedInvoice}`
                : 'Advance payment recorded successfully';

            toast({ 
                title: "Payment Received", 
                description: message 
            });
            setOpen(false);
            form.reset();
            setSelectedPartyId(null);  // ✅ Reset selected party
            setInvoices([]);  // ✅ Reset invoices
            onSuccess?.();

        } catch (e: any) {
            console.error('Payment error:', e);
            toast({ 
                title: "Error", 
                description: e.message || "Failed to record payment", 
                variant: "destructive" 
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="h-10 bg-neon-green text-black font-bold hover:bg-neon-green/90">
                    + Receive Payment
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-950 border-white/10 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase tracking-widest text-white">Receive Money</DialogTitle>
                    <DialogDescription className="text-gray-500">
                        Record a payment from a Buyer or Farmer.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">

                        <FormField
                            control={form.control}
                            name="party_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-gray-400">Received From</FormLabel>
                                    <Select 
                                        onValueChange={(value) => {
                                            field.onChange(value);
                                            setSelectedPartyId(value);  // ✅ Track selection
                                            form.setValue('invoice_id', '');  // ✅ Reset invoice
                                        }} 
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="bg-white/5 border-white/10 h-10 text-white">
                                                <SelectValue placeholder="Select Party" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-[#0A0A12] border-white/10 text-white max-h-[300px]">
                                            {parties.map((p) => (
                                                <SelectItem
                                                    key={p.id}
                                                    value={p.id}
                                                    className="focus:bg-white/10 focus:text-white cursor-pointer py-3"
                                                >
                                                    <span className="font-bold text-white">{p.name}</span>
                                                    <span className="ml-2 text-xs text-neon-blue font-mono uppercase tracking-wider bg-neon-blue/10 px-1 py-0.5 rounded">
                                                        {p.type}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* ✅ NEW: Invoice Selection Field */}
                        {selectedPartyId && invoices.length > 0 && (
                            <FormField
                                control={form.control}
                                name="invoice_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-gray-400">
                                            Payment For (Optional)
                                        </FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || ""}>
                                            <FormControl>
                                                <SelectTrigger className="bg-white/5 border-white/10 h-10 text-white">
                                                    <SelectValue placeholder="Link to invoice (or leave to record as advance)" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-[#0A0A12] border-white/10 text-white">
                                                <SelectItem value="" className="text-gray-400">
                                                    No invoice (Advance Payment)
                                                </SelectItem>
                                                {invoices.map((inv) => (
                                                    <SelectItem 
                                                        key={inv.id} 
                                                        value={inv.id}
                                                        className="focus:bg-white/10 focus:text-white cursor-pointer py-2"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold">Inv #{inv.bill_no}</span>
                                                            <span className="text-xs text-neon-green">₹{inv.total_amount_inc_tax}</span>
                                                            <span className="text-xs px-1 py-0.5 rounded bg-amber-500/10 text-amber-400">
                                                                {inv.payment_status}
                                                            </span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {invoices.length} unpaid invoice{invoices.length !== 1 ? 's' : ''} found
                                        </p>
                                    </FormItem>
                                )}
                            />
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="amount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-gray-400">Amount (₹)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} className="bg-white/5 border-white/10 h-10 text-white font-bold text-lg" />
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
                                        <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-gray-400">Mode</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-white/5 border-white/10 h-10 text-white">
                                                    <SelectValue placeholder="Mode" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-zinc-900 border-white/10 text-white">
                                                <SelectItem value="cash">Cash</SelectItem>
                                                <SelectItem value="upi_bank">UPI / BANK</SelectItem>
                                                <SelectItem value="cheque">Cheque</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="payment_date"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-gray-400">Date</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full pl-3 text-left font-normal bg-white/5 border-white/10 text-white hover:bg-white/10",
                                                        !field.value && "text-muted-foreground"
                                                    )}
                                                >
                                                    {field.value ? (
                                                        format(field.value, "PPP")
                                                    ) : (
                                                        <span>Pick a date</span>
                                                    )}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 bg-zinc-900 border-white/10 text-white" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={field.value}
                                                onSelect={field.onChange}
                                                disabled={(date) =>
                                                    date > new Date() || date < new Date("1900-01-01")
                                                }
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {form.watch('payment_mode') === 'cheque' && (
                            <div className="space-y-4 pt-2 border-t border-white/5 animate-in fade-in slide-in-from-top-2">
                                <FormField
                                    control={form.control}
                                    name="advance_cheque_status"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center justify-between col-span-2 bg-white/5 p-3 rounded-xl border border-white/10 shadow-sm">
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck className={cn("w-4 h-4", field.value ? "text-emerald-500" : "text-amber-500")} />
                                                <span className={cn("text-[10px] font-black uppercase tracking-widest", field.value ? "text-emerald-400" : "text-amber-400")}>
                                                    {field.value ? 'Cleared Instantly' : 'Clear Later'}
                                                </span>
                                            </div>
                                            <FormControl>
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                    className="data-[state=checked]:bg-emerald-600"
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="cheque_no"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="uppercase text-[8px] font-bold text-gray-500">Cheque No</FormLabel>
                                                <FormControl>
                                                    <Input {...field} className="bg-white/5 border-white/10 h-8 text-white text-xs" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="bank_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="uppercase text-[8px] font-bold text-gray-500">Bank Name</FormLabel>
                                                <FormControl>
                                                    <Input {...field} className="bg-white/5 border-white/10 h-8 text-white text-xs" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                {!form.watch('advance_cheque_status') && (
                                    <FormField
                                        control={form.control}
                                        name="cheque_date"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel className="uppercase text-[8px] font-bold text-gray-500">Clearing Date</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button
                                                                variant={"outline"}
                                                                className={cn(
                                                                    "w-full h-8 pl-3 text-left font-normal bg-white/5 border-white/10 text-white text-xs",
                                                                    !field.value && "text-muted-foreground"
                                                                )}
                                                            >
                                                                {field.value ? format(field.value, "PP") : <span>Pick date</span>}
                                                                <CalendarIcon className="ml-auto h-3 w-3 opacity-50" />
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0 bg-zinc-900 border-white/10" align="start">
                                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                                    </PopoverContent>
                                                </Popover>
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>
                        )}

                        <FormField
                            control={form.control}
                            name="remarks"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-gray-400">Remarks (Optional)</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="Notes..." className="bg-white/5 border-white/10 h-10 text-white" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button type="submit" disabled={isSubmitting} className="w-full h-12 bg-neon-green text-black font-black text-lg hover:bg-neon-green/90 mt-4 rounded-xl">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'CONFIRM RECEIPT'}
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
