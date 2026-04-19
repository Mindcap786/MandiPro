"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, TrendingDown, CheckCircle2, Clock, Filter, Receipt, Search, Info, Calendar as CalendarIcon, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, isSameDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PurchaseBillDetailsSheet } from "@/components/purchase/purchase-bill-details";
import { NewPaymentDialog } from "@/components/finance/new-payment-dialog";
import { SupplierInwardsDialog } from "@/components/purchase/supplier-inwards-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRange } from "react-day-picker";
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { calculateArrivalLevelExpenses, calculateLotSettlementAmount, calculateLotGrossValue } from "@/lib/purchase-payables";

const AMOUNT_EPSILON = 0.01;
const DATE_FORMAT = 'yyyy-MM-dd';

export default function PurchaseBillsPage() {
    const { profile } = useAuth();

    // Pre-populate from cache for instant render on re-navigation
    const _orgId = profile?.organization_id;
    const _cached = _orgId ? cacheGet<any>('purchase_bills', _orgId) : null;

    const [bills, setBills] = useState<any[]>(_cached?.bills || []);
    const [groupedSuppliers, setGroupedSuppliers] = useState<any[]>(_cached?.groupedSuppliers || []);
    const [loading, setLoading] = useState(!_cached && !profile);
    const [filter, setFilter] = useState<'all'|'pending'|'partial'|'paid'>('all');
    const [search, setSearch] = useState('');
    const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
    const [selectedBillLocked, setSelectedBillLocked] = useState<boolean>(false);
    const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
    const [paymentInitialValues, setPaymentInitialValues] = useState<{ party_id: string, amount: number, currentBalance?: number, remarks: string, invoice_id?: string, lot_id?: string, arrival_id?: string } | null>(null);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 30),
        to: new Date(),
    });
    const [error, setError] = useState<string | null>(null);

    const datePresets = [
        { label: 'Today', from: startOfDay(new Date()), to: endOfDay(new Date()) },
        { label: 'Last 7 Days', from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) },
        { label: 'Last 30 Days', from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) },
    ];

    const activePreset = dateRange?.from && dateRange?.to
        ? datePresets.find(p => isSameDay(p.from, dateRange.from!) && isSameDay(p.to, dateRange.to!))?.label
        : !dateRange ? 'All Time' : null;

    useEffect(() => {
        if (profile?.organization_id) {
            fetchBills();
        }
    }, [profile?.organization_id, filter, dateRange]);

    const fetchBills = async (isManualRefresh = false) => {
        const orgId = profile?.organization_id;
        if (!orgId) return;

        const cacheKey = `purchase_bills_${dateRange?.from ? format(dateRange.from, 'yyyyMMdd') : 'all'}_${dateRange?.to ? format(dateRange.to, 'yyyyMMdd') : 'all'}`;
        const cached = cacheGet<any>(cacheKey, orgId);

        if (cached && !isManualRefresh) {
            setBills(cached.bills || []);
            setGroupedSuppliers(cached.groupedSuppliers || []);
            setLoading(false);
            
            if (!cacheIsStale(cacheKey, orgId)) {
                return;
            }
            console.log("[PurchaseBills] Cache stale, fetching in background...");
        } else if (!isManualRefresh) {
            setLoading(true);
        }
        setError(null);

        try {
            const orgId = profile?.organization_id;
            const buildLotsQuery = () => {
                const query = supabase
                    .schema('mandi')
                    .from('lots')
                    .select(`
                        *,
                        paid_amount,
                        payment_status,
                        net_payable,
                        farmer:contacts!contact_id(id, name, city),
                        item:commodities(name),
                        arrival:arrivals(arrival_date, reference_no, arrival_type, hire_charges, hamali_expenses, other_expenses, bill_no, contact_bill_no),
                        sale_items(amount, qty, rate)
                    `)
                    .eq('organization_id', orgId)
                    .order('created_at', { ascending: false });

                if (dateRange?.from) {
                    query.gte('created_at', startOfDay(dateRange.from).toISOString());
                }
                if (dateRange?.to) {
                    query.lte('created_at', endOfDay(dateRange.to).toISOString());
                }

                return query;
            };

            const { data, error: fetchError, timedOut } = await fetchWithTimeout(
                buildLotsQuery(),
                12000,
                'purchaseBills.lots',
            );

            if (timedOut) {
                console.warn('[PurchaseBills] lots fetch timed out — keeping cached data visible');
                return;
            }
            if (fetchError) throw fetchError;

            console.log(`[PurchaseBills] Fetched ${data?.length || 0} lots for org ${orgId}`);

            // Collect contact ids so we can fetch subsequent payments in one round-trip.
            const contactIds = Array.from(
                new Set((data || []).map((l: any) => l.contact_id).filter(Boolean))
            );

            // Source of truth for money already paid = the ledger. Query cleared payment
            // vouchers for these suppliers; lots.advance only captures advance-at-arrival,
            // so subsequent PAY-button vouchers must be layered on top here.
            // (A pending cheque leaves cheque_status = 'Pending'; we exclude those.)
            const clearedPaymentsByContact: Record<string, number> = {};
            if (contactIds.length > 0) {
                const { data: paymentVouchers, error: voucherErr } = await supabase
                    .schema('mandi')
                    .from('vouchers')
                    .select('party_id, amount, type, cheque_status, is_cleared')
                    .eq('organization_id', orgId)
                    .eq('type', 'payment')
                    .in('party_id', contactIds);

                if (voucherErr) {
                    console.warn('[PurchaseBills] Payment voucher fetch failed, falling back to lot.advance only:', voucherErr.message);
                } else {
                    (paymentVouchers || []).forEach((v: any) => {
                        const chequePending = v.cheque_status === 'Pending' || v.is_cleared === false;
                        if (chequePending) return;
                        const pid = v.party_id;
                        if (!pid) return;
                        clearedPaymentsByContact[pid] = (clearedPaymentsByContact[pid] || 0) + Number(v.amount || 0);
                    });
                }
            }

            // Per-contact: Aggregate balance using DB payment_status + net_payable.
            // payment_status is now DB-persisted by the FIFO settle_supplier_payment RPC.
            const contactBalances: Record<string, { 
                netAmount: number; advancePaid: number; hasPayment: boolean;
                totalNetPayable: number; totalPaidAmount: number;
            }> = {};

            if (data) {
                data.forEach((lot: any) => {
                    const contactId = lot.contact_id;
                    if (!contactId) return;

                    if (!contactBalances[contactId]) {
                        contactBalances[contactId] = { 
                            netAmount: 0, advancePaid: 0, hasPayment: false,
                            totalNetPayable: 0, totalPaidAmount: 0
                        };
                    }

                    // Use DB-stored net_payable (computed by FIFO migration)
                    // Fall back to JS calculation only if DB value missing (brand-new lot)
                    const dbNetPayable = Number(lot.net_payable || 0);
                    const lotGrossValue = dbNetPayable > AMOUNT_EPSILON 
                        ? dbNetPayable 
                        : calculateLotGrossValue(lot);

                    const advance = Number(lot.advance || 0);
                    const paidAmount = Number(lot.paid_amount || 0);
                    const totalPaid = paidAmount + advance;

                    // Still outstanding after FIFO payments
                    const outstanding = Math.max(0, lotGrossValue - totalPaid);
                    contactBalances[contactId].netAmount += outstanding;
                    contactBalances[contactId].totalNetPayable += lotGrossValue;
                    contactBalances[contactId].totalPaidAmount += totalPaid;

                    if (totalPaid > AMOUNT_EPSILON) {
                        contactBalances[contactId].hasPayment = true;
                    }
                });

                // Also apply any cleared ledger voucher payments not yet FIFO-settled
                Object.keys(contactBalances).forEach(contactId => {
                    const ledgerPaid = clearedPaymentsByContact[contactId] || 0;
                    // Only apply ledger offset if it's more than what FIFO already tracked
                    const alreadyFifo = contactBalances[contactId].totalPaidAmount;
                    const extraLedger = Math.max(0, ledgerPaid - alreadyFifo);
                    if (extraLedger > AMOUNT_EPSILON) {
                        contactBalances[contactId].hasPayment = true;
                        contactBalances[contactId].netAmount = Math.max(
                            0,
                            contactBalances[contactId].netAmount - extraLedger
                        );
                    }
                });
            }

            const groups: Record<string, any> = {};
            (data || []).forEach(lot => {
                const contactId = lot.contact_id;
                if (!groups[contactId]) {
                    groups[contactId] = {
                        id: contactId,
                        name: lot.farmer?.name || 'Unknown Supplier',
                        city: lot.farmer?.city || '',
                        lots: [],
                        totalPurchaseValue: 0,
                        totalPaid: 0,
                        latestDate: lot.created_at
                    };
                }
                
                // Track the latest activity for sorting
                if (new Date(lot.created_at) > new Date(groups[contactId].latestDate)) {
                    groups[contactId].latestDate = lot.created_at;
                }

                groups[contactId].lots.push(lot);

                const arrivalType = lot.arrival?.arrival_type || lot.arrival_type;
                const lotValue = calculateLotSettlementAmount(lot);

                // Track arrival-level expenses per lot (we'll aggregate them later per arrival to avoid double-counting)
                const arrivalId = lot.arrival_id;

                if (arrivalId && (arrivalType === 'commission' || arrivalType === 'commission_supplier')) {
                    if (!groups[contactId].arrivalExpenses) groups[contactId].arrivalExpenses = {};
                    if (!groups[contactId].arrivalExpenses[arrivalId]) {
                        groups[contactId].arrivalExpenses[arrivalId] = {
                            hire_charges: lot.arrival?.hire_charges || 0,
                            hamali_expenses: lot.arrival?.hamali_expenses || 0,
                            other_expenses: lot.arrival?.other_expenses || 0,
                        };
                    }
                }

                // IMPORTANT: We do NOT add lot.advance here because totalPaid is already 
                // fully derived from the actual ledger entries for that contact.
                groups[contactId].totalPurchaseValue += lotValue;
            });

            // Calculate total arrival expenses and subtract from purchase value
            Object.keys(groups).forEach(contactId => {
                let totalArrivalExpenses = 0;
                if (groups[contactId].arrivalExpenses) {
                    Object.values(groups[contactId].arrivalExpenses).forEach((exp: any) => {
                        totalArrivalExpenses += calculateArrivalLevelExpenses(exp);
                    });
                }
                groups[contactId].totalPurchaseValue -= totalArrivalExpenses;
                
                // CORRECT: Balance is now the amount still owed (netAmount already excludes fully paid bills)
                const contactId_key = contactId;
                const balanceData = contactBalances[contactId_key] || { netAmount: 0, advancePaid: 0, hasPayment: false };
                groups[contactId].balance = balanceData.netAmount;
            });

            // Apply "Latest at Top" sorting and status from DB-persisted payment_status
            const sortedSuppliers = Object.values(groups)
                .map(group => {
                    const contactId_key = group.id;
                    const balanceData = contactBalances[contactId_key] || { 
                        netAmount: 0, advancePaid: 0, hasPayment: false,
                        totalNetPayable: 0, totalPaidAmount: 0
                    };
                    const balanceToPay = balanceData.netAmount;

                    // Status derived from DB-persisted payment_status on lots (FIFO-aware)
                    // Roll up: if ANY lot is partial → partial; all paid → paid; else pending
                    const lotStatuses = group.lots.map((l: any) => l.payment_status || 'pending');
                    let status: string;
                    if (Math.abs(balanceToPay) < AMOUNT_EPSILON) {
                        status = 'paid';
                    } else if (lotStatuses.some((s: string) => s === 'paid' || s === 'partial') 
                               || balanceData.hasPayment) {
                        status = 'partial';
                    } else {
                        status = 'pending';
                    }

                    return {
                        ...group,
                        balance: balanceToPay,
                        netAmount: balanceData.netAmount,
                        totalPaid: balanceData.totalPaidAmount,
                        totalNetPayable: balanceData.totalNetPayable,
                        advancePaid: balanceData.advancePaid,
                        calculatedStatus: status
                    };
                })
                .sort((a, b) => {
                    const dateA = new Date(a.latestDate || 0).getTime();
                    const dateB = new Date(b.latestDate || 0).getTime();
                    return dateB - dateA;
                });

            setBills(data || []);
            setGroupedSuppliers(sortedSuppliers);
            
            cacheSet(cacheKey, orgId, {
                bills: data || [],
                groupedSuppliers: sortedSuppliers
            });

        } catch (err: any) {
            console.error("Purchase bills fetch error:", err);
            setError(err.message || "Failed to fetch records. Please check your connection.");
        } finally {
            setLoading(false);
        }
    };

    const markAsPaid = async (lotId: string) => {
        const { error } = await supabase
            .schema('mandi')
            .from('lots')
            .update({ payment_status: 'paid' })
            .eq('id', lotId);

        if (!error) {
            fetchBills();
        }
    };

    const totalPayable = groupedSuppliers.reduce((sum, supplier) => {
        const bal = Number(supplier.balance || 0);
        return sum + (bal > AMOUNT_EPSILON ? bal : 0);
    }, 0);

    const filteredSuppliers = groupedSuppliers
        .filter(supplier => {
            if (filter === 'pending')  return supplier.calculatedStatus === 'pending';
            if (filter === 'partial')  return supplier.calculatedStatus === 'partial';
            if (filter === 'paid')     return supplier.calculatedStatus === 'paid';
            return true;
        })
        .filter(supplier => {
            if (!search) return true;
            const q = search.toLowerCase();
            return supplier.name.toLowerCase().includes(q) || 
                   (supplier.city || '').toLowerCase().includes(q);
        });

    return (
        <div className="min-h-screen bg-[#F8FAFC] text-black p-4 md:p-8 pb-40 space-y-6 md:space-y-8 animate-in fade-in relative overflow-hidden">
            {/* Super Premium Background Ornaments */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-[5%] right-[-10%] w-[500px] h-[500px] bg-indigo-100/30 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[10%] left-[-10%] w-[400px] h-[400px] bg-blue-100/20 rounded-full blur-[100px]"></div>
                <div className="absolute top-[40%] left-[20%] w-[300px] h-[300px] bg-slate-200/20 rounded-full blur-[150px]"></div>
            </div>

            <div className="max-w-7xl mx-auto space-y-8 relative z-10">
                {/* Header - Premium Layout */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end bg-gradient-to-br from-white via-slate-50/50 to-white p-6 md:p-8 rounded-[24px] md:rounded-[40px] border border-slate-200/60 shadow-md relative overflow-hidden">
                    {/* Decorative Blur */}
                    <div className="absolute top-0 right-0 w-80 h-80 bg-blue-100/30 rounded-full blur-3xl -mr-40 -mt-40 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-100/20 rounded-full blur-3xl -ml-32 -mb-32 pointer-events-none"></div>

                    <div className="relative z-10">
                        {error && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-600 animate-in slide-in-from-top-2">
                                <Info className="w-5 h-5 flex-shrink-0" />
                                <div className="text-sm font-bold">{error}</div>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => fetchBills(true)}
                                    className="ml-auto h-8 px-3 text-xs font-black uppercase tracking-widest hover:bg-red-100"
                                >
                                    Retry
                                </Button>
                            </div>
                        )}
                        <h1 className="text-3xl md:text-5xl font-[1000] italic tracking-tighter mb-2 uppercase text-slate-900 leading-none">
                            Purchase <span className="text-blue-600 drop-shadow-[0_2px_10px_rgba(37,99,235,0.1)]">Settlements</span>
                        </h1>
                        <div className="flex items-center gap-2">
                            <div className="h-1 w-8 md:w-12 bg-blue-600 rounded-full"></div>
                            <p className="text-slate-500 font-bold tracking-tight text-sm md:text-lg italic">Financial ledger and payouts for farmers, suppliers, and direct purchase inventory.</p>
                        </div>
                    </div>

                    <div className="text-left md:text-right relative z-10 mt-6 md:mt-0 bg-white/40 backdrop-blur-sm p-4 rounded-3xl border border-white/50 shadow-sm w-full md:w-auto">
                        <div className="text-[10px] text-slate-400 uppercase tracking-[0.3em] font-black mb-1">Total Outstanding Liability</div>
                        <div className="text-3xl md:text-5xl font-mono font-black text-slate-900 tracking-tighter flex items-baseline justify-start md:justify-end gap-1">
                            <span className="text-2xl text-blue-500/50 font-sans">₹</span>
                            {totalPayable.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="sticky top-4 z-30 bg-white/90 backdrop-blur-xl border border-slate-200 p-2 rounded-2xl shadow-xl flex flex-col md:flex-row gap-2 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <Input
                            placeholder="Search Supplier, Ref #, or Location..."
                            className="pl-12 bg-white border-slate-200 text-black h-12 rounded-xl focus:ring-0 focus:border-blue-500 text-lg font-black transition-all shadow-sm placeholder:text-slate-400"
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-wrap md:flex-nowrap gap-2 items-center w-full">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "h-12 flex-1 md:w-[240px] md:flex-none justify-start text-left font-black bg-white border-slate-200 text-black hover:bg-slate-50 hover:border-slate-300 px-4 rounded-xl shadow-sm",
                                        !dateRange && "text-slate-400"
                                    )}
                                >
                                    <CalendarIcon className="mr-3 h-5 w-5 shrink-0 text-slate-400" />
                                    {activePreset ? (
                                        <span className="text-sm font-black tracking-widest uppercase text-black truncate">{activePreset}</span>
                                    ) : dateRange?.from ? (
                                        <div className="flex items-center gap-1 md:gap-2 overflow-hidden">
                                            <div className="px-1 md:px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[9px] md:text-[10px] font-mono font-bold text-slate-700 uppercase truncate">
                                                {format(dateRange.from, "dd MMM yyyy")}
                                            </div>
                                            {dateRange.to && (
                                                <>
                                                    <ArrowRight className="w-3 h-3 shrink-0 text-slate-400" />
                                                    <div className="px-1 md:px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[9px] md:text-[10px] font-mono font-bold text-slate-700 uppercase truncate">
                                                        {format(dateRange.to, "dd MMM yyyy")}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-sm font-bold tracking-tight text-slate-400">All Time</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[90vw] max-w-[400px] md:w-auto p-0 bg-white border-slate-200 text-black shadow-2xl rounded-2xl overflow-hidden mr-4 md:mr-0" align="end">
                                <div className="flex border-b border-slate-100 bg-slate-50 overflow-x-auto no-scrollbar">
                                    <button
                                        onClick={() => setDateRange(undefined)}
                                        className={cn(
                                            "flex-1 px-3 md:px-4 py-3 md:py-4 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
                                            !dateRange
                                                ? "text-blue-600 border-blue-600 bg-blue-50"
                                                : "text-slate-400 border-transparent hover:text-black hover:bg-slate-100"
                                        )}
                                    >
                                        All Time
                                    </button>
                                    {datePresets.map((preset) => (
                                        <button
                                            key={preset.label}
                                            onClick={() => setDateRange({
                                                from: preset.from,
                                                to: preset.to
                                            })}
                                            className={cn(
                                                "flex-1 px-3 md:px-4 py-3 md:py-4 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
                                                activePreset === preset.label
                                                    ? "text-blue-600 border-blue-600 bg-blue-50"
                                                    : "text-slate-400 border-transparent hover:text-black hover:bg-slate-100"
                                            )}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex justify-center p-2 md:p-4">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange?.from}
                                        selected={dateRange}
                                        onSelect={setDateRange}
                                        numberOfMonths={2}
                                        className="bg-white text-black"
                                    />
                                </div>
                            </PopoverContent>
                        </Popover>

                        {dateRange && (
                            <Button
                                variant="ghost"
                                onClick={() => setDateRange(undefined)}
                                className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 text-slate-400 hover:text-black hover:bg-slate-100"
                            >
                                <X className="w-5 h-5" />
                            </Button>
                        )}

                        <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block" />

                        <div className="flex flex-1 md:flex-none gap-1 overflow-x-auto hide-scrollbar snap-x w-full">
                            {(['all', 'pending', 'partial', 'paid'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={cn(
                                        'h-12 flex-1 md:flex-none snap-center px-4 md:px-6 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border transition-all',
                                        filter === f 
                                            ? f === 'partial' ? 'bg-amber-500 text-white border-amber-500 shadow-lg'
                                              : f === 'paid'    ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg'
                                              : f === 'pending' ? 'bg-rose-600 text-white border-rose-600 shadow-lg'
                                              : 'bg-black text-white border-black shadow-lg'
                                            : 'bg-white border-slate-200 text-slate-500 hover:text-black hover:border-slate-300'
                                    )}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /></div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredSuppliers.length === 0 && (
                            <div className="text-center py-20 text-slate-400 font-bold bg-white rounded-2xl border border-dashed border-slate-200 uppercase tracking-widest text-xs">No records found.</div>
                        )}
                        {filteredSuppliers
                            .map((supplier) => {
                                const ledgerBal = supplier.balance;
                                const inwardCount = new Set(supplier.lots.map((l: any) => l.arrival_id).filter(Boolean)).size;
                                const arrivalTypes = Array.from(new Set(supplier.lots.map((l: any) => l.arrival?.arrival_type || l.arrival_type || 'direct')));

                                return (
                                    <div key={supplier.id} className="bg-white/70 backdrop-blur-sm border border-slate-200 p-4 md:p-6 rounded-[20px] md:rounded-[28px] hover:border-blue-400/40 hover:shadow-2xl hover:shadow-blue-500/5 transition-all group relative overflow-hidden">
                                        {/* Hover Glow */}
                                        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-50 rounded-full blur-3xl -mr-24 -mt-24 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>

                                        {/* Top row: Icon + Info */}
                                        <div className="flex items-start gap-4 relative z-10">
                                            <div className={`w-10 h-10 md:w-12 md:h-12 flex-shrink-0 rounded-full flex items-center justify-center border ${
                                                supplier.calculatedStatus === 'paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                supplier.calculatedStatus === 'partial' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                                                'bg-red-50 text-red-600 border-red-100'
                                            }`}>
                                                {supplier.calculatedStatus === 'paid' ? <CheckCircle2 className="w-5 h-5" /> : 
                                                 supplier.calculatedStatus === 'partial' ? <Clock className="w-5 h-5 text-amber-500" /> : 
                                                 <Clock className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                {/* Name */}
                                                <div className="text-base md:text-xl font-black text-black truncate">{supplier.name}</div>
                                                {/* City */}
                                                <div className="text-xs text-slate-400 font-bold flex items-center gap-1 mt-0.5">
                                                    <Receipt className="w-3 h-3 flex-shrink-0" />
                                                    <span className="truncate">{supplier.city || 'Location not set'}</span>
                                                </div>
                                                {/* Badges - wrap on mobile */}
                                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                                    <span className="text-[9px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-widest whitespace-nowrap">
                                                        {inwardCount} {inwardCount === 1 ? 'Inward' : 'Inwards'}
                                                    </span>
                                                    {arrivalTypes.map((type: any) => (
                                                        <span key={type} className={cn(
                                                            "text-[9px] px-2 py-0.5 rounded-full font-bold tracking-[0.1em] uppercase border shadow-sm whitespace-nowrap",
                                                            type === 'direct' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                (type === 'commission' || type === 'farmer') ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                                    (type === 'commission_supplier' || type === 'supplier') ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                        'bg-slate-50 text-slate-700 border-slate-200'
                                                        )}>
                                                            {type === 'direct' ? 'Direct' : (type === 'commission' || type === 'farmer') ? 'Farmer Comm' : (type === 'commission_supplier' || type === 'supplier') ? 'Supplier Comm' : String(type).replace('_', ' ')}
                                                        </span>
                                                    ))}
                                                </div>
                                                {/* Balance + Progress Bar */}
                                                <div className={`text-sm font-mono font-black mt-2 ${ledgerBal > AMOUNT_EPSILON ? 'text-rose-600' : ledgerBal < -AMOUNT_EPSILON ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                    Balance: ₹ {Math.abs(ledgerBal).toLocaleString()} {ledgerBal > AMOUNT_EPSILON ? 'To Pay' : ledgerBal < -AMOUNT_EPSILON ? 'Advance' : 'Settled'}
                                                </div>
                                                {supplier.totalNetPayable > AMOUNT_EPSILON && (
                                                    <div className="mt-2">
                                                        <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                                            <span>Paid ₹{Math.round(supplier.totalPaid || 0).toLocaleString()}</span>
                                                            <span>Total ₹{Math.round(supplier.totalNetPayable).toLocaleString()}</span>
                                                        </div>
                                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div 
                                                                className={cn(
                                                                    'h-full rounded-full transition-all duration-700',
                                                                    supplier.calculatedStatus === 'paid'    ? 'bg-emerald-500' :
                                                                    supplier.calculatedStatus === 'partial' ? 'bg-amber-400' : 'bg-rose-300'
                                                                )}
                                                                style={{ width: `${Math.min(100, Math.round(((supplier.totalPaid || 0) / supplier.totalNetPayable) * 100))}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons - full width on mobile, row on desktop */}
                                        <div className="flex items-center gap-2 mt-4 relative z-10">
                                            <Button
                                                variant="outline"
                                                onClick={() => setSelectedSupplier(supplier)}
                                                className="flex-1 border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-black font-bold h-10 px-4 shadow-sm rounded-xl text-sm"
                                            >
                                                Manage Inwards
                                            </Button>

                                            {ledgerBal > 0 && (
                                                <Button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPaymentInitialValues({
                                                            party_id: supplier.id,
                                                            amount: Math.abs(ledgerBal),
                                                            currentBalance: Math.abs(ledgerBal),
                                                            remarks: `Settlement for inwards`
                                                        });
                                                    }}
                                                    className="flex-1 bg-black text-white font-black hover:bg-slate-800 h-10 px-4 shadow-lg rounded-xl transition-all active:scale-95 text-sm"
                                                >
                                                    Pay Balance
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                    </div>
                )}
            </div>

            <PurchaseBillDetailsSheet
                lotId={selectedBillId}
                isOpen={!!selectedBillId}
                isLocked={selectedBillLocked}
                onClose={() => {
                    setSelectedBillId(null);
                    setSelectedBillLocked(false);
                }}
                onUpdate={fetchBills}
            />

            <SupplierInwardsDialog
                supplier={selectedSupplier ? groupedSuppliers.find(s => s.id === selectedSupplier.id) || selectedSupplier : null}
                isOpen={!!selectedSupplier}
                onClose={() => setSelectedSupplier(null)}
                onEditLot={(lotId, isLocked) => {
                    setSelectedBillId(lotId);
                    setSelectedBillLocked(!!isLocked);
                }}
                onPay={(partyId, amount, lotCode, arrivalId) => {
                    setPaymentInitialValues({
                        party_id: partyId,
                        amount: amount,
                        currentBalance: Math.abs(groupedSuppliers.find(g => g.id === partyId)?.balance || 0),
                        remarks: `Payment for Inward #${lotCode}`,
                        arrival_id: arrivalId
                    });
                }}
            />

            <NewPaymentDialog
                defaultOpen={!!paymentInitialValues}
                onOpenChange={(open) => {
                    if (!open) setPaymentInitialValues(null);
                }}
                initialValues={paymentInitialValues || undefined}
                onSuccess={() => {
                    setPaymentInitialValues(null);
                    fetchBills();
                }}
            />
        </div>
    );
}
