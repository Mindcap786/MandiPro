"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { 
    CalendarIcon, Plus, Trash2, Loader2, Search, User, 
    Truck, ArrowLeft, AlertTriangle, Landmark, Zap, CheckCircle2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
    Form, FormControl, FormField, FormItem, 
    FormLabel, FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog";
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "@/components/ui/table";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { db } from "@/lib/db";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { useFieldGovernance } from "@/hooks/useFieldGovernance";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Keep Select for payment_mode and lot_id
import { useRouter, useSearchParams } from "next/navigation";
import { useEnterToTab } from "@/hooks/use-enter-to-tab";
import { QRCodeSVG } from "qrcode.react";
import { confirmSaleTransactionWithFallback } from "@/lib/mandi/confirm-sale-transaction";
import { calculateSaleItemTaxBreakdown, calculateSaleTotals } from "@/lib/sales-tax";

const saleItemSchema = z.object({
    item_id: z.string().min(1, "Item required"),
    lot_id: z.string().min(1, "Lot/Stock required"),
    qty: z.coerce.number().min(1),
    rate: z.coerce.number().min(0),
    amount: z.coerce.number().min(0),
    avail_qty: z.coerce.number().optional(), // For validation
    unit: z.string().optional()
}).refine(data => {
    if (data.avail_qty !== undefined && data.qty > data.avail_qty) {
        return false;
    }
    return true;
}, {
    message: "Exceeds available stock",
    path: ["qty"]
});

const formSchema = z.object({
    sale_date: z.date(),
    buyer_id: z.string().min(1, "Buyer required"),
    payment_mode: z.string(),
    due_date: z.date().optional(),
    sale_items: z.array(saleItemSchema).min(1, "Add items to sell"),
    loading_charges: z.coerce.number().min(0).optional(),
    unloading_charges: z.coerce.number().min(0).optional(),
    other_expenses: z.coerce.number().min(0).optional(),
    discount_percent: z.coerce.number().min(0).max(100).optional(),
    discount_amount: z.coerce.number().min(0).optional(),
    cheque_no: z.string().optional(),
    cheque_date: z.date().optional(),
    bank_name: z.string().optional(),
    bank_account_id: z.string().optional(),
    cheque_status: z.boolean().default(false)
}).superRefine((data, ctx) => {
    // Validate that the sum of quantities for a single lot doesn't exceed its available stock
    const lotTotals: Record<string, number> = {};

    data.sale_items.forEach((item) => {
        if (!item.lot_id || item.avail_qty === undefined) return;
        lotTotals[item.lot_id] = (lotTotals[item.lot_id] || 0) + item.qty;
    });

    data.sale_items.forEach((item, index) => {
        if (item.lot_id && item.avail_qty !== undefined) {
            if (lotTotals[item.lot_id] > item.avail_qty) {
                 ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Total qty (${lotTotals[item.lot_id]}) exceeds available (${item.avail_qty})`,
                    path: ["sale_items", index, "qty"]
                 });
            }
        }
    });
});

function NewSaleForm() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const { language, t } = useLanguage();
    const [buyers, setBuyers] = useState<any[]>([]);
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [lots, setLots] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [priceLists, setPriceLists] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [amountPaid, setAmountPaid] = useState<number>(0);
    const amountPaidManuallyEdited = useRef(false);
    const discountManuallyEdited = useRef<'percent' | 'amount' | null>(null);
    const [taxSettings, setTaxSettings] = useState({
        market_fee_percent: 0.0,
        nirashrit_percent: 0.0,
        misc_fee_percent: 0.0,
        gst_enabled: false,
        gst_type: 'intra',
        cgst_percent: 0,
        sgst_percent: 0,
        igst_percent: 0,
    });
    const [defaultCreditDays, setDefaultCreditDays] = useState<number | ''>(15);
    const [orgStateCode, setOrgStateCode] = useState<string | null>(null);
    const [buyerWarning, setBuyerWarning] = useState<{ isOverdue: boolean; overLimit: boolean; balance: number } | null>(null);
    const [maxInvoiceAmount, setMaxInvoiceAmount] = useState<number>(0);
    const [orgSettings, setOrgSettings] = useState<any>(null);

    const { isVisible, isMandatory, getLabel } = useFieldGovernance('sales');
    const searchParams = useSearchParams();
    const router = useRouter();
    const orderId = searchParams.get('order_id');
    const challanId = searchParams.get('challan_id');

    const formRef = useRef<HTMLFormElement>(null);
    useEnterToTab(formRef);

    const form = useForm<any>({
        resolver: zodResolver(formSchema),
        mode: "onChange",
        defaultValues: {
            sale_date: new Date(),
            buyer_id: "", // Initialize to empty string
            payment_mode: "credit",
            due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Default 15 days
            sale_items: [{ item_id: "", lot_id: "", qty: 10, rate: 0, amount: 0 }],
            loading_charges: 0,
            unloading_charges: 0,
            other_expenses: 0,
            discount_percent: 0,
            discount_amount: 0,
            cheque_date: new Date(),
            bank_account_id: "",
            cheque_status: false
        }
    });

    const [showConfirm, setShowConfirm] = useState(false);
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "sale_items"
    });

    const [pendingValues, setPendingValues] = useState<any>(null);

    // Auto-populate Amount Received is handled by the useEffect below (single source of truth)

    const [priceHistory, setPriceHistory] = useState<Record<string, number>>({}); // buyer_id -> { item_id -> price }

    const fetchPriceHistory = async (buyerId: string) => {
        try {
            // Step 1: get this buyer's sale IDs
            const { data: salesRows } = await supabase
                .schema('mandi')
                .from('sales')
                .select('id')
                .eq('buyer_id', buyerId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!salesRows || salesRows.length === 0) return;

            const saleIds = salesRows.map((s: any) => s.id);

            // Step 2: get last-used rate per item across those sales
            // sale_items has no item_id column — join through lot to get commodity id
            const { data } = await supabase
                .schema('mandi')
                .from('sale_items')
                .select('rate, lot:lots(item_id)')
                .in('sale_id', saleIds)
                .order('created_at', { ascending: false })
                .limit(50);

            if (data) {
                const history: Record<string, number> = {};
                data.forEach((d: any) => {
                    const itemId = d.lot?.item_id;
                    if (itemId && !history[itemId]) history[itemId] = d.rate;
                });
                setPriceHistory(history);
            }
        } catch {
            // Silently fail — price history is non-critical
        }
    };

    const fetchCreditStatus = async (buyerId: string) => {
        try {
            // Try view_party_balances which is a view in mandi schema
            const { data, error } = await supabase
                .schema('mandi')
                .from('view_party_balances')
                .select('net_balance')
                .eq('contact_id', buyerId)
                .eq('organization_id', profile?.organization_id)
                .maybeSingle();

            if (!error && data) {
                setBuyerWarning({
                    isOverdue: false,
                    overLimit: false,
                    balance: Number(data.net_balance)
                });
            }
        } catch {
            // Silently fail — credit status is non-critical
        }
    };


    const selectedBuyer = form.watch('buyer_id');
    const selectedBuyerInfo = buyers.find(b => b.id === selectedBuyer);

    useEffect(() => {
        if (selectedBuyer) {
            fetchPriceHistory(selectedBuyer);
            fetchCreditStatus(selectedBuyer);
        } else {
            setBuyerWarning(null);
        }
    }, [selectedBuyer]);

    useEffect(() => {
        if (selectedBuyer && buyers.length > 0 && buyerWarning) {
            const buyerInfo = buyers.find(b => b.id === selectedBuyer);
            if (buyerInfo?.credit_limit && buyerWarning.balance > buyerInfo.credit_limit) {
                setBuyerWarning(prev => prev ? { ...prev, overLimit: true } : prev);
            }
        }
    }, [selectedBuyer, buyers, buyerWarning?.balance]);

    const paymentMode = form.watch('payment_mode');
    const saleDate = form.watch('sale_date');
    useEffect(() => {
        if (paymentMode === 'credit') {
            const baseDate = saleDate || new Date();
            const days = Number(defaultCreditDays) || 0;
            form.setValue("due_date", new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000));
        }
        
        if ((paymentMode === 'UPI/BANK' || paymentMode === 'cheque') && bankAccounts.length > 0) {
            const currentBank = form.getValues("bank_account_id");
            if (!currentBank) {
                const defaultBank = bankAccounts.find(b => b.is_default) || bankAccounts[0];
                if (defaultBank) {
                    form.setValue("bank_account_id", defaultBank.id, { shouldValidate: true, shouldDirty: true });
                }
            }
        }
    }, [paymentMode, defaultCreditDays, saleDate, bankAccounts, form]);

    useEffect(() => {
        const pMode = form.watch('payment_mode');
        const watchItems = form.watch('sale_items') || [];
        const safeWatchItems = Array.isArray(watchItems) ? watchItems : [];
        
        const loadingCharges = Number(form.watch('loading_charges')) || 0;
        const unloadingCharges = Number(form.watch('unloading_charges')) || 0;
        const otherExpenses = Number(form.watch('other_expenses')) || 0;
        const discountAmount = Number(form.watch('discount_amount')) || 0;

        const totals = calculateSaleTotals({
            items: safeWatchItems.map((item: any) => {
                const itemInfo = items.find(it => it.id === item?.item_id);
                return {
                    amount: item?.amount,
                    gst_rate: itemInfo?.gst_rate,
                    is_gst_exempt: itemInfo?.is_gst_exempt,
                };
            }),
            taxSettings,
            orgStateCode,
            buyerStateCode: selectedBuyerInfo?.state_code,
            loadingCharges,
            unloadingCharges,
            otherExpenses,
            discountAmount,
        });

        const gTotal = totals.grandTotal;

        if (pMode === 'credit') {
            setAmountPaid(0);
            amountPaidManuallyEdited.current = false;
        } else if (!amountPaidManuallyEdited.current) {
            setAmountPaid(gTotal);
        }
    }, [form.watch('payment_mode'), JSON.stringify(form.watch('sale_items')), form.watch('loading_charges'), form.watch('unloading_charges'), form.watch('other_expenses'), form.watch('discount_amount'), taxSettings, items, orgStateCode, selectedBuyerInfo?.state_code]);

    const fetchMasters = async () => {
        const orgId = profile?.organization_id;
        if (!orgId) return;

        try {
            const schema = 'mandi';
            
            const [
                { data: buyerData, error: buyerError },
                { data: bankData, error: bankError },
                { data: orgData, error: orgError },
                { data: itemData, error: itemError },
                { data: accountsData, error: accountsError },
                { data: lotData, error: lotError },
                { data: settingsData, error: settingsError }
            ] = await Promise.all([
                supabase
                    .schema('mandi')
                    .from('contacts')
                    .select('id, name, type, city, status')
                    .eq('organization_id', orgId)
                    .eq('contact_type', 'buyer')
                    .or('status.is.null,status.eq.active')
                    .order('name'),
                supabase.schema('mandi').from('accounts').select('id, name, is_default, code, description').eq('organization_id', orgId).eq('account_sub_type', 'bank').eq('type', 'asset').eq('is_active', true),
                // Always use core schema for organizations — mandi.organizations does not exist
                supabase.schema('core').from('organizations').select('name, settings').eq('id', orgId).single(),
                supabase.schema('mandi').from('commodities').select('id, name, local_name, sku_code, custom_attributes, gst_rate').eq('organization_id', orgId),
                supabase.schema('mandi').from('accounts').select('*').eq('organization_id', orgId),
                supabase.schema('mandi').from('lots').select('*, contact:contacts(name)').eq('organization_id', orgId).gt('current_qty', 0).eq('status', 'active'),
                supabase.schema('mandi').from('mandi_settings' as any).select('market_fee_percent, nirashrit_percent, misc_fee_percent, default_credit_days, state_code, gst_enabled, gst_type, cgst_percent, sgst_percent, igst_percent').eq('organization_id', orgId).maybeSingle()
            ]);

            if (buyerError) console.error("Error fetching buyers:", buyerError);
            if (buyerData) setBuyers(buyerData);

            if (bankError) console.error("Error fetching bank accounts:", bankError);
            if (bankData) setBankAccounts(bankData);

            if (orgError) console.error("Error fetching org settings:", orgError);
            if (orgData) setOrgSettings({ name: orgData.name, ...orgData.settings });

            if (itemError) console.error("Error fetching items:", itemError);
            if (itemData) setItems(itemData);



            if (accountsError) console.error("Error fetching accounts:", accountsError);
            if (accountsData) setAccounts(accountsData);

            if (lotError) console.error("Error fetching lots:", lotError);
            if (lotData) setLots(lotData);

            if (settingsError) console.error("Error fetching mandi settings:", settingsError);
            if (settingsData) {
                setOrgStateCode(settingsData.state_code);
                setTaxSettings({
                    market_fee_percent: Number(settingsData.market_fee_percent) || 0,
                    nirashrit_percent: Number(settingsData.nirashrit_percent) || 0,
                    misc_fee_percent: Number(settingsData.misc_fee_percent) || 0,
                    gst_enabled: settingsData.gst_enabled || false,
                    gst_type: settingsData.gst_type || 'intra',
                    cgst_percent: Number(settingsData.cgst_percent) || 0,
                    sgst_percent: Number(settingsData.sgst_percent) || 0,
                    igst_percent: Number(settingsData.igst_percent) || 0,
                });

                if (settingsData.default_credit_days !== undefined && settingsData.default_credit_days !== null) {
                    setDefaultCreditDays(Number(settingsData.default_credit_days));
                    if (form.getValues('payment_mode') === 'credit') {
                        const baseDate = form.getValues('sale_date') || new Date();
                        form.setValue("due_date", new Date(baseDate.getTime() + Number(settingsData.default_credit_days) * 24 * 60 * 60 * 1000));
                    }
                }
                if (settingsData.max_invoice_amount != null) {
                    setMaxInvoiceAmount(Number(settingsData.max_invoice_amount));
                }
            }

            // If converting from Sales Order (Mandi specific)
            if (orderId) {
                const { data: orderData } = await supabase
                    .schema('mandi')
                    .from('sales_orders')
                    .select('*, items:sales_order_items(*)')
                    .eq('id', orderId)
                    .single();

                if (orderData) {
                    form.setValue('buyer_id', orderData.buyer_id);

                    if (orderData.items && orderData.items.length > 0) {
                        const prefilledItems = orderData.items.map((item: any) => {
                            const lot = lotData?.find((l: any) => l.item_id === item.item_id);
                            return {
                                item_id: item.item_id,
                                lot_id: lot?.id || "",
                                qty: item.quantity,
                                rate: item.unit_price,
                                amount: item.total_price,
                                avail_qty: lot?.current_qty || 0,
                                unit: item.unit || "Kg"
                            };
                        });
                        form.setValue('sale_items', prefilledItems);
                    }

                    toast({
                        title: "Order Loaded",
                        description: `Pre-filled from Sales Order #${(orderData as any).order_number}.`,
                    });
                }
            }

            // If converting from Delivery Challan (Mandi specific)
            if (challanId) {
                const { data: dcData, error: dcError } = await supabase
                    .schema('mandi')
                    .from('delivery_challans')
                    .select('*, items:delivery_challan_items(*)')
                    .eq('id', challanId)
                    .single();

                if (dcData && !dcError) {
                    form.setValue('buyer_id', (dcData as any).contact_id || (dcData as any).buyer_id);

                    if (dcData.items && dcData.items.length > 0) {
                        const prefilledItems = dcData.items.map((item: any) => {
                            const lot = lotData?.find((l: any) => l.item_id === item.item_id);
                            return {
                                item_id: item.item_id,
                                lot_id: item.lot_id || (lot?.id || ""),
                                qty: item.quantity_dispatched || item.quantity,
                                rate: 0,
                                amount: 0,
                                avail_qty: lot?.current_qty || (item.quantity_dispatched || item.quantity),
                                unit: item.unit || "Kg"
                            };
                        });
                        form.setValue('sale_items', prefilledItems);
                    }
                }
            }
        } catch (e) {
            console.error("Critical error in fetchMasters:", e);
        }
    };
    
    // Call fetchMasters on mount and when organization changes
    useEffect(() => {
        if (profile?.organization_id) {
            fetchMasters();
        }
    }, [profile?.organization_id]);

    const applyTierPricing = (index: number, itemId: string, qty: number) => {
        const buyer = buyers.find(b => b.id === form.getValues('buyer_id'));
        if (buyer?.price_list_id && itemId) {
            const pl = priceLists.find(p => p.id === buyer.price_list_id);
            if (pl && pl.items) {
                const validTiers = pl.items.filter((pli: any) => pli.item_id === itemId && (pli.min_quantity || 0) <= qty);
                if (validTiers.length > 0) {
                    validTiers.sort((a: any, b: any) => (b.min_quantity || 0) - (a.min_quantity || 0));
                    const price = validTiers[0].unit_price;
                    form.setValue(`sale_items.${index}.rate`, price);
                    form.setValue(`sale_items.${index}.amount`, qty * price);
                } else {
                    const baseTier = pl.items.find((pli: any) => pli.item_id === itemId && (pli.min_quantity || 0) === 0);
                    if (baseTier) {
                        const price = baseTier.unit_price;
                        form.setValue(`sale_items.${index}.rate`, price);
                        form.setValue(`sale_items.${index}.amount`, qty * price);
                    }
                }
            }
        }
    };

    // 2. Submit Logic (Now using ACID RPC)
    // Offline Status
    const isOnline = useOnlineStatus();

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        const buyerInfo = buyers.find(b => b.id === values.buyer_id);
        const totals = calculateSaleTotals({
            items: values.sale_items.map((item: any) => {
                const itemInfo = items.find(i => i.id === item.item_id);
                return {
                    amount: item.amount,
                    gst_rate: itemInfo?.gst_rate,
                    is_gst_exempt: itemInfo?.is_gst_exempt,
                };
            }),
            taxSettings,
            orgStateCode,
            buyerStateCode: buyerInfo?.state_code,
            loadingCharges: values.loading_charges,
            unloadingCharges: values.unloading_charges,
            otherExpenses: values.other_expenses,
            discountAmount: values.discount_amount,
        });

        if (maxInvoiceAmount > 0 && totals.grandTotal > maxInvoiceAmount) {
            toast({
                title: "Invoice Limit Exceeded",
                description: `This invoice total (₹${totals.grandTotal.toLocaleString()}) exceeds the maximum limit of ₹${maxInvoiceAmount.toLocaleString()}.`,
                variant: "destructive"
            });
            return;
        }

        setPendingValues(values);
        setShowConfirm(true);
    };

    const handleConfirmPost = async () => {
        if (!pendingValues) return;
        const values = pendingValues;

        // --- MANDATORY PAYMENT VALIDATION ---
        // If it's not a credit sale, the user MUST enter an amount received.
        if (values.payment_mode !== 'credit' && amountPaid <= 0) {
            toast({
                title: "Amount Received Required",
                description: `Please enter the amount received for this ${values.payment_mode} sale.`,
                variant: "destructive"
            });
            return;
        }

        setShowConfirm(false);
        setIsSubmitting(true);
        try {
            const buyerInfo = buyers.find(b => b.id === values.buyer_id);
            const totals = calculateSaleTotals({
                items: values.sale_items.map((item: any) => {
                    const itemInfo = items.find(i => i.id === item.item_id);
                    return {
                        amount: item.amount,
                        gst_rate: itemInfo?.gst_rate,
                        is_gst_exempt: itemInfo?.is_gst_exempt,
                    };
                }),
                taxSettings,
                orgStateCode,
                buyerStateCode: buyerInfo?.state_code,
                loadingCharges: values.loading_charges,
                unloadingCharges: values.unloading_charges,
                otherExpenses: values.other_expenses,
            });
            const totalItemsRaw = totals.subTotal;
            const grandTotalRaw = totals.grandTotal;

            const isPartial = values.payment_mode !== 'credit' && amountPaid < grandTotalRaw;

            if (isPartial && !values.buyer_id) {
                throw new Error("Buyer selection is required for partial payments.");
            }

            if (!profile?.organization_id) {
                throw new Error("User profile not loaded. Please refresh.");
            }
            const totalAmount = totalItemsRaw;

            // 1. OFFLINE HANDLING
            if (!isOnline) {
                await db.sales.add({
                    id: crypto.randomUUID(),
                    contact_id: values.buyer_id,
                    total_amount: totalAmount,
                    items: values.sale_items,
                    sale_date: values.sale_date.toISOString(),
                    created_at: Date.now(),
                    sync_status: 'pending'
                });

                toast({
                    title: "Saved Offline",
                    description: "Transaction saved locally. Will sync when online.",
                    className: "bg-yellow-500 text-black border-none"
                });
                router.replace('/sales');
                return;
            }

            // 2. ONLINE HANDLING
            // Validate Stock Pre-flight (Checking local state for immediate feedback)
            for (const item of values.sale_items) {
                if (!item.lot_id) {
                    throw new Error("Please select a Stock Lot for every item.");
                }
                const currentLot = lots.find(l => l.id === item.lot_id);
                if (!currentLot) {
                    throw new Error("Invalid Lot selected.");
                }

                // USER REQUIREMENT: Direct arrivals must have a purchase rate before sale.
                // Commission arrivals can be sold without a purchase rate (rate=0) initially.
                if ((currentLot.arrival_type || 'direct') === 'direct' && (Number(currentLot.supplier_rate) <= 0)) {
                    throw new Error(`Please enter the purchase rate for ${currentLot.lot_code} in Arrivals/Purchase Bills before selling.`);
                }

                if (currentLot.current_qty < item.qty) {
                    throw new Error(`Insufficient stock for ${currentLot.lot_code}. Available: ${currentLot.current_qty} ${currentLot.unit}`);
                }
            }

            const saleItemsWithTax = values.sale_items.map(item => {
                const itemData = items.find(i => i.id === item.item_id);
                const itemTax = calculateSaleItemTaxBreakdown({
                    amount: item.amount,
                    gstRate: itemData?.gst_rate,
                    isGstExempt: itemData?.is_gst_exempt,
                    taxSettings,
                    orgStateCode,
                    buyerStateCode: buyerInfo?.state_code,
                });

                return {
                    ...item,
                    gst_rate: itemTax.gstRateApplied,
                    gst_amount: itemTax.gstTotal,
                    hsn_code: itemData?.hsn_code || null
                };
            });

            const idempotencyKey = crypto.randomUUID();

            const rpcPaymentMode = values.payment_mode;

            const { error, data: rpcResponse, warning } = await confirmSaleTransactionWithFallback({
                organizationId: profile.organization_id,
                buyerId: values.buyer_id,
                saleDate: values.sale_date.toISOString().split('T')[0],
                paymentMode: rpcPaymentMode,
                totalAmount,
                items: saleItemsWithTax,
                marketFee: totals.marketFee,
                nirashrit: totals.nirashrit,
                miscFee: totals.miscFee,
                loadingCharges: Number(values.loading_charges) || 0,
                unloadingCharges: Number(values.unloading_charges) || 0,
                otherExpenses: Number(values.other_expenses) || 0,
                discountAmount: Number(values.discount_amount) || 0,
                idempotencyKey,
                dueDate: (values.payment_mode === 'credit' || isPartial) && values.due_date ? values.due_date.toISOString().split('T')[0] : null,
                bankAccountId: values.bank_account_id || null,
                chequeNo: values.cheque_no || null,
                chequeDate: values.cheque_date ? values.cheque_date.toISOString().split('T')[0] : null,
                chequeStatus: values.cheque_status,
                bankName: values.payment_mode === 'cheque' ? values.bank_name : null,
                amountReceived: amountPaid,
                cgstAmount: totals.cgstAmount,
                sgstAmount: totals.sgstAmount,
                igstAmount: totals.igstAmount,
                gstTotal: totals.gstTotal,
                placeOfSupply: totals.isIgst ? (buyerInfo?.state_code || null) : (orgStateCode || null),
                buyerGstin: buyerInfo?.gstin || null,
                isIgst: totals.isIgst
            });

            if (error) throw error;
            if (warning) {
                toast({
                    title: "Sale Saved",
                    description: warning,
                    variant: "default"
                });
            }


            // Purchase ledger is handled at arrival time by post_arrival_ledger.
            // No need to re-post purchase cost on sale.

            toast({ title: "Sale Confirmed", description: "Invoice & Ledger posted successfully." });
            router.replace('/sales');

        } catch (e: any) {
            console.error(e);
            toast({ title: "Transaction Failed", description: e.message || e.details, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Form {...form}>
            <form ref={formRef}
                onSubmit={form.handleSubmit(onSubmit, (errors: any) => {
                    console.error("Validation Errors:", errors);
                    
                    const missingFields: string[] = [];
                    if (errors.buyer_id) missingFields.push("Buyer/Customer");
                    if (errors.sale_items) missingFields.push("Item Batches/Quantities");
                    if (errors.sale_date) missingFields.push("Invoice Date");

                    const description = missingFields.length > 0 
                        ? `Please fill required fields: ${missingFields.join(", ")}.`
                        : "Please check the items table for missing Batch/Source or other required fields.";

                    toast({
                        title: "Validation Failed",
                        description: description,
                        variant: "destructive"
                    });
                })}
                className="space-y-4"
            >
                <div className="bg-[#FCFCFC] border-2 border-slate-300 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.05)] relative overflow-hidden w-full max-w-7xl mx-auto">
                    {/* Invoice Top Bar - Decorative */}
                    <div className="h-1 bg-indigo-600 w-full" />

                    <div className="p-4 md:p-6">
                        {/* Header Area */}
                        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8 border-b border-slate-100 pb-6">
                            <div className="space-y-0.5">
                                <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-2">
                                    <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center text-white">
                                        <Truck className="w-4 h-4" />
                                    </div>
                                    INVOICE
                                </h2>
                                <p className="text-slate-700 font-bold tracking-[0.2em] uppercase text-[8px] ml-1">
                                    Official Sales Record • Mandi Pro
                                </p>
                            </div>

                            <div className="text-right flex items-center justify-end gap-3 md:gap-4 w-full md:w-auto mt-4 md:mt-0 flex-wrap md:flex-nowrap">
                                {paymentMode === 'credit' && (
                                    <div className="bg-slate-50 border border-slate-100 p-3 md:p-3.5 rounded-xl flex flex-col justify-center items-start flex-1 min-w-[110px] md:min-w-[120px] shadow-sm">
                                        <div className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-2 w-full text-left truncate">Def. Credit</div>
                                        <div className="flex items-center gap-2 w-full">
                                            <Input
                                                type="number"
                                                value={defaultCreditDays}
                                                onChange={async (e) => {
                                                    const rawVal = e.target.value;
                                                    const val = rawVal === '' ? '' : parseInt(rawVal);
                                                    setDefaultCreditDays(val);
                                                    if (val !== '' && profile?.organization_id) {
                                                        await supabase.schema('mandi').from('mandi_settings' as any).update({ default_credit_days: val }).eq('organization_id', profile.organization_id);
                                                    }
                                                }}
                                                className="h-8 w-16 bg-white border border-slate-200 text-sm font-black text-slate-900 focus:ring-2 focus:ring-blue-500 shadow-sm text-center px-1 rounded-md shrink-0"
                                            />
                                            <span className="text-xs font-bold text-slate-600 truncate">Days</span>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-slate-50 border border-slate-100 p-3 md:p-3.5 rounded-xl flex flex-col justify-center items-start flex-1 min-w-[130px] md:min-w-[150px] shadow-sm">
                                    <div className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1 w-full text-left truncate">{getLabel('sale_date', 'BILL DATE')}</div>
                                    {isVisible('sale_date') && (
                                        <FormField
                                            control={form.control}
                                            name="sale_date"
                                            render={({ field }) => (
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button 
                                                            variant="ghost" 
                                                            className={cn(
                                                                "p-0 h-9 font-black text-slate-900 hover:bg-transparent text-sm md:text-base border-b-2 border-transparent w-full justify-start",
                                                                form.formState.errors.sale_date && "border-b-red-500 text-red-600"
                                                            )}
                                                        >
                                                            {field.value ? format(field.value, "MMM dd, yyyy") : "Select Date"}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0 bg-white border-slate-300 shadow-2xl" align="end">
                                                        <Calendar
                                                            mode="single"
                                                            selected={field.value}
                                                            onSelect={field.onChange}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            )}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Party Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-[0.2em] mb-2">
                                    <div className="w-4 h-[1.5px] bg-indigo-600" />
                                    {getLabel('buyer_id', 'Bill To (Buyer)')}
                                </div>
                                {isVisible('buyer_id') && (
                                    <FormField
                                        control={form.control}
                                        name="buyer_id"
                                        render={({ field }) => (
                                            <FormItem className="space-y-2">
                                                <div className="flex gap-2">
                                                    <div className="flex-1">
                                                        <SearchableSelect
                                                            options={(buyers || []).map(b => ({ label: `${b?.name || 'Unknown Buyer'} (${b?.city || '-'})`, value: b?.id || '' }))}
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                            placeholder="Select Buyer/Customer"
                                                            searchPlaceholder="Search buyer database..."
                                                            className={cn(
                                                                "bg-transparent border-t-0 border-l-0 border-r-0 border-b-2 border-slate-300 rounded-none h-9 text-lg font-black text-slate-900 focus:border-indigo-600 transition-all shadow-none px-0",
                                                                form.formState.errors.buyer_id && "border-b-red-500 focus:border-b-red-600"
                                                            )}
                                                        />
                                                    </div>
                                                    <ContactDialog onSuccess={fetchMasters} defaultType="buyer">
                                                        <Button type="button" size="icon" className="h-10 w-10 rounded-lg bg-slate-900 text-white hover:bg-indigo-600 transition-all shadow-sm">
                                                            <Plus className="w-5 h-5" />
                                                        </Button>
                                                    </ContactDialog>
                                                </div>
                                                {field.value && (
                                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                                                        <div className="text-slate-700 text-xs font-medium italic">
                                                            {buyers.find(b => b.id === field.value)?.city || 'Location not specified'}
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1">
                                                                GSTIN: {buyers.find(b => b.id === field.value)?.gstin || 'Not set'}
                                                            </span>
                                                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1">
                                                                State: {buyers.find(b => b.id === field.value)?.state_code || 'NA'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                                {buyerWarning && (buyerWarning.isOverdue || buyerWarning.overLimit) && (
                                                    <div className="mt-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-bold flex flex-col gap-1">
                                                        <div className="flex items-center gap-2 uppercase tracking-widest text-[10px]">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            <span>Credit Warning</span>
                                                        </div>
                                                        {buyerWarning.isOverdue && <span className="text-[11px] font-medium leading-tight">Party has overdue unpaid invoices.</span>}
                                                        {buyerWarning.overLimit && <span className="text-[11px] font-medium leading-tight">Outstanding balance (₹{buyerWarning.balance.toLocaleString()}) exceeds credit limit.</span>}
                                                    </div>
                                                )}
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>

                            <div className="space-y-4">
                                {/* Payment Terms Row */}
                                {isVisible('payment_mode') && (
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className={form.watch("payment_mode") === "credit" ? "w-1/2" : "w-full"}>
                                                <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-[0.2em] mb-2">
                                                    <div className="w-4 h-[1.5px] bg-indigo-600" />
                                                    Payment Terms
                                                </div>
                                                <FormField
                                                    control={form.control}
                                                    name="payment_mode"
                                                    render={({ field }) => (
                                                        <FormItem className="w-full">
                                                            <Select 
                                                                onValueChange={(val) => {
                                                                    field.onChange(val);
                                                                    amountPaidManuallyEdited.current = false; // Reset on mode change so amount auto-populates
                                                                    if ((val === 'UPI/BANK' || val === 'cheque') && bankAccounts.length > 0) {
                                                                        const current = form.getValues("bank_account_id");
                                                                        if (!current) {
                                                                            const def = bankAccounts.find(b => b.is_default) || bankAccounts[0];
                                                                            if (def) form.setValue("bank_account_id", def.id, { shouldValidate: true, shouldDirty: true });
                                                                        }
                                                                    }
                                                                }} 
                                                                value={field.value}
                                                            >
                                                                <FormControl>
                                                                    <SelectTrigger className="bg-transparent border-t-0 border-l-0 border-r-0 border-b-2 border-slate-300 rounded-none h-9 text-lg font-black text-slate-900 focus:border-indigo-600 transition-all shadow-none px-0">
                                                                        <SelectValue placeholder="Select Terms" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent className="bg-white border-slate-100">
                                                                    <SelectItem value="credit" className="font-bold py-2 uppercase tracking-tight">UDHAAR</SelectItem>
                                                                    <SelectItem value="cash" className="font-bold py-2 uppercase tracking-tight">CASH</SelectItem>
                                                                    <SelectItem value="UPI/BANK" className="font-bold py-2 text-indigo-600 uppercase tracking-tight">UPI / BANK</SelectItem>
                                                                    <SelectItem value="cheque" className="font-bold py-2 text-indigo-600 uppercase tracking-tight">CHEQUE</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>

                                            {form.watch("payment_mode") === "credit" && (
                                                <div className="w-1/2">
                                                    <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-[0.2em] mb-2">
                                                        <div className="w-4 h-[1.5px] bg-indigo-600" />
                                                        {getLabel('payment_mode', 'Payment Terms')}
                                                    </div>
                                                    <FormField
                                                        control={form.control}
                                                        name="due_date"
                                                        render={({ field }) => (
                                                            <FormItem className="flex flex-col">
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <FormControl>
                                                                            <Button
                                                                                variant={"outline"}
                                                                                className={cn(
                                                                                    "bg-transparent border-t-0 border-l-0 border-r-0 border-b-2 border-slate-300 rounded-none h-10 px-1 text-base font-bold text-slate-700 focus:border-indigo-600 transition-all shadow-none justify-between hover:bg-transparent w-full",
                                                                                    !field.value && "text-muted-foreground"
                                                                                )}
                                                                            >
                                                                                {field.value ? (
                                                                                    format(field.value, "PP")
                                                                                ) : (
                                                                                    <span>Set due date</span>
                                                                                )}
                                                                                <CalendarIcon className="h-4 w-4 opacity-50" />
                                                                            </Button>
                                                                        </FormControl>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="w-auto p-0" align="start">
                                                                        <Calendar
                                                                            mode="single"
                                                                            selected={field.value}
                                                                            onSelect={field.onChange}
                                                                            initialFocus
                                                                        />
                                                                    </PopoverContent>
                                                                </Popover>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {form.watch("payment_mode") === "UPI/BANK" && (
                                            <div className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2 shadow-sm">
                                                <FormField
                                                    control={form.control}
                                                    name="bank_account_id"
                                                    render={({ field }) => (
                                                        <FormItem className="space-y-1">
                                                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-600">📥 Settle To (Bank Account)</FormLabel>
                                                            <Select value={field.value || ''} onValueChange={field.onChange}>
                                                                <FormControl>
                                                                    <SelectTrigger className="bg-white border-slate-200 h-10 text-xs font-bold text-slate-800 shadow-sm focus:border-indigo-500">
                                                                        <SelectValue placeholder="Select deposit account..." />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent className="bg-white z-[200]">
                                                                    {bankAccounts.map(b => (
                                                                        <SelectItem key={b.id} value={b.id} className="text-xs font-bold py-2">
                                                                            {b.name}{b.is_default ? ' ⭐' : ''}
                                                                        </SelectItem>
                                                                    ))}
                                                                    {bankAccounts.length === 0 && (
                                                                        <div className="p-3 text-xs text-slate-500 font-bold text-center">No active bank accounts found</div>
                                                                    )}
                                                                </SelectContent>
                                                            </Select>
                                                        </FormItem>
                                                    )}
                                                />

                                                {(() => {
                                                    const accId = form.watch("bank_account_id");
                                                    const acc = bankAccounts.find(a => a.id === accId);
                                                    let meta: any = {};
                                                    try {
                                                        if (acc && acc.description?.startsWith('{')) {
                                                            meta = JSON.parse(acc.description);
                                                        }
                                                    } catch (e) {
                                                        console.warn("Malformed account description JSON:", e);
                                                    }
                                                    const upiId = meta.upi_id || orgSettings?.payment?.upi_id;
                                                    
                                                    const watchItems = form.watch("sale_items") || [];
                                                    const safeWatchItems = Array.isArray(watchItems) ? watchItems : [];
                                                    const totals = calculateSaleTotals({
                                                        items: safeWatchItems.map((item: any) => {
                                                            const itemInfo = items.find(it => it.id === item?.item_id);
                                                            return {
                                                                amount: item?.amount,
                                                                gst_rate: itemInfo?.gst_rate,
                                                                is_gst_exempt: itemInfo?.is_gst_exempt,
                                                            };
                                                        }),
                                                        taxSettings,
                                                        orgStateCode,
                                                        buyerStateCode: selectedBuyerInfo?.state_code,
                                                        loadingCharges: form.watch("loading_charges"),
                                                        unloadingCharges: form.watch("unloading_charges"),
                                                        otherExpenses: form.watch("other_expenses"),
                                                        discountAmount: Number(form.watch("discount_amount")) || 0,
                                                    });
                                                    const grandTotal = totals.grandTotal;
                                                    const qrAmount = amountPaid > 0 ? amountPaid : grandTotal;
                                                    if (upiId) {
                                                        const orgName = orgSettings?.name || "MandiGrow";
                                                        const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(orgName)}&am=${qrAmount}&cu=INR`;
                                                        
                                                        return (
                                                            <div className="flex flex-col items-center bg-white border border-slate-100 rounded-2xl p-4 mt-4 shadow-sm space-y-3">
                                                                <div className="p-2 bg-white rounded-xl border border-slate-200">
                                                                    <QRCodeSVG value={upiUrl} size={150} level="M" />
                                                                </div>
                                                                <div className="text-center">
                                                                    <p className="text-slate-900 font-black text-sm">₹{qrAmount.toLocaleString()}</p>
                                                                    <p className="text-slate-500 font-bold text-[10px] truncate max-w-[180px]">{upiId}</p>
                                                                </div>
                                                            </div>
                                                        );
                                                    } else {
                                                        return <div className="text-[10px] font-bold text-slate-400 italic text-center py-3 bg-white rounded-lg border border-slate-100 mt-2">No UPI ID configured. Go to Settings to add one.</div>;
                                                    }
                                                })()}
                                            </div>
                                        )}

                                        {form.watch("payment_mode") === "cheque" && (
                                            <div className="w-full p-5 bg-slate-50/80 border border-slate-200/80 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2 shadow-sm">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
                                                    <div className="flex items-center gap-2 text-slate-800">
                                                        <Landmark className="w-4 h-4 text-indigo-600" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Cheque Settlement</span>
                                                    </div>
                                                    
                                                    <label className={`flex items-center gap-2 cursor-pointer shadow-sm select-none px-3 py-1.5 rounded-full border transition-all duration-200 w-fit ${
                                                        form.watch("cheque_status")
                                                        ? 'bg-emerald-100 border-emerald-500 shadow-sm shadow-emerald-200'
                                                        : 'bg-white border-slate-200 hover:bg-slate-50'
                                                    }`}>
                                                        <span className={cn("text-[10px] font-black uppercase tracking-wider", form.watch("cheque_status") ? 'text-emerald-800' : 'text-slate-600')}>
                                                            {form.watch("cheque_status") ? '⚡ Cleared Instantly' : '📅 Clear Later'}
                                                        </span>
                                                        <Switch
                                                            checked={form.watch("cheque_status")}
                                                            onCheckedChange={(checked) => form.setValue("cheque_status", checked)}
                                                            className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-200 border border-slate-300 scale-90"
                                                        />
                                                    </label>
                                                </div>

                                                {form.watch("cheque_status") && (
                                                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-emerald-800">
                                                        <Zap className="w-4 h-4 shrink-0 text-emerald-600" />
                                                        <span className="text-[11px] font-bold leading-tight">Sale marked as fully paid. A receipt voucher will clear accounts receivable instantly.</span>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <FormField
                                                        control={form.control}
                                                        name="bank_account_id"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-1">
                                                                <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-600">📥 Settle To (Bank Account)</FormLabel>
                                                                <Select value={field.value || ''} onValueChange={field.onChange}>
                                                                    <FormControl>
                                                                        <SelectTrigger className="bg-white border-slate-200 h-10 text-xs font-bold text-slate-800 shadow-sm">
                                                                            <SelectValue placeholder="Select deposit account..." />
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
                                                        name="cheque_no"
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
                                                        name="bank_name"
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

                                                {!form.watch("cheque_status") && (
                                                    <FormField
                                                        control={form.control}
                                                        name="cheque_date"
                                                        render={({ field }) => (
                                                            <FormItem className="flex flex-col space-y-1">
                                                                <FormLabel className="text-[10px] font-black uppercase tracking-wider text-slate-600">Expected Clearing Date</FormLabel>
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <FormControl>
                                                                            <Button variant={"outline"} className={cn("h-10 text-left font-bold text-xs border-slate-200 bg-white", !field.value && "text-muted-foreground")}>
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
                        </div>

                        {/* Items Section — Desktop: Table | Mobile: Stacked Cards */}
                        <div className="space-y-0 border border-slate-300 rounded-xl overflow-hidden mb-8 shadow-sm">

                            {/* ── DESKTOP TABLE HEADER (hidden on mobile) ───────────────────── */}
                            <div className="hidden md:block">
                                <div className="bg-slate-900 text-white grid grid-cols-12 gap-4 px-5 py-3">
                                    <span className="col-span-3 text-[9px] font-black uppercase tracking-widest">Description of Goods</span>
                                    <span className="col-span-3 text-[9px] font-black uppercase tracking-widest text-center">Batch / Source</span>
                                    <span className="col-span-2 text-[9px] font-black uppercase tracking-widest text-center">Qty</span>
                                    <span className="col-span-2 text-[9px] font-black uppercase tracking-widest text-center">Unit Price (₹)</span>
                                    <span className="col-span-2 text-[9px] font-black uppercase tracking-widest text-right">Ext. Amount</span>
                                </div>
                            </div>

                            {/* ── ITEM ROWS ─────────────────────────────────────────────────── */}
                            <div className="divide-y divide-slate-100">
                                {fields.map((field, index) => {
                                    const currentItemId = form.watch(`sale_items.${index}.item_id`);
                                    const filteredLots = lots.filter(l => l.item_id === currentItemId);

                                    return (
                                        <div key={field.id}>
                                            {/* ── DESKTOP ROW (grid, hidden on mobile) ──────────── */}
                                            <div className="hidden md:grid grid-cols-12 gap-2 items-center px-4 py-2 hover:bg-slate-50/50 transition-colors group relative">
                                                <div className="col-span-3">
                                                    <FormField
                                                        control={form.control}
                                                        name={`sale_items.${index}.item_id`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl>
                                                                    <SearchableSelect
                                                                        options={items.map(i => {
                                                                            const specs = i.custom_attributes ?
                                                                                Object.entries(i.custom_attributes)
                                                                                    .map(([k, v]) => `${k}: ${v}`)
                                                                                    .join(", ") : "";
                                                                            const label = [
                                                                                i.name,
                                                                                (language !== 'en' && i.local_name) ? `(${i.local_name})` : "",
                                                                                i.sku_code ? `[${i.sku_code}]` : "",
                                                                                specs ? `- {${specs}}` : ""
                                                                            ].filter(Boolean).join(" ");
                                                                            return { value: i.id, label };
                                                                        })}
                                                                        value={field.value}
                                                                        onChange={(val) => {
                                                                            field.onChange(val);
                                                                            form.setValue(`sale_items.${index}.lot_id`, "");
                                                                            const qty = form.getValues(`sale_items.${index}.qty`) || 0;
                                                                            applyTierPricing(index, val, qty);
                                                                        }}
                                                                        placeholder="Select Item"
                                                                        className={cn(
                                                                            "bg-transparent border-none text-slate-800 font-bold h-auto p-0 text-sm shadow-none focus:ring-0",
                                                                            form.formState.errors.sale_items?.[index]?.item_id && "text-red-600"
                                                                        )}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage className="text-[10px] text-red-500 font-bold" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                <div className="col-span-3">
                                                    <FormField
                                                        control={form.control}
                                                        name={`sale_items.${index}.lot_id`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl>
                                                                    <Select onValueChange={(val) => {
                                                                        field.onChange(val);
                                                                        const l = lots.find(l => l.id === val);
                                                                        if (l) {
                                                                            form.setValue(`sale_items.${index}.unit`, l.unit);
                                                                            form.setValue(`sale_items.${index}.avail_qty`, l.current_qty);
                                                                            if (l.sale_price) {
                                                                                form.setValue(`sale_items.${index}.rate`, l.sale_price);
                                                                                const qty = form.getValues(`sale_items.${index}.qty`);
                                                                                form.setValue(`sale_items.${index}.amount`, Number(l.sale_price) * qty);
                                                                            }
                                                                        }
                                                                    }} value={field.value} disabled={!currentItemId}>
                                                                        <SelectTrigger className={cn(
                                                                            "bg-white border-slate-300 h-9 text-slate-700 font-bold rounded-lg text-xs shadow-none",
                                                                            form.formState.errors.sale_items?.[index]?.lot_id && "border-red-500"
                                                                        )}>
                                                                            <SelectValue placeholder="Lot #" />
                                                                        </SelectTrigger>
                                                                        <SelectContent className="bg-white border-slate-300">
                                                                            {filteredLots.map(l => (
                                                                                <SelectItem key={l.id} value={l.id} className="font-bold py-3">
                                                                                    <div className="flex flex-col">
                                                                                        <span>{l.contact?.name} • Batch {l.lot_code} {l.barcode ? `• 🏷️ ${l.barcode}` : ''}</span>
                                                                                        <span className="text-[10px] text-slate-700">Available: {l.current_qty} {l.unit}</span>
                                                                                    </div>
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </FormControl>
                                                                <FormMessage className="text-[10px] text-red-500 font-bold" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <FormField
                                                        control={form.control}
                                                        name={`sale_items.${index}.qty`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl>
                                                                    <Input type="number" {...field}
                                                                        onChange={e => {
                                                                            field.onChange(e);
                                                                            const newQty = Number(e.target.value) || 0;
                                                                            applyTierPricing(index, currentItemId, newQty);
                                                                            setTimeout(() => {
                                                                                const currentRate = form.getValues(`sale_items.${index}.rate`);
                                                                                form.setValue(`sale_items.${index}.amount`, newQty * currentRate);
                                                                            }, 0);
                                                                        }}
                                                                        className={cn(
                                                                            "bg-transparent border-slate-300 border-2 h-10 text-slate-900 font-black text-center rounded-lg shadow-none focus:border-indigo-600",
                                                                            form.formState.errors.sale_items?.[index]?.qty && "border-red-500"
                                                                        )} />
                                                                </FormControl>
                                                                <FormMessage className="text-[10px] text-red-500 font-bold text-center" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <FormField
                                                        control={form.control}
                                                        name={`sale_items.${index}.rate`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl>
                                                                    <div className="relative">
                                                                        <Input type="number" {...field}
                                                                            onChange={e => {
                                                                                field.onChange(e);
                                                                                const qty = form.getValues(`sale_items.${index}.qty`);
                                                                                form.setValue(`sale_items.${index}.amount`, Number(e.target.value) * qty);
                                                                            }}
                                                                            className={cn(
                                                                                "bg-transparent border-slate-300 border-2 h-9 text-slate-900 font-black text-center rounded-lg shadow-none focus:border-indigo-600 pl-4",
                                                                                form.formState.errors.sale_items?.[index]?.rate && "border-red-500"
                                                                            )} />
                                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-700 font-black">₹</span>
                                                                        {currentItemId && priceHistory[currentItemId] && (
                                                                            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-black text-indigo-600 whitespace-nowrap bg-indigo-50 px-1 rounded uppercase tracking-tighter">
                                                                                Last Rate: {priceHistory[currentItemId]}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </FormControl>
                                                                <FormMessage className="text-[10px] text-red-500 font-bold text-center" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                <div className="col-span-2 flex items-center justify-end gap-3">
                                                    <div className="font-bold text-slate-800 text-sm">
                                                        ₹{form.watch(`sale_items.${index}.amount`)?.toLocaleString()}
                                                    </div>
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all h-8 w-8">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* ── MOBILE CARD (stacked, shown only on mobile) ───── */}
                                            <div className="md:hidden bg-white border-b border-slate-100 p-4 space-y-3">
                                                {/* Card Header */}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Item {index + 1}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-base font-black text-slate-800">
                                                            ₹{(form.watch(`sale_items.${index}.amount`) || 0).toLocaleString()}
                                                        </span>
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="hover:text-red-500 text-slate-400 h-7 w-7">
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>

                                                {/* Item Selector */}
                                                <FormField
                                                    control={form.control}
                                                    name={`sale_items.${index}.item_id`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-[9px] font-black uppercase tracking-widest text-slate-500">Commodity / Item</FormLabel>
                                                            <FormControl>
                                                                <SearchableSelect
                                                                    options={items.map(i => {
                                                                        const label = [
                                                                            i.name,
                                                                            (language !== 'en' && i.local_name) ? `(${i.local_name})` : "",
                                                                        ].filter(Boolean).join(" ");
                                                                        return { value: i.id, label };
                                                                    })}
                                                                    value={field.value}
                                                                    onChange={(val) => {
                                                                        field.onChange(val);
                                                                        form.setValue(`sale_items.${index}.lot_id`, "");
                                                                        const qty = form.getValues(`sale_items.${index}.qty`) || 0;
                                                                        applyTierPricing(index, val, qty);
                                                                    }}
                                                                    placeholder="Select Item..."
                                                                    className={cn(
                                                                        "w-full border border-slate-200 rounded-xl h-11 text-sm font-bold text-slate-800 px-3",
                                                                        form.formState.errors.sale_items?.[index]?.item_id && "border-red-400"
                                                                    )}
                                                                />
                                                            </FormControl>
                                                            <FormMessage className="text-[10px] text-red-500 font-bold" />
                                                        </FormItem>
                                                    )}
                                                />

                                                {/* Batch / Lot Selector */}
                                                <FormField
                                                    control={form.control}
                                                    name={`sale_items.${index}.lot_id`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-[9px] font-black uppercase tracking-widest text-slate-500">Batch / Source Lot</FormLabel>
                                                            <FormControl>
                                                                <Select onValueChange={(val) => {
                                                                    field.onChange(val);
                                                                    const l = lots.find(l => l.id === val);
                                                                    if (l) {
                                                                        form.setValue(`sale_items.${index}.unit`, l.unit);
                                                                        form.setValue(`sale_items.${index}.avail_qty`, l.current_qty);
                                                                        if (l.sale_price) {
                                                                            form.setValue(`sale_items.${index}.rate`, l.sale_price);
                                                                            const qty = form.getValues(`sale_items.${index}.qty`);
                                                                            form.setValue(`sale_items.${index}.amount`, Number(l.sale_price) * qty);
                                                                        }
                                                                    }
                                                                }} value={field.value} disabled={!currentItemId}>
                                                                    <SelectTrigger className={cn(
                                                                        "bg-white border-slate-200 h-11 text-slate-700 font-bold rounded-xl text-sm",
                                                                        form.formState.errors.sale_items?.[index]?.lot_id && "border-red-400"
                                                                    )}>
                                                                        <SelectValue placeholder={currentItemId ? "Select Batch..." : "Select item first"} />
                                                                    </SelectTrigger>
                                                                    <SelectContent className="bg-white border-slate-200">
                                                                        {filteredLots.map(l => (
                                                                            <SelectItem key={l.id} value={l.id} className="font-bold py-3">
                                                                                <div className="flex flex-col">
                                                                                    <span>{l.contact?.name} • {l.lot_code}</span>
                                                                                    <span className="text-[10px] text-slate-500">Available: {l.current_qty} {l.unit}</span>
                                                                                </div>
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            </FormControl>
                                                            <FormMessage className="text-[10px] text-red-500 font-bold" />
                                                        </FormItem>
                                                    )}
                                                />

                                                {/* Qty + Rate side by side */}
                                                <div className="grid grid-cols-2 gap-3">
                                                    <FormField
                                                        control={form.control}
                                                        name={`sale_items.${index}.qty`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-[9px] font-black uppercase tracking-widest text-slate-500">Quantity</FormLabel>
                                                                <FormControl>
                                                                    <Input type="number" {...field}
                                                                        onChange={e => {
                                                                            field.onChange(e);
                                                                            const newQty = Number(e.target.value) || 0;
                                                                            applyTierPricing(index, currentItemId, newQty);
                                                                            setTimeout(() => {
                                                                                const currentRate = form.getValues(`sale_items.${index}.rate`);
                                                                                form.setValue(`sale_items.${index}.amount`, newQty * currentRate);
                                                                            }, 0);
                                                                        }}
                                                                        className={cn(
                                                                            "border-slate-200 h-11 text-slate-900 font-black text-center rounded-xl",
                                                                            form.formState.errors.sale_items?.[index]?.qty && "border-red-400"
                                                                        )} />
                                                                </FormControl>
                                                                <FormMessage className="text-[10px] text-red-500 font-bold text-center" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name={`sale_items.${index}.rate`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                                    Rate (₹)
                                                                    {currentItemId && priceHistory[currentItemId] && (
                                                                        <span className="ml-1 text-indigo-500 normal-case font-bold">Last: ₹{priceHistory[currentItemId]}</span>
                                                                    )}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <div className="relative">
                                                                        <Input type="number" {...field}
                                                                            onChange={e => {
                                                                                field.onChange(e);
                                                                                const qty = form.getValues(`sale_items.${index}.qty`);
                                                                                form.setValue(`sale_items.${index}.amount`, Number(e.target.value) * qty);
                                                                            }}
                                                                            className={cn(
                                                                                "border-slate-200 h-11 text-slate-900 font-black text-center rounded-xl pl-6",
                                                                                form.formState.errors.sale_items?.[index]?.rate && "border-red-400"
                                                                            )} />
                                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 font-black">₹</span>
                                                                    </div>
                                                                </FormControl>
                                                                <FormMessage className="text-[10px] text-red-500 font-bold text-center" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="border-t border-slate-100 p-4 bg-slate-50/30">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => append({ item_id: "", lot_id: "", qty: 10, rate: 0, amount: 0 })}
                                    className="text-indigo-700 font-black uppercase text-[10px] tracking-widest hover:bg-indigo-50 w-full rounded-xl"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-2" /> Append New Item Row
                                </Button>
                            </div>
                        </div>

                        {/* Summary Block - Compact */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                            <div className="md:col-span-7 space-y-4">
                                {(() => {
                                    const itemsSubtotal = form.watch('sale_items')?.reduce((acc: number, item: any) => acc + (Number(item?.amount) || 0), 0) || 0;
                                    return (
                                        <div className="bg-slate-50 border-l-4 border-emerald-500 p-4 rounded-r-xl">
                                            <div className="flex items-center gap-2 text-slate-900 font-black text-[10px] uppercase tracking-[0.1em] mb-3">
                                                <div className="w-3.5 h-3.5 flex items-center justify-center rounded bg-emerald-100 text-emerald-600">
                                                    🏷️
                                                </div>
                                                Item Discounts
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <FormField
                                                    control={form.control}
                                                    name="discount_percent"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-[8px] uppercase font-black text-slate-700 tracking-wider">
                                                                Discount (%)
                                                            </FormLabel>
                                                            <Input 
                                                                type="number" 
                                                                {...field} 
                                                                onChange={(e) => {
                                                                    field.onChange(e);
                                                                    const pct = Number(e.target.value) || 0;
                                                                    const calcAmount = (itemsSubtotal * pct) / 100;
                                                                    discountManuallyEdited.current = 'percent';
                                                                    form.setValue('discount_amount', Number(calcAmount.toFixed(2)));
                                                                }}
                                                                className="bg-white border-slate-100 h-9 font-bold rounded-lg shadow-none text-xs text-emerald-700 focus-visible:ring-emerald-500" 
                                                            />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="discount_amount"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-[8px] uppercase font-black text-slate-700 tracking-wider">
                                                                Discount Amount (₹)
                                                            </FormLabel>
                                                            <Input 
                                                                type="number" 
                                                                {...field} 
                                                                onChange={(e) => {
                                                                    field.onChange(e);
                                                                    const amt = Number(e.target.value) || 0;
                                                                    discountManuallyEdited.current = 'amount';
                                                                    if (itemsSubtotal > 0) {
                                                                        const calcPct = (amt / itemsSubtotal) * 100;
                                                                        form.setValue('discount_percent', Number(calcPct.toFixed(2)));
                                                                    } else {
                                                                        form.setValue('discount_percent', 0);
                                                                    }
                                                                }}
                                                                className="bg-white border-slate-100 h-9 font-bold rounded-lg shadow-none text-xs text-emerald-700 focus-visible:ring-emerald-500" 
                                                            />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div className="bg-slate-50 border-l-4 border-indigo-600 p-4 rounded-r-xl">
                                    <div className="flex items-center gap-2 text-slate-900 font-black text-[10px] uppercase tracking-[0.1em] mb-3">
                                        <Truck className="w-3.5 h-3.5" />
                                        Buyer Logistics & Surcharge
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        {isVisible('loading_charges') && (
                                            <FormField
                                                control={form.control}
                                                name="loading_charges"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-[8px] uppercase font-black text-slate-700 tracking-wider">
                                                            {getLabel('loading_charges', 'Loading')}
                                                        </FormLabel>
                                                        <Input type="number" {...field} className="bg-white border-slate-100 h-9 font-bold rounded-lg shadow-none text-xs" />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                        {isVisible('unloading_charges') && (
                                            <FormField
                                                control={form.control}
                                                name="unloading_charges"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-[8px] uppercase font-black text-slate-700 tracking-wider">
                                                            {getLabel('unloading_charges', 'Unloading')}
                                                        </FormLabel>
                                                        <Input type="number" {...field} className="bg-white border-slate-100 h-9 font-bold rounded-lg shadow-none text-xs" />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                        {isVisible('other_expenses') && (
                                            <FormField
                                                control={form.control}
                                                name="other_expenses"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-[8px] uppercase font-black text-slate-700 tracking-wider">
                                                            {getLabel('other_expenses', 'Other')}
                                                        </FormLabel>
                                                        <Input type="number" {...field} className="bg-white border-slate-100 h-9 font-bold rounded-lg shadow-none text-xs" />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="text-slate-700 text-[9px] font-medium leading-relaxed max-w-sm">
                                    * Computer generated invoice. Signature not required.
                                </div>
                            </div>

                            <div className="md:col-span-5 relative">
                                <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg relative z-10">
                                    {(() => {
                                        const watchedItems = form.watch('sale_items') || [];
                                        const safeItems = Array.isArray(watchedItems) ? watchedItems : [];
                                        const totals = calculateSaleTotals({
                                            items: safeItems.map((item: any) => {
                                                const itemInfo = items.find(i => i.id === item?.item_id);
                                                return {
                                                    amount: item?.amount,
                                                    gst_rate: itemInfo?.gst_rate,
                                                    is_gst_exempt: itemInfo?.is_gst_exempt,
                                                };
                                            }),
                                            taxSettings,
                                            orgStateCode,
                                            buyerStateCode: selectedBuyerInfo?.state_code,
                                            loadingCharges: form.watch('loading_charges'),
                                            unloadingCharges: form.watch('unloading_charges'),
                                            otherExpenses: form.watch('other_expenses'),
                                            discountAmount: Number(form.watch("discount_amount")) || 0,
                                        });
                                        const otherFees = totals.marketFee + totals.nirashrit + totals.miscFee + totals.extraCharges;

                                        return (
                                            <>
                                                <div className="space-y-2 pb-3 border-b border-white/10">
                                                    <div className="flex justify-between items-center text-[9px] font-black tracking-widest uppercase text-white/50">
                                                        <span>Taxable Val</span>
                                                        <span className="text-white">₹{totals.subTotal.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-[9px] font-black tracking-widest uppercase text-white/50">
                                                        <span>GST</span>
                                                        <span className="text-indigo-400">+ ₹{totals.gstTotal.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-[9px] font-black tracking-widest uppercase text-white/50">
                                                        <span>Fees & Charges</span>
                                                        <span className="text-indigo-400">+ ₹{otherFees.toLocaleString()}</span>
                                                    </div>
                                                </div>

                                                <div className="pt-3 mb-4 space-y-4">
                                                    <div>
                                                        <div className="text-[9px] font-black tracking-[0.3em] uppercase text-indigo-400 mb-0.5">Net Invoice Total</div>
                                                        <div className="text-3xl font-black tracking-tight leading-none">
                                                            ₹{totals.grandTotal.toLocaleString()}
                                                        </div>
                                                        {safeItems.reduce((s, i) => s + (Number(i.qty) || 0), 0) > 0 && (
                                                            <div className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mt-1">
                                                                Avg Price: ₹{(totals.grandTotal / safeItems.reduce((s, i) => s + (Number(i.qty) || 0), 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {form.watch('payment_mode') !== 'credit' && (
                                                        <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-2">
                                                            <div className="flex justify-between items-center">
                                                                <Label className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Amount Received</Label>
                                                                {amountPaid < totals.grandTotal && (
                                                                    <span className="text-[8px] font-bold text-yellow-500 uppercase tracking-tight bg-yellow-500/10 px-2 py-0.5 rounded-full">Partial</span>
                                                                )}
                                                            </div>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 font-bold">₹</span>
                                                                <Input 
                                                                    type="number" 
                                                                    value={amountPaid === 0 ? '' : amountPaid} 
                                                                    onChange={e => {
                                                                        const val = parseFloat(e.target.value) || 0;
                                                                        amountPaidManuallyEdited.current = true;
                                                                        if (val > totals.grandTotal) {
                                                                            setAmountPaid(totals.grandTotal);
                                                                            toast({ title: "Amount Capped", description: "Received amount cannot exceed invoice total.", variant: "default" });
                                                                        } else {
                                                                            setAmountPaid(val);
                                                                        }
                                                                    }}
                                                                    className="pl-8 bg-white/10 border-white/20 h-10 text-lg font-black text-white focus:border-indigo-500 rounded-xl shadow-none"
                                                                />
                                                            </div>
                                                            {amountPaid < totals.grandTotal && amountPaid > 0 && (
                                                                <div className="text-[9px] font-bold text-yellow-500/80 italic leading-tight">
                                                                    ₹{(totals.grandTotal - amountPaid).toLocaleString()} will be recorded as Udhaar.
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {totals.grandTotal >= 50000 && (
                                                        <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center gap-2 text-indigo-400 font-bold text-[10px] uppercase tracking-wider animate-in fade-in slide-in-from-top-1">
                                                            <AlertTriangle className="w-4 h-4 text-indigo-400" />
                                                            E-Way Bill Required (Total {`>`} ₹50,000)
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        );
                                    })()}

                                    <Button type="submit" disabled={isSubmitting} className="w-full h-10 bg-white text-slate-900 font-black text-sm rounded-xl hover:bg-slate-900 hover:text-white transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm border border-slate-300">
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                SUBMITTING...
                                            </>
                                        ) : (
                                            <>
                                                POST INVOICE
                                                <ArrowLeft className="w-4 h-4 rotate-180" />
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Improved Confirmation Dialog */}
                <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
                    <DialogContent className="max-w-3xl bg-white rounded-[2rem] border-2 border-slate-200 shadow-2xl overflow-hidden p-0">
                        <DialogHeader className="p-8 pb-4 bg-slate-50 border-b border-slate-100">
                            <DialogTitle className="text-2xl font-[1000] tracking-tighter text-slate-900 uppercase italic">Confirm Sale Transaction</DialogTitle>
                            <DialogDescription className="text-slate-500 font-bold text-xs uppercase tracking-widest">Please verify invoice details before posting to ledger</DialogDescription>
                        </DialogHeader>
                        
                        <div className="p-8 space-y-8 overflow-y-auto max-h-[60vh] custom-scrollbar">
                            {(() => {
                                const watchItems = pendingValues?.sale_items || [];
                                const safeItems = Array.isArray(watchItems) ? watchItems : [];
                                const pendingBuyer = buyers.find(b => b.id === pendingValues?.buyer_id);
                                const totals = calculateSaleTotals({
                                    items: safeItems.map((item: any) => {
                                        const itemInfo = items.find(i => i.id === item?.item_id);
                                        return {
                                            amount: item?.amount,
                                            gst_rate: itemInfo?.gst_rate,
                                            is_gst_exempt: itemInfo?.is_gst_exempt,
                                        };
                                    }),
                                    taxSettings,
                                    orgStateCode,
                                    buyerStateCode: pendingBuyer?.state_code,
                                    loadingCharges: pendingValues?.loading_charges,
                                    unloadingCharges: pendingValues?.unloading_charges,
                                    otherExpenses: pendingValues?.other_expenses,
                                    discountAmount: Number(pendingValues?.discount_amount) || 0,
                                });

                                return (
                                    <>
                                        {/* Buyer Info */}
                                        <div className="flex flex-col md:flex-row justify-between gap-6 pb-6 border-b border-slate-100">
                                            <div className="space-y-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bill To</span>
                                                <div className="text-lg font-black text-slate-900">{buyers.find(b => b.id === pendingValues?.buyer_id)?.name || 'N/A'}</div>
                                                <div className="text-xs font-bold text-slate-500 italic">{buyers.find(b => b.id === pendingValues?.buyer_id)?.city}</div>
                                            </div>
                                            <div className="text-right space-y-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Transaction Date</span>
                                                <div className="text-lg font-black text-slate-900">{pendingValues?.sale_date ? format(pendingValues.sale_date, "PPP") : '-'}</div>
                                                <div className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full inline-block mt-1">Mode: {pendingValues?.payment_mode}</div>
                                            </div>
                                        </div>

                                        {/* Items Table */}
                                        <div className="space-y-3">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Items Summary</span>
                                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                                <Table>
                                                    <TableHeader className="bg-slate-50">
                                                        <TableRow className="border-slate-200">
                                                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-10">Product</TableHead>
                                                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-10 text-center">Qty</TableHead>
                                                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-10 text-center">Rate</TableHead>
                                                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-10 text-right">Ext Amount</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {safeItems.map((item: any, idx: number) => (
                                                            <TableRow key={idx} className="border-slate-100 hover:bg-slate-50/50 transition-colors">
                                                                <TableCell className="py-3">
                                                                    <div className="font-bold text-slate-900 text-xs">
                                                                        {items.find(i => i.id === item.item_id)?.name || 'Unknown Item'}
                                                                    </div>
                                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                                                        Lot: {lots.find(l => l.id === item.lot_id)?.lot_code || 'N/A'}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-center font-black text-slate-700 text-xs">{item.qty} {item.unit || ''}</TableCell>
                                                                <TableCell className="text-center font-black text-slate-700 text-xs">₹{item.rate}</TableCell>
                                                                <TableCell className="text-right font-black text-indigo-600 text-xs tracking-tight">₹{(Number(item.qty || 0) * Number(item.rate || 0)).toLocaleString()}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>

                                        {/* Financial Summary */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                                            <div className="space-y-4">
                                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment Reconciliation</span>
                                                    <div className="flex justify-between items-center group">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase">Gross Amount</span>
                                                        <span className="font-black text-slate-700 text-xs">₹{totals.subTotal.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2 border-y border-slate-200/50">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase">GST + Fees</span>
                                                        <span className="font-black text-slate-700 text-xs">₹{(totals.gstTotal + totals.marketFee + totals.nirashrit + totals.miscFee + totals.extraCharges).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center pt-1">
                                                        <span className="text-[10px] font-black text-indigo-600 uppercase">Total Payable</span>
                                                        <span className="font-[1000] text-indigo-600 text-sm italic tracking-tighter">₹{totals.grandTotal.toLocaleString()}</span>
                                                    </div>
                                                </div>

                                                {pendingValues?.payment_mode !== 'credit' && (
                                                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                                                                <CheckCircle2 className="w-5 h-5" />
                                                                </div>
                                                            <div>
                                                                <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Amount Received</div>
                                                                <div className="text-lg font-black text-emerald-700 tracking-tighter italic">₹{amountPaid.toLocaleString()}</div>
                                                            </div>
                                                        </div>
                                                        {totals.grandTotal - amountPaid > 0 && (
                                                            <div className="text-right">
                                                                <div className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Remaining Udhaar</div>
                                                                <div className="text-sm font-black text-amber-700 tracking-tighter">₹{(totals.grandTotal - amountPaid).toLocaleString()}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex flex-col justify-end p-6 bg-slate-900 rounded-3xl text-white shadow-xl">
                                                <div className="flex justify-between items-center mb-6">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Final Invoice Total</span>
                                                        <div className="text-4xl font-black italic tracking-tighter">
                                                            ₹{totals.grandTotal.toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
                                                        <Truck className="w-6 h-6 text-indigo-400" />
                                                    </div>
                                                </div>
                                                <p className="text-[9px] font-bold text-slate-400 leading-relaxed uppercase tracking-widest">
                                                    By confirming, you authorize the generation of this invoice and its permanent record in the ledger.
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        <DialogFooter className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row gap-4">
                            <Button 
                                variant="outline" 
                                onClick={() => setShowConfirm(false)}
                                className="flex-1 bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-[1000] uppercase text-xs tracking-[0.2em] h-12"
                            >
                                Back to Edit
                            </Button>
                            <Button 
                                onClick={handleConfirmPost}
                                disabled={isSubmitting}
                                className="flex-1 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl font-[1000] uppercase text-xs tracking-[0.2em] shadow-lg h-12"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" /> : "Confirm & Post Invoice"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </form>
        </Form>
    );
}

export default NewSaleForm;
