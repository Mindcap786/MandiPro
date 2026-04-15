'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Loader2, Plus, Truck, User, Box, Upload, X, Save, Trash2, ArrowRight, DollarSign, Scale } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { useRouter } from 'next/navigation'
import { useFieldGovernance } from '@/hooks/useFieldGovernance'

export function NewEntryModal() {
    const { user, profile } = useAuth()
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    const [farmers, setFarmers] = useState<any[]>([])

    // Add Farmer State
    const [isAddingFarmer, setIsAddingFarmer] = useState(false)
    const [newFarmer, setNewFarmer] = useState({
        name: '',
        village: '',
        phone: '',
        type: 'farmer',
        trading_model: 'commission'
    })
    const [savingFarmer, setSavingFarmer] = useState(false)

    // NEW STATE STRUCTURE
    const [transportDetails, setTransportDetails] = useState({
        farmer_id: '',
        trading_model: 'commission', // commission | self_purchase
        bill_no: '',
        guarantor: '',
        vehicle_type: 'Truck',
        truck_number: '',
        driver_name: '',
        hire: '',
        hamali: '',
        loaders_team: '',
        gross_weight: '', // User input for cross-check
        advance_paid: '',
        packing_charge: '', // Per Unit
        commission_percent: '', // For Adat
        weight_loss_type: 'weight', // percent | weight
        weight_loss_value: '',
        image_url: ''
    })

    // Multi-Item State
    interface ManifestItem {
        id: number
        item_type: string
        grade: string
        quantity: string
        unit_type: string
        weight_per_unit: string
        price_rate: string // Purchase Rate OR Market Rate
        cut_amount: string // Discount per unit/lot
    }

    const [items, setItems] = useState<ManifestItem[]>([
        { id: Date.now(), item_type: 'Apple (Royal)', grade: 'A', quantity: '', unit_type: 'Box', weight_per_unit: '25', price_rate: '', cut_amount: '' }
    ])

    // Image Upload State
    const [selectedImage, setSelectedImage] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (open) {
            fetchFarmers()
            resetForm()
        }
    }, [open])

    function resetForm() {
        setTransportDetails({
            farmer_id: '',
            trading_model: 'commission',
            bill_no: '',
            guarantor: '',
            vehicle_type: 'Truck',
            truck_number: '',
            driver_name: '',
            hire: '',
            hamali: '',
            loaders_team: '',
            gross_weight: '',
            advance_paid: '',
            packing_charge: '',
            commission_percent: '',
            weight_loss_type: 'weight',
            weight_loss_value: '',
            image_url: ''
        })
        setItems([{ id: Date.now(), item_type: 'Apple (Royal)', grade: 'A', quantity: '', unit_type: 'Box', weight_per_unit: '25', price_rate: '', cut_amount: '' }])
        setSelectedImage(null)
        setPreviewUrl(null)
        setIsAddingFarmer(false)
    }

    const { isVisible, isMandatory, getLabel } = useFieldGovernance(
        transportDetails.trading_model === 'self_purchase' ? 'arrivals_direct' : 'arrivals_farmer'
    )

    async function fetchFarmers() {
        const { data, error } = await supabase
            .schema('mandi')
            .from('contacts')
            .select('id, name, village, default_trading_model, type')
            .in('type', ['farmer', 'supplier'])
            .order('name')

        if (error) {
            console.error('Error fetching suppliers:', error)
            return
        }
        if (data) setFarmers(data)
    }

    // --- Helper Logic for Items ---
    const addItem = () => {
        setItems([...items, { id: Date.now(), item_type: 'Apple (Royal)', grade: '', quantity: '', unit_type: 'Box', weight_per_unit: '20', price_rate: '', cut_amount: '' }])
    }

    const removeItem = (id: number) => {
        if (items.length > 1) {
            setItems(items.filter(i => i.id !== id))
        }
    }

    const updateItem = (id: number, field: keyof ManifestItem, value: string) => {
        setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item))
    }

    // Calculations
    const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
    const rawTotalWeight = items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.weight_per_unit) || 0)), 0)

    // Global Weight Deductions
    const weightDeduction = transportDetails.weight_loss_type === 'percent'
        ? (rawTotalWeight * (Number(transportDetails.weight_loss_value) || 0) / 100)
        : (Number(transportDetails.weight_loss_value) || 0) * totalQuantity // If fixed weight, usually per unit (standard Mandi practice) - OR just global flat? Let's assume global flat if 'weight' type for simpler UI, OR per unit. Sticking to simple global logic for now: Value * Qty if logic implies 'Cut per unit', but usually 'Less Weight' in text means total. 
    // User Prompt says: "Less Weight (Crate/Nug)". This implies Per Unit deduction. 
    // Let's refine: If type is 'weight', it's per unit deduction. If 'percent', it's total percent.

    const calculatedWeightDeduction = transportDetails.weight_loss_type === 'percent'
        ? (rawTotalWeight * (Number(transportDetails.weight_loss_value) || 0) / 100)
        : (Number(transportDetails.weight_loss_value) || 0) * totalQuantity

    const finalNetWeight = rawTotalWeight - calculatedWeightDeduction


    // --- Farmer Save Logic ---
    async function saveNewFarmer() {
        if (!user?.id) return
        setSavingFarmer(true)
        try {
            let orgId = profile?.organization_id
            if (!orgId) {
                // Try to find existing organization (Fallback)
                const { data: orgData } = await supabase.schema('core').from('organizations').select('id').limit(1).maybeSingle()
                if (orgData) {
                    orgId = orgData.id
                } else {
                    const { data: newOrg } = await supabase.schema('core').from('organizations').insert({ name: 'My Mandi Shop', tenant_type: 'mandi' }).select('id').single()
                    orgId = newOrg?.id
                }
            }

            const { data, error } = await supabase.schema('mandi').from('contacts').insert({
                organization_id: orgId,
                name: newFarmer.name,
                village: newFarmer.village,
                phone: newFarmer.phone,
                type: newFarmer.type,
                trading_model: newFarmer.trading_model
            }).select('id, name, village, default_trading_model, type').single()

            if (error) throw error

            setFarmers([data, ...farmers])
            setTransportDetails({ ...transportDetails, farmer_id: data.id, trading_model: data.default_trading_model || 'commission' })
            setIsAddingFarmer(false)
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setSavingFarmer(false)
        }
    }


    // --- Main Submit Logic (Batch Insert) ---
    async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]
            setSelectedImage(file)
            setPreviewUrl(URL.createObjectURL(file))
        }
    }

    async function uploadImage(): Promise<string | null> {
        if (!selectedImage) return null
        const fileName = `${Date.now()}_${selectedImage.name.replace(/[^a-zA-Z0-9.]/g, '')}`
        const { error } = await supabase.storage.from('gate_entries').upload(fileName, selectedImage)
        if (error) return null
        const { data: { publicUrl } } = supabase.storage.from('gate_entries').getPublicUrl(fileName)
        return publicUrl
    }

    async function handleSubmit() {
        if (!user) { alert('Login required'); return }
        if (!transportDetails.farmer_id) { alert('Select Supplier'); return }
        setLoading(true)

        try {
            let orgId = profile?.organization_id
            if (!orgId) {
                const { data: orgData } = await supabase.schema('core').from('organizations').select('id').limit(1).maybeSingle()
                if (orgData) orgId = orgData.id
                else {
                    const { data: newOrg, error: createError } = await supabase.schema('core').from('organizations').insert({
                        name: 'My Mandi Shop', tenant_type: 'mandi'
                    }).select('id').single()
                    if (createError) throw new Error('Failed to init Organization: ' + createError.message)
                    orgId = newOrg.id
                }
            }
            if (!orgId) throw new Error('Critical: Organization ID could not be resolved.')

            let uploadedImageUrl = ''
            if (selectedImage) {
                const url = await uploadImage()
                if (url) uploadedImageUrl = url
            }

            // PREPARE BATCH PAYLOAD
            console.log("Mandi OS: Submitting Arrival...", items.length)

            const lotsToInsert = items.map((item, idx) => ({
                organization_id: orgId,
                farmer_id: transportDetails.farmer_id,
                lot_code: `GATE-${format(new Date(), 'yyMMdd')}-${(idx + 1).toString().padStart(2, '0')}`,

                // Header (Transportation)
                truck_number: transportDetails.truck_number,
                driver_name: transportDetails.driver_name,
                vehicle_type: transportDetails.vehicle_type,
                bill_no: transportDetails.bill_no,
                guarantor: transportDetails.guarantor,

                // Financials & Logic
                trading_model: transportDetails.trading_model,
                supplier_rate: transportDetails.trading_model === 'self_purchase' ? Number(item.price_rate) : 0,
                market_rate: transportDetails.trading_model === 'commission' ? Number(item.price_rate) : 0, // Just reference
                cut_amount: Number(item.cut_amount) || 0,

                // Master ERP Fields
                advance_paid: Number(transportDetails.advance_paid) || 0,
                packing_charge: Number(transportDetails.packing_charge) || 0,
                commission_percent: Number(transportDetails.commission_percent) || 0,
                weight_loss_type: transportDetails.weight_loss_type,
                weight_loss_value: Number(transportDetails.weight_loss_value) || 0,
                final_settlement_rate: null, // Initially null

                hire: Number(transportDetails.hire) || 0,
                hamali: Number(transportDetails.hamali) || 0,
                loaders_charge: 0, // Add field if needed specifically per lot, or split header

                // Item Specifics
                item_type: item.item_type,
                grade: item.grade,
                unit_type: item.unit_type,

                weight_per_unit: Number(item.weight_per_unit) || 0,
                initial_qty: Number(item.quantity),
                current_quantity: Number(item.quantity),
                total_weight: (Number(item.quantity) * Number(item.weight_per_unit)) || 0,

                loaders_team: transportDetails.loaders_team,
                image_url: uploadedImageUrl,
                status: 'active',

                // AUDITABLE NET WEIGHT
                net_weight: (() => {
                    const totalWt = (Number(item.quantity) * Number(item.weight_per_unit)) || 0;
                    let deduction = 0;
                    if (transportDetails.weight_loss_type === 'percent') {
                        deduction = totalWt * (Number(transportDetails.weight_loss_value) || 0) / 100;
                    } else {
                        // Per Unit Deduction
                        deduction = (Number(item.quantity) || 0) * (Number(transportDetails.weight_loss_value) || 0);
                    }
                    return Math.max(0, totalWt - deduction);
                })()
            }))

            const { error } = await supabase.schema('mandi').from('lots').insert(lotsToInsert)

            if (error) throw error

            setOpen(false)
            router.refresh()

        } catch (err: any) {
            alert('Failed: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="bg-neon-green text-black font-bold px-6 py-2 rounded-md hover:bg-green-400 transition-colors shadow-[0_0_15px_rgba(57,255,20,0.3)] flex items-center">
                    <Plus className="w-4 h-4 mr-2" />
                    New Entry
                </button>
            </DialogTrigger>

            {/* TYCOON STYLE: Max Width 7xl for full dashboard feel */}
            <DialogContent className="bg-[#050505] border-gray-800 text-white sm:max-w-[90vw] h-[95vh] flex flex-col p-0 overflow-hidden">

                {/* Header */}
                <div className="p-5 border-b border-gray-800 bg-gray-900/50 backdrop-blur flex justify-between items-center">
                    <div>
                        <DialogTitle className="text-2xl font-bold text-neon-green tracking-tight flex items-center gap-2">
                            <Truck className="w-6 h-6" />
                            Inward Arrival Desk
                        </DialogTitle>
                        <p className="text-gray-400 text-xs mt-1 uppercase tracking-widest font-bold">Mandi Operating System</p>
                    </div>
                    <div className="flex gap-8 text-right">
                        {isVisible('quantity') && (
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{getLabel('quantity', 'Total Qty')}</div>
                                <div className="text-xl font-mono font-bold text-white">{totalQuantity} <span className="text-xs text-gray-400 font-sans">Units</span></div>
                            </div>
                        )}
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Net Weight</div>
                            <div className="text-xl font-mono font-bold text-neon-green">{finalNetWeight} <span className="text-xs text-gray-400 font-sans">Kg</span></div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-black/50">

                    {isAddingFarmer ? (
                        /* ADD FARMER SUB-SCREEN */
                        <div className="animate-in fade-in zoom-in-95 duration-200 bg-gray-900 p-8 rounded-xl border border-gray-700 max-w-2xl mx-auto mt-10">
                            <h3 className="text-xl font-bold mb-6 text-neon-green">Register New Source</h3>

                            {/* Toggle Type */}
                            <div className="flex bg-black p-1 rounded-lg mb-6 border border-gray-800">
                                <button type="button" onClick={() => setNewFarmer({ ...newFarmer, type: 'farmer' })} className={`flex-1 py-2 rounded font-bold text-sm ${newFarmer.type === 'farmer' ? 'bg-gray-800 text-white' : 'text-gray-500'}`}>Farmer</button>
                                <button type="button" onClick={() => setNewFarmer({ ...newFarmer, type: 'supplier' })} className={`flex-1 py-2 rounded font-bold text-sm ${newFarmer.type === 'supplier' ? 'bg-gray-800 text-white' : 'text-gray-500'}`}>Supplier (Trader)</button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Entity Name</label>
                                    <input className="w-full bg-black border border-gray-700 p-3 rounded text-white focus:border-neon-green outline-none" placeholder="Name" value={newFarmer.name} onChange={e => setNewFarmer({ ...newFarmer, name: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <input className="w-full bg-black border border-gray-700 p-3 rounded text-white focus:border-neon-green outline-none" placeholder="Village / City" value={newFarmer.village} onChange={e => setNewFarmer({ ...newFarmer, village: e.target.value })} />
                                    <input className="w-full bg-black border border-gray-700 p-3 rounded text-white focus:border-neon-green outline-none" placeholder="Phone" value={newFarmer.phone} onChange={e => setNewFarmer({ ...newFarmer, phone: e.target.value })} />
                                </div>

                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Default Deal Type</label>
                                    <select
                                        className="w-full bg-black border border-gray-700 p-3 rounded text-white outline-none"
                                        value={newFarmer.trading_model}
                                        onChange={e => setNewFarmer({ ...newFarmer, trading_model: e.target.value })}
                                    >
                                        <option value="commission">Commission Agent (Adat)</option>
                                        <option value="self_purchase">Direct Purchase (Trading)</option>
                                    </select>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button onClick={() => setIsAddingFarmer(false)} className="flex-1 bg-gray-800 p-3 rounded hover:bg-gray-700 transition">Cancel</button>
                                    <button onClick={saveNewFarmer} disabled={savingFarmer} className="flex-1 bg-neon-green text-black font-bold p-3 rounded hover:bg-green-400 transition">{savingFarmer ? 'Saving...' : 'Register Entity'}</button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* SECTION 1: MASTER HEADER Details */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                                {/* A. SOURCE & DEAL (Col 1-4) */}
                                <div className="lg:col-span-4 bg-gray-900/40 p-5 rounded-2xl border border-gray-800/60 backdrop-blur-sm">
                                    <h4 className="text-neon-green font-bold text-sm uppercase tracking-wider mb-4 flex items-center"><User className="w-4 h-4 mr-2" /> Source Origin</h4>

                                    <div className="space-y-4">
                                        {isVisible('contact_id') && (
                                            <div className="flex gap-2">
                                                <div className="flex-1">
                                                    <label className="text-[10px] text-gray-500 font-bold uppercase">{getLabel('contact_id', 'Select Supplier')}</label>
                                                    <select
                                                        className="w-full bg-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-neon-green outline-none text-sm mt-1"
                                                        value={transportDetails.farmer_id}
                                                        onChange={e => {
                                                            const f = farmers.find(x => x.id === e.target.value)
                                                            setTransportDetails({
                                                                ...transportDetails,
                                                                farmer_id: e.target.value,
                                                                trading_model: f?.default_trading_model || 'commission'
                                                            })
                                                        }}
                                                        required={isMandatory('contact_id')}
                                                    >
                                                        <option value="">-- Choose Source --</option>
                                                        {farmers.map(f => (
                                                            <option key={f.id} value={f.id}>
                                                                {f.name} ({f.village}) {f.type ? `- [${f.type.toUpperCase()}]` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <button onClick={() => setIsAddingFarmer(true)} className="bg-gray-800 px-3 rounded-lg border border-gray-700 mt-6 hover:border-neon-green transition"><Plus className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                                            </div>
                                        )}

                                        {/* Deal Switcher */}
                                        {isVisible('arrival_type') && (
                                            <div className="bg-black/40 p-3 rounded-lg border border-gray-800">
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-[10px] text-gray-500 font-bold uppercase">{getLabel('arrival_type', 'Transaction Model')}</label>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${transportDetails.trading_model === 'commission' ? 'bg-blue-900/50 text-blue-200' : 'bg-purple-900/50 text-purple-200'}`}>
                                                        {transportDetails.trading_model === 'commission' ? 'COMMISSION AGENT' : 'DIRECT PURCHASE'}
                                                    </span>
                                                </div>
                                                <select
                                                    className="w-full bg-transparent border-none text-white font-bold text-sm outline-none cursor-pointer"
                                                    value={transportDetails.trading_model}
                                                    onChange={e => setTransportDetails({ ...transportDetails, trading_model: e.target.value })}
                                                    required={isMandatory('arrival_type')}
                                                >
                                                    <option value="commission">Selling on Commission (Adat)</option>
                                                    <option value="self_purchase">Direct Buying (Trading)</option>
                                                </select>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-3">
                                            {isVisible('reference_no') && (
                                                <div>
                                                    <label className="text-[10px] text-gray-500 font-bold uppercase">{getLabel('reference_no', 'Bill / Challan No')}</label>
                                                    <input className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm mt-1 focus:border-neon-green outline-none"
                                                        value={transportDetails.bill_no} onChange={e => setTransportDetails({ ...transportDetails, bill_no: e.target.value })}
                                                        required={isMandatory('reference_no')}
                                                        placeholder={getLabel('reference_no', "Reference #")} />
                                                </div>
                                            )}
                                            {isVisible('guarantor') && (
                                                <div>
                                                    <label className="text-[10px] text-gray-500 font-bold uppercase">{getLabel('guarantor', 'Guarantor')}</label>
                                                    <input className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm mt-1 focus:border-neon-green outline-none"
                                                        value={transportDetails.guarantor} onChange={e => setTransportDetails({ ...transportDetails, guarantor: e.target.value })}
                                                        required={isMandatory('guarantor')}
                                                        placeholder={getLabel('guarantor', "Valid By")} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* B. LOGISTICS (Col 5-8) */}
                                <div className="lg:col-span-5 bg-gray-900/40 p-5 rounded-2xl border border-gray-800/60 backdrop-blur-sm">
                                    <h4 className="text-neon-green font-bold text-sm uppercase tracking-wider mb-4 flex items-center"><Truck className="w-4 h-4 mr-2" /> Logistics & Expenses</h4>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2 flex gap-3">
                                            {isVisible('vehicle_type') && (
                                                <select className="w-1/3 bg-black border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-neon-green"
                                                    value={transportDetails.vehicle_type} onChange={e => setTransportDetails({ ...transportDetails, vehicle_type: e.target.value })}
                                                    required={isMandatory('vehicle_type')}>
                                                    <option>Truck</option><option>Pickup</option><option>Tractor</option><option>Auto</option>
                                                </select>
                                            )}
                                            {isVisible('vehicle_number') && (
                                                <input className={`${isVisible('vehicle_type') ? 'w-2/3' : 'w-full'} bg-black border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-neon-green uppercase font-mono`}
                                                    placeholder={getLabel('vehicle_number', "HR-55-...")}
                                                    value={transportDetails.truck_number} onChange={e => setTransportDetails({ ...transportDetails, truck_number: e.target.value })}
                                                    required={isMandatory('vehicle_number')} />
                                            )}
                                        </div>

                                        {isVisible('driver_name') && (
                                            <input className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-neon-green"
                                                placeholder={getLabel('driver_name', "Driver Name")}
                                                value={transportDetails.driver_name} onChange={e => setTransportDetails({ ...transportDetails, driver_name: e.target.value })}
                                                required={isMandatory('driver_name')} />
                                        )}

                                        {isVisible('loaders_team') && (
                                            <input className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-neon-green"
                                                placeholder={getLabel('loaders_team', "Loaders Team")}
                                                value={transportDetails.loaders_team} onChange={e => setTransportDetails({ ...transportDetails, loaders_team: e.target.value })}
                                                required={isMandatory('loaders_team')} />
                                        )}

                                        {/* FINANCIALS GRID */}
                                        <div className="col-span-2 grid grid-cols-3 gap-2 bg-black/30 p-2 rounded-lg border border-gray-800 mt-2">
                                            {isVisible('hire_charges') && (
                                                <div>
                                                    <label className="text-[9px] text-gray-500 font-bold uppercase block mb-1">{getLabel('hire_charges', 'Hire (₹)')}</label>
                                                    <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded p-1 text-white text-xs"
                                                        value={transportDetails.hire} onChange={e => setTransportDetails({ ...transportDetails, hire: e.target.value })}
                                                        required={isMandatory('hire_charges')} />
                                                </div>
                                            )}
                                            {isVisible('hamali_expenses') && (
                                                <div>
                                                    <label className="text-[9px] text-gray-500 font-bold uppercase block mb-1">{getLabel('hamali_expenses', 'Hamali (₹)')}</label>
                                                    <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded p-1 text-white text-xs"
                                                        value={transportDetails.hamali} onChange={e => setTransportDetails({ ...transportDetails, hamali: e.target.value })}
                                                        required={isMandatory('hamali_expenses')} />
                                                </div>
                                            )}
                                            {isVisible('advance_paid') && (
                                                <div>
                                                    <label className="text-[9px] text-gray-500 font-bold uppercase block mb-1">{getLabel('advance_paid', 'Advance (₹)')}</label>
                                                    <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded p-1 text-white text-xs text-neon-green"
                                                        value={transportDetails.advance_paid} onChange={e => setTransportDetails({ ...transportDetails, advance_paid: e.target.value })}
                                                        required={isMandatory('advance_paid')} />
                                                </div>
                                            )}

                                            {isVisible('packing_charge') && (
                                                <div>
                                                    <label className="text-[9px] text-gray-500 font-bold uppercase block mb-1">{getLabel('packing_charge', 'Pack Chg/Unit')}</label>
                                                    <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded p-1 text-white text-xs"
                                                        value={transportDetails.packing_charge} onChange={e => setTransportDetails({ ...transportDetails, packing_charge: e.target.value })}
                                                        required={isMandatory('packing_charge')} />
                                                </div>
                                            )}
                                            {isVisible('commission_percent') && (
                                                <div>
                                                    <label className="text-[9px] text-gray-500 font-bold uppercase block mb-1">{getLabel('commission_percent', 'Comm %')}</label>
                                                    <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded p-1 text-white text-xs" placeholder="Default"
                                                        value={transportDetails.commission_percent} onChange={e => setTransportDetails({ ...transportDetails, commission_percent: e.target.value })}
                                                        required={isMandatory('commission_percent')} />
                                                </div>
                                            )}
                                            {isVisible('weight_loss_value') && (
                                                <div>
                                                    <label className="text-[9px] text-gray-500 font-bold uppercase block mb-1">{getLabel('weight_loss_value', 'Wt. Loss')}</label>
                                                    <div className="flex">
                                                        <input type="number" className="w-2/3 bg-gray-900 border border-gray-700 rounded-l p-1 text-white text-xs"
                                                            value={transportDetails.weight_loss_value} onChange={e => setTransportDetails({ ...transportDetails, weight_loss_value: e.target.value })}
                                                            required={isMandatory('weight_loss_value')} />
                                                        <select className="w-1/3 bg-gray-800 border border-gray-700 border-l-0 rounded-r text-[9px] text-gray-400 outline-none"
                                                            value={transportDetails.weight_loss_type} onChange={e => setTransportDetails({ ...transportDetails, weight_loss_type: e.target.value })}>
                                                            <option value="weight">Kg</option>
                                                            <option value="percent">%</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* C. ATTACHMENT (Col 9-12) */}
                                <div className="lg:col-span-3 bg-gray-900/40 p-5 rounded-2xl border border-gray-800/60 backdrop-blur-sm flex flex-col">
                                    <h4 className="text-neon-green font-bold text-sm uppercase tracking-wider mb-4 flex items-center"><Upload className="w-4 h-4 mr-2" /> Proof</h4>
                                    <div onClick={() => fileInputRef.current?.click()} className="flex-1 border-2 border-dashed border-gray-700 rounded-xl flex items-center justify-center cursor-pointer hover:border-neon-green hover:bg-gray-800/50 transition-all overflow-hidden relative group min-h-[120px]">
                                        {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" /> : <div className="text-center text-gray-500"><Upload className="w-8 h-8 mx-auto mb-2 opacity-50" /> <span className="text-xs font-bold">UPLOAD SLIP</span></div>}
                                    </div>
                                    <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleFileSelect} />
                                </div>
                            </div>

                            {/* SECTION 2: THE CONSIGNMENT MANIFEST */}
                            <div className="flex-1 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative">
                                {/* Table Headers */}
                                <div className="bg-black/60 p-3 border-b border-gray-700 grid grid-cols-12 gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-4">
                                    <div className="col-span-3">Item Description</div>
                                    <div className="col-span-1">Grade</div>
                                    <div className="col-span-2 text-center">Packaging</div>
                                    <div className="col-span-1 text-center">Unit Wt (kg)</div>
                                    <div className="col-span-2 text-right pr-2">
                                        {transportDetails.trading_model === 'commission' ? 'Est Market Rate' : 'Purchase Rate'} (₹)
                                    </div>
                                    <div className="col-span-2 text-right pr-2">Line Total (Calc)</div>
                                    <div className="col-span-1 text-center">Action</div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-[#080808]">
                                    {items.map((item, idx) => {
                                        const lineWeight = (Number(item.quantity) || 0) * (Number(item.weight_per_unit) || 0);
                                        const lineVal = (Number(item.quantity) || 0) * (Number(item.price_rate) || 0);

                                        return (
                                            <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-black border border-gray-800 p-2 rounded-lg hover:border-gray-600 transition-all group">
                                                {/* Item Name */}
                                                <div className="col-span-3">
                                                    {isVisible('item_id') && (
                                                        <input className="w-full bg-transparent border-none outline-none text-white font-medium placeholder-gray-600 text-sm"
                                                            placeholder={getLabel('item_id', 'Item Name')} value={item.item_type} onChange={e => updateItem(item.id, 'item_type', e.target.value)}
                                                            required={isMandatory('item_id')} />
                                                    )}
                                                </div>

                                                {/* Grade */}
                                                <div className="col-span-1">
                                                    {isVisible('grade') && (
                                                        <input className="w-full bg-gray-900 border border-gray-800 rounded p-1.5 text-neon-green text-center font-bold text-xs uppercase"
                                                            placeholder={getLabel('grade', "GRD")} value={item.grade} onChange={e => updateItem(item.id, 'grade', e.target.value)}
                                                            required={isMandatory('grade')} />
                                                    )}
                                                </div>

                                                {/* Packaging */}
                                                <div className="col-span-2 flex gap-1">
                                                    {isVisible('quantity') && (
                                                        <input type="number" className="w-1/2 bg-gray-900 border border-gray-800 rounded p-1.5 text-white text-right font-mono text-sm"
                                                            placeholder={getLabel('quantity', "Qty")} value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)}
                                                            required={isMandatory('quantity')} />
                                                    )}
                                                    {isVisible('unit_type') && (
                                                        <select className="w-1/2 bg-gray-900 border border-gray-800 rounded text-xs text-gray-300 outline-none"
                                                            value={item.unit_type} onChange={e => updateItem(item.id, 'unit_type', e.target.value)}
                                                            required={isMandatory('unit_type')}>
                                                            <option>Box</option><option>Crate</option><option>Bag</option><option>Ton</option><option>Nag</option><option>Kg</option>
                                                        </select>
                                                    )}
                                                </div>

                                                {/* Unit Wt */}
                                                <div className="col-span-1">
                                                    {isVisible('weight_per_unit') && (
                                                        <input type="number" className="w-full bg-gray-900 border border-gray-800 rounded p-1.5 text-gray-300 text-center font-mono text-xs"
                                                            placeholder={getLabel('weight_per_unit', "Kg")} value={item.weight_per_unit} onChange={e => updateItem(item.id, 'weight_per_unit', e.target.value)}
                                                            required={isMandatory('weight_per_unit')} />
                                                    )}
                                                </div>

                                                {/* Rate */}
                                                <div className="col-span-2">
                                                    {isVisible('price_rate') || isVisible('market_rate') ? (
                                                        <input type="number" className={`w-full bg-gray-900 border rounded p-1.5 text-right font-mono text-sm ${transportDetails.trading_model === 'commission' ? 'border-dashed border-gray-700 text-gray-400' : 'border-neon-green text-neon-green'}`}
                                                            placeholder="0.00" value={item.price_rate} onChange={e => updateItem(item.id, 'price_rate', e.target.value)}
                                                            required={isMandatory('price_rate')} />
                                                    ) : null}
                                                </div>

                                                {/* Line Total (Display Only) */}
                                                <div className="col-span-2 text-right text-gray-500 font-mono text-xs flex flex-col justify-center pr-2">
                                                    <div>{lineWeight > 0 ? `${lineWeight} Kg` : '-'}</div>
                                                </div>

                                                {/* Delete */}
                                                <div className="col-span-1 text-center">
                                                    {items.length > 1 && (
                                                        <button onClick={() => removeItem(item.id)} className="text-gray-600 hover:text-red-500 transition-colors">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                <button onClick={addItem} className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2">
                                    <Plus className="w-3 h-3" /> Add Item Line
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Action Bar */}
                <div className="p-4 border-t border-gray-800 bg-gray-900 flex justify-between items-center">
                    <div>
                        {transportDetails.trading_model === 'self_purchase' && (
                            <div className="text-xs text-gray-400">Total Purchase Value: <span className="text-white font-bold text-lg">₹{items.reduce((s, i) => s + ((Number(i.quantity) || 0) * (Number(i.price_rate) || 0)), 0).toLocaleString()}</span></div>
                        )}
                        <div className="text-[10px] text-gray-600">By saving, you verify all weights and rates are correct.</div>
                    </div>

                    <div className="flex gap-4">
                        <button onClick={() => setOpen(false)} className="px-6 py-3 text-gray-400 font-medium hover:text-white transition-colors text-sm">Discard</button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="bg-neon-green hover:bg-green-400 text-black font-bold px-8 py-2 rounded-lg shadow-lg flex items-center gap-2 transform active:scale-95 transition-all"
                        >
                            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <><Save className="w-4 h-4" /> CONFIRM ARRIVAL</>}
                        </button>
                    </div>
                </div>

            </DialogContent>
        </Dialog>
    )
}
