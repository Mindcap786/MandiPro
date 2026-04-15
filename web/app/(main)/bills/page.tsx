'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'

import { supabase } from '@/lib/supabaseClient'
import { Loader2, Printer, FileText, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'

// @react-pdf/renderer is ~500KB — load only when a bill is generated, not on page open
const InvoiceTemplate = dynamic(
    () => import('@/components/billing/invoice-template').then(m => m.InvoiceTemplate),
    { ssr: false, loading: () => <div className="animate-pulse h-64 bg-slate-100 rounded-xl" /> }
)

export default function BillsPage() {
    const { user } = useAuth()
    const [buyers, setBuyers] = useState<any[]>([])
    const [selectedBuyer, setSelectedBuyer] = useState<string>('')
    const [pendingTxns, setPendingTxns] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [generatedInvoice, setGeneratedInvoice] = useState<any>(null)
    const printRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetchBuyers()
    }, [])

    useEffect(() => {
        if (selectedBuyer) {
            fetchPendingTransactions(selectedBuyer)
        } else {
            setPendingTxns([])
        }
    }, [selectedBuyer])

    async function fetchBuyers() {
        const { data } = await supabase
            .schema('mandi')
            .from('contacts')
            .select('id, name, shop_name')
            .eq('contact_type', 'buyer')
            .order('name')
        if (data) setBuyers(data)
        setLoading(false)
    }

    async function fetchPendingTransactions(buyerId: string) {
        setLoading(true)
        // Fetch transactions that are PENDING and NOT linked to an invoice yet
        const { data } = await supabase
            .schema('mandi')
            .from('transactions') // Warning: Ensure this table exists or use 'sale_items'
            .select(`
                id,
                created_at,
                rate,
                quantity,
                total_amount,
                lot:lots(lot_code, item_type)
            `)
            .eq('buyer_id', buyerId)
            .eq('payment_status', 'pending')
            .is('invoice_id', null) // Important: Only unbilled items

        if (data) setPendingTxns(data)
        setLoading(false)
    }

    async function handleGenerateBill() {
        if (!selectedBuyer || pendingTxns.length === 0) return
        setGenerating(true)

        try {
            // 1. Calculate Totals
            const subtotal = pendingTxns.reduce((sum, t) => sum + t.total_amount, 0)
            const commission = subtotal * 0.05 // 5% Mock
            const marketFee = subtotal * 0.01 // 1% Mock
            const totalAmount = subtotal + commission + marketFee

            // 2. Prepare Data
            const { data: merchant } = await supabase.from('merchants').select('id').limit(1).single() // Lazy fetch
            const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`
            const transactionIds = pendingTxns.map(t => t.id)

            // 3. Call Atomic RPC
            const { data, error } = await supabase.rpc('generate_consolidated_invoice', {
                p_merchant_id: merchant?.id,
                p_buyer_id: selectedBuyer,
                p_total_amount: totalAmount,
                p_transaction_ids: transactionIds,
                p_invoice_number: invoiceNumber,
                p_market_fee: marketFee,
                p_commission: commission
            })

            if (error) throw error

            // 4. Update UI
            const buyer = buyers.find(b => b.id === selectedBuyer)
            setGeneratedInvoice({
                invoiceNumber,
                date: new Date(),
                merchantName: "Mandi Pro Merchant",
                buyerName: buyer?.name,
                items: pendingTxns.map(t => ({
                    lotCode: t.lot.lot_code,
                    itemType: t.lot.item_type,
                    quantity: t.quantity,
                    rate: t.rate,
                    amount: t.total_amount
                })),
                subtotal,
                commission,
                marketFee,
                totalAmount
            })

            // Refresh pending list (should be empty now)
            fetchPendingTransactions(selectedBuyer)

        } catch (error: any) {
            console.error('Billing Error:', error)
            alert('Failed to generate invoice: ' + error.message)
        } finally {
            setGenerating(false)
        }
    }

    const handlePrint = () => {
        const printContent = document.getElementById('invoice-print-area')
        const windowUrl = 'about:blank'
        const uniqueName = new Date();
        const windowName = 'Print' + uniqueName.getTime();
        const printWindow = window.open(windowUrl, windowName, 'left=50000,top=50000,width=0,height=0');

        if (printWindow && printContent) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Print Invoice</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                    </head>
                    <body >
                       ${printContent.innerHTML}
                    </body>
                </html>
            `)
            printWindow.document.close()
            printWindow.focus()
            setTimeout(() => {
                printWindow.print()
                printWindow.close()
            }, 500)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 p-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-5xl font-black italic tracking-tighter uppercase mb-2 text-slate-900">
                    Sales <span className="text-blue-600">Invoicing</span>
                </h1>
                <p className="text-slate-500 font-bold max-w-lg text-lg">
                    Generate and manage consolidated invoices for your buyers.
                </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Left Panel: Selection */}
                <div className="w-full lg:w-1/3 space-y-6">
                    <div className="bg-white border border-slate-200 p-6 rounded-[32px] shadow-xl relative overflow-hidden group hover:shadow-2xl transition-all duration-500">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -z-10 group-hover:bg-blue-100 transition-all duration-700" />

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Select Buyer</label>
                                <div className="relative">
                                    <select
                                        className="w-full h-14 pl-4 pr-10 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all appearance-none cursor-pointer hover:bg-slate-100 shadow-sm"
                                        value={selectedBuyer}
                                        onChange={(e) => setSelectedBuyer(e.target.value)}
                                    >
                                        <option value="" className="text-slate-500">Select a Buyer...</option>
                                        {buyers.map(b => (
                                            <option key={b.id} value={b.id} className="text-slate-900 font-bold">
                                                {b.name} {b.shop_name ? `(${b.shop_name})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                    </div>
                                </div>
                            </div>

                            {selectedBuyer && (
                                <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
                                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between items-center">
                                        <span className="text-sm font-bold text-slate-500 uppercase tracking-wide">Pending Items</span>
                                        <span className="text-2xl font-black text-slate-900">{pendingTxns.length}</span>
                                    </div>

                                    {pendingTxns.length > 0 ? (
                                        <div className="space-y-3">
                                            <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                                {pendingTxns.map((txn, idx) => (
                                                    <div key={txn.id} className="flex justify-between items-center p-3 rounded-xl bg-white border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all group/item">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-200 group-hover/item:bg-blue-50 group-hover/item:text-blue-600 transition-colors">
                                                                {idx + 1}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-bold text-slate-900 group-hover/item:text-blue-700 transition-colors">
                                                                    {txn.lot?.lot_code}
                                                                </div>
                                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                                    {txn.lot?.item_type || 'Unknown Item'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-mono font-bold text-slate-900">₹{txn.total_amount.toLocaleString()}</div>
                                                            <div className="text-[10px] text-slate-500 font-bold">{txn.quantity} {txn.unit || 'Qty'}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <button
                                                onClick={handleGenerateBill}
                                                disabled={generating}
                                                className="w-full h-14 bg-blue-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-700 hover:scale-[1.02] focus:scale-[0.98] transition-all shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2 text-sm"
                                            >
                                                {generating ? <Loader2 className="animate-spin w-5 h-5" /> : 'Generate Invoice'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="p-8 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center text-center gap-3">
                                            <CheckCircle2 className="w-10 h-10 text-green-500" />
                                            <p className="text-sm font-bold text-slate-500">All caught up! No pending transactions.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Preview */}
                <div className="flex-1 min-h-[700px] bg-slate-100 border border-slate-200 rounded-[32px] relative flex flex-col items-center justify-center shadow-inner overflow-hidden p-8">
                    {generatedInvoice ? (
                        <div className="w-full max-w-[800px] animate-in zoom-in-50 duration-500 flex flex-col h-full">
                            <div className="flex justify-between items-center mb-6 bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                                <div className="flex items-center text-green-600 gap-3">
                                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center border border-green-100">
                                        <CheckCircle2 className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="font-black uppercase tracking-wide text-slate-900">Success</div>
                                        <div className="text-xs font-bold text-slate-500">Invoice Generated</div>
                                    </div>
                                </div>
                                <button
                                    onClick={handlePrint}
                                    className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-2 text-xs shadow-lg hover:shadow-xl"
                                >
                                    <Printer className="w-4 h-4" />
                                    Print / PDF
                                </button>
                            </div>

                            <div className="flex-1 overflow-auto custom-scrollbar rounded-xl shadow-2xl bg-white border border-slate-200">
                                <InvoiceTemplate {...generatedInvoice} />
                            </div>
                        </div>
                    ) : (
                        <div className="text-center space-y-6 max-w-sm">
                            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto border border-slate-200 shadow-sm animate-pulse">
                                <FileText className="w-10 h-10 text-slate-300" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-black text-slate-900">No Invoice Selected</h3>
                                <p className="text-slate-500 font-bold">Select a buyer from the left panel to generate a new consolidated invoice.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
