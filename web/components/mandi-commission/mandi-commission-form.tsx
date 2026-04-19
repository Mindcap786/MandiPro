"use client";

import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { Plus, Search, Scale, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/hooks/use-toast";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

import { useMandiSession, MandiSessionInput, MandiSessionFarmerRow, computeFarmerRow } from "@/hooks/mandi/useMandiSession";
import { FarmerRowHeaders, FarmerRow } from "./farmer-row";
import { SummaryPanel } from "./summary-panel";
import { SessionBillsView } from "./session-bills-view";

const generateUUID = () => crypto.randomUUID();

export function MandiCommissionForm() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const { isCommitting, commitSession, fetchSessionDetail } = useMandiSession();

    // ─────────────────────────────────────────────────────────────
    // Master Data State
    // ─────────────────────────────────────────────────────────────
    const [farmers, setFarmers] = useState<any[]>([]);
    const [buyers, setBuyers] = useState<any[]>([]);
    const [commodities, setCommodities] = useState<any[]>([]);
    const [units, setUnits] = useState<string[]>(["Kg", "Box", "Gram", "Quintal", "Ton"]);
    const [settings, setSettings] = useState<any>(null);

    // ─────────────────────────────────────────────────────────────
    // Local UI State
    // ─────────────────────────────────────────────────────────────
    const [showBuyer, setShowBuyer] = useState(false);
    const [committedSessionData, setCommittedSessionData] = useState<any>(null);

    // ─────────────────────────────────────────────────────────────
    // Form State (Header + Farmer Rows + Buyer)
    // ─────────────────────────────────────────────────────────────
    const [sessionDate, setSessionDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
    const [lotNo, setLotNo] = useState("");
    const [vehicleNo, setVehicleNo] = useState("");
    const [bookNo, setBookNo] = useState("");

    const [rows, setRows] = useState<MandiSessionFarmerRow[]>([]);

    const [buyerId, setBuyerId] = useState<string | null>(null);
    const [saleRate, setSaleRate] = useState<number>(0);
    const [buyerLoading, setBuyerLoading] = useState<number>(0);
    const [buyerPacking, setBuyerPacking] = useState<number>(0);

    // Initial load
    useEffect(() => {
        if (!profile?.organization_id) return;
        const loadMasterData = async () => {
            const orgId = profile.organization_id;
            const [contactsRes, commRes, setsRes, unitsRes] = await Promise.all([
                supabase.schema('mandi').from("contacts").select("id, name, type, city").eq("organization_id", orgId).order("name"),
                supabase.schema('mandi').from("commodities").select("*").eq("organization_id", orgId).order("name"),
                supabase.schema('mandi').from("settings").select("*").eq("organization_id", orgId).single(),
                supabase.schema('mandi').from("units").select("name").eq("organization_id", orgId),
            ]);

            if (contactsRes.data) {
                setFarmers(contactsRes.data.filter(c => c.type === 'supplier' || c.type === 'both'));
                setBuyers(contactsRes.data.filter(c => c.type === 'customer' || c.type === 'both'));
            }
            if (commRes.data) setCommodities(commRes.data);
            if (setsRes.data) setSettings(setsRes.data);
            if (unitsRes.data?.length) {
                setUnits(Array.from(new Set([...unitsRes.data.map(u => u.name), "Kg", "Box"])));
            }

            // Start with one empty row
            handleAddRow();
        };
        loadMasterData();
    }, [profile]);

    // ─────────────────────────────────────────────────────────────
    // Handlers
    // ─────────────────────────────────────────────────────────────
    const handleAddRow = () => {
        setRows(prev => [
            ...prev,
            {
                id: generateUUID(),
                farmerId: "",
                farmerName: "",
                itemId: "",
                itemName: "",
                variety: "",
                grade: "A",
                qty: 0,
                unit: "Kg",
                rate: 0,
                lessPercent: 0,
                lessUnits: 0,
                loadingCharges: 0,
                otherCharges: 0,
                commissionPercent: settings?.default_commission_percent || 0,
                grossAmount: 0,
                lessAmount: 0,
                netAmount: 0,
                commissionAmount: 0,
                netPayable: 0,
                netQty: 0,
            }
        ]);
    };

    const handleUpdateRow = (index: number, updated: Partial<MandiSessionFarmerRow>) => {
        setRows(prev => {
            const next = [...prev];
            next[index] = { ...next[index], ...updated };
            return next;
        });
    };

    const handleDeleteRow = (index: number) => {
        setRows(prev => prev.filter((_, i) => i !== index));
        if (rows.length === 1) handleAddRow(); // keep at least one
    };

    const handleReset = () => {
        setLotNo("");
        setVehicleNo("");
        setBookNo("");
        setBuyerId(null);
        setSaleRate(0);
        setBuyerLoading(0);
        setBuyerPacking(0);
        setShowBuyer(false);
        setCommittedSessionData(null);
        setRows([{
            id: generateUUID(),
            farmerId: "",
            farmerName: "",
            itemId: "",
            itemName: "",
            variety: "",
            grade: "A",
            qty: 0,
            unit: "Kg",
            rate: 0,
            lessPercent: 0,
            lessUnits: 0,
            loadingCharges: 0,
            otherCharges: 0,
            commissionPercent: settings?.default_commission_percent || 0,
            grossAmount: 0,
            lessAmount: 0,
            netAmount: 0,
            commissionAmount: 0,
            netPayable: 0,
            netQty: 0,
        }]);
    };

    const handleSubmit = async () => {
        if (!profile?.organization_id) return;

        // Validation
        const validFarmers = rows.filter(r => r.farmerId && r.itemId && r.qty > 0 && r.rate > 0);
        if (validFarmers.length === 0) {
            toast({ title: "Validation Error", description: "At least one complete farmer row is required (Farmer, Item, Qty, Rate).", variant: "destructive" });
            return;
        }

        const totalNetQty = validFarmers.reduce((sum, f) => sum + f.netQty, 0);

        if (buyerId && saleRate <= 0) {
            toast({ title: "Validation Error", description: "Sale rate is required when a buyer is selected.", variant: "destructive" });
            return;
        }

        const buyerPayable = buyerId ? (totalNetQty * saleRate) + buyerLoading + buyerPacking : 0;
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
            saleRate,
            buyerPayable,
        };

        const res = await commitSession(input);
        if (res?.sessionId) {
            toast({ title: "Session Committed", description: "Records generated successfully." });
            // Fetch detailed view for the success screen
            const detail = await fetchSessionDetail(res.sessionId);
            setCommittedSessionData(detail);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // Render: View Mode
    // ─────────────────────────────────────────────────────────────
    if (committedSessionData) {
        return <SessionBillsView sessionData={committedSessionData} onNewSession={handleReset} />;
    }

    // ─────────────────────────────────────────────────────────────
    // Render: Edit Mode
    // ─────────────────────────────────────────────────────────────
    const validFarmers = rows.filter(r => r.qty > 0 && r.rate > 0); // For dynamic summary rendering calculations

    // Custom Enter key global capture for Submit if focused on button
    return (
        <div className="max-w-[1400px] mx-auto space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white shadow-sm">
                    <Scale className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Mandi Commission</h1>
                    <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest mt-1">Single-Screen Purchase & Sale</p>
                </div>
            </div>

            {/* HEADER */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-6">
                <div className="flex-1 grid grid-cols-4 gap-4">
                    <div>
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Date</Label>
                        <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="h-10 font-bold bg-slate-50 mt-1" />
                    </div>
                    <div>
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Lot Prefix</Label>
                        <Input placeholder="e.g. LOT-42" value={lotNo} onChange={(e) => setLotNo(e.target.value)} className="h-10 font-bold font-mono tracking-widest uppercase mt-1 focus:ring-2 focus:ring-emerald-500/20" />
                    </div>
                    <div>
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Vehicle No</Label>
                        <Input placeholder="XX-00-YY-0000" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className="h-10 font-bold uppercase mt-1 focus:ring-2 focus:ring-emerald-500/20" />
                    </div>
                    <div>
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Reference / Book No</Label>
                        <Input placeholder="Book-123" value={bookNo} onChange={(e) => setBookNo(e.target.value)} className="h-10 font-bold uppercase mt-1 focus:ring-2 focus:ring-emerald-500/20" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
                {/* LEFT COLLUMN: Grid + Buyer */}
                <div className="space-y-6">
                    {/* FARMER GRID */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm overflow-x-auto custom-scrollbar">
                        <div className="min-w-[1000px]">
                            <FarmerRowHeaders />
                            <div className="space-y-2 mt-2">
                                {rows.map((row, idx) => (
                                    <FarmerRow
                                        key={row.id}
                                        index={idx}
                                        row={row}
                                        farmers={farmers}
                                        items={commodities}
                                        units={units}
                                        defaultCommissionPercent={settings?.default_commission_percent || 5}
                                        canDelete={rows.length > 1}
                                        isLastRow={idx === rows.length - 1}
                                        onUpdate={handleUpdateRow}
                                        onDelete={handleDeleteRow}
                                        onEnterLast={handleAddRow}
                                    />
                                ))}
                            </div>
                            <div className="mt-4 px-3 flex justify-start">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-bold shadow-sm"
                                    onClick={handleAddRow}
                                >
                                    <Plus className="w-4 h-4 mr-1.5" />
                                    Add Farmer Row (Enter on last field)
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* BUYER SECTION */}
                    <div className="bg-white border border-blue-200 rounded-2xl overflow-hidden shadow-sm transition-all group">
                        <button
                            type="button"
                            className="w-full px-5 py-4 flex items-center justify-between bg-blue-50/50 hover:bg-blue-50 transition-colors"
                            onClick={() => setShowBuyer(!showBuyer)}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                                    <Search className="w-4 h-4" />
                                </div>
                                <div className="text-left">
                                    <span className="text-sm font-black uppercase tracking-widest text-blue-900 block leading-none mb-1">Select Buyer (Sale)</span>
                                    <span className="text-[10px] font-bold text-blue-600/70 tracking-wide">Enter buyer details to generate a sale bill natively. Leave closed for pure purchase.</span>
                                </div>
                            </div>
                            {showBuyer ? <ChevronUp className="w-5 h-5 text-blue-400" /> : <ChevronDown className="w-5 h-5 text-blue-400" />}
                        </button>

                        {showBuyer && (
                            <div className="p-5 bg-white border-t border-blue-100 animate-in slide-in-from-top-2">
                                <div className="grid grid-cols-4 gap-5 items-end">
                                    <div className="col-span-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Buyer Account</Label>
                                        <div className="mt-1">
                                            <SearchableSelect
                                                options={buyers.map(b => ({ label: `${b.name}${b.city ? ` (${b.city})` : ""}`, value: b.id }))}
                                                value={buyerId || ""}
                                                onChange={setBuyerId}
                                                placeholder="Search buyer..."
                                                className="h-10 text-sm font-bold border-blue-200 focus:border-blue-500 bg-blue-50/30"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Sale Rate (₹)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            step="any"
                                            placeholder="0.00"
                                            value={saleRate || ""}
                                            onChange={(e) => setSaleRate(parseFloat(e.target.value) || 0)}
                                            className="h-10 text-sm font-bold border-blue-200 focus:border-blue-500 bg-blue-50/30 mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Loading (₹)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            step="any"
                                            placeholder="0"
                                            value={buyerLoading || ""}
                                            onChange={(e) => setBuyerLoading(parseFloat(e.target.value) || 0)}
                                            className="h-10 text-sm font-bold border-blue-200 focus:border-blue-500 bg-blue-50/30 mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Packing/Other (₹)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            step="any"
                                            placeholder="0"
                                            value={buyerPacking || ""}
                                            onChange={(e) => setBuyerPacking(parseFloat(e.target.value) || 0)}
                                            className="h-10 text-sm font-bold border-blue-200 focus:border-blue-500 bg-blue-50/30 mt-1"
                                        />
                                    </div>
                                    {buyerId && (
                                        <div className="col-span-3 flex justify-end">
                                            <Button type="button" variant="ghost" size="sm" onClick={() => { setBuyerId(null); setSaleRate(0); setShowBuyer(false); }} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                                                Remove Buyer
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN: Summary & Submit */}
                <div className="space-y-6">
                    <SummaryPanel
                        farmers={validFarmers}
                        hasBuyer={!!buyerId}
                        buyerName={buyers.find(b => b.id === buyerId)?.name}
                        saleRate={saleRate}
                        buyerLoadingCharges={buyerLoading}
                        buyerPackingCharges={buyerPacking}
                    />

                    <Button
                        className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg uppercase tracking-widest shadow-xl shadow-emerald-500/20"
                        onClick={handleSubmit}
                        disabled={isCommitting}
                    >
                        {isCommitting ? "PROCESSING..." : "SUBMIT SESSION"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
