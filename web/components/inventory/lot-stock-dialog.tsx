"use client"

import { useState, useEffect } from "react"
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar, Package, ArrowRight, TrendingDown, Scale, History, User, AlertTriangle, Settings, Pencil, Loader2, MapPin, ChevronRight, ArrowRightLeft, Warehouse, Snowflake, Trash2, Search, Percent } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import { format, differenceInDays } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { TransferDialog } from "./transfer-dialog"
import { WastageDialog } from "./wastage-dialog"
import { PurchaseReturnDialog } from "./purchase-return-dialog"
import { PurchaseAdjustmentDialog } from "./purchase-adjustment-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { StockAlertBanner } from "@/components/alerts/StockAlertBanner"

// --- COMPONENT: SINGLE LOT ROW (Native Mobile–first card) ---
function LotRow({ lot, itemDefaults, onMoveStock, onWastage, onUpdate, onReturn, onAdjust }: { lot: any, itemDefaults: any, onMoveStock: () => void, onWastage: () => void, onUpdate: () => void, onReturn: () => void, onAdjust: () => void }) {

    const [isExpanded, setIsExpanded] = useState(false)
    const { toast } = useToast()
    const [shelfLifeDays, setShelfLifeDays] = useState<number>(
        lot.shelf_life_days || itemDefaults?.shelf_life_days || 7
    )
    const [criticalAgeDays, setCriticalAgeDays] = useState<number>(
        lot.critical_age_days || itemDefaults?.critical_age_days || 14
    )
    const [savingConfig, setSavingConfig] = useState(false)
    const [configOpen, setConfigOpen] = useState(false)

    const arrivalDate = new Date(lot.created_at)
    const daysSinceArrival = differenceInDays(new Date(), arrivalDate)
    const effectiveShelfLife = lot.shelf_life_days || itemDefaults?.shelf_life_days || 7
    const effectiveCriticalAge = lot.critical_age_days || itemDefaults?.critical_age_days || 14

    let status = 'Fresh'
    let statusColor = 'text-emerald-700'
    let statusBg = 'bg-emerald-50'
    let statusBorder = 'border-emerald-200'
    let statusStrip = '#16A34A'

    if (daysSinceArrival > effectiveCriticalAge) {
        status = 'Critical'
        statusColor = 'text-red-700'
        statusBg = 'bg-red-50'
        statusBorder = 'border-red-200'
        statusStrip = '#DC2626'
    } else if (daysSinceArrival > effectiveShelfLife) {
        status = 'Aging'
        statusColor = 'text-amber-700'
        statusBg = 'bg-amber-50'
        statusBorder = 'border-amber-200'
        statusStrip = '#D97706'
    }

    const fillPct = Math.min((lot.current_qty / (lot.initial_qty || lot.current_qty || 1)) * 100, 100)

    useEffect(() => {
        setShelfLifeDays(lot.shelf_life_days || itemDefaults?.shelf_life_days || 7)
        setCriticalAgeDays(lot.critical_age_days || itemDefaults?.critical_age_days || 14)
    }, [lot, itemDefaults])

    const saveConfiguration = async () => {
        setSavingConfig(true)
        try {
            const { error } = await supabase.schema('mandi').from('lots')
                .update({ shelf_life_days: shelfLifeDays, critical_age_days: criticalAgeDays })
                .eq('id', lot.id)
            if (error) throw error
            toast({ title: "Updated", description: `Shelf life: ${shelfLifeDays}d. Critical: ${criticalAgeDays}d.` })
            setConfigOpen(false)
            onUpdate()
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" })
        } finally { setSavingConfig(false) }
    }

    return (
        <div className={cn(
            "rounded-2xl overflow-hidden border transition-all",
            status === 'Critical' ? "border-red-200 shadow-sm shadow-red-50" :
            status === 'Aging'    ? "border-amber-200 shadow-sm shadow-amber-50" :
                                   "border-[#E5E7EB]"
        )}>
            {/* ── Status Strip — full-width colored banner ── */}
            {status !== 'Fresh' && (
                <div
                    className="flex items-center gap-2 px-4 py-1.5"
                    style={{ backgroundColor: statusStrip }}
                >
                    <AlertTriangle className="w-3.5 h-3.5 text-white flex-shrink-0" />
                    <span className="text-white text-[11px] font-black uppercase tracking-widest">
                        {status} — {daysSinceArrival} days old
                    </span>
                </div>
            )}

            {/* ── Row Header — tap to expand ── */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="bg-white flex items-center gap-3 px-4 py-3.5 active:bg-[#F9FAFB] transition-colors cursor-pointer"
            >
                {/* Left accent bar */}
                <div className="w-1 h-full rounded-full self-stretch flex-shrink-0" style={{ backgroundColor: statusStrip, minHeight: 44 }} />

                {/* Avatar */}
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
                    style={{ backgroundColor: `${statusStrip}18`, color: statusStrip }}
                >
                    {(lot.farmer_name || 'F').charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1A1A2E] truncate">
                        {lot.farmer_name || 'Unknown Farmer'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] font-mono font-semibold text-[#6B7280]">{lot.lot_code}</span>
                        {/* Fresh badge — only show when fresh, others shown in strip */}
                        {status === 'Fresh' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-700">
                                Fresh • {daysSinceArrival}d
                            </span>
                        )}
                        {lot.storage_location && lot.storage_location !== 'Mandi' && (
                            <span className="flex items-center gap-0.5 text-[10px] text-[#6B7280]">
                                {lot.storage_location === 'Cold Storage'
                                    ? <Snowflake className="w-3 h-3 text-purple-400" />
                                    : <Warehouse className="w-3 h-3 text-blue-400" />}
                                {lot.storage_location}
                            </span>
                        )}
                        {lot.farmer_city && (
                            <span className="text-[10px] text-[#9CA3AF]">• {lot.farmer_city}</span>
                        )}
                    </div>
                </div>

                {/* Qty + progress + Value */}
                <div className="flex flex-col items-end flex-shrink-0 min-w-[54px] ml-1">
                    <span className="text-base font-black text-[#1A1A2E] tabular-nums leading-tight">
                        {lot.current_qty}
                    </span>
                    <span className="text-[9px] font-semibold text-[#9CA3AF] uppercase mb-1">{lot.unit}</span>
                    <span className="text-xs font-bold text-emerald-700">
                        ₹{Math.round((lot.current_qty || 0) * (lot.supplier_rate || 0)).toLocaleString('en-IN')}
                    </span>
                    
                    {/* Mini progress bar */}
                    <div className="mt-1 h-1 w-12 bg-[#F3F4F6] rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full"
                            style={{ width: `${fillPct}%`, backgroundColor: statusStrip }}
                        />
                    </div>
                </div>

                <ChevronRight className={cn("w-4 h-4 text-[#D1D5DB] flex-shrink-0 transition-transform duration-200 ml-1", isExpanded && "rotate-90")} />
            </div>

            {/* ── Expanded Details ── */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-[#F9FAFB] border-t border-[#E5E7EB] px-4 py-4 space-y-4">

                            {/* Stats row */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-white rounded-xl p-3 text-center border border-[#E5E7EB]">
                                    <p className="text-[9px] font-black uppercase text-[#9CA3AF] tracking-widest">Inward</p>
                                    <p className="text-sm font-bold text-[#1A1A2E] mt-1">
                                        {format(new Date(lot.mfg_date || lot.created_at), 'dd MMM')}
                                    </p>
                                </div>
                                <div className="bg-white rounded-xl p-3 text-center border border-[#E5E7EB]">
                                    <p className="text-[9px] font-black uppercase text-[#9CA3AF] tracking-widest">Expiry</p>
                                    <p className="text-sm font-bold text-[#1A1A2E] mt-1">
                                        {lot.expiry_date ? format(new Date(lot.expiry_date), 'dd MMM') : 'None'}
                                    </p>
                                </div>
                                <div className="bg-white rounded-xl p-3 text-center border border-[#E5E7EB]">
                                    <p className="text-[9px] font-black uppercase text-[#9CA3AF] tracking-widest">Value</p>
                                    <p className="text-sm font-bold text-emerald-700 mt-1">
                                        ₹{((lot.current_qty || 0) * (lot.supplier_rate || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </p>
                                </div>
                            </div>

                            {/* Shelf life config */}
                            <div className="bg-white rounded-xl p-3 border border-[#E5E7EB]">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[9px] font-black uppercase text-[#9CA3AF] tracking-widest">Shelf Life Config</span>
                                    <Popover open={configOpen} onOpenChange={setConfigOpen}>
                                        <PopoverTrigger asChild>
                                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-full">
                                                <Pencil className="w-3 h-3 text-[#9CA3AF]" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-72 bg-white border-slate-200 text-black p-4 shadow-xl" side="top">
                                            <div className="space-y-4">
                                                <h4 className="font-black text-black">Shelf Life Config</h4>
                                                <p className="text-xs text-slate-500">Fresh 0→{shelfLifeDays}d, Aging {shelfLifeDays}→{criticalAgeDays}d, Critical after {criticalAgeDays}d.</p>
                                                <div className="grid gap-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Shelf Life (days)</Label>
                                                        <Input type="number" min={1} value={shelfLifeDays || ''} onChange={(e) => setShelfLifeDays(parseInt(e.target.value) || 1)} className="h-9 bg-amber-50 border-amber-200 text-amber-800 text-sm font-black rounded-lg" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Critical Age (days)</Label>
                                                        <Input type="number" min={1} value={criticalAgeDays || ''} onChange={(e) => setCriticalAgeDays(parseInt(e.target.value) || 1)} className="h-9 bg-red-50 border-red-200 text-red-800 text-sm font-black rounded-lg" />
                                                    </div>
                                                </div>
                                                <Button disabled={savingConfig} onClick={saveConfiguration} className="w-full bg-black hover:bg-slate-800 text-white font-black h-8 text-xs">
                                                    {savingConfig ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save Changes"}
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="flex gap-4">
                                    <div>
                                        <span className="text-[9px] text-[#9CA3AF] uppercase font-bold">Shelf Life</span>
                                        <p className="text-sm font-bold text-[#1A1A2E]">{shelfLifeDays}d</p>
                                    </div>
                                    <div>
                                        <span className="text-[9px] text-[#9CA3AF] uppercase font-bold">Critical Age</span>
                                        <p className="text-sm font-bold text-red-600">{criticalAgeDays}d</p>
                                    </div>
                                    <div>
                                        <span className="text-[9px] text-[#9CA3AF] uppercase font-bold">Age Now</span>
                                        <p className={cn("text-sm font-bold", statusColor)}>{daysSinceArrival}d</p>
                                    </div>
                                </div>
                            </div>

                            {/* Action buttons — full width touch targets */}
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={(e) => { e.stopPropagation(); onMoveStock() }}
                                    className="flex items-center justify-center gap-2 h-11 rounded-xl bg-white border border-[#E5E7EB] text-[#374151] text-sm font-semibold active:bg-[#F3F4F6] transition-colors">
                                    <ArrowRightLeft className="w-4 h-4 text-blue-500" /> Move Stock
                                </button>
                                {lot.arrival_type === 'direct' ? (
                                    <button onClick={(e) => { e.stopPropagation(); onWastage() }}
                                        className="flex items-center justify-center gap-2 h-11 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-semibold active:bg-red-100 transition-colors">
                                        <Trash2 className="w-4 h-4" /> Report Loss
                                    </button>
                                ) : (
                                    <button onClick={(e) => { e.stopPropagation(); onWastage() }}
                                        className="flex items-center justify-center gap-2 h-11 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 text-sm font-semibold active:bg-orange-100 transition-colors">
                                        <Trash2 className="w-4 h-4" /> Report Loss to Supplier
                                    </button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); onReturn() }}
                                    className="flex items-center justify-center gap-2 h-11 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 text-sm font-semibold active:bg-orange-100 transition-colors">
                                    <ArrowRightLeft className="w-4 h-4" /> Return Stock
                                </button>
                                {lot.arrival_type === 'direct' && (
                                    <button onClick={(e) => { e.stopPropagation(); onAdjust() }}
                                        className="flex items-center justify-center gap-2 h-11 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-semibold active:bg-indigo-100 transition-colors">
                                        <Percent className="w-4 h-4" /> Adjust Rate
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}



interface LotStockDialogProps {
    itemId: string
    itemName: string
    itemDetails?: any
    isOpen: boolean
    onClose: () => void
    onUpdate?: () => void
}

export function LotStockDialog({ itemId, itemName, itemDetails, isOpen, onClose, onUpdate }: LotStockDialogProps) {
    const { profile } = useAuth()
    const [lots, setLots] = useState<any[]>([])
    const [batches, setBatches] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedLot, setSelectedLot] = useState<any>(null)
    const [wastageLot, setWastageLot] = useState<any>(null)
    const [returnLot, setReturnLot] = useState<any>(null)
    const [adjustmentLot, setAdjustmentLot] = useState<any>(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [activeTab, setActiveTab] = useState<'lots' | 'batches'>('lots')

    useEffect(() => {
        if (isOpen && itemId) {
            fetchLots()
            if (false) {
                fetchBatches()
                setActiveTab('batches')
            }
        }
    }, [isOpen, itemId, profile])

    const fetchLots = async () => {
        setLoading(true)
        const { data } = await supabase
            .schema('mandi')
            .from('view_lot_stock')
            .select('*')
            .eq('item_id', itemId)
            .order('created_at', { ascending: false })

        if (data) setLots(data)
        setLoading(false)
    }

    const fetchBatches = async () => {
        const { data } = await supabase
            .from('batches')
            .select('*')
            .eq('item_id', itemId)
            .gt('current_qty', 0)
            .order('expiry_date', { ascending: true })
        if (data) setBatches(data)
    }

    const filteredLots = lots.filter(lot =>
        (lot.farmer_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (lot.farmer_city?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        ((lot.storage_location || 'Mandi').toLowerCase().includes(searchTerm.toLowerCase()))
    )

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="max-w-4xl bg-white border-slate-200 shadow-2xl text-black max-h-[85vh] overflow-y-auto custom-scrollbar p-0 gap-0">
                    <DialogHeader className="p-6 border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10 backdrop-blur-md">
                        <DialogTitle className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-3">
                                    <span className="text-3xl font-[1000] uppercase tracking-tighter text-black">{itemName}</span>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mt-1">
                                    Global Active Lots
                                </span>
                            </div>
                            {false && (
                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                    <button
                                        onClick={() => setActiveTab('batches')}
                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'batches' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                                    >
                                        Batches
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('lots')}
                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'lots' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                                    >
                                        Lots
                                    </button>
                                </div>
                            )}
                        </DialogTitle>
                        <div className="relative mt-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by Farmer, Location..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-white border-slate-200 pl-9 h-10 text-xs font-bold text-black placeholder:text-slate-400 focus:ring-0 focus:border-blue-500 rounded-xl shadow-sm transition-all"
                            />
                        </div>
                    </DialogHeader>

                    {loading ? (
                        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" /></div>
                    ) : (
                        <div className="p-6 bg-slate-50/30 min-h-[400px]">
                            {activeTab === 'batches' ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-4 gap-4 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                        <div>Batch Code</div>
                                        <div>Mfg Date</div>
                                        <div>Expiry</div>
                                        <div className="text-right">Stock</div>
                                    </div>
                                    {batches.length === 0 ? (
                                        <div className="py-20 text-center opacity-50 font-bold uppercase text-[10px]">No Batches found</div>
                                    ) : batches.map(batch => {
                                        const isExpired = batch.expiry_date && new Date(batch.expiry_date) < new Date();
                                        return (
                                            <div key={batch.id} className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-4 items-center hover:border-blue-300 transition-all">
                                                <div className="font-black text-black">{batch.batch_code}</div>
                                                <div className="text-xs font-bold text-slate-500">{batch.mfg_date ? format(new Date(batch.mfg_date), 'dd MMM yyyy') : '-'}</div>
                                                <div className={`text-xs font-bold ${isExpired ? 'text-red-600' : 'text-slate-500'}`}>
                                                    {batch.expiry_date ? format(new Date(batch.expiry_date), 'dd MMM yyyy') : 'No Expiry'}
                                                    {isExpired && <span className="block text-[8px] font-black uppercase">Expired</span>}
                                                </div>
                                                <div className="text-right font-black text-black">
                                                    {batch.current_qty} <span className="text-[8px] text-slate-400">UNITS</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <>
                                    <div className="mb-4">
                                        <StockAlertBanner commodityId={itemDetails?.id} commodityName={itemName} />
                                    </div>
                                    {filteredLots.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 opacity-50 space-y-4">
                                            <Package className="w-12 h-12 text-slate-300" />
                                            <div className="text-center text-slate-500 font-bold uppercase tracking-widest text-xs">
                                                {lots.length === 0 ? "No active lots found." : "No matching results."}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {/* List Header */}
                                            <div className="grid grid-cols-12 gap-4 px-6 pb-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                <div className="col-span-5">Farmer</div>
                                                <div className="col-span-4">Location</div>
                                                <div className="col-span-3 text-right">Qty</div>
                                            </div>

                                            {/* Scrollable List */}
                                            <div className="space-y-3">
                                                {filteredLots.map((lot) => (
                                                    <LotRow
                                                        key={lot.id}
                                                        lot={lot}
                                                        itemDefaults={itemDetails}
                                                        onMoveStock={() => setSelectedLot(lot)}
                                                        onWastage={() => setWastageLot(lot)}
                                                        onReturn={() => setReturnLot(lot)}
                                                        onAdjust={() => setAdjustmentLot(lot)}
                                                        onUpdate={fetchLots}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <TransferDialog
                isOpen={!!selectedLot}
                onClose={() => setSelectedLot(null)}
                lot={selectedLot}
                onSuccess={() => {
                    fetchLots()
                }}
            />

            <WastageDialog
                isOpen={!!wastageLot}
                onClose={() => setWastageLot(null)}
                lot={wastageLot}
                onSuccess={() => {
                    fetchLots()
                }}
            />

            <PurchaseReturnDialog
                isOpen={!!returnLot}
                onClose={() => setReturnLot(null)}
                lot={returnLot}
                onSuccess={() => {
                    fetchLots()
                }}
            />

            <PurchaseAdjustmentDialog
                isOpen={!!adjustmentLot}
                onClose={() => setAdjustmentLot(null)}
                lot={adjustmentLot}
                onSuccess={() => {
                    fetchLots()
                }}
            />
        </>
    )
}
