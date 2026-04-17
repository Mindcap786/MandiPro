"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useEnterToTab } from "@/hooks/use-enter-to-tab";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2, ArrowUpRight, Zap, Landmark, QrCode } from "lucide-react";
import { QRCodeSVG } from 'qrcode.react';
import { Switch } from "@/components/ui/switch";
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
import { useFieldGovernance } from "@/hooks/useFieldGovernance";
import { formatCurrency, roundTo2 } from "@/lib/accounting-logic";

const formSchema = z.object({
    party_id: z.string().min(1, "Select who to pay"),
    amount: z.coerce.number().min(0, "Amount must be positive"),
    payment_mode: z.enum(["cash", "bank", "upi", "cheque"]),
    payment_date: z.date(),
    remarks: z.string().optional(),
    discount: z.coerce.number().optional().default(0),
    cheque_no: z.string().optional(),
    cheque_date: z.date().optional(),
    bank_name: z.string().optional()
}).refine((data) => data.amount > 0 || data.discount > 0, {
    message: "Either Amount or Discount must be greater than 0",
    path: ["amount"],
});

export function NewPaymentDialog({ onSuccess, defaultOpen, onOpenChange, initialValues, mode = 'payment', children, preLoadedContacts = [] }: {
    onSuccess?: () => void,
    defaultOpen?: boolean,
    onOpenChange?: (open: boolean) => void,
    initialValues?: { party_id?: string, amount?: number, remarks?: string, invoice_id?: string, lot_id?: string, arrival_id?: string, currentBalance?: number },
    mode?: 'payment' | 'receipt',
    children?: React.ReactNode,
    preLoadedContacts?: any[]
}) {
    const { profile } = useAuth();
    const { toast } = useToast();
    const formRef = useRef<HTMLFormElement>(null);
    useEnterToTab(formRef);

    const [internalOpen, setInternalOpen] = useState(false);
    const open = defaultOpen !== undefined ? defaultOpen : internalOpen;
    const setOpen = onOpenChange || setInternalOpen;

    const [contacts, setContacts] = useState<any[]>(preLoadedContacts);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingContacts, setLoadingContacts] = useState(false);
    const [openParty, setOpenParty] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Sync preLoadedContacts
    useEffect(() => {
        if (preLoadedContacts?.length > 0) {
            setContacts(preLoadedContacts);
        }
    }, [preLoadedContacts]);

    const { isVisible, isMandatory, getLabel } = useFieldGovernance('payments');

    const [currentBalance, setCurrentBalance] = useState<number | null>(null);
    const [invoiceBalance, setInvoiceBalance] = useState<{ total: number, paid: number, due: number } | null>(null);
    const [invoiceId, setInvoiceId] = useState<string | null>(null);
    const [lotId, setLotId] = useState<string | null>(null);
    const [arrivalId, setArrivalId] = useState<string | null>(null);
    const [instantClear, setInstantClear] = useState(false);  // ← cheque cleared immediately

    // Bank account management
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [defaultBankId, setDefaultBankId] = useState<string | null>(null);
    const [selectedBankId, setSelectedBankId] = useState<string | null>(null);

    // Dynamic Labels based on mode
    const isReceipt = mode === 'receipt';
    const actionLabel = isReceipt ? "Receive Payment" : "Make Payment";
    const partyLabel = isReceipt ? "Received From" : "Paid To";
    const amountLabel = isReceipt ? "Received Amount (₹)" : "Paid Amount (₹)";
    const themeColor = isReceipt ? "text-emerald-600" : "text-rose-600";
    const buttonBg = isReceipt ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700";

    // Using 'any' to avoid the Zod/React-Hook-Form type conflict we saw earlier
    const form = useForm<any>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            payment_date: new Date(),
            payment_mode: initialValues?.invoice_id ? "bank" : "cash", // Smart default: invoices usually via bank
            amount: initialValues?.amount || 0,
            party_id: initialValues?.party_id || "",
            remarks: initialValues?.remarks || "",
        },
    });


    // Fetch Balance when Party Selected
    const selectedPartyId = form.watch('party_id');
    useEffect(() => {
        if (selectedPartyId && profile?.organization_id) {
            // First let's check if we have a manually injected isolated balance 
            if (open && initialValues && 'currentBalance' in initialValues && selectedPartyId === initialValues.party_id) {
                setCurrentBalance(initialValues.currentBalance as number);
            } else {
                fetchPartyBalance(selectedPartyId);
            }
            if (invoiceId) fetchInvoiceBalance(invoiceId);
        } else {
            setCurrentBalance(null);
            setInvoiceBalance(null);
        }
    }, [selectedPartyId, profile, invoiceId, open, initialValues]);

    const fetchInvoiceBalance = async (id: string) => {
        try {
            const schema = 'mandi';
            const { data, error } = await supabase.schema(schema).rpc('get_invoice_balance', { p_invoice_id: id });
            if (data && data.length > 0 && !error) {
                const b = data[0];
                setInvoiceBalance({
                    total: Number(b.total_amount),
                    paid: Number(b.amount_paid),
                    due: Number(b.balance_due)
                });
            }
        } catch (e) {
            console.error("Fetch Invoice Balance Error:", e);
        }
    };

    const fetchPartyBalance = async (partyId: string) => {
        const schema = 'mandi';
        try {
            // Calculate net balance from ledger_entries (no view_party_balances in DB)
            const { data, error } = await supabase
                .schema(schema)
                .from('ledger_entries')
                .select('debit, credit')
                .eq('organization_id', profile?.organization_id)
                .eq('contact_id', partyId);

            if (error) throw error;

            if (data && data.length > 0) {
                // Standard Accounting: Credit - Debit (Positive = Liability = To Pay)
                const net = data.reduce((sum: number, e: any) => sum + Number(e.credit || 0) - Number(e.debit || 0), 0);
                setCurrentBalance(roundTo2(net));
            } else {
                setCurrentBalance(0);
            }
        } catch (err: any) {
            console.error("Fetch Party Balance Error:", err);
        }
    }

    const fetchContacts = async () => {
        if (!profile?.organization_id) return
        setLoadingContacts(true)
        const schema = 'mandi';
        try {
            const { data, error } = await supabase
                .schema(schema)
                .from('contacts')
                .select('id, name, type, city')
                .eq('organization_id', profile?.organization_id)
                .neq('status', 'deleted')
            if (error) throw error
            if (data) setContacts(data)
        } catch (err) {
            console.error("Fetch Contacts Error:", err)
        } finally {
            setLoadingContacts(false)
        }
    };

    // Fetch contacts when dialog opens
    useEffect(() => {
        if (open && profile?.organization_id && contacts.length === 0) {
            fetchContacts();
        }
    }, [open, profile]);

    // Fetch bank accounts
    const fetchBankAccounts = async () => {
        if (!profile?.organization_id) return;
        const schema = 'mandi';
        try {
            const { data, error } = await supabase
                .schema(schema)
                .from('accounts')
                .select('id, name, description, is_default')
                .eq('organization_id', profile.organization_id)
                .eq('account_sub_type', 'bank')
                .eq('type', 'asset')
                .eq('is_active', true)
                .order('created_at');

            if (error) throw error;

            if (data) {
                const filtered = data.filter(b => 
                    !b.name.toLowerCase().includes('cheques in hand') && 
                    !b.name.toLowerCase().includes('transit')
                );
                setBankAccounts(filtered);
                const def = filtered.find((b: any) => b.is_default);
                const defId = def?.id || filtered[0]?.id || null;
                setDefaultBankId(defId);
            }
        } catch (err: any) {
            console.error("Fetch Bank Accounts Error:", err);
        }
    };

    useEffect(() => {
        if (open && profile?.organization_id) {
            fetchBankAccounts();
        }
    }, [open, profile]);

    // Auto-select default bank when UPI/BANK mode is chosen
    const watchedPaymentMode = form.watch('payment_mode');
    useEffect(() => {
        if (['bank', 'upi', 'cheque'].includes(watchedPaymentMode) && defaultBankId) {
            // Only set if not already selected to avoid overwriting user choice if mode toggles
            if (!selectedBankId) setSelectedBankId(defaultBankId);
        } else if (!['bank', 'upi', 'cheque'].includes(watchedPaymentMode)) {
            setSelectedBankId(null);
        }
    }, [watchedPaymentMode, defaultBankId, selectedBankId]);

    // Set form values when dialog opens with initialValues
    // Use a ref to prevent redundant resets which could cause infinite loops
    const initialResetDone = useRef(false);
    useEffect(() => {
        if (open) {
            if (initialValues && !initialResetDone.current) {
                console.log("NewPaymentDialog Open with InitialValues:", initialValues);
                form.reset({
                    party_id: initialValues.party_id || '',
                    amount: roundTo2(initialValues.amount || 0),
                    remarks: initialValues.remarks || '',
                    payment_date: new Date(),
                    payment_mode: 'cash',
                    discount: 0,
                });
                const invId = initialValues.invoice_id || null;
                const lId = initialValues.lot_id || null;
                const aId = initialValues.arrival_id || null;
                setInvoiceId(invId);
                setLotId(lId);
                setArrivalId(aId);
                if (invId) {
                    fetchInvoiceBalance(invId);
                }
                initialResetDone.current = true;
            } else if (!initialValues) {
                // If opening fresh without initialValues, we might want to reset to defaults
                // but only once per open
                if (!initialResetDone.current) {
                    form.reset({
                        payment_date: new Date(),
                        payment_mode: "cash",
                        amount: 0,
                        party_id: "",
                        remarks: "",
                        discount: 0,
                    });
                    initialResetDone.current = true;
                }
            }
        } else {
            // When closing, reset the ref for next time
            initialResetDone.current = false;
        }
    }, [open, initialValues, form]);

    const [showConfirmation, setShowConfirmation] = useState(false);
    const [pendingValues, setPendingValues] = useState<any>(null);

    const onSubmit = (values: z.infer<typeof formSchema>) => {
        // Validation: Block bank/upi/cheque if no bank accounts exist or none selected
        if (['bank', 'upi', 'cheque'].includes(values.payment_mode)) {
            if (bankAccounts.length === 0) {
                toast({
                    title: "Missing Bank Account",
                    description: "You cannot process Bank, UPI, or Cheque payments without adding a bank account first.",
                    variant: "destructive"
                });
                return;
            }
            if (!selectedBankId && !defaultBankId) {
                toast({
                    title: "Select Bank Account",
                    description: "Please select a bank account to process this payment.",
                    variant: "destructive"
                });
                return;
            }
        }

        // Enable confirmation for both Payment and Receipt modes
        setPendingValues(values);
        setShowConfirmation(true);
    };

    const handleFinalSubmit = async (values: any) => {
        setIsSubmitting(true);
        const schema = 'mandi';
        try {
            // Determine which bank account to credit/debit
            const bankAccountId = ['bank', 'upi', 'cheque'].includes(values.payment_mode)
                ? (selectedBankId || defaultBankId)
                : null;

            const { error } = await supabase.schema(schema).rpc('create_voucher', {
                p_organization_id: profile?.organization_id,
                p_voucher_type: mode, // Dynamic type
                p_date: values.payment_date.toISOString(),
                p_amount: values.amount,
                p_payment_mode: values.payment_mode,
                p_party_id: values.party_id,
                p_remarks: values.remarks || '',
                p_discount: values.discount || 0,
                p_invoice_id: invoiceId, // Pass invoice_id to link payment and auto-close
                p_lot_id: lotId,         // Pass lot_id for purchase settlements
                p_arrival_id: arrivalId, // Pass arrival_id for full bill settlements
                p_reference_id: arrivalId || invoiceId || lotId || null,
                p_cheque_no: values.cheque_no,
                p_cheque_date: values.cheque_date,
                p_bank_name: values.bank_name,
                p_cheque_status: values.payment_mode === 'cheque' ? (instantClear ? 'Cleared' : 'Pending') : null,
                p_bank_account_id: bankAccountId,
            });

            if (error) throw error;

            toast({ title: isReceipt ? "Receipt Recorded" : "Payment Recorded", description: "Voucher created successfully." });
            setOpen(false);
            setShowConfirmation(false);
            form.reset();
            onSuccess?.();

        } catch (e: any) {
            console.error(e);
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!val) setShowConfirmation(false);
            setOpen(val);
        }}>
            {children ? (
                <DialogTrigger asChild>{children}</DialogTrigger>
            ) : (
                !onOpenChange && (
                    <DialogTrigger asChild>
                        <Button className={`h-10 text-white font-bold shadow-sm rounded-lg ${buttonBg}`}>
                            <ArrowUpRight className={`w-4 h-4 mr-2 ${isReceipt ? 'rotate-180' : ''}`} /> {actionLabel}
                        </Button>
                    </DialogTrigger>
                )
            )}
            <DialogContent className="bg-white border-slate-300 text-black sm:max-w-[400px] flex flex-col max-h-[85vh] overflow-y-auto shadow-2xl p-4 gap-4">
                <DialogHeader className="p-0">
                    <DialogTitle className={`text-md font-black uppercase tracking-widest ${themeColor}`}>
                        {showConfirmation ? (isReceipt ? "Confirm Receipt" : "Confirm Payment") : actionLabel}
                    </DialogTitle>
                    <DialogDescription className="text-slate-600 font-bold text-[10px]">
                        {showConfirmation ? "Please verify the details before proceeding." : (isReceipt ? "Record payment received from a Buyer." : "Pay a Farmer, Supplier, or Expense.")}
                    </DialogDescription>
                </DialogHeader>

                {showConfirmation && pendingValues ? (
                    <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{isReceipt ? "From" : "To"}</span>
                                <span className="font-black text-black text-md">
                                    {contacts.find(c => c.id === pendingValues.party_id)?.name || "Unknown"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center bg-white p-1 rounded-lg border border-slate-100">
                                <span className="text-slate-500 text-9px] font-bold uppercase tracking-widest">Amount</span>
                                <span className="font-mono font-black text-black text-md">{formatCurrency(pendingValues.amount)}</span>
                            </div>
                            {pendingValues.discount > 0 && (
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-slate-500 text-[9px] font-bold uppercase tracking-widest">Write-off</span>
                                    <span className="font-mono font-bold text-green-600 text-[10px]">{formatCurrency(pendingValues.discount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center px-1">
                                <span className="text-slate-500 text-[9px] font-bold uppercase tracking-widest">Mode</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="font-black text-slate-700 uppercase text-[9px]">{pendingValues.payment_mode === 'bank' ? 'UPI / Bank' : pendingValues.payment_mode}</span>
                                    {pendingValues.payment_mode === 'cheque' && (
                                        <span className={cn(
                                            "text-[8px] font-black px-1.5 py-0 rounded-full uppercase tracking-tighter",
                                            instantClear ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-orange-100 text-orange-700 border border-orange-200"
                                        )}>
                                            {instantClear ? "Cleared" : "Pending"}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <Button
                                variant="outline"
                                onClick={() => setShowConfirmation(false)}
                                className="h-8 border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-[10px]"
                            >
                                Back
                            </Button>
                            <Button
                                onClick={() => handleFinalSubmit(pendingValues)}
                                disabled={isSubmitting}
                                className={`h-8 font-black text-[10px] text-white shadow-md ${buttonBg}`}
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" /> : 'CONFIRM'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Form {...form}>
                        <form ref={formRef} onSubmit={form.handleSubmit(onSubmit)} className="space-y-2 pt-2">

                            {isVisible('contact_id') && (
                                <FormField
                                    control={form.control}
                                    name="party_id"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-slate-700">{partyLabel}</FormLabel>
                                            <Popover
                                                open={openParty}
                                                onOpenChange={(op) => {
                                                    setOpenParty(op)
                                                    if (op && contacts.length === 0) fetchContacts()
                                                }}
                                                modal={false}
                                            >
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                            variant="outline"
                                                            role="combobox"
                                                            aria-expanded={openParty}
                                                            className={cn(
                                                                "w-full justify-between bg-white border-slate-300 text-black h-10 hover:bg-slate-50 font-bold",
                                                                !field.value && "text-slate-700 font-normal"
                                                            )}
                                                        >
                                                                {field.value
                                                                    ? (contacts.find((p) => p.id === field.value)?.name || (loadingContacts ? "Loading..." : "Unknown Contact"))
                                                                    : `Select ${isReceipt ? 'Buyer' : 'Party'}`}
                                                                <ArrowUpRight className={cn(
                                                                    "ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform duration-300",
                                                                    // Asset (To Receive) = Point Down-Right (Outflow of Advance)
                                                                    // Liability (To Pay) = Point Up-Right (Settling Debt)
                                                                    (currentBalance && currentBalance < 0) ? "rotate-90 text-emerald-600" : (currentBalance && currentBalance > 0 ? "rotate-0 text-rose-600" : "")
                                                                )} />
                                                            </Button>
                                                    </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[300px] p-0 bg-white border-slate-300 z-[200] shadow-xl rounded-xl">
                                                    <div className="flex flex-col bg-white rounded-xl">
                                                        <div className="p-3 border-b border-slate-100">
                                                            <Input
                                                                placeholder="Search name..."
                                                                className="bg-slate-50 border-transparent text-black focus-visible:ring-0 placeholder:text-slate-700 font-bold h-9"
                                                                value={searchQuery}
                                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                                autoFocus
                                                            />
                                                        </div>
                                                        <div className="max-h-[300px] overflow-y-auto p-1 py-2 custom-scrollbar">
                                                            {loadingContacts ? (
                                                                <div className="p-8 text-center text-xs text-slate-700 animate-pulse uppercase tracking-widest font-bold">
                                                                    <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2 opacity-50" />
                                                                    Loading...
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    {contacts
                                                                        .filter(c => (c.name || "").toLowerCase().includes((searchQuery || "").toLowerCase()))
                                                                        .map((contact) => (
                                                                            <div
                                                                                key={contact.id}
                                                                                onClick={() => {
                                                                                    form.setValue("party_id", contact.id, { shouldValidate: true });
                                                                                    setOpenParty(false);
                                                                                    setSearchQuery("");
                                                                                }}
                                                                                className="flex flex-col px-4 py-2 hover:bg-slate-50 cursor-pointer rounded-lg transition-colors group"
                                                                            >
                                                                                <span className="font-bold text-slate-700 group-hover:text-blue-600 transition-colors">{contact.name}</span>
                                                                                <span className="text-[10px] text-slate-700 uppercase tracking-widest">{contact.type}</span>
                                                                            </div>
                                                                        ))}
                                                                    {contacts.filter(c => (c.name || "").toLowerCase().includes((searchQuery || "").toLowerCase())).length === 0 && (
                                                                        <div className="p-8 text-center text-xs text-slate-600 font-bold uppercase tracking-widest">
                                                                            {contacts.length === 0 ? "No contacts found" : "No matches"}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                            {currentBalance !== null && (
                                                <div className="space-y-2 mt-2">
                                                    {(invoiceBalance && invoiceBalance.due !== undefined) && (
                                                        <div className="text-xs font-black px-3 py-2 rounded-lg flex justify-between items-center bg-blue-50 text-blue-600 border border-blue-200 animate-in fade-in zoom-in-95">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                                                <span className="uppercase tracking-widest">Invoiced Due</span>
                                                            </div>
                                                            <span className="font-mono text-base font-black">
                                                                {formatCurrency(invoiceBalance.due || 0)}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className={`text-[9px] font-bold px-2 py-1 rounded-lg flex justify-between items-center ${currentBalance > 0 ? "bg-rose-50 text-rose-600 border border-rose-100" : (currentBalance < 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-50 text-slate-500 border border-slate-200")
                                                        }`}>
                                                        <span className="uppercase tracking-widest opacity-80">Total Balance</span>
                                                        <span className="font-mono font-[1000]">
                                                            {currentBalance > 0 ? "To Pay (Cr)" : (currentBalance < 0 ? "To Collect (Dr)" : "Settled")} : {formatCurrency(Math.abs(currentBalance || 0))}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </FormItem>
                                    )}
                                />
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                {isVisible('amount') && (
                                    <FormField
                                        control={form.control}
                                        name="amount"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-slate-700">{amountLabel}</FormLabel>
                                                <FormControl>
                                                    <Input type="number" {...field} required={isMandatory('amount')} className="bg-white border-slate-300 h-10 text-black font-black text-lg focus:ring-2 focus:ring-blue-500/20" />
                                                </FormControl>
                                                <FormMessage className="text-[10px]" />

                                                {/* Overpayment Warning - Trigger if balance is 0/Receivable OR if paying more than Debt */}
                                                {(!isReceipt && currentBalance !== null && (currentBalance <= 0 || Number(form.watch('amount')) > currentBalance + 0.1)) && (
                                                    <div className="mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-bold flex items-center shadow-sm animate-in fade-in slide-in-from-top-1">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-2 text-red-500">
                                                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                                        </svg>
                                                        <span>Paying more than balance amount! (Advance)</span>
                                                    </div>
                                                )}
                                            </FormItem>
                                        )}
                                    />
                                )}
                                <FormField
                                    control={form.control}
                                    name="discount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-slate-700">Write-off / Settlement (₹)</FormLabel>
                                            <FormControl>
                                                <Input type="number" {...field} placeholder="0" className="bg-white border-slate-300 h-10 text-black font-bold text-md focus:ring-2 focus:ring-blue-500/20" />
                                            </FormControl>
                                            <FormMessage className="text-[10px]" />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {(isVisible('payment_mode') && (form.watch('amount') > 0)) && (
                                    <FormField
                                        control={form.control}
                                        name="payment_mode"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-slate-700">{getLabel('payment_mode', 'Select Payment Type')}</FormLabel>
                                                <div className="flex gap-2">
                                                    {[
                                                        { id: 'cash', label: 'CASH', icon: Zap, color: 'bg-emerald-500' },
                                                        { id: 'bank', label: 'UPI / BANK', icon: Landmark, color: 'bg-blue-600' },
                                                        { id: 'cheque', label: 'CHEQUE', icon: Landmark, color: 'bg-orange-500' }
                                                    ].map((m) => (
                                                        <Button
                                                            key={m.id}
                                                            type="button"
                                                            variant={field.value === m.id ? "default" : "outline"}
                                                            onClick={() => field.onChange(m.id)}
                                                            className={cn(
                                                                "flex-1 h-9 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 border-2",
                                                                field.value === m.id 
                                                                    ? `${m.color} border-${m.color.split('-')[1]}-600 text-white shadow-md scale-[1.02]` 
                                                                    : "border-slate-100 bg-slate-50/50 text-slate-600 hover:border-slate-300 hover:bg-white"
                                                            )}
                                                        >
                                                            <m.icon className={cn("w-3.5 h-3.5", field.value === m.id ? "text-white" : "text-slate-400")} />
                                                            <span className="text-[10px] font-black uppercase tracking-tighter">{m.label}</span>
                                                        </Button>
                                                    ))}
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>

                            {/* Bank Selector - shown when UPI/BANK is selected */}
                            {['bank', 'upi'].includes(watchedPaymentMode) && (
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2.5">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Landmark className="w-4 h-4 text-blue-500" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                                            Deposit To Account
                                        </span>
                                    </div>
                                    {bankAccounts.length > 0 ? (
                                        <Select value={selectedBankId || defaultBankId || ''} onValueChange={setSelectedBankId}>
                                            <SelectTrigger className="bg-white border-blue-200 h-10 text-black font-bold text-sm shadow-sm">
                                                <SelectValue placeholder="Select bank account..." />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white z-[200]">
                                                {bankAccounts.map(b => {
                                                    const meta = b.description?.startsWith('{') ? JSON.parse(b.description) : {}
                                                    return (
                                                        <SelectItem key={b.id} value={b.id}>
                                                            {b.name}{meta.bank_name ? ` · ${meta.bank_name}` : ''}{b.is_default ? ' ⭐' : ''}
                                                        </SelectItem>
                                                    )
                                                })}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <p className="text-[10px] text-red-500 font-bold italic">No banks added. You must add a bank account to use this payment mode. <a href="/settings/banks" className="underline font-black">Add a bank →</a></p>
                                    )}
                                </div>
                            )}

                            {/* Dynamic UPI QR Code for Receipt Mode */}
                            {isReceipt && ['bank', 'upi'].includes(watchedPaymentMode) && form.watch('amount') > 0 && selectedBankId && (() => {
                                const acc = bankAccounts.find(a => a.id === (selectedBankId || defaultBankId))
                                if (!acc) return null;
                                const meta = acc.description?.startsWith('{') ? JSON.parse(acc.description) : {}
                                const upiId = meta.upi_id;
                                const amount = form.watch('amount');
                                const orgName = profile?.organization?.name || "MandiGrow Vendor";

                                if (!upiId) return (
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
                                        <QrCode className="w-4 h-4 text-amber-500" />
                                        <span className="text-[10px] text-amber-700 font-bold">Add UPI ID in Bank Settings to show QR Code.</span>
                                    </div>
                                )

                                return (
                                    <div className="p-4 bg-white border-2 border-dashed border-blue-200 rounded-2xl flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-300">
                                        <div className="flex items-center gap-2 w-full border-b border-blue-50 pb-2 mb-1">
                                            <QrCode className="w-4 h-4 text-blue-600" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">Scan to Pay Digital</span>
                                        </div>
                                        <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm shrink-0">
                                            <QRCodeSVG 
                                                value={`upi://pay?pa=${upiId}&pn=${encodeURIComponent(orgName)}&am=${amount}&cu=INR`} 
                                                size={80} 
                                                level="M" 
                                            />
                                        </div>
                                        <div className="text-center space-y-1">
                                            <div className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{acc.name}</div>
                                            <div className="text-[9px] font-bold text-blue-600 font-mono tracking-widest">{upiId}</div>
                                        </div>
                                    </div>
                                )
                            })()}

                            {/* Dynamic UPI QR Code for Payment Mode (Paying to Farmer/Supplier) */}
                            {!isReceipt && ['bank', 'upi'].includes(watchedPaymentMode) && form.watch('amount') > 0 && selectedPartyId && (() => {
                                const contact = contacts.find(c => c.id === selectedPartyId);
                                if (!contact) return null;
                                
                                // Contact bank details might be in 'bank_details' column as jsonb
                                const bankDetails = contact.bank_details || {};
                                const upiId = bankDetails.upi_id || bankDetails.vpa;
                                const amount = form.watch('amount');
                                const partyName = contact.name;

                                if (!upiId && !bankDetails.account_no) return null;

                                return (
                                    <div className="p-4 bg-white border-2 border-dashed border-rose-200 rounded-2xl flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-300">
                                        <div className="flex items-center gap-2 w-full border-b border-rose-50 pb-2 mb-1">
                                            <QrCode className="w-4 h-4 text-rose-600" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-rose-700">Payment to {partyName}</span>
                                        </div>
                                        
                                        {upiId ? (
                                            <>
                                                <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                                                    <QRCodeSVG 
                                                        value={`upi://pay?pa=${upiId}&pn=${encodeURIComponent(partyName)}&am=${amount}&cu=INR`} 
                                                        size={140} 
                                                        level="M" 
                                                    />
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-[9px] font-bold text-rose-600 font-mono tracking-widest">{upiId}</div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="w-full text-center py-2 space-y-2">
                                                <div className="text-[11px] font-black text-slate-800 uppercase tracking-tight">Bank Transfer Details</div>
                                                <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-50 p-3 rounded-xl border border-slate-200">
                                                    <div className="text-left font-bold text-slate-500 uppercase tracking-tighter">A/C NO</div>
                                                    <div className="text-right font-black text-black">{bankDetails.account_no}</div>
                                                    <div className="text-left font-bold text-slate-500 uppercase tracking-tighter">IFSC</div>
                                                    <div className="text-right font-black text-black">{bankDetails.ifsc_code || bankDetails.ifsc}</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })()}

                            {form.watch("payment_mode") === 'cheque' && (
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-2 gap-3">
                                    <div className="col-span-2 flex items-center justify-between pb-2 border-b border-slate-200/60 mb-1">
                                        <div className="flex items-center gap-2">
                                            <Landmark className="w-4 h-4 text-slate-400" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cheque Details</span>
                                        </div>
                                        <label className={`flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-full border transition-all duration-200 ${
                                            instantClear
                                            ? 'bg-emerald-100 border-emerald-500 shadow-sm shadow-emerald-200'
                                            : 'bg-white border-slate-300 hover:bg-slate-50'
                                        }`}>
                                            <span className={`text-[10px] font-black uppercase tracking-wider ${instantClear ? 'text-emerald-800' : 'text-slate-600'}`}>
                                                {instantClear ? '⚡ Cleared Instantly' : '📅 Clear Later'}
                                            </span>
                                            <Switch
                                                checked={instantClear}
                                                onCheckedChange={setInstantClear}
                                                className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-200 border border-slate-300 shadow-sm"
                                            />
                                        </label>
                                    </div>

                                    {/* Info banner when instant */}
                                    {instantClear && (
                                        <div className="col-span-2 flex items-center gap-2 bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-2">
                                            <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <span className="text-[10px] text-emerald-700 font-bold">Cheque marked as cleared — skips pending reconciliation queue.</span>
                                        </div>
                                    )}
                                    <FormField
                                        control={form.control}
                                        name="cheque_no"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="uppercase text-[9px] font-black text-slate-500 tracking-widest">Cheque No</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder="000123" className="bg-white border-slate-300 h-9 font-bold text-xs" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="bank_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="uppercase text-[9px] font-black text-slate-500 tracking-widest">Cheque Bank Name</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder="Party's Bank Name e.g. SBI, HDFC..." className="bg-white border-slate-300 h-9 font-bold text-xs" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    {/* Linked internal bank account for cheque */}
                                    <div className="col-span-2 space-y-1.5 pt-1">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                                            {isReceipt ? '📥 Settle To (Bank Account)' : '📤 Drawn From (Bank Account)'}
                                        </p>
                                        {bankAccounts.length > 0 ? (
                                            <Select
                                                value={selectedBankId || defaultBankId || ''}
                                                onValueChange={setSelectedBankId}
                                            >
                                                <SelectTrigger className="bg-white border-slate-300 h-9 text-black font-bold text-xs">
                                                    <SelectValue placeholder="Select your bank account..." />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white">
                                                    {bankAccounts.map(b => {
                                                        const meta = b.description?.startsWith('{') ? JSON.parse(b.description) : {}
                                                        return (
                                                            <SelectItem key={b.id} value={b.id}>
                                                                {b.name}{meta.bank_name ? ` · ${meta.bank_name}` : ''}{b.is_default ? ' ⭐' : ''}
                                                            </SelectItem>
                                                        )
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <p className="text-[10px] text-red-500 font-bold">No bank accounts configured. You must add one. <a href="/settings/banks" className="underline font-black">Add one →</a></p>
                                        )}
                                    </div>
                                    {/* Only show clearing date if NOT instant */}
                                    {!instantClear && (
                                        <FormField
                                            control={form.control}
                                            name="cheque_date"
                                            render={({ field }) => (
                                                <FormItem className="col-span-2">
                                                    <FormLabel className="uppercase text-[9px] font-black text-slate-500 tracking-widest">Expected Clearing Date</FormLabel>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <FormControl>
                                                                <Button variant="outline" className="w-full h-9 bg-white border-slate-300 text-left font-bold text-xs">
                                                                    {field.value ? format(field.value, "PPP") : "Select date"}
                                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                                </Button>
                                                            </FormControl>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0 z-[250]">
                                                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="bg-white" />
                                                        </PopoverContent>
                                                    </Popover>
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>
                            )}

                            {isVisible('payment_date') && (
                                <FormField
                                    control={form.control}
                                    name="payment_date"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-slate-700">{getLabel('payment_date', 'Date')}</FormLabel>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                            variant={"outline"}
                                                            className={cn(
                                                                "w-full pl-3 text-left font-bold bg-white border-slate-300 text-black hover:bg-slate-50 h-10",
                                                                !field.value && "text-muted-foreground font-normal"
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
                                                <PopoverContent className="w-auto p-0 bg-white border-slate-300 text-black shadow-xl rounded-xl" align="start">
                                                    <Calendar
                                                        mode="single"
                                                        selected={field.value}
                                                        onSelect={field.onChange}
                                                        disabled={(date) =>
                                                            date > new Date() || date < new Date("1900-01-01")
                                                        }
                                                        initialFocus
                                                        className="p-3 bg-white text-black rounded-xl"
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            {isVisible('remarks') && (
                                <FormField
                                    control={form.control}
                                    name="remarks"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="uppercase text-[10px] font-bold tracking-widest text-slate-700">{getLabel('remarks', 'Remarks (Optional)')}</FormLabel>
                                            <FormControl>
                                                <Input {...field} required={isMandatory('remarks')} placeholder={getLabel('remarks', "Narration...")} className="bg-white border-slate-300 h-10 text-black font-medium" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            <Button type="submit" disabled={isSubmitting} className={`w-full h-12 text-white font-black text-lg mt-4 rounded-xl shadow-md ${buttonBg}`}>
                                {isSubmitting ? <Loader2 className="animate-spin" /> : actionLabel.toUpperCase()}
                            </Button>
                        </form>
                    </Form>
                )}
            </DialogContent>
        </Dialog>
    );
}
