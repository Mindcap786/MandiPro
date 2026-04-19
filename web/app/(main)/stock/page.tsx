"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { supabase } from "@/lib/supabaseClient"
import { useLanguage } from "@/components/i18n/language-provider"
import {
    Loader2, Search, ArrowUpRight, Package,
    Snowflake, Warehouse, RefreshCw, Printer,
    LayoutGrid, LayoutList, StretchHorizontal,
    AlertTriangle, Clock, Grape, Banana, Cherry,
    Citrus, Apple as AppleIcon, Leaf, Carrot, Sprout, Plus,
} from "lucide-react"
import Link from "next/link"
import { getIntelligentVisual } from "@/lib/utils/commodity-mapping"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { LotStockDialog } from "@/components/inventory/lot-stock-dialog"
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion"
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache"
import { isNativePlatform } from "@/lib/capacitor-utils"
import { cn } from "@/lib/utils"

// Native components
import { NativeCard } from "@/components/mobile/NativeCard"
import { SegmentedControl } from "@/components/mobile/SegmentedControl"
import { BottomSheet } from "@/components/mobile/BottomSheet"
import { SkeletonStockGrid } from "@/components/mobile/ShimmerSkeleton"

// ──────────────────────────────────────────────────────────────────────────────
// ALL DATA LOGIC IDENTICAL — only JSX render changes
// ──────────────────────────────────────────────────────────────────────────────

const getStockColor = (percentage: number) => {
    if (percentage >= 50) return { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", shadow: "shadow-emerald-100", accent: "bg-emerald-500", label: "stable", nativeAccent: "#16A34A", nativeBg: "#DCFCE7" }
    if (percentage >= 10) return { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", shadow: "shadow-amber-100", accent: "bg-amber-500", label: "limited", nativeAccent: "#D97706", nativeBg: "#FEF3C7" }
    return { text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", shadow: "shadow-rose-100", accent: "bg-rose-500", label: "critical", nativeAccent: "#DC2626", nativeBg: "#FEE2E2" }
}

const getVisual = (itemName: string) =>
    getIntelligentVisual(itemName, { Package, Grape, Banana, Citrus, Carrot, Sprout, Apple: AppleIcon, Leaf, Cherry })

// ── Native Stock Card — 2-column grid item ──────────────────────────────────

function NativeStockCard({ item, onOpen }: { item: any; onOpen: () => void }) {
    const { t } = useLanguage()
    const [imgError, setImgError] = useState(false)
    const currentQty = Number(item.current_stock) || 0
    const capacity = Number(item.total_inward) || 200
    const percentage = capacity > 0 ? Math.min((currentQty / capacity) * 100, 100) : 0
    const colors = getStockColor(percentage)
    const visual = getVisual(item.item_name)
    const finalVisual = item.image_url ? { type: 'img' as const, src: item.image_url } : visual
    const activeVisual = (finalVisual.type === 'img' && !imgError) ? finalVisual : { type: 'icon' as const, icon: (finalVisual as any).icon || Package }

    return (
        <button
            onClick={onOpen}
            className="w-full bg-white rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-left active:scale-95 transition-transform duration-150"
        >
            {/* Visual area */}
            <div className="relative h-32 flex items-center justify-center overflow-hidden" style={{ backgroundColor: activeVisual.type === 'img' ? '#F8FAFC' : colors.nativeBg }}>
                {activeVisual.type === 'img' ? (
                    <img src={activeVisual.src} onError={() => setImgError(true)} className="w-full h-full object-cover mix-blend-multiply transition-transform duration-300 group-active:scale-105" alt={item.item_name} />
                ) : (
                    activeVisual.icon && (
                        <activeVisual.icon className={`w-14 h-14 ${colors.text}`} strokeWidth={1.5} />
                    )
                )}
                {/* Status badge */}
                <span className={cn(
                    "absolute top-2 right-2 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full",
                    colors.bg, colors.text, colors.border, "border"
                )}>
                    {t(`stock.${colors.label}`) || colors.label}
                </span>
                {/* Alert pills */}
                {Number(item.critical_stock) > 0 && (
                    <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-red-100 text-red-600 text-[8px] font-bold px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-2.5 h-2.5" /> {Number(item.critical_stock)} CRIT
                    </span>
                )}
            </div>

            {/* Info */}
            <div className="p-3">
                <p className="text-sm font-bold text-[#1A1A2E] truncate mb-1" title={item.item_name}>
                    {item.item_name}
                </p>
                <div className="flex items-center gap-1 mb-2">
                    {item.storage_location === 'Cold Storage'
                        ? <Snowflake className="w-3 h-3 text-purple-500 flex-shrink-0" />
                        : <Warehouse className="w-3 h-3 text-blue-500 flex-shrink-0" />}
                    <span className="text-[9px] text-[#6B7280] uppercase tracking-wide truncate">
                        {item.storage_location || 'Mandi'}
                    </span>
                </div>
                {/* Stock qty and value */}
                <div className="flex items-baseline gap-2 justify-between">
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-[#1A1A2E] tabular-nums">
                            {currentQty.toLocaleString()}
                        </span>
                        <span className="text-[9px] font-semibold text-[#6B7280] uppercase">{item.unit || 'BOX'}</span>
                    </div>
                    {item.total_value > 0 && (
                        <div className="text-xs font-bold text-emerald-700 tabular-nums">
                            ₹{Math.round(item.total_value).toLocaleString('en-IN')}
                        </div>
                    )}
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${percentage}%`, backgroundColor: colors.nativeAccent }}
                    />
                </div>
            </div>
        </button>
    )
}

// ── Native compact list row ──────────────────────────────────────────────────

function NativeStockListRow({ item, onOpen }: { item: any; onOpen: () => void }) {
    const { t } = useLanguage()
    const [imgError, setImgError] = useState(false)
    const currentQty = Number(item.current_stock) || 0
    const capacity = Number(item.total_inward) || 200
    const percentage = capacity > 0 ? Math.min((currentQty / capacity) * 100, 100) : 0
    const colors = getStockColor(percentage)
    const visual = getVisual(item.item_name)
    const finalVisual = item.image_url ? { type: 'img' as const, src: item.image_url } : visual
    const activeVisual = (finalVisual.type === 'img' && !imgError) ? finalVisual : { type: 'icon' as const, icon: (finalVisual as any).icon || Package }

    return (
        <button
            onClick={onOpen}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white active:bg-gray-50 transition-colors duration-100 text-left border-b border-[#E5E7EB] last:border-0"
        >
            {/* Status bar */}
            <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: colors.nativeAccent }} />

            {/* Icon */}
            <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: colors.nativeBg }}>
                {activeVisual.type === 'img' ? (
                    <img src={activeVisual.src} onError={() => setImgError(true)} className="w-8 h-8 object-contain" alt="" />
                ) : (
                    activeVisual.icon && <activeVisual.icon className={`w-5 h-5 ${colors.text}`} strokeWidth={2} />
                )}
            </div>

            {/* Name + location */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1A1A2E] truncate">{item.item_name}</p>
                <p className="text-xs text-[#9CA3AF] truncate">{item.storage_location || 'Mandi'}</p>
            </div>

            {/* Qty */}
            <div className="text-right flex-shrink-0">
                <p className="text-base font-bold text-[#1A1A2E] tabular-nums">{currentQty.toLocaleString()}</p>
                <p className="text-[9px] font-semibold text-[#9CA3AF] uppercase">{item.unit || 'BOX'}</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" />
        </button>
    )
}

// ── Original web components (unchanged) ─────────────────────────────────────

function AssetCard({ item, onOpen }: { item: any; onOpen: () => void }) {
    const { t } = useLanguage()
    const x = useMotionValue(0)
    const y = useMotionValue(0)
    const mouseXSpring = useSpring(x)
    const mouseYSpring = useSpring(y)
    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["5deg", "-5deg"])
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-5deg", "5deg"])
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - rect.left) / rect.width - 0.5)
        y.set((e.clientY - rect.top) / rect.height - 0.5)
    }
    const [imgError, setImgError] = useState(false)
    const currentQty = Number(item.current_stock) || 0
    const capacity = Number(item.total_inward) || 200
    const percentage = capacity > 0 ? Math.min((currentQty / capacity) * 100, 100) : 0
    const colors = getStockColor(percentage)
    const visual = getVisual(item.item_name)
    const finalVisual = item.image_url ? { type: 'img' as const, src: item.image_url } : visual
    const activeVisual = (finalVisual.type === 'img' && !imgError) ? finalVisual : { type: 'icon' as const, icon: (finalVisual as any).icon || Package }

    return (
        <motion.div
            style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => { x.set(0); y.set(0); }}
            onClick={onOpen}
            className="group cursor-pointer relative h-[500px] w-full rounded-[32px] bg-white border border-slate-200 shadow-xl shadow-slate-200/50 transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] overflow-hidden"
        >
            <div className="absolute inset-x-0 top-0 p-6 z-20 space-y-4" style={{ transform: "translateZ(20px)" }}>
                <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0 pr-4">
                        <h3 className="text-3xl font-[1000] text-black uppercase tracking-tight leading-[0.9] truncate">{item.item_name}</h3>
                        <div className="flex flex-wrap gap-2 mt-3">
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
                                {item.arrival_type === 'commission' ? t('stock.farmer_comm') : item.arrival_type === 'commission_supplier' ? t('stock.supplier_comm') : (item.arrival_type === 'direct' ? 'DIRECT PURCHASE' : item.arrival_type)}
                            </span>
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border bg-slate-50 ${item.storage_location === 'Cold Storage' ? 'text-purple-700 border-purple-100' : 'text-blue-700 border-blue-100'}`}>
                                {item.storage_location === 'Cold Storage' ? <Snowflake className="w-3 h-3" /> : <Warehouse className="w-3 h-3" />}
                                <span className="text-[9px] font-black uppercase tracking-widest">{item.storage_location || 'Mandi'}</span>
                            </div>
                        </div>
                        {Number(item.critical_stock) > 0 && (<div className="flex items-center gap-1.5 px-2 py-0.5 mt-2 rounded-lg border border-red-200 bg-red-50 text-red-600 animate-pulse w-fit"><AlertTriangle className="w-3 h-3" /><span className="text-[9px] font-black uppercase tracking-widest">{t('stock.critical')} ({Number(item.critical_stock)} {item.unit})</span></div>)}
                        {Number(item.aging_stock) > 0 && (<div className="flex items-center gap-1.5 px-2 py-0.5 mt-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-600 w-fit"><Clock className="w-3 h-3" /><span className="text-[9px] font-black uppercase tracking-widest">{t('stock.aging')} ({Number(item.aging_stock)} {item.unit})</span></div>)}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${colors.border} ${colors.bg} ${colors.text}`}>{t(`stock.${colors.label}`)}</div>
                        <div className={`text-xl font-[1000] italic ${colors.text}`}>{percentage.toFixed(0)}%</div>
                    </div>
                </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none" style={{ transform: "translateZ(40px)" }}>
                {activeVisual.type === 'img' ? (<motion.div className="relative group-hover:scale-110 transition-transform duration-500 ease-out"><img src={activeVisual.src} onError={() => setImgError(true)} className="w-48 h-48 object-contain drop-shadow-xl" alt={item.item_name} /></motion.div>) : (<div className="flex flex-col items-center justify-center relative scale-110"><div className={`w-40 h-40 rounded-full ${colors.bg} flex items-center justify-center border ${colors.border}`}>{activeVisual.icon && <activeVisual.icon className={`w-20 h-20 ${colors.text}`} strokeWidth={1.5} />}</div></div>)}
            </div>
            <div className="absolute inset-x-0 bottom-0 p-6 z-20 space-y-4 bg-slate-50/80 backdrop-blur-sm border-t border-slate-100" style={{ transform: "translateZ(30px)" }}>
                <div className="flex items-end justify-between">
                    <div className="space-y-1">
                        <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">{t('stock.total_holding')}</span>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full max-w-[240px]">
                            {Object.entries(item.units || { [item.unit || 'BOX']: currentQty }).map(([u, q]: any) => (<div key={u} className="flex items-baseline gap-1"><span className="text-[1.7rem] font-[1000] tracking-tighter leading-none text-black">{Number(q).toLocaleString()}</span><span className="text-[9px] font-black text-slate-800 uppercase tracking-widest">{u}</span></div>))}
                            {(item.total_value > 0) && (
                                <div className="flex items-baseline gap-1">
                                    <span className="text-xl font-[900] tracking-tighter leading-none text-emerald-700">₹{Math.round(item.total_value).toLocaleString('en-IN')}</span>
                                    <span className="text-[9px] font-black text-emerald-600/80 uppercase tracking-widest">Value</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="h-10 w-10 flex-shrink-0 self-end flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-900 shadow-sm ml-2"><ArrowUpRight className="w-5 h-5" /></div>
                </div>
                <div className="space-y-2">
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }} className={`h-full rounded-full ${colors.accent}`} />
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN PAGE — data fetching identical, render branches on isNativePlatform()
// ──────────────────────────────────────────────────────────────────────────────

export default function StockPage() {
    const { profile } = useAuth()
    const { t } = useLanguage()
    const _orgId = typeof window !== 'undefined' ? localStorage.getItem('mandi_org_id') : profile?.organization_id
    const _cached = _orgId ? cacheGet<any[]>('stock_main', _orgId) : null

    const [stocks, setStocks] = useState<any[]>(_cached || [])
    const [locations, setLocations] = useState<string[]>(['All', 'Mandi', 'Cold Storage'])
    const [loading, setLoading] = useState(() => {
        if (typeof window !== 'undefined') {
            const orgId = localStorage.getItem('mandi_org_id')
            const cached = orgId ? cacheGet<any[]>('stock_main', orgId) : null
            return !cached || cached.length === 0
        }
        return true
    })
    const [searchTerm, setSearchTerm] = useState("")
    const [locationFilter, setLocationFilter] = useState('All')
    const [arrivalFilter, setArrivalFilter] = useState('All')
    const [selectedItem, setSelectedItem] = useState<any | null>(null)
    const [viewMode, setViewMode] = useState<'gallery' | 'compact' | 'list'>('gallery')
    const [auditPrinting, setAuditPrinting] = useState(false)
    const isFetching = useRef(false)

    useEffect(() => {
        if (profile?.organization_id) {
            const cached = cacheGet<any[]>('stock_main', profile.organization_id)
            if (cached && stocks.length === 0) { setStocks(cached); setLoading(false) }
        }
    }, [profile?.organization_id])

    const fetchData = async (isManualRefresh = false) => {
        if (!profile?.organization_id) return
        if (isFetching.current) return
        
        const orgId = profile.organization_id
        const isStale = cacheIsStale('stock_main', orgId!)
        
        // If not stale and not manual refresh, we are done
        if (!isStale && !isManualRefresh && stocks.length > 0) {
            setLoading(false)
            return
        }

        isFetching.current = true
        const isBackgroundRefresh = stocks.length > 0 && !isManualRefresh
        if (!isBackgroundRefresh) setLoading(true)

        try {
            // SINGLE QUERY: view_location_stock now contains total_value and last_arrival_date
            const { data: stockData, error: stockErr } = await supabase
                .schema('mandi')
                .from('view_location_stock')
                .select('*')
                .eq('organization_id', orgId)

            if (stockErr) throw stockErr

            let validStockData: any[] = stockData || []
            
            // DEFENSIVE FALLBACK: If total_value is missing (migration hasn't run yet), fetch lots
            const hasFinancials = validStockData.length > 0 && ('total_value' in validStockData[0])
            
            if (!hasFinancials && validStockData.length > 0) {
                const { data: lots } = await supabase.schema('mandi').from('lots')
                    .select('item_id, storage_location, current_qty, supplier_rate')
                    .eq('organization_id', orgId)
                    .gt('current_qty', 0)
                
                if (lots) {
                    const valueMap: Record<string, number> = {}
                    lots.forEach(l => {
                        const key = `${l.item_id}_${l.storage_location || 'Mandi'}`
                        const val = (Number(l.current_qty) || 0) * (Number(l.supplier_rate) || 0)
                        valueMap[key] = (valueMap[key] || 0) + val
                    })

                    const qtyMap: Record<string, number> = {}
                    validStockData.forEach(s => {
                        const key = `${s.item_id}_${s.storage_location || 'Mandi'}`
                        qtyMap[key] = (qtyMap[key] || 0) + Number(s.current_stock || 0)
                    })

                    validStockData = validStockData.map(s => {
                        const key = `${s.item_id}_${s.storage_location || 'Mandi'}`
                        const totalQty = qtyMap[key] || 1
                        const myQty = Number(s.current_stock || 0)
                        const distributionPortion = myQty / totalQty
                        return { ...s, total_value: (valueMap[key] || 0) * distributionPortion }
                    })
                }
            }

            const processedData = validStockData.filter(s => Number(s.current_stock) > 0)
            setStocks(processedData)
            cacheSet('stock_main', orgId, processedData)

            // Background fetch storage locations once
            if (locations.length <= 3) {
                const { data: locData } = await supabase
                    .schema('mandi')
                    .from('storage_locations')
                    .select('name')
                    .eq('organization_id', orgId)
                    .eq('is_active', true)
                    .order('created_at')
                
                if (locData) {
                    const dynamicLocs = locData.map(l => l.name.trim())
                    setLocations(Array.from(new Set(['All', ...dynamicLocs].filter(Boolean))))
                }
            }
        } catch (err) { 
            console.error("[Stock] Fetch error:", err) 
        } finally { 
            isFetching.current = false
            setLoading(false) 
        }
    }

    useEffect(() => { fetchData() }, [profile?.organization_id])

    const handleAuditPrint = async () => {
        if (auditPrinting) return;
        try {
            setAuditPrinting(true);
            const { generateStockAuditPDF } = await import('@/lib/generate-stock-pdf');
            const { downloadBlob } = await import('@/lib/capacitor-share');
            const orgName = profile?.organization?.name || 'Mandi Organisation';
            const branding = profile?.organization;
            // Prepare stock items from uniqueItems (aggregated)
            const stockForPDF = uniqueItems.map((item: any) => ({
                name: item.item_name,
                arrival_type: item.arrival_type,
                location: item.storage_location || 'Mandi',
                total_quantity: Number(item.current_stock || 0),
                capacity: Number(item.total_inward || 0),
                has_aging: Number(item.aging_stock || 0) > 0,
                critical_stock: Number(item.critical_stock || 0),
                total_value: Number(item.total_value || 0),
                created_at: item.last_arrival_date,
                lots: [],
            }));
            const blob = await generateStockAuditPDF(stockForPDF, orgName, branding);
            const filename = `StockAudit_${orgName}_${new Date().toISOString().slice(0,10)}.pdf`;
            await downloadBlob(blob, filename);
        } catch (err: any) {
            console.error('[AuditPrint] failed:', err);
            alert(`Failed to generate audit report: ${err?.message || err}`);
        } finally {
            setAuditPrinting(false);
        }
    };

    // DEBUNCED REALTIME: Don't hammer the DB on every lot change
    useEffect(() => {
        if (!profile?.organization_id) return;
        const orgId = profile.organization_id;
        
        let timeout: NodeJS.Timeout;
        const channel = supabase.channel(`realtime-stock-${orgId}`)
            .on('postgres_changes', 
                { event: '*', schema: 'mandi', table: 'lots', filter: `organization_id=eq.${orgId}` }, 
                () => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => fetchData(true), 1500); // 1.5s debounce
                }
            )
            .subscribe();
            
        return () => { 
            supabase.removeChannel(channel);
            clearTimeout(timeout);
        };
    }, [profile?.organization_id]);

    const getAvailabilityCount = (typeId: string) => {
        const matchingStocks = stocks.filter(item => {
            const loc = item.storage_location || 'Mandi'
            return (locationFilter === 'All' || loc === locationFilter) && (typeId === 'All' || item.arrival_type === typeId)
        })
        return new Set(matchingStocks.map(item => item.item_id)).size
    }

    const filteredStock = stocks.filter(item => {
        const matchesSearch = item.item_name?.toLowerCase().includes(searchTerm.toLowerCase())
        const loc = item.storage_location || 'Mandi'
        return matchesSearch && (locationFilter === 'All' || loc === locationFilter) && (arrivalFilter === 'All' || item.arrival_type === arrivalFilter)
    })

    // Aggregation stays client-side because users filter by source/location dynamically,
    // but we've simplified the data it works with.
    const aggregatedStock = filteredStock.reduce((acc, curr) => {
        const u = curr.unit || 'BOX'
        if (!acc[curr.item_id]) {
            acc[curr.item_id] = { ...curr, units: { [u]: parseFloat(curr.current_stock) } }
        } else {
            acc[curr.item_id].units[u] = (acc[curr.item_id].units[u] || 0) + parseFloat(curr.current_stock)
            acc[curr.item_id].current_stock = (parseFloat(acc[curr.item_id].current_stock) + parseFloat(curr.current_stock)).toString()
            acc[curr.item_id].total_inward = (parseFloat(acc[curr.item_id].total_inward) + parseFloat(curr.total_inward)).toString()
            acc[curr.item_id].critical_stock = (Number(acc[curr.item_id].critical_stock || 0) + Number(curr.critical_stock || 0))
            acc[curr.item_id].aging_stock = (Number(acc[curr.item_id].aging_stock || 0) + Number(curr.aging_stock || 0))
            acc[curr.item_id].total_value = (Number(acc[curr.item_id].total_value || 0) + Number(curr.total_value || 0))
            if (!acc[curr.item_id].image_url && curr.image_url) acc[curr.item_id].image_url = curr.image_url
        }
        return acc
    }, {} as Record<string, any>)

    const uniqueItems = Object.values(aggregatedStock)
    const totalHolding = uniqueItems.reduce((sum: number, i: any) => sum + Number(i.current_stock), 0)
    const totalStockValue = uniqueItems.reduce((sum: number, i: any) => sum + Number(i.total_value || 0), 0)

    // ── NATIVE MOBILE RENDER ─────────────────────────────────────────────────
    if (isNativePlatform()) {
        // Location filter options
        const locationOptions = locations.map(loc => ({ label: loc, value: loc, count: loc === 'All' ? uniqueItems.length : uniqueItems.filter((i: any) => (i.storage_location || 'Mandi') === loc).length }))


        // Arrival type options
        const typeOptions = [
            { label: 'All', value: 'All', count: getAvailabilityCount('All') },
            { label: 'Direct', value: 'direct', count: getAvailabilityCount('direct') },
            { label: 'Farmer', value: 'commission', count: getAvailabilityCount('commission') },
            { label: 'Supplier', value: 'commission_supplier', count: getAvailabilityCount('commission_supplier') },
        ]

        const viewModeOptions = [
            { label: 'Grid', value: 'compact' },
            { label: 'List', value: 'list' },
        ]

        if (loading) return <SkeletonStockGrid />

        return (
            <div className="bg-[#EFEFEF] min-h-dvh pb-4">
                {/* Search bar + actions */}
                <div className="px-4 pt-3 flex gap-2">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                        <input
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder={t('stock.search_placeholder') || 'Search commodities…'}
                            className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-[#E5E7EB] text-sm text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1A6B3C]"
                        />
                    </div>
                    <button
                        onClick={handleAuditPrint}
                        disabled={auditPrinting}
                        className="w-11 h-11 rounded-xl bg-[#1A1A2E] flex items-center justify-center active:scale-95 transition-transform"
                    >
                        {auditPrinting ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Printer className="w-4 h-4 text-white" />}
                    </button>
                    <button
                        onClick={() => fetchData(true)}
                        className="w-11 h-11 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <RefreshCw className={cn("w-4 h-4 text-[#6B7280]", loading && "animate-spin")} />
                    </button>
                </div>

                {/* Total holding + view toggle */}
                <div className="px-4 pt-3 flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">{t('stock.total_holding') || 'Total Stock'}</p>
                            <p className="text-2xl font-bold text-[#1A1A2E] tabular-nums">{totalHolding.toLocaleString()} <span className="text-xs text-[#6B7280] font-medium">units</span></p>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-emerald-700 tabular-nums">₹{Math.round(Number(totalStockValue)).toLocaleString('en-IN')} <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Value</span></p>
                        </div>
                    </div>
                    {/* View toggle */}
                    <div className="flex p-1 bg-white rounded-xl border border-[#E5E7EB]">
                        {viewModeOptions.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setViewMode(opt.value as any)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200",
                                    viewMode === opt.value ? "bg-[#1A6B3C] text-white" : "text-[#6B7280]"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Location filter */}
                <SegmentedControl options={locationOptions} value={locationFilter} onChange={setLocationFilter} className="px-0" />

                {/* Arrival type filter */}
                <SegmentedControl options={typeOptions} value={arrivalFilter} onChange={setArrivalFilter} className="px-0 pt-0" />

                {/* Stock items grid/list */}
                <div className={cn("px-4", viewMode === 'compact' ? "grid grid-cols-2 gap-3" : "space-y-1 bg-white rounded-2xl overflow-hidden mx-4 shadow-card")}>
                    {uniqueItems.length === 0 ? (
                        <div className={cn("flex flex-col items-center justify-center py-16 text-[#9CA3AF]", viewMode === 'compact' ? "col-span-2" : "")}>
                            <Package className="w-12 h-12 mb-3 opacity-30" />
                            <p className="text-sm font-medium">{t('stock.no_stock') || 'No stock found'}</p>
                        </div>
                    ) : (
                        uniqueItems.map((item: any) =>
                            viewMode === 'compact' ? (
                                <NativeStockCard key={item.item_id} item={item} onOpen={() => setSelectedItem(item)} />
                            ) : (
                                <NativeStockListRow key={item.item_id} item={item} onOpen={() => setSelectedItem(item)} />
                            )
                        )
                    )}
                </div>

                {/* Detail sheet */}
                {selectedItem && (
                    <LotStockDialog
                        itemId={selectedItem.item_id}
                        itemName={selectedItem.item_name}
                        itemDetails={selectedItem}
                        isOpen={!!selectedItem}
                        onClose={() => setSelectedItem(null)}
                        onUpdate={() => fetchData()}
                    />
                )}
            </div>
        )
    }

    // ── WEB RENDER (ORIGINAL — UNCHANGED) ────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-50 overflow-x-hidden pb-40 px-6 sm:px-12">
            <div className="max-w-[1700px] mx-auto pt-10 pb-6 space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-blue-600 font-black tracking-widest text-[10px] uppercase">
                            <div className="h-[2px] w-8 bg-blue-600" />{t('stock.inventory_mgmt')}
                        </div>
                        <h1 className="text-5xl font-[1000] text-black tracking-tighter uppercase italic">
                            {t('stock.title').split(' ')[0]} <span className="text-blue-600">{t('stock.title').split(' ').slice(1).join(' ')}</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-8">
                        <div className="flex p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
                            <button onClick={() => setViewMode('gallery')} className={`p-2.5 rounded-lg transition-all ${viewMode === 'gallery' ? 'bg-slate-100 text-black' : 'text-slate-400 hover:text-black'}`}><LayoutGrid className="w-5 h-5" /></button>
                            <button onClick={() => setViewMode('compact')} className={`p-2.5 rounded-lg transition-all ${viewMode === 'compact' ? 'bg-slate-100 text-black' : 'text-slate-400 hover:text-black'}`}><StretchHorizontal className="w-5 h-5" /></button>
                            <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-slate-100 text-black' : 'text-slate-400 hover:text-black'}`}><LayoutList className="w-5 h-5" /></button>
                        </div>
                        <div className="h-10 w-[1px] bg-slate-200" />
                        <div className="flex gap-8 text-right">
                            <div className="text-right">
                                <div className="text-[8px] font-black text-slate-700 tracking-widest uppercase mb-0.5">{t('stock.total_holding')}</div>
                                <div className="text-4xl font-black text-black tabular-nums tracking-tighter leading-none">{totalHolding.toLocaleString()}<span className="text-[10px] text-blue-700 ml-2 tracking-widest font-black">{t('stock.units')}</span></div>
                            </div>
                            <div className="text-right hidden md:block">
                                <div className="text-[8px] font-black text-emerald-600/70 tracking-widest uppercase mb-0.5">Stock Value</div>
                                <div className="text-4xl font-black text-emerald-700 tabular-nums tracking-tighter leading-none">₹{Math.round(Number(totalStockValue)).toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => fetchData(true)} className="h-11 w-11 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-black hover:border-slate-300 transition-all shadow-sm"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
                            <Button onClick={handleAuditPrint} disabled={auditPrinting} className="h-11 px-5 rounded-xl bg-black text-white hover:bg-slate-800 font-black uppercase tracking-widest text-[10px] shadow-lg">
                                {auditPrinting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                                {auditPrinting ? 'Generating...' : t('stock.audit_print')}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 pb-2">
                    {[{ id: 'All', label: 'All Sources' }, { id: 'direct', label: 'Direct Purchase' }, { id: 'commission_supplier', label: 'Supplier Comm.' }, { id: 'commission', label: 'Farmer Comm.' }].map((type) => {
                        const count = getAvailabilityCount(type.id)
                        const isActive = arrivalFilter === type.id
                        const isZero = count === 0
                        return (
                            <button key={type.id} onClick={() => setArrivalFilter(type.id)} disabled={isZero && type.id !== 'All'} className={`px-4 h-9 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border ${isActive ? 'bg-black text-white border-black shadow-lg' : isZero ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-70' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-black'}`}>
                                {type.label}<span className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold ${isActive ? 'bg-white/20 text-white' : isZero ? 'bg-slate-100 text-slate-300' : 'bg-slate-100 text-slate-400'}`}>{count}</span>
                            </button>
                        )
                    })}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                    <div className="xl:col-span-4 relative">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('stock.search_placeholder')} className="h-14 pl-14 bg-white border-slate-200 rounded-2xl text-lg font-black text-black placeholder:text-slate-400 transition-all focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm" />
                    </div>
                    <div className="xl:col-span-8 overflow-x-auto pb-2 scrollbar-none flex justify-start xl:justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="min-w-[200px] h-14 px-6 flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest text-black hover:bg-slate-50 transition-all shadow-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500">
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-400">STORAGE:</span> 
                                        <span>{locationFilter}</span>
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><path d="m6 9 6 6 6-6"/></svg>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[200px] font-bold tracking-widest text-[10px] uppercase p-2 rounded-xl custom-scrollbar max-h-64 overflow-y-auto shadow-xl border-slate-200">
                                {locations.map(f => (
                                    <DropdownMenuItem key={f} onClick={() => setLocationFilter(f)} className={`truncate py-3 px-4 rounded-lg cursor-pointer flex items-center justify-between ${locationFilter === f ? 'bg-black text-white' : 'text-slate-600 hover:text-black hover:bg-slate-100'}`}>
                                        {f}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {loading ? (
                    <div className="py-60 flex flex-col items-center gap-8"><Loader2 className="w-16 h-16 animate-spin text-blue-600 opacity-20" /><div className="text-[10px] font-black tracking-[0.4em] text-slate-400 uppercase">Synchronizing Inventory...</div></div>
                ) : (
                    <div className={viewMode === 'gallery' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8" : viewMode === 'compact' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" : "flex flex-col gap-3"}>
                        <AnimatePresence>
                            {uniqueItems.map((item: any) => (
                                <AssetCard key={item.item_id} item={item} onOpen={() => setSelectedItem(item)} />
                            ))}
                        </AnimatePresence>
                        {uniqueItems.length === 0 && !loading && (
                            <div className="col-span-full py-20 text-center opacity-50"><Package className="w-16 h-16 mx-auto mb-4 text-slate-300" /><h3 className="text-xl font-black uppercase text-slate-400">{t('stock.no_stock')}</h3><p className="text-sm text-slate-500 font-medium">Try adjusting your filters or check Inward Logs.</p></div>
                        )}
                    </div>
                )}
            </div>
            {selectedItem && (
                <LotStockDialog itemId={selectedItem.item_id} itemName={selectedItem.item_name} itemDetails={selectedItem} isOpen={!!selectedItem} onClose={() => setSelectedItem(null)} onUpdate={() => fetchData()} />
            )}
        </div>
    )
}
