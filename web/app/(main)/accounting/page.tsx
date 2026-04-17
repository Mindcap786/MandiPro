"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, TrendingDown, TrendingUp, Users, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { NewReceiptDialog } from "@/components/accounting/new-receipt-dialog";

export default function AccountingPage() {
    const { profile, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [stats, setStats] = useState({ receivable: 0, payable: 0, cash: 0 });

    useEffect(() => {
        if (profile?.organization_id) {
            fetchData();
        } else if (!authLoading) {
            setLoading(false);
        }
    }, [profile, authLoading]);

    const fetchData = async () => {
        setLoading(true);
        const { data: accData } = await supabase
            .from('accounts')
            .select('*')
            .eq('organization_id', profile?.organization_id);

        if (accData) {
            setAccounts(accData);
            // In a real app, we would query the ledger_entries SUM for these values
            // For now, hardcode or simulate until we put transactions in
        }
        setLoading(false);
    };

    if (loading) {
        return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-neon-green" /></div>;
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tighter">FINANCIAL <span className="text-neon-green">CORE</span></h1>
                    <p className="text-gray-400 font-medium">Group Ledgers & Trial Balance.</p>
                </div>
                <div className="flex gap-2">
                    <Button className="font-bold bg-white/5 hover:bg-white/10 text-white border border-white/10">
                        NEW PAYMENT
                    </Button>
                    <NewReceiptDialog onSuccess={() => {
                        // Refresh data if needed (e.g. cash balances)
                        fetchData(); // Assuming fetchData also updates stats or relevant data
                    }} />
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-[32px] bg-white/[0.03] border border-white/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp className="w-24 h-24 text-green-400" />
                    </div>
                    <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Total Receivables (Buyers)</div>
                    <div className="text-4xl font-black text-white tracking-tighter">₹ 0</div>
                    <div className="mt-4 flex items-center gap-2 text-green-400 text-xs font-bold bg-green-400/10 w-fit px-3 py-1 rounded-full">
                        <ArrowDownRight className="w-3 h-3" /> Buyers owe us
                    </div>
                </div>

                <div className="p-6 rounded-[32px] bg-white/[0.03] border border-white/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingDown className="w-24 h-24 text-red-400" />
                    </div>
                    <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Total Payables (Farmers)</div>
                    <div className="text-4xl font-black text-white tracking-tighter">₹ 0</div>
                    <div className="mt-4 flex items-center gap-2 text-red-400 text-xs font-bold bg-red-400/10 w-fit px-3 py-1 rounded-full">
                        <ArrowUpRight className="w-3 h-3" /> We owe farmers
                    </div>
                </div>

                <div className="p-6 rounded-[32px] bg-white/[0.03] border border-white/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Wallet className="w-24 h-24 text-blue-400" />
                    </div>
                    <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Cash in Hand</div>
                    <div className="text-4xl font-black text-white tracking-tighter">₹ 0</div>
                    <div className="mt-4 flex items-center gap-2 text-blue-400 text-xs font-bold bg-blue-400/10 w-fit px-3 py-1 rounded-full">
                        Liquid Assets
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <Tabs defaultValue="farmers" className="space-y-6">
                <TabsList className="bg-white/5 border border-white/10 p-1 h-12 rounded-xl">
                    <TabsTrigger value="farmers" className="h-10 px-6 rounded-lg data-[state=active]:bg-neon-green data-[state=active]:text-black font-bold">Farmer Balance</TabsTrigger>
                    <TabsTrigger value="buyers" className="h-10 px-6 rounded-lg data-[state=active]:bg-neon-green data-[state=active]:text-black font-bold">Buyer Balance</TabsTrigger>
                </TabsList>



                <TabsContent value="farmers">
                    <div className="p-12 text-center border border-dashed border-white/10 rounded-[32px]">
                        <p className="text-gray-500">Farmer Sub-Ledger (Coming Soon)</p>
                    </div>
                </TabsContent>

                <TabsContent value="buyers">
                    <div className="p-12 text-center border border-dashed border-white/10 rounded-[32px]">
                        <p className="text-gray-500">Buyer Sub-Ledger (Coming Soon)</p>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
