"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import { ContactDialog } from "@/components/contacts/contact-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus, Search, Users, Phone, MapPin, Loader2, Printer, Download, ChevronLeft, ChevronRight, RotateCcw, AlertCircle, Trash2, Filter, ChevronDown, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { isNativePlatform } from "@/lib/capacitor-utils"

// Native components
import { NativeCard } from "@/components/mobile/NativeCard"
import { SkeletonListScreen } from "@/components/mobile/ShimmerSkeleton"
import { ActionSheet, ActionSheetOption } from "@/components/mobile/ActionSheet"
import { DestructiveBottomSheet } from "@/components/mobile/BottomSheet"
import { SegmentedControl } from "@/components/mobile/SegmentedControl"

// ──────────────────────────────────────────────────────────────────────────────
// ALL BUSINESS LOGIC IDENTICAL — only JSX return changes on native
// ──────────────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
    const { profile } = useAuth()
    const schema = 'mandi'
    const [contacts, setContacts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [typeFilter, setTypeFilter] = useState("all")
    const [locationFilter, setLocationFilter] = useState("all")
    const [statusFilter, setStatusFilter] = useState("all")
    const [isUpdating, setIsUpdating] = useState<string | null>(null)
    const [contactToDelete, setContactToDelete] = useState<{ id: string, name: string } | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 20

    // Native ActionSheet state
    const [filterSheetOpen, setFilterSheetOpen] = useState(false)
    const [activeFilterTarget, setActiveFilterTarget] = useState<'type' | 'location' | 'status'>('type')

    useEffect(() => {
        if (profile?.organization_id) fetchContacts()
    }, [profile])

    // ──────────────────────────────────────────────────────────────────────────
    // REALTIME: Instant updates when contacts are added/changed
    // ──────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!profile?.organization_id) return

        const channel = supabase
            .channel('contacts-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: schema,
                    table: 'contacts',
                    filter: `organization_id=eq.${profile.organization_id}`
                },
                () => {
                    console.log("Realtime update: Refetching contacts...")
                    fetchContacts()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [profile?.organization_id])

    const fetchContacts = async () => {
        if (!profile?.organization_id) return
        setLoading(true)
        const { data, error } = await supabase.schema(schema)
            .from("contacts")
            .select("id, name, type, city, phone, status, credit_limit, contact_code, internal_id, created_at, bill_series_prefix")
            .eq("organization_id", profile.organization_id)
            .neq("status", "deleted")
            .neq("type", "staff") // Hide internal staff from master data
            .order("created_at", { ascending: false })
        if (error) console.error("Error fetching contacts:", error)
        else setContacts(data || [])
        setLoading(false)
    }

    const toggleStatus = async (id: string, currentStatus: string) => {
        setIsUpdating(id)
        const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive'
        
        // Optimistic Update
        const previousContacts = [...contacts]
        setContacts(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c))

        const { error } = await supabase.schema(schema).from('contacts').update({ status: newStatus }).eq('id', id)
        
        if (error) { 
            toast.error("Error updating status")
            console.error("Error updating status:", error)
            setContacts(previousContacts) // Rollback
        } else {
            // Realtime will handle the refetch, but we can verify here if needed
            toast.success(`Status updated to ${newStatus}`)
        }
        setIsUpdating(null)
    }

    const resetSequence = async (contactId: string, contactName: string, type: string) => {
        if (!confirm(`Are you sure you want to reset the invoice sequence for "${contactName}"? Future invoices will start from #1.`)) return
        setIsUpdating(contactId)
        const { error } = await supabase.schema(schema).rpc('reset_contact_bill_no', { p_organization_id: profile.organization_id, p_contact_id: contactId, p_type: type === 'buyer' ? 'sale' : 'purchase', p_new_start: 1 })
        if (error) { toast.error("Failed to reset sequence"); console.error(error) }
        else toast.success(`Sequence reset for ${contactName}`)
        setIsUpdating(null)
    }

    const deleteContact = async (id: string, name: string) => {
        setIsUpdating(id)
        const { error } = await supabase.schema(schema).from('contacts').update({ status: 'deleted' }).eq('id', id)
        if (error) { console.error("Error deleting contact:", error); toast.error(`Failed to delete ${name}.`) }
        else { toast.success(`Contact ${name} deleted successfully.`); fetchContacts() }
        setIsUpdating(null)
    }

    const bulkResetSequences = async () => {
        const count = filteredContacts.length
        if (count === 0) return
        if (!confirm(`RESET SEQUENCES: Are you sure you want to reset sequences for ALL ${count} filtered contacts?`)) return
        setLoading(true)
        try {
            for (const contact of filteredContacts) {
                await supabase.schema(schema).rpc('reset_contact_bill_no', { p_organization_id: profile.organization_id, p_contact_id: contact.id, p_type: contact.type === 'buyer' ? 'sale' : 'purchase', p_new_start: 1 })
            }
            toast.success(`Reset sequences for ${count} contacts`)
        } catch { toast.error("Bulk reset failed") }
        finally { setLoading(false) }
    }

    const filteredContacts = contacts.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             c.type.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             c.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             c.internal_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             c.contact_code?.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesType = typeFilter === 'all' || c.type === typeFilter
        const matchesLocation = locationFilter === 'all' || c.city === locationFilter
        const contactStatus = c.status || 'active'
        const matchesStatus = statusFilter === 'all' || contactStatus === statusFilter
        return matchesSearch && matchesType && matchesLocation && matchesStatus
    })

    const totalPages = Math.ceil(filteredContacts.length / itemsPerPage)
    const currentItems = filteredContacts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages)
    }, [filteredContacts.length, currentPage, totalPages])

    const getPageNumbers = () => {
        const pages = []
        let start = Math.max(1, currentPage - 2)
        let end = Math.min(totalPages, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        for (let i = start; i <= end; i++) pages.push(i)
        return pages
    }

    const handlePrint = () => window.print()

    const handleDownloadCSV = () => {
        if (filteredContacts.length === 0) return
        const headers = ["Name", "Type", "Phone", "Location", "Status"]
        const csvContent = [headers.join(","), ...filteredContacts.map(c => [`"${c.name}"`, `"${c.type}"`, `"${c.phone || ''}"`, `"${c.city || ''}"`, `"${c.status || 'active'}"`].join(","))].join("\n")
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement("a")
        link.setAttribute("href", URL.createObjectURL(blob))
        link.setAttribute("download", `mandi_contacts_${new Date().toISOString().split('T')[0]}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const locations = Array.from(new Set(contacts.map(c => c.city).filter(Boolean)))

    // ── NATIVE TYPE BADGE COLORS ─────────────────────────────────────────────
    const typeBadge = (type: string) => {
        if (type === 'farmer') return { bg: '#DCFCE7', text: '#16A34A' }
        if (type === 'buyer') return { bg: '#DBEAFE', text: '#2563EB' }
        return { bg: '#EDE9FE', text: '#7C3AED' }
    }

    // ── NATIVE FILTER ACTION SHEET OPTIONS ───────────────────────────────────
    const filterOptions: Record<string, ActionSheetOption[]> = {
        type: [
            { label: 'All Types', value: 'all' },
            { label: 'Farmer', value: 'farmer' },
            { label: 'Buyer', value: 'buyer' },
            { label: 'Supplier', value: 'supplier' },
        ],
        location: [
            { label: 'All Locations', value: 'all' },
            ...locations.map(loc => ({ label: loc, value: loc })),
        ],
        status: [
            { label: 'All Statuses', value: 'all' },
            { label: 'Active Only', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
        ],
    }

    const filterValues: Record<string, string> = { type: typeFilter, location: locationFilter, status: statusFilter }
    const filterSetters: Record<string, (v: string) => void> = { type: setTypeFilter, location: setLocationFilter, status: setStatusFilter }

    const handleFilterSelect = (opt: ActionSheetOption) => {
        if (opt.value) filterSetters[activeFilterTarget](opt.value)
    }

    // ── TYPE SEGMENT OPTIONS ─────────────────────────────────────────────────
    const typeSegments = [
        { label: `All (${contacts.length})`, value: 'all' },
        { label: 'Farmers', value: 'farmer' },
        { label: 'Buyers', value: 'buyer' },
        { label: 'Suppliers', value: 'supplier' },
    ]

    // ── NATIVE MOBILE RENDER ─────────────────────────────────────────────────
    if (isNativePlatform()) {
        return (
            <div className="bg-[#EFEFEF] min-h-dvh pb-4">
                {/* Search + filter row */}
                <div className="px-4 pt-3 flex gap-2">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                        <input
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search name, city, type…"
                            className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-[#E5E7EB] text-sm text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1A6B3C]"
                        />
                    </div>
                    {/* Filter button */}
                    <button
                        onClick={() => { setActiveFilterTarget('status'); setFilterSheetOpen(true) }}
                        className="w-11 h-11 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <Filter className="w-4 h-4 text-[#6B7280]" />
                    </button>
                    {/* Add Contact */}
                    <ContactDialog onSuccess={fetchContacts}>
                        <button className="w-11 h-11 rounded-xl bg-[#1A6B3C] flex items-center justify-center active:scale-95 transition-transform shadow-[0_2px_6px_rgba(26,107,60,0.3)]">
                            <Plus className="w-5 h-5 text-white" />
                        </button>
                    </ContactDialog>
                </div>

                {/* Type segmented filter */}
                <SegmentedControl options={typeSegments} value={typeFilter} onChange={setTypeFilter} className="px-0" />

                {/* Summary count */}
                <div className="px-4 pb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#6B7280]">
                        {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
                        {statusFilter !== 'all' && ` · ${statusFilter}`}
                    </p>
                    {typeFilter !== 'all' || locationFilter !== 'all' || statusFilter !== 'all' ?
                        <button
                            onClick={() => { setTypeFilter('all'); setLocationFilter('all'); setStatusFilter('all') }}
                            className="text-xs text-[#DC2626] font-semibold"
                        >
                            Clear filters
                        </button>
                        : null
                    }
                </div>

                {/* Contact list */}
                {loading ? (
                    <SkeletonListScreen count={6} />
                ) : (
                    <div className="px-4 space-y-2">
                        {filteredContacts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
                                <Users className="w-12 h-12 mb-3 opacity-30" />
                                <p className="text-sm font-medium">No contacts found</p>
                            </div>
                        ) : (
                            filteredContacts.map(contact => {
                                const badge = typeBadge(contact.type)
                                const isActive = (contact.status || 'active') === 'active'
                                return (
                                    <NativeCard key={contact.id} className="overflow-hidden">
                                        {/* Main row */}
                                        <div className="flex items-center gap-3 px-4 py-3">
                                            {/* Avatar */}
                                            <div
                                                className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm"
                                                style={{ backgroundColor: badge.bg, color: badge.text }}
                                            >
                                                {contact.name.charAt(0).toUpperCase()}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-semibold text-[#1A1A2E] truncate">{contact.name}</p>
                                                    <span
                                                        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md flex-shrink-0"
                                                        style={{ backgroundColor: badge.bg, color: badge.text }}
                                                    >
                                                        {contact.type}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    {contact.phone && (
                                                        <span className="flex items-center gap-1 text-xs text-[#6B7280]">
                                                            <Phone className="w-3 h-3" /> {contact.phone}
                                                        </span>
                                                    )}
                                                    {contact.city && (
                                                        <span className="flex items-center gap-1 text-xs text-[#9CA3AF]">
                                                            <MapPin className="w-3 h-3" /> {contact.city}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Status toggle */}
                                            <button
                                                onClick={() => toggleStatus(contact.id, contact.status || 'active')}
                                                disabled={isUpdating === contact.id}
                                                className="flex-shrink-0"
                                            >
                                                <div className={cn(
                                                    "w-11 h-6 rounded-full transition-colors duration-300 relative",
                                                    isActive ? "bg-[#16A34A]" : "bg-[#D1D5DB]"
                                                )}>
                                                    <div className={cn(
                                                        "absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300",
                                                        isActive ? "left-6" : "left-1"
                                                    )} />
                                                </div>
                                            </button>
                                        </div>

                                        {/* Action row */}
                                        <div className="flex border-t border-[#F3F4F6]">
                                            <ContactDialog onSuccess={fetchContacts} initialData={contact}>
                                                <button
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-[#2563EB] active:bg-blue-50 transition-colors border-r border-[#F3F4F6]"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" /> Edit
                                                </button>
                                            </ContactDialog>
                                            <button
                                                onClick={() => resetSequence(contact.id, contact.name, contact.type)}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-[#6B7280] active:bg-gray-50 transition-colors border-r border-[#F3F4F6]"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" /> Reset
                                            </button>
                                            <button
                                                onClick={() => setContactToDelete({ id: contact.id, name: contact.name })}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-[#DC2626] active:bg-red-50 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" /> Delete
                                            </button>
                                        </div>
                                    </NativeCard>
                                )
                            })
                        )}
                    </div>
                )}

                {/* Filter Action Sheet */}
                <ActionSheet
                    open={filterSheetOpen}
                    onClose={() => setFilterSheetOpen(false)}
                    title={activeFilterTarget === 'type' ? 'Filter by Type' : activeFilterTarget === 'location' ? 'Filter by Location' : 'Filter by Status'}
                    options={filterOptions[activeFilterTarget]}
                    onSelect={handleFilterSelect}
                    selectedValue={filterValues[activeFilterTarget]}
                />

                {/* Delete Confirmation */}
                <DestructiveBottomSheet
                    open={!!contactToDelete}
                    onClose={() => setContactToDelete(null)}
                    title="Delete Contact"
                    description={<>Are you sure you want to remove <strong>"{contactToDelete?.name}"</strong>? Their historical invoices and financial records will be preserved.</>}
                    confirmLabel="Delete Contact"
                    onConfirm={() => {
                        if (contactToDelete) {
                            deleteContact(contactToDelete.id, contactToDelete.name)
                            setContactToDelete(null)
                        }
                    }}
                    loading={isUpdating === contactToDelete?.id}
                />
            </div>
        )
    }

    // ── WEB / DESKTOP RENDER (ORIGINAL — UNCHANGED) ──────────────────────────
    return (
        <div className="p-8 space-y-6 min-h-screen bg-slate-50 text-black">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-[1000] tracking-tighter text-black uppercase">Network Contacts</h1>
                    <p className="text-slate-600 font-bold flex items-center gap-2 mt-1"><Users className="w-4 h-4 text-blue-600" />Manage Farmers, Buyers, and Suppliers</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={handlePrint} className="h-12 px-4 rounded-xl font-bold text-slate-600 border-slate-200 hover:bg-slate-100 hidden sm:flex"><Printer className="w-4 h-4 mr-2" /> Print</Button>
                    <Button variant="outline" onClick={handleDownloadCSV} className="h-12 px-4 rounded-xl font-bold text-slate-600 border-slate-200 hover:bg-slate-100"><Download className="w-4 h-4 mr-2" /> Export</Button>
                    {(searchTerm || typeFilter !== 'all' || locationFilter !== 'all') && (
                        <Button variant="outline" onClick={bulkResetSequences} className="h-12 px-4 rounded-xl font-bold text-orange-600 border-orange-100 hover:bg-orange-50 bg-orange-50/30"><RotateCcw className="w-4 h-4 mr-2" /> Reset All Filtered</Button>
                    )}
                    <ContactDialog onSuccess={fetchContacts}>
                        <Button className="bg-black text-white hover:bg-slate-800 font-black shadow-lg rounded-xl h-12 px-6"><Plus className="w-5 h-5 mr-2 hidden sm:block" /> ADD</Button>
                    </ContactDialog>
                </div>
            </header>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex flex-col md:flex-row items-center gap-4 mb-6">
                    <div className="relative flex-1 w-full md:max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input placeholder="Search name, city, or type..." className="pl-9 bg-slate-50 border-slate-200 text-black font-bold focus:border-blue-500 rounded-xl h-11" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <select className="h-11 px-4 bg-slate-50 border-slate-200 text-black font-bold rounded-xl text-xs focus:ring-0 focus:border-blue-500 outline-none transition-all cursor-pointer" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                            <option value="all">All Types</option>
                            <option value="farmer">Farmer</option>
                            <option value="buyer">Buyer</option>
                            <option value="supplier">Supplier</option>
                        </select>
                        <select className="h-11 px-4 bg-slate-50 border-slate-200 text-black font-bold rounded-xl text-xs focus:ring-0 focus:border-blue-500 outline-none transition-all cursor-pointer" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
                            <option value="all">All Locations</option>
                            {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                        </select>
                        <select className="h-11 px-4 bg-slate-50 border-slate-200 text-black font-bold rounded-xl text-xs focus:ring-0 focus:border-blue-500 outline-none transition-all cursor-pointer" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="all">All Statuses</option>
                            <option value="active">Active Only</option>
                            <option value="inactive">Inactive Only</option>
                        </select>
                    </div>
                </div>

                <div className="rounded-xl overflow-hidden border border-slate-200">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow className="hover:bg-transparent border-slate-200">
                                <TableHead className="text-slate-500 font-black uppercase tracking-wider text-[10px]">Internal ID</TableHead>
                                <TableHead className="text-slate-600 font-black uppercase tracking-wider text-[10px]">Name</TableHead>
                                <TableHead className="text-slate-600 font-black uppercase tracking-wider text-[10px]">Type</TableHead>
                                <TableHead className="text-slate-600 font-black uppercase tracking-wider text-[10px]">Phone</TableHead>
                                <TableHead className="text-slate-600 font-black uppercase tracking-wider text-[10px]">Location</TableHead>
                                <TableHead className="text-right text-slate-600 font-black uppercase tracking-wider text-[10px]">Sequences</TableHead>
                                <TableHead className="text-right text-slate-600 font-black uppercase tracking-wider text-[10px]">Status</TableHead>
                                <TableHead className="w-12"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={8} className="h-32 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" /></TableCell></TableRow>
                            ) : filteredContacts.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="h-32 text-center"><div className="flex flex-col items-center gap-2 text-slate-400"><Users className="w-8 h-8 opacity-50" /><span className="font-bold text-sm">No contacts found in network.</span></div></TableCell></TableRow>
                            ) : (
                                currentItems.map((contact) => (
                                    <TableRow key={contact.id} className="border-slate-100 hover:bg-slate-50 transition-colors group">
                                        <TableCell className="font-mono text-[10px] font-black text-slate-400 group-hover:text-blue-600 transition-colors uppercase tracking-widest">{contact.internal_id || contact.contact_code || '---'}</TableCell>
                                        <TableCell className="font-bold text-black text-sm py-4">{contact.name}</TableCell>
                                        <TableCell><span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide border ${contact.type === 'farmer' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : contact.type === 'buyer' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>{contact.type}</span></TableCell>
                                        <TableCell className="text-slate-800 font-black text-xs"><div className="flex items-center gap-2">{contact.phone ? (<><Phone className="w-3.5 h-3.5 text-blue-500" /> {contact.phone}</>) : <span className="text-slate-300">-</span>}</div></TableCell>
                                        <TableCell className="text-slate-800 font-black text-xs"><div className="flex items-center gap-2">{contact.city ? (<><MapPin className="w-3.5 h-3.5 text-red-500" /> {contact.city}</>) : <span className="text-slate-300">-</span>}</div></TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <ContactDialog onSuccess={fetchContacts} initialData={contact}>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="Edit Contact"><Pencil className="w-3.5 h-3.5" /></Button>
                                                </ContactDialog>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition-colors" onClick={() => resetSequence(contact.id, contact.name, contact.type)} title="Reset Invoice Sequence"><RotateCcw className="w-3.5 h-3.5" /></Button>
                                                <Button variant="ghost" size="sm" type="button" className="h-8 w-8 p-0 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setContactToDelete({ id: contact.id, name: contact.name }) }} title="Delete Contact" disabled={isUpdating === contact.id}><Trash2 className="w-4 h-4" /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 px-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest hidden sm:block">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredContacts.length)} of {filteredContacts.length}</p>
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 w-8 p-0 rounded-lg border-slate-200 text-slate-600 hover:bg-slate-100"><ChevronLeft className="w-4 h-4" /></Button>
                            {getPageNumbers().map(pageNum => (<Button key={pageNum} variant={pageNum === currentPage ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(pageNum)} className={cn("h-8 w-8 p-0 rounded-lg font-bold text-xs transition-all", pageNum === currentPage ? "bg-black text-white shadow-md border-black hover:bg-black" : "border-slate-200 text-slate-600 hover:bg-slate-100")}>{pageNum}</Button>))}
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 w-8 p-0 rounded-lg border-slate-200 text-slate-600 hover:bg-slate-100"><ChevronRight className="w-4 h-4" /></Button>
                        </div>
                    </div>
                )}
            </div>

            <Dialog open={!!contactToDelete} onOpenChange={(open) => !open && setContactToDelete(null)}>
                <DialogContent className="sm:max-w-md bg-white border-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-slate-900">Delete Contact</DialogTitle>
                        <DialogDescription className="text-slate-500 font-medium pt-2">Are you sure you want to remove <span className="font-bold text-slate-900">"{contactToDelete?.name}"</span> from your network?<br /><br />Their historical invoices and financial records will be preserved for your accounting.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-6 flex gap-3 sm:justify-end">
                        <Button variant="outline" onClick={() => setContactToDelete(null)} className="font-bold">Cancel</Button>
                        <Button className="bg-red-500 hover:bg-red-600 text-white font-bold" onClick={() => { if (contactToDelete) { deleteContact(contactToDelete.id, contactToDelete.name); setContactToDelete(null) } }}>Delete Contact</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
