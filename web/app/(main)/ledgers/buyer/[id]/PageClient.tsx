'use client'
// Static export: client component — generateStaticParams is in layout.tsx



import { useParams, useRouter } from 'next/navigation'
import { DataTable } from '@/components/ui/data-table'
import { ArrowLeft, Printer } from 'lucide-react'

// Mock Transactions
const MOCK_TRANSACTIONS = [
    { id: 'TX-1001', date: '2023-10-24', lot: 'APP-26-001', details: 'Apple (Royal) - 20 Crates @ ₹800', amount: 16000, type: 'DEBIT' },
    { id: 'PAY-505', date: '2023-10-25', lot: '-', details: 'Cash Payment Received', amount: 10000, type: 'CREDIT' },
    { id: 'TX-1005', date: '2023-10-25', lot: 'BAN-12-044', details: 'Banana - 50 Dozen @ ₹40', amount: 2000, type: 'DEBIT' },
]

export default function BuyerLedgerDetail() {
    const params = useParams()
    const router = useRouter()
    const buyerId = params.id

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val)

    return (
        <div className="p-8 min-h-screen bg-black text-white space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-gray-800 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Raju Buyer</h1>
                        <p className="text-gray-400 text-sm">ID: {buyerId} • Shop No 4</p>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="text-right">
                        <p className="text-xs text-gray-400 uppercase tracking-widest">Total Outstanding</p>
                        <p className="text-3xl font-bold text-red-500">₹8,000</p>
                    </div>
                    <button className="flex items-center space-x-2 bg-neon-green text-black px-4 py-2 rounded-md font-bold hover:bg-green-400 transition-colors">
                        <Printer className="w-4 h-4" />
                        <span>PRINT STATEMENT</span>
                    </button>
                </div>
            </div>

            {/* Transaction Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-gray-800">
                    <h3 className="font-semibold text-lg">Transaction History</h3>
                </div>
                <DataTable
                    data={MOCK_TRANSACTIONS}
                    columns={[
                        { header: 'Date', accessorKey: 'date', className: 'text-gray-400' },
                        { header: 'Ref ID', accessorKey: 'id', className: 'font-mono text-xs' },
                        { header: 'Description', accessorKey: 'details', className: 'w-1/3' },
                        {
                            header: 'Debit (Sale)',
                            accessorKey: (row) => row.type === 'DEBIT' ? formatCurrency(row.amount) : '-'
                        },
                        {
                            header: 'Credit (Paid)',
                            accessorKey: (row) => row.type === 'CREDIT' ? <span className="text-green-500">{formatCurrency(row.amount)}</span> : '-'
                        },
                    ]}
                />
            </div>
        </div>
    )
}
