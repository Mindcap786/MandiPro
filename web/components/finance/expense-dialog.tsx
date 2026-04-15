"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2, ArrowRightLeft, Plus, X, Landmark, Trash2, Users, Zap, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { useFieldGovernance } from "@/hooks/useFieldGovernance";
import { Label } from "@/components/ui/label";

const formSchema = z.object({
    account_id: z.string().min(1, "Expense category is required"),
    amount: z.string().min(1, "Amount is required"),
    payment_mode: z.string().min(1, "Payment mode is required"),
    payment_date: z.date(),
    employee_id: z.string().optional(),
    remarks: z.string().optional(),
    cheque_no: z.string().optional(),
    cheque_date: z.date().optional(),
    bank_name: z.string().optional(),
    bank_account_id: z.string().optional(),
});

export function ExpenseDialog({ 
    onSuccess, 
    children,
    defaultEmployeeId,
    defaultAmount,
    defaultCategoryName
}: { 
    onSuccess?: () => void, 
    children?: React.ReactNode,
    defaultEmployeeId?: string,
    defaultAmount?: number,
    defaultCategoryName?: string
}) {
    const { profile } = useAuth();
    const [open, setOpen] = useState(false);
    const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingAccounts, setLoadingAccounts] = useState(false);

    const { isVisible, isMandatory, getLabel } = useFieldGovernance('expenses');
    const [openAccount, setOpenAccount] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddingAccount, setIsAddingAccount] = useState(false);
    const [newAccountName, setNewAccountName] = useState("");
    const [isCreatingAccount, setIsCreatingAccount] = useState(false);
    const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [instantClear, setInstantClear] = useState(false);  // ← NEW: cheque cleared immediately on same day
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [defaultBankId, setDefaultBankId] = useState<string | null>(null);
    const [loadingBanks, setLoadingBanks] = useState(false);
    const [isPersonal, setIsPersonal] = useState(false); // ← NEW: Personal Withdrawal (Drawings)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            payment_date: new Date(),
            payment_mode: "cash",
            amount: defaultAmount?.toString() || "0",
            cheque_date: new Date(),
            employee_id: defaultEmployeeId || "",
        },
    });

    // Auto-select default bank when UPI/BANK or cheque mode is chosen
    const watchedPaymentMode = form.watch('payment_mode');
    useEffect(() => {
        if ((watchedPaymentMode === 'bank' || watchedPaymentMode === 'cheque') && defaultBankId) {
            const currentBank = form.getValues("bank_account_id");
            if (!currentBank) {
                form.setValue("bank_account_id", defaultBankId);
            }
        }
    }, [watchedPaymentMode, defaultBankId, form]);

    useEffect(() => {
        if (open && profile?.organization_id) {
            fetchExpenseAccounts();
            fetchEmployees();
            fetchBankAccounts();
        }
    }, [open, profile?.organization_id]);

    const fetchEmployees = async () => {
        if (!profile?.organization_id) return;
        try {
            const { data, error } = await supabase
                .schema('mandi')
                .from('employees')
                .select('id, name')
                .eq('organization_id', profile?.organization_id)
                .eq('status', 'active')
                .order('name');

            if (data) setEmployees(data);
            if (error) throw error;
        } catch (err) {
            console.error("Fetch Employees Error:", err);
        }
    };

    const fetchExpenseAccounts = async () => {
        if (!profile?.organization_id) return;
        setLoadingAccounts(true);
        try {
            const { data, error } = await supabase
                .schema('mandi')
                .from('accounts')
                .select('id, name, is_system')
                .eq('organization_id', profile?.organization_id)
                .eq('type', 'expense')
                .order('name');
            if (error) throw error;            if (data) {
                setExpenseAccounts(data);
                
                // Priority 1: Explicitly requested category name
                if (defaultCategoryName && !form.getValues("account_id")) {
                    const matchedAcc = data.find(a => 
                        a.name.toLowerCase() === defaultCategoryName.toLowerCase()
                    );
                    if (matchedAcc) {
                        form.setValue("account_id", matchedAcc.id);
                        return;
                    }
                }

                // Priority 2: If we have a default employee, try to auto-select Salary account
                if (defaultEmployeeId && !form.getValues("account_id")) {
                    const salaryAcc = data.find(a => 
                        a.name.toLowerCase().includes("salary") || 
                        a.name.toLowerCase().includes("payroll")
                    );
                    if (salaryAcc) {
                        form.setValue("account_id", salaryAcc.id);
                    }
                }
            }
        } catch (err) {
            console.error("Fetch Expense Error:", err);
        } finally {
            setLoadingAccounts(false);
        }
    };

    const fetchBankAccounts = async () => {
        if (!profile?.organization_id) return;
        setLoadingBanks(true);
        try {
            const schema = 'mandi';
            const { data, error } = await supabase
                .schema(schema)
                .from('accounts')
                .select('id, name, description, is_default')
                .eq('organization_id', profile?.organization_id)
                .eq('account_sub_type', 'bank')
                .eq('type', 'asset')
                .eq('is_active', true)
                .order('name');

            if (data) {
                setBankAccounts(data);
                const def = data.find((b: any) => b.is_default) || data[0];
                if (def) {
                    setDefaultBankId(def.id);
                    form.setValue("bank_account_id", def.id);
                }
            }
            if (error) throw error;
        } catch (err) {
            console.error("Fetch Banks Error:", err);
        } finally {
            setLoadingBanks(false);
        }
    };

    const handleAddNewAccount = async () => {
        const trimmedName = newAccountName.trim();
        if (!trimmedName || !profile?.organization_id) return;
        
        // Prevent Adding Duplicate Name
        const lowerName = trimmedName.toLowerCase();
        if (expenseAccounts.some(a => a.name.toLowerCase() === lowerName)) {
            alert(`Category "${trimmedName}" already exists.`);
            return;
        }

        setIsCreatingAccount(true);
        try {
            const { data, error } = await supabase
                .schema('mandi')
                .from('accounts')
                .insert({
                    organization_id: profile.organization_id,
                    name: trimmedName,
                    type: 'expense',
                    is_system: false,
                    code: (10000 + Math.floor(Math.random() * 90000)).toString()
                })
                .select()
                .single();

            if (error) throw error;

            setExpenseAccounts(prev => [...prev, data]);
            form.setValue("account_id", data.id);
            setNewAccountName("");
            setIsAddingAccount(false);
            setOpenAccount(false);
        } catch (err: any) {
            console.error("Add Account Error:", err);
            alert(err.message || "Failed to create category");
        } finally {
            setIsCreatingAccount(false);
        }
    };

    const handleDeleteAccount = async (e: React.MouseEvent, account: any) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.nativeEvent.stopImmediatePropagation) {
            e.nativeEvent.stopImmediatePropagation();
        }

        if (confirmDeleteId !== account.id) {
            setConfirmDeleteId(account.id);
            // Auto-reset after 3 seconds
            setTimeout(() => setConfirmDeleteId(null), 3000);
            return;
        }

        setConfirmDeleteId(null);
        setDeletingAccountId(account.id);
        try {
            const { count, error: countError } = await supabase
                .schema('mandi')
                .from('ledger_entries')
                .select('id', { count: 'exact', head: true })
                .eq('account_id', account.id);

            if (countError) throw countError;
            if ((count || 0) > 0) {
                alert(`Cannot delete "${account.name}" because it has existing transactions.`);
                return;
            }

            const { error } = await supabase
                .schema('mandi')
                .from('accounts')
                .delete()
                .eq('id', account.id);

            if (error) throw error;

            setExpenseAccounts(prev => prev.filter(a => a.id !== account.id));
            if (form.getValues("account_id") === account.id) {
                form.setValue("account_id", "");
            }
        } catch (err: any) {
            console.error("Delete Account Error Detailed:", {
                error: err,
                accountId: account.id,
                accountName: account.name
            });
            alert(`Failed to delete category: ${err.message || err.details || "Unknown error"}`);
        } finally {
            setDeletingAccountId(null);
        }
    };
    
    // Helper to find or create "Personal Drawings" account for an organization
    const getPersonalDrawingsAccount = async () => {
        if (!profile?.organization_id) return null;
        
        // 1. Check if it exists
        const { data: existing } = await supabase
            .schema('mandi')
            .from('accounts')
            .select('id')
            .eq('organization_id', profile.organization_id)
            .eq('type', 'equity')
            .eq('name', 'Personal Drawings')
            .maybeSingle();
            
        if (existing) return existing.id;
        
        // 2. Create if not exists
        const { data: created, error } = await supabase
            .schema('mandi')
            .from('accounts')
            .insert({
                organization_id: profile.organization_id,
                name: 'Personal Drawings',
                type: 'equity',
                account_sub_type: 'capital',
                is_system: true,
                code: '7001'
            })
            .select()
            .single();
            
        if (error) {
            console.error("Error creating Personal Drawings account:", error);
            // Fallback to "Owner Equity" if we can find it
            const { data: fallback } = await supabase
                .schema('mandi')
                .from('accounts')
                .select('id')
                .eq('organization_id', profile.organization_id)
                .eq('type', 'equity')
                .limit(1)
                .maybeSingle();
            return fallback?.id || null;
        }
        
        return created.id;
    };

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsSubmitting(true);
        try {
            let targetAccountId = values.account_id;
            
            // If it's a personal withdrawal, switch to the Drawings account
            if (isPersonal) {
                targetAccountId = await getPersonalDrawingsAccount() || values.account_id;
            }

            if (!targetAccountId) throw new Error("Target account not found.");

            const { error } = await supabase.schema('mandi').rpc('create_voucher', {
                p_organization_id: profile?.organization_id,
                p_voucher_type: 'payment',
                p_date: values.payment_date.toISOString(),
                p_amount: parseFloat(values.amount),
                p_payment_mode: values.payment_mode,
                p_account_id: targetAccountId,
                p_remarks: values.remarks || (isPersonal ? 'Personal Withdrawal' : 'Shop Expense'),
                p_cheque_no: values.cheque_no,
                p_cheque_date: values.cheque_date ? values.cheque_date.toISOString() : null,
                p_bank_name: values.bank_name,
                p_cheque_status: values.payment_mode === 'cheque' ? (instantClear ? 'Cleared' : 'Pending') : null,
                p_employee_id: values.employee_id || null,
                p_bank_account_id: (values.payment_mode === 'bank' || values.payment_mode === 'cheque') ? values.bank_account_id : null
            });

            if (error) throw error;

            setOpen(false);
            form.reset();
            onSuccess?.();

        } catch (e: any) {
            console.error(e);
            alert(e.message || "Failed to record expense");
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedAccountName = expenseAccounts.find(a => a.id === form.watch("account_id"))?.name || "";
    const isSalaryExpense = selectedAccountName.toLowerCase().includes("salary") || selectedAccountName.toLowerCase().includes("payroll");

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || (
                    <Button variant="outline" className="h-10 border-slate-300 bg-white text-slate-700 font-bold hover:bg-slate-50 hover:text-black">
                        <ArrowRightLeft className="w-4 h-4 mr-2" /> Record Expense
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-white border-none rounded-[32px] shadow-2xl p-0 overflow-hidden text-slate-900">
                <div className={cn(
                    "p-8 text-white relative overflow-hidden transition-all duration-500",
                    isPersonal ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-gradient-to-br from-orange-500 to-rose-600"
                )}>
                    <div className="relative z-10">
                        <div className="flex justify-between items-center mb-6">
                            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                                <ArrowRightLeft className="w-6 h-6" />
                            </div>
                            <div className="flex bg-black/20 p-1 rounded-full backdrop-blur-md border border-white/10 shadow-inner">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setIsPersonal(false);
                                        form.setValue('account_id', '');
                                    }}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                                        !isPersonal ? "bg-white text-black shadow-lg" : "text-white hover:bg-white/10"
                                    )}
                                >
                                    Business
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setIsPersonal(true);
                                        form.setValue('account_id', 'drawings'); // Dummy ID to satisfy Zod
                                    }}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                                        isPersonal ? "bg-white text-black shadow-lg" : "text-white hover:bg-white/10"
                                    )}
                                >
                                    Personal
                                </button>
                            </div>
                        </div>
                        <h2 className="text-3xl font-[1000] italic tracking-tighter uppercase mb-1 drop-shadow-md">
                            {isPersonal ? 'Owner ' : 'Mandi '} <span className={isPersonal ? 'text-indigo-200' : 'text-orange-200'}>{isPersonal ? 'Withdrawals' : 'Expenses'}</span>
                        </h2>
                        <p className={cn(
                            "opacity-80 font-bold uppercase tracking-widest text-[10px]",
                            isPersonal ? "text-indigo-50" : "text-orange-50"
                        )}>
                            {isPersonal ? "Withdraw from galla/bank for personal use" : "Record day-to-day spending & payroll"}
                        </p>
                    </div>
                    <div className="absolute right-[-20px] top-[-20px] w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="absolute left-[-20px] bottom-[-20px] w-40 h-40 bg-black/10 rounded-full blur-3xl"></div>
                </div>

                <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                            {/* Expense Category / Personal Header */}
                            {isPersonal ? (
                                <div className="space-y-4 p-5 bg-indigo-50/50 border border-indigo-100 rounded-[28px] animate-in fade-in zoom-in-95 duration-500">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-200">
                                            <Landmark className="w-4 h-4" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-indigo-900 leading-none">Personal Drawings</h4>
                                            <p className="text-[9px] text-indigo-600 font-bold uppercase tracking-tight">Recorded against owner equity (No P/L Impact)</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                isVisible('account_id') && (
                                    <FormField
                                        control={form.control}
                                        name="account_id"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel className="uppercase text-[10px] font-black tracking-widest text-slate-500">{getLabel('account_id', 'Expense Category')}</FormLabel>
                                                <Popover
                                                    open={openAccount}
                                                    onOpenChange={(op) => {
                                                        setOpenAccount(op);
                                                        if (op && expenseAccounts.length === 0) fetchExpenseAccounts();
                                                    }}
                                                >
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button
                                                                variant="outline"
                                                                role="combobox"
                                                                aria-expanded={openAccount}
                                                                className={cn(
                                                                    "w-full justify-between bg-slate-50 border-slate-200 text-black h-12 rounded-xl hover:bg-slate-100 font-bold",
                                                                    !field.value && "text-slate-400 font-bold"
                                                                )}
                                                            >
                                                                {field.value
                                                                    ? expenseAccounts.find((a) => a.id === field.value)?.name
                                                                    : getLabel('account_id', "Select category...")}
                                                                <ArrowRightLeft className="ml-2 h-4 w-4 shrink-0 opacity-50 rotate-90" />
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[400px] p-0 bg-white border-slate-200 z-[200] rounded-2xl shadow-2xl pointer-events-auto" align="start">
                                                        <div className="flex flex-col bg-white rounded-2xl overflow-hidden">
                                                            <div className="p-3 bg-slate-50 border-b border-slate-100">
                                                                <Input
                                                                    placeholder="Search category..."
                                                                    className="bg-white border-slate-200 text-black focus-visible:ring-2 focus-visible:ring-orange-500/20 placeholder:text-slate-400 font-bold rounded-lg"
                                                                    value={searchQuery}
                                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                                    autoFocus
                                                                />
                                                            </div>
                                                            <div 
                                                                className="max-h-[300px] overflow-y-auto p-1 py-1"
                                                            >
                                                                {loadingAccounts ? (
                                                                    <div className="p-8 text-center text-xs text-slate-400 animate-pulse uppercase tracking-widest font-black">
                                                                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 opacity-30" />
                                                                        Loading categories...
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        {expenseAccounts
                                                                            .filter(a => (a.name || "").toLowerCase().includes((searchQuery || "").toLowerCase()))
                                                                            .sort((a, b) => a.name.localeCompare(b.name))
                                                                            .map((account) => (
                                                                                <div
                                                                                    key={account.id}
                                                                                    className="flex items-center justify-between hover:bg-orange-50 cursor-pointer rounded-xl transition-colors group m-1 relative h-12 overflow-hidden"
                                                                                >
                                                                                    <div 
                                                                                        className="flex-1 h-full flex items-center px-4"
                                                                                        onClick={() => {
                                                                                            form.setValue("account_id", account.id, { shouldValidate: true });
                                                                                            setOpenAccount(false);
                                                                                            setSearchQuery("");
                                                                                        }}
                                                                                    >
                                                                                        <span className="font-bold text-slate-700 group-hover:text-orange-700 transition-colors uppercase tracking-tight">{account.name}</span>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )
                            )}

                            {/* Employee Selection (Only if Salary account) */}
                            {isSalaryExpense && (
                                <FormField
                                    control={form.control}
                                    name="employee_id"
                                    render={({ field }) => (
                                        <FormItem className="animate-in fade-in slide-in-from-top-2 duration-300">
                                            <FormLabel className="uppercase text-[10px] font-black tracking-widest text-orange-600 mb-2 block">Employee Name</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="h-14 bg-orange-50/50 border-orange-100 rounded-2xl font-bold text-slate-700 transition-all focus:ring-2 focus:ring-orange-500/20">
                                                        <div className="flex items-center gap-3">
                                                            <Users className="h-5 w-5 text-orange-500" />
                                                            <SelectValue placeholder="Select Employee" />
                                                        </div>
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="bg-white border-slate-200 rounded-2xl shadow-xl z-[9999]">
                                                    {employees.map(emp => (
                                                        <SelectItem key={emp.id} value={emp.id} className="font-bold text-slate-700 py-3 focus:bg-orange-50 focus:text-orange-700 rounded-lg m-1 cursor-pointer">
                                                            {emp.name}
                                                        </SelectItem>
                                                    ))}
                                                    {employees.length === 0 && (
                                                        <div className="p-4 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                                                            No active employees found
                                                        </div>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            <FormDescription className="text-[9px] font-black text-slate-400 mt-1 uppercase tracking-tight">Linking this payment to the employee's payroll history.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                {isVisible('amount') && (
                                    <FormField
                                        control={form.control}
                                        name="amount"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="uppercase text-[10px] font-black tracking-widest text-slate-500">{getLabel('amount', 'Amount (₹)')}</FormLabel>
                                                <FormControl>
                                                    <div className="relative">
                                                        <Input type="number" {...field} required={isMandatory('amount')} className="bg-slate-50 border-slate-200 h-14 text-black font-[1000] text-2xl rounded-2xl focus:ring-4 focus:ring-orange-500/10 pl-10" />
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">₹</span>
                                                    </div>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                                {isVisible('payment_mode') && (
                                    <FormField
                                        control={form.control}
                                        name="payment_mode"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className={cn(
                                                    "uppercase text-[10px] font-black tracking-widest",
                                                    isPersonal ? "text-indigo-500" : "text-slate-500"
                                                )}>{getLabel('payment_mode', 'Payment Mode')}</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value} required={isMandatory('payment_mode')}>
                                                    <FormControl>
                                                        <SelectTrigger className={cn(
                                                            "bg-slate-50 border-slate-200 h-14 text-black rounded-2xl font-black uppercase text-xs tracking-wider",
                                                            isPersonal && "bg-indigo-50/30 border-indigo-100"
                                                        )}>
                                                            <SelectValue placeholder="Mode" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-white border-slate-200 text-black rounded-xl">
                                                        <SelectItem value="cash" className="font-bold py-3 uppercase">CASH</SelectItem>
                                                        <SelectItem value="bank" className="font-bold py-3 uppercase">UPI / BANK</SelectItem>
                                                        <SelectItem value="cheque" className="font-bold py-3 text-indigo-600 uppercase">CHEQUE</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>

                            {/* Bank Selection Dropdown for UPI/Bank and Cheque */}
                            {(form.watch("payment_mode") === 'bank' || form.watch("payment_mode") === 'cheque') && (
                                <FormField
                                    control={form.control}
                                    name="bank_account_id"
                                    render={({ field }) => (
                                        <FormItem className="animate-in fade-in slide-in-from-top-1">
                                            <FormLabel className="uppercase text-[10px] font-black tracking-widest text-slate-500">
                                                {form.watch("payment_mode") === 'cheque' ? '📤 Drawn From (Bank Account)' : '💸 Pay From (Bank Account)'}
                                            </FormLabel>
                                            <Select value={field.value || ''} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger className="bg-slate-50 border-slate-200 h-14 text-black rounded-2xl font-bold">
                                                        <SelectValue placeholder="Select bank..." />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="bg-white border-slate-200 text-black rounded-xl z-[300]">
                                                    {bankAccounts.map(b => (
                                                        <SelectItem key={b.id} value={b.id} className="font-bold py-2.5">
                                                            {b.name}{b.is_default ? ' ⭐' : ''}
                                                        </SelectItem>
                                                    ))}
                                                    {bankAccounts.length === 0 && (
                                                        <div className="p-3 text-center text-slate-400 text-xs font-bold">No banks configured</div>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            {/* Cheque Fields */}
                            {form.watch("payment_mode") === 'cheque' && (
                                <div className="p-5 bg-orange-50 border border-orange-100 rounded-[24px] grid grid-cols-2 gap-4 animate-in zoom-in-95 duration-300">
                                    <div className="col-span-2 flex items-center justify-between pb-2 border-b border-orange-100 mb-1">
                                        <div className="flex items-center gap-2">
                                            <Landmark className="w-4 h-4 text-orange-600" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-orange-700">Cheque Options</span>
                                        </div>
                                        <label className={`flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-full border transition-all duration-200 ${
                                            instantClear 
                                            ? 'bg-emerald-100 border-emerald-500 shadow-sm shadow-emerald-200' 
                                            : 'bg-white border-orange-200 hover:bg-orange-50'
                                        }`}>
                                            <span className={`text-[10px] font-black uppercase tracking-wider ${instantClear ? 'text-emerald-800' : 'text-orange-800'}`}>
                                                {instantClear ? '⚡ Cleared Instantly' : '📅 Clear Later'}
                                            </span>
                                            <Switch
                                                checked={instantClear}
                                                onCheckedChange={setInstantClear}
                                                className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-200 border border-slate-300 shadow-sm"
                                            />
                                        </label>
                                    </div>

                                    {/* Info banner when instant */}
                                    {instantClear && (
                                        <div className="col-span-2 flex items-center gap-2 bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-2">
                                            <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <span className="text-[10px] text-emerald-700 font-bold">Cheque marked as cleared — skips pending reconciliation queue.</span>
                                        </div>
                                    )}
                                    <FormField
                                        control={form.control}
                                        name="cheque_no"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="uppercase text-[9px] font-black text-orange-500/60 tracking-widest">Cheque No</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder="000123" className="bg-white border-orange-100 h-11 font-bold rounded-xl" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="bank_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="uppercase text-[9px] font-black text-orange-500/60 tracking-widest">Bank Name</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder="e.g. SBI, HDFC" className="bg-white border-orange-100 h-11 font-bold rounded-xl" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    {/* Only show clearing date if NOT instant */}
                                    {!instantClear && (
                                        <FormField
                                            control={form.control}
                                            name="cheque_date"
                                            render={({ field }) => (
                                                <FormItem className="col-span-2">
                                                    <FormLabel className="uppercase text-[9px] font-black text-orange-500/60 tracking-widest">Expected Clearing Date</FormLabel>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <FormControl>
                                                                <Button variant="outline" className="w-full h-11 bg-white border-orange-100 text-left font-bold text-xs rounded-xl">
                                                                    {field.value ? format(field.value, "PPP") : "Select date"}
                                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                                </Button>
                                                            </FormControl>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0 z-[250] bg-white border-slate-200 shadow-2xl rounded-2xl overflow-hidden" align="center">
                                                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="bg-white" />
                                                        </PopoverContent>
                                                    </Popover>
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                {isVisible('payment_date') && (
                                    <FormField
                                        control={form.control}
                                        name="payment_date"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel className="uppercase text-[10px] font-black tracking-widest text-slate-500">{getLabel('payment_date', 'Expense Date')}</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button
                                                                variant={"outline"}
                                                                className={cn(
                                                                    "w-full pl-3 text-left font-bold bg-slate-50 border-slate-200 text-black h-12 rounded-xl hover:bg-slate-100",
                                                                    !field.value && "text-slate-400"
                                                                )}
                                                            >
                                                                {field.value ? (
                                                                    format(field.value, "PPP")
                                                                ) : (
                                                                    <span>Pick a date</span>
                                                                )}
                                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0 bg-white border-slate-200 shadow-2xl rounded-2xl z-[250]" align="start">
                                                        <Calendar
                                                            mode="single"
                                                            selected={field.value}
                                                            onSelect={field.onChange}
                                                            disabled={(date) =>
                                                                date > new Date() || date < new Date("1900-01-01")
                                                            }
                                                            initialFocus
                                                            className="bg-white"
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}

                                {isVisible('remarks') && (
                                    <FormField
                                        control={form.control}
                                        name="remarks"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="uppercase text-[10px] font-black tracking-widest text-slate-500">{getLabel('remarks', 'Description')}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} required={isMandatory('remarks')} placeholder={getLabel('remarks', "e.g. Office Rent, Fuel, Tea")} className="bg-slate-50 border-slate-200 h-12 text-black font-bold rounded-xl placeholder:text-slate-400" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>

                            <Button 
                                type="submit" 
                                disabled={isSubmitting}
                                className={cn(
                                    "w-full h-16 rounded-[24px] text-white font-black uppercase tracking-widest text-lg shadow-xl transition-all duration-300",
                                    isPersonal 
                                    ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200" 
                                    : "bg-black hover:bg-slate-800"
                                )}
                            >
                                {isSubmitting ? (
                                    <div className="flex items-center gap-3">
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        {isPersonal ? 'WITHDRAWING...' : 'RECORDING...'}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        {isPersonal ? <Landmark className="w-6 h-6" /> : <Save className="w-6 h-6" />}
                                        {isPersonal ? 'Record Withdrawal' : 'Record Expense'}
                                    </div>
                                )}
                            </Button>
                        </form>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
