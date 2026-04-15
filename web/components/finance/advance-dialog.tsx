"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, IndianRupee, Coins, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/hooks/use-toast";

interface AdvanceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contactId: string;
    contactName: string;
    lotId?: string;
    lotCode?: string;
    onSuccess?: () => void;
}

export function AdvanceDialog({
    open, onOpenChange, contactId, contactName, lotId, lotCode, onSuccess
}: AdvanceDialogProps) {
    const { profile } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [amount, setAmount] = useState("");
    const [date, setDate] = useState<Date>(new Date());
    const [dateOpen, setDateOpen] = useState(false);
    const [paymentMode, setPaymentMode] = useState<"cash" | "bank" | "cheque">("cash");
    const [chequeNo, setChequeNo] = useState("");
    const [chequeDate, setChequeDate] = useState<Date>(new Date());
    const [bankName, setBankName] = useState("");
    const [narration, setNarration] = useState("");
    const [instantClear, setInstantClear] = useState(false);  // instant cheque clearance
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [fetchingAccounts, setFetchingAccounts] = useState(false);

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setAmount("");
            setDate(new Date());
            setPaymentMode("cash");
            setChequeNo("");
            setChequeDate(new Date());
            setBankName("");
            setNarration("");
            setInstantClear(false);
            fetchAccounts();
        }
    }, [open]);

    const fetchAccounts = async () => {
        if (!profile?.organization_id) return;
        setFetchingAccounts(true);
        try {
            // Try mandi schema first, then fall back to public
            let data: any[] = [];
            const { data: mandiData } = await supabase.rpc('get_organization_accounts', {
                p_organization_id: profile.organization_id
            });

            if (mandiData && mandiData.length > 0) {
                data = mandiData;
            } else {
                // Fallback: query public.accounts
                const { data: pubData } = await supabase
                    .from('accounts')
                    .select('id, name, code, type')
                    .eq('organization_id', profile.organization_id)
                    .eq('is_active', true)
                    .order('code', { ascending: true });
                data = pubData || [];
            }

            setAccounts(data);
            // Auto-select cash account
            const cashAccount = data.find((a: any) => a.code === '1001' || a.name?.toLowerCase().includes('cash'));
            if (cashAccount) setSelectedAccountId(cashAccount.id);
        } catch (err) {
            console.error("Error fetching accounts:", err);
        } finally {
            setFetchingAccounts(false);
        }
    };

    // Auto-select account when payment mode changes
    useEffect(() => {
        if (accounts.length > 0) {
            if (paymentMode === 'cash') {
                const cashAcc = accounts.find(a => a.code === '1001' || a.name.toLowerCase().includes('cash'));
                if (cashAcc) setSelectedAccountId(cashAcc.id);
            } else {
                // Default to first non-cash account if possible, or just first account
                const bankAcc = accounts.find(a => a.code !== '1001' && !a.name.toLowerCase().includes('cash'));
                if (bankAcc) setSelectedAccountId(bankAcc.id);
                else setSelectedAccountId(accounts[0]?.id || "");
            }
        }
    }, [paymentMode, accounts]);

    const handleSubmit = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            toast({ title: "Invalid Amount", description: "Please enter a valid advance amount.", variant: "destructive" });
            return;
        }
        if (!profile?.organization_id) return;

        setLoading(true);
        try {
            const rpcName = 'record_advance_payment';
            const { data, error } = await (supabase.rpc(rpcName, {
                p_organization_id: profile.organization_id,
                p_contact_id: contactId,
                p_lot_id: lotId || null,
                p_amount: parseFloat(amount),
                p_payment_mode: paymentMode,
                p_date: format(date, "yyyy-MM-dd"),
                p_narration: narration || `Advance to ${contactName}${lotCode ? ` for Lot ${lotCode}` : ""}`,
                p_account_id: selectedAccountId || null,
                p_cheque_no: paymentMode === 'cheque' ? chequeNo : null,
                p_cheque_date: paymentMode === 'cheque' && !instantClear ? format(chequeDate, "yyyy-MM-dd") : null,
                p_cheque_status: paymentMode === 'cheque' ? (instantClear ? 'Cleared' : 'Pending') : null,
            }) as any);

            if (error) throw error;

            toast({
                title: "Advance Recorded ✓",
                description: `₹${parseFloat(amount).toLocaleString()} advance paid to ${contactName} via ${paymentMode}.`,
            });
            onSuccess?.();
            onOpenChange(false);
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "Failed to record advance payment.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-white text-black rounded-3xl border border-slate-200 shadow-2xl p-0 overflow-hidden">
                {/* Premium Header */}
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
                    <DialogHeader className="relative z-10">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                                <Coins className="w-5 h-5 text-white" />
                            </div>
                            <DialogTitle className="text-2xl font-[1000] tracking-tighter text-white">
                                Record Advance
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-amber-100 font-semibold text-sm">
                            Dadani / Pre-payment to <strong className="text-white">{contactName}</strong>
                            {lotCode && <span className="ml-1 text-amber-200">for Lot {lotCode}</span>}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
                    {/* Amount */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Advance Amount (₹)
                        </Label>
                        <div className="relative">
                            <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                type="number"
                                placeholder="0.00"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="pl-10 h-14 text-xl font-black text-amber-600 bg-amber-50 border-amber-200 rounded-2xl focus:border-amber-400"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Date + Mode row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Date</Label>
                            <Popover open={dateOpen} onOpenChange={setDateOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full h-11 font-black rounded-xl bg-slate-50 border-slate-200 text-black text-sm hover:bg-slate-100 justify-start">
                                        <CalendarIcon className="w-4 h-4 mr-2 text-slate-400" />
                                        {format(date, "dd MMM ''yy")}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 rounded-2xl border-slate-200 shadow-2xl z-50" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={(d) => { if (d) { setDate(d); setDateOpen(false); } }}
                                        className="bg-white text-black p-3"
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mode</Label>
                            <Select value={paymentMode} onValueChange={(v: "cash" | "bank" | "cheque") => setPaymentMode(v)}>
                                <SelectTrigger className="h-11 font-black rounded-xl bg-slate-50 border-slate-200 text-black text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-slate-200 text-black font-black rounded-xl shadow-2xl">
                                    <SelectItem value="cash">💵 CASH</SelectItem>
                                    <SelectItem value="bank">🔋 UPI / BANK</SelectItem>
                                    <SelectItem value="cheque">🎫 CHEQUE</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Account Selection */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Select {paymentMode === 'cash' ? 'Cash' : 'Bank'} Account
                        </Label>
                        <Select 
                            value={selectedAccountId} 
                            onValueChange={setSelectedAccountId}
                            disabled={fetchingAccounts}
                        >
                            <SelectTrigger className="h-11 font-black rounded-xl bg-slate-100 border-slate-300 text-black text-sm ring-offset-2 focus:ring-2 focus:ring-amber-500">
                                <SelectValue placeholder="Select Account" />
                            </SelectTrigger>
                            <SelectContent className="bg-white border-slate-200 text-black font-black rounded-xl shadow-2xl max-h-[200px]">
                                {accounts.map(acc => (
                                    <SelectItem key={acc.id} value={acc.id}>
                                        <div className="flex items-center justify-between gap-10 w-full">
                                            <span>{acc.name}</span>
                                            <span className="text-[10px] opacity-40 font-mono">#{acc.code}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                                {accounts.length === 0 && !fetchingAccounts && (
                                    <div className="p-4 text-center text-xs text-slate-500 font-bold">
                                        No active {paymentMode} accounts found
                                    </div>
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Cheque Details */}
                    {paymentMode === "cheque" && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl animate-in fade-in slide-in-from-top-2">
                            {/* Header */}
                            <div className="col-span-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cheque Details</span>
                            </div>

                            <div className="col-span-2 flex items-center justify-between pb-2 border-b border-slate-200/60 mb-1">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cheque Options</span>
                                <label className={`flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-full border transition-all duration-200 ${
                                    instantClear 
                                    ? 'bg-emerald-100 border-emerald-500 shadow-sm shadow-emerald-200' 
                                    : 'bg-white border-slate-300 hover:bg-slate-50'
                                }`}>
                                    <span className={`text-[10px] font-black uppercase tracking-wider ${instantClear ? 'text-emerald-800' : 'text-slate-600'}`}>
                                        {instantClear ? '⚡ Cleared Instantly' : '📅 Clear Later'}
                                    </span>
                                    <Switch
                                        checked={instantClear}
                                        onCheckedChange={setInstantClear}
                                        className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-200 border border-slate-300 shadow-sm"
                                    />
                                </label>
                            </div>

                            {instantClear && (
                                <div className="col-span-2 flex items-center gap-2 bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-2">
                                    <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span className="text-[10px] text-emerald-700 font-bold">Cheque marked as cleared — skips pending reconciliation queue.</span>
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cheque No</Label>
                                <Input
                                    placeholder="Number"
                                    value={chequeNo}
                                    onChange={e => setChequeNo(e.target.value)}
                                    className="h-10 bg-white border-slate-200 text-black rounded-lg"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bank Name</Label>
                                <Input
                                    placeholder="Bank Name"
                                    value={bankName}
                                    onChange={e => setBankName(e.target.value)}
                                    className="h-10 bg-white border-slate-200 text-black rounded-lg"
                                />
                            </div>
                            {/* Only show clearing date if NOT instant */}
                            {!instantClear && (
                                <div className="col-span-2 space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Expected Clearing Date</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full h-10 font-bold rounded-lg bg-white border-slate-200 text-black text-sm hover:bg-slate-50 justify-start">
                                                <CalendarIcon className="w-4 h-4 mr-2 text-slate-400" />
                                                {format(chequeDate, "dd MMM ''yy")}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 rounded-xl border-slate-200 shadow-2xl z-50" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={chequeDate}
                                                onSelect={(d) => { if (d) setChequeDate(d); }}
                                                className="bg-white text-black p-3"
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Narration */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Notes / Narration <span className="text-slate-300">(optional)</span>
                        </Label>
                        <Input
                            placeholder={`Advance to ${contactName}${lotCode ? ` for Lot ${lotCode}` : ""}`}
                            value={narration}
                            onChange={e => setNarration(e.target.value)}
                            className="h-11 font-medium text-sm bg-slate-50 border-slate-200 rounded-xl text-black"
                        />
                    </div>

                    {/* Preview pill */}
                    {amount && parseFloat(amount) > 0 && (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Ledger Entry Preview</p>
                                <p className="text-sm font-bold text-slate-700 mt-0.5">
                                    DR {contactName} · CR {accounts.find(a => a.id === selectedAccountId)?.name || "Selected Account"}
                                </p>
                            </div>
                            <span className="text-2xl font-[1000] text-amber-700 tracking-tighter">
                                ₹{parseFloat(amount).toLocaleString()}
                            </span>
                        </div>
                    )}

                    {/* Action */}
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || !amount || parseFloat(amount) <= 0}
                        className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-amber-200 transition-all"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                            <>Record Advance · ₹{amount ? parseFloat(amount).toLocaleString() : "0"}</>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
