"use client"

import { format } from "date-fns"
import { IndianRupee, History } from "lucide-react"
import { AdjustmentDialog } from "./adjustment-dialog"
import { toWords } from "@/lib/number-to-words"
import { QRCodeSVG } from "qrcode.react"
import { usePlatformBranding } from "@/hooks/use-platform-branding"
import { DocumentWatermark } from "@/components/common/document-branding"

interface InvoiceTemplateProps {
    sale: any
    organization: any
    onRefresh?: () => void
}

export default function BuyerInvoice({ sale, organization, onRefresh }: InvoiceTemplateProps) {
    const { branding } = usePlatformBranding();

    if (!sale) return null

    const displayBillNo = sale.contact_bill_no || sale.bill_no || 'N/A';
    const items = sale.sale_items || [];
    const subtotal = sale.total_amount || items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const totalGst = (Number(sale.cgst_amount || sale.cgst || 0) + Number(sale.sgst_amount || sale.sgst || 0) + Number(sale.igst_amount || sale.igst || 0))
    const totalInvoiceAmount = (
        subtotal +
        Number(sale.market_fee || 0) +
        Number(sale.nirashrit || 0) +
        Number(sale.misc_fee || 0) +
        Number(sale.loading_charges || 0) +
        Number(sale.unloading_charges || 0) +
        Number(sale.other_expenses || 0) +
        totalGst
    );
 
    const totalQty = items.reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0)
    const avgRate = totalQty > 0 ? (subtotal / totalQty) : 0
    const isCreditSale = sale.payment_mode === 'credit' || !sale.payment_mode;

    // ── Single source of truth for received amount ────────────────────────────
    // IMPORTANT: get_invoice_balance RPC returns the field as `amount_paid`.
    //            The direct mandi.sales DB column is `amount_received`.
    //            Always chain both so we never show ₹0 when payment exists.
    const amountReceived = Number(
        sale.amount_received
        ?? sale.payment_summary?.amount_received
        ?? sale.payment_summary?.amount_paid // field name used by get_invoice_balance RPC
        ?? 0
    );
    const balanceDue = Math.max(0, totalInvoiceAmount - amountReceived);
    // ─────────────────────────────────────────────────────────────────────────

    const fullAddress = [
        organization?.address_line1,
        organization?.address_line2,
        organization?.city,
        organization?.state,
        organization?.pincode
    ].filter(Boolean).join(", ");

    return (
        <div id="invoice-print" className="bg-white text-black p-6 max-w-[800px] mx-auto shadow-2xl border border-gray-100 print:shadow-none print:border-none print:p-0 relative overflow-hidden">
            
            {/* Global Watermark */}
            <DocumentWatermark 
                text={branding?.watermark_text} 
                enabled={branding?.is_watermark_enabled} 
            />

            {/* Header */}
            <div className="grid grid-cols-[minmax(0,1.35fr)_auto_minmax(180px,1fr)] gap-6 items-start border-b-4 border-black pb-3 mb-3 relative z-10 print:flex print:w-full print:justify-between">
                {/* Left: Identity */}
                <div className="flex items-start gap-4 min-w-0 print:w-1/3">
                    {organization?.logo_url ? (
                        <img src={organization.logo_url} alt="Logo" className="h-20 w-auto object-contain" style={{ borderRadius: 12 }} />
                    ) : (
                        <div
                            className="h-16 w-16 bg-black flex items-center justify-center shrink-0"
                            style={{ borderRadius: 12, width: 64, height: 64, minWidth: 64, background: '#000' }}
                        >
                            <span className="text-white text-3xl font-black" style={{ color: '#fff', fontSize: 28, fontWeight: 900 }}>
                                {(organization?.name || 'M').charAt(0).toUpperCase()}
                            </span>
                        </div>
                    )}
                    <div className="space-y-1 min-w-0">
                        <p
                            data-invoice-org-name
                            className="text-black text-[29px] font-black tracking-tight uppercase leading-[1.12] break-words"
                        >
                            {organization?.name || 'Mandi HQ Enterprise'}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-900 max-w-[250px] leading-relaxed">{fullAddress || 'Market Yard, Sector 4, Fruit Market'}</p>
                        {organization?.settings?.mandi_license && <p className="text-[9px] font-black uppercase text-slate-500 mt-1">License: {organization.settings.mandi_license}</p>}
                    </div>
                </div>

                {/* Center: Title */}
                <div className="self-center flex flex-col items-center text-center print:w-1/3 print:shrink-0">
                    <h2
                        data-invoice-title
                        className="text-3xl font-black uppercase tracking-[0.28em] leading-[1.08] text-black"
                    >
                        Invoice
                    </h2>
                    <div className="h-1 w-12 bg-black mx-auto mt-2 rounded-full" />
                </div>

                {/* Right: Contact Details */}
                <div className="text-right space-y-0.5 print:w-1/3 print:flex print:flex-col print:items-end">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Contact Details</p>
                    <div className="space-y-0 text-xs font-black">
                        <p>Ph: {organization?.phone || '+91 98765 43210'}</p>
                        {organization?.gstin && <p className="italic">GST: {organization.gstin}</p>}
                        {organization?.email && <p className="text-[10px] lowercase border-t border-gray-100 pt-0.5 mt-0.5">{organization.email}</p>}
                    </div>
                </div>
            </div>

            {/* Parties & Invoice Details Consolidated */}
            <div className="py-2 grid grid-cols-2 gap-8 border-b border-gray-100 mb-2 relative z-10 print:flex print:w-full print:justify-between">
                {/* Left: Billed To */}
                <div className="space-y-1 print:w-1/2">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Billed To</p>
                    <h3 className="text-2xl font-black tracking-tight">{sale.contact?.name || 'Walk-in Buyer'}</h3>
                    <p className="text-gray-500 font-bold uppercase text-xs tracking-widest">{sale.contact?.city || 'Local'}</p>
                    {sale.contact?.gstin && <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">GSTIN: {sale.contact.gstin}</p>}
                </div>

                {/* Right: Invoice Details */}
                <div className="text-right space-y-0.5 text-xs self-end print:w-1/2 print:flex print:flex-col print:items-end">
                    <div className="flex justify-end gap-2">
                        <span className="text-gray-400 font-bold uppercase">Invoice No:</span>
                        <span className="font-black">#INV-{displayBillNo}</span>
                    </div>
                    {sale.lot_no && (
                        <div className="flex justify-end gap-2">
                            <span className="text-gray-400 font-bold uppercase">Lot No:</span>
                            <span className="font-black">{sale.lot_no}</span>
                        </div>
                    )}
                    {sale.vehicle_number && (
                        <div className="flex justify-end gap-2">
                            <span className="text-gray-400 font-bold uppercase">Vehicle No:</span>
                            <span className="font-black uppercase">{sale.vehicle_number}</span>
                        </div>
                    )}
                    {sale.book_no && (
                        <div className="flex justify-end gap-2">
                            <span className="text-gray-400 font-bold uppercase">Ref/Book:</span>
                            <span className="font-black uppercase">{sale.book_no}</span>
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <span className="text-gray-400 font-bold uppercase">Date:</span>
                        <span className="font-black">
                            {(() => {
                                try {
                                    return sale.sale_date ? format(new Date(sale.sale_date), 'dd MMM yyyy') : '-';
                                } catch (e) {
                                    return '-';
                                }
                            })()}
                        </span>
                    </div>
                    <div className="flex justify-end gap-2">
                        <span className="text-gray-400 font-bold uppercase">Payment Mode:</span>
                        <span className="font-black uppercase">{sale.payment_mode || 'Credit'}</span>
                    </div>
                    {(sale.payment_mode === 'credit' || !sale.payment_mode) && sale.due_date && (
                        <div className="flex justify-end gap-2">
                            <span className="text-red-400 font-bold uppercase">Due Date:</span>
                            <span className="font-black text-red-600">
                                {(() => {
                                    try {
                                        return format(new Date(sale.due_date), 'dd MMM yyyy');
                                    } catch (e) {
                                        return '-';
                                    }
                                })()}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="relative z-10">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b-2 border-black">
                            <th className="py-2 text-[10px] font-black uppercase tracking-[0.2em] text-black text-left">Item / Lot</th>
                            <th className="py-2 text-[10px] font-black uppercase tracking-[0.2em] text-black text-center">Qty</th>
                            <th className="py-2 text-[10px] font-black uppercase tracking-[0.2em] text-black text-right">Rate</th>
                            <th className="py-2 text-[10px] font-black uppercase tracking-[0.2em] text-black text-right">Amount</th>
                            <th className="py-2 w-10 no-print"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {items.map((item: any) => (
                            <tr key={item.id} className="group">
                                <td className="py-0.5">
                                    <p className="font-black text-xs tracking-tight uppercase leading-none">{item.lot?.item?.name || item.item_name || 'Item'}</p>
                                    <div className="flex flex-col gap-0 mt-0">
                                        <p className="text-[8px] font-black text-orange-600 tracking-tighter uppercase tabular-nums">
                                            {item.lot?.lot_code || 'N/A'}
                                        </p>
                                        <p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest opacity-70">
                                            {(item.lot?.variety || item.variety || '')} {(item.lot?.grade || item.grade) && `• ${(item.lot?.grade || item.grade)}`}
                                        </p>
                                    </div>
                                </td>
                                <td className="py-0.5 text-center font-bold text-sm tracking-tighter">{item.qty || 0} <span className="text-[7px] text-gray-400 font-normal">{item.unit || 'Unit'}</span></td>
                                <td className="py-0.5 text-right font-bold text-sm tracking-tighter">₹{Number(item.rate || 0).toLocaleString()}</td>
                                <td className="py-0.5 text-right font-black text-sm tracking-tighter">₹{Math.round(Number(item.amount || 0)).toLocaleString()}</td>
                                <td className="py-1 pl-4 no-print text-right opacity-50 hover:opacity-100 transition-opacity">
                                    <AdjustmentDialog saleItem={item} onRefresh={onRefresh!} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Bottom Section: Payment (Left) and Totals (Right) */}
            <div className="mt-6 grid grid-cols-2 gap-8 items-start relative z-10">
                
                {/* Left Side: Payment Details */}
                <div className="space-y-4">
                    {(organization?.settings?.payment?.print_upi_qr || organization?.settings?.payment?.print_bank_details) && (
                        <div className="py-4 border-t border-gray-100 flex flex-col gap-4">
                            {/* UPI QR Code for Pending Balance */}
                            {(organization?.settings?.payment?.print_upi_qr && organization?.settings?.payment?.upi_id) && (() => {
                                // Use top-level normalised variable (RCA fix)
                                if (balanceDue <= 0) return null;

                                return (
                                    <div className="flex flex-col items-center gap-1.5 p-2 bg-gray-50 rounded-xl border border-gray-100 w-fit">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-orange-500 italic">Scan to Pay</span>
                                        <QRCodeSVG
                                            value={`upi://pay?pa=${organization.settings.payment.upi_id}&pn=${encodeURIComponent(organization.settings.payment.upi_name || organization.name)}&am=${balanceDue}&cu=INR`}
                                            size={90}
                                            level="H"
                                            includeMargin={true}
                                        />
                                        <div className="flex flex-col items-center -mt-1">
                                            <span className="text-[8px] font-black text-gray-900 uppercase">Pending Amount</span>
                                            <span className="text-[10px] font-black text-black">₹{balanceDue.toLocaleString()}</span>
                                        </div>
                                        <span className="text-[7px] font-bold text-gray-400">{organization.settings.payment.upi_id}</span>
                                    </div>
                                );
                            })()}

                            {/* Bank Details */}
                            {organization?.settings?.payment?.print_bank_details && organization?.settings?.payment?.account_number && (
                                <div className="space-y-2">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block border-b border-gray-100 pb-1">Bank Account Details</span>
                                    <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5 text-[10px]">
                                        <span className="text-gray-400 font-bold uppercase">Bank</span>
                                        <span className="font-black text-gray-800">{organization.settings.payment.bank_name}</span>

                                        <span className="text-gray-400 font-bold uppercase">A/C No</span>
                                        <span className="font-black text-gray-800 font-mono">{organization.settings.payment.account_number}</span>

                                        <span className="text-gray-400 font-bold uppercase">IFSC</span>
                                        <span className="font-black text-gray-800 font-mono">{organization.settings.payment.ifsc_code}</span>

                                        <span className="text-gray-400 font-bold uppercase">Holder</span>
                                        <span className="font-black text-gray-800 uppercase">{organization.settings.payment.account_holder || organization.name}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Side: Indices & Totals */}
                <div className="space-y-6">
                    {/* Totals Section */}
                    <div className="space-y-1.5 border-t-2 border-black pt-4">
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-gray-500 uppercase">Sub Total</span>
                            <span className="font-bold">₹{subtotal.toLocaleString()}</span>
                        </div>
                        {/* GST Breakdown - individual lines for compliance */}
                        {Number(sale.cgst_amount || 0) > 0 && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-400 font-bold uppercase tracking-widest">CGST ({sale.cgst_rate || ''}%)</span>
                                <span className="font-bold">₹{Number(sale.cgst_amount).toLocaleString()}</span>
                            </div>
                        )}
                        {Number(sale.sgst_amount || 0) > 0 && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-400 font-bold uppercase tracking-widest">SGST ({sale.sgst_rate || ''}%)</span>
                                <span className="font-bold">₹{Number(sale.sgst_amount).toLocaleString()}</span>
                            </div>
                        )}
                        {Number(sale.igst_amount || 0) > 0 && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-400 font-bold uppercase tracking-widest">IGST ({sale.igst_rate || ''}%)</span>
                                <span className="font-bold">₹{Number(sale.igst_amount).toLocaleString()}</span>
                            </div>
                        )}
                        {/* Legacy fallback: if only gst_total stored without breakdown */}
                        {totalGst === 0 && Number(sale.gst_total || 0) > 0 && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-400 font-bold uppercase tracking-widest">GST</span>
                                <span className="font-bold">₹{Number(sale.gst_total).toLocaleString()}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-xs border-t border-gray-100 pt-2">
                            <span className="text-gray-400 font-bold uppercase tracking-widest">Total Qty</span>
                            <span className="font-bold">{totalQty} Units</span>
                        </div>
                        {/* Audit Trail */}
                        {(() => {
                            const netAdjustments = sale.sale_adjustments?.reduce((sum: number, adj: any) => {
                                const oldAmt = (Number(adj.old_qty) || 0) * (Number(adj.old_value) || 0);
                                const newAmt = (Number(adj.new_qty) || 0) * (Number(adj.new_value) || 0);
                                return sum + (newAmt - oldAmt);
                            }, 0) || 0;

                            if (netAdjustments !== 0) {
                                return (
                                    <div className="py-1 border-y border-dashed border-gray-100 space-y-0.5">
                                        <div className="flex justify-between items-center text-[10px] text-gray-400 tracking-tight">
                                            <span>Original Amount</span>
                                            <span className="line-through">₹{(subtotal - netAdjustments).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] font-bold text-orange-500 tracking-tight">
                                            <span>Adjustments Application</span>
                                            <span>{netAdjustments > 0 ? '+' : ''}₹{netAdjustments.toLocaleString()}</span>
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        {(Number(sale.market_fee) > 0) && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-gray-500 uppercase">Market Fee</span>
                                <span className="font-bold">+ ₹{Number(sale.market_fee).toLocaleString()}</span>
                            </div>
                        )}

                        {(Number(sale.nirashrit) > 0) && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-gray-500 uppercase">Nirashrit</span>
                                <span className="font-bold">+ ₹{Number(sale.nirashrit).toLocaleString()}</span>
                            </div>
                        )}

                        {(Number(sale.loading_charges || 0) > 0) && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-slate-500 uppercase">Loading Charges</span>
                                <span className="font-bold text-slate-700">+ ₹{Number(sale.loading_charges).toLocaleString()}</span>
                            </div>
                        )}

                        {(Number(sale.unloading_charges || 0) > 0) && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-slate-500 uppercase">Unloading Charges</span>
                                <span className="font-bold text-slate-700">+ ₹{Number(sale.unloading_charges).toLocaleString()}</span>
                            </div>
                        )}

                        {(Number(sale.misc_fee || 0) > 0) && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-slate-500 uppercase">Misc Fee</span>
                                <span className="font-bold text-slate-700">+ ₹{Number(sale.misc_fee).toLocaleString()}</span>
                            </div>
                        )}

                        {(Number(sale.other_expenses || 0) > 0) && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-slate-500 uppercase">Other Expenses</span>
                                <span className="font-bold text-slate-700">+ ₹{Number(sale.other_expenses).toLocaleString()}</span>
                            </div>
                        )}

                        <div className="flex justify-between items-center pt-2 border-t border-black mt-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Invoice Total</span>
                            <span className="text-2xl font-black tracking-tighter tabular-nums text-black">₹{totalInvoiceAmount.toLocaleString()}</span>
                        </div>

                        {/* Amount Received / Balance Details */}
                        <div className="pt-1.5 space-y-1">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-400 font-bold uppercase tracking-widest">Amount Received</span>
                                <span className="font-black text-emerald-600">₹{amountReceived.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="text-right mt-4">
                            <p className="text-[9px] font-bold text-gray-400 italic uppercase leading-none">Rupees {toWords(totalInvoiceAmount)} Only</p>
                        </div>

                        {/* Status Badge */}
                        {/* Payment Status Badge — uses top-level amountReceived / balanceDue (RCA fix) */}
                        <div className={`mt-2 p-1.5 rounded flex justify-between items-center ${balanceDue > 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${balanceDue > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                {balanceDue > 0 ? "Pending Payment" : "Paid Full"}
                            </span>
                            <span className={`text-xl font-black tracking-tighter ${balanceDue > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                ₹{balanceDue > 0 ? balanceDue.toLocaleString() : "0"}
                            </span>
                        </div>
                        
                        <div className="mt-2 pt-2 border-t border-gray-100 flex justify-end">
                            <div className="inline-block bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-xl text-right">
                                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400 block mb-0.5">Avg Price / Qty</span>
                                <span className="text-base font-black tracking-tighter">₹{avgRate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Adjustments History */}
            {sale.sale_adjustments && sale.sale_adjustments.length > 0 && (
                <div className="mt-12 pt-8 border-t border-gray-100 no-print relative z-10">
                    <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-orange-400 mb-4">
                        <History className="w-4 h-4" /> Adjustment History
                    </h4>
                    <div className="space-y-2">
                        {sale.sale_adjustments.map((adj: any) => {
                            const oldAmt = (Number(adj.old_qty) || 0) * (Number(adj.old_value) || 0);
                            const newAmt = (Number(adj.new_qty) || 0) * (Number(adj.new_value) || 0);
                            const delta = newAmt - oldAmt;

                            return (
                                <div key={adj.id} className="flex justify-between text-xs bg-orange-50 p-2 rounded border border-orange-100">
                                    <div>
                                        <span className="font-bold text-gray-700">Audit {adj.old_qty !== adj.new_qty ? 'Qty' : 'Rate'}</span>
                                        <span className="mx-2 text-gray-400">|</span>
                                        <span className="text-gray-500">
                                            {adj.old_qty !== adj.new_qty && `Qty: ${adj.old_qty} → ${adj.new_qty}`}
                                            {adj.old_qty !== adj.new_qty && adj.old_value !== adj.new_value && ' • '}
                                            {adj.old_value !== adj.new_value && `Rate: ${adj.old_value} → ${adj.new_value}`}
                                        </span>
                                        <span className="mx-2 text-gray-400">|</span>
                                        <span className="italic text-gray-500">"{adj.reason || 'No reason provided'}"</span>
                                    </div>
                                    <div className="font-mono font-bold text-orange-600">
                                        {delta > 0 ? '+' : ''}₹{delta.toLocaleString()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="mt-12 pt-6 border-t border-black grid grid-cols-2 relative z-10">
                <div className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">
                    <p>Signature & Stamp</p>
                    <div className="mt-6 h-px w-32 bg-gray-200" />
                </div>
                <div className="text-right text-[10px] font-black text-gray-400 flex flex-col items-end gap-1 uppercase tracking-widest">
                    <span>{branding?.document_footer_presented_by_text || 'Presented by MandiGrow'}</span>
                    <span className="text-gray-900 border-t border-gray-100 mt-1 pt-1">{branding?.document_footer_powered_by_text || 'Powered by MindT Corporation'}</span>
                    <span className="text-[8px] font-bold text-gray-300 italic">{branding?.document_footer_developed_by_text || 'Developed by MindT Solutions'}</span>
                </div>
            </div>

            <style jsx>{`
                @media print {
                    @page { margin: 0; }
                    body { background: white; }
                    #invoice-print { width: 100%; max-width: none; border: none; shadow: none; }
                    .no-print { display: none !important; }
                }
            `}</style>
        </div>
    )
}
