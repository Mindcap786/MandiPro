"use client"
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { supabase } from "@/lib/supabaseClient"
import { isSameDay } from "date-fns"
import { GateEntryForm } from "@/components/gate/gate-entry-form"
import { Search, Loader2, Clock, CheckCircle2, XCircle, Printer, ArrowRight, Package, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Truck, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { format, startOfDay, endOfDay, subDays } from "date-fns"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from "@/components/ui/dialog"

import { useLanguage } from "@/components/i18n/language-provider"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export default function GatePage() {
    const { profile } = useAuth()
    const { t } = useLanguage()
    const router = useRouter()
    
    const _orgId = profile?.organization_id
    const _cached = _orgId ? cacheGet<any>('gate_entries_list', _orgId) : null

    const [entries, setEntries] = useState<any[]>(_cached?.entries || [])
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [totalCount, setTotalCount] = useState(_cached?.totalCount || 0)
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 15),
        to: new Date()
    })
    const [entryToDelete, setEntryToDelete] = useState<any>(null)
    const [deleteConfirmText, setDeleteConfirmText] = useState("")
    const [isDeleting, setIsDeleting] = useState(false)
    const [isInitialLoad, setIsInitialLoad] = useState(true)
    const [loading, setLoading] = useState(() => {
        if (typeof window === 'undefined') return true
        const cachedProfile = localStorage.getItem('mandi_profile_cache')
        let orgId = profile?.organization_id
        if (!orgId && cachedProfile) {
            try {
                orgId = JSON.parse(cachedProfile).organization_id
            } catch (e) {}
        }
        if (orgId) {
            // If we have an OrgID and ANY cached data, don't show the initial loader
            const cacheKey = `gate_entries_list_1_last15d`
            const cached = cacheGet<any>(cacheKey, orgId)
            if (cached) return false
        }
        return !profile // Fallback to auth sync only if no cache exists
    })
    const pageSize = 10
    const MAX_PAGES_UNFILTERED = 3

    const [showRecovery, setShowRecovery] = useState(false)

    useEffect(() => {
        let timeout: any;
        if (loading) {
            timeout = setTimeout(() => {
                setShowRecovery(true)
                // Attempt a deep re-fetch as a last resort
                if (!profile?.organization_id) {
                    console.warn("[Gate] Loading timeout reached. Forcing identity sync...");
                }
            }, 5000)
        } else {
            setShowRecovery(false)
        }
        return () => clearTimeout(timeout)
    }, [loading, profile?.organization_id])

    useEffect(() => {
        const cachedStr = typeof window !== 'undefined' ? localStorage.getItem('mandi_profile_cache') : null;
        const cachedOrgId = cachedStr ? JSON.parse(cachedStr).organization_id : null;
        const orgId = profile?.organization_id || cachedOrgId;

        if (orgId) {
            fetchEntries(orgId)
        }
    }, [profile?.organization_id, page, dateRange])

    const isDefaultRange = dateRange?.from && isSameDay(dateRange.from, subDays(new Date(), 15)) && dateRange?.to && isSameDay(dateRange.to, new Date())
    const fetchEntries = async (forceOrgId?: string) => {
        const orgId = forceOrgId || profile?.organization_id
        if (!orgId) return

        const cacheKey = `gate_entries_list_${page}_${dateRange?.from ? format(dateRange.from, 'yyyyMMdd') : 'all'}_${dateRange?.to ? format(dateRange.to, 'yyyyMMdd') : 'all'}`
        const cached = cacheGet<any>(cacheKey, orgId)
        
        if (cached) {
            setEntries(cached.entries || [])
            setTotalCount(cached.totalCount || 0)
            setLoading(false)
            setIsInitialLoad(false)
            
            // If cache is fresh, we still trigger background fetch to ensure sync across pages.
            if (!cacheIsStale(cacheKey, orgId)) {
                // (Optional: can add logic here to skip fetch if recently fetched < 5s ago)
            }
        } else {
            if (isInitialLoad && !cached) {
                setLoading(true)
            }
        }

        try {
            let query = supabase
                .schema('mandi')
                .from('gate_entries')
                .select('*', { count: 'exact' })
                .eq('organization_id', orgId)
                .order('created_at', { ascending: false })

            // Apply date range filter
            if (dateRange?.from) {
                query = query.gte('created_at', startOfDay(dateRange.from).toISOString())
            }
            if (dateRange?.to) {
                query = query.lte('created_at', endOfDay(dateRange.to).toISOString())
            }

            // Pagination
            const from = (page - 1) * pageSize
            const to = from + pageSize - 1
            query = query.range(from, to)

            const { data, error, count } = await query

            if (data) {
                setEntries(data)
                setTotalCount(count || 0)
                cacheSet(cacheKey, orgId, { entries: data, totalCount: count || 0 })
            }
        } catch (err) {
            console.error("Gate fetch error:", err)
        } finally {
            setLoading(false)
            setIsInitialLoad(false)
        }
    }

    const filteredEntries = entries.filter(e =>
        e.vehicle_number?.toLowerCase().includes(search.toLowerCase()) ||
        e.driver_name?.toLowerCase().includes(search.toLowerCase())
    )

    const updateStatus = async (id: string, status: string) => {
        // Optimistic UI update for immediate feedback
        setEntries(prev => prev.map(e => e.id === id ? { ...e, status } : e));

        const { error } = await supabase
            .schema('mandi')
            .from('gate_entries')
            .update({ status })
            .eq('id', id)

        if (error) {
            toast.error("Failed to update status");
            // Revert state if failed
            fetchEntries(); 
            return;
        }

        toast.success(`Marked as ${status.replace('_', ' ')}`);
        
        // Clear cache so next fetch gets fresh data
        const orgId = profile?.organization_id;
        if (orgId) {
            const cacheKey = `gate_entries_list_${page}_${dateRange?.from ? format(dateRange.from, 'yyyyMMdd') : 'all'}_${dateRange?.to ? format(dateRange.to, 'yyyyMMdd') : 'all'}`;
            cacheSet(cacheKey, orgId, null);
        }
    }

    const handleDelete = async () => {
        if (!entryToDelete || deleteConfirmText !== 'DELETE') return
        setIsDeleting(true)
        try {
            const { error } = await supabase
                .schema('mandi')
                .from('gate_entries')
                .delete()
                .eq('id', entryToDelete.id)

            if (error) throw error

            toast.success("Gate Entry Deleted")
            setEntries(entries.filter(e => e.id !== entryToDelete.id))
            setTotalCount(prev => prev - 1)
            setEntryToDelete(null)
            setDeleteConfirmText("")
            
            // Clean up cache to prevent deleted item from reappearing
            cacheSet(`gate_entries_list_1_last15d`, profile!.organization_id, null)
        } catch (err: any) {
            console.error(err)
            toast.error("Failed to delete entry", { description: err.message })
        } finally {
            setIsDeleting(false)
        }
    }

    const handlePrint = (entry: any) => {
        const printWindow = window.open('', '_blank')
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Gate Entry Token #${entry.token_no}</title>
                        <style>
                            body { font-family: Arial, sans-serif; padding: 20px; }
                            h1 { color: #16a34a; }
                            .info { margin: 10px 0; }
                            .label { font-weight: bold; }
                        </style>
                    </head>
                    <body>
                        <h1>Gate Entry Token #${entry.token_no}</h1>
                        <div class="info"><span class="label">Vehicle:</span> ${entry.vehicle_no}</div>
                        <div class="info"><span class="label">Driver:</span> ${entry.driver_name || 'Anonymous'}</div>
                        <div class="info"><span class="label">Commodity:</span> ${entry.commodity || 'N/A'}</div>
                        <div class="info"><span class="label">Source:</span> ${entry.source || 'Local'}</div>
                        <div class="info"><span class="label">Status:</span> ${entry.status}</div>
                        <div class="info"><span class="label">Time:</span> ${format(new Date(entry.created_at), 'dd MMM yyyy hh:mm a')}</div>
                    </body>
                </html>
            `)
            printWindow.document.close()
            printWindow.print()
        }
    }

    const handleDetails = (entry: any) => {
        router.push(`/gate/${entry.id}`)
    }

    const clearDateFilter = () => {
        setDateRange({
            from: subDays(new Date(), 15),
            to: new Date()
        })
        setPage(1)
    }

    return (
        <div className="space-y-8 p-8 max-w-7xl mx-auto bg-slate-50 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-[#E8F5E9] p-6 rounded-2xl border border-[#C8E6C9]">
                <div>
                    <h1 className="text-4xl font-black text-[#2E7D32] tracking-tighter uppercase">{t('gate.title').split(' ')[0]} <span className="text-[#43A047]">{t('gate.title').split(' ').slice(1).join(' ')}</span></h1>
                    <p className="text-[#2E7D32] font-bold text-lg flex items-center gap-2">
                        <Truck className="w-5 h-5 text-[#43A047]" /> {t('gate.subtitle')}
                    </p>
                </div>
                <GateEntryForm onSuccess={fetchEntries} />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={t('Search Vehicle No or Driver...')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 h-10 rounded-xl"
                    />
                </div>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "h-10 justify-start text-left font-normal rounded-xl px-4",
                                !dateRange && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                                dateRange.to ? (
                                    <>
                                        {format(dateRange.from, "LLL dd")} -{" "}
                                        {format(dateRange.to, "LLL dd, y")}
                                    </>
                                ) : (
                                    format(dateRange.from, "LLL dd, y")
                                )
                            ) : (
                                <span>{t('Filter by Date')}</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-xl" align="end">
                        <div className="p-3 border-b flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Range</span>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 text-xs"
                                onClick={clearDateFilter}
                            >
                                Reset to 15 Days
                            </Button>
                        </div>
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={(range) => {
                                setDateRange(range)
                                setPage(1)
                            }}
                            numberOfMonths={2}
                            className="rounded-xl border-0"
                        />
                    </PopoverContent>
                </Popover>

                {!isDefaultRange && (
                    <Button
                        variant="ghost"
                        onClick={clearDateFilter}
                        className="h-12 px-4 rounded-2xl text-red-600 hover:text-red-700 font-bold"
                    >
                        Clear Date
                    </Button>
                )}
            </div>

            {/* List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center p-24 gap-6">
                    <Loader2 className="animate-spin text-green-600 w-12 h-12" />
                    {showRecovery && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-amber-50 border border-amber-200 p-6 rounded-2xl max-w-md text-center shadow-xl"
                        >
                            <h3 className="text-amber-900 font-black uppercase text-sm mb-2">Syncing Data Identity...</h3>
                            <p className="text-amber-800/80 text-xs font-bold leading-relaxed mb-4 uppercase tracking-tight">
                                Your Mandi identity is being secured. If data doesn't appear in 10 seconds, your profile might need a manual bridge.
                            </p>
                            <Button 
                                onClick={() => window.location.reload()}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-[10px] tracking-widest h-10 px-6 rounded-xl"
                            >
                                Recover My Mandi Identity
                            </Button>
                        </motion.div>
                    )}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4">
                        <AnimatePresence mode="popLayout">
                            {filteredEntries.map((entry, idx) => (
                                <motion.div
                                    key={entry.id}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <Card className="bg-white border-slate-200 hover:border-green-400 transition-all overflow-hidden group shadow-sm hover:shadow-md">
                                        <CardContent className="p-0">
                                            <div className="flex flex-col md:flex-row md:items-center p-6 gap-6">
                                                {/* Token & Badge */}
                                                <div className="flex items-center gap-4 min-w-[140px]">
                                                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-green-700 font-black text-xl border border-green-200">
                                                        #{entry.token_no}
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${entry.status === 'pending' ? 'bg-amber-100 border-amber-200 text-amber-700' :
                                                            entry.status === 'arrived' ? 'bg-green-100 border-green-200 text-green-700' :
                                                                entry.status === 'stock_loaded' ? 'bg-blue-100 border-blue-200 text-blue-700' :
                                                                    'bg-slate-100 border-slate-200 text-slate-500'
                                                            }`}>
                                                            {entry.status === 'stock_loaded' ? 'STOCK LOADED' : t(`gate.status_${entry.status}`) || entry.status}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500 font-black">
                                                            {format(new Date(entry.created_at), 'hh:mm a')}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Vehicle Info */}
                                                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">{t('gate.vehicle')}</p>
                                                        <p className="text-lg font-black text-black">{entry.vehicle_number}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">{t('gate.commodity')}</p>
                                                        <p className="font-black text-slate-800">{entry.commodity_text || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">{t('gate.driver')}</p>
                                                        <p className="font-black text-slate-800">{entry.driver_name || 'Anonymous'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">{t('gate.source')}</p>
                                                        <p className="font-black text-slate-800">{entry.source || 'Local'}</p>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-2 no-print">
                                                    {entry.status === 'pending' && (
                                                        <Button
                                                            onClick={() => updateStatus(entry.id, 'arrived')}
                                                            className="bg-green-100 text-green-700 hover:bg-green-600 hover:text-white font-black uppercase text-xs rounded-xl h-10 px-4 shadow-sm border border-green-200 hover:border-green-600"
                                                        >
                                                            {t('gate.mark_arrived')}
                                                        </Button>
                                                    )}
                                                    {entry.status === 'arrived' && (
                                                        <Button
                                                            onClick={() => updateStatus(entry.id, 'stock_loaded')}
                                                            className="bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white font-black uppercase text-xs rounded-xl h-10 px-4 shadow-sm border border-blue-200 hover:border-blue-600"
                                                        >
                                                            <Package className="w-3 h-3 mr-1" /> Stock Loaded
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="text-slate-500 hover:text-black rounded-xl hover:bg-slate-100"
                                                        onClick={() => handlePrint(entry)}
                                                    >
                                                        <Printer className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="text-red-400 hover:text-red-700 hover:bg-red-50 rounded-xl"
                                                        onClick={(e) => {
                                                            e.preventDefault()
                                                            e.stopPropagation()
                                                            setEntryToDelete(entry)
                                                        }}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        className="text-slate-500 hover:text-green-700 gap-2 font-black text-xs uppercase rounded-xl hover:bg-green-50"
                                                        onClick={() => handleDetails(entry)}
                                                    >
                                                        Details <ArrowRight className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Pagination */}
                    {totalCount > pageSize && (
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <span className="text-xs font-black text-black uppercase tracking-widest">
                                Page {page} of {Math.ceil(totalCount / pageSize)} • Total {totalCount} Records
                            </span>
                      <div className="flex items-center justify-between mt-6">
                <p className="text-sm text-muted-foreground">
                    {t('Showing')} {entries.length} {t('of')} {totalCount} {t('entries')}
                    {(isDefaultRange && totalCount > (MAX_PAGES_UNFILTERED * pageSize)) && 
                        <span className="text-amber-600 ml-2 font-medium">
                            (Limited to last {MAX_PAGES_UNFILTERED} pages. Change date range to see more)
                        </span>
                    }
                </p>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1 || loading}
                    >
                        <ChevronLeft className="h-4 w-4 mr-2" />
                        {t('Previous')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => p + 1)}
                        disabled={loading || (page * pageSize >= totalCount) || (isDefaultRange && page >= MAX_PAGES_UNFILTERED)}
                    >
                        {t('Next')}
                        <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                </div>
            </div>
              </div>
                    )}
                </>
            )}

            {filteredEntries.length === 0 && !loading && (
                <div className="text-center p-24 bg-white rounded-3xl border border-dashed border-slate-200">
                    <p className="text-slate-400 font-black uppercase tracking-widest">{t('gate.no_entries')}</p>
                </div>
            )}

            <Dialog open={!!entryToDelete} onOpenChange={(open) => {
                if (!open) {
                    setEntryToDelete(null)
                    setDeleteConfirmText("")
                }
            }}>
                <DialogContent className="sm:max-w-md bg-white rounded-2xl p-0 overflow-hidden border-0 shadow-2xl">
                    <div className="bg-red-50 p-6 flex items-center gap-4 border-b border-red-100">
                        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                            <Trash2 className="w-6 h-6 text-red-600" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-black text-red-900 tracking-tighter">Delete Gate Entry</DialogTitle>
                            <DialogDescription className="text-red-700/80 font-bold text-xs uppercase tracking-widest mt-1">
                                THIS ACTION CANNOT BE UNDONE
                            </DialogDescription>
                        </div>
                    </div>
                    
                    <div className="p-6 space-y-4">
                        <p className="text-sm font-medium text-slate-700">
                            You are about to delete Gate Entry <strong className="font-black text-black">#{entryToDelete?.token_no}</strong> corresponding to vehicle <strong className="font-black text-black">{entryToDelete?.vehicle_number}</strong>.
                        </p>
                        <p className="text-sm font-medium text-slate-700">
                            To securely confirm this deletion, please type the word <strong className="text-red-600 select-all font-black">DELETE</strong> below.
                        </p>
                        <Input 
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder="Type DELETE to confirm"
                            className="bg-slate-50 border-slate-200 text-black font-black uppercase text-center focus-visible:ring-red-500 rounded-xl h-12"
                        />
                    </div>
                    
                    <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setEntryToDelete(null)
                                setDeleteConfirmText("")
                            }}
                            className="flex-1 font-bold rounded-xl h-12 border-slate-200 bg-white hover:bg-slate-100"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                            className="flex-1 font-black rounded-xl h-12 gap-2"
                        >
                            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Confirm Deletion
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
