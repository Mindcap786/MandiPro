"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Unlock, Calendar, Loader2, Save, Landmark } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { AdjustBalanceDialog } from "./opening-balance-dialog";

export default function FinancialSettings() {
    const { profile } = useAuth();
    const [accounts, setAccounts] = useState<any[]>([]);

    useEffect(() => {
        if (profile?.organization_id) {
            fetchAccounts();
        }
    }, [profile]);

    const fetchAccounts = async () => {
        const schema = 'mandi';
        const { data } = await supabase
            .schema(schema)
            .from('accounts')
            .select('id, name, type, account_sub_type, opening_balance')
            .eq('organization_id', profile?.organization_id)
            .in('account_sub_type', ['cash', 'bank'])
            .order('name');
        
        if (data) {
            const formatted = data.map((acc: any) => ({
                account_id: acc.id,
                account_name: acc.name,
                account_type: acc.type,
                net_balance: acc.opening_balance || 0
            }));
            setAccounts(formatted);
        }
    };

    return (
        <div className="max-w-xl mx-auto space-y-6">

            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-[24px]">
                <CardHeader className="bg-slate-50 border-b border-slate-100 py-4">
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-black flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-blue-600" /> Opening Balances
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y divide-slate-100">
                        {accounts.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-xs font-bold uppercase">No accounts found</div>
                        ) : accounts.map(acc => (
                            <div key={acc.account_id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div>
                                    <div className="font-bold text-black text-sm">{acc.account_name}</div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{acc.account_type}</div>
                                </div>
                                <AdjustBalanceDialog
                                    accountId={acc.account_id}
                                    accountName={acc.account_name}
                                    currentBalance={acc.net_balance || 0}
                                    onRefresh={fetchAccounts}
                                />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
