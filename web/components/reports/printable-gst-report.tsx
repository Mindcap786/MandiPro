import React from 'react';
import { DocumentWatermark } from '@/components/common/document-branding';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

interface PrintableGSTReportProps {
    sales: any[];
    hsnData: any[];
    summary: {
        totalTaxable: number;
        totalIgst: number;
        totalCgst: number;
        totalSgst: number;
        totalTax: number;
        b2bCount: number;
        b2cCount: number;
    };
    dateRange: { from: string; to: string };
    organizationName?: string;
    branding?: any;
}

export const PrintableGSTReport = React.forwardRef<HTMLDivElement, PrintableGSTReportProps>(
    ({ sales, hsnData, summary, dateRange, organizationName, branding }, ref) => {
        const b2bSales = sales.filter(s => s.buyer_gstin || s.contact?.gstin);
        const b2cSales = sales.filter(s => !s.buyer_gstin && !s.contact?.gstin);

        return (
            <div id="gst-report-print" ref={ref} className="bg-white p-8 w-full min-h-screen text-black relative overflow-hidden" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                <DocumentWatermark
                    text={branding?.watermark_text}
                    enabled={branding?.is_watermark_enabled}
                />

                {/* Header */}
                <div className="flex flex-col items-center mb-6 border-b-2 border-black pb-4 relative z-10">
                    <h1 className="text-2xl font-black uppercase tracking-tight mb-1">
                        {organizationName || 'MandiGrow Organization'}
                    </h1>
                    <h2 className="text-lg font-bold text-slate-600 uppercase tracking-widest">
                        GST Compliance Report (GSTR-1)
                    </h2>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                        Period: {dateRange.from} to {dateRange.to}
                    </p>
                    <p className="text-xs font-medium text-slate-400 mt-1">
                        Generated on {new Date().toLocaleDateString('en-IN', {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                        })}
                    </p>
                </div>

                {/* Tax Summary */}
                <div className="relative z-10 mb-6">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-slate-100">
                                <th className="border border-slate-300 px-3 py-2 text-left font-black uppercase text-xs tracking-wider text-slate-700">Tax Summary</th>
                                <th className="border border-slate-300 px-3 py-2 text-right font-black uppercase text-xs tracking-wider text-slate-700">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="border border-slate-200 px-3 py-2 font-bold text-slate-700">Total Taxable Value</td>
                                <td className="border border-slate-200 px-3 py-2 text-right font-black text-slate-900">{formatCurrency(summary.totalTaxable)}</td>
                            </tr>
                            <tr>
                                <td className="border border-slate-200 px-3 py-2 font-bold text-slate-700">Integrated Tax (IGST)</td>
                                <td className="border border-slate-200 px-3 py-2 text-right font-black text-indigo-700">{formatCurrency(summary.totalIgst)}</td>
                            </tr>
                            <tr>
                                <td className="border border-slate-200 px-3 py-2 font-bold text-slate-700">Central Tax (CGST)</td>
                                <td className="border border-slate-200 px-3 py-2 text-right font-black text-emerald-700">{formatCurrency(summary.totalCgst)}</td>
                            </tr>
                            <tr>
                                <td className="border border-slate-200 px-3 py-2 font-bold text-slate-700">State/UT Tax (SGST)</td>
                                <td className="border border-slate-200 px-3 py-2 text-right font-black text-amber-700">{formatCurrency(summary.totalSgst)}</td>
                            </tr>
                            <tr className="bg-slate-50">
                                <td className="border border-slate-300 px-3 py-2 font-black text-slate-900 uppercase">Total Tax Liability</td>
                                <td className="border border-slate-300 px-3 py-2 text-right font-[1000] text-lg text-rose-700">{formatCurrency(summary.totalTax)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="flex gap-4 mt-2 text-xs font-bold text-slate-500">
                        <span>B2B Invoices: {summary.b2bCount}</span>
                        <span>B2C Invoices: {summary.b2cCount}</span>
                        <span>Total: {summary.b2bCount + summary.b2cCount}</span>
                    </div>
                </div>

                {/* B2B Invoices */}
                {b2bSales.length > 0 && (
                    <div className="relative z-10 mb-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-2 border-b border-slate-300 pb-1">
                            B2B Invoices (Table 4A)
                        </h3>
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100">
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">No.</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">GSTIN</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">Party Name</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">Invoice No</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">Date</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">Invoice Value</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">Taxable</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">IGST</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">CGST</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">SGST</th>
                                </tr>
                            </thead>
                            <tbody>
                                {b2bSales.map((sale, idx) => (
                                    <tr key={sale.id} className="print:break-inside-avoid">
                                        <td className="border border-slate-200 px-2 py-1 text-slate-500">{idx + 1}</td>
                                        <td className="border border-slate-200 px-2 py-1 font-bold text-slate-800 uppercase">{sale.buyer_gstin || sale.contact?.gstin}</td>
                                        <td className="border border-slate-200 px-2 py-1 font-bold text-slate-700">{sale.contact?.name || '-'}</td>
                                        <td className="border border-slate-200 px-2 py-1 font-black text-slate-900">{sale.bill_no}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-slate-600">{new Date(sale.sale_date).toLocaleDateString('en-IN')}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-black text-slate-900">{formatCurrency(Number(sale.total_amount_inc_tax || sale.total_amount) || 0)}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-bold text-slate-800">{formatCurrency(Number(sale.total_amount) || 0)}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-bold text-indigo-700">{formatCurrency(Number(sale.igst_amount) || 0)}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-bold text-emerald-700">{formatCurrency(Number(sale.cgst_amount) || 0)}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-bold text-amber-700">{formatCurrency(Number(sale.sgst_amount) || 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* B2C Invoices */}
                {b2cSales.length > 0 && (
                    <div className="relative z-10 mb-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-2 border-b border-slate-300 pb-1">
                            B2C Invoices (Table 7)
                        </h3>
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100">
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">No.</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">Party Name</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">Invoice No</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">Date</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">Invoice Value</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">Taxable</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">Tax</th>
                                </tr>
                            </thead>
                            <tbody>
                                {b2cSales.map((sale, idx) => (
                                    <tr key={sale.id} className="print:break-inside-avoid">
                                        <td className="border border-slate-200 px-2 py-1 text-slate-500">{idx + 1}</td>
                                        <td className="border border-slate-200 px-2 py-1 font-bold text-slate-700">{sale.contact?.name || 'Cash Customer'}</td>
                                        <td className="border border-slate-200 px-2 py-1 font-black text-slate-900">{sale.bill_no}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-slate-600">{new Date(sale.sale_date).toLocaleDateString('en-IN')}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-black text-slate-900">{formatCurrency(Number(sale.total_amount_inc_tax || sale.total_amount) || 0)}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-bold text-slate-800">{formatCurrency(Number(sale.total_amount) || 0)}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-bold text-emerald-700">{formatCurrency((Number(sale.igst_amount) || 0) + (Number(sale.cgst_amount) || 0) + (Number(sale.sgst_amount) || 0))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* HSN Summary */}
                {hsnData.length > 0 && (
                    <div className="relative z-10 mb-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-2 border-b border-slate-300 pb-1">
                            HSN-wise Summary (Table 12)
                        </h3>
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100">
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">No.</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">HSN Code</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-left font-black uppercase tracking-wider text-slate-600">UOM</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">GST Rate</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">Qty</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">Taxable Value</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">IGST</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">CGST</th>
                                    <th className="border border-slate-300 px-2 py-1.5 text-right font-black uppercase tracking-wider text-slate-600">SGST</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hsnData.map((hsn, idx) => (
                                    <tr key={idx} className="print:break-inside-avoid">
                                        <td className="border border-slate-200 px-2 py-1 text-slate-500">{idx + 1}</td>
                                        <td className="border border-slate-200 px-2 py-1 font-black text-slate-900">{hsn.hsn_code}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-slate-600">{hsn.unit || 'PCS'}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-bold text-slate-800">{hsn.gst_rate}%</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-bold text-slate-800">{hsn.quantity?.toLocaleString?.() || 0}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-black text-slate-900">{formatCurrency(hsn.taxable_value || 0)}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-bold text-indigo-700">{formatCurrency(hsn.igst || 0)}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-bold text-emerald-700">{formatCurrency(hsn.cgst || 0)}</td>
                                        <td className="border border-slate-200 px-2 py-1 text-right font-bold text-amber-700">{formatCurrency(hsn.sgst || 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Footer */}
                <div className="mt-12 pt-6 border-t border-slate-300 flex justify-between items-end break-inside-avoid relative z-10">
                    <div className="text-[10px] font-black uppercase text-slate-400 flex flex-col gap-1 tracking-widest">
                        <span>{branding?.document_footer_presented_by_text || 'Presented by MandiGrow'}</span>
                        <span className="text-slate-900 border-t border-slate-100 mt-1 pt-1">{branding?.document_footer_powered_by_text || 'Powered by MindT Corporation'}</span>
                        <span className="text-[8px] font-bold text-slate-300 italic">{branding?.document_footer_developed_by_text || 'Developed by MindT Solutions'}</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-48 border-b border-slate-300"></div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-600">Authorized Signatory</p>
                    </div>
                </div>
            </div>
        );
    }
);

PrintableGSTReport.displayName = "PrintableGSTReport";
