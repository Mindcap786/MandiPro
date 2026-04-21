"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import { Loader2 } from "lucide-react"
import { useFieldGovernance } from "@/hooks/useFieldGovernance"
import { cn } from "@/lib/utils"

const contactSchema = z.object({
    name: z.string().min(2, "Name is required"),
    type: z.enum(["farmer", "buyer", "supplier"]),
    internal_id: z.string().optional().or(z.literal("")),
    phone: z.string().optional().or(z.literal("")),
    city: z.string().optional(),
    address: z.string().optional(),
    openingBalance: z.coerce.number().optional().default(0),
    balanceType: z.enum(["receivable", "payable"]).default("receivable")
})

type ContactFormValues = z.infer<typeof contactSchema>

interface ContactDialogProps {
    children: React.ReactNode
    onSuccess?: () => void
    defaultType?: "farmer" | "buyer" | "supplier"
    initialData?: any // Add support for editing
}

export function ContactDialog({ children, onSuccess, defaultType = "farmer", initialData }: ContactDialogProps) {
    const [open, setOpen] = useState(false)
    const { toast } = useToast()
    const { profile } = useAuth()
    const [loadingState, setLoadingState] = useState<string | null>(null)
    const isLoading = !!loadingState

    const { isVisible, isMandatory, getLabel } = useFieldGovernance('contacts')

    // Wholesale Price Lists removed - Strategic Archival (V30)


    const form = useForm<any>({
        resolver: zodResolver(contactSchema),
        defaultValues: {
            type: initialData?.type || defaultType,
            name: initialData?.name || "",
            internal_id: initialData?.internal_id || "",
            phone: initialData?.phone || "",
            city: initialData?.city || "",
            address: initialData?.address || "",
            openingBalance: 0,
            balanceType: "receivable"
        }
    })

    // Reset form when initialData changes or dialog opens
    useEffect(() => {
        if (open) {
            form.reset({
                type: initialData?.type || defaultType,
                name: initialData?.name || "",
                internal_id: initialData?.internal_id || "",
                phone: initialData?.phone || "",
                city: initialData?.city || "",
                address: initialData?.address || "",
                openingBalance: 0,
                balanceType: "receivable"
            })
        }
    }, [open, initialData, defaultType, form])

    const [idConflict, setIdConflict] = useState<string | null>(null)

    const checkIdUniqueness = async (id: string, type: string) => {
        if (!id || !profile?.organization_id) {
            setIdConflict(null)
            return
        }
        
        const { data } = await supabase
            .schema('mandi')
            .from('contacts')
            .select('name')
            .eq('organization_id', profile.organization_id)
            .eq('contact_type', type)
            .eq('internal_id', id)
            .maybeSingle()
        
        if (data) {
            setIdConflict(`This ID is already allocated to ${data.name}. Please use a different ID.`)
        } else {
            setIdConflict(null)
        }
    }

    const onSubmit = async (data: any) => {
        if (idConflict) {
            toast({
                title: "ID Conflict",
                description: idConflict,
                variant: "destructive"
            })
            return
        }
        if (!profile?.organization_id) {
            console.error("Profile check failed:", { profile })
            toast({
                title: "Authentication Error",
                description: "Your session is missing organization context. Please try logging out and back in.",
                variant: "destructive"
            })
            return
        }

        setLoadingState("Connecting...")
        console.time("ContactSave")

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 20000)

        try {
            setLoadingState("Synchronizing...")
            const schema = 'mandi';
            
            let result;
            if (initialData?.id) {
                // Update existing contact
                result = await supabase
                    .schema(schema)
                    .from("contacts")
                    .update({
                        name: data.name,
                        contact_type: data.type,
                        internal_id: data.internal_id?.trim() || null,
                        phone: data.phone,
                        city: data.city,
                        address: data.address
                    })
                    .eq('id', initialData.id)
                    .select()
                    .abortSignal(controller.signal)
            } else {
                // Insert new contact
                result = await supabase
                    .schema(schema)
                    .from("contacts")
                    .insert({
                        organization_id: profile.organization_id,
                        name: data.name,
                        contact_type: data.type,
                        status: "active",
                        internal_id: data.internal_id?.trim() || null,
                        phone: data.phone,
                        city: data.city,
                        address: data.address
                    })
                    .select()
                    .abortSignal(controller.signal)
            }

            const { data: contactResult, error: saveError } = result
            if (saveError) throw saveError
            const savedContact = contactResult?.[0]

            // Handle Opening Balance (Only for NEW contacts)
            if (!initialData?.id && data.openingBalance && data.openingBalance > 0 && savedContact) {
                setLoadingState("Setting Balance...")
                const { error: ledgerError } = await supabase
                    .schema(schema)
                    .from('ledger_entries')
                    .insert({
                        organization_id: profile.organization_id,
                        contact_id: newContact.id,
                        entry_date: new Date().toISOString(),
                        description: "Opening Balance",
                        debit: data.balanceType === 'receivable' ? data.openingBalance : 0,
                        credit: data.balanceType === 'payable' ? data.openingBalance : 0,
                        transaction_type: 'opening_balance'
                    });

                if (ledgerError) {
                    console.error("Failed to set opening balance:", ledgerError);
                    toast({
                        title: "Warning",
                        description: "Contact created but failed to set opening balance.",
                        variant: "destructive"
                    });
                }
            }

            setLoadingState("Finalizing...")
            toast({ title: "Success", description: initialData?.id ? `${data.name} updated successfully` : `${data.type} added successfully` })
            setOpen(false)
            form.reset()
            if (onSuccess) onSuccess()
        } catch (error: any) {
            console.error("Save error detail:", error)
            let errorMessage = error.message
            if (error.name === 'AbortError') {
                errorMessage = "The secure connection timed out (20s). This usually happens due to slow database RLS policies. Please contact admin to optimize database performance."
            }
            toast({
                title: "Save Failed",
                description: errorMessage,
                variant: "destructive"
            })
        } finally {
            clearTimeout(timeoutId)
            console.timeEnd("ContactSave")
            setLoadingState(null)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px] bg-white border-slate-300 text-black rounded-[32px] overflow-hidden shadow-2xl p-0">
                <div className="bg-slate-50 p-8 pb-4 border-b border-slate-100">
                    <DialogHeader>
                        <DialogTitle className="text-3xl font-[1000] italic tracking-tighter text-black uppercase">
                            {initialData?.id ? 'EDIT' : 'ADD'} <span className="text-blue-600">CONTACT</span>
                        </DialogTitle>
                        <DialogDescription className="text-slate-700 font-bold">
                            {initialData?.id ? `Updating details for ${initialData.name}` : 'Register a new partner in your Mandi network.'}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <form onSubmit={form.handleSubmit(onSubmit)} className="p-8 pt-6 space-y-6">
                    <div className="space-y-4">
                        {isVisible('type') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-700">{getLabel('type', 'Partner Type')}</Label>
                                <Select
                                    onValueChange={(val: any) => form.setValue("type", val)}
                                    defaultValue={defaultType}
                                    required={isMandatory('type')}
                                >
                                    <SelectTrigger className="w-full bg-white border-slate-300 text-black font-bold h-12 rounded-xl focus:ring-blue-500 shadow-sm">
                                        <SelectValue placeholder={getLabel('type', 'Select type')} />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white border-slate-300 text-black rounded-xl shadow-lg">
                                        <SelectItem value="farmer">Farmer (Producer)</SelectItem>
                                        <SelectItem value="buyer">Buyer (Trader)</SelectItem>
                                        <SelectItem value="supplier">External Supplier</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {isVisible('name') && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-700">{getLabel('name', 'Full Name')}</Label>
                                    <Input
                                        id="name"
                                        placeholder={getLabel('name', 'e.g. SSS Fruits')}
                                        required={isMandatory('name')}
                                        className="w-full bg-slate-50 border-slate-300 text-black h-12 rounded-xl focus:border-blue-500 font-bold transition-all placeholder:text-slate-600"
                                        {...form.register("name")}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-700">INTERNAL ID / CODE (OPTIONAL)</Label>
                                    <Input
                                        id="internal_id"
                                        placeholder="ID-101"
                                        className={cn(
                                            "w-full bg-slate-50 border-slate-300 text-black h-12 rounded-xl focus:border-blue-500 font-bold transition-all placeholder:text-slate-600",
                                            idConflict && "border-red-500 focus:border-red-600"
                                        )}
                                        {...form.register("internal_id")}
                                        onBlur={(e) => checkIdUniqueness(e.target.value, form.getValues('type'))}
                                    />
                                    {idConflict && (
                                        <p className="text-[9px] text-red-600 font-bold uppercase tracking-tight">{idConflict}</p>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            {isVisible('phone') && (
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-700">{getLabel('phone', 'Phone')}</Label>
                                    <Input
                                        id="phone"
                                        placeholder="+91..."
                                        required={isMandatory('phone')}
                                        className="w-full bg-slate-50 border-slate-300 text-black h-12 rounded-xl focus:border-blue-500 font-bold transition-all placeholder:text-slate-600"
                                        {...form.register("phone")}
                                        maxLength={10}
                                    />
                                </div>
                            )}
                            {isVisible('city') && (
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-700">{getLabel('city', 'City / Village')}</Label>
                                    <Input
                                        id="city"
                                        placeholder={getLabel('city', 'Location')}
                                        required={isMandatory('city')}
                                        className="w-full bg-slate-50 border-slate-300 text-black h-12 rounded-xl focus:border-blue-500 font-bold transition-all placeholder:text-slate-600"
                                        {...form.register("city")}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Opening Balance Section (Only for NEW contacts) */}
                        {!initialData?.id && (
                            <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 space-y-3">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Opening Balance (Optional)</Label>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <Input
                                            type="number"
                                            placeholder="0.00"
                                            {...form.register("openingBalance")}
                                            className="bg-white border-slate-300 text-black font-mono font-bold h-10"
                                        />
                                    </div>
                                    <div className="w-1/2">
                                        <Select
                                            onValueChange={(val: any) => form.setValue("balanceType", val)}
                                            defaultValue="receivable"
                                        >
                                            <SelectTrigger className={`h-10 font-bold ${form.watch('balanceType') === 'receivable' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-red-600 bg-red-50 border-red-200'}`}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="receivable">To Receive (↓)</SelectItem>
                                                <SelectItem value="payable">To Pay (↑)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-4">
                        <Button type="submit" disabled={isLoading} className="w-full h-14 bg-black text-white hover:bg-slate-800 font-black text-lg tracking-tight rounded-2xl shadow-lg">
                            {isLoading ? (
                                <div className="flex items-center gap-3">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                    <span className="uppercase text-sm tracking-widest">{loadingState}</span>
                                </div>
                            ) : (
                                initialData?.id ? "UPDATE CONTACT DETAILS" : "SECURELY SAVE CONTACT"
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog >
    )
}
