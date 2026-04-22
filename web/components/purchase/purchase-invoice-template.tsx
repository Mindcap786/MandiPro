"use client"

import { format } from "date-fns"
import { toWords } from "@/lib/number-to-words"
import { usePlatformBranding } from "@/hooks/use-platform-branding"
import { DocumentWatermark } from "@/components/common/document-branding"
import { formatCommodityName } from "@/lib/utils/commodity-utils"
import {
    calculateLotSettlementAmount,
    calculateLotGrossValue,
    calculateArrivalLevelExpenses,
    getArrivalType,
} from "@/lib/purchase-payables"
import { Check } from "lucide-react"

interface PurchaseInvoiceTemplateProps {
    lot: any
    arrival: any
    organization: any
    arrivalLots?: any[]  // All lots in same arrival — for expense share calc
}

const toNumber = (v: any) => Number(v) || 0;

export default function PurchaseBillInvoice({
    lot,
    arrival,
    organization,
    arrivalLots = [],
}: PurchaseInvoiceTemplateProps) {
    const { branding } = usePlatformBranding();

    if (!lot) return null

    // ── Data extraction ──────────────────────────────────────────
    const farmerName = lot.farmer?.name || lot.contact?.name || 'Unknown Supplier'
    const farmerCity = lot.farmer?.city || lot.contact?.city || ''
    const itemName = formatCommodityName(lot.item?.name, lot.custom_attributes || lot.item?.custom_attributes)
    const lotCode = arrival?.lot_prefix || lot.lot_code || 'N/A'
    const unit = lot.unit || 'Unit'

    const billNo = arrival?.bill_no || lot.lot_code || 'N/A'
    const referenceNo = arrival?.reference_no || arrival?.contact_bill_no || ''
    const vehicleNo = arrival?.vehicle_number || ''
    const vehicleType = arrival?.vehicle_type || ''
    const arrivalDate = arrival?.arrival_date || lot.created_at
    const arrivalType = arrival?.arrival_type || getArrivalType(lot)
    const arrivalTypeLabel = arrivalType === 'direct' ? 'Mandi Owned (Direct)' :
        arrivalType === 'commission' || arrivalType === 'farmer' ? 'Farmer Arrival (Commission)' :
            'Supplier Arrival (Commission)'

    const paymentMode = arrival?.payment_mode || lot.payment_mode || 'udhaar'

    // ── Financial calculations (Aggregated across all lots) ──────
    const lotsToProcess = arrivalLots.length > 0 ? arrivalLots : [lot];
    
    let totalGrossQty = 0;
    let totalNetGoodsValue = 0;
    let totalCommission = 0;
    let totalLotExpenses = 0;
    let totalAdvance = 0;
    let totalPaidAmount = 0;
    let totalOtherCharges = 0;
    let totalArrivalExpenseShare = 0;

    lotsToProcess.forEach(l => {
        const isSettled = !!l.settlement_at;
        const gQty = toNumber(l.gross_quantity) || toNumber(l.initial_qty);
        const nQty = gQty - ((gQty * toNumber(l.less_percent) / 100) + toNumber(l.less_units));
        const goodsVal = isSettled 
            ? toNumber(l.settlement_goods_value) 
            : nQty * toNumber(l.supplier_rate);
        
        totalGrossQty += gQty;
        totalNetGoodsValue += goodsVal;
        totalCommission += isSettled ? toNumber(l.settlement_commission) : (goodsVal * toNumber(l.commission_percent)) / 100;
        totalLotExpenses += isSettled ? toNumber(l.settlement_expenses) : (toNumber(l.packing_cost) + toNumber(l.loading_cost));
        totalAdvance += toNumber(l.advance);
        totalPaidAmount += toNumber(l.paid_amount);
        totalOtherCharges += toNumber(l.other_charges || 0);
        totalArrivalExpenseShare += toNumber(l.farmer_charges || 0);
    });

    const finalPayable = Math.max(0, totalNetGoodsValue - totalCommission - totalLotExpenses - totalAdvance - totalPaidAmount - totalOtherCharges - totalArrivalExpenseShare)

    // Organization address
    const fullAddress = [
        organization?.address_line1,
        organization?.address_line2,
        organization?.city,
        organization?.state,
        organization?.pincode
    ].filter(Boolean).join(", ")

    const formattedDate = (() => {
        try { return arrivalDate ? format(new Date(arrivalDate), 'dd MMM yyyy') : '-'; }
        catch { return '-'; }
    })()

    return (
        <div id="purchase-invoice-print" className="bg-white text-black p-6 max-w-[800px] mx-auto shadow-2xl border border-gray-100 print:shadow-none print:border-none print:p-0 relative overflow-hidden">

            {/* Global Watermark */}
            <DocumentWatermark
                text={branding?.watermark_text}
                enabled={branding?.is_watermark_enabled}
            />

            {/* ───── Header ───── */}
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
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-900 max-w-[250px] leading-relaxed">
                            {fullAddress || 'Market Yard, Sector 4, Fruit Market'}
                        </p>
                        {organization?.settings?.mandi_license && (
                            <p className="text-[9px] font-black uppercase text-slate-500 mt-1">
                                License: {organization.settings.mandi_license}
                            </p>
                        )}
                    </div>
                </div>

                {/* Center: Title */}
                <div className="self-center flex flex-col items-center text-center print:w-1/3 print:shrink-0">
                    <h2
                        data-invoice-title
                        className="text-2xl font-black uppercase tracking-[0.2em] leading-[1.08] text-black"
                    >
                        Purchase
                    </h2>
                    <h2 className="text-2xl font-black uppercase tracking-[0.2em] leading-[1.08] text-black -mt-1">
                        Bill
                    </h2>
                    <div className="h-1 w-12 bg-black mx-auto mt-2 rounded-full" />
                </div>

                {/* Right: Contact Details */}
                <div className="text-right space-y-0.5 print:w-1/3 print:flex print:flex-col print:items-end">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Contact Details</p>
                    <div className="space-y-0 text-xs font-black">
                        <p>Ph: {organization?.phone || '+91 98765 43210'}</p>
                        {organization?.gstin && <p className="italic">GST: {organization.gstin}</p>}
                        {organization?.email && (
                            <p className="text-[10px] lowercase border-t border-gray-100 pt-0.5 mt-0.5">{organization.email}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* ───── Parties & Bill Details ───── */}
            <div className="py-2 grid grid-cols-2 gap-8 border-b border-gray-100 mb-2 relative z-10 print:flex print:w-full print:justify-between">
                {/* Left: Purchased From */}
                <div className="space-y-1 print:w-1/2">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Purchased From</p>
                    <h3 className="text-2xl font-black tracking-tight">{farmerName}</h3>
                    <p className="text-gray-500 font-bold uppercase text-xs tracking-widest">{farmerCity || 'Local'}</p>
                    <p className="text-[9px] font-black uppercase text-purple-600 tracking-widest mt-1 bg-purple-50 inline-block px-2 py-0.5 rounded">
                        {arrivalTypeLabel}
                    </p>
                </div>

                {/* Right: Bill Details */}
                <div className="text-right space-y-0.5 text-xs self-end print:w-1/2 print:flex print:flex-col print:items-end">
                    <div className="flex justify-end gap-2 items-center">
                        <span className="text-gray-400 font-bold uppercase">Invoice No:</span>
                        <span className="font-black">#{billNo}</span>
                        {isSettled && (
                            <span className="ml-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-[8px] font-black rounded uppercase flex items-center gap-0.5">
                                <Check className="w-2 h-2" />
                                Settled
                            </span>
                        )}
                    </div>
                    <div className="flex justify-end gap-2">
                        <span className="text-gray-400 font-bold uppercase">Date:</span>
                        <span className="font-black">{formattedDate}</span>
                    </div>
                    {lotCode && lotCode !== 'N/A' && (
                        <div className="flex justify-end gap-2 items-center">
                            <span className="text-gray-400 font-bold uppercase">Lot No:</span>
                            <span className="font-black text-white bg-slate-900 px-2 py-0.5 rounded text-[13px] tracking-widest">{lotCode}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ───── Items Table ───── */}
            <div className="relative z-10">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b-2 border-black">
                            <th className="py-2 text-[10px] font-black uppercase tracking-[0.2em] text-black text-left">Item Details</th>
                            <th className="py-2 text-[10px] font-black uppercase tracking-[0.2em] text-black text-center">Net Qty</th>
                            <th className="py-2 text-[10px] font-black uppercase tracking-[0.2em] text-black text-right">Rate</th>
                            <th className="py-2 text-[10px] font-black uppercase tracking-[0.2em] text-black text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {lotsToProcess.map((l: any) => {
                            const lGrossQty = toNumber(l.gross_quantity) || toNumber(l.initial_qty);
                            const lNetQty = lGrossQty - ((lGrossQty * toNumber(l.less_percent) / 100) + toNumber(l.less_units));
                            const lIsSettled = !!l.settlement_at;
                            const lGoodsVal = lIsSettled 
                                ? toNumber(l.settlement_goods_value) 
                                : lNetQty * toNumber(l.supplier_rate);

                            return (
                                <tr key={l.id}>
                                    <td className="py-2">
                                        <p className="font-black text-xs tracking-tight uppercase leading-none">
                                            {formatCommodityName(l.item?.name || lot.item?.name, l.custom_attributes || l.item?.custom_attributes || lot.custom_attributes)}
                                        </p>
                                        {l.lot_code && (
                                            <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wider">
                                                Lot: {l.lot_code}
                                            </p>
                                        )}
                                    </td>
                                    <td className="py-2 text-center font-bold text-sm tracking-tighter">
                                        {Math.round(lNetQty * 100) / 100} <span className="text-[11px] text-gray-500 font-bold ml-0.5 uppercase tracking-tight">{l.unit || unit}</span>
                                    </td>
                                    <td className="py-2 text-right font-bold text-sm tracking-tighter">
                                        ₹{toNumber(l.supplier_rate).toLocaleString()}
                                    </td>
                                    <td className="py-2 text-right font-black text-sm tracking-tighter">
                                        ₹{Math.round(lGoodsVal).toLocaleString()}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ───── Settlement Breakdown ───── */}
            <div className="mt-6 grid grid-cols-2 gap-8 items-start relative z-10">

                {/* Left Side: Transport & Payment Info */}
                <div className="space-y-4">
                    {/* Payment Details Card */}
                    <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block border-b border-slate-200 pb-1">
                            Payment & Settlement
                        </span>
                        <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1.5 text-[10px]">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Mode of Pay</span>
                            <span className="font-black text-blue-600 uppercase text-[10px] tracking-tight">
                                {(totalAdvance + totalPaidAmount) <= 0 ? 'UDHAAR (CREDIT)' : (paymentMode === 'credit' || paymentMode === 'udhaar' ? 'CREDIT (UDHAAR)' : paymentMode)}
                            </span>
                            
                            {totalAdvance > 0 && (
                                <>
                                    <span className="text-gray-400 font-bold uppercase">Paid Amount</span>
                                    <span className="font-black text-emerald-700">₹{totalAdvance.toLocaleString()}</span>
                                </>
                            )}

                            {arrival?.advance_bank_name && (
                                <>
                                    <span className="text-gray-400 font-bold uppercase">Bank Info</span>
                                    <span className="font-black text-gray-800 uppercase">{arrival.advance_bank_name}</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Transport Details Card */}
                    {(vehicleNo || arrival?.driver_name || arrival?.guarantor) && (
                        <div className="space-y-2 px-3">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block border-b border-gray-100 pb-1">
                                Transport Details
                            </span>
                            <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5 text-[10px]">
                                {vehicleNo && (
                                    <>
                                        <span className="text-gray-400 font-bold uppercase">Vehicle</span>
                                        <span className="font-black text-gray-800 tracking-wider">{vehicleNo}</span>
                                    </>
                                )}
                                {arrival?.driver_name && (
                                    <>
                                        <span className="text-gray-400 font-bold uppercase">Driver</span>
                                        <span className="font-black text-gray-800">{arrival.driver_name}</span>
                                    </>
                                )}
                                {arrival?.guarantor && (
                                    <>
                                        <span className="text-gray-400 font-bold uppercase">Guarantor</span>
                                        <span className="font-black text-gray-800">{arrival.guarantor}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Side: Totals & Settlement */}
                <div className="space-y-6">
                    <div className="space-y-1.5 border-t-2 border-black pt-4">
                        {/* Net Goods Value */}
                        <div className="flex justify-between items-center text-xs mb-2">
                            <span className="font-black text-slate-800 uppercase">Net Goods Value</span>
                            <span className="font-black text-slate-800">₹{Math.round(totalNetGoodsValue).toLocaleString()}</span>
                        </div>

                        {/* Commission — only for commission types */}
                        {totalCommission > 0.01 && (
                            <div className="flex justify-between items-center text-xs border-t border-gray-100 pt-1">
                                <span className="font-bold text-purple-600 uppercase">
                                    Commission
                                </span>
                                <span className="font-bold text-purple-600">
                                    − ₹{Math.round(totalCommission).toLocaleString()}
                                </span>
                            </div>
                        )}

                        {/* Other Charges */}
                        {totalOtherCharges > 0 && (
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-400 font-bold uppercase tracking-widest">Other Charges</span>
                                <span className="font-bold text-red-500">− ₹{Math.round(totalOtherCharges).toLocaleString()}</span>
                            </div>
                        )}

                        {/* Loading/Packing Cost + Arrival Expenses */}
                        {(totalLotExpenses > 0) || totalArrivalExpenseShare > 0.01 ? (
                            <div className="flex justify-between items-center text-xs border-t border-gray-100 pt-1">
                                <span className="text-gray-400 font-bold uppercase tracking-widest">Expenses / Transport</span>
                                <span className="font-bold text-red-500">− ₹{Math.round(totalLotExpenses + totalArrivalExpenseShare).toLocaleString()}</span>
                            </div>
                        ) : null}

                        {/* Advance Paid */}
                        {totalAdvance > 0 && (
                            <div className="flex justify-between items-center text-xs border-t border-gray-100 pt-1">
                                <span className="text-emerald-600 font-bold uppercase tracking-widest">Paid (Advance)</span>
                                <span className="font-bold text-emerald-600">
                                    − ₹{Math.round(totalAdvance).toLocaleString()}
                                </span>
                            </div>
                        )}

                        {/* Other Payments */}
                        {totalPaidAmount > 0 && (
                            <div className="flex justify-between items-center text-xs border-t border-gray-100 pt-1">
                                <span className="text-emerald-600 font-bold uppercase tracking-widest">Other Payments</span>
                                <span className="font-bold text-emerald-600">
                                    − ₹{Math.round(totalPaidAmount).toLocaleString()}
                                </span>
                            </div>
                        )}

                        {/* ── FINAL PAYABLE ── */}
                        <div className="flex justify-between items-center pt-3 border-t-[3px] border-black mt-4 bg-slate-50 px-2 py-2 rounded-lg">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">
                                Total Payable
                            </span>
                            <span className="text-3xl font-black tracking-tighter tabular-nums text-black">
                                ₹{Math.round(finalPayable).toLocaleString()}
                            </span>
                        </div>

                        {/* Amount in Words */}
                        <div className="text-right mt-3">
                            <p className="text-xs font-black text-slate-900 italic uppercase leading-tight">
                                Rupees {toWords(Math.round(finalPayable))} Only
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ───── Footer ───── */}
            <div className="mt-12 pt-6 border-t border-black grid grid-cols-2 relative z-10">
                <div className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">
                    <p>Farmer / Supplier Signature</p>
                    <div className="mt-6 h-px w-32 bg-gray-200" />
                </div>
                <div className="text-right text-[10px] font-black text-gray-400 flex flex-col items-end gap-1 uppercase tracking-widest">
                    <span>{branding?.document_footer_presented_by_text || 'Presented by MandiGrow'}</span>
                    <span className="text-gray-900 border-t border-gray-100 mt-1 pt-1">
                        {branding?.document_footer_powered_by_text || 'Powered by MindT Corporation'}
                    </span>
                    <span className="text-[8px] font-bold text-gray-300 italic">
                        {branding?.document_footer_developed_by_text || 'Developed by MindT Solutions'}
                    </span>
                </div>
            </div>

            <style jsx>{`
                @media print {
                    @page { margin: 0; }
                    body { background: white; }
                    #purchase-invoice-print { width: 100%; max-width: none; border: none; shadow: none; }
                    .no-print { display: none !important; }
                }
            `}</style>
        </div>
    )
}
