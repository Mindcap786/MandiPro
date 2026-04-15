"use client";

import { QRCodeSVG } from "qrcode.react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X, QrCode, Package, User, Calendar, Hash } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export interface LotQRData {
    lotId: string;
    lotCode: string;
    qrNumber: string; // The distinct 6-digit code payload
    orgId: string;
    arrivalType: "direct" | "commission" | "commission_supplier";
    itemName: string;
    qty: number;
    unit: string;
    partyName?: string;
    date: string; // ISO date string
}

interface LotQRSlipProps {
    lots: LotQRData[];
    open: boolean;
    onClose: () => void;
}

function generateQRString(lot: LotQRData): string {
    return lot.qrNumber; // The raw 6-digit number is the payload now
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
    direct: { label: "Direct Purchase", color: "#1A56DB" },
    commission: { label: "Farmer Commission", color: "#0E9F6E" },
    commission_supplier: { label: "Supplier Commission", color: "#9061F9" },
};

function SingleLotSlip({ lot }: { lot: LotQRData }) {
    const qrString = generateQRString(lot);
    
    return (
        <div className="lot-qr-slip bg-white rounded-2xl p-4 flex gap-5 mb-4 shadow-sm w-full max-w-sm border border-gray-200 mx-auto">
            {/* Left: QR + Number inside a card */}
            <div className="flex-shrink-0 bg-white border border-gray-200 rounded-xl p-3 flex flex-col items-center justify-center min-w-[120px]">
                <QRCodeSVG value={qrString} size={100} level="Q" includeMargin={false} />
                <div className="text-black font-black text-lg tracking-widest mt-2">{lot.qrNumber}</div>
            </div>

            {/* Right: Details */}
            <div className="flex-1 flex flex-col justify-between py-1">
                {/* Item */}
                <div>
                    <div className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-0.5">Item</div>
                    <div className="text-2xl font-black text-slate-900 leading-none">{lot.itemName}</div>
                </div>

                {/* Quantity + Party row */}
                <div className="flex gap-6 mt-3">
                    <div>
                        <div className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-0.5">Quantity</div>
                        <div className="text-xl font-black text-slate-900">{parseInt(lot.qty as any)} <span className="text-sm font-bold text-gray-500">{lot.unit}</span></div>
                    </div>
                    {lot.partyName && (
                        <div>
                            <div className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-0.5">Party</div>
                            <div className="text-xl font-black text-slate-900 truncate max-w-[120px]">{lot.partyName}</div>
                        </div>
                    )}
                </div>

                {/* Date */}
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-bold mt-4">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {lot.date}
                </div>
            </div>
        </div>
    );
}

export default function LotQRSlip({ lots, open, onClose }: LotQRSlipProps) {
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        const printContents = printRef.current?.innerHTML ?? "";
        const win = window.open("", "_blank", "width=700,height=900");
        if (!win) return;
        win.document.write(`
            <html>
            <head>
                <title>Arrival QR Slips</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #fff; padding: 16px; }
                    .print-container { display: flex; flex-direction: column; align-items: center; gap: 16px; }
                    @media print {
                        body { background: transparent; padding: 0; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
                        .lot-qr-slip { page-break-inside: avoid; margin-bottom: 16px; width: 380px !important; }
                    }
                </style>
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body>
                <div class="print-container">
                    ${printContents}
                </div>
            </body>
            </html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 1500); // Wait for Tailwind to load
    };

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="h-9 w-9 bg-indigo-600 rounded-xl flex items-center justify-center">
                                <QrCode className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-black">Arrival QR Slips</DialogTitle>
                                <p className="text-xs text-gray-500 font-bold">{lots.length} Lot{lots.length !== 1 ? "s" : ""} • Scan in POS to sell</p>
                            </div>
                        </div>
                        <Button onClick={handlePrint} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-9">
                            <Printer className="w-4 h-4" />
                            Print All
                        </Button>
                    </div>
                </DialogHeader>

                <div ref={printRef} className="space-y-4 pt-2">
                    {lots.map(lot => (
                        <SingleLotSlip key={lot.lotId} lot={lot} />
                    ))}
                </div>

                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">How to use</p>
                    <p className="text-xs text-amber-600 font-bold mt-1">
                        In POS, scan this QR code with your barcode scanner (or type the code). The entire lot will appear in the cart ready for sale.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export { generateQRString };
