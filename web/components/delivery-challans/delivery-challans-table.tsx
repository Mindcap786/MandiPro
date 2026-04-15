"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
    ArrowUpDown, MoreHorizontal,
    Truck, CheckCircle2, FileX2, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/components/i18n/language-provider";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

export default function DeliveryChallansTable({ data, isLoading, onStatusUpdate }: { data: any[], isLoading: boolean, onStatusUpdate: () => void }) {
    const { t } = useLanguage();
    const { toast } = useToast();
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const updateStatus = async (id: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('delivery_challans')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;
            toast({ title: "Status Updated", description: `Challan is now ${newStatus}` });
            onStatusUpdate();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    if (isLoading) {
        return <div className="p-12 text-center text-gray-500 animate-pulse">{t('common.loading') || 'Loading...'}</div>;
    }

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'Draft': return { color: 'bg-slate-100 text-slate-700 border-slate-200' };
            case 'Dispatched': return { color: 'bg-blue-50 text-blue-700 border-blue-200' };
            case 'Delivered': return { color: 'bg-green-50 text-green-700 border-green-200' };
            case 'Cancelled': return { color: 'bg-red-50 text-red-700 border-red-200' };
            default: return { color: 'bg-slate-100 text-slate-700 border-slate-200' };
        }
    };

    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-xl">
                <table className="premium-table w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="pl-6 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('challan_number')}>
                                Challan No. <ArrowUpDown className="inline w-3 h-3 ml-1 opacity-50" />
                            </th>
                            <th className="pl-4 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('challan_date')}>
                                Date
                            </th>
                            <th className="pl-4 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('contact')}>
                                Consignee / Party
                            </th>
                            <th className="pl-4 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('vehicle_number')}>
                                Vehicle No.
                            </th>
                            <th className="py-5 text-center w-[160px] text-black font-black uppercase tracking-widest text-xs">
                                Status
                            </th>
                            <th className="pl-4 text-left py-5 text-black font-black uppercase tracking-widest text-xs">
                                Ref Order
                            </th>
                            <th className="py-5 text-right pr-6 text-black font-black uppercase tracking-widest text-xs">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="text-center py-12 text-gray-500 font-bold">
                                    No records found.
                                </td>
                            </tr>
                        ) : data.map((row) => {
                            const statusConf = getStatusConfig(row.status);

                            return (
                                <tr key={row.id} className="group hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
                                    <td className="pl-6 text-left font-mono font-black text-black group-hover:text-blue-600 transition-colors">
                                        #{row.challan_number}
                                    </td>
                                    <td className="pl-4 text-left text-black font-bold">
                                        {row.challan_date ? format(new Date(row.challan_date), 'dd MMM yyyy') : 'N/A'}
                                    </td>
                                    <td className="pl-4 text-left font-black text-black text-base hover:text-blue-600 transition-colors cursor-pointer">
                                        {row.contact?.name || 'Unknown'}
                                        <div className="text-xs text-slate-400 font-medium">{row.contact?.city || '-'}</div>
                                    </td>
                                    <td className="pl-4 text-left text-slate-700 font-bold uppercase">
                                        {row.vehicle_number || '-'}
                                        {row.driver_name && <div className="text-xs text-slate-400 font-medium capitalize">{row.driver_name}</div>}
                                    </td>
                                    <td className="text-center w-[160px]">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-widest border ${statusConf.color}`}>
                                            {row.status}
                                        </span>
                                    </td>
                                    <td className="pl-4 text-left text-slate-500 font-mono text-sm">
                                        {row.sales_order?.order_number ? `#${row.sales_order.order_number}` : '-'}
                                    </td>
                                    <td className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full border border-transparent group-hover:border-slate-200">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="bg-white border-slate-200 text-slate-900 w-56 shadow-2xl rounded-xl p-1">
                                                <DropdownMenuLabel className="uppercase text-[10px] tracking-widest text-slate-400 px-2 py-1.5">Actions</DropdownMenuLabel>

                                                <DropdownMenuItem asChild>
                                                    <Link href={`/delivery-challans/${row.id}`} className="flex items-center w-full cursor-pointer hover:bg-slate-50 focus:bg-slate-50 rounded-lg m-1 font-bold">
                                                        <Truck className="w-4 h-4 mr-2 text-blue-600" /> View / Print
                                                    </Link>
                                                </DropdownMenuItem>

                                                {(row.status === 'Dispatched' || row.status === 'Delivered') && (
                                                    <DropdownMenuItem asChild>
                                                        <Link href={`/sales/new?challan_id=${row.id}`} className="flex items-center w-full cursor-pointer bg-green-50 text-green-700 hover:bg-green-100 focus:bg-green-100 rounded-lg m-1 font-black">
                                                            <CheckCircle2 className="w-4 h-4 mr-2" /> Convert to Invoice
                                                        </Link>
                                                    </DropdownMenuItem>
                                                )}

                                                <DropdownMenuSeparator className="bg-slate-100 my-1 line-clamp-1 h-px" />

                                                {row.status === 'Draft' && (
                                                    <DropdownMenuItem onClick={() => updateStatus(row.id, 'Dispatched')} className="font-bold cursor-pointer hover:bg-slate-50 focus:bg-slate-50 rounded-lg m-1 text-blue-600">
                                                        <Send className="w-4 h-4 mr-2" /> Mark as Dispatched
                                                    </DropdownMenuItem>
                                                )}
                                                {row.status === 'Dispatched' && (
                                                    <DropdownMenuItem onClick={() => updateStatus(row.id, 'Delivered')} className="font-bold cursor-pointer hover:bg-slate-50 focus:bg-slate-50 rounded-lg m-1 text-green-600">
                                                        <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Delivered
                                                    </DropdownMenuItem>
                                                )}
                                                {row.status !== 'Cancelled' && (
                                                    <DropdownMenuItem onClick={() => updateStatus(row.id, 'Cancelled')} className="font-bold cursor-pointer hover:bg-slate-50 focus:bg-slate-50 rounded-lg m-1 text-red-600">
                                                        <FileX2 className="w-4 h-4 mr-2" /> Cancel Challan
                                                    </DropdownMenuItem>
                                                )}

                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
