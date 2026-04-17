import { format } from 'date-fns';
import { DocumentWatermark } from '@/components/common/document-branding';

interface ReceiptProps {
    data: {
        buyerName: string
        amount: number
        paymentMode: string
        date: Date
        receiptNo: string
        invoiceNo?: string
        remarks?: string
    };
    branding?: any;
}

export function ReceiptTemplate({ data, branding }: ReceiptProps) {
    return (
        <div className="bg-white text-black p-8 max-w-2xl mx-auto shadow-2xl rounded-sm relative overflow-hidden" id="receipt-print">
            {/* Global Watermark */}
            <DocumentWatermark 
                text={branding?.watermark_text} 
                enabled={branding?.is_watermark_enabled} 
            />

            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-6 relative z-10">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tighter text-emerald-600 uppercase">
                        {branding?.document_header_text || 'MandiGrow'}
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">Official Payment Receipt</p>
                </div>
                <div className="text-right">
                    <h2 className="text-2xl font-bold uppercase tracking-widest text-gray-400">Receipt</h2>
                    <p className="text-sm font-mono mt-1 text-gray-500">#{data.receiptNo}</p>
                    <p className="text-sm text-gray-500">{format(data.date, 'dd MMM yyyy, hh:mm a')}</p>
                </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-8 mb-8 relative z-10">
                <div>
                    <h3 className="text-xs uppercase font-bold text-gray-400 mb-1">Received From</h3>
                    <p className="text-lg font-bold">{data.buyerName}</p>
                </div>
                <div className="text-right">
                    <h3 className="text-xs uppercase font-bold text-gray-400 mb-1">Payment Mode</h3>
                    <p className="text-lg font-bold capitalize">{data.paymentMode}</p>
                </div>
            </div>

            {/* Amount Box */}
            <div className="bg-gray-100 p-6 rounded-lg border-2 border-gray-200 mb-8 flex justify-between items-center relative z-10">
                <div>
                    <p className="text-sm text-gray-500 uppercase tracking-wide">Amount Received</p>
                    <p className="text-3xl font-bold text-green-600">₹{data.amount.toLocaleString()}</p>
                </div>
                {data.invoiceNo && (
                    <div className="text-right">
                        <p className="text-xs text-gray-400 uppercase">Against Invoice</p>
                        <p className="font-mono font-bold text-gray-700">{data.invoiceNo}</p>
                    </div>
                )}
            </div>

            {/* Remarks */}
            {data.remarks && (
                <div className="mb-12 relative z-10">
                    <h3 className="text-xs uppercase font-bold text-gray-400 mb-2">Remarks</h3>
                    <p className="text-sm text-gray-700 italic border-l-4 border-gray-300 pl-4 py-1">"{data.remarks}"</p>
                </div>
            )}

            {/* Footer / Signature */}
            <div className="flex justify-between items-end mt-12 pt-8 border-t border-gray-200 relative z-10">
                <div className="text-[10px] font-black uppercase text-slate-400 flex flex-col gap-1 tracking-widest">
                    <span>{branding?.document_footer_presented_by_text || 'Presented by MandiGrow'}</span>
                    <span className="text-slate-900 border-t border-slate-100 mt-1 pt-1">{branding?.document_footer_powered_by_text || 'Powered by MindT Corporation'}</span>
                    <span className="text-[8px] font-bold text-slate-300 italic">{branding?.document_footer_developed_by_text || 'Developed by MindT Solutions'}</span>
                </div>
                <div className="text-center">
                    <div className="h-12 border-b border-gray-400 mb-2 w-32 mx-auto"></div>
                    <p className="text-xs font-bold uppercase text-gray-500">Authorized Signature</p>
                </div>
            </div>
        </div>
    )
}
