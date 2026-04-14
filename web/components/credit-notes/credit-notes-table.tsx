"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
    ArrowUpDown, MoreHorizontal,
    ArrowDownToLine, ArrowUpToLine, FileText
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

export default function CreditNotesTable({ data, isLoading }: { data: any[], isLoading: boolean }) {
    const { t } = useLanguage();
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    if (isLoading) {
        return <div className="p-12 text-center text-gray-500 animate-pulse">{t('common.loading') || 'Loading...'}</div>;
    }

    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-xl">
                <table className="premium-table w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="pl-6 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('note_number')}>
                                Note No. <ArrowUpDown className="inline w-3 h-3 ml-1 opacity-50" />
                            </th>
                            <th className="pl-4 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('note_date')}>
                                Date
                            </th>
                            <th className="pl-4 text-left py-5 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('contact')}>
                                Party
                            </th>
                            <th className="py-5 text-center w-[160px] text-black font-black uppercase tracking-widest text-xs">
                                Type
                            </th>
                            <th className="py-5 text-right w-[140px] pr-8 text-black font-black uppercase tracking-widest text-xs cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('amount')}>
                                Amount
                            </th>
                            <th className="pl-4 text-left py-5 text-black font-black uppercase tracking-widest text-xs">
                                Ref Invoice
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
                            const isCredit = row.note_type === 'Credit Note';

                            return (
                                <tr key={row.id} className="group hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
                                    <td className="pl-6 text-left font-mono font-black text-black group-hover:text-blue-600 transition-colors">
                                        #{row.note_number}
                                    </td>
                                    <td className="pl-4 text-left text-black font-bold">
                                        {row.note_date ? format(new Date(row.note_date), 'dd MMM yyyy') : 'N/A'}
                                    </td>
                                    <td className="pl-4 text-left font-black text-black text-base hover:text-blue-600 transition-colors cursor-pointer">
                                        {row.contact?.name || 'Unknown'}
                                    </td>
                                    <td className="text-center w-[160px]">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-widest border ${isCredit
                                                ? 'bg-lime-50 text-lime-700 border-lime-200'
                                                : 'bg-orange-50 text-orange-600 border-orange-200'
                                            }`}>
                                            {isCredit ? <ArrowDownToLine className="w-3 h-3 mr-1" /> : <ArrowUpToLine className="w-3 h-3 mr-1" />}
                                            {row.note_type}
                                        </span>
                                    </td>
                                    <td className="text-right w-[140px] pr-8 font-mono font-black text-black text-lg tracking-tight">
                                        ₹{(Number(row.amount) || 0).toLocaleString()}
                                    </td>
                                    <td className="pl-4 text-left text-slate-500 font-mono text-sm">
                                        {row.invoice?.contact_bill_no || row.invoice?.bill_no ? `#${row.invoice.contact_bill_no || row.invoice.bill_no}` : '-'}
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
                                                    <Link href={`/credit-notes/${row.id}`} className="flex items-center w-full cursor-pointer hover:bg-slate-50 focus:bg-slate-50 rounded-lg m-1 font-bold">
                                                        <FileText className="w-4 h-4 mr-2 text-blue-600" /> View Details
                                                    </Link>
                                                </DropdownMenuItem>

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
