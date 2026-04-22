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
import { format } from "date-fns"
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
import { useState, useEffect, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Check, ChevronsUpDown, Loader2, Package, QrCode, Printer } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { cn } from "@/lib/utils"
import inventoryData from "../../inventory_data.json"
import { getIntelligentVisual } from "@/lib/utils/commodity-mapping"
import * as LucideIcons from "lucide-react"
import { useFieldGovernance } from "@/hooks/useFieldGovernance"

const itemSchema = z.object({
    name: z.string().min(2, "Name is required"),
    local_name: z.string().optional(),
    default_unit: z.string().min(1, "Default unit is required"),
    shelf_life_days: z.number().nullable().optional(),
    critical_age_days: z.number().nullable().optional(),
    sku_code: z.string().optional(),
    category: z.string().optional(),
    sub_category: z.string().optional(),
    purchase_price: z.number().min(0).optional(),
    sale_price: z.number().min(0).optional(),
    minimum_price: z.number().min(0).optional(),
    wholesale_price: z.number().min(0).optional(),
    dealer_price: z.number().min(0).optional(),
    average_cost: z.number().min(0).optional(),
    min_stock_level: z.number().min(0).optional(),
    barcode: z.string().optional(),
    gst_rate: z.number().min(0).optional(),
    tracking_type: z.string().optional(),
    custom_attributes: z.record(z.string(), z.string()).optional(),
    internal_id: z.string().optional().or(z.literal("")),
})

type ItemFormValues = z.infer<typeof itemSchema>

interface ItemDialogProps {
    children: React.ReactNode
    onSuccess?: () => void
    initialItem?: any // Optional item for editing
}

export function ItemDialog({ children, onSuccess, initialItem }: ItemDialogProps) {
    const [open, setOpen] = useState(false)
    const { toast } = useToast()
    const { profile } = useAuth()
    const [loadingState, setLoadingState] = useState<string | null>(null)
    const [idConflict, setIdConflict] = useState<string | null>(null)
    const isLoading = !!loadingState

    const [selectedImages, setSelectedImages] = useState<File[]>([])
    const [existingImages, setExistingImages] = useState<any[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files) {
            const files = Array.from(e.target.files)
            setSelectedImages(prev => [...prev, ...files])
            const newUrls = files.map(file => URL.createObjectURL(file))
            setPreviewUrls(prev => [...prev, ...newUrls])
        }
    }

    async function uploadImages(itemId: string): Promise<void> {
        if (selectedImages.length === 0) return

        let primaryUrl: string | null = null

        for (let i = 0; i < selectedImages.length; i++) {
            const file = selectedImages[i]
            const fileName = `${profile?.organization_id}/${itemId}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`
            const { error: uploadError } = await supabase.storage.from('item_images').upload(fileName, file)

            if (uploadError) {
                console.error("Item Image Upload Error:", uploadError)
                toast({
                    title: "Image Upload Failed",
                    description: `Could not upload ${file.name}. Please try again.`,
                    variant: "destructive"
                })
                continue
            }

            const { data: urlData } = supabase.storage.from('item_images').getPublicUrl(fileName)
            const publicUrl = urlData.publicUrl

            // First successfully uploaded image becomes the primary display image
            if (!primaryUrl) primaryUrl = publicUrl

            // Store in item_images gallery for history
            await supabase.schema('mandi').from('item_images').insert({
                organization_id: profile?.organization_id,
                commodity_id: itemId,
                url: publicUrl,
                is_primary: i === 0
            })
        }

        // Update the commodity's image_url directly - this is what Stock Status & POS read
        if (primaryUrl) {
            const { error: updateError } = await supabase
                .schema('mandi')
                .from('commodities')
                .update({ image_url: primaryUrl })
                .eq('id', itemId)

            if (updateError) {
                console.error("[Upload] Failed to update commodity image_url:", updateError)
            } else {
                console.log('[Upload] Updated commodities.image_url for item:', itemId)
            }
        }
    }

    const { isVisible, isMandatory, getLabel } = useFieldGovernance('inventory')

    // Flatten inventory data for search
    const allItems = [...inventoryData.fruits, ...inventoryData.vegetables]

    // Filter items if in edit mode (initialItem exists)
    const displayedItems = initialItem
        ? allItems.filter(item => item.name === initialItem.name)
        : allItems;

    const [openCombobox, setOpenCombobox] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")

    const form = useForm<ItemFormValues>({
        resolver: zodResolver(itemSchema),
        defaultValues: {
            name: initialItem?.name || "",
            local_name: initialItem?.local_name || "",
            default_unit: initialItem?.default_unit || "Box",
            shelf_life_days: initialItem?.shelf_life_days || null,
            critical_age_days: initialItem?.critical_age_days || null,
            sku_code: initialItem?.sku_code || "",
            category: initialItem?.category || "",
            sub_category: initialItem?.sub_category || "",
            purchase_price: initialItem?.purchase_price || 0,
            sale_price: initialItem?.sale_price || 0,
            minimum_price: initialItem?.minimum_price || 0,
            wholesale_price: initialItem?.wholesale_price || 0,
            dealer_price: initialItem?.dealer_price || 0,
            average_cost: initialItem?.average_cost || 0,
            min_stock_level: initialItem?.min_stock_level || 0,
            barcode: initialItem?.barcode || "",
            gst_rate: initialItem?.gst_rate || 0,
            tracking_type: initialItem?.tracking_type || "none",
            custom_attributes: initialItem?.custom_attributes || {},
            internal_id: initialItem?.internal_id || "",
        }
    })

    const checkUniqueCombination = async (name: string) => {
        if (!name || !profile?.organization_id || initialItem) return
        const { data } = await supabase
            .schema('mandi')
            .from('commodities')
            .select('id, internal_id')
            .eq('organization_id', String(profile.organization_id))
            .ilike('name', name)
            .maybeSingle()
        
        if (data) {
            toast({
                title: "Duplicate Item",
                description: `This Name already exists (Code: ${data.internal_id || 'N/A'}).`,
                variant: "destructive"
            })
        }
    }

    const checkIdUniqueness = async (id: string) => {
        if (!id || !profile?.organization_id || initialItem) {
            setIdConflict(null)
            return
        }
        
        const { data } = await supabase
            .schema('mandi')
            .from('commodities')
            .select('name')
            .eq('organization_id', String(profile.organization_id))
            .eq('internal_id', id)
            .maybeSingle()
        
        if (data) {
            setIdConflict(`This ID is already allocated to ${data.name}. Please use a different identifier.`)
        } else {
            setIdConflict(null)
        }
    }


    // Reset form when dialog opens/closes or initialItem changes
    useEffect(() => {
        if (open) {
            const initialAttrs = initialItem?.custom_attributes || {};
            // If no custom attributes, provide a default "Variety" one
            if (Object.keys(initialAttrs).length === 0) {
                initialAttrs["Variety"] = "";
            }
            // Sanitize null DB values → empty strings so Zod doesn't reject them
            // z.string().optional() accepts undefined but NOT null
            const sanitized = Object.fromEntries(
                Object.entries(initialItem || {}).map(([k, v]) => [k, v === null ? '' : v])
            )
            form.reset({
                name: "",
                local_name: "",
                default_unit: "Box",
                shelf_life_days: null,
                critical_age_days: null,
                sku_code: "",
                category: "",
                sub_category: "",
                purchase_price: 0,
                sale_price: 0,
                minimum_price: 0,
                wholesale_price: 0,
                dealer_price: 0,
                average_cost: 0,
                min_stock_level: 0,
                barcode: "",
                gst_rate: 0,
                tracking_type: "none",
                ...sanitized,
                custom_attributes: initialAttrs,
            })
            setSelectedImages([])
            setPreviewUrls([])
            fetchExistingImages()
        }
    }, [open, initialItem, form])

    const fetchExistingImages = async () => {
        if (!initialItem?.id) {
            setExistingImages([])
            return
        }
        const { data, error } = await supabase
            .schema('mandi')
            .from('item_images')
            .select('*')
            .eq('commodity_id', initialItem.id)
            .order('created_at', { ascending: true })
        if (data) setExistingImages(data)
    }

    const onSubmit = async (data: ItemFormValues) => {
        if (idConflict) {
            toast({
                title: "ID Conflict",
                description: idConflict,
                variant: "destructive"
            })
            return
        }
        if (!profile?.organization_id) {
            toast({
                title: "Authentication Error",
                description: "Your session is missing organization context.",
                variant: "destructive"
            })
            return
        }

        setLoadingState("Connecting...")
        console.time("ItemSave")

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 20000)

        try {
        const dbSchema = 'mandi'
        // Empty/whitespace internal_id → null so the DB trigger auto-generates a code.
        // (Sending "" would collide across rows on legacy indexes; null is safe.)
        const normalizedInternalId = data.internal_id?.trim() ? data.internal_id.trim() : null
        console.log('[ItemDialog] Submitting. schema:', dbSchema, 'initialItem.id:', initialItem?.id, 'data:', data)

            if (initialItem?.id) {
                // Clean custom_attributes — remove any entries with empty string keys
                const cleanAttrs = Object.fromEntries(
                    Object.entries(data.custom_attributes || {}).filter(([k]) => k.trim() !== '')
                );

                const { error: updateError } = await (supabase
                    .schema(dbSchema)
                    .from("commodities")
                    .update({
                        name: data.name,
                        local_name: data.local_name,
                        default_unit: data.default_unit,
                        shelf_life_days: data.shelf_life_days,
                        critical_age_days: data.critical_age_days,
                        sku_code: data.sku_code,
                        category: data.category,
                        sub_category: data.sub_category,
                        barcode: data.barcode,
                        tracking_type: data.tracking_type,
                        custom_attributes: cleanAttrs,
                        sale_price: data.sale_price,
                        purchase_price: data.purchase_price,
                        gst_rate: data.gst_rate,
                        minimum_price: data.minimum_price,
                        wholesale_price: data.wholesale_price,
                        dealer_price: data.dealer_price,
                        average_cost: data.average_cost,
                        min_stock_level: data.min_stock_level,
                        internal_id: normalizedInternalId,
                    })
                    .eq("id", initialItem.id) as any)
                    .abortSignal(controller.signal)

                if (updateError) {
                    console.error("[ItemDialog] Update failed:", JSON.stringify(updateError))
                    throw updateError
                }
                await uploadImages(initialItem.id)
                toast({ title: "Success", description: "Item updated successfully" })
            } else {
                // INSERT Logic
                const { data: newItem, error: insertError } = await (supabase
                    .schema(dbSchema)
                    .from("commodities")
                    .insert({
                        organization_id: profile.organization_id,
                        name: data.name,
                        local_name: data.local_name,
                        default_unit: data.default_unit,
                        shelf_life_days: data.shelf_life_days,
                        critical_age_days: data.critical_age_days,
                        sku_code: data.sku_code,
                        category: data.category,
                        sub_category: data.sub_category,
                        barcode: data.barcode,
                        tracking_type: data.tracking_type || "none",
                        custom_attributes: data.custom_attributes,
                        sale_price: data.sale_price || 0,
                        purchase_price: data.purchase_price || 0,
                        gst_rate: data.gst_rate || 0,
                        minimum_price: data.minimum_price || 0,
                        wholesale_price: data.wholesale_price || 0,
                        dealer_price: data.dealer_price || 0,
                        average_cost: data.average_cost || 0,
                        min_stock_level: data.min_stock_level || 0,
                        internal_id: normalizedInternalId,
                    })
                    .select('id')
                    .single() as any)
                    .abortSignal(controller.signal)

                if (insertError) throw insertError
                if (newItem) await uploadImages(newItem.id)
                toast({ title: "Success", description: "Item registered successfully" })
            }

            setLoadingState("Finalizing...")
            setOpen(false)
            form.reset()
            if (onSuccess) onSuccess()
        } catch (error: any) {
            console.error("Item Save error:", error)
            let errorMessage = error.message
            if (error.name === 'AbortError') {
                errorMessage = "Connection timed out. Please try again."
            } else if (error?.code === '23505') {
                // Postgres unique violation — surface a human-readable hint.
                const attemptedId = data.internal_id?.trim()
                errorMessage = attemptedId
                    ? `Internal ID "${attemptedId}" is already in use. Try another, or leave blank to auto-generate.`
                    : "This item conflicts with an existing record. Please review and try again."
            }
            toast({
                title: "Save Failed",
                description: errorMessage,
                variant: "destructive"
            })
        } finally {
            clearTimeout(timeoutId)
            console.timeEnd("ItemSave")
            setLoadingState(null)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] h-[90vh] flex flex-col bg-white border-gray-300 text-gray-900 rounded-[32px] overflow-hidden shadow-2xl p-0">
                <div className="bg-gradient-to-r from-blue-50 to-transparent p-8 pb-4">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black italic tracking-tighter text-gray-900">
                            {initialItem ? 'EDIT' : 'ADD'} <span className="text-blue-600">ITEM</span>
                        </DialogTitle>
                        <DialogDescription className="text-gray-700 font-medium">
                            {initialItem
                                ? 'Update commodity details.'
                                : 'Define a new commodity in your inventory master.'
                            }
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto p-8 pt-4 custom-scrollbar">
                        <div className="space-y-6">
                            {isVisible('name') && (
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-700">{getLabel('name', 'Item Name (Required)')}</Label>
                                    <Popover open={openCombobox} onOpenChange={setOpenCombobox} modal={true}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={openCombobox}
                                                className="w-full justify-between bg-white border-gray-300 text-gray-900 font-bold h-12 rounded-xl hover:bg-gray-50 hover:text-gray-900 focus:ring-blue-500/20"
                                            >
                                                {form.watch("name")
                                                    ? form.watch("name")
                                                    : getLabel('name', "Select or type item...")}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[380px] p-0 bg-white border-gray-300 text-gray-900 shadow-xl z-[200]">
                                            <Command className="bg-white">
                                                {!initialItem && <CommandInput placeholder="Search user item..." className="text-gray-900 placeholder:text-gray-400" onValueChange={setSearchTerm} />}
                                                <CommandList>
                                                    <CommandEmpty className="py-6 text-center text-sm text-gray-700">
                                                        <p>No item found.</p>
                                                        {searchTerm && (
                                                            <Button
                                                                variant="ghost"
                                                                className="mt-2 text-blue-600 font-bold hover:text-blue-700 hover:bg-blue-50"
                                                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                onClick={() => {
                                                                    form.setValue("name", searchTerm)
                                                                    setOpenCombobox(false)
                                                                }}
                                                            >
                                                                + Create "{searchTerm}"
                                                            </Button>
                                                        )}
                                                    </CommandEmpty>
                                                    {displayedItems.length > 0 && (
                                                        <CommandGroup heading="Suggestions">
                                                            {displayedItems.map((item) => (
                                                                <CommandItem
                                                                    key={item.name}
                                                                    value={item.name}
                                                                    onSelect={(currentValue) => {
                                                                        form.setValue("name", item.name)
                                                                        if (item.local_name) {
                                                                            form.setValue("local_name", item.local_name)
                                                                        }
                                                                        setOpenCombobox(false)
                                                                    }}
                                                                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                    onClick={() => {
                                                                        form.setValue("name", item.name)
                                                                        if (item.local_name) {
                                                                            form.setValue("local_name", item.local_name)
                                                                        }
                                                                        setOpenCombobox(false)
                                                                    }}
                                                                    className="!pointer-events-auto text-gray-900 aria-selected:text-blue-700 aria-selected:bg-blue-50 cursor-pointer"
                                                                >
                                                                    <Check
                                                                        className={cn(
                                                                            "mr-2 h-4 w-4 text-blue-600",
                                                                            form.watch("name") === item.name ? "opacity-100" : "opacity-0"
                                                                        )}
                                                                    />
                                                                    {item.name}
                                                                    {item.local_name && <span className="ml-2 text-gray-700 text-xs">({item.local_name})</span>}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    )}
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            )}




                            {/* Item Metadata (Shared) */}
                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-2">Item Metadata</Label>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-gray-700">Internal ID / Code</Label>
                                        <Input
                                            placeholder="Auto-generate (e.g. ITM-00042)"
                                            className={cn(
                                                "w-full bg-blue-50/30 border-gray-300 text-gray-900 font-bold h-12 rounded-xl focus:border-blue-500 transition-all font-mono",
                                                idConflict && "border-red-500 focus:border-red-600"
                                            )}
                                            {...form.register("internal_id")}
                                            onBlur={(e) => checkIdUniqueness(e.target.value)}
                                        />
                                        <p className="text-[9px] text-gray-500 font-medium pl-1">Each code must be unique in your Mandi.</p>
                                        {idConflict && (
                                            <p className="text-[9px] text-red-600 font-bold uppercase tracking-tight">{idConflict}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-gray-700">Barcode / EAN</Label>
                                        <div className="relative">
                                            <Input
                                                placeholder="Scan or enter barcode"
                                                className="w-full bg-white border-gray-300 text-gray-900 font-bold h-12 rounded-xl focus:border-indigo-500 transition-all font-mono"
                                                {...form.register("barcode")}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => form.setValue('barcode', String(Math.floor(Math.random() * 1000000000000)).padStart(12, '0'))}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-indigo-600 hover:text-indigo-700"
                                            >
                                                <QrCode className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Wholesaler Specific Pricing */}
                            {profile?.business_domain === 'wholesaler' && (
                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-2 mt-4">Pricing Setup</Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-700">Purchase Price</Label>
                                            <Input
                                                type="number"
                                                placeholder="0.00"
                                                className="w-full bg-white border-gray-300 text-gray-900 font-bold h-12 rounded-xl focus:border-blue-500 transition-all"
                                                {...form.register("purchase_price", { setValueAs: (v) => v === "" ? 0 : Number(v) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-700">Sale Price</Label>
                                            <Input
                                                type="number"
                                                placeholder="0.00"
                                                className="w-full bg-white border-gray-300 text-gray-900 font-bold h-12 rounded-xl focus:border-blue-500 transition-all"
                                                {...form.register("sale_price", { setValueAs: (v) => v === "" ? 0 : Number(v) })}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-700">Minimum Price</Label>
                                            <Input
                                                type="number"
                                                placeholder="0.00"
                                                className="w-full bg-white border-gray-300 text-gray-900 font-bold h-12 rounded-xl focus:border-blue-500 transition-all"
                                                {...form.register("minimum_price", { setValueAs: (v) => v === "" ? 0 : Number(v) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-700">Wholesale Price</Label>
                                            <Input
                                                type="number"
                                                placeholder="0.00"
                                                className="w-full bg-white border-gray-300 text-gray-900 font-bold h-12 rounded-xl focus:border-blue-500 transition-all"
                                                {...form.register("wholesale_price", { setValueAs: (v) => v === "" ? 0 : Number(v) })}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-700">Dealer Price</Label>
                                            <Input
                                                type="number"
                                                placeholder="0.00"
                                                className="w-full bg-white border-gray-300 text-gray-900 font-bold h-12 rounded-xl focus:border-blue-500 transition-all"
                                                {...form.register("dealer_price", { setValueAs: (v) => v === "" ? 0 : Number(v) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-700">Average Cost</Label>
                                            <Input
                                                type="number"
                                                placeholder="0.00"
                                                className="w-full bg-white border-gray-300 text-gray-900 font-bold h-12 rounded-xl focus:border-blue-500 transition-all"
                                                {...form.register("average_cost", { setValueAs: (v) => v === "" ? 0 : Number(v) })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2 mt-4">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-gray-700">Minimum Stock Warning Level</Label>
                                        <Input
                                            type="number"
                                            placeholder="Min Qty"
                                            className="w-full bg-white border-gray-300 text-amber-600 font-bold h-12 rounded-xl focus:border-amber-500 transition-all"
                                            {...form.register("min_stock_level", { valueAsNumber: true })}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Shelf Life & Critical Days — MandiGrow only */}
                            {true && (
                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    <div className="space-y-1">
                                        <h4 className="font-black leading-none text-black">Shelf Life Config</h4>
                                        <p className="text-xs text-slate-700">Example: Shelf Life = 10, Critical Age = 15 → Fresh for 10 days, Aging from day 10–15, Critical after day 15.</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-700">Shelf Life (days)</Label>
                                            <Input
                                                type="number"
                                                className="w-full bg-amber-50 border-amber-400 text-amber-800 font-bold h-12 rounded-xl focus:border-amber-500 transition-all"
                                                {...form.register("shelf_life_days", { 
                                                    setValueAs: (v) => v === "" || v === null || v === undefined ? null : Number(v)
                                                })}
                                            />
                                            <p className="text-[9px] text-slate-600 pl-1">Fresh 0 → X days. After X days → 🟡 Aging</p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-700">Critical Age (days)</Label>
                                            <Input
                                                type="number"
                                                className="w-full bg-red-50 border-red-400 text-red-800 font-bold h-12 rounded-xl focus:border-red-400 transition-all"
                                                {...form.register("critical_age_days", { 
                                                    setValueAs: (v) => v === "" || v === null || v === undefined ? null : Number(v)
                                                })}
                                            />
                                            <p className="text-[9px] text-slate-600 pl-1">Aging X → Y days. After Y days → 🔴 Critical</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Custom Attributes Section */}
                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <div className="flex justify-between items-center">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-blue-600">Custom Specifications</Label>
                                    {Object.keys(form.watch("custom_attributes") || {}).length < 4 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-[10px] font-black text-blue-600 hover:bg-blue-50"
                                            onClick={() => {
                                                const attrs = form.getValues("custom_attributes") || {};
                                                form.setValue("custom_attributes", { ...attrs, "": "" });
                                            }}
                                        >
                                            + ADD SPEC
                                        </Button>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    {Object.entries(form.watch("custom_attributes") || {}).map(([key, value], idx) => (
                                        <div key={idx} className="flex gap-2 items-start group">
                                            <Input
                                                placeholder="e.g. Variety"
                                                className="flex-1 bg-gray-50 border-gray-100 text-[11px] font-bold h-9 rounded-lg"
                                                value={key as string}
                                                onChange={(e) => {
                                                    const attrs = { ...form.getValues("custom_attributes") };
                                                    const newKey = e.target.value;
                                                    const oldVal = attrs[key];
                                                    delete attrs[key];
                                                    attrs[newKey] = oldVal;
                                                    form.setValue("custom_attributes", attrs);
                                                }}
                                            />
                                            <Input
                                                placeholder="e.g. A1"
                                                className="flex-1 bg-white border-gray-100 text-[11px] font-bold h-9 rounded-lg"
                                                value={value as string}
                                                onChange={(e) => {
                                                    const attrs = { ...form.getValues("custom_attributes") };
                                                    attrs[key] = e.target.value;
                                                    form.setValue("custom_attributes", attrs);
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-9 w-9 p-0 text-gray-300 hover:text-red-500 hover:bg-red-50"
                                                onClick={() => {
                                                    const attrs = { ...form.getValues("custom_attributes") };
                                                    delete attrs[key];
                                                    form.setValue("custom_attributes", attrs);
                                                }}
                                            >
                                                <LucideIcons.Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    {Object.keys(form.watch("custom_attributes") || {}).length === 0 && (
                                        <div className="text-[10px] text-gray-400 font-bold py-2 text-center border border-dashed border-gray-100 rounded-xl">
                                            No custom specs added yet.
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                        {/* Visual Asset & Image Gallery Section */}
                        <div className="pt-6 space-y-4">
                            <div className="flex justify-between items-center">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-700">Product Gallery</Label>
                                <span className="text-[9px] font-black text-slate-600">{existingImages.length + selectedImages.length} Images</span>
                            </div>

                            <div className="grid grid-cols-4 gap-3">
                                {/* Display Existing Images */}
                                {existingImages.map((img) => (
                                    <div key={img.id} className="aspect-square bg-white border border-slate-100 rounded-xl overflow-hidden relative group">
                                        <img src={img.url} alt="Item" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    await supabase.schema('mandi').from('item_images').delete().eq('id', img.id);
                                                    fetchExistingImages();
                                                }}
                                                className="p-1.5 bg-red-500 rounded-full text-white hover:scale-110 transition-transform"
                                            >
                                                <LucideIcons.X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        {img.is_primary && (
                                            <div className="absolute top-1 left-1 bg-blue-600 text-white text-[7px] px-1 rounded uppercase font-black">Main</div>
                                        )}
                                    </div>
                                ))}

                                {/* Display Selected (New) Images */}
                                {previewUrls.map((url, idx) => (
                                    <div key={idx} className="aspect-square bg-blue-50 border border-blue-100 rounded-xl overflow-hidden relative group">
                                        <img src={url} alt="New" className="w-full h-full object-cover opacity-70" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="bg-blue-600/80 text-white text-[8px] px-1.5 font-black uppercase rounded-full">New</div>
                                        </div>
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedImages(prev => prev.filter((_, i) => i !== idx));
                                                    setPreviewUrls(prev => prev.filter((_, i) => i !== idx));
                                                }}
                                                className="p-1.5 bg-white rounded-full text-red-600 hover:scale-110 transition-transform"
                                            >
                                                <LucideIcons.X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Add More Button */}
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="aspect-square border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-1 hover:border-blue-400 hover:bg-blue-50 transition-all group"
                                >
                                    <LucideIcons.Upload className="w-5 h-5 text-slate-300 group-hover:text-blue-500" />
                                    <span className="text-[8px] font-black text-slate-600 group-hover:text-blue-600 uppercase">Add</span>
                                </button>
                            </div>

                            <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl flex gap-3">
                                <LucideIcons.Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-black text-amber-900 leading-none">AI Insight</p>
                                    <p className="text-[9px] font-medium text-amber-700/80">Add multiple images from different angles to improve marketplace visibility.</p>
                                </div>
                            </div>

                            {/* Hidden file input */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                                accept="image/*"
                                multiple
                                className="hidden"
                            />
                        </div>
                    </div>

                    <div className="p-8 bg-gray-50 border-t border-gray-100">
                        <Button 
                            type="button"
                            onClick={() => form.handleSubmit(onSubmit, (errors) => {
                                console.error('[ItemDialog] Zod validation errors:', errors)
                                const fieldNames = Object.keys(errors).join(', ')
                                toast({ title: 'Validation Error', description: `Please fix: ${fieldNames}`, variant: 'destructive' })
                            })()}
                            disabled={isLoading} 
                            className="w-full h-14 bg-blue-600 text-white hover:bg-blue-700 font-black text-lg tracking-tight rounded-2xl shadow-lg transition-all hover:shadow-blue-600/20"
                        >
                            {isLoading ? (
                                <div className="flex items-center gap-3">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                    <span className="uppercase text-sm tracking-widest">{loadingState}</span>
                                </div>
                            ) : (
                                initialItem ? "UPDATE ITEM" : "REGISTER NEW ITEM"
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
