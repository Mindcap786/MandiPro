"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { supabase } from "@/lib/supabaseClient"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, Truck, User, Phone, MapPin, Package } from "lucide-react"

import { useFieldGovernance } from "@/hooks/useFieldGovernance"

export function GateEntryForm({ onSuccess }: { onSuccess: () => void }) {
    const { profile } = useAuth()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [vehicleNo, setVehicleNo] = useState("")
    const [driverName, setDriverName] = useState("")
    const [driverPhone, setDriverPhone] = useState("")
    const [commodity, setCommodity] = useState("")
    const [source, setSource] = useState("")

    const { isVisible, isMandatory, getLabel } = useFieldGovernance('gate_entry');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { data, error } = await supabase
                .schema('mandi')
                .from('gate_entries')
                .insert({
                    organization_id: profile?.organization_id,
                    vehicle_number: vehicleNo.toUpperCase(),
                    driver_name: driverName,
                    driver_phone: driverPhone,
                    commodity_text: commodity,
                    source: source,
                    status: 'pending'
                })
                .select('id')
                .single()

            if (error) throw error

            setOpen(false)
            setVehicleNo("")
            setDriverName("")
            setDriverPhone("")
            setCommodity("")
            setSource("")
            onSuccess()
        } catch (error: any) {
            alert(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 text-white h-12 px-6 rounded-2xl shadow-lg border border-green-500 font-bold uppercase tracking-wide">
                    <Plus className="w-5 h-5 mr-2" /> New Gate Entry
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg rounded-2xl shadow-xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3 text-slate-900">
                        <div className="bg-green-100 p-2 rounded-xl">
                            <Truck className="w-6 h-6 text-green-600" />
                        </div>
                        Record Vehicle Arrival
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        {isVisible('vehicle_no') && (
                            <div className="space-y-2 col-span-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{getLabel('vehicle_no', 'Vehicle Number')}</Label>
                                <div className="relative">
                                    <Truck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        placeholder="MH-12-AB-1234"
                                        className="pl-12 bg-white border-slate-200 h-12 rounded-xl text-lg font-black uppercase text-black focus:ring-green-500/20"
                                        value={vehicleNo}
                                        onChange={(e) => setVehicleNo(e.target.value)}
                                        required={isMandatory('vehicle_no')}
                                    />
                                </div>
                            </div>
                        )}

                        {isVisible('driver_name') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{getLabel('driver_name', 'Driver Name')}</Label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        placeholder="Enter driver name"
                                        className="pl-12 bg-white border-slate-200 h-12 rounded-xl text-black font-bold focus:ring-green-500/20"
                                        value={driverName}
                                        onChange={(e) => setDriverName(e.target.value)}
                                        required={isMandatory('driver_name')}
                                    />
                                </div>
                            </div>
                        )}

                        {isVisible('driver_phone') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{getLabel('driver_phone', 'Driver Phone')}</Label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        placeholder="Phone number"
                                        className="pl-12 bg-white border-slate-200 h-12 rounded-xl text-black font-bold focus:ring-green-500/20"
                                        value={driverPhone}
                                        onChange={(e) => setDriverPhone(e.target.value)}
                                        required={isMandatory('driver_phone')}
                                    />
                                </div>
                            </div>
                        )}

                        {isVisible('commodity') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{getLabel('commodity', 'Commodity')}</Label>
                                <div className="relative">
                                    <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        placeholder="e.g. Apples"
                                        className="pl-12 bg-white border-slate-200 h-12 rounded-xl text-black font-bold focus:ring-green-500/20"
                                        value={commodity}
                                        onChange={(e) => setCommodity(e.target.value)}
                                        required={isMandatory('commodity')}
                                    />
                                </div>
                            </div>
                        )}

                        {isVisible('source') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{getLabel('source', 'Source / Mandi')}</Label>
                                <div className="relative">
                                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        placeholder="City or Village"
                                        className="pl-12 bg-white border-slate-200 h-12 rounded-xl text-black font-bold focus:ring-green-500/20"
                                        value={source}
                                        onChange={(e) => setSource(e.target.value)}
                                        required={isMandatory('source')}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <Button type="submit" className="w-full bg-slate-900 hover:bg-black text-white h-14 rounded-2xl text-lg font-black uppercase tracking-widest shadow-lg" disabled={loading}>
                        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Generate Entry Token"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
