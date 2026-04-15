
import React from 'react';
import { toWords } from '@/lib/number-to-words';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

import { DocumentWatermark } from '@/components/common/document-branding';

interface PrintableFinancialReportProps {
    data: any[];
    filterType: string;
    subFilter: string;
    organizationName?: string;
    branding?: any;
}

export const PrintableFinancialReport = React.forwardRef<HTMLDivElement, PrintableFinancialReportProps>(
    ({ data, filterType, subFilter, organizationName, branding }, ref) => {

        // Calculate Totals
        const totalReceivable = data
            .filter((item: any) => Number(item.net_balance) > 0)
            .reduce((sum: number, item: any) => sum + Number(item.net_balance), 0);

        const totalPayable = data
            .filter((item: any) => Number(item.net_balance) < 0)
            .reduce((sum: number, item: any) => sum + Math.abs(Number(item.net_balance)), 0);

        const netTotal = totalReceivable - totalPayable;

        const title = filterType === 'all'
            ? 'Consolidated Financial Statement'
            : `${filterType.charAt(0).toUpperCase() + filterType.slice(1)} Balances`;

        return (

            <div id="finance-report-print" ref={ref} className="hidden print:block bg-white p-8 w-full min-h-screen text-black relative overflow-hidden">
                {/* Global Watermark */}
                <DocumentWatermark 
                    text={branding?.watermark_text} 
                    enabled={branding?.is_watermark_enabled} 
                />

                {/* Header */}
                <div className="flex flex-col items-center mb-8 border-b-2 border-black pb-4 relative z-10">
                    <h1 className="text-3xl font-black uppercase tracking-tight mb-2">
                        {organizationName || 'MandiGrow Organization'}
                    </h1>
                    <h2 className="text-xl font-bold text-slate-600 uppercase tracking-widest">
                        {title}
                    </h2>
                    <p className="text-sm font-medium text-slate-400 mt-1">
                        Generated on {new Date().toLocaleDateString('en-IN', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-8 mb-8 relative z-10">
                    {(filterType === 'all' || filterType === 'buyer' || totalReceivable > 0) && (
                        <div className={`border border-slate-300 p-4 rounded-xl flex flex-col items-center bg-slate-50 ${filterType !== 'all' && totalPayable === 0 ? 'col-span-2' : ''}`}>
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Total Receivable</span>
                            <span className="text-2xl font-[1000] text-emerald-700">
                                {formatCurrency(totalReceivable)}
                            </span>
                        </div>
                    )}
                    {(filterType === 'all' || filterType === 'farmer' || filterType === 'supplier' || totalPayable > 0) && (
                        <div className={`border border-slate-300 p-4 rounded-xl flex flex-col items-center bg-slate-50 ${filterType !== 'all' && totalReceivable === 0 ? 'col-span-2' : ''}`}>
                            <span className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Total Payable</span>
                            <span className="text-2xl font-[1000] text-rose-700">
                                {formatCurrency(totalPayable)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Data Table */}
                <div className="relative z-10">
                    <table className="w-full text-left text-sm whitespace-nowrap mb-8">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="pb-2 font-black uppercase text-xs tracking-widest text-slate-600 w-[5%]">No.</th>
                                <th className="pb-2 font-black uppercase text-xs tracking-widest text-slate-600 w-[35%]">Party Name</th>
                                <th className="pb-2 font-black uppercase text-xs tracking-widest text-slate-600 w-[15%]">City</th>
                                <th className="pb-2 font-black uppercase text-xs tracking-widest text-slate-600 w-[15%]">Phone</th>
                                <th className="pb-2 font-black uppercase text-xs tracking-widest text-slate-600 w-[10%]">Type</th>
                                <th className="pb-2 font-black uppercase text-xs tracking-widest text-slate-600 text-right w-[20%]">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((item, index) => {
                                const balance = Number(item.net_balance);
                                const isReceivable = balance > 0;
                                return (
                                    <tr key={item.contact_id || index} className="border-b border-slate-100 print:break-inside-avoid">
                                        <td className="py-2 text-slate-500 font-medium">{index + 1}</td>
                                        <td className="py-2 font-bold text-slate-800">{item.contact_name}</td>
                                        <td className="py-2 text-slate-600">{item.contact_city || item.city || '-'}</td>
                                        <td className="py-2 text-slate-600 font-mono text-xs">{item.phone || '-'}</td>
                                        <td className="py-2 text-xs font-bold uppercase text-slate-400">{item.contact_type}</td>
                                        <td className={`py-2 text-right font-black ${isReceivable ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            {formatCurrency(Math.abs(balance))} {isReceivable ? 'DR' : 'CR'}
                                        </td>
                                    </tr>
                                );
                            })}
                            {data.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-slate-400 italic">No records found for this selection.</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-slate-300 bg-slate-50 print:bg-transparent">
                                <td colSpan={5} className="py-3 font-black text-right uppercase tracking-widest text-slate-700 pr-4">Total Outstanding Balance:</td>
                                <td className={`py-3 text-right font-[1000] text-lg ${netTotal > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    {formatCurrency(Math.abs(netTotal))} {netTotal > 0 ? 'DR' : 'CR'}
                                </td>
                            </tr>
                            <tr className="border-t border-slate-200">
                                <td colSpan={6} className="py-2 text-right">
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-2">Amount in Words:</span>
                                    <span className="text-xs font-bold text-slate-600 italic">Rupees {toWords(Math.abs(netTotal))}</span>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Footer Signature */}
                <div className="mt-16 pt-8 border-t border-slate-300 flex justify-between items-end break-inside-avoid page-break-after-always relative z-10">
                    <div className="text-[10px] font-black uppercase text-slate-400 flex flex-col gap-1 tracking-widest">
                        <span>{branding?.document_footer_presented_by_text || 'Presented by MandiGrow'}</span>
                        <span className="text-slate-900 border-t border-slate-100 mt-1 pt-1">{branding?.document_footer_powered_by_text || 'Powered by MindT Corporation'}</span>
                        <span className="text-[8px] font-bold text-slate-300 italic">{branding?.document_footer_developed_by_text || 'Developed by MindT Solutions'}</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-48 border-b border-slate-300"></div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-600">Accountant Signature</p>
                    </div>
                </div>
            </div>
        );
    }
);

PrintableFinancialReport.displayName = "PrintableFinancialReport";
