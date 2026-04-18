"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Info, Edit, CreditCard, ChevronDown, ChevronRight, ShieldCheck, Box, X, Calendar as CalendarIcon, Search, Filter } from "lucide-react";
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRange } from "react-day-picker";
import { calculateArrivalSettlementAmount, calculateLotSettlementAmount, calculateLotGrossValue, calculateArrivalGrossValue } from "@/lib/purchase-payables";

const AMOUNT_EPSILON = 0.01;

interface SupplierInwardsDialogProps {
    supplier: {
        id: string;
        name: string;
        balance: number;
        lots: any[];
    } | null;
    isOpen: boolean;
    onClose: () => void;
    onEditLot: (lotId: string, isLocked?: boolean) => void;
    onPay: (partyId: string, amount: number, lotCode: string, arrivalId: string) => void;
}

export function SupplierInwardsDialog({ supplier, isOpen, onClose, onEditLot, onPay }: SupplierInwardsDialogProps) {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [inwardSearch, setInwardSearch] = useState("");
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 30),
        to: new Date(),
    });

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const filteredAndGroupedInvoices = useMemo(() => {
        if (!supplier) return [];
        const grouped: Record<string, any> = {};

        supplier.lots.forEach(lot => {
            const arrivalDate = new Date(lot.arrival?.arrival_date || lot.created_at);
            if (isNaN(arrivalDate.getTime())) return;

            // Apply Date Filter
            if (dateRange?.from && dateRange?.to) {
                if (!isWithinInterval(arrivalDate, {
                    start: startOfDay(dateRange.from),
                    end: endOfDay(dateRange.to)
                })) {
                    return;
                }
            } else if (dateRange?.from) {
                if (arrivalDate < startOfDay(dateRange.from)) return;
            }

            const type = lot.arrival?.arrival_type || 'direct';
            const key = lot.arrival?.contact_bill_no || lot.arrival?.reference_no || lot.arrival?.bill_no || lot.arrival_id || 'misc';
            if (!grouped[key]) {
                grouped[key] = {
                    key,
                    bill_no: lot.arrival?.contact_bill_no || lot.arrival?.bill_no || lot.arrival?.reference_no,
                    lot_code: lot.lot_code,
                    arrival_id: lot.arrival_id,
                    date: arrivalDate,
                    type: type,
                    items: [],
                    totalAmount: 0,
                    totalQty: 0,
                    isFullySold: true,
                    hire_charges: lot.arrival?.hire_charges || 0,
                    hamali_expenses: lot.arrival?.hamali_expenses || 0,
                    other_expenses: lot.arrival?.other_expenses || 0,
                    totalLotAdvance: 0, 
                    arrivalAdvances: {} as Record<string, number>, 
                };
            }
            const itemTotal = calculateLotGrossValue(lot);

            const isLotSold = (lot.current_qty !== undefined && lot.current_qty <= 0);
            if (!isLotSold) grouped[key].isFullySold = false;

            grouped[key].items.push(lot);
            grouped[key].totalAmount += itemTotal;
            grouped[key].totalQty += (lot.initial_qty || 0);
            grouped[key].totalLotAdvance += Number(lot.advance || 0);
            
            // Track unique arrival advances within the group
            if (lot.arrival_id && lot.arrival?.advance_amount) {
                grouped[key].arrivalAdvances[lot.arrival_id] = Number(lot.arrival.advance_amount);
            }
        });

        const finalGroups = Object.values(grouped).map((group: any) => {
            const groupGross = calculateArrivalGrossValue(group.items, group);
            return {
                ...group,
                totalAmount: groupGross,
                totalGrossAmount: groupGross
            };
        }).filter(group => {
            if (!inwardSearch) return true;
            const q = inwardSearch.toLowerCase();
            const matchesBill = group.bill_no?.toLowerCase().includes(q) || group.lot_code?.toLowerCase().includes(q);
            const matchesProduct = group.items.some((item: any) => item.item?.name?.toLowerCase().includes(q));
            return matchesBill || matchesProduct;
        });

        // FIX: Calculate status PER BILL, not using aggregated supplier balance
        // Each bill's balance = bill total - bill's advance payments
        finalGroups.forEach((group: any) => {
            const totalAmount = Number(group.totalAmount || 0);
            
            // Sum of unique arrival advances + all lot-level advances
            const totalArrivalAdvance = Object.values(group.arrivalAdvances || {}).reduce((sum: number, val: any) => sum + Number(val), 0);
            const totalAdvance = Number(group.totalLotAdvance || 0) + totalArrivalAdvance;
            
            // Balance to pay = total amount - what's already paid via advance
            const balanceToPay = totalAmount - totalAdvance;

            // Log for debugging if needed
            if (balanceToPay > AMOUNT_EPSILON) {
                console.log(`Bill ${group.bill_no} has balance: ${balanceToPay} (Total: ${totalAmount}, Paid: ${totalAdvance})`);
            }

            if (Math.abs(balanceToPay) < AMOUNT_EPSILON) {
                // Balance essentially zero -> PAID
                group.paymentStatus = 'paid';
                group.pendingAmount = 0;
            } else if (balanceToPay > AMOUNT_EPSILON && totalAdvance > AMOUNT_EPSILON) {
                // Some balance remains AND some advance was paid -> PARTIAL
                group.paymentStatus = 'partial';
                group.pendingAmount = balanceToPay;
            } else if (balanceToPay > AMOUNT_EPSILON && totalAdvance <= AMOUNT_EPSILON) {
                // Full balance remains AND no advance paid -> PENDING
                group.paymentStatus = 'pending';
                group.pendingAmount = balanceToPay;
            } else if (balanceToPay < -AMOUNT_EPSILON) {
                // Overpaid (negative balance) -> treat as PAID with credit
                group.paymentStatus = 'paid';
                group.pendingAmount = 0;
            } else {
                group.paymentStatus = 'paid';
                group.pendingAmount = 0;
            }
        });

        // Return for display in LIFO order (Newest first)
        return [...finalGroups].sort((a: any, b: any) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            if (dateA !== dateB) return dateB - dateA;
            return String(b.key).localeCompare(String(a.key));
        });
    }, [supplier, dateRange, inwardSearch]);

    if (!supplier) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[1200px] w-[95vw] h-[85vh] bg-white border-slate-200 text-black p-0 shadow-2xl overflow-hidden flex flex-col rounded-2xl">
                <DialogHeader className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 relative shrink-0">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-xl font-black italic tracking-tighter text-black uppercase flex items-center gap-2">
                                <span className="text-blue-600">INWARD</span> RECORDS
                            </DialogTitle>
 
                            <div className="flex-1 flex items-center justify-end gap-3">
                                <div className="relative group/search shrink-0">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 group-focus-within/search:text-blue-500 transition-colors" />
                                    <input
                                        type="text"
                                        placeholder="Find Bill #"
                                        value={inwardSearch}
                                        onChange={(e) => setInwardSearch(e.target.value)}
                                        className="h-7 pl-8 pr-3 w-[140px] bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                                    />
                                </div>
                                <div className="h-7 w-px bg-slate-100 hidden sm:block"></div>
                                <div className="flex items-center gap-1.5 shrink-0 scale-90 origin-right">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className="h-7 min-w-[120px] justify-start text-[10px] font-bold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 px-3 rounded-full shadow-sm"
                                            >
                                                <CalendarIcon className="mr-2 h-3 w-3 text-slate-400" />
                                                {dateRange?.from ? (
                                                    <span className="flex items-center gap-1">
                                                        {format(dateRange.from, "dd MMM")} 
                                                        {dateRange.to && (
                                                            <>
                                                                <span className="opacity-30">→</span>
                                                                {format(dateRange.to, "dd MMM")}
                                                            </>
                                                        )}
                                                    </span>
                                                ) : "Date Range"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 z-[200] bg-white border-slate-200" align="end">
                                            <Calendar
                                                initialFocus
                                                mode="range"
                                                defaultMonth={dateRange?.from}
                                                selected={dateRange}
                                                onSelect={setDateRange}
                                                numberOfMonths={2}
                                                className="bg-white p-3"
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    {dateRange && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setDateRange(undefined)}
                                            className="h-7 w-7 rounded-full border border-slate-100 text-slate-400 hover:text-black p-0"
                                        >
                                            <X className="w-3 h-3" />
                                        </Button>
                                    )}
                                </div>
                                <div className={cn(
                                    "h-7 px-3 rounded-full border flex items-center gap-2 shadow-sm transition-all bg-white shrink-0",
                                    supplier.balance > 0 ? "border-rose-100 bg-rose-50/30" : supplier.balance < 0 ? "border-emerald-100 bg-emerald-50/30" : "border-slate-200 bg-slate-50"
                                )}>
                                    <span className={cn(
                                        "text-[8px] font-black uppercase tracking-widest",
                                        supplier.balance > 0 ? "text-rose-600" : supplier.balance < 0 ? "text-emerald-600" : "text-slate-500"
                                    )}>
                                        {supplier.balance > 0 ? 'To Pay:' : supplier.balance < 0 ? 'Advance:' : 'Settled:'}
                                    </span>
                                    <span className={cn(
                                        "text-[10px] font-black font-mono",
                                        supplier.balance > 0 ? "text-rose-700" : supplier.balance < 0 ? "text-emerald-700" : "text-slate-600"
                                    )}>
                                        ₹{Math.abs(Math.round(supplier.balance)).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto bg-slate-50/20 p-6 min-h-0">
                    {(() => {
                        const groups = filteredAndGroupedInvoices;

                        if (groups.length === 0) {
                            return (
                                <div className="flex flex-col items-center justify-center py-32 text-slate-400">
                                    <Info className="w-20 h-20 mb-8 opacity-10" />
                                    <div className="text-base font-black uppercase tracking-[0.4em] opacity-40">No records found for this supplier</div>
                                </div>
                            );
                        }

                        return (
                            <div className="space-y-3 max-w-[1200px] mx-auto">
                                {groups.map((group: any) => {
                                    const isExpanded = expandedGroups[group.key];
                                    const groupBalanceToPay = group.paymentStatus === 'paid' ? 0 : Math.max(group.pendingAmount || 0, 0);

                                    return (
                                        <div key={group.key} className={cn(
                                            "bg-white rounded-2xl border transition-all duration-300",
                                            isExpanded ? "border-blue-200 shadow-md" : "border-slate-200 shadow-sm hover:border-blue-300"
                                        )}>
                                            <div
                                                onClick={() => toggleGroup(group.key)}
                                                className="p-4 flex items-center justify-between cursor-pointer group/header select-none"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[10px] tracking-tighter border shadow-inner ${
                                                        group.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                        group.paymentStatus === 'partial' ? 'bg-orange-50 text-orange-600 border-orange-100' : 
                                                        'bg-rose-50 text-rose-600 border-rose-100'
                                                    }`}>
                                                        {group.bill_no ? `#${group.bill_no}` : (group.lot_code ? `#${group.lot_code.slice(-3)}` : '#-')}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-black text-slate-900">
                                                                ₹{Math.round(group.paymentStatus === 'paid' ? (group.totalGrossAmount || 0) : groupBalanceToPay).toLocaleString()}
                                                            </span>
                                                            <Badge variant="outline" className={cn(
                                                                "text-[8px] font-black px-1.5 py-0 uppercase tracking-widest border border-slate-200",
                                                                group.paymentStatus === 'paid' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                                group.paymentStatus === 'partial' ? "bg-orange-50 text-orange-700 border-orange-200" :
                                                                "bg-blue-50 text-blue-700 border-blue-200"
                                                            )}>
                                                                {group.paymentStatus === 'paid' ? 'Paid' : group.paymentStatus === 'partial' ? 'To Pay' : 'To Pay'}
                                                            </Badge>
                                                        </div>
                                                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-1.5">
                                                            {format(new Date(group.date), "EEEE, d MMM")}
                                                            <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                                                            {group.items.length} {group.items.length === 1 ? 'Product' : 'Products'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {group.paymentStatus !== 'paid' && (
                                                        <div className="text-right px-3 py-1.5 rounded-xl bg-amber-50/50 border border-amber-100 flex flex-col items-end">
                                                            <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 opacity-60">Bill Total</span>
                                                            <span className="text-xs font-black text-amber-600">₹{Math.round(Math.max(group.totalGrossAmount || 0, 0)).toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col items-end gap-1">
                                                        <Badge variant="outline" className={cn(
                                                            "text-[9px] font-black px-2 py-0.5 uppercase tracking-[0.1em]",
                                                            group.type === 'direct' ? "bg-blue-50 text-blue-700 border-blue-200" :
                                                            (group.type === 'commission' || group.type === 'farmer') ? "bg-purple-50 text-purple-700 border-purple-200" :
                                                            "bg-amber-50 text-amber-700 border-amber-200"
                                                        )}>
                                                            {group.type === 'direct' ? 'Direct' : (group.type === 'commission' || group.type === 'farmer') ? 'Farmer Comm' : 'Supplier Comm'}
                                                        </Badge>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="w-8 h-8 rounded-full border border-slate-100 p-0 text-slate-400 hover:bg-slate-50 transition-all"
                                                    >
                                                        <ChevronDown className={cn("w-4 h-4 transition-transform duration-500", isExpanded && "rotate-180")} />
                                                    </Button>
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.3 }}
                                                    >
                                                        <div className="px-4 pb-4 pt-1 space-y-2">
                                                            {group.paymentStatus !== 'paid' && (
                                                                <div className="flex justify-end">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:bg-blue-50 rounded-lg h-7 px-3 border border-blue-100/20"
                                                                        onClick={() => onPay(supplier.id, Math.round(group.pendingAmount > 0 ? group.pendingAmount : group.totalAmount), group.bill_no || group.lot_code, group.arrival_id)}
                                                                    >
                                                                        Settlement
                                                                    </Button>
                                                                </div>
                                                            )}
                                                            {group.items.map((lot: any) => {
                                                                const qty = lot.initial_qty || 0;
                                                                const lotTotal = calculateLotGrossValue(lot);

                                                                const isSold = (lot.current_qty !== undefined && lot.current_qty <= 0);
                                                                const isFullyPaid = group.paymentStatus === 'paid';
                                                                const isLocked = isSold && isFullyPaid;
                                                                return (
                                                                    <div key={lot.id} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-slate-100 group/item hover:border-blue-200 transition-all shadow-sm">
                                                                        <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                                                                            <Box className="w-4 h-4 text-slate-400 group-hover/item:text-blue-500 transition-colors" />
                                                                        </div>
                                                                        <div className="flex-1 grid grid-cols-4 items-center gap-3">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Product</span>
                                                                                <span className="text-[10px] font-black text-slate-900 group-hover/item:text-blue-600 transition-colors truncate">{lot.item?.name || 'Unknown'}</span>
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Quantity</span>
                                                                                <span className="text-[10px] font-bold text-slate-700">{qty} {lot.unit === 'box' ? 'BOX' : 'PCS'}</span>
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Net Rate</span>
                                                                                <span className="text-[10px] font-bold text-slate-700">₹{lot.supplier_rate || 0}</span>
                                                                            </div>
                                                                            <div className="flex flex-col text-right pr-2">
                                                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Amount</span>
                                                                                <span className={cn(
                                                                                    "text-xs font-[1000] tracking-tighter",
                                                                                    lotTotal >= 0 ? "text-emerald-600" : "text-rose-600"
                                                                                )}>
                                                                                    ₹{Math.round(lotTotal).toLocaleString()}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 pl-3 border-l border-slate-50">
                                                                            <Button
                                                                                size="sm"
                                                                                onClick={() => onEditLot(lot.id, isLocked)}
                                                                                className={cn(
                                                                                    "h-7 px-3 rounded-lg transition-all text-[9px] font-black uppercase tracking-tighter",
                                                                                    isLocked ? "bg-slate-100 text-slate-400" : "bg-slate-900 text-white hover:bg-blue-600"
                                                                                )}
                                                                            >
                                                                                {isLocked ? 'View' : 'Edit'}
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>

                <div className="p-4 border-t border-slate-100 bg-white flex justify-center">
                    <Button
                        onClick={onClose}
                        className="w-full max-w-[240px] h-10 bg-slate-50 text-slate-950 hover:bg-slate-100 border border-slate-200 font-black uppercase tracking-widest shadow-sm rounded-xl transition-all text-[10px]"
                    >
                        Return To Viewer
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
