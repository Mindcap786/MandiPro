"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import { Plus, Search, Scale, Package, ChevronRight, User } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/hooks/use-toast";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

import { useMandiSession, MandiSessionInput, MandiSessionFarmerRow, computeFarmerRow } from "@/hooks/mandi/useMandiSession";
import { AddedFarmerCard } from "./farmer-row";
import { SummaryPanel } from "./summary-panel";
import { SessionBillsView } from "./session-bills-view";

const generateUUID = () => crypto.randomUUID();

const STANDARD_UNITS = ["Box", "Crate", "Kgs", "Tons", "Nug", "Pieces", "Carton"];

export function MandiCommissionForm() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const { isCommitting, commitSession, fetchSessionDetail } = useMandiSession();

    // Session Metadata
    const [lotNo, setLotNo] = useState("");
    const [vehicleNo, setVehicleNo] = useState("");
    const [bookNo, setBookNo] = useState("");

    // ─────────────────────────────────────────────────────────────
    // Master Data State
    // ─────────────────────────────────────────────────────────────
    const [farmers, setFarmers] = useState<any[]>([]);
    const [buyers, setBuyers] = useState<any[]>([]);
    const [commodities, setCommodities] = useState<any[]>([]);
    const [units, setUnits] = useState<string[]>(STANDARD_UNITS);
    const [globalUnit, setGlobalUnit] = useState<string>("Box");
    const [settings, setSettings] = useState<any>(null);

    // ─────────────────────────────────────────────────────────────
    // Form Variables
    // ─────────────────────────────────────────────────────────────
    const [sessionDate, setSessionDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

    // The list of COMMITTED local rows for this session
    const [rows, setRows] = useState<MandiSessionFarmerRow[]>([]);
    
    // The active, DRAFT row being edited in the Master-Detail right pane
    const [currentRow, setCurrentRow] = useState<Partial<MandiSessionFarmerRow>>({});

    const [buyerId, setBuyerId] = useState<string | null>(null);
    const [buyerLoading, setBuyerLoading] = useState<number>(0);
    const [buyerPacking, setBuyerPacking] = useState<number>(0);

    const [committedSessionData, setCommittedSessionData] = useState<any>(null);

    // Refs for keyboard navigation
    const farmerSearchRef = useRef<HTMLButtonElement>(null);
    const itemSearchRef = useRef<HTMLButtonElement>(null);
    const qtyRef = useRef<HTMLInputElement>(null);
    const rateRef = useRef<HTMLInputElement>(null);
    const lessPercentRef = useRef<HTMLInputElement>(null);
    const lessUnitsRef = useRef<HTMLInputElement>(null);
    const loadingRef = useRef<HTMLInputElement>(null);
    const otherChargesRef = useRef<HTMLInputElement>(null);
    const commPctRef = useRef<HTMLInputElement>(null);
    const addBtnRef = useRef<HTMLButtonElement>(null);
    const buyerSearchRef = useRef<HTMLButtonElement>(null);
    const buyerLoadingRef = useRef<HTMLInputElement>(null);
    const buyerPackingRef = useRef<HTMLInputElement>(null);
    const submitBtnRef = useRef<HTMLButtonElement>(null);

    // ─────────────────────────────────────────────────────────────
    // Initial Load
    // ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!profile?.organization_id) return;
        const loadMasterData = async () => {
            const orgId = profile.organization_id;
            const [contactsRes, commRes, setsRes, unitsRes] = await Promise.all([
                supabase.schema('mandi').from("contacts").select("id, name, type:contact_type, city, internal_id").eq("organization_id", orgId).order("name"),
                supabase.schema('mandi').from("commodities").select("*").eq("organization_id", orgId).order("name"),
                supabase.schema('mandi').from("mandi_settings" as any).select("*").eq("organization_id", orgId).maybeSingle(),
                supabase.schema('mandi').from("units").select("name").eq("organization_id", orgId),
            ]);

            if (contactsRes.data) {
                setFarmers(contactsRes.data.filter(c => c.type === 'farmer' || c.type === 'supplier' || c.type === 'both'));
                setBuyers(contactsRes.data.filter(c => c.type === 'buyer' || c.type === 'customer' || c.type === 'both'));
            }
            if (commRes.data) setCommodities(commRes.data);
            if (setsRes.data) {
                setSettings(setsRes.data);
                resetCurrentRow(setsRes.data.commission_rate_default);
            }
            if (unitsRes.data) {
                const dbUnits = unitsRes.data.map(u => u.name);
                // Merge standard units with DB units, keeping them unique
                setUnits(Array.from(new Set([...STANDARD_UNITS, ...dbUnits, "Kg"])));
            }
        };
        loadMasterData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile]);

    // ─────────────────────────────────────────────────────────────
    // Handlers
    // ─────────────────────────────────────────────────────────────
    const resetCurrentRow = (defaultComm = settings?.commission_rate_default || 0) => {
        setCurrentRow(prev => ({
            id: generateUUID(),
            farmerId: prev.farmerId || "",
            farmerName: prev.farmerName || "",
            itemId: "",
            itemName: "",
            internalCode: "",
            qty: 0,
            unit: globalUnit,
            rate: 0,
            lessPercent: 0,
            lessUnits: 0,
            loadingCharges: 0,
            otherCharges: 0,
            commissionPercent: defaultComm,
            grossAmount: 0,
            lessAmount: 0,
            netAmount: 0,
            commissionAmount: 0,
            netPayable: 0,
            netQty: 0,
        }));
        
        // Auto-focus first field when resetting
        setTimeout(() => {
            farmerSearchRef.current?.focus();
        }, 50);
    };

    const handleCurrentRowChange = useCallback(
        (field: keyof MandiSessionFarmerRow, value: any, editedField?: "lessPercent" | "lessUnits") => {
            setCurrentRow(prev => {
                const patch: Partial<MandiSessionFarmerRow> & { _lastEdited?: string } = {
                    ...prev,
                    [field]: value,
                    _lastEdited: editedField,
                };
                return computeFarmerRow(patch) as Partial<MandiSessionFarmerRow>;
            });
        },
        []
    );

    const handleFarmerSelect = useCallback(
        (farmerId: string) => {
            const farmer = farmers.find((f) => f.id === farmerId);
            handleCurrentRowChange("farmerId", farmerId);
            handleCurrentRowChange("farmerName", farmer?.name || "");
        },
        [farmers, handleCurrentRowChange]
    );

    const handleItemSelect = useCallback(
        (itemId: string) => {
            const item = commodities.find((i) => i.id === itemId);
            setCurrentRow(prev => computeFarmerRow({
                ...prev,
                itemId,
                itemName: item?.name || "",
                internalCode: item?.internal_id || "",
                unit: item?.default_unit || globalUnit,
            }) as Partial<MandiSessionFarmerRow>);
        },
        [commodities, globalUnit]
    );

    const handleAddRow = () => {
        if (!currentRow.farmerId || !currentRow.itemId || !currentRow.qty || !currentRow.rate) {
            toast({ title: "Validation Check", description: "Farmer, Item, Qty, and Rate are required to add.", variant: "destructive" });
            return;
        }

        // Add to list and clear current
        setRows(prev => [...prev, currentRow as MandiSessionFarmerRow]);
        resetCurrentRow();
    };

    const handleDeleteRow = (index: number) => {
        setRows(prev => prev.filter((_, i) => i !== index));
    };

    const handleLoadRowToEdit = (index: number) => {
        const rowToEdit = rows[index];
        setCurrentRow(rowToEdit);
        setRows(prev => prev.filter((_, i) => i !== index));
        toast({ title: "Row loaded", description: "Editing farmer details.", variant: "default" });
    };

    // Keyboard Navigation Logic
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLElement>, nextField?: React.RefObject<any>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                
                // Special case for Farmer Search: if empty AND we have rows, jump to Buyer section
                if (e.currentTarget === farmerSearchRef.current && !currentRow.farmerId && rows.length > 0) {
                    buyerSearchRef.current?.focus();
                    return;
                }

                if (nextField?.current) {
                    nextField.current.focus();
                } else if (e.currentTarget.classList.contains("add-btn")) {
                    handleAddRow();
                }
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [currentRow, rows]
    );


    const handleSubmit = async () => {
        if (!profile?.organization_id) return;

        const validFarmers = rows.filter(r => r.farmerId && r.itemId && r.qty > 0 && r.rate > 0);
        if (validFarmers.length === 0) {
            toast({ title: "Validation Error", description: "Please add at least one complete farmer row first.", variant: "destructive" });
            return;
        }

        const totalNetQty = validFarmers.reduce((sum, f) => sum + f.netQty, 0);
        const totalNetAmount = validFarmers.reduce((sum, f) => sum + f.netAmount, 0);

        // Derive saleRate as weighted average net rate
        const derivedSaleRate = totalNetQty > 0 ? parseFloat((totalNetAmount / totalNetQty).toFixed(2)) : 0;
        const buyerPayable = buyerId ? totalNetAmount + buyerLoading + buyerPacking : 0;
        const buyerName = buyers.find(b => b.id === buyerId)?.name;

        const input: MandiSessionInput = {
            organizationId: profile.organization_id,
            sessionDate,
            lotNo,
            vehicleNo,
            bookNo,
            farmers: validFarmers,
            buyerId,
            buyerName,
            buyerLoadingCharges: buyerLoading,
            buyerPackingCharges: buyerPacking,
            totalNetQty,
            saleRate: derivedSaleRate,
            buyerPayable,
        };

        const res = await commitSession(input);
        if (res?.sessionId) {
            toast({ title: "Session Committed", description: "Records generated successfully." });
            const detail = await fetchSessionDetail(res.sessionId);
            setCommittedSessionData(detail);
        }
    };

    const handleReset = () => {
        setLotNo("");
        setVehicleNo("");
        setBookNo("");
        setBuyerId(null);
        setBuyerLoading(0);
        setBuyerPacking(0);
        setCommittedSessionData(null);
        setRows([]);
        resetCurrentRow();
    };

    // ─────────────────────────────────────────────────────────────
    // Renders
    // ─────────────────────────────────────────────────────────────
    const buildItemLabel = (item: any) => {
        const parts = [];
        if (item.internal_id) parts.push(`[${item.internal_id}]`);
        parts.push(item.name);
        return parts.join(" ");
    };

    if (committedSessionData) {
        return <SessionBillsView sessionData={committedSessionData} onNewSession={handleReset} />;
    }

    const inputCls = "h-10 text-base font-bold text-slate-900 bg-white border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-3 transition-all";

    return (
        <div className="max-w-[1400px] mx-auto space-y-4">
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm">
                    <Scale className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Purchase + Sale</h1>
                    <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest mt-1">Single-Screen Native Application</p>
                </div>
            </div>

            {/* Global Header */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm grid grid-cols-5 gap-4">
                <div>
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Date</Label>
                    <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="h-10 font-bold bg-slate-50 mt-1 rounded-lg" />
                </div>
                <div>
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Lot No.</Label>
                    <div className="relative mt-1">
                        <Input placeholder="LOT NBS" value={lotNo} onChange={(e) => setLotNo(e.target.value)} className="h-10 font-bold font-mono tracking-widest uppercase pl-10 rounded-lg" />
                        <Package className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                </div>
                <div>
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Unit</Label>
                    <select 
                        value={globalUnit} 
                        onChange={(e) => setGlobalUnit(e.target.value)} 
                        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900 px-3 mt-1"
                    >
                        {units.map((u) => (<option key={u} value={u}>{u}</option>))}
                    </select>
                </div>
                <div>
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Vehicle No</Label>
                    <Input placeholder="XX-00-YY-0000" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className="h-10 font-bold uppercase mt-1 rounded-lg" />
                </div>
                <div>
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Book No.</Label>
                    <Input placeholder="Book-123" value={bookNo} onChange={(e) => setBookNo(e.target.value)} className="h-10 font-bold uppercase mt-1 rounded-lg" />
                </div>
            </div>

            {/* Main 3-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                
                {/* 1. Added Farmers List */}
                <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-4 min-h-[480px]">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                        <User className="w-4 h-4 text-emerald-600" /> Latest Arrivals ({rows.length})
                    </h3>
                    
                    {rows.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 mt-20">
                            <Plus className="w-10 h-10 mb-2 opacity-20" />
                            <p className="text-sm font-bold">No farmers added</p>
                            <p className="text-xs">Fill the details and click Add</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {rows.map((row, idx) => (
                                <AddedFarmerCard 
                                    key={row.id || idx} 
                                    index={idx} 
                                    row={row} 
                                    onDelete={handleDeleteRow}
                                    onClick={() => handleLoadRowToEdit(idx)} 
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* 2. Farmer Details Form (Active) */}
                <div className="bg-white border-2 border-emerald-100 rounded-2xl p-5 pt-4 shadow-lg shadow-emerald-500/5 relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-400"></div>

                    <div className="space-y-4">
                        <div>
                             <SearchableSelect
                                ref={farmerSearchRef}
                                options={farmers.map((f) => ({
                                    label: `${f.name}${f.internal_id ? ` [${f.internal_id}]` : ""}${f.city ? ` (${f.city})` : ""}`,
                                    value: f.id,
                                }))}
                                value={currentRow.farmerId || ""}
                                onChange={handleFarmerSelect}
                                onSelected={() => itemSearchRef.current?.focus()}
                                placeholder="Search Farmer Name..."
                                className="h-12 text-base font-bold border-2 border-slate-200 mt-1 rounded-xl"
                            />
                        </div>

                        <div>
                            <SearchableSelect
                                ref={itemSearchRef}
                                options={commodities.map((i) => ({
                                    label: buildItemLabel(i),
                                    value: i.id,
                                }))}
                                value={currentRow.itemId || ""}
                                onChange={handleItemSelect}
                                onSelected={() => qtyRef.current?.focus()}
                                placeholder="Search Item / Variety..."
                                className="h-12 text-base font-bold border-2 border-slate-200 mt-1 rounded-xl"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Input ref={qtyRef} type="number" min={0} step="any" value={currentRow.qty || ""} onChange={(e) => handleCurrentRowChange("qty", parseFloat(e.target.value) || 0)} onKeyDown={(e) => handleKeyDown(e, rateRef)} className={inputCls} placeholder="Qty" />
                            </div>
                             <div>
                                <Input ref={rateRef} type="number" min={0} step="any" value={currentRow.rate || ""} onChange={(e) => handleCurrentRowChange("rate", parseFloat(e.target.value) || 0)} onKeyDown={(e) => handleKeyDown(e, lessPercentRef)} className={inputCls} placeholder="Price (₹)" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <Input ref={lessPercentRef} type="number" min={0} step="any" value={currentRow.lessPercent || ""} onChange={(e) => handleCurrentRowChange("lessPercent", parseFloat(e.target.value) || 0, "lessPercent")} onKeyDown={(e) => handleKeyDown(e, lessUnitsRef)} className={inputCls + " text-red-600"} placeholder="Less %" />
                            </div>
                            <div>
                                <Input ref={lessUnitsRef} type="number" min={0} step="any" value={currentRow.lessUnits || ""} onChange={(e) => handleCurrentRowChange("lessUnits", parseFloat(e.target.value) || 0, "lessUnits")} onKeyDown={(e) => handleKeyDown(e, loadingRef)} className={inputCls + " text-red-600"} placeholder="Less Weight" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Input ref={loadingRef} type="number" min={0} step="any" value={currentRow.loadingCharges || ""} onChange={(e) => handleCurrentRowChange("loadingCharges", parseFloat(e.target.value) || 0)} onKeyDown={(e) => handleKeyDown(e, otherChargesRef)} className={inputCls} placeholder="Loading Charges" />
                            </div>
                            <div>
                                <Input ref={otherChargesRef} type="number" min={0} step="any" value={currentRow.otherCharges || ""} onChange={(e) => handleCurrentRowChange("otherCharges", parseFloat(e.target.value) || 0)} onKeyDown={(e) => handleKeyDown(e, commPctRef)} className={inputCls} placeholder="Other Charges" />
                            </div>
                        </div>
                        
                        <div>
                            <Input ref={commPctRef} type="number" min={0} step="any" value={currentRow.commissionPercent || ""} onChange={(e) => handleCurrentRowChange("commissionPercent", parseFloat(e.target.value) || 0)} onKeyDown={(e) => handleKeyDown(e, addBtnRef)} className={inputCls} placeholder="Commission %" />
                        </div>

                        <div className="pt-2">
                             <Button 
                                ref={addBtnRef}
                                type="button"
                                onClick={handleAddRow}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleAddRow();
                                    }
                                }}
                                className="add-btn w-full h-14 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-black text-xl tracking-widest shadow-lg shadow-emerald-500/20 shadow-[inset_0px_1px_1px_rgba(255,255,255,0.4)] transition-all"
                            >
                                [Add] <Plus className="ml-2 w-6 h-6" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 3. Summary Panel */}
                <div className="space-y-4">
                    <SummaryPanel
                        farmers={rows}
                        hasBuyer={!!buyerId}
                        buyerName={buyers.find(b => b.id === buyerId)?.name}
                        buyerLoadingCharges={buyerLoading}
                        buyerPackingCharges={buyerPacking}
                    />
                </div>
            </div>

            {/* Bottom Buyer Section directly based on Sci-Fi Mockup */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 p-1 border-t border-slate-200/50 pt-6">
                <div className="bg-blue-50/50 border-2 border-blue-200 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-blue-600 ml-1 flex items-center gap-2">
                            🤝 Buyer Name (Sale)
                        </Label>
                        {buyerId && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => {
                                    setBuyerId(null);
                                    setBuyerLoading(0);
                                    setBuyerPacking(0);
                                }}
                                className="h-6 px-2 text-[9px] font-black text-red-600 hover:text-red-700 hover:bg-red-50 uppercase tracking-tighter"
                            >
                                Remove Buyer
                            </Button>
                        )}
                    </div>
                    <SearchableSelect
                        ref={buyerSearchRef}
                        options={buyers.map(b => ({ label: `${b.name}${b.internal_id ? ` [${b.internal_id}]` : ""}${b.city ? ` (${b.city})` : ""}`, value: b.id }))}
                        value={buyerId || ""}
                        onChange={setBuyerId}
                        onSelected={() => buyerLoadingRef.current?.focus()}
                        placeholder="Search buyer..."
                        className="h-12 text-base font-bold border-blue-200 focus:border-blue-500 bg-white rounded-xl"
                    />
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-center">
                     <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1 flex items-center gap-2 mb-2">
                        📦 Loading/crate charges (₹)
                    </Label>
                    <Input ref={buyerLoadingRef} type="number" min={0} step="any" placeholder="0" value={buyerLoading || ""} onChange={(e) => setBuyerLoading(parseFloat(e.target.value) || 0)} onKeyDown={(e) => handleKeyDown(e, buyerPackingRef)} className="h-12 text-xl font-bold bg-white border-slate-200 rounded-xl" />
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-center">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1 flex items-center gap-2 mb-2">
                        📦 Packing charge (₹)
                    </Label>
                    <Input ref={buyerPackingRef} type="number" min={0} step="any" placeholder="0" value={buyerPacking || ""} onChange={(e) => setBuyerPacking(parseFloat(e.target.value) || 0)} onKeyDown={(e) => handleKeyDown(e, submitBtnRef)} className="h-12 text-xl font-bold bg-white border-slate-200 rounded-xl" />
                </div>
            </div>

            {/* Final Submit & Print (Bottom Center) */}
            <div className="flex justify-center mt-12 mb-20">
                <Button
                    ref={submitBtnRef}
                    className="w-full max-w-xl h-16 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-2xl tracking-widest shadow-2xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    onClick={handleSubmit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            handleSubmit();
                        }
                    }}
                    disabled={isCommitting}
                >
                    {isCommitting ? "GENERATING BILLS..." : "SUBMIT & PRINT"}
                    <ChevronRight className="w-8 h-8" />
                </Button>
            </div>
        </div>
    );
}
