"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2, ArrowLeft, ArrowDownToLine, ArrowUpToLine, FileText } from "lucide-react";
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
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/components/i18n/language-provider";

const formSchema = z.object({
    note_type: z.enum(["Credit Note", "Debit Note"]),
    contact_id: z.string().min(1, "Party required"),
    reference_invoice_id: z.string().optional(),
    note_date: z.date(),
    amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
    reason: z.string().min(1, "Reason is required")
});

export default function NewCreditNotePage() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { t } = useLanguage();

    const defaultType = searchParams.get('type') === 'Debit' ? 'Debit Note' : 'Credit Note';

    const [parties, setParties] = useState<any[]>([]);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            note_type: defaultType,
            contact_id: "",
            reference_invoice_id: "",
            note_date: new Date(),
            amount: 0,
            reason: ""
        }
    });

    const selectedParty = form.watch('contact_id');
    const selectedType = form.watch('note_type');

    useEffect(() => {
        if (profile?.organization_id) {
            fetchParties();
        }
    }, [profile]);

    useEffect(() => {
        if (selectedParty && profile?.organization_id) {
            fetchInvoices(selectedParty);
        } else {
            setInvoices([]);
            form.setValue('reference_invoice_id', "");
        }
    }, [selectedParty, profile]);

    const fetchParties = async () => {
        const { data } = await supabase
            .from('contacts')
            .select('id, name, type, city')
            .eq('organization_id', profile?.organization_id);
        if (data) setParties(data);
    };

    const fetchInvoices = async (contactId: string) => {
        const { data } = await supabase
            .from('sales')
            .select('id, bill_no, sale_date, total_amount')
            .eq('organization_id', profile?.organization_id)
            .eq('contact_id', contactId)
            .order('sale_date', { ascending: false })
            .limit(50);
        if (data) setInvoices(data);
    };

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsSubmitting(true);
        try {
            if (!profile?.organization_id) {
                throw new Error("User profile not loaded. Please refresh.");
            }

            // Generate Note Number
            const prefix = values.note_type === 'Credit Note' ? 'CN' : 'DN';
            const noteNumber = `${prefix}-${Date.now().toString().slice(-6)}`;

            const insertData = {
                organization_id: profile.organization_id,
                contact_id: values.contact_id,
                reference_invoice_id: values.reference_invoice_id || null,
                note_type: values.note_type,
                note_number: noteNumber,
                note_date: values.note_date.toISOString().split('T')[0],
                amount: values.amount,
                reason: values.reason
            };

            const { error } = await supabase.from('credit_debit_notes').insert(insertData);
            if (error) throw error;

            toast({ title: `${values.note_type} Created`, description: `Successfully created ${noteNumber}` });
            router.push('/credit-notes');

        } catch (e: any) {
            console.error(e);
            toast({ title: "Failed", description: e.message || e.details, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 animate-in fade-in pb-40">
            <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <Button variant="ghost" onClick={() => router.back()} className="mb-4 text-slate-500 font-bold uppercase tracking-wider text-xs">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm ${selectedType === 'Credit Note' ? 'bg-[#0C831F]' : 'bg-orange-500'}`}>
                            {selectedType === 'Credit Note' ? <ArrowDownToLine className="w-5 h-5" /> : <ArrowUpToLine className="w-5 h-5" />}
                        </div>
                        New {selectedType}
                    </h1>
                    <p className="text-slate-500 font-bold mt-2 ml-14">Record financial adjustments for parties.</p>
                </div>

                <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm p-6 md:p-10 relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-full h-1 ${selectedType === 'Credit Note' ? 'bg-[#0C831F]' : 'bg-orange-500'}`} />

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase tracking-[0.2em]">
                                        <FileText className="w-3.5 h-3.5" /> Note Properties
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="note_type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-widest">Type</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="h-12 border-slate-200 font-black text-lg bg-slate-50 rounded-xl shadow-none">
                                                            <SelectValue placeholder="Select type" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-white border-slate-200 rounded-xl">
                                                        <SelectItem value="Credit Note" className="font-bold py-3 text-[#0C831F]">Credit Note (Increase Party Bal)</SelectItem>
                                                        <SelectItem value="Debit Note" className="font-bold py-3 text-orange-600">Debit Note (Decrease Party Bal)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="note_date"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Date</FormLabel>
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
                                    <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase tracking-[0.2em]">
                                        <FileText className="w-3.5 h-3.5" /> Financial Details
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="contact_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-widest">Party</FormLabel>
                                                <FormControl>
                                                    <SearchableSelect
                                                        options={parties.map(p => ({ label: `${p.name} (${p.city || '-'})`, value: p.id }))}
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        placeholder="Select Party..."
                                                        className="h-12 border-slate-200 font-bold bg-slate-50 rounded-xl shadow-none"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="reference_invoice_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Reference Invoice (Optional)</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value} disabled={!selectedParty || invoices.length === 0}>
                                                    <FormControl>
                                                        <SelectTrigger className="h-12 border-slate-200 font-bold bg-slate-50 rounded-xl shadow-none">
                                                            <SelectValue placeholder={!selectedParty ? "Select party first" : "Select reference invoice"} />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-white border-slate-200 rounded-xl">
                                                        <SelectItem value="none" className="text-slate-400 italic">No Reference (Standalone)</SelectItem>
                                                        {invoices.map(inv => (
                                                            <SelectItem key={inv.id} value={inv.id} className="font-bold py-2">
                                                                #{inv.bill_no} - {format(new Date(inv.sale_date), 'dd/MM/yyyy')} (₹{inv.total_amount})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            <hr className="border-slate-100" />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                                <FormField
                                    control={form.control}
                                    name="reason"
                                    render={({ field }) => (
                                        <FormItem className="col-span-1">
                                            <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-widest">Reason / Description</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="e.g., Shortage in delivery, Price discrepancy..."
                                                    className="h-14 border-slate-200 bg-white shadow-inner font-bold rounded-xl text-base"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="amount"
                                    render={({ field }) => (
                                        <FormItem className="col-span-1">
                                            <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-widest flex justify-end">Amount (₹)</FormLabel>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-300">₹</span>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        className="h-14 pl-12 pr-4 text-right border-slate-200 bg-white shadow-inner font-black text-3xl text-slate-900 rounded-xl"
                                                        {...field}
                                                    />
                                                </FormControl>
                                            </div>
                                            <FormMessage className="text-right" />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="pt-6">
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`w-full h-14 text-white font-black text-lg rounded-xl shadow-lg hover:-translate-y-0.5 transition-all ${selectedType === 'Credit Note' ? 'bg-[#0C831F] hover:bg-[#0A6C1A] shadow-green-200' : 'bg-orange-500 hover:bg-orange-600 shadow-orange-200'}`}
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : `SAVE ${selectedType.toUpperCase()}`}
                                </Button>
                            </div>

                        </form>
                    </Form>
                </div>
            </div>
        </div>
    );
}
