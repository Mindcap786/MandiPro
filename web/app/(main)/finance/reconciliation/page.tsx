"use client";
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
    Loader2, Upload, CheckCircle2, AlertCircle, RefreshCw,
    Link, Unlink, Search, Download, Trash2, Plus, X, ChevronDown, CreditCard,
    Landmark, Calendar, ArrowUpRight, ArrowDownLeft, Zap, User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays } from "date-fns";
import {
    createBankStatementFingerprint,
    parseBankStatementFile,
    SUPPORTED_BANK_STATEMENT_FORMATS,
} from "@/lib/utils/bank-statement-import";
import {
    ConfirmationDialog,
} from "@/components/ui/confirmation-dialog";
import { cacheGet, cacheSet, cacheIsStale } from "@/lib/data-cache";

type BankStatement = {
    id: string;
    statement_date: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
    reference_no: string;
    is_reconciled: boolean;
    ledger_entry_id: string | null;
};

type ChequeVoucher = {
    id: string;
    voucher_no: number;
    date: string;
    bank_name: string;
    cheque_no: string;
    cheque_date: string;
    cheque_status: string;
    narration: string;
    amount: number;
    party_name?: string;
    voucher_type?: string;
};

type BankAccount = { id: string; name: string; };

export default function BankReconciliationPage() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const [statements, setStatements] = useState<BankStatement[]>([]);
    const [loading, setLoading] = useState(false);
    const [autoMatching, setAutoMatching] = useState(false);
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");
    const [filterMode, setFilterMode] = useState<"all" | "reconciled" | "unreconciled">("all");
    const [importingStatements, setImportingStatements] = useState(false);
    const [showAddBank, setShowAddBank] = useState(false);
    const [addingBank, setAddingBank] = useState(false);
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<"statements" | "cheques">("cheques");
    const [pendingCheques, setPendingCheques] = useState<ChequeVoucher[]>([]);
    const [chequeFilter, setChequeFilter] = useState<"Pending" | "Cleared" | "Cancelled" | "All">("Pending");
    const [startDate, setStartDate] = useState<string>(format(addDays(new Date(), -30), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [loadingCheques, setLoadingCheques] = useState(false);
    const [clearingChequeId, setClearingChequeId] = useState<string | null>(null);
    const [cancellingChequeId, setCancellingChequeId] = useState<string | null>(null);
    const [chequeToCancel, setChequeToCancel] = useState<any>(null);
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Pre-load from cache for instant render on re-navigation
    const orgId = profile?.organization_id;
    const dateKey = `${startDate}_${endDate}`;
    const cachedCheques = orgId ? cacheGet<any>(`cheques_${chequeFilter}_${dateKey}`, orgId) : null;
    const cachedStats = orgId && selectedAccountId ? cacheGet<any>(`bank_stats_${selectedAccountId}`, orgId) : null;

    useEffect(() => {
        if (cachedCheques) setPendingCheques(cachedCheques);
        if (cachedStats) setStatements(cachedStats);
    }, [orgId]);

    useEffect(() => {
        if (profile?.organization_id) fetchBankAccounts();
    }, [profile]);

    useEffect(() => {
        if (selectedAccountId) {
            fetchStatements();
        }
    }, [selectedAccountId]);

    useEffect(() => {
        if (profile?.organization_id) {
            fetchPendingCheques();
        }
    }, [chequeFilter, profile, startDate, endDate]);

    const fetchBankAccounts = async () => {
        const { data, error } = await supabase
            .schema('mandi')
            .from("accounts")
            .select("id, name, is_default")
            .eq("organization_id", profile!.organization_id)
            .eq("account_sub_type", "bank")
            .eq("type", "asset")
            .order("is_default", { ascending: false })
            .order("name");

        if (error) {
            console.error("fetchBankAccounts error:", error);
            toast({ title: "Failed to load bank accounts", description: error.message, variant: "destructive" });
        }

        const accounts = data || [];
        setBankAccounts(accounts);
        if (accounts.length > 0 && (!selectedAccountId || !accounts.find(a => a.id === selectedAccountId))) {
            setSelectedAccountId(accounts[0].id);
        }
    };

    const fetchStatements = async () => {
        if (!selectedAccountId) return;
        setLoading(true);
        const { data } = await supabase
            .from("bank_statements")
            .select("*")
            .eq("organization_id", profile!.organization_id)
            .eq("account_id", selectedAccountId)
            .order("statement_date", { ascending: false });
        
        const results = (data as BankStatement[]) || [];
        setStatements(results);
        if (orgId && selectedAccountId) cacheSet(`bank_stats_${selectedAccountId}`, orgId, results);
        setLoading(false);
    };

    const fetchPendingCheques = async () => {
        if (!profile?.organization_id) return;
        // Only show full loader if we have no data to avoid "clocking" on navigation
        if (pendingCheques.length === 0) setLoadingCheques(true);
        try {
            let query = supabase.schema('mandi')
                .from('vouchers')
                .select(`
                    id, contact_id, voucher_no, date, bank_name, cheque_no, cheque_date, cheque_status, narration, type, amount,
                    ledger_entries(debit, credit, contact_id)
                `)
                .eq('organization_id', profile.organization_id)
                .eq('payment_mode', 'cheque')
                .gte('date', startDate)
                .lte('date', endDate);

            if (chequeFilter !== "All") {
                query = query.eq('cheque_status', chequeFilter);
            }

            const { data, error } = await query.order('cheque_date', { ascending: true });

            if (error) throw error;

            // Fetch contact names
            const contactIds = data?.flatMap(v => [v.contact_id, ...v.ledger_entries.map((l: any) => l.contact_id)]).filter(Boolean) || [];
            const uniqueContactIds = Array.from(new Set(contactIds));

            let contactMap: Record<string, string> = {};
            if (uniqueContactIds.length > 0) {
                const { data: contacts } = await supabase.schema('mandi').from('contacts').select('id, name').in('id', uniqueContactIds);
                contacts?.forEach(c => contactMap[c.id] = c.name);
            }

            const formatted = data?.map(v => {
                const partyEntry = v.ledger_entries.find((l: any) => l.contact_id);
                const contactId = v.contact_id || partyEntry?.contact_id;
                const amount = partyEntry ? (partyEntry.debit > 0 ? partyEntry.debit : partyEntry.credit) : Number(v.amount || 0);
                
                // Try to extract name from narration (e.g. "Sale Bill #55 (chotu)")
                let extractedName = "General / Cash Sale";
                if (!contactId && v.narration) {
                    const match = v.narration.match(/\(([^)]+)\)$/);
                    if (match) extractedName = match[1];
                }

                return {
                    ...v,
                    amount,
                    voucher_type: v.type,
                    party_name: contactId ? contactMap[contactId] : extractedName
                };
            }) || [];

            setPendingCheques(formatted as any);
        } catch (err) {
            console.error("Fetch Cheques Error:", err);
        } finally {
            setLoadingCheques(false);
        }
    };

    const handleClearCheque = async (cheque: ChequeVoucher) => {
        if (!selectedAccountId) {
            toast({ title: "Select Bank", description: "Please select a bank account to clear the cheque into.", variant: "destructive" });
            return;
        }

        setClearingChequeId(cheque.id);
        try {
            const { error } = await supabase.schema('mandi').rpc('clear_cheque', {
                p_voucher_id: cheque.id,
                p_bank_account_id: selectedAccountId,
                p_clear_date: new Date().toISOString()
            } as any);

            if (error) throw error;

            toast({ title: "Cheque Cleared!", description: `Cheque #${cheque.cheque_no} has been cleared to your bank.` });
            await fetchPendingCheques();
            await fetchStatements(); // Refresh statements as well if auto-match is needed
        } catch (err: any) {
            toast({ title: "Clearing Failed", description: err.message, variant: "destructive" });
        } finally {
            setClearingChequeId(null);
        }
    };

    const openCancelDialog = (cheque: any) => {
        setChequeToCancel(cheque);
        setIsCancelDialogOpen(true);
    };

    const handleCancelCheque = async () => {
        if (!chequeToCancel) return;
        
        setCancellingChequeId(chequeToCancel.id);
        try {
            const { error, data } = await supabase.schema('mandi').rpc('cancel_cheque', {
                p_voucher_id: chequeToCancel.id
            });

            if (error) throw error;
            
            // RPC result is now a record in an array (RETURNS TABLE)
            const result = Array.isArray(data) ? data[0] : data;
            
            if (!result || result.success === false) {
                throw new Error(result?.message || 'Server failed to process cancellation');
            }

            toast({ title: "Cheque Cancelled", description: result.message || `Cheque #${chequeToCancel.cheque_no || 'N/A'} has been voided.` });
            await fetchPendingCheques();
        } catch (err: any) {
            toast({ title: "Cancellation Failed", description: err.message, variant: "destructive" });
            throw err; // Re-throw to prevent ConfirmationDialog from closing automatically
        } finally {
            setCancellingChequeId(null);
            // Wait for dialog close animation 
            setTimeout(() => setChequeToCancel(null), 300);
        }
    };

    const handleStatementUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile?.organization_id || !selectedAccountId) return;

        setImportingStatements(true);
        try {
            const parsed = await parseBankStatementFile(file);
            const existingFingerprints = new Set(statements.map(createBankStatementFingerprint));
            const batchFingerprints = new Set<string>();
            let duplicateCount = 0;

            const rowsToInsert = parsed.rows
                .map((row) => ({
                    organization_id: profile.organization_id,
                    account_id: selectedAccountId,
                    created_by: profile.id,
                    ...row,
                }))
                .filter((row) => {
                    const fingerprint = createBankStatementFingerprint(row);
                    if (existingFingerprints.has(fingerprint) || batchFingerprints.has(fingerprint)) {
                        duplicateCount += 1;
                        return false;
                    }

                    batchFingerprints.add(fingerprint);
                    return true;
                });

            if (rowsToInsert.length === 0) {
                toast({
                    title: duplicateCount > 0 ? "No new rows to import" : "No rows parsed",
                    description: duplicateCount > 0
                        ? "Every parsed row was already imported for this bank account."
                        : "Could not read any valid bank statement rows from this file.",
                    variant: "destructive",
                });
                return;
            }

            const { error } = await supabase.from("bank_statements").insert(rowsToInsert as any);
            if (error) {
                toast({ title: "Upload failed", description: error.message, variant: "destructive" });
                return;
            }

            const notes = [
                duplicateCount > 0 ? `${duplicateCount} duplicates skipped` : "",
                parsed.skippedRows > 0 ? `${parsed.skippedRows} invalid rows skipped` : "",
            ].filter(Boolean).join(" · ");

            toast({
                title: `Imported ${rowsToInsert.length} ${rowsToInsert.length === 1 ? "entry" : "entries"} from ${parsed.format.toUpperCase()}`,
                description: notes ? `${notes}. Running auto-match now...` : "Running auto-match now...",
            });

            await fetchStatements();
            await handleAutoMatch();
            await fetchStatements();
        } catch (error: any) {
            toast({
                title: "Import failed",
                description: error?.message || "Could not read this statement file.",
                variant: "destructive",
            });
        } finally {
            setImportingStatements(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleAutoMatch = async () => {
        if (!profile?.organization_id || !selectedAccountId) return;
        setAutoMatching(true);
        const { data } = await supabase.rpc("auto_reconcile_bank_statements", {
            p_organization_id: profile.organization_id,
            p_account_id: selectedAccountId,
        });
        setAutoMatching(false);
        const matched = data?.matched ?? 0;
        toast({ title: matched > 0 ? `✅ Auto-matched ${matched} entries` : "No new matches found", description: matched > 0 ? "Matched bank rows with your ledger entries." : "You can manually match remaining entries." });
        if (matched > 0) fetchStatements();
    };

    const handleToggleReconcile = async (row: BankStatement) => {
        await supabase.from("bank_statements")
            .update({ is_reconciled: !row.is_reconciled, ledger_entry_id: row.is_reconciled ? null : row.ledger_entry_id })
            .eq("id", row.id);
        setStatements(prev => prev.map(s => s.id === row.id ? { ...s, is_reconciled: !s.is_reconciled } : s));
    };

    const handleDelete = async (id: string) => {
        setDeletingIds(prev => new Set(prev).add(id));
        await supabase.from("bank_statements").delete().eq("id", id);
        setStatements(prev => prev.filter(s => s.id !== id));
        setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    };

    const handleClearAll = async () => {
        if (!selectedAccountId || !confirm("Delete all bank statement entries for this account? This cannot be undone.")) return;
        await supabase.from("bank_statements")
            .delete()
            .eq("organization_id", profile!.organization_id)
            .eq("account_id", selectedAccountId);
        setStatements([]);
        toast({ title: "All statements cleared" });
    };

    const handleExportCSV = () => {
        if (!filtered.length) return;
        const headers = ["Date", "Description", "Ref No", "Debit", "Credit", "Balance", "Status"];
        const rows = filtered.map(s => {
            const desc = (s.description || "").replace(/,/g, " ").replace(/\n/g, " ");
            return [
                s.statement_date,
                desc,
                s.reference_no || "",
                s.debit || 0,
                s.credit || 0,
                s.balance || 0,
                s.is_reconciled ? "Reconciled" : "Pending"
            ];
        });
        const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bank - reconciliation - ${bankAccounts.find(b => b.id === selectedAccountId)?.name || "export"} - ${format(new Date(), "dd-MMM-yyyy")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const filtered = statements.filter(s => {
        if (filterMode === "reconciled" && !s.is_reconciled) return false;
        if (filterMode === "unreconciled" && s.is_reconciled) return false;
        if (searchQuery && !s.description?.toLowerCase().includes(searchQuery.toLowerCase()) && !s.reference_no?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const reconciledCount = statements.filter(s => s.is_reconciled).length;
    const unreconciledAmt = statements.filter(s => !s.is_reconciled).reduce((sum, s) => sum + (s.credit - s.debit), 0);
    const totalCredit = statements.reduce((s, r) => s + r.credit, 0);
    const totalDebit = statements.reduce((s, r) => s + r.debit, 0);
    const pct = statements.length > 0 ? Math.round((reconciledCount / statements.length) * 100) : 0;
    const selectedBankName = bankAccounts.find(b => b.id === selectedAccountId)?.name || "Select Bank";

    const filteredCheques = pendingCheques.filter(c => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            (c.party_name || "").toLowerCase().includes(query) ||
            (c.narration || "").toLowerCase().includes(query) ||
            (c.cheque_no || "").toLowerCase().includes(query) ||
            c.voucher_no?.toString().includes(query)
        );
    });

    return (
        <div className="min-h-screen bg-[#F0F2F5] pb-20 font-sans">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-50 shadow-sm backdrop-blur-md bg-white/90">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                            <CreditCard className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-[1000] text-slate-800 tracking-tighter uppercase leading-none">Cheque Clearing</h1>
                            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Professional Settlement & Reconciliation</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3 items-center">
                        {/* Bank Selector */}
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 shadow-inner">
                            <Landmark className="w-4 h-4 text-emerald-600" />
                            <select
                                className="bg-transparent border-none text-sm font-black text-slate-800 focus:ring-0 outline-none pr-8 cursor-pointer"
                                value={selectedAccountId}
                                onChange={(e) => setSelectedAccountId(e.target.value)}
                            >
                                {bankAccounts.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                    {/* Controls Row */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-white/50 p-2 rounded-3xl border border-white/80 backdrop-blur-sm">
                        <div className="flex items-center gap-4 flex-wrap flex-1">
                            <div className="flex items-center gap-1.5 p-1 bg-slate-100/50 rounded-2xl border border-slate-200/50">
                                {["Pending", "Cleared", "Cancelled", "All"].map(status => (
                                    <button 
                                        key={status} 
                                        onClick={() => setChequeFilter(status as any)}
                                        className={cn(
                                            "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                                            chequeFilter === status 
                                            ? "bg-slate-900 text-white shadow-lg scale-105" 
                                            : "text-slate-500 hover:text-slate-900 hover:bg-white"
                                        )}
                                    >
                                        {status}
                                    </button>
                                ))}
                            </div>
                            
                            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex-1 min-w-[200px] max-w-sm focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                                <Search className="w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search by name, cheque no..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 p-0 w-full placeholder:text-slate-300 placeholder:font-semibold"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-3">
                                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Period</span>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="text-xs font-bold text-slate-700 bg-transparent border-none focus:ring-0 p-0 w-24"
                                    />
                                    <span className="text-slate-300">—</span>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="text-xs font-bold text-slate-700 bg-transparent border-none focus:ring-0 p-0 w-24"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {loadingCheques ? (
                        <div className="py-32 flex flex-col items-center gap-4">
                            <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                            <p className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em] animate-pulse">Syncing Cheques...</p>
                        </div>
                    ) : pendingCheques.length === 0 ? (
                        <div className="p-32 text-center bg-white rounded-[40px] border border-slate-200 shadow-sm">
                            <div className="w-20 h-20 rounded-[28px] bg-emerald-50 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-100/50">
                                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                            </div>
                            <p className="font-black text-slate-800 text-2xl tracking-tighter mb-2 uppercase">All Clear!</p>
                            <p className="text-slate-400 font-bold text-sm">No {chequeFilter === "All" ? "" : chequeFilter.toLowerCase()} cheques found in this period.</p>
                        </div>
                    ) : filteredCheques.length === 0 ? (
                        <div className="py-20 text-center">
                            <Search className="w-8 h-8 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-500 font-bold">No cheques match your search.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredCheques.map((cheque: any) => (
                                <div 
                                    key={cheque.id} 
                                    className={cn(
                                        "relative group bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 overflow-hidden flex flex-col",
                                        cheque.voucher_type === 'payment' ? 'ring-1 ring-inset ring-rose-100/50 hover:border-rose-200' : 'ring-1 ring-inset ring-emerald-100/50 hover:border-emerald-200'
                                    )}
                                >
                                    {/* Background Accent */}
                                    <div className={cn(
                                        "absolute -bottom-10 -right-10 w-32 h-32 rounded-full opacity-[0.02] transition-transform duration-700 group-hover:scale-150",
                                        cheque.voucher_type === 'payment' ? 'bg-rose-600' : 'bg-emerald-600'
                                    )} />

                                    {/* Status Badge */}
                                    <div className="flex items-center justify-between mb-5">
                                        <div className={cn(
                                            "px-3 py-1 rounded-xl text-[8px] font-black uppercase tracking-[0.1em] flex items-center gap-1.5",
                                            cheque.cheque_status === "Pending" 
                                            ? "bg-amber-100 text-amber-700 border border-amber-200" 
                                            : cheque.cheque_status === "Cancelled"
                                            ? "bg-rose-100 text-rose-700 border border-rose-200"
                                            : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                        )}>
                                            <div className={cn("w-1.5 h-1.5 rounded-full", 
                                                cheque.cheque_status === "Pending" ? "bg-amber-600 animate-pulse" : 
                                                cheque.cheque_status === "Cancelled" ? "bg-rose-600" :
                                                "bg-emerald-600"
                                            )} />
                                            {cheque.cheque_status}
                                        </div>
                                        <div className={cn(
                                            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider",
                                            cheque.voucher_type === 'payment' ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                                        )}>
                                            {cheque.voucher_type === 'payment' ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownLeft className="w-2.5 h-2.5" />}
                                            {cheque.voucher_type === 'payment' ? 'Issued' : 'Received'}
                                        </div>
                                    </div>

                                    <div className="flex items-end justify-between mb-5">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Amount</p>
                                            <p className="font-[1000] text-slate-900 text-2xl tracking-tighter">₹{cheque.amount?.toLocaleString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Voucher</p>
                                            <p className="font-bold text-slate-800 text-xs">#{cheque.voucher_no}</p>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50/80 rounded-2xl border border-slate-100 p-3 mb-5 space-y-3 group-hover:bg-white transition-colors flex-grow">
                                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                                            <div>
                                                <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Party Name</span>
                                                <span className={cn("font-black text-xs truncate max-w-[140px] block", cheque.voucher_type === 'payment' ? "text-rose-600" : "text-emerald-600")}>
                                                    {cheque.party_name || 'General'}
                                                </span>
                                            </div>
                                            <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm shrink-0">
                                                <User className="w-3 h-3 text-slate-400" />
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Cheque No</span>
                                                <span className="font-mono font-black text-slate-800 text-xs">{cheque.cheque_no || 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Date</span>
                                                <span className="font-black text-slate-800 text-xs">{cheque.cheque_date ? format(new Date(cheque.cheque_date), 'dd MMM yy') : 'N/A'}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="pt-1">
                                            <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Issuer Bank</span>
                                            <span className="font-bold text-slate-600 text-[10px] uppercase italic truncate block">{cheque.bank_name || 'Not Specified'}</span>
                                        </div>
                                    </div>

                                    <div className="mt-auto">
                                        {cheque.cheque_status === "Pending" ? (
                                            <div className="flex gap-2">
                                                <Button 
                                                    onClick={() => handleClearCheque(cheque)} 
                                                    disabled={!!clearingChequeId || !!cancellingChequeId} 
                                                    className={cn(
                                                        "flex-1 h-10 font-[900] text-[10px] uppercase tracking-[0.1em] rounded-xl shadow-md transition-all duration-300",
                                                        cheque.voucher_type === 'payment' 
                                                        ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200" 
                                                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
                                                    )}
                                                >
                                                    {clearingChequeId === cheque.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <div className="flex items-center gap-1.5">
                                                            <Zap className="w-3.5 h-3.5" />
                                                            <span>Mark Cleared</span>
                                                        </div>
                                                    )}
                                                </Button>
                                                {/* CANCEL BUTTON: Explicitly using a native button with high z-index and specific click-targeting */}
                                                <button
                                                    type="button"
                                                    onClick={(e) => { 
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        openCancelDialog(cheque);
                                                    }}
                                                    disabled={clearingChequeId === cheque.id || cancellingChequeId === cheque.id}
                                                    className={cn(
                                                        "relative z-[100] px-5 h-10 border-2 border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600 font-black text-[10px] uppercase tracking-[0.2em] rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95",
                                                        cancellingChequeId === cheque.id && "animate-pulse"
                                                    )}
                                                >
                                                    {cancellingChequeId === cheque.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                                                    ) : (
                                                        "Cancel"
                                                    )}
                                                </button>
                                            </div>
                                        ) : cheque.cheque_status === "Cancelled" ? (
                                            <div className="w-full h-10 bg-rose-50 text-rose-600 font-[900] text-[10px] uppercase tracking-[0.1em] rounded-xl flex items-center justify-center gap-1.5 border border-rose-100/50 italic pointer-events-none">
                                                <X className="w-3.5 h-3.5" />
                                                Cheque Voided
                                            </div>
                                        ) : (
                                            <div className="w-full h-10 bg-emerald-50 text-emerald-600 font-[900] text-[10px] uppercase tracking-[0.1em] rounded-xl flex items-center justify-center gap-1.5 border border-emerald-100/50 italic pointer-events-none">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                Settled Securely
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Cancel Confirmation Dialog */}
            <ConfirmationDialog 
                open={isCancelDialogOpen}
                onOpenChange={setIsCancelDialogOpen}
                title={`Cancel Cheque #${chequeToCancel?.cheque_no || 'N/A'}?`}
                description={`This will void the payment entry, purge all related ledger entries, and reset the associated invoice back to PENDING. This action cannot be undone.`}
                onConfirm={handleCancelCheque}
                confirmText="Yes, Cancel Payment"
                cancelText="Wait, Keep It"
                variant="destructive"
            />
        </div>
    );
}
