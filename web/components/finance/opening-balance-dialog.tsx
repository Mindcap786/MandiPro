"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Landmark } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";

export function AdjustBalanceDialog({ accountId, accountName, currentBalance, onRefresh }: { accountId: string, accountName: string, currentBalance: number, onRefresh: () => void }) {
    const { profile } = useAuth();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [amount, setAmount] = useState<string>("0");
    const [type, setType] = useState<'debit' | 'credit'>('debit');

    const handleSave = async () => {
        setLoading(true);
        try {
            // Note: In real accounting, you'd post a journal entry, not just update balance.
            // This is a simplified "adjustment" for opening balances.
            const adjustment = type === 'debit' ? parseFloat(amount) : -parseFloat(amount);

            // Logic depending on your backend function. Assuming 'adjust_balance' handles the logic.
            const isMandi = profile?.business_domain === 'mandi' || !profile?.business_domain;
            const rpcName = isMandi ? 'mandi.adjust_balance' : 'adjust_balance';
            const { error } = await supabase.rpc(rpcName, {
                p_organization_id: profile?.organization_id,
                p_account_id: accountId,
                p_amount: parseFloat(amount),
                p_type: type
            });

            if (error) throw error;

            setOpen(false);
            setAmount("0");
            onRefresh();
        } catch (e: any) {
            console.error(e);
            alert("Error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-3 rounded-lg border border-transparent hover:border-blue-100 transition-all">
                    Adjust
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-slate-200 text-black max-w-sm shadow-2xl rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-800 uppercase tracking-widest text-sm font-black">
                        <Landmark className="w-4 h-4 text-blue-600" /> Adjust Balance
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1 block">Account</Label>
                        <p className="text-sm font-black text-slate-800">{accountName}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-widest text-slate-500 font-bold">Amount (₹)</Label>
                            <Input
                                type="number"
                                required
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="bg-white border-slate-200 text-black font-mono font-bold text-lg h-11 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-widest text-slate-500 font-bold">Action</Label>
                            <Select value={type} onValueChange={(v: any) => setType(v as 'debit' | 'credit')}>
                                <SelectTrigger className="bg-white border-slate-200 text-black h-11 rounded-xl font-bold">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-slate-200 text-slate-800 rounded-xl shadow-xl">
                                    <SelectItem value="debit" className="font-bold text-emerald-600">➕ Add Balance</SelectItem>
                                    <SelectItem value="credit" className="font-bold text-rose-600">➖ Reduce Balance</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-50 text-xs text-slate-600 leading-relaxed">
                        Current balance: <strong className="text-black font-black">₹{currentBalance.toLocaleString('en-IN')}</strong><br />
                        <span className="text-emerald-600 font-bold">Add</span> will increase. <span className="text-rose-600 font-bold">Reduce</span> will decrease.
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-400 hover:text-black font-bold">Cancel</Button>
                    <Button onClick={handleSave} disabled={loading} className="bg-blue-600 text-white font-black hover:bg-blue-700 px-6 h-11 rounded-xl shadow-lg shadow-blue-200">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply Adjustment"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
