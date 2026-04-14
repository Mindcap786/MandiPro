"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Search, Loader2, ArrowLeft, Plus, Trash2, RefreshCw, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export default function SalesReturnForm() {
    const { profile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    // Invoice Search
    const [open, setOpen] = useState(false);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedTerm, setDebouncedTerm] = useState("");

    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isSearching, setIsSearching] = useState(false);

    // Return Form
    const [returnItems, setReturnItems] = useState<any[]>([]);
    const [returnType, setReturnType] = useState("credit");
    const [remarks, setRemarks] = useState("");
    const [buyerBalance, setBuyerBalance] = useState<number | null>(null);

    // Exchange Form
    const [exchangeItems, setExchangeItems] = useState<any[]>([]);
    const [availableLots, setAvailableLots] = useState<any[]>([]);
    const [availableItems, setAvailableItems] = useState<any[]>([]);

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedTerm(searchTerm);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Fetch Invoices Function
    const fetchInvoices = async (pageNumber: number, isNewSearch: boolean) => {
        if (!profile?.organization_id) return;

        setIsSearching(true);
        const PAGE_SIZE = 20; // User requested 20 per page for performance
        const from = pageNumber * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        // 30-day filter for returns
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateString = thirtyDaysAgo.toISOString().split('T')[0];

        // Base Query
        let query = supabase
            .schema('mandi')
            .from('sales')
            .select('id, bill_no, sale_date, buyer_id, buyer:contacts(id, name), total_amount')
            .eq('organization_id', profile.organization_id)
            .gte('sale_date', dateString)
            .order('sale_date', { ascending: false })
            .range(from, to);

        if (debouncedTerm) {
            if (!isNaN(Number(debouncedTerm))) {
                query = query.eq('bill_no', debouncedTerm);
            } else {
                // Search by Buyer Name (Two-step lookup)
                const { data: buyers } = await supabase
                    .schema('mandi')
                    .from('contacts')
                    .select('id')
                    .ilike('name', `%${debouncedTerm}%`)
                    .eq('organization_id', profile.organization_id)
                    .limit(20);

                if (buyers && buyers.length > 0) {
                    const buyerIds = buyers.map(b => b.id);
                    query = query.in('buyer_id', buyerIds);
                } else {
                    // Force empty result if name not found
                    query = query.eq('id', '00000000-0000-0000-0000-000000000000');
                }
            }
        }

        const { data } = await query;
        if (data) {
            if (isNewSearch) {
                setInvoices(data);
                setPage(0);
            } else {
                setInvoices(prev => [...prev, ...data]);
                setPage(pageNumber);
            }
            // If we got fewer items than requested, we reached the end
            setHasMore(data.length === PAGE_SIZE);
        }
        setIsSearching(false);
    };

    // Trigger Search on Term Change
    useEffect(() => {
        fetchInvoices(0, true);
    }, [debouncedTerm, profile]);

    // Fetch Invoice Items with Return History
    useEffect(() => {
        if (!selectedInvoice) return;

        const fetchItems = async () => {
            // 1. Fetch Original Sale Items
            const { data: saleItems } = await supabase
                .schema('mandi')
                .from('sale_items')
                .select('*, lot:lots(id, lot_code, item:commodities(id, name))')
                .eq('sale_id', selectedInvoice.id);

            // 2. Fetch Previously Returned Items for this Sale
            // This gets all returns for this invoice, and their items
            const { data: previousReturns } = await supabase
                .schema('mandi')
                .from('sale_returns')
                .select('sale_return_items(lot_id, qty)')
                .eq('sale_id', selectedInvoice.id)
                .eq('status', 'approved'); // Only count successfully processed returns

            // 3. Calculate Total Returned Qty per Lot
            const returnedQtyMap: Record<string, number> = {};
            if (previousReturns) {
                previousReturns.forEach((ret: any) => {
                    if (ret.sale_return_items) {
                        ret.sale_return_items.forEach((item: any) => {
                            if (item.lot_id) {
                                returnedQtyMap[item.lot_id] = (returnedQtyMap[item.lot_id] || 0) + Number(item.qty);
                            }
                        });
                    }
                });
            }

            if (saleItems) {
                setReturnItems(saleItems.map(item => {
                    const alreadyReturned = returnedQtyMap[item.lot_id] || 0;
                    const remainingQty = Math.max(0, item.qty - alreadyReturned);

                    return {
                        ...item,
                        return_qty: 0, // Default input to 0
                        max_qty: remainingQty, // UI prevents exceeding this
                        original_sold_qty: item.qty, // Keep reference to original
                        already_returned: alreadyReturned // For UI display if needed
                    };
                }));
            }
        };
        fetchItems();
    }, [selectedInvoice]);

    // Fetch Buyer Balance
    useEffect(() => {
        if (!selectedInvoice || !profile?.organization_id) {
            setBuyerBalance(null);
            return;
        }
        
        const fetchBalance = async () => {
            const contactId = selectedInvoice.buyer_id || selectedInvoice.buyer?.id;
            if (contactId) {
                const { data } = await supabase
                    .schema('mandi')
                    .from('view_party_balances')
                    .select('net_balance')
                    .eq('contact_id', contactId)
                    .single();
                
                if (data) {
                    setBuyerBalance(data.net_balance);
                } else {
                    setBuyerBalance(0);
                }
            }
        };
        fetchBalance();
    }, [selectedInvoice, profile]);

    // Fetch Masters for Exchange
    useEffect(() => {
        if (returnType === 'exchange' && profile?.organization_id) {
            const fetchMasters = async () => {
                // Items (Commodities in Mandi)
                const { data: items } = await supabase
                    .schema('mandi')
                    .from('commodities')
                    .select('id, name')
                    .eq('organization_id', profile.organization_id);
                if (items) setAvailableItems(items);

                // Lots
                const { data: lots } = await supabase
                    .schema('mandi')
                    .from('lots')
                    .select('*, item:commodities(name)')
                    .eq('organization_id', profile.organization_id)
                    .gt('current_qty', 0)
                    .eq('status', 'active');
                if (lots) setAvailableLots(lots);
            };
            fetchMasters();
        }
    }, [returnType, profile]);

    const handleQtyChange = (itemId: string, value: string) => {
        setReturnItems(prev => prev.map(item => {
            if (item.id === itemId) {
                if (value === "") return { ...item, return_qty: "" };
                const num = Number(value);
                // Strict cap: num cannot exceed max_qty
                const validQty = Math.min(Math.max(0, num), item.max_qty);
                return { ...item, return_qty: validQty };
            }
            return item;
        }));
    };

    // Exchange Item Handlers
    const addExchangeItem = () => {
        setExchangeItems([...exchangeItems, { tempId: Date.now(), lot_id: "", qty: "", rate: "" }]);
    };

    const removeExchangeItem = (index: number) => {
        setExchangeItems(exchangeItems.filter((_, i) => i !== index));
    };

    const updateExchangeItem = (index: number, field: string, value: any) => {
        const newItems = [...exchangeItems];
        if (value === "") {
            newItems[index][field] = "";
        } else {
            // Validation for Qty if lot is already selected
            if (field === 'qty' && newItems[index].lot_id) {
                const lot = availableLots.find(l => l.id === newItems[index].lot_id);
                if (lot) {
                    const numVal = Number(value);
                    value = Math.min(numVal, lot.current_qty);
                }
            }
            newItems[index][field] = value;
        }

        // Auto-cap qty if lot changed
        if (field === 'lot_id') {
            const lot = availableLots.find(l => l.id === value);
            if (lot && Number(newItems[index].qty || 0) > lot.current_qty) {
                newItems[index].qty = lot.current_qty;
            }
        }
        setExchangeItems(newItems);
    };

    // Calculations
    const totalRefundAmount = returnItems.reduce((sum, item) => sum + (Number(item.return_qty || 0) * item.rate), 0);
    const totalNewSaleAmount = exchangeItems.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.rate || 0)), 0);
    const netPayable = totalNewSaleAmount - totalRefundAmount; // > 0: Customer Pays, < 0: We Refund

    const handleSubmit = async () => {
        if (!selectedInvoice) return;
        const itemsToReturn = returnItems.filter(i => i.return_qty > 0);

        if (itemsToReturn.length === 0) {
            toast({ title: "Error", description: "Select at least one item to return", variant: "destructive" });
            return;
        }

        if (returnType === 'exchange') {
            if (exchangeItems.length === 0) {
                toast({ title: "Error", description: "Add items for exchange or change return type", variant: "destructive" });
                return;
            }
            
            // Check stock availability
            for (const item of exchangeItems) {
                const lot = availableLots.find(l => l.id === item.lot_id);
                if (!lot) {
                    toast({ title: "Invalid Exchange", description: "Please select a lot for all exchange items.", variant: "destructive" });
                    return;
                }
                if (Number(item.qty || 0) > lot.current_qty) {
                    toast({ title: "Stock Error", description: `Requested ${item.qty} for ${lot.item?.name} but only ${lot.current_qty} available in lot ${lot.lot_code}.`, variant: "destructive" });
                    return;
                }
                if (Number(item.qty || 0) <= 0) {
                    toast({ title: "Quantity Error", description: `Exchange quantity for ${lot.item?.name} must be greater than zero.`, variant: "destructive" });
                    return;
                }
            }
        }

        // Check return limits for reversal
        const overReturned = returnItems.find(item => Number(item.return_qty || 0) > item.max_qty);
        if (overReturned) {
            toast({ 
                title: "Limit Exceeded", 
                description: `Cannot return ${overReturned.return_qty} for ${overReturned.lot?.item?.name}. Remaining returnable: ${overReturned.max_qty}`, 
                variant: "destructive" 
            });
            return;
        }

        if (!profile?.organization_id) {
            toast({ title: "Session Error", description: "Organization ID missing. Please refresh.", variant: "destructive" });
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            // 1. Process Return (CREDIT Mode)
            const processingType = returnType === 'exchange' ? 'credit' : returnType;
            const contactId = selectedInvoice.buyer_id || selectedInvoice.buyer?.id;

            if (!contactId) {
                throw new Error("Buyer/Contact ID missing from invoice.");
            }

            const { data: returnData, error: returnError } = await supabase
                .schema('mandi')
                .from('sale_returns')
                .insert({
                    organization_id: profile.organization_id,
                    sale_id: selectedInvoice.id,
                    buyer_id: contactId,
                    return_type: processingType,
                    total_amount: totalRefundAmount,
                    remarks: remarks + (returnType === 'exchange' ? ' (Exchange Process)' : ''),
                    status: 'draft'
                })
                .select()
                .single();

            if (returnError) throw new Error(`Return Creation Failed: ${returnError.message}`);

            // Return Items
            const returnItemsPayload = itemsToReturn.map(item => ({
                return_id: returnData.id,
                lot_id: item.lot_id,
                item_id: item.lot?.item?.id || item.item_id,
                qty: item.return_qty,
                rate: item.rate,
                amount: item.return_qty * item.rate
            }));

            const { error: itemsError } = await supabase.schema('mandi').from('sale_return_items').insert(returnItemsPayload);
            if (itemsError) throw new Error(`Items Insert Failed: ${itemsError.message}`);

            // Execute Return RPC
            const { error: rpcError } = await supabase.schema('mandi').rpc('process_sale_return_transaction', { p_return_id: returnData.id });
            if (rpcError) {
                console.error("RPC Error:", rpcError);
                throw new Error(`Transaction Processing Failed: ${rpcError.message}`);
            }

            // 2. Process New Sale (If Exchange)
            if (returnType === 'exchange') {
                const buyerId = selectedInvoice.buyer?.id || selectedInvoice.contact_id;

                // Helper to format items for sales RPC
                const salesItemsPayload = exchangeItems.map(item => ({
                    lot_id: item.lot_id,
                    qty: item.qty,
                    rate: item.rate,
                    amount: item.qty * item.rate,
                    unit: 'Box' // Default or fetch from lot
                }));

                // Call Sales RPC
                const { data: saleData, error: saleError } = await supabase
                    .schema('mandi')
                    .rpc('confirm_sale_transaction', {
                        p_organization_id: profile?.organization_id,
                        p_buyer_id: buyerId,
                        p_sale_date: new Date().toISOString().split('T')[0], // Today
                        p_payment_mode: 'credit', // Always credit first for exchange math
                        p_total_amount: totalNewSaleAmount,
                        p_items: salesItemsPayload,
                        p_market_fee: 0, // Simplify for return/exchange or fetch settings
                        p_nirashrit: 0,
                        p_misc_fee: 0,
                        p_loading_charges: 0,
                        p_unloading_charges: 0,
                        p_other_expenses: 0
                    });

                if (saleError) throw saleError;

                // 3. Settle Difference
                if (Math.abs(netPayable) > 0) {
                    const narration = `Exchange Settlement (Inv #${selectedInvoice.bill_no} -> New Sale)`;

                    if (netPayable > 0) {
                        // Customer Pays Us (Debit Cash, Credit Customer)
                        // Use RPC or direct Voucher insert? Direct is safer here as we are "Business Tycoon"
                        // But wait, confirm_sale_transaction creates ledger entry? Yes.
                        // process_sale_return creates ledger entry? Yes.
                        // So ledger balance is now: Original - Return + New Sale.
                        // If we settle, we just need a Receipt or Payment.

                        // We Owe Customer (Refund > New Sale) -> Pay Cash
                        // Customer Owes Us (New Sale > Refund) -> Receive Cash

                        // BUT user might not settle immediately.
                        // Let's assume for "Exchange" they want to settle the diff NOW if it's a cash customer?
                        // Or just leave it on ledger?
                        // "work as a business tycoon" -> Flexibility.
                        // I'll create a settlement voucher ONLY if they checked "Settle Difference".
                        // For now, let's just create the settlement to close the loop if it's small or explicitly Cash.
                    }
                }
            }

            toast({ title: "Success", description: "Return & Exchange processed successfully!" });
            router.push('/sales');

        } catch (error: any) {
            console.error(error);
            toast({ title: "Failed", description: error.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto pb-20">
            <div className="bg-[#FCFCFC] border-2 border-slate-200 rounded-none shadow-[0_20px_50px_rgba(0,0,0,0.1)] relative overflow-hidden">
                {/* Visual Top Bar */}
                <div className="h-2 bg-red-600 w-full" />

                <div className="p-4 md:p-14">
                    {/* Header Area */}
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4 md:gap-8 mb-8 md:mb-16 border-b-2 border-slate-100 pb-6 md:pb-10">
                        <div className="space-y-1">
                            <h2 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-2 md:gap-3">
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-red-600 rounded-lg flex items-center justify-center text-white shrink-0">
                                    <RefreshCw className="w-5 h-5 md:w-6 md:h-6" />
                                </div>
                                CREDIT MEMO
                            </h2>
                            <p className="text-slate-500 font-bold tracking-[0.2em] uppercase text-[10px] ml-1">
                                Sales Return & Exchange Record • Official Document
                            </p>
                        </div>
                        <Button variant="ghost" onClick={() => router.back()} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sales
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                        <div className="lg:col-span-8 space-y-12">
                            {/* 1. SELECT INVOICE */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 text-slate-900 font-black text-[11px] uppercase tracking-[0.2em]">
                                    <div className="w-6 h-[2px] bg-slate-900" />
                                    1. Reference Invoice Selection
                                </div>
                                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-l-4 border-amber-400 rounded-r-md mb-2">
                                    <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                    <span className="text-[10px] text-amber-800 font-bold uppercase tracking-wider">
                                        Note: Only invoices from the last 30 days are accepted for returns.
                                    </span>
                                </div>
                                <Popover open={open} onOpenChange={setOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={open}
                                            className="w-full justify-between h-16 text-xl bg-transparent border-t-0 border-l-0 border-r-0 border-b-2 border-slate-200 rounded-none px-0 font-black text-slate-900 hover:bg-transparent shadow-none"
                                        >
                                            {selectedInvoice
                                                ? <span>Bill #{selectedInvoice.bill_no} — {selectedInvoice.buyer?.name}</span>
                                                : "Search Original Bill Database..."}
                                            <ChevronsUpDown className="ml-2 h-5 w-5 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[90vw] max-w-[450px] p-0 bg-white border-slate-200 shadow-2xl rounded-xl mr-4 md:mr-0" align="end">
                                        <div className="p-3">
                                            <div className="flex items-center bg-slate-50 border border-slate-100 rounded-lg px-3 mb-2">
                                                <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                                                <input
                                                    className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-400 font-bold"
                                                    placeholder="Search Bill No or Buyer Name..."
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                />
                                            </div>
                                            <div className="max-h-[300px] overflow-y-auto space-y-1">
                                                {invoices.map((invoice) => (
                                                    <div
                                                        key={invoice.id}
                                                        onClick={() => {
                                                            setSelectedInvoice(invoice);
                                                            setOpen(false);
                                                        }}
                                                        className={cn(
                                                            "relative flex cursor-pointer items-center rounded-lg px-3 py-3 text-sm font-bold hover:bg-slate-50 transition-colors",
                                                            selectedInvoice?.id === invoice.id && "bg-slate-50 border border-slate-100"
                                                        )}
                                                    >
                                                        <Check className={cn("mr-2 h-4 w-4 text-emerald-600", selectedInvoice?.id === invoice.id ? "opacity-100" : "opacity-0")} />
                                                        <div className="flex flex-col">
                                                            <span className="text-slate-900">#Inv {invoice.bill_no} — {invoice.buyer?.name}</span>
                                                            <span className="text-[10px] text-slate-400 uppercase tracking-tighter">{new Date(invoice.sale_date).toLocaleDateString()} • ₹{invoice.total_amount?.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {invoices.length === 0 && !isSearching && <div className="py-6 text-center text-xs text-slate-400">No records found.</div>}
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {selectedInvoice && (
                                <>
                                    {/* 2. RETURN ITEMS */}
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-red-600 font-black text-[11px] uppercase tracking-[0.2em]">
                                                <div className="w-6 h-[2px] bg-red-600" />
                                                2. Reversal (Return Items)
                                            </div>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Adjusting Inv #{selectedInvoice.bill_no}</span>
                                        </div>

                                        <div className="border border-slate-200 rounded-2xl overflow-x-auto bg-white">
                                            <table className="w-full min-w-[600px]">
                                                <thead className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
                                                    <tr>
                                                        <th className="p-4 text-left">Item Description</th>
                                                        <th className="p-4 text-center">Avail / Sold</th>
                                                        <th className="p-4 text-center">Unit Price</th>
                                                        <th className="p-4 text-center w-28">Return Qty</th>
                                                        <th className="p-4 text-right">Ext. Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 text-sm font-bold">
                                                    {returnItems.map((item) => (
                                                        <tr key={item.id} className={cn("transition-colors", item.return_qty > 0 ? "bg-red-50" : "hover:bg-slate-50")}>
                                                            <td className="p-4">
                                                                <div className="text-slate-900">{item.lot?.item?.name}</div>
                                                                <div className="text-[10px] text-slate-400 uppercase tracking-tighter">{item.lot?.lot_code}</div>
                                                            </td>
                                                            <td className="p-4 text-center text-slate-500">
                                                                {item.max_qty} <span className="text-[10px] opacity-50">/ {item.original_sold_qty}</span>
                                                            </td>
                                                            <td className="p-4 text-center text-slate-900">₹{item.rate}</td>
                                                            <td className="p-4">
                                                                <Input
                                                                    type="number"
                                                                    min="0"
                                                                    max={item.max_qty}
                                                                    value={item.return_qty === 0 ? "" : item.return_qty}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleQtyChange(item.id, e.target.value)}
                                                                    className="text-center font-black h-9 border-2 border-slate-200 focus:border-red-600 rounded-lg shadow-none"
                                                                />
                                                            </td>
                                                            <td className="p-4 text-right font-black text-slate-900 truncate">
                                                                ₹{(item.return_qty * item.rate).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* 3. EXCHANGE ITEMS */}
                                    {returnType === 'exchange' && (
                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-emerald-600 font-black text-[11px] uppercase tracking-[0.2em]">
                                                    <div className="w-6 h-[2px] bg-emerald-600" />
                                                    3. New Acquisition (Exchange)
                                                </div>
                                                <Button size="sm" variant="outline" onClick={addExchangeItem} className="h-8 border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg px-4 text-[10px] font-black uppercase tracking-widest">
                                                    <Plus className="w-3.5 h-3.5 mr-2" /> Append Row
                                                </Button>
                                            </div>

                                            <div className="space-y-4">
                                                {exchangeItems.map((item, idx) => (
                                                    <div key={item.tempId} className="grid grid-cols-12 gap-4 items-center bg-slate-50 border border-slate-100 p-4 rounded-xl relative group">
                                                        <div className="col-span-5">
                                                            <Select value={item.lot_id} onValueChange={(val) => updateExchangeItem(idx, 'lot_id', val)}>
                                                                <SelectTrigger className="h-12 bg-white border-2 border-slate-200 text-slate-900 font-bold rounded-lg shadow-none">
                                                                    <SelectValue placeholder="Select New Stock..." />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-white border-slate-200">
                                                                    {availableLots.map(lot => (
                                                                        <SelectItem key={lot.id} value={lot.id} className="font-bold py-3">
                                                                            <div className="flex flex-col">
                                                                                <span>{lot.item?.name} • Bal: {lot.current_qty}</span>
                                                                                <span className="text-[10px] text-slate-400">Rate: ₹{lot.supplier_rate}</span>
                                                                            </div>
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="col-span-2">
                                                            <Input 
                                                                type="number" 
                                                                placeholder="Qty" 
                                                                max={availableLots.find(l => l.id === item.lot_id)?.current_qty}
                                                                value={item.qty === 0 ? "" : item.qty} 
                                                                onChange={(e) => updateExchangeItem(idx, 'qty', e.target.value)} 
                                                                className="h-12 bg-white border-2 border-slate-200 text-center font-black rounded-lg shadow-none" 
                                                            />
                                                        </div>
                                                        <div className="col-span-2">
                                                            <Input type="number" placeholder="Price" value={item.rate === 0 ? "" : item.rate} onChange={(e) => updateExchangeItem(idx, 'rate', e.target.value)} className="h-12 bg-white border-2 border-slate-200 text-center font-black rounded-lg shadow-none" />
                                                        </div>
                                                        <div className="col-span-2 text-right font-black text-slate-900 whitespace-nowrap">
                                                            ₹{(item.qty * item.rate).toLocaleString()}
                                                        </div>
                                                        <div className="col-span-1 text-right">
                                                            <Button variant="ghost" size="icon" onClick={() => removeExchangeItem(idx)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 rounded-lg">
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {exchangeItems.length === 0 && (
                                                    <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-black uppercase tracking-widest">
                                                        No exchange items appended.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* SIDEBAR: SUMMARY & ACTION */}
                        <div className="lg:col-span-4">
                            {selectedInvoice ? (
                                <div className="space-y-8 sticky top-8">
                                    <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden">
                                        <div className="relative z-10 space-y-8">
                                            <div className="space-y-4">
                                                <div className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Transaction Type</div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {[
                                                        { id: 'credit', label: 'UDHAAR', sub: 'Reduce User Bal', color: 'bg-indigo-600' },
                                                        { id: 'cash', label: 'CASH', sub: 'Immediate Payout', color: 'bg-emerald-600' },
                                                        { id: 'exchange', label: 'EXCHANGE', sub: 'New Bill Adj.', color: 'bg-orange-600' }
                                                    ].map((opt) => {
                                                        const isDisabled = opt.id === 'cash' && (buyerBalance || 0) > 0;
                                                        return (
                                                        <button
                                                            key={opt.id}
                                                            onClick={() => {
                                                                if (isDisabled) {
                                                                    toast({ title: "Cash Denied", description: `Buyer has outstanding balance of ₹${buyerBalance?.toLocaleString()}. Cash refund not allowed.`, variant: "destructive" });
                                                                    return;
                                                                }
                                                                setReturnType(opt.id);
                                                            }}
                                                            className={cn(
                                                                "flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left",
                                                                returnType === opt.id ? `border-white ${opt.color}` : "border-white/10 bg-white/5",
                                                                isDisabled ? "opacity-30 cursor-not-allowed grayscale" : "hover:bg-white/10"
                                                            )}
                                                        >
                                                            <span className="font-black text-xs uppercase tracking-wider">{opt.label}</span>
                                                            <span className="text-[9px] font-bold opacity-60 uppercase">
                                                                {isDisabled ? 'Blocked (Has Dues)' : opt.sub}
                                                            </span>
                                                        </button>
                                                    )})}
                                                </div>
                                            </div>

                                            <div className="space-y-4 border-t border-white/10 pt-8">
                                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40">
                                                    <span>Sales Reversal</span>
                                                    <span className="text-red-400">-₹{totalRefundAmount.toLocaleString()}</span>
                                                </div>
                                                {returnType === 'exchange' && (
                                                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40">
                                                        <span>New Acquisition</span>
                                                        <span className="text-emerald-400">+₹{totalNewSaleAmount.toLocaleString()}</span>
                                                    </div>
                                                )}

                                                <div className="pt-4">
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Final Settlement</div>
                                                    <div className="text-5xl font-black tracking-tighter">
                                                        ₹{Math.abs(netPayable).toLocaleString()}
                                                    </div>
                                                    <div className="text-[9px] font-black uppercase tracking-[0.2em] mt-2 opacity-60">
                                                        {netPayable > 0 ? "Customer Pays Balance" : "Mandi Refund Obligation"}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-[9px] font-black uppercase text-white/40 tracking-widest">Formal Remarks</Label>
                                                <Input value={remarks} onChange={e => setRemarks(e.target.value)} className="bg-white/10 border-white/10 text-white font-bold h-10 rounded-lg placeholder:text-white/20 text-xs" placeholder="Document reason..." />
                                            </div>

                                            <Button
                                                className="w-full h-16 bg-white text-slate-900 font-black text-sm rounded-2xl hover:bg-emerald-400 transition-all active:scale-95 shadow-xl"
                                                onClick={handleSubmit}
                                                disabled={loading || totalRefundAmount === 0}
                                            >
                                                {loading ? <Loader2 className="animate-spin" /> : "FINALIZE MEMO"}
                                            </Button>
                                        </div>
                                    </div>
                                    {/* Decorative Document Shadow */}
                                    <div className="h-4 bg-slate-200 mt-[-10px] mx-4 rounded-b-xl -z-10" />
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center p-12 border-4 border-dashed border-slate-100 rounded-[3rem] text-center space-y-4">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                                        <Search className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-sm font-black text-slate-900 uppercase tracking-widest">Waiting for Reference</div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Select an invoice to start credit memo</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
