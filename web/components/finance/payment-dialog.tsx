"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { CalendarIcon, Loader2, ArrowRight, ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import { cn } from "@/lib/utils"
import { useFieldGovernance } from "@/hooks/useFieldGovernance"
// Utilizing Command for search because SearchableSelect might be deprecated/custom
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"

const formSchema = z.object({
    contact_id: z.string().min(1, "Please select a party"),
    amount: z.coerce.number().min(1, "Amount must be greater than 0"),
    payment_mode: z.enum(["cash", "bank", "cheque"]),
    cheque_no: z.string().optional(),
    cheque_date: z.date().optional(),
    bank_name: z.string().optional(),
    date: z.date(),
    narration: z.string().optional(),
});

interface PaymentDialogProps {
    type: "receipt" | "payment"
    onSuccess?: () => void
    children?: React.ReactNode
}

export function PaymentDialog({ type, onSuccess, children }: PaymentDialogProps) {
    const [open, setOpen] = useState(false)
    const [contacts, setContacts] = useState<{ id: string, name: string, type: string }[]>([])
    const [loadingContacts, setLoadingContacts] = useState(false)
    const { toast } = useToast()
    const { profile } = useAuth()
    const [openParty, setOpenParty] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [currentBalance, setCurrentBalance] = useState<number | null>(null)

    const { isVisible, isMandatory, getLabel } = useFieldGovernance('payments');

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            contact_id: "",
            amount: 0,
            payment_mode: "cash",
            date: new Date(),
            narration: "",
        },
    })

    const selectedContactId = form.watch('contact_id')

    useEffect(() => {
        if (selectedContactId && profile?.organization_id) {
            fetchPartyBalance(selectedContactId)
        } else {
            setCurrentBalance(null)
        }
    }, [selectedContactId, profile?.organization_id])

    const fetchPartyBalance = async (partyId: string) => {
        const { data } = await supabase
            .schema('mandi')
            .from('view_party_balances')
            .select('net_balance')
            .eq('organization_id', profile?.organization_id)
            .eq('contact_id', partyId)
            .single()

        if (data) setCurrentBalance(Number(data.net_balance))
        else setCurrentBalance(0)
    }

    const fetchContacts = async () => {
        if (!profile?.organization_id) return
        setLoadingContacts(true)
        try {
            const { data, error } = await supabase
                .schema('mandi')
                .from('contacts')
                .select('id, name, type')
                .eq('organization_id', profile.organization_id)
                .order('name')

            if (error) throw error
            if (data) setContacts(data)
        } catch (err) {
            console.error("Fetch Contacts Error:", err)
        } finally {
            setLoadingContacts(false)
        }
    }

    // Fetch contacts on open
    useEffect(() => {
        if (open && profile?.organization_id && contacts.length === 0) {
            fetchContacts()
        }
    }, [open, profile?.organization_id])

    async function onSubmit(values: z.infer<typeof formSchema>) {
        if (!profile?.organization_id) return

        try {
            const { error } = await supabase
                .schema('mandi')
                .rpc('create_voucher', {
                    p_organization_id: profile.organization_id,
                    p_party_id: values.contact_id,
                    p_amount: values.amount,
                    p_voucher_type: type, // 'receipt' or 'payment'
                    p_payment_mode: values.payment_mode,
                    p_date: values.date.toISOString(),
                    p_remarks: values.narration,
                    p_cheque_no: values.cheque_no,
                    p_cheque_date: values.cheque_date ? format(values.cheque_date, 'yyyy-MM-dd') : null,
                    p_bank_name: values.bank_name
                })

            if (error) throw error

            toast({
                title: type === 'receipt' ? "Receipt Created" : "Payment Successful",
                description: `Successfully ${type === 'receipt' ? 'received' : 'paid'} ₹${values.amount}`,
            })

            form.reset()
            setOpen(false)
            onSuccess?.()

        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Transaction Failed",
                description: error.message || "Could not process transaction"
            })
        }
    }

    const isReceipt = type === 'receipt'
    const themeColor = isReceipt ? "text-emerald-600" : "text-rose-600"
    const buttonVariant = isReceipt ? "default" : "destructive"

    // Filter contacts based on type (Logic: You receive from buyers, pay farmers/suppliers)
    // Actually, in Mandi, you might receive from anyone (advance return) or pay anyone.
    // So we show all, but maybe stick to convention? Let's show all for flexibility.

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || <Button variant={buttonVariant} className={isReceipt ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"}>{isReceipt ? "Receive Money" : "Make Payment"}</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-white border-slate-200 text-black shadow-2xl rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-2xl font-black text-slate-800">
                        {isReceipt ? <ArrowLeft className="h-6 w-6 text-emerald-600" /> : <ArrowRight className="h-6 w-6 text-rose-600" />}
                        <span className={themeColor}>{isReceipt ? "Receive Money" : "Make Payment"}</span>
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 font-medium">
                        {isReceipt
                            ? "Record cash or bank receipt from a Buyer or Party."
                            : "Record payment to a Farmer, Supplier or Party."}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">

                        {/* 1. Contact Selection (Robust Popover) */}
                        {isVisible('contact_id') && (
                            <FormField
                                control={form.control}
                                name="contact_id"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel className="font-bold text-slate-700">{getLabel('contact_id', 'Select Party')}</FormLabel>
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
                                                            "w-full justify-between h-12 text-lg font-bold bg-white border-slate-200 text-black hover:bg-slate-50 rounded-xl",
                                                            !field.value && "text-slate-400 font-normal"
                                                        )}
                                                    >
                                                        {field.value
                                                            ? contacts.find((contact) => contact.id === field.value)?.name
                                                            : getLabel('contact_id', "Select party...")}
                                                        <ArrowRight className="ml-2 h-4 w-4 shrink-0 opacity-50 rotate-90 text-slate-400" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[450px] p-0 z-[200] bg-white border-slate-200 shadow-xl rounded-xl" align="start">
                                                <div className="flex flex-col bg-white rounded-xl">
                                                    <div className="p-3 border-b border-slate-100">
                                                        <Input
                                                            placeholder="Search party name..."
                                                            className="bg-slate-50 border-slate-200 text-black focus-visible:ring-2 focus-visible:ring-emerald-500/20 placeholder:text-slate-400 rounded-lg"
                                                            value={searchQuery}
                                                            onChange={(e) => setSearchQuery(e.target.value)}
                                                            autoFocus
                                                        />
                                                    </div>
                                                    <div className="max-h-[300px] overflow-y-auto p-1 py-2">
                                                        {loadingContacts ? (
                                                            <div className="p-8 text-center text-xs text-slate-400 animate-pulse uppercase tracking-widest font-bold">
                                                                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2 opacity-50" />
                                                                Loading Parties...
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {contacts
                                                                    .filter(c => (c.name || "").toLowerCase().includes((searchQuery || "").toLowerCase()))
                                                                    .map((contact) => (
                                                                        <div
                                                                            key={contact.id}
                                                                            onClick={() => {
                                                                                form.setValue("contact_id", contact.id, { shouldValidate: true });
                                                                                setOpenParty(false);
                                                                                setSearchQuery("");
                                                                            }}
                                                                            className="flex flex-col px-4 py-3 hover:bg-emerald-50 cursor-pointer rounded-lg transition-colors group"
                                                                        >
                                                                            <span className="font-bold text-slate-700 group-hover:text-emerald-700 transition-colors">{contact.name}</span>
                                                                            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">{contact.type}</span>
                                                                        </div>
                                                                    ))}
                                                                {contacts.filter(c => (c.name || "").toLowerCase().includes((searchQuery || "").toLowerCase())).length === 0 && (
                                                                    <div className="p-8 text-center text-xs text-slate-500 font-bold uppercase tracking-widest">
                                                                        {contacts.length === 0 ? "No contacts found in database" : "No matches found"}
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />

                                        {/* Balance Display */}
                                        {currentBalance !== null && (
                                            <div className={cn(
                                                "flex items-center justify-between px-4 py-3 mt-2 rounded-xl border text-xs font-black uppercase tracking-wider shadow-sm",
                                                currentBalance < 0 ? "bg-red-50 text-rose-600 border-rose-100" :
                                                    currentBalance > 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                                        "bg-slate-50 text-slate-500 border-slate-200"
                                            )}>
                                                <span>Current Balance</span>
                                                <span>
                                                    {currentBalance < 0 ? `To Pay (Cr) : ₹ ${Math.abs(currentBalance).toLocaleString('en-IN')}` :
                                                        currentBalance > 0 ? `To Receive (Dr) : ₹ ${currentBalance.toLocaleString('en-IN')}` :
                                                            "Settled : ₹ 0"}
                                                </span>
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
                                            <FormLabel className="font-bold text-slate-700">{getLabel('amount', 'Amount (₹)')}</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-3 text-slate-400 font-bold">₹</span>
                                                    <Input
                                                        type="number"
                                                        placeholder="0"
                                                        {...field}
                                                        className="pl-7 text-xl font-black h-12 bg-white border-slate-200 text-black rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                                                        required={isMandatory('amount')}
                                                    />
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            {isVisible('payment_mode') && (
                                <FormField
                                    control={form.control}
                                    name="payment_mode"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-bold text-slate-700">{getLabel('payment_mode', 'Mode')}</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value} required={isMandatory('payment_mode')}>
                                                <FormControl>
                                                    <SelectTrigger className="h-12 bg-white border-slate-200 text-black rounded-xl font-bold">
                                                        <SelectValue placeholder="Select mode" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-xl">
                                                    <SelectItem value="cash" className="font-bold">Cash 💵</SelectItem>
                                                    <SelectItem value="bank" className="font-bold">Bank 🏦</SelectItem>
                                                    <SelectItem value="cheque" className="font-bold">Cheque 🎫</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>

                        {form.watch("payment_mode") === "cheque" && (
                            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-in fade-in slide-in-from-top-2">
                                <FormField
                                    control={form.control}
                                    name="cheque_no"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-bold text-slate-700">Cheque No</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Number" {...field} className="h-10 bg-white border-slate-200 text-black rounded-lg" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="bank_name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-bold text-slate-700">Bank Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Bank" {...field} className="h-10 bg-white border-slate-200 text-black rounded-lg" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="col-span-2">
                                    <FormField
                                        control={form.control}
                                        name="cheque_date"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel className="font-bold text-slate-700">Cheque Date</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button
                                                                variant={"outline"}
                                                                className={cn(
                                                                    "pl-3 text-left font-bold h-10 bg-white border-slate-200 text-black rounded-lg hover:bg-slate-50",
                                                                    !field.value && "text-slate-400 font-normal"
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
                                                    <PopoverContent className="w-auto p-0 z-[300] bg-white shadow-2xl rounded-xl border-slate-200" align="start">
                                                        <Calendar
                                                            mode="single"
                                                            selected={field.value}
                                                            onSelect={field.onChange}
                                                            initialFocus
                                                            className="bg-white rounded-xl"
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                        )}

                        {isVisible('date') && (
                            <FormField
                                control={form.control}
                                name="date"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel className="font-bold text-slate-700">{getLabel('date', 'Date')}</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant={"outline"}
                                                        className={cn(
                                                            "pl-3 text-left font-bold h-12 bg-white border-slate-200 text-black rounded-xl hover:bg-slate-50",
                                                            !field.value && "text-slate-400 font-normal"
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
                                            <PopoverContent className="w-auto p-0 bg-white border-slate-200 shadow-xl rounded-xl" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value}
                                                    onSelect={field.onChange}
                                                    disabled={(date) =>
                                                        date > new Date() || date < new Date("1900-01-01")
                                                    }
                                                    initialFocus
                                                    className="bg-white rounded-xl"
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {isVisible('narration') && (
                            <FormField
                                control={form.control}
                                name="narration"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-slate-700">{getLabel('narration', 'Narration (Optional)')}</FormLabel>
                                        <FormControl>
                                            <Input placeholder={getLabel('narration', "Enter details...")} {...field} required={isMandatory('narration')} className="h-12 bg-white border-slate-200 text-black rounded-xl placeholder:text-slate-400 font-medium" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <Button
                            type="submit"
                            className={cn("w-full h-14 text-lg font-black rounded-xl shadow-lg transition-all active:scale-95", isReceipt ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200" : "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200")}
                            disabled={form.formState.isSubmitting}
                        >
                            {form.formState.isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                            {isReceipt ? "Receive Payment" : "Make Payment"}
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
