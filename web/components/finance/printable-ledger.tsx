import React from 'react';
import { toWords } from '@/lib/number-to-words';

// Actually, I should use the local helper to be safe as utils might not have it or have issue
const formatCurrencyLocal = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
    }).format(amount);
};

import { DocumentWatermark } from '@/components/common/document-branding';

interface PrintableLedgerProps {
    data: any[];
    partyName: string;
    organization?: any;
    organizationName?: string;
    startDate: Date;
    endDate: Date;
    openingBalance: number;
    closingBalance: number;
    branding?: any;
}

export const PrintableLedger = React.forwardRef<HTMLDivElement, PrintableLedgerProps>(
    ({ data, partyName, organization, organizationName, startDate, endDate, openingBalance, closingBalance, branding }, ref) => {

        const fullAddress = [
            organization?.address_line1,
            organization?.address_line2,
            organization?.city,
            organization?.state,
            organization?.pincode
        ].filter(Boolean).join(", ");

        return (
            <div ref={ref} className="hidden print:block bg-white p-8 w-full min-h-screen text-black relative overflow-hidden">
                {/* Global Watermark */}
                <DocumentWatermark 
                    text={branding?.watermark_text} 
                    enabled={branding?.is_watermark_enabled} 
                />

                {/* Header */}
                <div className="flex justify-between items-start mb-8 border-b-2 border-black pb-6 relative z-10">
                    <div className="flex items-center gap-6">
                        {organization?.logo_url && (
                            <img src={organization.logo_url} alt="Logo" className="w-16 h-16 object-contain" />
                        )}
                        <div className="flex flex-col">
                            <h1 className="text-3xl font-black uppercase tracking-tight">
                                {organization?.name || organizationName || 'MandiGrow Organization'}
                            </h1>
                            <p className="text-sm font-bold text-slate-500 uppercase">{fullAddress}</p>
                            {organization?.gstin && <p className="text-xs font-black text-slate-400 mt-1 uppercase">GSTIN: {organization.gstin}</p>}
                        </div>
                    </div>
                    <div className="text-right">
                        <h2 className="text-xl font-[1000] text-black uppercase tracking-widest bg-black text-white px-3 py-1 mb-2">
                            Statement
                        </h2>
                        <p className="text-xs font-bold text-slate-400">
                            {startDate.toLocaleDateString('en-IN')} - {endDate.toLocaleDateString('en-IN')}
                        </p>
                    </div>
                </div>

                {/* Party Details */}
                <div className="mb-8 p-4 border border-slate-300 rounded-xl bg-slate-50 relative z-10">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Account Of</p>
                    <p className="text-2xl font-black text-slate-800">{partyName}</p>
                </div>

                {/* Transactions Table */}
                <div className="relative z-10">
                    <table className="w-full text-left text-sm mb-8 table-fixed">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="pb-2 font-black uppercase text-xs tracking-widest text-slate-600 w-[12%] text-left">Date</th>
                                <th className="pb-2 font-black uppercase text-xs tracking-widest text-slate-600 w-[43%] text-left">Particulars</th>
                                <th className="pb-2 font-black uppercase text-xs tracking-widest text-slate-600 w-[15%] text-right">Debit (Out)</th>
                                <th className="pb-2 font-black uppercase text-xs tracking-widest text-slate-600 w-[15%] text-right">Credit (In)</th>
                                <th className="pb-2 font-black uppercase text-xs tracking-widest text-slate-600 w-[15%] text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Opening Balance Row */}
                            <tr className="border-b border-slate-100 bg-amber-50/50 print:bg-transparent">
                                <td className="py-2 text-slate-500 font-medium">{startDate.toLocaleDateString('en-IN')}</td>
                                <td className="py-2 font-bold text-slate-800">Opening Balance</td>
                                <td className="py-2 text-right font-bold text-slate-600 tabular-nums text-[11px]">
                                    {openingBalance > 0 ? formatCurrencyLocal(Math.abs(openingBalance)) : '-'}
                                </td>
                                <td className="py-2 text-right font-bold text-slate-600 tabular-nums text-[11px]">
                                    {openingBalance < 0 ? formatCurrencyLocal(Math.abs(openingBalance)) : '-'}
                                </td>
                                <td className="py-2 text-right font-bold text-slate-700 tabular-nums text-[11px]">
                                    {formatCurrencyLocal(Math.abs(openingBalance))} {openingBalance >= 0 ? 'DR' : 'CR'}
                                </td>
                            </tr>

                            {(() => {
                                let currentBalance = openingBalance;
                                return data.map((item, index) => {
                                    const debit = Number(item.debit || 0);
                                    const credit = Number(item.credit || 0);
                                    currentBalance += (debit - credit);

                                    return (
                                        <tr key={item.id || index} className="border-b border-slate-100 print:break-inside-avoid">
                                            <td className="py-2 text-slate-500 font-medium">
                                                {(() => { try { const d = new Date(item.date || item.created_at); return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN'); } catch { return '-'; } })()}
                                            </td>
                                            <td className="py-2 font-medium text-slate-800">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="font-bold">{item.narration || item.description || item.particulars}</div>
                                                    {(item.lot_no || item.bill_no || item.invoice_no) && (
                                                        <div className="flex gap-2 text-[9px] font-black uppercase text-blue-600/70 tracking-tighter">
                                                            {item.lot_no && <span>Lot: {item.lot_no}</span>}
                                                            {(item.bill_no || item.invoice_no) && <span>Bill: {item.bill_no || item.invoice_no}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                                {item.products && item.products.length > 0 && (
                                                    <div className="mt-1 flex flex-col gap-0 text-[10px] text-slate-500 pl-2 border-l border-slate-300">
                                                        {item.products.map((p: any, idx: number) => (
                                                            <div key={idx}>
                                                                • {p.name} - {parseFloat(p.qty)} {p.unit} @ {parseFloat(p.rate).toFixed(2)}
                                                                {(p.lot_no) && <span className="ml-1 text-[8px] font-bold text-slate-400">(LOT: {p.lot_no})</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-2 text-right tabular-nums text-[11px]">
                                                {item.debit ? <span className="font-black text-rose-700">{formatCurrencyLocal(item.debit)}</span> : <span className="text-slate-300">-</span>}
                                            </td>
                                            <td className="py-2 text-right tabular-nums text-[11px]">
                                                {item.credit ? <span className="font-black text-emerald-700">{formatCurrencyLocal(item.credit)}</span> : <span className="text-slate-300">-</span>}
                                            </td>
                                            <td className="py-2 text-right font-[1000] text-slate-900 tabular-nums text-[11px]">
                                                {formatCurrencyLocal(Math.abs(currentBalance))} <span className="text-[9px] text-slate-500 ml-0.5">{currentBalance >= 0 ? 'DR' : 'CR'}</span>
                                            </td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-black bg-slate-50 print:bg-transparent">
                                <td colSpan={3} className="py-3 font-black text-right uppercase tracking-widest text-slate-700 pr-4">Closing Balance:</td>
                                <td colSpan={2} className={`py-3 text-right font-[1000] text-lg ${closingBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    {formatCurrencyLocal(Math.abs(closingBalance))} {closingBalance >= 0 ? 'DR' : 'CR'}
                                </td>
                            </tr>
                            <tr className="border-t border-slate-200">
                                <td colSpan={5} className="py-2 text-right">
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-2">Amount in Words:</span>
                                    <span className="text-xs font-bold text-slate-600 italic">Rupees {toWords(Math.abs(closingBalance))}</span>
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

PrintableLedger.displayName = "PrintableLedger";
