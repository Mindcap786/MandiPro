"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Check, Loader2, IndianRupee, PieChart, ArrowRight, Table as TableIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import { useToast } from "@/hooks/use-toast"

export default function NewPattiForm() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const farmerId = searchParams.get('farmer')
    const { profile } = useAuth()
    const { toast } = useToast()

    const [farmer, setFarmer] = useState<any>(null)
    const [lots, setLots] = useState<any[]>([])
    const [selectedLotIds, setSelectedLotIds] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)

    // Deduction Rates
    const [commissionPct, setCommissionPct] = useState(6)
    const [fixedExpenses, setFixedExpenses] = useState(0)

    useEffect(() => {
        if (farmerId && profile?.organization_id) {
            fetchFarmerData()
        }
    }, [farmerId, profile])

    const fetchFarmerData = async () => {
        setLoading(true)
        // 1. Get Farmer Details
        const { data: farmerData } = await supabase
            .schema('mandi')
            .from('contacts')
            .select('*')
            .eq('id', farmerId)
            .single()
        setFarmer(farmerData)

        // 2. Get Lots that have sales but aren't fully settled
        const { data: lotsData } = await supabase
            .schema('mandi')
            .from('lots')
            .select(`
                *,
                item:commodities(name),
                sale_items(amount, qty, rate, unit)
            `)
            .eq('contact_id', farmerId)
            .eq('arrival_type', 'commission')
            .neq('status', 'settled')
            .order('created_at', { ascending: false })

        setLots(lotsData || [])
        setLoading(false)
    }

    const toggleLot = (id: string) => {
        setSelectedLotIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        )
    }

    const selectedLotsData = lots.filter(l => selectedLotIds.includes(l.id))

    // Calculate Gross Total from actual Sales linked to these Lots
    const grossTotal = selectedLotsData.reduce((sum, lot) => {
        const lotSales = lot.sale_items?.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0) || 0;
        return sum + lotSales;
    }, 0)
    const commissionVal = (grossTotal * commissionPct) / 100
    const netPayable = grossTotal - commissionVal - fixedExpenses

    const handleSubmit = async () => {
        if (!profile?.organization_id) return
        setSubmitting(true)
        try {
            // 1. Create a "payment" or "journal" voucher for the Patti
            const { data: voucher, error: vError } = await supabase
                .schema('mandi')
                .from('vouchers')
                .insert({
                    organization_id: profile.organization_id,
                    type: 'journal',
                    date: new Date().toISOString().split('T')[0],
                    narration: `Farmer Patti for ${farmer?.name} - Lots: ${selectedLotIds.length}`
                })
                .select().single()
            if (vError) throw vError

            // 2. Update all selected lots to 'settled'
            const { error: lotUpdateError } = await (supabase
                .schema('mandi')
                .from('lots')
                .update({ status: 'settled' })
                .in('id', selectedLotIds) as any)
            if (lotUpdateError) throw lotUpdateError

            // 3. Financial Entries (Double Entry)
            // Debit: Sales Expense / Purchase (Mandi takes the hit or passes through)
            // Credit: Farmer Account (Mandi confirms they owe this final amount)
            // Actually Patti usually clears the Farmer's Credit Balance generated during Sales.

            toast({ title: "Patti Generated", description: "Farmer account updated." })
            router.push('/finance/farmer-settlements')
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" })
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) return <div className="p-10 text-center animate-pulse font-black text-gray-500 uppercase tracking-widest">Compiling Trade History...</div>

    return (
        <div className="grid grid-cols-12 gap-8">
            {/* Left: Lot Selection */}
            <div className="col-span-12 lg:col-span-7 space-y-6">
                <div className="flex items-center gap-3 text-neon-blue font-black uppercase text-[10px] tracking-widest">
                    <TableIcon className="w-4 h-4" /> Unsettled Trading Lots
                </div>

                <div className="space-y-3">
                    {lots.length === 0 ? (
                        <div className="p-12 border-2 border-dashed border-white/5 rounded-[32px] text-center text-gray-600 font-bold uppercase italic tracking-widest bg-white/[0.01]">
                            No Unsettled Lots Found for {farmer?.name}
                        </div>
                    ) : lots.map(lot => (
                        <div
                            key={lot.id}
                            onClick={() => toggleLot(lot.id)}
                            className={`p-6 rounded-2xl border transition-all cursor-pointer flex items-center gap-6 ${selectedLotIds.includes(lot.id)
                                ? 'bg-neon-blue/10 border-neon-blue/50'
                                : 'bg-white/5 border-white/10 hover:border-white/20'
                                }`}
                        >
                            <Checkbox checked={selectedLotIds.includes(lot.id)} onCheckedChange={() => toggleLot(lot.id)} className="border-white/20 data-[state=checked]:bg-neon-blue" />
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-white font-black tracking-tight">{lot.lot_code}</span>
                                    <span className="text-gray-500 text-xs font-bold uppercase">({lot.item?.name})</span>
                                </div>
                                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Arrival: {new Date(lot.created_at).toLocaleDateString()}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-white font-black">₹5,000.00</div>
                                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Sale Value</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right: Calculations */}
            <div className="col-span-12 lg:col-span-5">
                <div className="sticky top-8 space-y-6">
                    <div className="bg-white/[0.03] border border-white/10 rounded-[40px] p-8 glass-panel shadow-2xl relative overflow-hidden">
                        <div className="relative z-10 space-y-8">
                            <div>
                                <h3 className="text-white font-black text-2xl tracking-tighter italic uppercase mb-1">
                                    SETTLEMENT <span className="text-neon-blue">PREVIEW</span>
                                </h3>
                                <p className="text-gray-500 text-sm font-medium">Auto-calculating for {farmer?.name}</p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm font-bold uppercase">
                                    <span className="text-gray-400">Total Gross Value</span>
                                    <span className="text-white">₹{grossTotal.toLocaleString()}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Commission (%)</label>
                                        <Input
                                            type="number"
                                            value={commissionPct}
                                            onChange={(e) => setCommissionPct(Number(e.target.value))}
                                            className="bg-white/5 border-white/10 h-12 font-black text-neon-green"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Other Exp (₹)</label>
                                        <Input
                                            type="number"
                                            value={fixedExpenses}
                                            onChange={(e) => setFixedExpenses(Number(e.target.value))}
                                            className="bg-white/5 border-white/10 h-12 font-black text-red-400"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-8 border-t border-white/5 space-y-6">
                                <div className="flex justify-between items-baseline">
                                    <div className="text-[10px] font-black text-neon-blue uppercase tracking-widest">Net Payout to Farmer</div>
                                    <div className="text-5xl font-black text-white tracking-tighter tabular-nums">₹{netPayable.toLocaleString()}</div>
                                </div>

                                <Button
                                    disabled={selectedLotIds.length === 0 || submitting}
                                    onClick={handleSubmit}
                                    className="w-full h-16 bg-neon-blue text-white hover:bg-neon-blue/80 font-black text-xl italic tracking-tighter rounded-2xl transition-all shadow-[0_0_30px_rgba(0,183,255,0.3)]"
                                >
                                    {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                                        <span className="flex items-center gap-2 uppercase">FINAL SETTLE & PRINT PATTI <ArrowRight className="w-5 h-5" /></span>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Background Decoration */}
                        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-neon-blue/10 blur-[100px] pointer-events-none" />
                    </div>

                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl flex items-center gap-4">
                        <PieChart className="w-8 h-8 text-gray-600" />
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Selection Insight</p>
                            <p className="text-white font-medium text-sm">Including {selectedLotIds.length} lots in this statement.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
