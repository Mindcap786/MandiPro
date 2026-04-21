"use client"

import { useState, useEffect, useRef } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Plus, Trash2, Loader2, IndianRupee, Calculator, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { supabase } from "@/lib/supabaseClient"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth/auth-provider"
import { LotSelector } from "./lot-selector"
import { ContactDialog } from "@/components/contacts/contact-dialog"
import { useRouter } from "next/navigation"

// Allow rate=0 in schema — validation logic happens in onSubmit per arrival_type
const saleItemSchema = z.object({
    lot_id: z.string().min(1, "Lot is required"),
    qty: z.coerce.number().min(1),
    rate: z.coerce.number().min(0),
})

const formSchema = z.object({
    buyer_id: z.string().min(1, "Buyer is required"),
    date: z.string().min(1),
    items: z.array(saleItemSchema).min(1),
    narration: z.string().optional()
})

type FormValues = z.infer<typeof formSchema>

export default function SalesForm() {
    const { profile } = useAuth()
    const { toast } = useToast()
    const router = useRouter()
    const [buyers, setBuyers] = useState<any[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Track lot metadata (arrival_type, lot_code) per item index
    // Key: field index, Value: { arrival_type, lot_code }
    const lotMetaRef = useRef<Record<number, { arrival_type: string; lot_code: string }>>({})

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            date: new Date().toISOString().split('T')[0],
            items: [{ lot_id: "", qty: 1, rate: 0 }],
            narration: ""
        }
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    })

    useEffect(() => {
        if (profile?.organization_id) {
            fetchBuyers()
        }
    }, [profile])

    const fetchBuyers = async () => {
        const { data } = await supabase
            .schema('mandi')
            .from("contacts")
            .select("id, name, contact_type, city, status")
            .eq("organization_id", profile!.organization_id)
            .eq("contact_type", "buyer")
            .or("status.is.null,status.eq.active")
        setBuyers(data || [])
    }

    const onSubmit = async (values: FormValues) => {
        if (!profile?.organization_id) return

        // ── Per-item rate validation: direct purchase lots MUST have rate > 0 ──
        for (let i = 0; i < values.items.length; i++) {
            const item = values.items[i]
            const meta = lotMetaRef.current[i]
            if (meta?.arrival_type === 'direct' && (item.rate === 0 || !item.rate)) {
                toast({
                    title: "Rate Required",
                    description: `Please enter the selling rate for direct purchase lot ${meta.lot_code || `#${i + 1}`} before selling.`,
                    variant: "destructive"
                })
                return
            }
        }

        setIsSubmitting(true)

        try {
            // 1. Calculate Grand Total
            const totalAmount = values.items.reduce((sum, item) => sum + (item.qty * item.rate), 0)

            // 2. Create Voucher (mandi schema)
            const { data: voucher, error: vError } = await supabase
                .schema('mandi')
                .from("vouchers")
                .insert({
                    organization_id: profile.organization_id,
                    type: 'sales',
                    date: values.date,
                    narration: values.narration || `Sale to Buyer`,
                })
                .select()
                .single()

            if (vError) throw vError

            // 3. Create Ledger Entries (Double Entry)
            // Entry 1: Debit Buyer (mandi schema)
            const { error: e1Error } = await supabase
                .schema('mandi')
                .from("ledger_entries")
                .insert({
                    organization_id: profile.organization_id,
                    voucher_id: voucher.id,
                    contact_id: values.buyer_id,
                    debit: totalAmount,
                    credit: 0
                })
            if (e1Error) throw e1Error

            // Entry 2: Credit Sales Account
            const { data: salesAcc } = await supabase
                .schema('mandi')
                .from("accounts")
                .select("id")
                .eq("organization_id", profile.organization_id)
                .eq("name", "Sales Income")
                .single()

            const { error: e2Error } = await supabase
                .schema('mandi')
                .from("ledger_entries")
                .insert({
                    organization_id: profile.organization_id,
                    voucher_id: voucher.id,
                    account_id: salesAcc?.id,
                    debit: 0,
                    credit: totalAmount
                })
            if (e2Error) throw e2Error

            // 4. Update Stock Ledger & Lot Qty for each item
            for (const item of values.items) {
                // Fetch current lot details for location tracking (mandi schema)
                const { data: currentLot } = await supabase
                    .schema('mandi')
                    .from("lots")
                    .select("current_qty, storage_location")
                    .eq("id", item.lot_id)
                    .single()

                if (currentLot) {
                    // Deduct from Stock Ledger with location tracking (mandi schema)
                    await supabase
                        .schema('mandi')
                        .from("stock_ledger")
                        .insert({
                            organization_id: profile.organization_id,
                            lot_id: item.lot_id,
                            transaction_type: 'sale',
                            qty_change: -item.qty,
                            reference_id: voucher.id,
                            source_location: currentLot.storage_location
                        })

                    // Update current_qty in lots table (mandi schema)
                    await supabase
                        .schema('mandi')
                        .from("lots")
                        .update({ current_qty: currentLot.current_qty - item.qty })
                        .eq("id", item.lot_id)
                }
            }

            toast({ title: "Sale Completed", description: `Voucher #${voucher.voucher_no} generated.` })
            router.push("/sales")
        } catch (error: any) {
            console.error(error)
            toast({ title: "Error", description: error.message, variant: "destructive" })
        } finally {
            setIsSubmitting(false)
        }
    }

    const items = form.watch("items")
    const grandTotal = items.reduce((sum, item) => sum + ((item.qty || 0) * (item.rate || 0)), 0)

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* Header Details */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 text-neon-blue font-black italic tracking-tighter uppercase text-xs">
                            <div className="w-8 h-px bg-neon-blue/30" />
                            CLIENT SELECTION
                        </div>

                        <FormField
                            control={form.control}
                            name="buyer_id"
                            render={({ field }) => (
                                <FormItem>
                                    <div className="flex items-center justify-between mb-2">
                                        <FormLabel className="text-gray-400 font-bold tracking-widest uppercase text-[10px]">Buyer / Client</FormLabel>
                                        <ContactDialog onSuccess={fetchBuyers}>
                                            <Button type="button" variant="link" className="p-0 h-auto text-neon-green text-[10px] font-black uppercase">
                                                <UserPlus className="w-3 h-3 mr-1" /> New Buyer
                                            </Button>
                                        </ContactDialog>
                                    </div>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="bg-white/5 border-white/10 h-14 text-white font-bold ring-offset-neon-purple focus:ring-neon-purple transition-all">
                                                <SelectValue placeholder="Search Registered Buyers..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-zinc-950 border-white/10 text-white">
                                            {buyers.map(b => (
                                                <SelectItem key={b.id} value={b.id}>
                                                    {b.name} {b.city ? `(${b.city})` : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="date"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-gray-400 font-bold tracking-widest uppercase text-[10px]">Billing Date</FormLabel>
                                    <FormControl>
                                        <Input type="date" {...field} className="bg-white/5 border-white/10 h-14 text-white font-bold transition-all focus:border-neon-blue" />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </div>

                    {/* Summary Card */}
                    <div className="bg-gradient-to-br from-neon-purple/20 to-neon-blue/20 border border-white/10 rounded-[32px] p-8 flex flex-col justify-between shadow-inner">
                        <div>
                            <div className="text-[10px] font-black text-neon-purple uppercase tracking-[0.2em] mb-4">Live Invoice Summary</div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-gray-400 text-2xl font-black">₹</span>
                                <h2 className="text-6xl font-black text-white tracking-tighter tabular-nums">
                                    {grandTotal.toLocaleString()}
                                </h2>
                            </div>
                        </div>

                        <div className="space-y-4 pt-8 border-t border-white/5">
                            <div className="flex justify-between text-sm font-bold">
                                <span className="text-gray-500 uppercase">Items Selected</span>
                                <span className="text-white">{fields.length}</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold">
                                <span className="text-gray-500 uppercase">Total Units</span>
                                <span className="text-neon-blue">{items.reduce((s, i) => s + (i.qty || 0), 0)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Items Section */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-neon-purple font-black italic tracking-tighter uppercase text-xs">
                            <div className="w-8 h-px bg-neon-purple/30" />
                            LINE ITEMS (LOTS)
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => append({ lot_id: "", qty: 1, rate: 0 })}
                            className="border-neon-purple text-neon-purple hover:bg-neon-purple/10 rounded-full font-black uppercase text-[10px] tracking-widest px-4"
                        >
                            <Plus className="w-4 h-4 mr-1" /> Add Entry
                        </Button>
                    </div>

                    <div className="space-y-4">
                        {fields.map((field, index) => {
                            const meta = lotMetaRef.current[index]
                            const isDirect = meta?.arrival_type === 'direct'
                            const currentRate = form.watch(`items.${index}.rate`)
                            const rateMissing = isDirect && (!currentRate || currentRate === 0)

                            return (
                                <div key={field.id} className="group grid grid-cols-12 gap-6 items-end bg-white/[0.02] border border-white/5 p-6 rounded-[24px] hover:bg-white/[0.05] hover:border-white/10 transition-all relative">
                                    <div className="col-span-12 md:col-span-5">
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.lot_id`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Select Lot (Inventory)</FormLabel>
                                                    <LotSelector
                                                        onSelect={(lot) => {
                                                            form.setValue(`items.${index}.lot_id`, lot.id)
                                                            // Store lot metadata for per-item validation
                                                            lotMetaRef.current[index] = {
                                                                arrival_type: lot.arrival_type || '',
                                                                lot_code: lot.lot_code || ''
                                                            }
                                                        }}
                                                        selectedLotId={field.value}
                                                    />
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <div className="col-span-6 md:col-span-3">
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.qty`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Quantity (Sold)</FormLabel>
                                                    <div className="relative">
                                                        <Calculator className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                                                        <Input type="number" {...field} className="bg-white/5 border-white/10 h-12 pl-10 text-white font-bold" />
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <div className="col-span-5 md:col-span-3">
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.rate`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className={`text-[10px] font-black uppercase tracking-widest mb-1.5 block ${rateMissing ? 'text-red-400' : 'text-gray-500'}`}>
                                                        Selling Rate (₹){isDirect && <span className="text-red-400 ml-1">*</span>}
                                                        {!isDirect && meta?.arrival_type === 'commission' && (
                                                            <span className="text-emerald-500 text-[9px] ml-1 normal-case tracking-normal">(optional)</span>
                                                        )}
                                                    </FormLabel>
                                                    <div className="relative">
                                                        <IndianRupee className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${rateMissing ? 'text-red-400' : 'text-neon-green'}`} />
                                                        <Input
                                                            type="number"
                                                            {...field}
                                                            className={`bg-white/5 h-12 pl-10 text-white font-bold ${rateMissing ? 'border-red-500/60 focus:border-red-400' : 'border-white/10'}`}
                                                        />
                                                    </div>
                                                    {rateMissing && (
                                                        <p className="text-red-400 text-[10px] font-bold mt-1 uppercase tracking-wider">Rate required for direct purchase</p>
                                                    )}
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <div className="col-span-1 flex justify-center pb-1">
                                        {fields.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => {
                                                    remove(index)
                                                    // Clean up stored metadata for removed item
                                                    delete lotMetaRef.current[index]
                                                }}
                                                className="text-gray-700 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </Button>
                                        )}
                                    </div>

                                    {/* Item Subtotal */}
                                    <div className="absolute top-2 right-6 text-[10px] font-bold text-gray-700 uppercase">
                                        Item Total: ₹{(form.watch(`items.${index}.qty`) * form.watch(`items.${index}.rate`)).toLocaleString()}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="pt-12 border-t border-white/5">
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full h-20 bg-neon-purple text-white hover:bg-neon-purple/90 font-black text-2xl tracking-tighter italic rounded-[24px] shadow-[0_20px_40px_-10px_rgba(191,0,255,0.4)] transition-all hover:scale-[1.01] active:scale-[0.99] group overflow-hidden"
                    >
                        {isSubmitting ? (
                            <Loader2 className="w-8 h-8 animate-spin" />
                        ) : (
                            <div className="flex items-center gap-4">
                                FINALIZE TRANSACTION &amp; GENERATE INVOICE
                                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:translate-x-2 transition-transform">
                                    &rarr;
                                </div>
                            </div>
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
