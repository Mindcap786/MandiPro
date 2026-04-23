'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { format } from 'date-fns'
import { 
    Calendar as CalendarIcon, 
    Plus, 
    Trash2, 
    Save, 
    Loader2, 
    ChevronRight,
    ShieldCheck,
    Search,
    IndianRupee,
    Tag,
    History,
    Package,
    Minus,
    Banknote,
    CreditCard,
    Info,
    CheckCircle2,
    Wallet,
    Clock,
    Zap,
    X,
    Landmark
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { SearchableSelect } from '@/components/ui/searchable-select'
import { useAuth } from '@/components/auth/auth-provider'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { cacheGet, cacheSet, cacheIsStale } from '@/lib/data-cache'
import { ItemDialog } from '@/components/inventory/item-dialog'
import { Switch } from '@/components/ui/switch'
import { formatCommodityName } from '@/lib/utils/commodity-utils'
import { useArrivalsMasterData } from '@/hooks/mandi/useArrivalsMasterData'

const formSchema = z.object({
    arrival_date: z.date(),
    storage_location: z.string().min(1, 'Required'),
    supplier_id: z.string().min(1, 'Required'),
    arrival_type: z.enum(['commission', 'direct', 'commission_supplier']).default('direct'),
    
    // Vehicle & Logistics
    vehicle_number: z.string().optional().default(''),
    lot_no: z.string().optional().default(''),
    vehicle_type: z.string().optional().default(''),
    guarantor: z.string().optional().default(''),
    
    // Driver Details
    driver_name: z.string().optional().default(''),
    driver_mobile: z.string().optional().default(''),
    
    // Expenses
    loading_amount: z.union([z.number(), z.literal('')]).transform(v => v === '' ? 0 : v).default(0),
    other_expenses: z.union([z.number(), z.literal('')]).transform(v => v === '' ? 0 : v).default(0),
    
    advance: z.union([z.number(), z.literal('')]).transform(v => v === '' ? 0 : v),
    advance_payment_mode: z.enum(['credit', 'cash', 'upi_bank', 'cheque']).default('credit'),
    advance_bank_account_id: z.string().optional(),
    advance_cheque_no: z.string().optional(),
    advance_cheque_date: z.date().optional(),
    advance_bank_name: z.string().optional(),
    advance_cheque_status: z.boolean().default(false),
    notes: z.string().optional(),
    rows: z.array(z.object({
        item_id: z.string().min(1, 'Required'),
        unit: z.string().min(1, 'Required'),
        qty: z.union([z.number(), z.literal('')]).transform(v => v === '' ? 0 : v),
        rate: z.union([z.number(), z.literal('')]).transform(v => v === '' ? 0 : v),
        commission: z.union([z.number(), z.literal('')]).transform(v => v === '' ? 0 : v),
        weight_loss: z.union([z.number(), z.literal('')]).transform(v => v === '' ? 0 : v),
        less_units: z.union([z.number(), z.literal('')]).transform(v => v === '' ? 0 : v),
        commission_type: z.enum(['farmer', 'supplier']).default('farmer'),
        // Item Level Costs
        packing_cost: z.union([z.number(), z.literal('')]).transform(v => v === '' ? 0 : v).default(0),
        loading_cost: z.union([z.number(), z.literal('')]).transform(v => v === '' ? 0 : v).default(0),
        other_cut: z.union([z.number(), z.literal('')]).transform(v => v === '' ? 0 : v).default(0),
    }))
})

interface QuickPurchaseFormValues {
    arrival_date: Date;
    storage_location: string;
    supplier_id: string;
    arrival_type: 'commission' | 'direct' | 'commission_supplier';
    
    vehicle_number: string;
    lot_no: string;
    vehicle_type: string;
    guarantor: string;
    driver_name: string;
    driver_mobile: string;
    loading_amount: number | ''; // Trip Loading
    other_expenses: number | ''; // Trip Other Exp

    advance: number | '';
    advance_payment_mode: 'credit' | 'cash' | 'upi_bank' | 'cheque';
    advance_bank_account_id?: string;
    advance_cheque_no?: string;
    advance_cheque_date?: Date;
    advance_bank_name?: string;
    advance_cheque_status?: boolean;
    notes?: string;
    rows: {
        item_id: string;
        unit: string;
        qty: number | '';
        rate: number | '';
        commission: number | '';
        weight_loss: number | '';
        less_units: number | '';
        commission_type: 'farmer' | 'supplier';
        packing_cost: number | '';
        loading_cost: number | '';
        other_cut: number | '';
    }[];
}

export function QuickPurchaseForm() {
    const router = useRouter()
    const { profile, loading: authLoading } = useAuth()
    const [finalBillNo, setFinalBillNo] = useState<string | null>(null)
    
    // UI State
    const [showSuccessDialog, setShowSuccessDialog] = useState(false)
    const [isConfirming, setIsConfirming] = useState(false)
    const [submittedValues, setSubmittedValues] = useState<QuickPurchaseFormValues | null>(null)
    const [successData, setSuccessData] = useState<{ bill_no: string; totals: any; type: string } | null>(null)
    const [recordCompleted, setRecordCompleted] = useState(false)

    // Use the unified master data hook
    const { 
        contacts: masterContacts, 
        commodities: masterCommodities, 
        storageLocations: masterLocations, 
        bankAccounts: masterBanks,
        defaultCommissionRate: masterDefaultComm,
        loading: masterLoading,
        refetch: refetchMasterData
    } = useArrivalsMasterData(profile?.organization_id)

    const form = useForm<QuickPurchaseFormValues>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            arrival_date: new Date(),
            storage_location: '',
            supplier_id: '',
            arrival_type: 'direct',
            advance: 0,
            advance_payment_mode: 'credit',
            advance_bank_account_id: '',
            advance_cheque_no: '',
            advance_cheque_date: new Date(),
            advance_cheque_status: false,
            advance_bank_name: '',
            notes: '',
            rows: [{
                item_id: '',
                unit: 'Box',
                qty: 0,
                rate: 0,
                commission: 0,
                weight_loss: 0,
                less_units: 0,
                commission_type: 'farmer',
            }]
        }
    })

    const { isSubmitting } = form.formState


    const advanceValue = useWatch({ control: form.control, name: 'advance' })
    const paymentMode = useWatch({ control: form.control, name: 'advance_payment_mode' })
    const rows = useWatch({ control: form.control, name: 'rows' })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'rows'
    })

    useEffect(() => {
        if (!masterLoading && masterLocations.length > 0 && !form.getValues('storage_location')) {
            form.setValue('storage_location', masterLocations[0].name)
        }
    }, [masterLoading, masterLocations, form])

    useEffect(() => {
        if (!masterLoading && masterBanks.length > 0 && !form.getValues('advance_bank_account_id')) {
            const defaultBank = masterBanks.find(b => b.is_default) || masterBanks[0]
            form.setValue('advance_bank_account_id', defaultBank.id)
        }
    }, [masterLoading, masterBanks, form])

    const calculateRowFinancials = (row: any, type: string) => {
        if (!row) return { 
            grossValue: 0, 
            adjustedValue: 0, 
            commissionAmount: 0, 
            expensesTotal: 0, 
            netPayable: 0,
            unitCost: 0
        }

        const qty = Number(row.qty) || 0
        const rate = Number(row.rate) || 0
        const commPercent = Number(row.commission) || 0
        const lessPercentVal = (qty * (Number(row.weight_loss) || 0)) / 100
        const lessUnits = Number(row.less_units) || 0
        
        // 1. Gross Value
        const grossValue = qty * rate

        // 2. Adjusted Value (After Less % and Less Units)
        const adjustedQty = Math.max(0, qty - lessPercentVal - lessUnits)
        const adjustedValue = adjustedQty * rate
        
        // 3. Commission (10% of Gross - Less %)
        const valueAfterLessPercent = (qty - lessPercentVal) * rate
        const commissionAmount = (valueAfterLessPercent * commPercent) / 100
        
        // 4. Expenses (Packing + Loading + Other Cut)
        const packing = Number(row.packing_cost) || 0
        const loading = Number(row.loading_cost) || 0
        const otherCut = Number(row.other_cut) || 0
        const itemExpenses = packing + loading + otherCut

        // 5. Final Math based on Type
        let netPayable = 0
        if (type === 'direct') {
            // Mandi pays for everything
            netPayable = adjustedValue + itemExpenses
        } else {
            // Farmer/Supplier pays for everything
            netPayable = adjustedValue - commissionAmount - itemExpenses
        }

        return {
            grossValue,
            adjustedValue,
            commissionAmount,
            expensesTotal: itemExpenses,
            netPayable,
            unitCost: qty > 0 ? netPayable / qty : 0
        }
    }

    const totalFinancials = useMemo(() => {
        const type = form.watch('arrival_type')
        const tripLoading = Number(form.watch('loading_amount')) || 0
        const tripOther = Number(form.watch('other_expenses')) || 0
        
        const rowTotals = rows.reduce((acc, row) => {
            const financials = calculateRowFinancials(row, type)
            return {
                grossValue: acc.grossValue + financials.grossValue,
                adjustedValue: acc.adjustedValue + financials.adjustedValue,
                commissionAmount: acc.commissionAmount + financials.commissionAmount,
                expensesTotal: acc.expensesTotal + financials.expensesTotal,
                netPayable: acc.netPayable + financials.netPayable
            }
        }, { grossValue: 0, adjustedValue: 0, commissionAmount: 0, expensesTotal: 0, netPayable: 0 })

        // Apply trip-level expenses
        let finalPayable = 0
        if (type === 'direct') {
            finalPayable = rowTotals.netPayable + tripLoading + tripOther
        } else {
            finalPayable = rowTotals.netPayable - tripLoading - tripOther
        }

        return {
            ...rowTotals,
            tripExpenses: tripLoading + tripOther,
            billAmount: finalPayable,
            isOverpaid: (Number(advanceValue) || 0) > finalPayable
        }
    }, [rows, advanceValue, form.watch('arrival_type'), form.watch('loading_amount'), form.watch('other_expenses')])

    const onSubmit = async (values: QuickPurchaseFormValues) => {
        if (!profile?.organization_id) return
        
        // Prevent submission if any row is overpaid
        if (totalFinancials.isOverpaid) {
            toast.error("Advance amount exceeding the total bill amount. Please correct before saving.")
            return;
        }

        const totalAdvance = Number(values.advance) || 0;
        const totalNetBill = totalFinancials.billAmount;

        // Validate positive amount for non-credit modes
        if (values.advance_payment_mode !== 'credit' && totalAdvance <= 0) {
            toast.error(`Please enter a paid amount greater than 0 for ${values.advance_payment_mode.toUpperCase()} mode.`);
            form.setFocus(`advance`);
            return;
        }

        if (totalAdvance > totalNetBill && totalNetBill > 0) {
            toast.error(`Total Paid (₹${totalAdvance.toLocaleString()}) cannot exceed Purchase Bill Amount (₹${totalNetBill.toLocaleString()}).`);
            form.setFocus(`advance`);
            return;
        }

        // Bank Account Validation: Required for UPI/BANK and Cheque modes
        if ((values.advance_payment_mode === 'upi_bank' || values.advance_payment_mode === 'cheque') && !values.advance_bank_account_id) {
            toast.error(`Select a bank account to settle ${values.advance_payment_mode === 'upi_bank' ? 'UPI/BANK payment' : 'cheque'}.`);
            form.setFocus(`advance_bank_account_id`);
            return;
        }

        // Cheque Date Validation: Required if cheque is not instantly cleared
        if (values.advance_payment_mode === 'cheque' && !values.advance_cheque_status && !values.advance_cheque_date) {
            toast.error("If cheque will clear later, please specify the expected clearing date.");
            form.setFocus(`advance_cheque_date`);
            return;
        }

        const selectedParty = masterContacts.find(c => c.id === values.supplier_id)
        const hasCommission = values.rows.some(r => Number(r.commission) > 0)
        let submissionType: 'commission' | 'direct' | 'commission_supplier' = 'direct'
        if (hasCommission) {
            submissionType = selectedParty?.type === 'farmer' ? 'commission' : 'commission_supplier'
        }

        // STAGE 1: SHOW REVIEW SUMMARY (No DB save yet)
        setSubmittedValues(values)
        setSuccessData({
            bill_no: 'DRAFT',
            totals: { ...totalFinancials },
            type: submissionType
        })
        setShowSuccessDialog(true)
    }

    const handleFinalConfirm = async () => {
        if (!submittedValues || !profile?.organization_id) return
        
        const values = submittedValues
        const selectedParty = masterContacts.find(c => c.id === values.supplier_id)
        const hasCommission = values.rows.some(r => Number(r.commission) > 0)
        
        let submissionType: 'commission' | 'direct' | 'commission_supplier' = 'direct'
        if (hasCommission) {
            submissionType = selectedParty?.type === 'farmer' ? 'commission' : 'commission_supplier'
        }

        setIsConfirming(true)
        try {
            // Explicitly map items to ensure types and field names match RPC expectation precisely
            const rpcItems = values.rows.map(row => {
                const commodity = masterCommodities.find(i => i.id === row.item_id);
                const financials = calculateRowFinancials(row, values.arrival_type);
                return {
                    ...row,
                    qty: Number(row.qty),
                    rate: Number(row.rate),
                    commission: Number(row.commission),
                    weight_loss: Number(row.weight_loss),
                    less_units: Number(row.less_units),
                    arrival_type: values.arrival_type,
                    // Financial Mappings
                    gross_value: financials.grossValue,
                    adjusted_value: financials.adjustedValue,
                    commission_amount: financials.commissionAmount,
                    packing_cost: Number(row.packing_cost) || 0,
                    loading_cost: Number(row.loading_cost) || 0,
                    other_cut: Number(row.other_cut) || 0,
                    expenses_total: financials.expensesTotal,
                    net_payable: financials.netPayable,
                    unit_cost: financials.unitCost,
                    custom_attributes: {
                        ...commodity?.custom_attributes,
                        variety: (commodity?.custom_attributes as any)?.variety,
                        grade: (commodity?.custom_attributes as any)?.grade
                    }
                };
            })

            const { data, error } = await supabase.schema('mandi').rpc('record_quick_purchase', {
                p_org_id: profile.organization_id,
                p_party_id: values.supplier_id,
                p_arrival_date: format(values.arrival_date, 'yyyy-MM-dd'),
                p_bill_no: values.notes || '', 
                p_vehicle_number: values.vehicle_number,
                p_lot_no: values.lot_no,
                p_storage_location: values.storage_location,
                p_vehicle_type: values.vehicle_type,
                p_guarantor: values.guarantor,
                p_driver_name: values.driver_name,
                p_driver_mobile: values.driver_mobile,
                p_loading_amount: Number(values.loading_amount) || 0,
                p_advance_amount: Number(values.advance) || 0,
                p_other_expenses: Number(values.other_expenses) || 0,
                p_payment_mode: values.advance_payment_mode,
                p_lots: rpcItems
            })

            if (error) throw error

            let displayBillNo = data.contact_bill_no || data.bill_no
            if (data.arrival_id) {
                const { data: arrivalData } = await supabase
                    .schema('mandi')
                    .from('arrivals')
                    .select('contact_bill_no, bill_no')
                    .eq('id', data.arrival_id)
                    .maybeSingle()

                displayBillNo = arrivalData?.contact_bill_no || arrivalData?.bill_no || displayBillNo
            }

            setFinalBillNo(displayBillNo)
            setRecordCompleted(true)

            form.reset({
                ...form.getValues(),
                rows: [{
                    item_id: '',
                    unit: 'Box',
                    qty: 0,
                    rate: 0,
                    commission: 0,
                    weight_loss: 0,
                    less_units: 0,
                    commission_type: 'farmer',
                }],
                advance: 0,
                notes: ''
            })
        } catch (error: any) {
            toast.error(error.message || 'Failed to finalize purchase')
        } finally {
            setIsConfirming(false)
        }
    }

    if (masterLoading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        )
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-8 pb-32">
                {/* Header Section */}
                <div className="bg-white rounded-[32px] border border-slate-100 p-8 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <FormField
                            control={form.control}
                            name="arrival_date"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Purchase Date</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                        "h-14 pl-4 text-left font-black text-xl bg-slate-50 border-none rounded-2xl hover:bg-slate-100 transition-all",
                                                        !field.value && "text-muted-foreground"
                                                    )}
                                                >
                                                    {field.value ? (
                                                        format(field.value, "PPP")
                                                    ) : (
                                                        <span>Pick a date</span>
                                                    )}
                                                    <CalendarIcon className="ml-auto h-5 w-5 text-slate-400" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 rounded-2xl border-none shadow-2xl" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={field.value}
                                                onSelect={field.onChange}
                                                initialFocus
                                                className="p-4"
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="supplier_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Supplier / Farmer</FormLabel>
                                    <SearchableSelect
                                        options={masterContacts.map(c => ({
                                            label: `${c.name}${c.type === 'staff' ? ' (Staff)' : ''} - ${c.city || ''}`,
                                            value: c.id
                                        }))}
                                        value={field.value}
                                        onChange={field.onChange}
                                        placeholder="Select party..."
                                        className="h-14 bg-slate-50 border-none rounded-2xl text-xl font-black"
                                        error={!!form.formState.errors.supplier_id}
                                    />
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="vehicle_number"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Vehicle Number</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="XX-00-YY-0000" className="h-14 bg-slate-50 border-none rounded-2xl text-xl font-black placeholder:text-slate-200" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="lot_no"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Lot No</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="LOT-XXXX" className="h-14 bg-slate-50 border-none rounded-2xl text-xl font-black placeholder:text-slate-200" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="storage_location"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Storage Location</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-14 bg-slate-50 border-none rounded-2xl text-xl font-black">
                                                <SelectValue placeholder="Select location" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {masterLocations.map((loc) => (
                                                <SelectItem key={loc.name} value={loc.name}>{loc.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="hidden lg:block border-l border-slate-100 mx-4 h-14" />

                        <div className="flex flex-col justify-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Status</span>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-sm font-black text-slate-900 uppercase tracking-widest">Entry Active</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Transport & Expenses Section */}
                <div className="bg-white rounded-[32px] border border-slate-100 p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="bg-emerald-600 p-2 rounded-xl shadow-lg shadow-emerald-200">
                            <Truck className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-2xl font-black tracking-tight text-slate-900">Transport & Expenses</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <FormField
                            control={form.control}
                            name="vehicle_type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Vehicle Type</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-14 bg-slate-50 border-none rounded-2xl text-xl font-black">
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {['Pickup', 'Truck', 'Tractor', 'Other'].map(t => (
                                                <SelectItem key={t} value={t}>{t}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="guarantor"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Guarantor</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="Optional" className="h-14 bg-slate-50 border-none rounded-2xl text-xl font-black" />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="driver_name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Driver Name</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="Driver Name" className="h-14 bg-slate-50 border-none rounded-2xl text-xl font-black" />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="driver_mobile"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Mobile No</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="Mobile No" className="h-14 bg-slate-50 border-none rounded-2xl text-xl font-black" />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <div className="lg:col-span-4 grid grid-cols-3 gap-6 pt-4 border-t border-slate-50">
                            <FormField
                                control={form.control}
                                name="loading_amount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[9px] font-black uppercase text-slate-400 mb-2 block text-center">Loading Exp</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} className="h-12 bg-slate-50 border-none rounded-xl text-center font-black" />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                             <div className="flex flex-col items-center justify-center">
                                <span className="text-[9px] font-black uppercase text-slate-400 mb-2">Advance Paid</span>
                                <div className="h-12 w-full bg-slate-50 rounded-xl flex items-center justify-center font-black text-slate-900">
                                    ₹{Number(form.watch('advance')) || 0}
                                </div>
                            </div>
                            <FormField
                                control={form.control}
                                name="other_expenses"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[9px] font-black uppercase text-slate-400 mb-2 block text-center">Other Exp</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} className="h-12 bg-slate-50 border-none rounded-xl text-center font-black" />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>
                </div>

                {/* Line Items */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-4 mt-12">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-200">
                                <Tag className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="text-2xl font-black tracking-tight text-slate-900">Line Items</h2>
                        </div>
                        <Button
                            type="button"
                            onClick={() => append({
                                item_id: '',
                                unit: 'Box',
                                qty: 0,
                                rate: 0,
                                commission: 0,
                                weight_loss: 0,
                                less_units: 0,
                                commission_type: 'farmer',
                            })}
                            className="bg-slate-900 text-white hover:bg-black rounded-2xl h-12 px-6 font-black tracking-widest text-[10px] shadow-xl shadow-slate-200 uppercase flex items-center gap-2 group transition-all"
                        >
                            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                            Add Line Item
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                        {fields.map((field, index) => {
                            const row = form.watch(`rows.${index}`)
                            const rowFinancials = calculateRowFinancials(row)

                            return (
                                <div 
                                    key={field.id} 
                                    className="group bg-white rounded-[40px] border border-slate-100 p-8 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-500 relative overflow-hidden"
                                >
                                    <div className="absolute top-0 left-0 w-2 h-full bg-slate-100 group-hover:bg-blue-500 transition-colors" />
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                                        {/* Row Header */}
                                        <div className="md:col-span-12 flex items-center justify-between border-b border-slate-50 pb-4 mb-2">
                                            <div className="flex items-center gap-4">
                                                <div className="w-8 h-8 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center font-black text-[10px]">
                                                    {index + 1}
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Line Item</div>
                                                    <div className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                                        {(() => {
                                                            const item = masterCommodities.find(i => i.id === row.item_id);
                                                            const baseName = item?.name || "Pick Item";
                                                            const baseAttributes = (item?.custom_attributes as any) || {};
                                                            
                                                            return formatCommodityName(baseName, baseAttributes);
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => remove(index)}
                                                className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all h-8 w-8"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>

                                        {/* Item */}
                                        {/* Row 1: Commodity and Unit */}
                                        <div className="md:col-span-12 grid grid-cols-12 gap-6">
                                            <div className="col-span-12 md:col-span-8">
                                                <FormField
                                                    control={form.control}
                                                    name={`rows.${index}.item_id`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <FormLabel className="text-[9px] font-black uppercase text-slate-400">Commodity</FormLabel>
                                                                <ItemDialog onSuccess={masterLoading ? undefined : () => {}}>
                                                                    <Button type="button" variant="link" className="h-auto p-0 text-blue-600 text-[9px] font-bold uppercase tracking-widest hover:text-blue-800 transition-colors">
                                                                        + ADD
                                                                    </Button>
                                                                </ItemDialog>
                                                            </div>
                                                            <SearchableSelect
                                                                options={masterCommodities.map(item => ({
                                                                    value: item.id,
                                                                    label: formatCommodityName(item.name, item.custom_attributes)
                                                                }))}
                                                                value={field.value}
                                                                onChange={(val) => {
                                                                    field.onChange(val);
                                                                    const selectedItem = masterCommodities.find(i => i.id === val);
                                                                    if (selectedItem?.default_unit) {
                                                                        form.setValue(`rows.${index}.unit`, selectedItem.default_unit);
                                                                    }
                                                                }}
                                                                placeholder="Select Item"
                                                                error={!!(form.formState.errors.rows as any)?.[index]?.item_id}
                                                            />
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>

                                            <div className="col-span-12 md:col-span-4">
                                                <FormField
                                                    control={form.control}
                                                    name={`rows.${index}.unit`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-[9px] font-black uppercase text-slate-400 mb-2 block">Unit</FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger className="h-10 bg-slate-50 border-none rounded-xl text-sm font-black shadow-sm">
                                                                        <SelectValue placeholder="Unit" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent className="rounded-xl border-none shadow-xl">
                                                                    {['Box', 'Crate', 'Kgs', 'Tons', 'Nug', 'Pieces', 'Carton'].map(u => (
                                                                        <SelectItem key={u} value={u} className="font-bold text-xs">{u}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </div>

                                        {/* Price / Qty / Unit Grid */}
                                        {/* Row 2: Qty, Rate, Commission */}
                                        <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <FormField
                                                control={form.control}
                                                name={`rows.${index}.qty`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-[9px] font-black uppercase text-slate-400 mb-2 block text-center">Qty / Nugs</FormLabel>
                                                        <FormControl>
                                                            <Input 
                                                                type="number" 
                                                                {...field} 
                                                                onChange={e => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                                                className={cn(
                                                                    "h-10 font-black text-lg bg-slate-50 border-none text-center rounded-xl focus:ring-4 focus:ring-blue-500/10 shadow-sm",
                                                                    !!(form.formState.errors.rows as any)?.[index]?.qty && "ring-2 ring-red-500/20 border-red-500"
                                                                )}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`rows.${index}.rate`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-[9px] font-black uppercase text-slate-400 mb-2 block text-center">Rate / Price</FormLabel>
                                                        <FormControl>
                                                            <Input 
                                                                type="number" 
                                                                {...field} 
                                                                onChange={e => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                                                className={cn(
                                                                    "h-10 font-black text-lg bg-blue-50 border-none text-center text-blue-700 rounded-xl focus:ring-4 focus:ring-blue-500/10 shadow-sm",
                                                                    !!(form.formState.errors.rows as any)?.[index]?.rate && "ring-2 ring-red-500/20 border-red-500"
                                                                )}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`rows.${index}.commission`}
                                                render={({ field }) => {
                                                    return (
                                                        <FormItem>
                                                            <FormLabel className="text-[9px] font-black uppercase text-slate-400 mb-2 block text-center tracking-widest whitespace-nowrap">
                                                                Comm %
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input 
                                                                    type="number" 
                                                                    {...field} 
                                                                    onChange={e => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                                                    className="h-10 font-black text-lg bg-white border-slate-100 text-center rounded-xl focus:ring-4 focus:ring-blue-500/10 shadow-sm" 
                                                                />
                                                            </FormControl>
                                                        </FormItem>
                                                    )
                                                }}
                                            />
                                        </div>

                                        {(Number(row.commission) > 0 || Number(row.weight_loss) > 0 || Number(row.less_units) > 0) && (
                                            <div className="md:col-span-12 bg-slate-50/50 rounded-2xl border border-slate-100 p-4 animate-in fade-in slide-in-from-top-2">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                                                    <FormField
                                                        control={form.control}
                                                        name={`rows.${index}.weight_loss`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-[7px] font-black uppercase text-slate-400 tracking-tight mb-2 block text-center">Weight Loss %</FormLabel>
                                                                <FormControl>
                                                                    <Input 
                                                                        type="number" 
                                                                        {...field} 
                                                                        onChange={(e) => {
                                                                            const val = e.target.value === '' ? '' : Number(e.target.value);
                                                                            field.onChange(val);
                                                                            if (val === '' || Number(val) === 0) {
                                                                                // Clear the linked field
                                                                                form.setValue(`rows.${index}.less_units`, 0);
                                                                            } else if (row?.qty) {
                                                                                const lessUnits = (Number(row.qty) * Number(val)) / 100;
                                                                                form.setValue(`rows.${index}.less_units`, Number(lessUnits.toFixed(2)));
                                                                            }
                                                                        }}
                                                                        className="h-10 font-black text-sm bg-white border-slate-200 rounded-xl shadow-sm text-center" 
                                                                    />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name={`rows.${index}.less_units`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-[7px] font-black uppercase text-slate-400 tracking-tight mb-2 block text-center">Less Qty (Units)</FormLabel>
                                                                <FormControl>
                                                                    <Input 
                                                                        type="number" 
                                                                        {...field} 
                                                                        onChange={(e) => {
                                                                            const val = e.target.value === '' ? '' : Number(e.target.value);
                                                                            field.onChange(val);
                                                                            if (val === '' || Number(val) === 0) {
                                                                                // Clear the linked field
                                                                                form.setValue(`rows.${index}.weight_loss`, 0);
                                                                            } else if (row?.qty && Number(row.qty) > 0) {
                                                                                const weightLoss = (Number(val) / Number(row.qty)) * 100;
                                                                                form.setValue(`rows.${index}.weight_loss`, Number(weightLoss.toFixed(2)));
                                                                            }
                                                                        }}
                                                                        className="h-10 font-black text-sm bg-white border-slate-200 rounded-xl shadow-sm text-center" 
                                                                    />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    
                                                    <FormField
                                                        control={form.control}
                                                        name={`rows.${index}.packing_cost`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-[7px] font-black uppercase text-slate-400 tracking-tight mb-2 block text-center">Packing</FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" {...field} className="h-10 font-black text-sm bg-white border-slate-200 rounded-xl shadow-sm text-center" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name={`rows.${index}.loading_cost`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-[7px] font-black uppercase text-slate-400 tracking-tight mb-2 block text-center">Loading</FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" {...field} className="h-10 font-black text-sm bg-white border-slate-200 rounded-xl shadow-sm text-center" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name={`rows.${index}.commission_type`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-[7px] font-black uppercase text-slate-400 tracking-tight mb-2 block text-center">Comm Type</FormLabel>
                                                                <div className="flex bg-white border border-slate-200 rounded-xl p-1 h-10">
                                                                    {(['farmer', 'supplier'] as const).map(t => (
                                                                        <button
                                                                            key={t}
                                                                            type="button"
                                                                            onClick={() => field.onChange(t)}
                                                                            className={cn(
                                                                                "flex-1 rounded-lg text-[8px] font-black uppercase tracking-tighter transition-all",
                                                                                field.value === t ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                                                                            )}
                                                                        >
                                                                            {t}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <div className="flex flex-col items-center justify-center h-10 bg-blue-600/5 rounded-xl border border-blue-600/10 px-4">
                                                        <span className="text-[6px] font-black text-blue-400 uppercase tracking-widest mb-1 leading-none">Net Payable</span>
                                                        <span className="text-xs font-black text-blue-600 leading-none">₹{rowFinancials.netPayable.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Financial Summary Bar (Matches Screenshots) */}
                                        <div className="md:col-span-12 mt-4 pt-4 border-t border-slate-50">
                                            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                                <div className="flex flex-col items-center justify-center p-2 rounded-2xl bg-slate-50/50">
                                                    <span className="text-[7px] font-black uppercase text-slate-400 mb-1">Gross Value</span>
                                                    <span className="text-xs font-black text-slate-900">₹{rowFinancials.grossValue.toLocaleString()}</span>
                                                    <span className="text-[6px] text-slate-400">{row.qty} x {row.rate}</span>
                                                </div>
                                                <div className="flex flex-col items-center justify-center p-2 rounded-2xl bg-orange-50/50">
                                                    <span className="text-[7px] font-black uppercase text-orange-400 mb-1">Adjusted Value</span>
                                                    <span className="text-xs font-black text-orange-600">₹{rowFinancials.adjustedValue.toLocaleString()}</span>
                                                    <span className="text-[6px] text-orange-400">After cuts/discounts</span>
                                                </div>
                                                <div className="flex flex-col items-center justify-center p-2 rounded-2xl bg-purple-50/50">
                                                    <span className="text-[7px] font-black uppercase text-purple-400 mb-1">Commission</span>
                                                    <span className="text-xs font-black text-purple-600">₹{rowFinancials.commissionAmount.toLocaleString()}</span>
                                                    <span className="text-[6px] text-purple-400">{row.commission}% of adjusted</span>
                                                </div>
                                                <div className="flex flex-col items-center justify-center p-2 rounded-2xl bg-red-50/50">
                                                    <span className="text-[7px] font-black uppercase text-red-400 mb-1">Expenses & Cuts</span>
                                                    <span className="text-xs font-black text-red-600">₹{rowFinancials.expensesTotal.toLocaleString()}</span>
                                                    <span className="text-[6px] text-red-400">Incl. Other Cut</span>
                                                </div>
                                                <div className="flex flex-col items-center justify-center p-2 rounded-2xl bg-emerald-50/50 border border-emerald-100">
                                                    <span className="text-[7px] font-black uppercase text-emerald-500 mb-1">
                                                        {form.watch('arrival_type') === 'direct' ? 'Net Cost' : 
                                                         form.watch('arrival_type') === 'commission' ? 'Farmer Gets' : 'Supplier Gets'}
                                                    </span>
                                                    <span className="text-sm font-black text-emerald-600">₹{rowFinancials.netPayable.toLocaleString()}</span>
                                                    <span className="text-[6px] text-emerald-400">Net payable</span>
                                                </div>
                                                <div className="flex flex-col items-center justify-center p-2 rounded-2xl bg-slate-50/50">
                                                    <span className="text-[7px] font-black uppercase text-slate-400 mb-1">Unit Cost</span>
                                                    <span className="text-xs font-black text-slate-900">₹{rowFinancials.unitCost.toFixed(2)}</span>
                                                    <span className="text-[6px] text-slate-400">Per {row.unit}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}

                        {fields.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-100 rounded-[32px] gap-4">
                                <div className="p-4 bg-slate-50 rounded-full">
                                    <Plus className="w-8 h-8 text-slate-300" />
                                </div>
                                <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Click "Add Line Item" to start</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Global Footer Summary & Advance */}
                {fields.length > 0 && (
                    <div className="space-y-12 mt-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            {/* Left: Advance/Payout */}
                            <div className="p-8 bg-emerald-50/40 border border-emerald-100 rounded-[40px] space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                                        <Wallet className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none">Advance / Payout</h3>
                                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter mt-1">Record payment for this group</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField
                                        control={form.control}
                                        name="advance"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className={cn(
                                                    "text-[9px] font-black uppercase tracking-widest ml-1",
                                                    totalFinancials.isOverpaid ? "text-red-500" : "text-slate-600"
                                                )}>
                                                    Paid Amount
                                                    {totalFinancials.isOverpaid && <span className="ml-2 animate-pulse">[OVERPAID]</span>}
                                                </FormLabel>
                                                <FormControl>
                                                    <div className="relative">
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-emerald-600">₹</span>
                                                        <Input 
                                                            type="number" 
                                                            {...field} 
                                                            disabled={form.watch('advance_payment_mode') === 'credit'}
                                                            onChange={e => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                                            className={cn(
                                                                "h-14 bg-white pl-10 text-xl font-black rounded-2xl border-emerald-100 focus:ring-4 focus:ring-emerald-500/5",
                                                                totalFinancials.isOverpaid && "border-red-500 text-red-600",
                                                                form.watch('advance_payment_mode') === 'credit' && "opacity-50 cursor-not-allowed bg-slate-50"
                                                            )}
                                                        />
                                                    </div>
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="advance_payment_mode"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[9px] font-black uppercase text-slate-600 tracking-widest ml-1">Payment Mode</FormLabel>
                                                <div className="flex bg-white/50 backdrop-blur-sm border border-emerald-100 rounded-2xl p-1 gap-1 h-12">
                                                    {[
                                                        { value: 'credit', label: 'Udhaar' },
                                                        { value: 'cash', label: 'Cash' },
                                                        { value: 'upi_bank', label: 'UPI / BANK' },
                                                        { value: 'cheque', label: 'Cheque' },
                                                    ].map(mode => (
                                                        <button
                                                            key={mode.value}
                                                            type="button"
                                                            onClick={() => {
                                                                field.onChange(mode.value);
                                                                if (mode.value === 'credit') {
                                                                    form.setValue('advance', 0);
                                                                } else {
                                                                    // Automatically populate Paid Amount with Total Payable
                                                                    form.setValue('advance', totalFinancials.billAmount);
                                                                }
                                                            }}
                                                            className={cn(
                                                                "flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                                                field.value === mode.value ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-slate-600"
                                                            )}
                                                        >
                                                            {mode.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {Number(advanceValue) > 0 && paymentMode !== 'cash' && (
                                    <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                                        {/* Digital: Show only Settle To (saved bank accounts) */}
                                        {paymentMode === 'upi_bank' ? (
                                            <FormField
                                                control={form.control}
                                                name="advance_bank_account_id"
                                                render={({ field }) => (
                                                    <FormItem className="md:col-span-2">
                                                        <FormLabel className="text-[8px] font-black uppercase text-emerald-600 mb-1 block">Settle To</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-12 text-sm font-bold border-emerald-100 rounded-xl bg-white">
                                                                    <SelectValue placeholder="Select bank account..." />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent className="rounded-2xl border-none shadow-2xl">
                                                                {bankAccounts.map((b: any) => (
                                                                    <SelectItem key={b.id} value={b.id} className="py-3 font-bold">
                                                                        {b.name}{b.is_default ? ' ⭐' : ''}
                                                                    </SelectItem>
                                                                ))}
                                                                {bankAccounts.length === 0 && (
                                                                    <div className="px-4 py-3 text-xs text-slate-400 font-medium">No bank accounts set up. Add in Master Data.</div>
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />
                                        ) : (
                                            /* CHEQUE: Settle To + Cheque # + Party Bank Name + Expected Date + Mark Cleared toggle */
                                            <div className="md:col-span-2 w-full p-5 bg-slate-50/80 border border-slate-200/80 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2 shadow-sm">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
                                                    <div className="flex items-center gap-2 text-slate-800">
                                                        <Landmark className="w-4 h-4 text-emerald-600" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Cheque Settlement</span>
                                                    </div>
                                                    
                                                    <label className={`flex items-center gap-2 cursor-pointer shadow-sm select-none px-3 py-1.5 rounded-full border transition-all duration-200 w-fit ${
                                                        form.watch("advance_cheque_status")
                                                        ? 'bg-emerald-100 border-emerald-500 shadow-sm shadow-emerald-200'
                                                        : 'bg-white border-slate-200 hover:bg-slate-50'
                                                    }`}>
                                                        <span className={cn("text-[10px] font-black uppercase tracking-wider", form.watch("advance_cheque_status") ? 'text-emerald-800' : 'text-slate-600')}>
                                                            {form.watch("advance_cheque_status") ? '⚡ Cleared Instantly' : '📅 Clear Later'}
                                                        </span>
                                                        <Switch
                                                            checked={form.watch("advance_cheque_status")}
                                                            onCheckedChange={(checked) => form.setValue("advance_cheque_status", checked)}
                                                            className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-200 border border-slate-300 scale-90"
                                                        />
                                                    </label>
                                                </div>

                                                {form.watch("advance_cheque_status") && (
                                                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-emerald-800">
                                                        <Zap className="w-4 h-4 shrink-0 text-emerald-600" />
                                                        <span className="text-[11px] font-bold leading-tight">Payment marked as fully paid. A payment voucher will clear accounts payable instantly.</span>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <FormField
                                                        control={form.control}
                                                        name="advance_bank_account_id"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-1">
                                                                <FormLabel className="text-[10px] font-black uppercase tracking-widest text-emerald-600">📥 Settle From (Bank Account)</FormLabel>
                                                                <Select value={field.value || ''} onValueChange={field.onChange}>
                                                                    <FormControl>
                                                                        <SelectTrigger className="bg-white border-slate-200 h-10 text-xs font-bold text-slate-800 shadow-sm">
                                                                            <SelectValue placeholder="Select bank..." />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent className="bg-white z-[200]">
                                                                        {bankAccounts.map(b => (
                                                                            <SelectItem key={b.id} value={b.id} className="text-xs font-bold py-2">
                                                                                {b.name}{b.is_default ? ' ⭐' : ''}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name="advance_cheque_no"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-1">
                                                                <FormLabel className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Cheque No</FormLabel>
                                                                <FormControl>
                                                                    <Input {...field} placeholder="000123" className="h-10 text-xs font-bold border-slate-200 bg-white placeholder:text-slate-400" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={form.control}
                                                        name="advance_bank_name"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-1">
                                                                <FormLabel className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Party's Bank Name</FormLabel>
                                                                <FormControl>
                                                                    <Input {...field} placeholder="e.g. SBI, HDFC" className="h-10 text-xs font-bold border-slate-200 bg-white placeholder:text-slate-400" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                {!form.watch("advance_cheque_status") && (
                                                    <FormField
                                                        control={form.control}
                                                        name="advance_cheque_date"
                                                        render={({ field }) => (
                                                            <FormItem className="flex flex-col space-y-1">
                                                                <FormLabel className="text-[10px] font-black uppercase tracking-wider text-slate-600">Expected Clearing Date</FormLabel>
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <FormControl>
                                                                            <Button variant={"outline"} className={cn("h-10 text-left font-bold text-xs border-slate-200 bg-white", !field.value && "text-muted-foreground w-1/2")}>
                                                                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                                            </Button>
                                                                        </FormControl>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="w-auto p-0" align="start">
                                                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus required />
                                                                    </PopoverContent>
                                                                </Popover>
                                                            </FormItem>
                                                        )}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Right: Totals Summary */}
                            <div className={cn(
                                "grid gap-4 h-fit",
                                totalFinancials.commissionAmount > 0 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"
                            )}>
                                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col items-center justify-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Gross</span>
                                    <span className="text-2xl font-black text-slate-900">₹{totalFinancials.grossValue.toLocaleString()}</span>
                                </div>
                                {totalFinancials.commissionAmount > 0 && (
                                    <div className="bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100 flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
                                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Mandi Commission</span>
                                        <span className="text-2xl font-black text-emerald-600">₹{totalFinancials.commissionAmount.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 flex flex-col items-center justify-center">
                                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Balance Pending</span>
                                    <span className="text-2xl font-black text-blue-600">₹{totalFinancials.finalPay.toLocaleString()}</span>
                                </div>
                                <div className={cn(
                                    "bg-slate-900 p-6 rounded-[32px] flex items-center justify-between shadow-2xl shadow-slate-200 ring-8 ring-slate-50",
                                    totalFinancials.commissionAmount > 0 ? "md:col-span-3" : "md:col-span-2"
                                )}>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Payable</span>
                                        <span className="text-3xl font-black text-white">₹{totalFinancials.finalPay.toLocaleString()}</span>
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting || totalFinancials.isOverpaid || fields.length === 0}
                                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-16 px-10 font-black tracking-widest uppercase flex items-center gap-3 transition-all active:scale-95 group overflow-hidden relative shadow-xl shadow-blue-500/20"
                                    >
                                        {isSubmitting ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <>
                                                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-white/10 to-blue-400/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                                <CheckCircle2 className="w-6 h-6" />
                                                <span>Complete Purchase</span>
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </form>

            <Dialog open={showSuccessDialog} onOpenChange={(open) => {
                if (!open) {
                    setRecordCompleted(false)
                    setFinalBillNo(null)
                    setSubmittedValues(null)
                }
                setShowSuccessDialog(open)
            }}>
                <DialogContent className="max-w-2xl p-0 overflow-hidden border-none rounded-[40px] shadow-2xl bg-white">
                    {recordCompleted ? (
                        <div className="flex flex-col animate-in fade-in zoom-in duration-500">
                            {/* Success Header */}
                            <div className="bg-emerald-500 p-12 text-white flex flex-col items-center text-center relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent opacity-50" />
                                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl shadow-emerald-900/20 relative z-10 mb-6 scale-110">
                                    <CheckCircle2 className="w-14 h-14 text-emerald-500" />
                                </div>
                                <h2 className="text-4xl font-black tracking-tight uppercase relative z-10">Purchase Recorded</h2>
                                <p className="text-emerald-100 font-bold uppercase tracking-[0.3em] text-xs mt-3 relative z-10 opacity-90">
                                    Bill Generated Successfully
                                </p>
                            </div>

                            <div className="p-12 space-y-10 text-center">
                                <div className="space-y-3">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] block">Final Bill Number</span>
                                    <div className="inline-flex flex-col">
                                        <span className="text-6xl font-black text-slate-900 tracking-tighter tabular-nums antialiased">
                                            #{finalBillNo}
                                        </span>
                                        <div className="h-1.5 w-full bg-emerald-500 rounded-full mt-2" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6 bg-slate-50 p-8 rounded-[32px] border border-slate-100">
                                    <div className="space-y-1 text-left">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Payable</span>
                                        <span className="text-2xl font-black text-slate-900 italic">₹{successData?.totals.finalPay.toLocaleString()}</span>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Payment Mode</span>
                                        <span className="text-xl font-black text-blue-600 uppercase italic">{submittedValues?.advance_payment_mode}</span>
                                    </div>
                                </div>

                                <div className="flex flex-col md:flex-row gap-4">
                                    <Button 
                                        className="flex-1 h-16 rounded-3xl font-black uppercase tracking-[0.2em] text-xs bg-slate-900 text-white hover:bg-black transition-all shadow-2xl shadow-slate-200 active:scale-95 flex items-center justify-center gap-4 group"
                                        onClick={() => {
                                            setRecordCompleted(false)
                                            setFinalBillNo(null)
                                            setSubmittedValues(null)
                                            setShowSuccessDialog(false)
                                        }}
                                    >
                                        <CheckCircle2 className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
                                        Complete & New Entry
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-12 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
                                <div className="relative z-10 flex items-center gap-6">
                                    <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center shadow-xl shadow-slate-900/20">
                                        <Clock className="w-8 h-8 text-blue-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black tracking-tight uppercase">
                                            Review Purchase
                                        </h2>
                                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">
                                            Verify totals before logging to history
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-8 space-y-8 bg-white">
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Reference No</span>
                                        <span className="text-xl font-black text-slate-900 uppercase italic opacity-40 select-none">#Pending</span>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Supplier / Farmer</span>
                                        <span className="text-xl font-black text-slate-900">
                                            {contacts.find(c => c.id === form.getValues('supplier_id'))?.name || 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Items Summary</span>
                                    <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden">
                                        {form.getValues('rows').map((row, idx) => {
                                            const commodity = items.find(i => i.id === row.item_id)
                                            const financials = calculateRowFinancials(row)
                                            return (
                                                <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-black text-slate-900">{commodity?.name || 'Unknown Item'}</span>
                                                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                                                            {row.qty} {row.unit} @ ₹{row.rate}
                                                        </span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-sm font-black text-slate-900">₹{financials.billAmount.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div className="bg-slate-50 rounded-3xl p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <div className="flex flex-col items-center">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross</span>
                                        <span className="text-sm font-black text-slate-900">₹{successData?.totals.grossValue.toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Comm</span>
                                        <span className="text-sm font-black text-emerald-600">₹{successData?.totals.commissionAmount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Paid</span>
                                        <span className="text-sm font-black text-blue-600">₹{successData?.totals.advance.toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Payable</span>
                                        <span className="text-sm font-black text-slate-900">₹{successData?.totals.finalPay.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 border-t border-slate-50 bg-slate-50/50 flex gap-4">
                                <Button 
                                    variant="outline"
                                    className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] border-slate-200 hover:bg-white transition-all shadow-sm active:scale-95"
                                    onClick={() => {
                                        setRecordCompleted(false)
                                        setFinalBillNo(null)
                                        setSubmittedValues(null)
                                        setShowSuccessDialog(false)
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    disabled={isConfirming}
                                    className="flex-[1.5] h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-slate-900 text-white hover:bg-black transition-all shadow-xl shadow-slate-200 active:scale-95 gap-3"
                                    onClick={handleFinalConfirm}
                                >
                                    {isConfirming ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                                    ) : (
                                        <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                                    )}
                                    Submit Purchase
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </Form>
    )
}
