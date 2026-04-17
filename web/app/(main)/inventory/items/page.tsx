"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import { cacheGet, cacheSet } from "@/lib/data-cache"
import { ItemDialog } from "@/components/inventory/item-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, Package, Scale, Tag, Loader2, Pencil } from "lucide-react"

export default function ItemsPage() {
    const { profile, loading: authLoading } = useAuth()
    const schema = 'mandi';
    const [items, setItems] = useState<any[]>(() => {
        // Hydrate from cache immediately if available
        if (typeof window !== 'undefined') {
            const orgId = localStorage.getItem('mandi_org_id');
            if (orgId) return cacheGet<any[]>('commodity_master', orgId) || [];
        }
        return [];
    })
    const [loading, setLoading] = useState(() => {
        // If we have cached items, don't show the initial loader
        if (typeof window !== 'undefined') {
            const orgId = localStorage.getItem('mandi_org_id');
            const cached = orgId ? cacheGet<any[]>('commodity_master', orgId) : null;
            return !cached || cached.length === 0;
        }
        return true;
    })
    const [searchTerm, setSearchTerm] = useState("")

    useEffect(() => {
        if (profile?.organization_id) {
            fetchItems(false) // Background refresh (no loading state)
        } else if (!authLoading) {
            setLoading(false)
        }
    }, [profile?.organization_id, authLoading])

    const fetchItems = useCallback(async (showLoading = true) => {
        if (!profile?.organization_id) return

        try {
            if (showLoading && items.length === 0) setLoading(true)
            const dbSchema = schema
            const { data, error } = await supabase
                .schema(dbSchema)
                .from("commodities")
                .select("*")
                .eq("organization_id", profile.organization_id)
                .order("name", { ascending: true })

            if (error) console.error('[Items] Fetch error:', error)
            if (data) {
                setItems(data)
                if (profile?.organization_id) {
                    cacheSet('commodity_master', profile.organization_id, data);
                }
            }
        } catch (error) {
            console.error("Error fetching items:", error)
        } finally {
            setLoading(false)
        }
    }, [profile?.organization_id, items.length])

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.local_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="p-8 space-y-6 text-slate-900 min-h-screen">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-[1000] tracking-tighter text-black uppercase">
                        Commodity Master
                    </h1>
                    <p className="text-slate-500 font-bold flex items-center gap-2 mt-1">
                        <Package className="w-4 h-4 text-blue-600" />
                        Manage Farmers, Buyers, and Suppliers
                    </p>
                </div>
                {profile?.organization_id && (
                    <ItemDialog onSuccess={() => fetchItems(false)}>
                        <Button className="bg-black text-white hover:bg-slate-800 font-black shadow-lg rounded-xl h-12 px-6">
                            <Plus className="w-5 h-5 mr-2" /> ADD NEW
                        </Button>
                    </ItemDialog>
                )}
            </header>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search by name or local name..."
                            className="pl-9 bg-slate-50 border-slate-200 text-black font-bold focus:border-blue-500 rounded-xl h-11"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="rounded-xl overflow-hidden border border-slate-200">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow className="hover:bg-transparent border-slate-200">
                                <TableHead className="text-slate-500 font-black uppercase tracking-wider text-[10px]">Commodity Name</TableHead>
                                <TableHead className="text-slate-500 font-black uppercase tracking-wider text-[10px]">Local Name</TableHead>
                                <TableHead className="text-slate-500 font-black uppercase tracking-wider text-[10px]">Default Unit</TableHead>
                                <TableHead className="text-slate-500 font-black uppercase tracking-wider text-[10px] w-28">Internal ID</TableHead>
                                <TableHead className="text-right text-slate-500 font-black uppercase tracking-wider text-[10px] px-4 w-32">Barcode</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-neon-blue" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredItems.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center text-gray-500">
                                        No commodities found. Define your first product.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredItems.map((item) => (
                                    <TableRow key={item.id} className="border-slate-100 hover:bg-slate-50 transition-colors group">
                                        <TableCell className="font-bold py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                                    <Tag className="w-4 h-4 text-blue-600" />
                                                </div>
                                                <span className="text-black text-sm">{item.name}</span>
                                                {item.custom_attributes && Object.keys(item.custom_attributes).length > 0 && (
                                                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-[8px] font-black text-blue-600 uppercase">
                                                        <Scale className="w-2.5 h-2.5" /> {Object.keys(item.custom_attributes).length} Specs
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-slate-500 font-medium italic text-xs">
                                            {item.local_name || "-"}
                                        </TableCell>
                                        <TableCell>
                                            <span className="px-2 py-1 rounded-md bg-white border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                                                {item.default_unit}
                                            </span>
                                        </TableCell>
                                        <TableCell className="font-mono text-[10px] font-black text-slate-400 group-hover:text-blue-600 transition-colors uppercase tracking-widest">
                                            {item.sku_code || '---'}
                                        </TableCell>
                                        <TableCell className="text-right px-4">
                                            {item.barcode ? (
                                                <div className="flex justify-end">
                                                    <div className="px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-[9px] font-black text-blue-600 uppercase tracking-tighter">
                                                        {item.barcode}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-slate-300 font-bold lowercase italic">no barcode</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end pr-2">
                                                {profile?.organization_id && (
                                                    <ItemDialog onSuccess={() => fetchItems(false)} initialItem={item}>
                                                        <Button variant="ghost" className="h-8 w-8 p-0 rounded-full hover:bg-slate-100 text-slate-400 hover:text-black">
                                                            <Pencil className="w-4 h-4" />
                                                        </Button>
                                                    </ItemDialog>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    )
}
