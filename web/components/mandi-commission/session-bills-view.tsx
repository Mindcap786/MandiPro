"use client";

import React, { useState } from "react";
import { MandiSessionResult } from "@/hooks/mandi/useMandiSession";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronRight, Download, Receipt, ShoppingBag } from "lucide-react";
import { PurchaseBillDetailsSheet } from "@/components/purchase/purchase-bill-details";

interface SessionBillsViewProps {
    sessionData: any; // The full session structure from view_mandi_session_summary
    onNewSession: () => void;
}

export function SessionBillsView({ sessionData, onNewSession }: SessionBillsViewProps) {
    const [selectedLotId, setSelectedLotId] = useState<string | null>(null);

    if (!sessionData) return null;

    const farmers = sessionData.farmers || [];
    const hasSale = !!sessionData.buyer_sale_id;

    // We group farmer lots. A farmer row has arrival_id, but the purchase sheet needs lot_id.
    // The view provides all farmer rows. However, we may just open the arrival modal or simple view.
    // Actually, let's provide a neat summary card for each farmer.

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Success Banner */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                        <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-emerald-900 tracking-tight">Session Committed Successfully</h2>
                        <p className="text-sm font-medium text-emerald-700">All purchase & sale records, plus ledger entries, have been generated.</p>
                    </div>
                </div>
                <Button 
                    variant="outline" 
                    className="bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 focus:ring-2 focus:ring-emerald-500/20"
                    onClick={onNewSession}
                >
                    Start New Session
                </Button>
            </div>

            {/* Content Tabs */}
            <Tabs defaultValue="purchase" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px] h-12 p-1 bg-slate-100/50 border border-slate-200 rounded-xl">
                    <TabsTrigger value="purchase" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700 transition-all">
                        <Receipt className="w-4 h-4 mr-2" />
                        Purchase Bills ({farmers.length})
                    </TabsTrigger>
                    {hasSale && (
                        <TabsTrigger value="sale" className="rounded-lg font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700 transition-all">
                            <ShoppingBag className="w-4 h-4 mr-2" />
                            Sale Bill
                        </TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="purchase" className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {farmers.map((f: any, idx: number) => (
                            <Card key={idx} className="border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all">
                                <CardContent className="p-5">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <p className="text-[10px] font-black tracking-widest text-emerald-600 uppercase mb-1">Farmer Bill</p>
                                            <h3 className="text-lg font-black text-slate-900 leading-none">{f.farmer_name}</h3>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Net Payable</p>
                                            <p className="text-xl font-black text-slate-900 leading-none tabular-nums">
                                                ₹{(f.net_payable || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 space-y-2 mb-4">
                                        <div className="flex justify-between text-xs">
                                            <span className="font-bold text-slate-600 uppercase">{f.item_name}</span>
                                            <span className="font-black text-slate-900">{f.net_qty} {f.unit} @ ₹{f.rate}</span>
                                        </div>
                                        {(f.less_amount > 0 || f.commission_amount > 0 || f.loading_charges > 0) && (
                                            <div className="pt-2 border-t border-slate-200/60 mt-2 space-y-1">
                                                {f.less_amount > 0 && <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500"><span>Less Deduction</span><span className="text-red-500">- ₹{f.less_amount}</span></div>}
                                                {f.commission_amount > 0 && <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500"><span>Commission ({f.commission_percent}%)</span><span className="text-red-500">- ₹{f.commission_amount}</span></div>}
                                                {f.loading_charges > 0 && <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500"><span>Loading</span><span className="text-red-500">- ₹{f.loading_charges}</span></div>}
                                                {f.other_charges > 0 && <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500"><span>Other</span><span className="text-red-500">- ₹{f.other_charges}</span></div>}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-2">
                                        {/* Notice: since single screen session doesn't easily return all lot IDs in view immediately synced with purchase bills logic without a complex join, we redirect to purchase section or standard print */}
                                        <Button variant="outline" size="sm" className="h-8 text-xs font-bold" onClick={() => window.open('/purchase/bills', '_blank')}>
                                            View in Ledgers <ChevronRight className="w-3.5 h-3.5 ml-1" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {hasSale && (
                    <TabsContent value="sale" className="mt-6 animate-in fade-in slide-in-from-bottom-2">
                        <Card className="border-blue-100 shadow-sm bg-blue-50/30 overflow-hidden">
                            <CardContent className="p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                                            <ShoppingBag className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black tracking-widest text-blue-600 uppercase mb-0.5">Consolidated Sale</p>
                                            <h3 className="text-lg font-black text-slate-900 leading-none">{sessionData.buyer_name || 'Buyer'}</h3>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black tracking-widest text-slate-500 uppercase mb-1">Total Receivable</p>
                                        <p className="text-2xl font-black text-blue-700 leading-none tabular-nums">
                                            ₹{(sessionData.buyer_payable || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm mb-6">
                                    <h4 className="text-[10px] font-black tracking-widest text-slate-500 uppercase mb-3 border-b border-slate-100 pb-2">Sale Breakdown</h4>
                                    
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-end border-b border-slate-50 pb-2">
                                            <div>
                                                <span className="text-xs font-bold text-slate-800 uppercase block mb-0.5">Combined Inventory</span>
                                                <span className="text-[10px] font-bold text-slate-400">
                                                    Derived from {farmers.length} farmer lot(s)
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-black text-slate-900 block leading-none">
                                                    ₹{((sessionData.buyer_payable || 0) - (sessionData.buyer_loading_charges || 0) - (sessionData.buyer_packing_charges || 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                                </span>
                                            </div>
                                        </div>

                                        {(sessionData.buyer_loading_charges > 0) && (
                                            <div className="flex justify-between text-xs items-center">
                                                <span className="font-bold text-slate-600 uppercase">Loading</span>
                                                <span className="font-black text-slate-900">+ ₹{(sessionData.buyer_loading_charges).toLocaleString("en-IN")}</span>
                                            </div>
                                        )}
                                        
                                        {(sessionData.buyer_packing_charges > 0) && (
                                            <div className="flex justify-between text-xs items-center">
                                                <span className="font-bold text-slate-600 uppercase">Packing / Other</span>
                                                <span className="font-black text-slate-900">+ ₹{(sessionData.buyer_packing_charges).toLocaleString("en-IN")}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3">
                                    <Button className="bg-blue-600 hover:bg-blue-700 font-bold" onClick={() => window.open(`/sales`, '_blank')}>
                                        Go to Sales Desk <ChevronRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
