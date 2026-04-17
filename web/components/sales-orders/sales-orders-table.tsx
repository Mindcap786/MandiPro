"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
    ArrowUpDown, MoreHorizontal,
    CheckCircle2, XCircle, Eye, MessageCircle, FileText, Send, UserCheck, CheckSquare, Trash2
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
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

export default function SalesOrdersTable({ data, isLoading, onRefresh }: { data: any[], isLoading: boolean, onRefresh?: () => Promise<void> | void }) {
    const { t } = useLanguage();
    const { toast } = useToast();
    const router = useRouter();
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const handleStatusUpdate = async (id: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('sales_orders')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;

            toast({
                title: "Status Updated",
                description: `Order status changed to ${newStatus}`,
            });

            if (onRefresh) {
                await onRefresh();
            } else {
                router.refresh();
            }
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive"
            });
        }
    };

    if (isLoading) {
        return <div className="p-12 text-center text-gray-500 animate-pulse">{t('common.loading') || 'Loading orders...'}</div>;
    }

    return (
        <div className="space-y-4">
            {/* Premium Table */}
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-xl">
                <table className="premium-table w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="pl-6 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('order_number')}>
                                {t('sales_orders.order_no') || 'Order No'} <ArrowUpDown className="inline w-3 h-3 ml-1 opacity-50" />
                            </th>
                            <th className="pl-4 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('order_date')}>
                                {t('sales_orders.date') || 'Date'}
                            </th>
                            <th className="pl-4 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('buyer')}>
                                {t('sales_orders.buyer') || 'Buyer'}
                            </th>
                            <th className="py-5 text-right w-[140px] pr-8 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('total_amount')}>
                                {t('sales_orders.amount') || 'Amount'}
                            </th>
                            <th className="py-5 text-center w-[160px] text-black font-black uppercase tracking-widest text-xs">{t('sales_orders.status') || 'Status'}</th>
                            <th className="py-5 text-right pr-6 text-black font-black uppercase tracking-widest text-xs">{t('sales.actions') || 'Actions'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 text-gray-500 font-bold">
                                    {t('sales_orders.no_records') || 'No sales orders found.'}
                                </td>
                            </tr>
                        ) : data.map((row) => {
                            const totalAmount = Number(row.total_amount) || 0;
                            const status = row.status || 'Draft';

                            // Determine styles based on status
                            let statusClasses = "bg-slate-100 text-slate-700 border-slate-200";
                            let statusIcon = <FileText className="w-3 h-3 mr-1" />;

                            switch (status) {
                                case 'Sent':
                                    statusClasses = "bg-blue-50 text-blue-700 border-blue-200";
                                    statusIcon = <Send className="w-3 h-3 mr-1" />;
                                    break;
                                case 'Accepted':
                                    statusClasses = "bg-indigo-50 text-indigo-700 border-indigo-200";
                                    statusIcon = <UserCheck className="w-3 h-3 mr-1" />;
                                    break;
                                case 'Partially Invoiced':
                                    statusClasses = "bg-orange-50 text-orange-700 border-orange-200";
                                    statusIcon = <CheckSquare className="w-3 h-3 mr-1" />;
                                    break;
                                case 'Fully Invoiced':
                                    statusClasses = "bg-green-100 text-green-700 border-green-200";
                                    statusIcon = <CheckCircle2 className="w-3 h-3 mr-1" />;
                                    break;
                                case 'Cancelled':
                                    statusClasses = "bg-red-50 text-red-600 border-red-200";
                                    statusIcon = <XCircle className="w-3 h-3 mr-1" />;
                                    break;
                            }

                            return (
                                <tr key={row.id} className="group hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
                                    <td className="pl-6 text-left font-mono font-black text-black group-hover:text-blue-600 transition-colors">
                                        #{row.order_number}
                                    </td>
                                    <td className="pl-4 text-left text-black font-bold">
                                        {row.order_date ? format(new Date(row.order_date), 'dd MMM yyyy') : 'N/A'}
                                    </td>
                                    <td className="pl-4 text-left font-black text-black text-base hover:text-blue-600 transition-colors cursor-pointer">
                                        <Link href={`/sales-orders?search=${encodeURIComponent(row.buyer?.name || '')}`}>
                                            {row.buyer?.name}
                                        </Link>
                                    </td>
                                    <td className="text-right w-[140px] pr-8 font-mono font-black text-black text-lg tracking-tight">
                                        ₹{totalAmount.toLocaleString()}
                                    </td>
                                    <td className="text-center w-[160px]">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-widest border ${statusClasses}`}>
                                            {statusIcon} {status}
                                        </span>
                                    </td>
                                    <td className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full border border-transparent group-hover:border-slate-200">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="bg-white border-slate-200 text-slate-900 w-56 shadow-2xl rounded-xl p-1">
                                                <DropdownMenuLabel className="uppercase text-[10px] tracking-widest text-slate-400 px-2 py-1.5">{t('sales_orders.actions') || 'Actions'}</DropdownMenuLabel>

                                                <DropdownMenuItem asChild>
                                                    <Link href={`/sales-orders/${row.id}`} className="flex items-center w-full cursor-pointer hover:bg-slate-50 focus:bg-slate-50 rounded-lg m-1 font-bold">
                                                        <Eye className="w-4 h-4 mr-2 text-blue-600" /> View Details
                                                    </Link>
                                                </DropdownMenuItem>

                                                {row.status === 'Draft' && (
                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(row.id, 'Sent')} className="flex items-center w-full cursor-pointer hover:bg-slate-50 focus:bg-slate-50 rounded-lg m-1 font-bold">
                                                        <Send className="w-4 h-4 mr-2 text-blue-500" /> Mark as Sent
                                                    </DropdownMenuItem>
                                                )}

                                                {row.status === 'Sent' && (
                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(row.id, 'Accepted')} className="flex items-center w-full cursor-pointer hover:bg-slate-50 focus:bg-slate-50 rounded-lg m-1 font-bold">
                                                        <UserCheck className="w-4 h-4 mr-2 text-indigo-500" /> Mark as Accepted
                                                    </DropdownMenuItem>
                                                )}

                                                {/* Only allow conversion to Invoice if Accepted or Partially Invoiced */}
                                                {(row.status === 'Accepted' || row.status === 'Partially Invoiced') && (
                                                    <DropdownMenuItem asChild>
                                                        <Link href={`/sales/new?order_id=${row.id}`} className="flex items-center w-full cursor-pointer bg-green-50 text-green-700 hover:bg-green-100 focus:bg-green-100 rounded-lg m-1 font-black">
                                                            <CheckCircle2 className="w-4 h-4 mr-2" /> Convert to Invoice
                                                        </Link>
                                                    </DropdownMenuItem>
                                                )}

                                                <DropdownMenuSeparator className="bg-slate-100 my-1" />

                                                <DropdownMenuItem
                                                    onClick={() => {
                                                        const text = `*SALES ORDER #${row.order_number}*\n` +
                                                            `Date: ${format(new Date(row.order_date), 'dd MMM yyyy')}\n` +
                                                            `Total Amount: ₹${totalAmount.toLocaleString()}\n\n` +
                                                            `Please review your order details.`;
                                                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                                                    }}
                                                    className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 flex items-center rounded-lg m-1 font-bold"
                                                >
                                                    <MessageCircle className="w-4 h-4 mr-2 text-green-600" /> Share on WhatsApp
                                                </DropdownMenuItem>

                                                {row.status !== 'Cancelled' && row.status !== 'Fully Invoiced' && (
                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(row.id, 'Cancelled')} className="flex items-center w-full cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50 rounded-lg m-1 font-bold">
                                                        <Trash2 className="w-4 h-4 mr-2" /> Cancel Order
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
