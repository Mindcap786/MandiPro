"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Wallet, X, Calendar, User, FileText, IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface VoucherDetailsDialogProps {
    voucher: any;
    isOpen: boolean;
    onClose: () => void;
}

export function VoucherDetailsDialog({ voucher, isOpen, onClose }: VoucherDetailsDialogProps) {
    if (!voucher) return null;

    const isReceipt = voucher.type === 'receipt';
    const isPayment = voucher.type === 'payment';
    const isExpense = voucher.type === 'expense';

    const themeColor = isReceipt ? "text-green-600" : isPayment ? "text-red-600" : "text-orange-600";
    const bgColor = isReceipt ? "bg-green-50" : isPayment ? "bg-red-50" : "bg-orange-50";
    const borderColor = isReceipt ? "border-green-100" : isPayment ? "border-red-100" : "border-orange-100";
    const Icon = isReceipt ? ArrowDownLeft : isPayment ? ArrowUpRight : Wallet;

    return (
        <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="bg-white border-slate-200 text-black sm:max-w-[500px] shadow-2xl p-0 overflow-hidden rounded-[32px]">
                {/* Header Decoration */}
                <div className={cn("h-32 w-full relative flex items-center px-8", bgColor)}>
                    <Icon className={cn("absolute right-4 bottom-0 h-40 w-40 opacity-10 rotate-12", themeColor)} />
                    <div className="z-10">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white",
                                isReceipt ? "bg-green-600" : isPayment ? "bg-red-600" : "bg-orange-600")}>
                                {voucher.type}
                            </span>
                            <span className="text-slate-400 font-bold text-xs">#{voucher.voucher_no || 'N/A'}</span>
                        </div>
                        <h2 className="text-3xl font-black text-slate-800 tracking-tight">Voucher Details</h2>
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    {/* Amount & Status Card */}
                    <div className="bg-slate-50 border border-slate-100 p-6 rounded-[24px] flex justify-between items-center shadow-sm">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transaction Amount</p>
                            <p className={cn("text-4xl font-black font-mono tracking-tighter", themeColor)}>
                                {isReceipt ? '+' : '-'} ₹{voucher.amount?.toLocaleString()}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                            <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-emerald-600">POSTED</span>
                        </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-1 gap-4">
                        <div className="flex items-start gap-4 p-4 rounded-2xl border border-slate-50 bg-white hover:border-slate-100 transition-colors">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                                <User className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Party / Category</p>
                                <p className="font-bold text-slate-800 text-lg">{voucher.partyName || "General"}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-4 rounded-2xl border border-slate-50 bg-white hover:border-slate-100 transition-colors">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                                <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Date of Voucher</p>
                                <p className="font-bold text-slate-800">{format(new Date(voucher.date), 'EEEE, dd MMMM yyyy')}</p>
                            </div>
                        </div>

                        {voucher.cheque_no && (
                            <div className="flex items-start gap-4 p-4 rounded-2xl border border-blue-100 bg-blue-50/30 hover:border-blue-200 transition-colors">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-0.5">Cheque Details</p>
                                        <span className={cn(
                                            "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest",
                                            voucher.cheque_status === 'Cleared' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700 animate-pulse"
                                        )}>
                                            {voucher.cheque_status || 'Pending'}
                                        </span>
                                    </div>
                                    <p className="font-bold text-slate-800 italic">
                                        {voucher.bank_name || 'Bank'} · #{voucher.cheque_no}
                                    </p>
                                    {voucher.cheque_date && (
                                        <p className="text-[10px] text-slate-500 font-bold mt-1">
                                            Dated: {format(new Date(voucher.cheque_date), 'dd MMM yyyy')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {voucher.narration && (
                            <div className="flex items-start gap-4 p-4 rounded-2xl border border-slate-50 bg-white hover:border-slate-100 transition-colors">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Narration / Notes</p>
                                    <p className="font-medium text-slate-600 text-sm italic">"{voucher.narration}"</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Ledger Posting Breakdown */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Ledger Distribution</h4>
                        <div className="border border-slate-100 rounded-2xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="text-left p-3 pl-4">Account Name</th>
                                        <th className="text-right p-3">Debit</th>
                                        <th className="text-right p-3 pr-4">Credit</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {voucher.lines?.map((line: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="p-3 pl-4 font-bold text-slate-700">{line.contactName || line.employeeName || line.account?.name || line.account_name || 'Account'}</td>
                                            <td className="p-3 text-right font-mono font-bold text-slate-500">{line.debit > 0 ? `₹${line.debit.toLocaleString()}` : '-'}</td>
                                            <td className="p-3 text-right font-mono font-bold text-slate-500">{line.credit > 0 ? `₹${line.credit.toLocaleString()}` : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex gap-4 pt-2">
                        <Button
                            className="flex-1 h-14 bg-slate-800 hover:bg-black text-white font-black text-base rounded-[20px] shadow-lg transition-all"
                            onClick={onClose}
                        >
                            CLOSE DETAILS
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
