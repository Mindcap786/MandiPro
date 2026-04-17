'use client'

import { useState } from 'react'
import { Printer, CheckCircle, Search, Wallet, Landmark, Share2, Loader2 } from 'lucide-react'
import { Switch } from "@/components/ui/switch"
import { isNativePlatform } from '@/lib/capacitor-utils'
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper"
import { Button } from "@/components/ui/button"
import { ReceiptTemplate } from '@/components/billing/receipt-template'

/**
 * Receipt Generator — MANUAL PRINT ONLY.
 *
 * This screen is a pure front-end print helper. It does NOT write to the
 * database, it does NOT create vouchers, it does NOT touch the ledger,
 * P&L, day book or any financial record. The buyer name is a free-text
 * field — type anything, print, move on. Real cash/bank receipts that
 * should affect the books are recorded from Day Book / Vouchers, not here.
 */
export default function ReceiptGenerator() {
    // Core fields — all local state, no DB reads or writes.
    const [buyerName, setBuyerName] = useState<string>('')
    const [amount, setAmount] = useState<string>('')
    const [paymentMode, setPaymentMode] = useState('cash')
    const [remarks, setRemarks] = useState('')
    const [generating, setGenerating] = useState(false)
    const [generatedReceipt, setGeneratedReceipt] = useState<
        { receipt_number: string; created_at: string } | null
    >(null)

    // Cheque-specific fields — purely for printing on the receipt.
    const [chequeNo, setChequeNo] = useState('')
    const [bankName, setBankName] = useState('')
    const [chequeDate, setChequeDate] = useState<string>('')
    const [instantClear, setInstantClear] = useState(false)

    const receiptData = {
        buyerName: buyerName.trim() || 'Customer',
        amount: parseFloat(amount) || 0,
        paymentMode,
        date: new Date(),
        receiptNo:
            generatedReceipt?.receipt_number ||
            `RCPT-${Math.floor(1000 + Math.random() * 9000)}`,
        remarks,
    }

    function generateReceipt() {
        if (!buyerName.trim() || !amount) return
        setGenerating(true)
        // Brief UX delay — no network, no DB.
        setTimeout(() => {
            setGeneratedReceipt({
                receipt_number: `RCPT-${Math.floor(1000 + Math.random() * 9000)}`,
                created_at: new Date().toISOString(),
            })
            setGenerating(false)
        }, 250)
    }

    function resetForm() {
        setGeneratedReceipt(null)
        setBuyerName('')
        setAmount('')
        setRemarks('')
        setChequeNo('')
        setBankName('')
        setChequeDate('')
        setInstantClear(false)
    }

    // ─────────────────────────────────────────────────────────────
    // MOBILE (Capacitor / native wrapper)
    // ─────────────────────────────────────────────────────────────
    if (isNativePlatform()) {
        const handleShare = async () => {
            if (!generatedReceipt) return
            const text = `Receipt: ${receiptData.receiptNo}\nParty: ${receiptData.buyerName}\nAmount: ₹${receiptData.amount}\nMode: ${receiptData.paymentMode}\nRemarks: ${receiptData.remarks}`

            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Payment Receipt',
                        text,
                        url: window.location.href,
                    })
                } catch (err) {
                    console.error('Share failed:', err)
                }
            } else {
                alert('Sharing not supported on this browser. Details copied to clipboard.')
                navigator.clipboard.writeText(text)
            }
        }

        return (
            <NativePageWrapper>
                <div className="space-y-6 px-4 pb-10">
                    {generatedReceipt ? (
                        <div className="flex flex-col items-center py-10 space-y-6 animate-in zoom-in-95 duration-300">
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                                <CheckCircle className="w-10 h-10 text-green-600" />
                            </div>
                            <div className="text-center space-y-1">
                                <h2 className="text-2xl font-black text-gray-900">Receipt Ready!</h2>
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                    Print-only · Not saved to books
                                </p>
                                <p className="text-sm font-bold text-gray-500">
                                    #{generatedReceipt.receipt_number}
                                </p>
                            </div>

                            <div className="w-full bg-gray-50 rounded-2xl p-6 border border-gray-100 space-y-4">
                                <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    <span>Party</span>
                                    <span className="text-gray-900">{receiptData.buyerName}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    <span>Amount</span>
                                    <span className="text-green-600">
                                        ₹{receiptData.amount.toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    <span>Mode</span>
                                    <span className="capitalize">{receiptData.paymentMode}</span>
                                </div>
                            </div>

                            <div className="w-full space-y-3">
                                <Button
                                    onClick={handleShare}
                                    className="w-full bg-blue-600 text-white font-black rounded-xl h-14 uppercase text-xs tracking-widest shadow-lg shadow-blue-200"
                                >
                                    <Share2 className="w-4 h-4 mr-2" /> Share Receipt
                                </Button>
                                <Button
                                    onClick={resetForm}
                                    variant="outline"
                                    className="w-full border-gray-200 text-gray-700 font-black rounded-xl h-14 uppercase text-xs tracking-widest"
                                >
                                    Generate New
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                    Buyer Name
                                </label>
                                <input
                                    type="text"
                                    className="w-full bg-white border border-gray-200 rounded-xl p-4 text-sm font-bold shadow-sm"
                                    placeholder="Type any buyer name"
                                    value={buyerName}
                                    onChange={(e) => setBuyerName(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                    Amount (₹)
                                </label>
                                <input
                                    type="number"
                                    className="w-full bg-white border border-gray-200 rounded-xl p-4 text-lg font-black shadow-sm"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                    Payment Mode
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['cash', 'upi_bank', 'cheque'].map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => setPaymentMode(mode)}
                                            className={`py-3 px-1 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                                paymentMode === mode
                                                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                                    : 'bg-white text-gray-400 border-gray-200'
                                            }`}
                                        >
                                            {mode === 'upi_bank' ? 'UPI' : mode}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                    Remarks
                                </label>
                                <input
                                    type="text"
                                    className="w-full bg-white border border-gray-200 rounded-xl p-4 text-sm font-bold"
                                    placeholder="e.g. Invoice #101"
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                />
                            </div>

                            <Button
                                onClick={generateReceipt}
                                disabled={generating || !buyerName.trim() || !amount}
                                className="w-full bg-slate-900 text-white font-black rounded-2xl h-16 uppercase text-sm tracking-widest shadow-xl mt-4"
                            >
                                {generating ? <Loader2 className="animate-spin" /> : 'Generate Receipt'}
                            </Button>

                            <p className="text-[10px] font-black text-center text-gray-400 uppercase tracking-widest pt-2">
                                Manual print only · No ledger · No P&amp;L impact
                            </p>
                        </div>
                    )}
                </div>
            </NativePageWrapper>
        )
    }

    // ─────────────────────────────────────────────────────────────
    // DESKTOP
    // ─────────────────────────────────────────────────────────────
    return (
        <div className="p-8 bg-slate-50 min-h-screen text-slate-900 print:bg-white print:p-0 print:min-h-0">
            <header className="flex justify-between items-center mb-8 print:hidden">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-1">
                        Receipt Generator
                    </h1>
                    <p className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                        Manual print receipts · Not saved to books · No ledger / P&amp;L impact
                    </p>
                </div>
                {generatedReceipt && (
                    <div className="flex space-x-4">
                        <button
                            onClick={() => window.print()}
                            className="flex items-center px-4 py-2 bg-white hover:bg-slate-50 rounded-lg transition-colors border border-slate-300 shadow-sm text-slate-700 font-bold"
                        >
                            <Printer className="w-4 h-4 mr-2" />
                            Print Receipt
                        </button>
                        <button
                            onClick={resetForm}
                            className="flex items-center px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-md"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            New Receipt
                        </button>
                    </div>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 print:block">
                {/* Form */}
                <div
                    className={`lg:col-span-4 space-y-6 print:hidden ${
                        generatedReceipt ? 'opacity-50 pointer-events-none' : ''
                    }`}
                >
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-xl">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-700 mb-2">
                                Buyer Name
                            </label>
                            <input
                                type="text"
                                className="w-full bg-white border border-slate-300 rounded-lg p-3 text-black focus:border-blue-500 focus:outline-none font-bold"
                                placeholder="Type any buyer name"
                                value={buyerName}
                                onChange={(e) => setBuyerName(e.target.value)}
                            />
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">
                                Free text · Not linked to contacts
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-700 mb-2">
                                Amount (₹)
                            </label>
                            <input
                                type="number"
                                className="w-full bg-white border border-slate-300 rounded-lg p-3 text-black focus:border-blue-500 focus:outline-none font-black text-xl font-mono"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-700 mb-2">
                                Payment Mode
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {['cash', 'upi_bank', 'cheque'].map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setPaymentMode(mode)}
                                        className={`py-2 px-3 rounded-lg text-sm font-black uppercase tracking-widest border transition-all ${
                                            paymentMode === mode
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        {mode === 'upi_bank' ? 'UPI / BANK' : mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {paymentMode === 'cheque' && (
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-2 gap-3">
                                <div className="col-span-2 flex items-center justify-between pb-2 border-b border-slate-200/60 mb-1">
                                    <div className="flex items-center gap-2">
                                        <Landmark className="w-4 h-4 text-slate-400" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            Cheque Details
                                        </span>
                                    </div>
                                    <label
                                        className={`flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-full border transition-all duration-200 ${
                                            instantClear
                                                ? 'bg-emerald-100 border-emerald-500 shadow-sm shadow-emerald-200'
                                                : 'bg-white border-slate-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span
                                            className={`text-[10px] font-black uppercase tracking-wider ${
                                                instantClear ? 'text-emerald-800' : 'text-slate-600'
                                            }`}
                                        >
                                            {instantClear ? 'Cleared' : 'Pending'}
                                        </span>
                                        <Switch
                                            checked={instantClear}
                                            onCheckedChange={setInstantClear}
                                            className="data-[state=checked]:bg-emerald-600 shadow-sm"
                                        />
                                    </label>
                                </div>

                                <div className="col-span-1">
                                    <label className="uppercase text-[9px] font-black text-slate-500 tracking-widest mb-1 block">
                                        Cheque No
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-black font-bold text-xs focus:border-blue-500 focus:outline-none"
                                        placeholder="000123"
                                        value={chequeNo}
                                        onChange={(e) => setChequeNo(e.target.value)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="uppercase text-[9px] font-black text-slate-500 tracking-widest mb-1 block">
                                        Bank Name
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-black font-bold text-xs focus:border-blue-500 focus:outline-none"
                                        placeholder="e.g. SBI, HDFC"
                                        value={bankName}
                                        onChange={(e) => setBankName(e.target.value)}
                                    />
                                </div>
                                {!instantClear && (
                                    <div className="col-span-2">
                                        <label className="uppercase text-[9px] font-black text-slate-500 tracking-widest mb-1 block">
                                            Expected Clearing Date
                                        </label>
                                        <input
                                            type="date"
                                            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-black font-bold text-xs focus:border-blue-500 focus:outline-none"
                                            value={chequeDate}
                                            onChange={(e) => setChequeDate(e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-700 mb-2">
                                Remarks
                            </label>
                            <input
                                type="text"
                                className="w-full bg-white border border-slate-300 rounded-lg p-3 text-black focus:border-blue-500 focus:outline-none font-medium"
                                placeholder="e.g. Against invoice #101"
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={generateReceipt}
                            disabled={generating || !buyerName.trim() || !amount}
                            className="w-full flex items-center justify-center py-3 bg-slate-900 text-white font-black rounded-xl hover:bg-slate-800 transition-colors mt-4 disabled:opacity-50 text-lg shadow-md"
                        >
                            {generating ? (
                                'Processing...'
                            ) : (
                                <>
                                    <Wallet className="w-4 h-4 mr-2" />
                                    GENERATE RECEIPT
                                </>
                            )}
                        </button>

                        <p className="text-[10px] font-black text-center text-slate-400 uppercase tracking-widest">
                            Print-only · Not saved · No ledger entry
                        </p>
                    </div>
                </div>

                {/* Preview */}
                <div className="lg:col-span-8 bg-slate-200 rounded-2xl p-8 border border-slate-200 overflow-hidden flex justify-center items-start min-h-[600px] shadow-inner print:bg-white print:p-0 print:border-0 print:shadow-none print:min-h-0 print:block">
                    {buyerName.trim() && amount ? (
                        <div className="scale-75 origin-top transform transition-all duration-500 bg-white p-6 rounded-xl shadow-2xl print:scale-100 print:p-0 print:shadow-none print:rounded-none print:transform-none">
                            <ReceiptTemplate data={receiptData} />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 mt-20 print:hidden">
                            <Search className="w-16 h-16 mb-4 opacity-20" />
                            <p className="font-bold">Fill details to generate receipt.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
