'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { Search, ShoppingCart, Trash2, Zap, Wallet, Banknote, CreditCard, ChevronRight, Barcode, Plus, Minus, CheckCircle, Printer, X, Package, User, FileText, Landmark, CalendarIcon, ArrowLeft, Loader2, AlertTriangle, Tag } from 'lucide-react'
import { useLanguage } from '@/components/i18n/language-provider'
import { QRCodeSVG } from 'qrcode.react'
import { toast, Toaster } from 'sonner'
import { getIntelligentVisual } from '@/lib/utils/commodity-mapping'
import { formatCommodityName } from '@/lib/utils/commodity-utils'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { confirmSaleTransactionWithFallback } from '@/lib/mandi/confirm-sale-transaction'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cacheGet, cacheSet } from '@/lib/data-cache'

type POSItem = {
    id: string
    unique_key: string // item_id + unit combination for multi-unit support
    name: string
    supplier_name: string | null
    local_name?: string
    sku_code?: string
    custom_attributes?: any
    sale_price: number
    barcode: string | null
    lot_details?: { id: string; qr_code: string | null; barcode: string | null; current_qty: number; arrival_id?: string | null }[]
    unit: string

    gst_rate: number
    image_url?: string
    available_qty: number
    purchase_rate: number
    packing_cost: number
    loading_cost: number
    farmer_charges: number
    lot_id: string | null 

}

const toRpcPaymentMode = (paymentMode: 'Cash' | 'Credit' | 'UPI/Bank' | 'Cheque') => {
    switch (paymentMode) {
        case 'Cash':
            return 'cash'
        case 'Credit':
            return 'credit'
        case 'UPI/Bank':
            return 'UPI/BANK'
        case 'Cheque':
            return 'cheque'
    }
}

export default function POSPage() {
    const { profile } = useAuth()
    const { language } = useLanguage()
    const orgId = profile?.organization_id
    const cachedPos = orgId ? cacheGet<any>('pos_masters', orgId) : null
    const [items, setItems] = useState<POSItem[]>(cachedPos?.items || [])
    const [filteredItems, setFilteredItems] = useState<POSItem[]>(cachedPos?.items || [])
    const [cart, setCart] = useState<{ item: POSItem, qty: number, price: number }[]>([])
    const [search, setSearch] = useState('')
    const [scannedLots, setScannedLots] = useState<string[]>([]) // Track exact QR strings already fully scanned
    // Scan result popup
    const [scanResult, setScanResult] = useState<{ item: POSItem; qty: number; lotQrCode?: string } | null>(null)
    
    useEffect(() => {
        if (!search) return
        
        // 1. Check for specific Arrival Lot QR codes first
        let foundItem: POSItem | undefined = undefined;
        let lotQty = 0;
        let lotQrCode: string | undefined = undefined;
        
        for (const it of items) {
            // Check both QR code and the new Barcode field
            const matchedLot = it.lot_details?.find(ld => ld.qr_code === search || ld.barcode === search);
            if (matchedLot) {
                if (matchedLot.qr_code && scannedLots.includes(matchedLot.qr_code)) {
                    toast.error("Scanned Twice", { description: "This specific lot is already fully added into the cart.", position: 'top-center' });
                    setSearch('');
                    return;
                }
                foundItem = it;
                lotQty = matchedLot.current_qty;
                lotQrCode = matchedLot.qr_code ?? undefined;
                break;
            }
        }
        
        // 2. If not a specific lot, check generic commodity master barcode/sku
        if (!foundItem) {
            foundItem = items.find(it => it.barcode === search || it.sku_code === search);
            lotQty = 1; // Generic commodities default to adding 1
        }

        
        if (foundItem) {
            // Show item detail popup instead of directly adding
            setScanResult({ item: foundItem, qty: lotQty > 0 ? lotQty : 1, lotQrCode });
            setSearch('');
        }
    }, [search, items])

    const [loading, setLoading] = useState(!cachedPos)
    const [saving, setSaving] = useState(false)
    const [paymentMode, setPaymentMode] = useState<'Cash' | 'Credit' | 'UPI/Bank' | 'Cheque'>('Cash')
    const [accounts, setAccounts] = useState<any[]>(cachedPos?.accounts || [])
    const [selectedAccountId, setSelectedAccountId] = useState('')
    const [chequeDetails, setChequeDetails] = useState({ no: '', date: '', bank: '' })
    const [chequeStatus, setChequeStatus] = useState(false)
    const [buyers, setBuyers] = useState<any[]>(cachedPos?.buyers || [])
    const [selectedBuyerId, setSelectedBuyerId] = useState('')
    
    // Global tax/charge settings from mandi_settings
    const [taxSettings, setTaxSettings] = useState({ 
        market_fee_percent: 0, nirashrit_percent: 0, misc_fee_percent: 0,
        gst_enabled: false, gst_type: 'intra', cgst_percent: 0, sgst_percent: 0, igst_percent: 0,
        state_code: null as string | null
    })
    
    // Additional Charges
    const [additionalCharges, setAdditionalCharges] = useState<{name: string, amount: number}[]>([])
    
    const [showConfirm, setShowConfirm] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)
    const [showErrors, setShowErrors] = useState(false)
    const [lastInvoiceId, setLastInvoiceId] = useState<string | null>(null)
    const [amountReceived, setAmountReceived] = useState<number>(0)
    const amountReceivedManuallyEdited = useRef(false)
    const [shakingItemId, setShakingItemId] = useState<string | null>(null)
    const [shakingCartId, setShakingCartId] = useState<string | null>(null)
    const [maxInvoiceAmount, setMaxInvoiceAmount] = useState<number>(0)
    const [lastRefNo, setLastRefNo] = useState<string>('')
    const [printing, setPrinting] = useState(false)
    const [orgSettings, setOrgSettings] = useState<any>(cachedPos?.orgSettings || null)
    const [orgName, setOrgName] = useState(cachedPos?.orgName || '')
    const [platformBranding, setPlatformBranding] = useState<any>(cachedPos?.platformBranding || null)
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [showQR, setShowQR] = useState(true)
    const [discountPercent, setDiscountPercent] = useState<number>(0)
    const [discountAmount, setDiscountAmount] = useState<number>(0)
    const discountManuallyEdited = useRef(false)

    // Sync Discount Amount/Percent
    const subTotal = cart.reduce((acc, c) => acc + (c.qty * c.price), 0)

    useEffect(() => {
        if (discountManuallyEdited.current) return;
        if (discountPercent > 0) {
            const newAmt = Math.round((subTotal * discountPercent) / 100);
            if (newAmt !== discountAmount) setDiscountAmount(newAmt);
        }
    }, [subTotal, discountPercent]);

    const handlePercentChange = (val: number) => {
        setDiscountPercent(val)
        const amt = Math.round((subTotal * val) / 100)
        setDiscountAmount(amt)
        discountManuallyEdited.current = false
    }

    const handleAmountChange = (val: number) => {
        setDiscountAmount(val)
        if (subTotal > 0) {
            setDiscountPercent(Number(((val / subTotal) * 100).toFixed(2)))
        } else {
            setDiscountPercent(0)
        }
        discountManuallyEdited.current = true
    }

    const printQRCode = orgSettings?.payment?.print_upi_qr !== false
    const printBankDetails = orgSettings?.payment?.print_bank_details !== false

    useEffect(() => {
        if (!orgId) return

        const cached = cacheGet<any>('pos_masters', orgId)
        if (!cached) return

        // Populate state from cache immediately
        setItems(cached.items || [])
        setFilteredItems(cached.items || [])
        setAccounts(cached.accounts || [])
        setBuyers(cached.buyers || [])
        setOrgSettings(cached.orgSettings || null)
        setOrgName(cached.orgName || '')
        setPlatformBranding(cached.platformBranding || null)
        
        // If we have items, we don't strictly "load" (skeleton), we "revalidate"
        if (cached.items?.length > 0) {
            setLoading(false)
        }
    }, [orgId])

    useEffect(() => {
        if (accounts.length === 0) return

        const currentAcc = accounts.find(a => a.id === selectedAccountId)

        if (paymentMode === 'Cash') {
            if (!currentAcc || currentAcc.account_sub_type !== 'cash') {
                const defaultCash = accounts.find(a => a.account_sub_type === 'cash' || a.name.toLowerCase().includes('cash')) || accounts.find(a => a.type === 'asset')
                if (defaultCash) setSelectedAccountId(defaultCash.id)
            }
        } else if (paymentMode === 'UPI/Bank' || paymentMode === 'Cheque') {
            if (!currentAcc || currentAcc.account_sub_type !== 'bank') {
                const defaultBank = accounts.find(a => (a.account_sub_type === 'bank' || a.type === 'asset') && a.is_default) || accounts.find(a => a.account_sub_type === 'bank')
                if (defaultBank) setSelectedAccountId(defaultBank.id)
            }
            if (paymentMode === 'Cheque') {
                setAmountReceived(grandTotal)
            }
        }
    }, [paymentMode, accounts]) // intentionally omitting selectedAccountId so it only runs on payment mode changes or accounts load

    const barcodeRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const controller = new AbortController()
        if (profile?.organization_id) {
            fetchData(controller.signal)
            
            // Add Realtime Listener for instant stock updates when lots change
            const uniqueId = Math.random().toString(36).substring(7);
            const channel = supabase.channel(`pos-realtime-inventory-${uniqueId}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'mandi', table: 'lots', filter: `organization_id=eq.${profile.organization_id}` },
                    () => {
                        console.log("POS: Inventory changed, revalidating in background...");
                        fetchData(controller.signal);
                    }
                )
                .subscribe();
            
            return () => {
                controller.abort();
                supabase.removeChannel(channel);
            }
        }
        return () => controller.abort()
    }, [profile?.organization_id])

    const fetchData = async (signal?: AbortSignal, retryCount = 0) => {
        if (!profile?.organization_id) return
        
        // Only show full loading skeleton if we have no items yet
        if (items.length === 0) {
            setLoading(true)
        }

        try {
            const orgId = profile.organization_id;
            const schema = 'mandi';

            // 1. Run independent master data fetches in parallel
            const [accsRes, buyersRes, orgRes, brandingRes, settingsRes] = await Promise.all([
                supabase.schema(schema).from('accounts').select('id,name,type,account_sub_type,is_default,description').eq('organization_id', orgId).in('type', ['asset', 'income']).eq('is_active', true).order('name'),
                supabase.schema('mandi').from('contacts').select('id, name, contact_type, city, status, state_code, gstin')
                    .eq('organization_id', orgId)
                    .eq('contact_type', 'buyer').neq('status', 'deleted').order('name'),
                supabase.schema('core').from('organizations').select('name, settings').eq('id', orgId).single(),
                supabase.schema('core').from('platform_branding_settings').select('document_footer_powered_by_text, support_phone').maybeSingle(),
                supabase.schema(schema).from('mandi_settings' as any).select('market_fee_percent,nirashrit_percent,misc_fee_percent,gst_enabled,gst_type,cgst_percent,sgst_percent,igst_percent,max_invoice_amount,state_code').eq('organization_id', orgId).maybeSingle()
            ]);

            // Update partial states as they arrive
            if (accsRes.data) {
                setAccounts(accsRes.data);
                const defaultAcc = accsRes.data.find(a => a.account_sub_type === 'cash' || a.name.toLowerCase().includes('cash')) || accsRes.data.find(a => a.type === 'asset');
                if (defaultAcc && !selectedAccountId) setSelectedAccountId(defaultAcc.id);
            }
            if (buyersRes.data) setBuyers(buyersRes.data);
            if (orgRes.data) {
                setOrgSettings(orgRes.data.settings || {});
                setOrgName(orgRes.data.name || 'MandiGrow');
            }
            if (brandingRes.data) setPlatformBranding(brandingRes.data);
            if (settingsRes.data) {
                setTaxSettings({
                    market_fee_percent: Number(settingsRes.data.market_fee_percent) || 0,
                    nirashrit_percent: Number(settingsRes.data.nirashrit_percent) || 0,
                    misc_fee_percent: Number(settingsRes.data.misc_fee_percent) || 0,
                    gst_enabled: settingsRes.data.gst_enabled || false,
                    gst_type: settingsRes.data.gst_type || 'intra',
                    cgst_percent: Number(settingsRes.data.cgst_percent) || 0,
                    sgst_percent: Number(settingsRes.data.sgst_percent) || 0,
                    igst_percent: Number(settingsRes.data.igst_percent) || 0,
                    state_code: settingsRes.data.state_code || null
                });
                if (settingsRes.data.max_invoice_amount != null) {
                    setMaxInvoiceAmount(Number(settingsRes.data.max_invoice_amount));
                }
            }

            // 2. Fetch Inventory/Stock Data (Lots + Commodities)
            const [lotRes, commodityRes] = await Promise.all([
                supabase.schema('mandi').from('lots').select('id, item_id, arrival_id, unit, sale_price, wholesale_price, supplier_rate, packing_cost, loading_cost, farmer_charges, qr_code, barcode, current_qty, storage_location, lot_code, custom_attributes, contact_id(name)').eq('organization_id', orgId).in('status', ['active', 'available', 'partial']).gt('current_qty', 0).order('created_at', { ascending: true }),
                supabase.schema('mandi').from('commodities').select('id, name, local_name, barcode, gst_rate, sale_price, image_url, sku_code, custom_attributes').eq('organization_id', orgId)
            ]);



            if (lotRes.error) throw lotRes.error;

            const commodityMap = (commodityRes.data || []).reduce((acc: any, c: any) => ({ ...acc, [c.id]: c }), {});
            const stockMap: Record<string, any> = {};

            for (const lot of (lotRes.data || [])) {
                const commodity = commodityMap[lot.item_id] || {};
                const price = (Number(lot.sale_price) > 0) ? Number(lot.sale_price) : (Number(commodity.sale_price) > 0 ? Number(commodity.sale_price) : Number(lot.supplier_rate) || 0);
                
                // Supabase might return contact_id as an object or an array depending on relationship config
                // @ts-ignore
                const contactData = Array.isArray(lot.contact_id) ? lot.contact_id[0] : lot.contact_id;
                const supplierName = contactData?.name || 'Anonymous Supplier';
                
                const key = `${lot.item_id}|${lot.unit}|${price}|${supplierName}|${JSON.stringify(lot.custom_attributes || {})}`;

                if (!stockMap[key]) {
                    let imgUrl = commodity.image_url || null;
                    if (!imgUrl) {
                        const visual = getIntelligentVisual(commodity.name || '', { Package });
                        if (visual.type === 'img' && visual.src) imgUrl = visual.src;
                    }
                    
                    const displayAttributes = {
                        ...(commodity.custom_attributes || {}),
                        ...(lot.custom_attributes || {})
                    };

                    stockMap[key] = {
                        item_id: lot.item_id,
                        item_name: formatCommodityName(commodity.name, displayAttributes) || lot.item_id,
                        local_name: commodity.local_name || '',
                        sku_code: commodity.sku_code || '',
                        custom_attributes: displayAttributes,
                        unit: lot.unit,
                        total_qty: 0,
                        image_url: imgUrl,
                        lot_id: lot.id,
                        lot_code: lot.lot_code,
                        lot_details: [],
                        supplier_name: supplierName,
                        sale_price: price,
                        purchase_rate: Number(lot.supplier_rate) || 0,
                        packing_cost: Number(lot.packing_cost) || 0,
                        loading_cost: Number(lot.loading_cost) || 0,
                        farmer_charges: Number(lot.farmer_charges) || 0
                    };
                }


                stockMap[key].total_qty += Number(lot.current_qty) || 0;
                stockMap[key].lot_details.push({ 
                    id: lot.id, 
                    qr_code: lot.qr_code, 
                    barcode: lot.barcode,
                    current_qty: Number(lot.current_qty), 
                    arrival_id: lot.arrival_id 
                });
            }


            const normalizedItems: POSItem[] = Object.entries(stockMap).map(([key, stock]: [string, any]) => ({
                id: stock.item_id,
                unique_key: key,
                name: stock.item_name,
                supplier_name: stock.supplier_name,
                local_name: stock.local_name,
                sku_code: stock.sku_code,
                custom_attributes: stock.custom_attributes,
                sale_price: stock.sale_price,
                barcode: commodityMap[stock.item_id]?.barcode || null,
                lot_details: stock.lot_details,
                unit: stock.unit,
                gst_rate: Number(commodityMap[stock.item_id]?.gst_rate) || 0,
                image_url: stock.image_url,
                available_qty: stock.total_qty,
                purchase_rate: stock.purchase_rate,
                packing_cost: stock.packing_cost,
                loading_cost: stock.loading_cost,
                farmer_charges: stock.farmer_charges,
                lot_id: stock.lot_id,
                lot_code: stock.lot_code
            })).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));


            setItems(normalizedItems);
            setFilteredItems(normalizedItems);
            
            // Background Cache Sync
            cacheSet('pos_masters', orgId, {
                items: normalizedItems,
                accounts: accsRes.data || [],
                buyers: buyersRes.data || [],
                orgSettings: orgRes.data?.settings || {},
                orgName: orgRes.data?.name || 'MandiGrow',
                platformBranding: brandingRes.data || null
            });

            setLoading(false);
        } catch (err: any) {
            if (err.name === 'AbortError') return;
            console.error("POS Data Fetch Error:", err);
            if (retryCount < 2) {
                setTimeout(() => fetchData(signal, retryCount + 1), 1000);
            } else {
                setLoading(false);
            }
        }
    }

    const addToCart = (item: POSItem, forceQty?: number) => {
        const qtyToAdd = forceQty ?? 1;
        const existing = cart.find(c => c.item.unique_key === item.unique_key)
        
        if (existing) {
            const proposedQty = existing.qty + qtyToAdd;
            // Enforce max available quantity
            if (proposedQty > item.available_qty) {
                setShakingCartId(item.unique_key)
                setTimeout(() => setShakingCartId(null), 500)
                toast.error("Stock Limit Reached", {
                    description: `Only ${item.available_qty} ${item.unit} available for ${item.name}. Added remaining available quantity.`,
                    position: 'top-center'
                })
                // Cap to max available
                setCart(cart.map(c => c.item.unique_key === item.unique_key ? { ...c, qty: item.available_qty } : c))
                return
            }
            setCart(cart.map(c => c.item.unique_key === item.unique_key ? { ...c, qty: proposedQty } : c))
        } else {
            if (item.available_qty <= 0) {
                setShakingItemId(item.unique_key)
                setTimeout(() => setShakingItemId(null), 500)
                toast.error("Out of Stock", {
                    description: `${item.name} is currently unavailable.`,
                    position: 'top-center'
                })
                return
            }
            
            const effectiveQty = item.available_qty >= qtyToAdd ? qtyToAdd : item.available_qty;
            if (qtyToAdd > item.available_qty) {
                 toast.error("Stock Limit Reached", {
                    description: `Only ${item.available_qty} ${item.unit} available for ${item.name}.`,
                    position: 'top-center'
                })
            }
            // Use sale_price if > 0, otherwise 0 (editable in cart)
            setCart([...cart, { item, qty: effectiveQty, price: item.sale_price > 0 ? item.sale_price : 0 }])
        }
    }

    const removeFromCart = (uniqueKey: string) => {
        // Also wipe scannedLots mapping if they remove the item so they can scan it again
        const targetItem = cart.find(c => c.item.unique_key === uniqueKey)?.item;
        if (targetItem) {
            const mappedQrs = targetItem.lot_details?.map(ld => ld.qr_code) || [];
            setScannedLots(prev => prev.filter(qr => !mappedQrs.includes(qr)));
        }
        setCart(cart.filter(c => c.item.unique_key !== uniqueKey))
    }

    const updateQty = (uniqueKey: string, val: number | string) => {
        setCart(cart.map(c => {
            if (c.item.unique_key === uniqueKey) {
                let newQty = typeof val === 'string' ? (parseInt(val) || 0) : (c.qty + val)
                newQty = Math.max(0, newQty)

                // Enforce max available quantity
                if (newQty > c.item.available_qty) {
                    setShakingCartId(uniqueKey)
                    setTimeout(() => setShakingCartId(null), 500)
                    toast.error("Stock Limit Reached", {
                        description: `Maximum available quantity is ${c.item.available_qty} ${c.item.unit}.`,
                        position: 'top-center'
                    })
                    return { ...c, qty: c.item.available_qty } // Cap to max
                }
                return { ...c, qty: newQty }
            }
            return c
        }))
    }

    const updatePrice = (uniqueKey: string, price: string) => {
        const newPrice = parseFloat(price) || 0
        setCart(cart.map(c => c.item.unique_key === uniqueKey ? { ...c, price: newPrice } : c))
    }

    // const subTotal = cart.reduce((acc, c) => acc + (c.qty * c.price), 0)
    
    // Calculate Final Taxable Amount after Discount
    const taxableSubTotal = Math.max(0, subTotal - discountAmount)

    // Per-item GST (only if global GST NOT enabled)
    const perItemGstTotal = taxSettings.gst_enabled ? 0 : cart.reduce((s, c) => {
        // If per-item, we should ideally distribute discount, but for POS simplicity
        // we'll apply it proportional to subtotal if it's a global discount.
        // However, standard Mandi practice is to apply global discount to taxable base.
        const itemSubtotal = c.price * c.qty;
        const itemRatio = subTotal > 0 ? (itemSubtotal / subTotal) : 0;
        const itemDiscount = discountAmount * itemRatio;
        const itemTaxable = Math.max(0, itemSubtotal - itemDiscount);
        return s + (itemTaxable * (c.item.gst_rate / 100));
    }, 0)
    
    // Global GST from settings
    const globalGstAmount = taxSettings.gst_enabled
        ? (taxSettings.gst_type === 'inter'
            ? Math.round((taxableSubTotal * taxSettings.igst_percent) / 100)
            : Math.round((taxableSubTotal * (taxSettings.cgst_percent + taxSettings.sgst_percent)) / 100))
        : 0
    
    const gstTotal = taxSettings.gst_enabled ? globalGstAmount : perItemGstTotal
    
    // Market charges from settings (auto-applied on taxable base)
    const marketFeeAmount = Math.round(taxableSubTotal * taxSettings.market_fee_percent / 100)
    const nirashritAmount = Math.round(taxableSubTotal * taxSettings.nirashrit_percent / 100)
    const miscFeeAmount = Math.round(taxableSubTotal * taxSettings.misc_fee_percent / 100)
    
    const extraChargesTotal = additionalCharges.reduce((acc, c) => acc + c.amount, 0)
    const grandTotal = taxableSubTotal + gstTotal + marketFeeAmount + nirashritAmount + miscFeeAmount + extraChargesTotal

    const handleConfirmCheckout = async () => {
        if (cart.length === 0) {
            toast.error("Cart is Empty", { description: "Cannot process a sale with zero items." });
            return;
        }
        if (!profile?.organization_id) return
        
        if (maxInvoiceAmount > 0 && grandTotal > maxInvoiceAmount) {
            toast.error("Invoice Limit Exceeded", {
                description: `This invoice total (₹${grandTotal.toLocaleString()}) exceeds the maximum limit of ₹${maxInvoiceAmount.toLocaleString()}.`,
                position: 'top-center'
            });
            return;
        }
        
        setShowConfirm(false)
        
        if (paymentMode === 'Credit' || amountReceived < grandTotal) {
            if (!selectedBuyerId) {
                toast.error("Buyer Required", {
                    description: `You must select a buyer for partial or credit transactions.`,
                    position: 'top-center'
                })
                return
            }
        }

        setSaving(true)

        try {
            const schema = 'mandi'
            console.log("POS: Processing checkout for Mandi schema")

            const notesText = paymentMode === 'Cheque' 
                ? `POS Transaction via Cheque. No: ${chequeDetails.no}, Date: ${chequeDetails.date}` 
                : `POS Transaction via ${paymentMode}`

            let saleId = ""
            let generatedRefNo = ""
            const isPartial = paymentMode !== 'Credit' && amountReceived < grandTotal

            if (schema === 'mandi') {
                const idempotencyKey = crypto.randomUUID();
                const rpcPaymentMode = toRpcPaymentMode(paymentMode);
                const buyerInfo = buyers.find(b => b.id === selectedBuyerId);
                
                const rpcItems = cart.flatMap(c => {
                    // Proper Distribution Logic: POS items are grouped by price/unit/supplier, but can span multiple lots.
                    // We must distribute the sold quantity across those lots to prevent 'chk_lot_qty_nonnegative' violations.
                    let remainingQty = c.qty;
                    const distributed = [];
                    
                    // Use the latest lot_details from the cart item's source
                    const currentLots = c.item.lot_details || [];
                    
                    for (const lot of currentLots) {
                        if (remainingQty <= 0) break;
                        const take = Math.min(remainingQty, lot.current_qty);
                        if (take > 0) {
                            distributed.push({
                                item_id: c.item.id,
                                qty: take,
                                rate: c.price,
                                amount: take * c.price,
                                unit: c.item.unit || 'NO',
                                lot_id: lot.id
                            });
                            remainingQty -= take;
                        }
                    }

                    // Fallback: If for some reason we couldn't distribute fully (stale UI), 
                    // we still send what remains to the primary lot_id to let the RPC handle validation.
                    if (remainingQty > 0) {
                        distributed.push({
                            item_id: c.item.id,
                            qty: remainingQty,
                            rate: c.price,
                            amount: remainingQty * c.price,
                            unit: c.item.unit || 'NO',
                            lot_id: c.item.lot_id
                        });
                    }

                    return distributed;
                });

                const isIgst = taxSettings.gst_enabled && taxSettings.gst_type === 'inter';
                const { data, error: rpcError, warning } = await confirmSaleTransactionWithFallback({
                    organizationId: profile.organization_id,
                    buyerId: selectedBuyerId || null,
                    saleDate: new Date().toISOString().split('T')[0],
                    paymentMode: rpcPaymentMode,
                    totalAmount: subTotal, // base items subtotal
                    items: rpcItems,
                    marketFee: marketFeeAmount,
                    nirashrit: nirashritAmount,
                    miscFee: miscFeeAmount,
                    discountPercent: discountPercent,
                    discountAmount: discountAmount,
                    loadingCharges: additionalCharges.find(c => c.name.toLowerCase() === 'loading')?.amount || 0,
                    unloadingCharges: additionalCharges.find(c => c.name.toLowerCase() === 'unloading')?.amount || 0,
                    otherExpenses: additionalCharges.reduce((acc, c) => acc + (['loading','unloading'].includes(c.name.toLowerCase()) ? 0 : c.amount), 0),
                    idempotencyKey,
                    dueDate: (paymentMode === 'Credit' || isPartial) ? new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0] : null,
                    bankAccountId: selectedAccountId || null,
                    chequeNo: paymentMode === 'Cheque' ? chequeDetails.no : null,
                    chequeDate: paymentMode === 'Cheque' && chequeDetails.date ? chequeDetails.date : null,
                    chequeStatus: paymentMode === 'Cheque' ? chequeStatus : false,
                    bankName: paymentMode === 'Cheque' ? chequeDetails.bank : null,
                    amountReceived: amountReceived,
                    cgstAmount: taxSettings.gst_enabled && taxSettings.gst_type === 'intra' ? Math.round((taxableSubTotal * taxSettings.cgst_percent) / 100) : 0,
                    sgstAmount: taxSettings.gst_enabled && taxSettings.gst_type === 'intra' ? Math.round((taxableSubTotal * taxSettings.sgst_percent) / 100) : 0,
                    igstAmount: isIgst ? Math.round((taxableSubTotal * taxSettings.igst_percent) / 100) : 0,
                    gstTotal: gstTotal,
                    isIgst: isIgst,
                    placeOfSupply: isIgst ? (buyerInfo?.state_code || null) : (taxSettings.state_code || null),
                    buyerGstin: buyerInfo?.gstin || null
                });

                if (rpcError) {
                    console.error("Sale RPC Error:", rpcError);
                    throw new Error(rpcError.message || "Failed to confirm sale transaction");
                }
                if (warning) {
                    toast.warning("Checkout saved with a note", {
                        description: warning,
                        position: 'top-center'
                    })
                }
                
                saleId = data?.sale_id;
                generatedRefNo = "Bill #" + (data?.contact_bill_no || data?.bill_no);
            }

            setLastInvoiceId(saleId)
            setLastRefNo(generatedRefNo)
            setShowSuccess(true)
            setScannedLots([]) // Clear anti-duplicate tracking
            
            // Refresh stock data immediately so quantities are correct on POS UI
            const controller = new AbortController()
            fetchData(controller.signal)
            
        } catch (err: any) {
            console.error("Checkout Error:", err)
            toast.error(err.message || "Failed to process transaction")
        } finally {
            setSaving(false)
        }
    }

    const handleCheckout = () => {
        if (cart.length === 0) {
            toast.error("Cart is Empty", { position: 'top-center' });
            return;
        }

        if (maxInvoiceAmount > 0 && grandTotal > maxInvoiceAmount) {
            toast.error("Invoice Limit Exceeded", {
                description: `This invoice total (₹${grandTotal.toLocaleString()}) exceeds the maximum limit of ₹${maxInvoiceAmount.toLocaleString()}.`,
                position: 'top-center'
            });
            return;
        }

        // --- MANDATORY PAYMENT VALIDATION ---
        // If it's not a credit sale, the user MUST enter an amount received.
        if (paymentMode !== 'Credit' && amountReceived <= 0) {
            toast.error("Amount Received Required", { 
                description: `Please enter the amount received for this ${paymentMode} sale.`,
                position: 'top-center'
            });
            return;
        }

        if (paymentMode === 'Cheque') {
            if (!selectedBuyerId) {
                setShowErrors(true);
                toast.error("Buyer Required", { description: "Select a buyer for cheque payments.", position: 'top-center' });
                return;
            }
            // Clearing Date is mandatory only for Pending cheques
            if (!chequeStatus && (!chequeDetails.date || chequeDetails.date === '')) {
                setShowErrors(true);
                toast.error("Clearing Date Required", { description: "Please select a clearing date for the pending cheque.", position: 'top-center' });
                return;
            }
        }
        
        if (paymentMode === 'Credit' || amountReceived < grandTotal) {
            if (!selectedBuyerId) {
                toast.error("Buyer Required", {
                    description: `You must select a buyer for partial or credit transactions.`,
                    position: 'top-center'
                })
                return
            }
        }
        
        setShowErrors(false);
        setShowConfirm(true);
    }

    const resetPOS = () => {
            setShowSuccess(false)
            setSearch('')
            setFilteredItems(items)
            setCart([])
            setChequeDetails({ no: '', date: '', bank: '' })
            if (barcodeRef.current) barcodeRef.current.focus()
        }

    useEffect(() => {
        const lowerSearch = search.toLowerCase()
        const filtered = items.filter(item =>
            (item.name || '').toLowerCase().includes(lowerSearch) ||
            (item.local_name || '').toLowerCase().includes(lowerSearch) ||
            (item.sku_code || '').toLowerCase().includes(lowerSearch) ||
            (item.barcode || '').toLowerCase().includes(lowerSearch) ||
            item.lot_details?.some(ld => 
                (ld.qr_code && ld.qr_code.toLowerCase().includes(lowerSearch)) ||
                (ld.barcode && ld.barcode.toLowerCase().includes(lowerSearch))
            )
        )

        setFilteredItems(filtered)
    }, [search, items])

    useEffect(() => {
        if (amountReceivedManuallyEdited.current) return;
        
        if (paymentMode === 'Credit') {
            setAmountReceived(0)
        } else {
            setAmountReceived(grandTotal)
        }
    }, [grandTotal, paymentMode])

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col md:flex-row bg-slate-50 relative">

            {/* ── SCAN DETAIL DIALOG ── */}
            <Dialog open={!!scanResult} onOpenChange={(open) => { if (!open) setScanResult(null); }}>
                <DialogContent className="sm:max-w-md bg-white rounded-2xl p-0 overflow-hidden border-0 shadow-2xl">
                    {scanResult && (() => {
                        const { item, qty, lotQrCode } = scanResult;
                        const imgSrc: string | null = item.image_url || null;
                        return (
                            <>
                                {/* Hero */}
                                <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-2xl bg-white/10 overflow-hidden flex-shrink-0 border border-white/20">
                                        {imgSrc ? (
                                            <img src={imgSrc} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center"><Package className="w-7 h-7 text-white/50" /></div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <DialogTitle className="text-white text-xl font-black leading-tight">{item.name}</DialogTitle>
                                        <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mt-1">{item.unit}</p>
                                    </div>
                                    {/* QR Code */}
                                    {lotQrCode && (
                                        <div className="bg-white rounded-xl p-2 flex-shrink-0">
                                            <QRCodeSVG value={lotQrCode} size={60} level="Q" includeMargin={false} />
                                            <p className="text-[9px] font-black text-center text-gray-700 mt-1 font-mono">{lotQrCode}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Details */}
                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Unit</div>
                                            <div className="text-lg font-black text-slate-900">{item.unit}</div>
                                        </div>
                                        <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                                            <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Sale Price</div>
                                            <div className="text-lg font-black text-emerald-700">
                                                {item.sale_price > 0 ? `₹${item.sale_price.toLocaleString('en-IN')}` : <span className="text-slate-400 text-xs">Not Set</span>}
                                            </div>
                                            <div className="text-[9px] text-emerald-600">per {item.unit}</div>
                                        </div>
                                        <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                                            <div className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1">Lot Number</div>
                                            <div className="text-xs font-black text-blue-700 leading-tight">{item.lot_code || '—'}</div>
                                        </div>
                                    </div>

                                    {/* Grade / custom attributes */}

                                    {item.custom_attributes && Object.keys(item.custom_attributes).length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(item.custom_attributes).map(([k, v]) => (
                                                <span key={k} className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                                    {k}: {v as string}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Qty adjuster */}
                                    <div className="flex items-center gap-4">
                                        <Label className="text-xs font-black uppercase text-slate-600 tracking-widest flex-shrink-0">Qty to Add</Label>
                                        <div className="flex items-center gap-2 flex-1 justify-end">
                                            <button
                                                type="button"
                                                onClick={() => setScanResult(prev => prev ? { ...prev, qty: Math.max(1, prev.qty - 1) } : null)}
                                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-black text-slate-700"
                                            >−</button>
                                            <span className="w-12 text-center font-black text-xl text-slate-900">{scanResult.qty}</span>
                                            <button
                                                type="button"
                                                onClick={() => setScanResult(prev => prev ? { ...prev, qty: Math.min(item.available_qty, prev.qty + 1) } : null)}
                                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-black text-slate-700"
                                            >+</button>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3 pt-2">
                                        <Button variant="outline" className="flex-1 font-bold border-slate-200 hover:bg-slate-50" onClick={() => setScanResult(null)}>
                                            Cancel
                                        </Button>
                                        <Button
                                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black gap-2"
                                            onClick={() => {
                                                addToCart(item, scanResult.qty);
                                                if (lotQrCode) setScannedLots(prev => [...prev, lotQrCode!]);
                                                toast.success('Added to Cart', {
                                                    description: `${scanResult.qty} ${item.unit} of ${item.name} added.`,
                                                    position: 'top-center'
                                                });
                                                setScanResult(null);
                                            }}
                                        >
                                            <ShoppingCart className="w-4 h-4" /> Add to Cart
                                        </Button>
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden print:hidden">
                <div className="relative mb-6">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <Barcode className="w-5 h-5 text-indigo-500" />
                        <span className="h-4 w-px bg-slate-200"></span>
                        <Search className="w-4 h-4 text-slate-400" />
                    </div>
                    <input
                        ref={barcodeRef}
                        autoFocus
                        placeholder="Scan Barcode or Search Item (Alt+S)..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-16 pr-6 py-4 bg-white border-2 border-slate-300 rounded-2xl text-xl font-bold text-black placeholder:text-slate-400 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 transition-all outline-none shadow-sm"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-blue-50 px-2 py-1 rounded text-[10px] font-black text-blue-600 border border-blue-100 uppercase tracking-widest">Live Sync</div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {loading && items.length === 0 ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-48 bg-white rounded-2xl"></div>)}
                        </div>
                    ) : (filteredItems.length === 0) ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 border-2 border-dashed border-slate-200 rounded-[3rem] bg-white/50 m-4">
                            <Zap className="w-12 h-12 mb-4 opacity-20" />
                            <p className="font-black uppercase tracking-widest text-[11px]">No products available in stock</p>
                            <p className="text-[10px] mt-2 opacity-60">Items will appear here once arrivals are processed.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-12">
                            {filteredItems.map(item => (
                                <motion.button
                                    key={item.unique_key}
                                    onClick={() => addToCart(item, 1)}
                                    animate={shakingItemId === item.unique_key ? {
                                        x: [0, -10, 10, -10, 10, 0],
                                        transition: { duration: 0.4 }
                                    } : {}}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="group aspect-square bg-white border border-slate-200 rounded-3xl p-4 flex flex-col items-center justify-center text-center hover:border-indigo-600 hover:shadow-2xl hover:shadow-indigo-100 transition-all text-slate-700"
                                >
                                    {item.image_url ? (
                                        <img src={item.image_url} alt={item.name} className="w-16 h-16 object-contain mb-3 rounded-lg" />
                                    ) : (
                                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-3 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                            <Package className="w-6 h-6" />
                                        </div>
                                    )}
                                    <div className="text-sm font-black tracking-tight leading-none mb-1 group-hover:text-indigo-600 text-slate-900">
                                        {item.name}
                                        {language !== 'en' && item.local_name && <span className="block text-[10px] font-bold text-slate-500 mt-1">({item.local_name})</span>}
                                    </div>
                                    {item.sku_code && (
                                        <div className="text-[9px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-1.5 py-0.5 rounded-full mb-1">
                                            {item.sku_code}
                                        </div>
                                    )}
                                    {item.custom_attributes && Object.keys(item.custom_attributes).length > 0 && (
                                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-tighter mb-1 line-clamp-1">
                                            {Object.entries(item.custom_attributes)
                                                .filter(([k, v]) => !['grade', 'GRADE'].includes(k) && v !== '')
                                                .map(([k, v]) => `${k}: ${v}`).join(", ")}
                                        </div>
                                    )}
                                    {item.lot_code && (
                                        <div className="flex flex-col gap-1 mb-1">
                                            {item.grade && item.grade !== 'A' && (
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-1">Grade: {item.grade}</div>
                                            )}
                                            <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                                                {item.lot_code}
                                            </div>
                                        </div>
                                    )}
                                    <div className="text-xs font-black text-slate-600 uppercase tracking-widest group-hover:text-indigo-400">{item.unit}</div>
                                    <div className="text-[10px] font-bold text-emerald-600 mb-2">{item.available_qty} available</div>
                                    <div className="mt-auto pt-2 border-t border-slate-100 w-full flex flex-col items-center">
                                        <div className="text-lg font-black text-slate-900 leading-none">
                                            {item.sale_price > 0 ? `₹${item.sale_price.toLocaleString()}` : <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Price not set</span>}
                                        </div>
                                        <div className="text-[8px] font-black uppercase tracking-widest text-emerald-600 mt-1">Sale Price</div>
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Side: Cart & Checkout */}
            <div className="w-full md:w-[400px] bg-white border-l border-slate-200 flex flex-col shadow-2xl relative z-10 print:hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-black rounded-xl flex items-center justify-center text-white">
                                <Zap className="w-5 h-5 fill-amber-400 text-amber-400" />
                            </div>
                            <div>
                                <h2 className="font-[1000] text-xl text-slate-900 uppercase tracking-tighter italic">Quick Checkout</h2>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mt-1">{cart.length} Items Selected</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-1.5 z-[210]">
                        <SearchableSelect
                            options={buyers.map(b => ({ label: `${b.name} (${b.city || 'N/A'})`, value: b.id }))}
                            value={selectedBuyerId}
                            onChange={setSelectedBuyerId}
                            placeholder={(paymentMode === 'Credit' || paymentMode === 'Cheque') ? "Select Buyer (Required)" : "Select Buyer (Optional)"}
                            className={cn(
                                "bg-slate-50 border-slate-200 text-slate-800 font-bold h-10 w-full rounded-xl",
                                showErrors && (paymentMode === 'Credit' || paymentMode === 'Cheque') && !selectedBuyerId && "border-red-500 border-2"
                            )}
                        />
                        {selectedBuyerId && (
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex flex-col gap-1 shadow-sm"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse" />
                                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Buyer Details</span>
                                    </div>
                                    {buyers.find(b => b.id === selectedBuyerId)?.gstin && (
                                        <span className="text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-black tracking-tighter">GST ACTIVE</span>
                                    )}
                                </div>
                                <div className="flex items-baseline justify-between mt-1">
                                    <div className="text-xs font-black text-slate-900 truncate max-w-[200px]">
                                        {buyers.find(b => b.id === selectedBuyerId)?.name}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-600">
                                        {buyers.find(b => b.id === selectedBuyerId)?.city || 'N/A'}
                                    </div>
                                </div>
                                {buyers.find(b => b.id === selectedBuyerId)?.gstin && (
                                    <div className="flex items-center gap-2 mt-1 pt-1 border-t border-indigo-100/50">
                                        <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-tight">GSTIN:</span>
                                        <span className="text-[10px] font-black text-slate-700 font-mono tracking-wider">
                                            {buyers.find(b => b.id === selectedBuyerId)?.gstin}
                                        </span>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* Cart Items List - Scrollable */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0 bg-white/50">
                    {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-300">
                            <ShoppingCart className="w-12 h-12 mb-4 opacity-20" />
                            <p className="font-black text-[10px] uppercase tracking-widest opacity-50">Basket is empty</p>
                        </div>
                    ) : (
                        cart.map((c, i) => (
                            <motion.div
                                key={c.item.unique_key}
                                animate={shakingCartId === c.item.unique_key ? {
                                    x: [0, -5, 5, -5, 5, 0],
                                    transition: { duration: 0.3 }
                                } : {}}
                                className="flex items-start justify-between gap-2 p-3 bg-white hover:bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-300 transition-all group relative shadow-sm"
                            >
                                {/* SERIAL NUMBER */}
                                <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-5 h-5 bg-slate-900 border-2 border-white text-white rounded-full flex items-center justify-center text-[9px] font-black shadow-md z-10 group-hover:bg-indigo-600 transition-colors">
                                    {i + 1}
                                </div>
                                <div className="flex-1 space-y-1.5">
                                    <div className="font-black text-slate-900 text-sm leading-tight flex flex-wrap items-center gap-1">
                                        {c.item.name} 
                                        {language !== 'en' && c.item.local_name && <span className="text-[10px] text-slate-500 font-bold ml-1">({c.item.local_name})</span>}
                                        <span className="text-[10px] text-slate-400 font-bold ml-1">({c.item.unit})</span>
                                        {c.item.sku_code && <span className="text-[8px] text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded-md font-black tracking-widest">{c.item.sku_code}</span>}
                                    </div>

                                    {/* Detailed Chips Row */}
                                    <div className="flex flex-wrap items-center gap-1">
                                        {c.item.lot_code && (
                                            <div className="flex items-center gap-1 bg-indigo-600 text-white px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shadow-sm">
                                                <Tag className="w-2.5 h-2.5" />
                                                {c.item.lot_code}
                                            </div>
                                        )}

                                    </div>

                                    {/* Price Input */}
                                    <div className="flex items-center bg-white h-7 px-2 rounded-xl border border-slate-200 mt-1 shadow-sm max-w-fit hover:border-emerald-300 transition-all">
                                        <span className="text-emerald-700 font-black text-xs mr-1">₹</span>
                                        <input 
                                            type="number" 
                                            value={c.price} 
                                            onChange={(e) => updatePrice(c.item.unique_key, e.target.value)}
                                            className="w-16 bg-transparent border-none focus:ring-0 p-0 font-black text-emerald-700 text-xs"
                                            title="Adjust Sale Price"
                                        />
                                        <div className="ml-1.5 pl-1.5 border-l border-emerald-200 text-[7px] uppercase tracking-tighter text-emerald-600 font-black leading-none">Price</div>
                                    </div>
                                </div>

                                {/* Qty & Total */}
                                <div className="flex flex-col items-end justify-between self-stretch min-w-[80px]">
                                    <div className="flex items-center bg-white rounded-xl border border-slate-200 h-7 p-0.5 shadow-sm">
                                        <button onClick={() => updateQty(c.item.unique_key, (c.qty - 1).toString())} className="p-1 px-1.5 text-slate-400 hover:text-black rounded-lg transition-colors"><Minus className="w-3 h-3" /></button>
                                        <div className="flex flex-col items-center">
                                            <input type="number" value={c.qty} onChange={(e) => updateQty(c.item.unique_key, e.target.value)} className="w-8 text-center font-black text-xs text-black bg-transparent border-none focus:ring-0 p-0" />
                                            <span className="text-[7px] font-black uppercase text-slate-400 -mt-1">{c.item.unit}</span>
                                        </div>
                                        <button onClick={() => updateQty(c.item.unique_key, (c.qty + 1).toString())} className="p-1 px-1.5 text-slate-400 hover:text-black rounded-lg transition-colors"><Plus className="w-3 h-3" /></button>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-auto">
                                        <div className="text-sm font-black text-slate-900">₹{(c.price * c.qty).toLocaleString('en-IN')}</div>
                                        <button onClick={() => removeFromCart(c.item.unique_key)} className="p-1 text-slate-300 hover:text-red-600 group-hover:opacity-100 transition-all"><X className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>

                {/* Footer Section - Totals & Payment */}
                <div className="p-6 bg-slate-900 text-white rounded-t-[3rem] shadow-[0_-20px_40px_rgba(0,0,0,0.1)] flex flex-col shrink-0">
                    <div className="shrink-0 flex justify-between items-center mb-4">
                        <div className="flex flex-col">
                            <span className="font-black uppercase tracking-tighter text-indigo-400 text-[10px]">Grand Total</span>
                            <div className="text-[10px] font-bold text-slate-500">
                                {cart.length} items • ₹{subTotal.toLocaleString('en-IN')} + ₹{gstTotal.toLocaleString('en-IN')} Tax
                            </div>
                            <div className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mt-0.5">
                                Avg Price: ₹{(cart.reduce((s, c) => s + c.qty, 0) > 0 ? (grandTotal / cart.reduce((s, c) => s + c.qty, 0)) : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </div>
                        </div>
                        <span className="text-3xl font-black italic tracking-tighter">₹{grandTotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>
                    </div>

                    {/* Payment Area - Scrollable if needed but usually compact */}
                    <div className="overflow-y-auto max-h-[30vh] custom-scrollbar -mr-4 pr-4 space-y-4 pb-2">

                        <div className="grid grid-cols-4 gap-2">
                            <button onClick={() => setPaymentMode('Credit')} className={cn("flex flex-col items-center justify-center gap-1.5 p-2 rounded-2xl border transition-all h-16", paymentMode === 'Credit' ? "bg-rose-600 border-rose-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700")}>
                                <User className="w-4 h-4" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-center" style={{ lineHeight: '1.2' }}>Udhaar</span>
                            </button>
                            <button onClick={() => setPaymentMode('Cash')} className={cn("flex flex-col items-center justify-center gap-1.5 p-2 rounded-2xl border transition-all h-16", paymentMode === 'Cash' ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700")}>
                                <Banknote className="w-4 h-4" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-center" style={{ lineHeight: '1.2' }}>Cash</span>
                            </button>
                            <button onClick={() => setPaymentMode('UPI/Bank')} className={cn("flex flex-col items-center justify-center gap-1.5 p-2 rounded-2xl border transition-all h-16", paymentMode === 'UPI/Bank' ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700")}>
                                <Zap className="w-4 h-4" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-center" style={{ lineHeight: '1.2' }}>UPI / BANK</span>
                            </button>
                            <button onClick={() => setPaymentMode('Cheque')} className={cn("flex flex-col items-center justify-center gap-1.5 p-2 rounded-2xl border transition-all h-16", paymentMode === 'Cheque' ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700")}>
                                <FileText className="w-4 h-4" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-center" style={{ lineHeight: '1.2' }}>Cheque</span>
                            </button>
                        </div>

                        {paymentMode === 'UPI/Bank' && (
                            <div className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 shadow-sm text-slate-800 mb-2">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 block flex items-center gap-1"><Landmark className="w-3 h-3"/> Settle To (Bank)</label>
                                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Digital Payment</div>
                                    </div>
                                    <button 
                                        onClick={() => setShowQR(!showQR)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all text-[9px] font-black uppercase tracking-widest",
                                            showQR ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                        )}
                                    >
                                        <Zap className={cn("w-3 h-3", showQR ? "fill-emerald-500 text-emerald-500" : "text-slate-400")} />
                                        {showQR ? "QR Visible" : "Show QR"}
                                    </button>
                                </div>

                                <select 
                                    value={selectedAccountId} 
                                    onChange={e => setSelectedAccountId(e.target.value)}
                                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl h-10 px-3 text-xs font-bold shadow-sm focus:border-indigo-500 outline-none"
                                >
                                    <option value="" disabled>Select deposit account...</option>
                                    {accounts.filter(a => a.type === 'asset' && a.account_sub_type === 'bank').map(a => (
                                        <option key={a.id} value={a.id}>{a.name}{a.is_default ? ' ⭐' : ''}</option>
                                    ))}
                                </select>
                                
                                {showQR && (() => {
                                    const acc = accounts.find(a => a.id === selectedAccountId)
                                    const meta = acc && acc.description?.startsWith('{') ? JSON.parse(acc.description) : {}
                                    const upiId = meta.upi_id || orgSettings?.payment?.upi_id
                                    if (upiId) {
                                        const qrAmount = (amountReceived > 0 ? amountReceived : grandTotal);
                                        const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(orgName)}&am=${qrAmount.toFixed(2)}&cu=INR`
                                        return (
                                            <motion.div 
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="mt-2 flex flex-col items-center justify-center p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-inner overflow-hidden"
                                            >
                                                <div className="bg-white p-2 rounded-xl border border-slate-100 mb-2">
                                                    <QRCodeSVG value={upiUrl} size={130} level="M" />
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-800 mb-0.5 tracking-tighter">Scan to Pay ₹{qrAmount.toFixed(0)}</div>
                                                    <div className="text-[8px] font-bold text-slate-400 truncate max-w-[150px]">{upiId}</div>
                                                </div>
                                            </motion.div>
                                        )
                                    } else if (selectedAccountId) {
                                        return <div className="text-[9px] font-bold text-amber-600 italic text-center py-2 bg-amber-50 rounded-lg border border-amber-100 mt-1">⚠️ No UPI ID configured on this bank.</div>
                                    }
                                    return null;
                                })()}
                            </div>
                        )}

                        {paymentMode === 'Cheque' && (
                            <div className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2 shadow-sm text-slate-800 mb-2">
                                <div className="flex flex-col border-b border-slate-200 pb-3 gap-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-slate-800">
                                            <FileText className="w-4 h-4 text-indigo-600" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Cheque Logic</span>
                                        </div>
                                        <label className={cn(
                                            "flex items-center gap-2 cursor-pointer shadow-sm select-none px-3 py-1.5 rounded-full border transition-all duration-200",
                                            chequeStatus ? "bg-emerald-100 border-emerald-500 shadow-sm shadow-emerald-200" : "bg-white border-slate-200 hover:bg-slate-50"
                                        )}>
                                            <span className={cn("text-[10px] font-black uppercase tracking-widest", chequeStatus ? "text-emerald-800" : "text-slate-600")}>
                                                {chequeStatus ? '⚡ Cleared Instantly' : '📅 Clear Later'}
                                            </span>
                                            <Switch checked={chequeStatus} onCheckedChange={setChequeStatus} className="data-[state=checked]:bg-emerald-600" />
                                        </label>
                                    </div>
                                    {chequeStatus && (
                                        <div className="flex items-start gap-1.5 bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-emerald-800">
                                            <Zap className="w-3 h-3 shrink-0 text-emerald-600 mt-0.5" />
                                            <span className="text-[10px] font-bold leading-tight">Sale fully paid. Receipt clears AR instantly.</span>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 block">📥 Settle To (Bank Account)</label>
                                        <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg h-9 px-2 text-xs font-bold shadow-sm focus:border-indigo-500 outline-none">
                                            <option value="" disabled>Select deposit account...</option>
                                            {accounts.filter(a => a.type === 'asset' && a.account_sub_type === 'bank').map(a => (
                                                <option key={a.id} value={a.id}>{a.name}{a.is_default ? ' ⭐' : ''}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 block">Cheque No</label>
                                            <input type="text" value={chequeDetails.no} onChange={e => setChequeDetails({...chequeDetails, no: e.target.value})} 
                                                className={cn(
                                                    "w-full bg-white border border-slate-200 rounded-lg h-9 px-2 text-xs font-bold text-slate-800 shadow-sm focus:border-indigo-500 outline-none placeholder:text-slate-400",
                                                    showErrors && !chequeDetails.no && "border-red-500 border-2"
                                                )} 
                                                placeholder="000123" />
                                        </div>
                                        {!chequeStatus && (
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 block">Clearing Date</label>
                                                <input type="date" value={chequeDetails.date} onChange={e => setChequeDetails({...chequeDetails, date: e.target.value})} 
                                                    className={cn(
                                                        "w-full bg-white border border-slate-200 rounded-lg h-9 px-2 text-[10px] font-bold text-slate-800 shadow-sm focus:border-indigo-500 outline-none",
                                                        showErrors && !chequeDetails.date && "border-red-500 border-2"
                                                    )} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 block">Party's Bank Name</label>
                                        <input type="text" value={chequeDetails.bank} onChange={e => setChequeDetails({...chequeDetails, bank: e.target.value})} 
                                            className={cn(
                                                "w-full bg-white border border-slate-200 rounded-lg h-9 px-2 text-xs font-bold text-slate-800 shadow-sm focus:border-indigo-500 outline-none placeholder:text-slate-400",
                                                showErrors && !chequeDetails.bank && "border-red-500 border-2"
                                            )} 
                                            placeholder="e.g. SBI, HDFC" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Additional Charges Input Area */}
                        <div className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 shadow-sm text-slate-800 mb-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 block">Additional Charges & Fees</label>
                            
                            {additionalCharges.map((charge, index) => (
                                <div key={index} className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={charge.name}
                                        onChange={(e) => {
                                            const newArr = [...additionalCharges];
                                            newArr[index].name = e.target.value;
                                            setAdditionalCharges(newArr);
                                        }}
                                        placeholder="Charge Name (e.g. Loading)" 
                                        className="w-2/3 bg-white border border-slate-200 text-slate-800 rounded-lg h-9 px-2 text-xs shadow-sm shadow-slate-200/50 focus:border-indigo-500 outline-none" 
                                    />
                                    <input 
                                        type="number" 
                                        value={charge.amount === 0 ? '' : charge.amount}
                                        onChange={(e) => {
                                            const newArr = [...additionalCharges];
                                            newArr[index].amount = parseFloat(e.target.value) || 0;
                                            setAdditionalCharges(newArr);
                                        }}
                                        placeholder="₹" 
                                        className="w-1/3 bg-white border border-slate-200 text-slate-800 rounded-lg h-9 px-2 text-xs shadow-sm shadow-slate-200/50 focus:border-indigo-500 outline-none" 
                                    />
                                    <button 
                                        onClick={() => setAdditionalCharges(additionalCharges.filter((_, i) => i !== index))}
                                        className="bg-red-50 text-red-500 hover:bg-red-100 border border-red-100 rounded-lg px-2 flex items-center justify-center transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            
                            <button 
                                onClick={() => setAdditionalCharges([...additionalCharges, {name: '', amount: 0}])}
                                className="w-full text-[10px] font-bold text-indigo-600 border border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 rounded-lg py-2 flex items-center justify-center gap-1 transition-colors"
                            >
                                <Plus className="w-3 h-3" /> Add Charge
                            </button>
                        </div>

                        {paymentMode !== 'Credit' && (
                            <div className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 animate-in fade-in slide-in-from-top-2 shadow-sm text-slate-800 mb-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 block">Amount Received (₹)</label>
                                <input 
                                    type="number" 
                                    value={amountReceived === 0 ? '' : amountReceived} 
                                    onChange={e => {
                                        const val = parseFloat(e.target.value) || 0;
                                        amountReceivedManuallyEdited.current = true;
                                        if (val > grandTotal) {
                                            setAmountReceived(grandTotal);
                                            toast.error("Amount Capped", {
                                                description: "Received amount cannot exceed total.",
                                                position: 'top-center'
                                            });
                                        } else {
                                            setAmountReceived(val);
                                        }
                                    }}
                                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl h-12 px-4 text-xl font-black shadow-sm focus:border-indigo-500 outline-none"
                                />
                                {amountReceived < grandTotal && amountReceived > 0 && (
                                    <div className="text-[10px] font-bold text-amber-600 italic mt-1 leading-tight">
                                        Partial Payment: ₹{(grandTotal - amountReceived).toFixed(2)} will be marked as Udhaar.
                                    </div>
                                )}
                                {amountReceived > grandTotal && (
                                    <div className="text-[10px] font-bold text-blue-600 italic mt-1 leading-tight">
                                        Return Change: ₹{(amountReceived - grandTotal).toFixed(2)}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Visual Limit Warning */}
                    {maxInvoiceAmount > 0 && grandTotal > maxInvoiceAmount && (
                        <div className="px-6 py-2 bg-red-500/10 border-y border-red-500/20 animate-pulse">
                            <div className="flex items-center justify-center gap-2">
                                <AlertTriangle className="w-3 h-3 text-red-500" />
                                <span className="text-[10px] font-black uppercase text-red-500 tracking-tighter">
                                    Limit Exceeded: ₹{grandTotal.toLocaleString()} {'>'} ₹{maxInvoiceAmount.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Submit Button */}
                    <div className="shrink-0 mt-2 pt-2 border-t border-slate-800 text-center">
                        <button
                            onClick={handleCheckout}
                            disabled={
                                saving || 
                                cart.length === 0 || 
                                (paymentMode === 'Cheque' && (!selectedBuyerId || (!chequeStatus && !chequeDetails.date))) ||
                                (paymentMode === 'Credit' && !selectedBuyerId)
                            }
                            className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 text-white rounded-[2rem] font-black text-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale shadow-[0_10px_20px_rgba(99,102,241,0.2)]"
                        >
                            {saving ? (
                                <div className="h-5 w-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span>PAY & PRINT</span>
                                    <ChevronRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <Toaster position="top-center" expand={false} richColors />
            </div>

            {/* POS Confirmation Dialog */}
            <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
                <DialogContent className="max-w-xl bg-white rounded-[2.5rem] border-2 border-slate-200 shadow-2xl overflow-hidden p-0">
                    <DialogHeader className="p-8 pb-4 bg-slate-50 border-b border-slate-100">
                        <DialogTitle className="text-2xl font-[1000] tracking-tighter text-slate-900 uppercase italic">Confirm POS Sale</DialogTitle>
                        <DialogDescription className="text-slate-500 font-bold text-xs uppercase tracking-widest">Review items and payment before printing bill</DialogDescription>
                    </DialogHeader>
                    
                    <div className="p-8 space-y-6 overflow-y-auto max-h-[60vh] custom-scrollbar">
                        {/* Buyer Info */}
                        <div className="flex justify-between items-start pb-4 border-b border-slate-100">
                            <div className="space-y-1">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Customer</span>
                                <div className="text-base font-black text-slate-900">{buyers.find(b => b.id === selectedBuyerId)?.name || 'Walk-in Customer'}</div>
                                {selectedBuyerId && <div className="text-[10px] font-bold text-slate-500 italic">{buyers.find(b => b.id === selectedBuyerId)?.city}</div>}
                            </div>
                            <div className="text-right space-y-1">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date</span>
                                <div className="text-sm font-black text-slate-900">{format(selectedDate, "PPP")}</div>
                                <div className="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full inline-block mt-1">Payment: {paymentMode}</div>
                            </div>
                        </div>

                        {/* Items Summary Table */}
                        <div className="space-y-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cart Summary</span>
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow className="border-slate-200">
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-10">Item</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-10 text-center">Qty</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest h-10 text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {cart.map((c, idx) => (
                                            <TableRow key={idx} className="border-slate-100 h-10">
                                                <TableCell className="py-2">
                                                    <div className="text-xs font-bold text-slate-900 line-clamp-1">{c.item.name}</div>
                                                </TableCell>
                                                <TableCell className="text-center text-xs font-black text-slate-700">
                                                    {c.qty} <span className="text-[11px] text-slate-500 font-bold uppercase ml-0.5">{c.item.unit}</span>
                                                </TableCell>
                                                <TableCell className="text-right text-xs font-black text-slate-900">₹{(c.price * c.qty).toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* Totals Breakdown */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-center space-y-1.5">
                                <div className="flex justify-between text-[10px] font-bold text-slate-500 pb-2 border-b border-dashed border-slate-200 mb-2">
                                    <span>Items Subtotal</span>
                                    <span>₹{subTotal.toLocaleString()}</span>
                                </div>

                                {/* Discount Section */}
                                <div className="space-y-2 py-2 border-b border-dashed border-slate-200 mb-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="relative flex-1">
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400">%</span>
                                            <Input 
                                                type="number" 
                                                value={discountPercent || ""} 
                                                onChange={(e) => handlePercentChange(Number(e.target.value))}
                                                placeholder="Disc %"
                                                className="h-7 text-[10px] font-black rounded-lg border-emerald-100 bg-emerald-50/30 text-emerald-600 focus:ring-emerald-500/20"
                                            />
                                        </div>
                                        <div className="relative flex-1">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400">₹</span>
                                            <Input 
                                                type="number" 
                                                value={discountAmount || ""} 
                                                onChange={(e) => handleAmountChange(Number(e.target.value))}
                                                placeholder="Amount"
                                                className="h-7 pl-4 text-[10px] font-black rounded-lg border-emerald-100 bg-emerald-50/30 text-emerald-600 focus:ring-emerald-500/20"
                                            />
                                        </div>
                                    </div>
                                    {discountAmount > 0 && (
                                        <div className="flex justify-between text-[10px] font-black text-emerald-600">
                                            <span>Taxable Subtotal</span>
                                            <span>₹{taxableSubTotal.toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Market charges from settings */}
                                {marketFeeAmount > 0 && (
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                        <span>Market Fee ({taxSettings.market_fee_percent}%)</span>
                                        <span>₹{marketFeeAmount.toLocaleString()}</span>
                                    </div>
                                )}
                                {nirashritAmount > 0 && (
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                        <span>Nirashrit Levy ({taxSettings.nirashrit_percent}%)</span>
                                        <span>₹{nirashritAmount.toLocaleString()}</span>
                                    </div>
                                )}
                                {miscFeeAmount > 0 && (
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                        <span>Misc Fee ({taxSettings.misc_fee_percent}%)</span>
                                        <span>₹{miscFeeAmount.toLocaleString()}</span>
                                    </div>
                                )}
                                {/* GST Breakdown */}
                                {taxSettings.gst_enabled && taxSettings.gst_type === 'intra' && (
                                    <>
                                        {taxSettings.cgst_percent > 0 && <div className="flex justify-between text-[10px] font-bold text-slate-500"><span>CGST ({taxSettings.cgst_percent}%)</span><span>₹{Math.round(taxableSubTotal * taxSettings.cgst_percent / 100).toLocaleString()}</span></div>}
                                        {taxSettings.sgst_percent > 0 && <div className="flex justify-between text-[10px] font-bold text-slate-500"><span>SGST ({taxSettings.sgst_percent}%)</span><span>₹{Math.round(taxableSubTotal * taxSettings.sgst_percent / 100).toLocaleString()}</span></div>}
                                    </>
                                )}
                                {taxSettings.gst_enabled && taxSettings.gst_type === 'inter' && taxSettings.igst_percent > 0 && (
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500"><span>IGST ({taxSettings.igst_percent}%)</span><span>₹{Math.round(taxableSubTotal * taxSettings.igst_percent / 100).toLocaleString()}</span></div>
                                )}
                                {!taxSettings.gst_enabled && gstTotal > 0 && (
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                        <span>GST Total</span>
                                        <span>₹{gstTotal.toLocaleString()}</span>
                                    </div>
                                )}
                                {additionalCharges.map((charge, i) => (
                                    <div key={i} className="flex justify-between text-[10px] font-bold text-slate-500">
                                        <span>{charge.name}</span>
                                        <span>₹{charge.amount.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 bg-slate-900 rounded-3xl text-white shadow-xl flex flex-col items-center justify-center">
                                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-1">To Bill</span>
                                <div className="text-2xl font-black italic tracking-tighter">₹{grandTotal.toLocaleString()}</div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <div>
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Amount Received</span>
                                <div className="text-xl font-black text-emerald-700">₹{amountReceived.toLocaleString()}</div>
                            </div>
                            {amountReceived < grandTotal && paymentMode !== 'Credit' && (
                                <div className="text-right">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-rose-500">To Udhaar</span>
                                    <div className="text-lg font-black text-rose-600">₹{(grandTotal - amountReceived).toLocaleString()}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
                        <Button 
                            variant="outline" 
                            onClick={() => setShowConfirm(false)}
                            className="rounded-xl font-black uppercase text-[10px] tracking-widest border-slate-200 hover:bg-slate-100 h-12 px-8"
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleConfirmCheckout}
                            disabled={saving}
                            className="flex-1 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl font-[1000] uppercase text-xs tracking-[0.2em] shadow-lg h-12"
                        >
                            {saving ? <Loader2 className="animate-spin" /> : "Confirm & Print Bill"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Success Overlay */}
            {showSuccess && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300 print:hidden">
                    <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 text-center animate-in zoom-in-95 duration-500">
                        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="w-10 h-10" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tighter mb-2 italic">Success!</h2>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-8">Transaction completed successfully</p>

                        <div className="space-y-4">
                            <button onClick={() => window.print()} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all">
                                <Printer className="w-5 h-5" /> PRINT RECEIPT
                            </button>
                            <button onClick={resetPOS} className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-slate-200 transition-all">
                                NEXT TRANSACTION <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Print POS Receipt Component - Hidden normally, visible on print */}
            {showSuccess && (
                <div className="hidden print:block print:w-[3in] print:max-w-[80mm] absolute top-0 left-0 bg-white text-black p-4 font-mono text-[12px] leading-tight print:p-2">
                    <div className="text-center mb-4">
                        <h1 className="font-bold text-lg leading-tight uppercase">{orgName}</h1>
                        <p className="text-[10px] uppercase mt-1 tracking-widest">Tax Invoice / Bill</p>
                    </div>
                    
                    <div className="mb-4 border-b border-dashed border-black pb-2 text-[11px]">
                        <div className="flex justify-between"><span>Bill No:</span> <span className="font-bold">{lastRefNo}</span></div>
                        <div className="flex justify-between mt-1"><span>Date:</span> <span>{new Date().toLocaleString('en-IN', {day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit'})}</span></div>
                        {selectedBuyerId && <div className="flex justify-between mt-1 pt-1 border-t border-dotted border-black"><span>Buyer:</span> <span className="font-bold uppercase text-right leading-tight max-w-[150px]">{buyers.find(b => b.id === selectedBuyerId)?.name || 'Walk-in'}</span></div>}
                        <div className="flex justify-between mt-1"><span>Mode:</span> <span className="uppercase font-bold">{paymentMode}</span></div>
                    </div>
                    
                    <table className="w-full text-left mb-4 text-[11px]">
                        <thead>
                            <tr className="border-b border-dashed border-black">
                                <th className="pb-1 font-semibold w-1/2">Item</th>
                                <th className="pb-1 font-semibold text-right w-[15%]">Qty</th>
                                <th className="pb-1 font-semibold text-right w-[15%]">Rate</th>
                                <th className="pb-1 font-semibold text-right w-[20%]">Amt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cart.map((c, i) => (
                                <tr key={i}>
                                    <td className="py-2 pr-1 font-semibold">
                                        <div className="uppercase font-bold">{c.item.name} {c.item.grade && c.item.grade !== 'A' && <span className="ml-1">[{c.item.grade}]</span>}</div>
                                        {language !== 'en' && c.item.local_name && <div className="text-[9px] text-gray-700">({c.item.local_name})</div>}
                                    </td>
                                    <td className="py-2 text-right align-top">{c.qty}</td>
                                    <td className="py-2 text-right align-top">{c.price}</td>
                                    <td className="py-2 text-right align-top font-bold">{c.qty * c.price}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    <div className="border-t border-dashed border-black pt-2 mb-4 space-y-1 text-[12px]">
                        <div className="flex justify-between"><span>Subtotal</span> <span>{subTotal.toFixed(2)}</span></div>
                        {gstTotal > 0 && <div className="flex justify-between"><span>Tax</span> <span>{gstTotal.toFixed(2)}</span></div>}
                        {cart.length > 0 && additionalCharges.map((charge, i) => (
                            <div key={i} className="flex justify-between items-center text-sm font-medium text-amber-700/80">
                                <span className="flex items-center gap-2">
                                    <Tag className="w-3.5 h-3.5" />
                                    {charge.name}
                                </span>
                                <span>₹{(charge.amount).toFixed(2)}</span>
                            </div>
                        ))}
                        
                        <div className="flex justify-between font-black text-[14px] border-y border-dashed border-black py-2 mt-2">
                            <span>TOTAL:</span> <span>Rs. {grandTotal.toFixed(2)}</span>
                        </div>
                        {amountReceived > 0 && amountReceived !== grandTotal && (
                            <div className="flex justify-between font-semibold mt-1">
                                <span>Amt Received:</span> <span>Rs. {amountReceived.toFixed(2)}</span>
                            </div>
                        )}
                        {amountReceived < grandTotal && paymentMode !== 'Credit' && (
                            <div className="flex justify-between font-bold mt-1">
                                <span>Balance (Udhaar):</span> <span>Rs. {(grandTotal - amountReceived).toFixed(2)}</span>
                            </div>
                        )}
                        {amountReceived > grandTotal && (
                            <div className="flex justify-between font-bold mt-1">
                                <span>Change Return:</span> <span>Rs. {(amountReceived - grandTotal).toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    {printQRCode && (() => {
                        const paymentSettings = orgSettings?.payment || {}
                        const bankId = paymentSettings.source_bank_upi || paymentSettings.source_bank_details || selectedAccountId
                        // Ensure it's a bank account specifically for bill details
                        const acc = accounts.find(a => a.id === bankId && a.account_sub_type === 'bank') 
                                   || accounts.find(a => a.account_sub_type === 'bank' && a.is_default)
                                   || accounts.find(a => a.account_sub_type === 'bank')
                        
                        if (!acc) return null;

                        const meta = acc.description?.startsWith('{') ? JSON.parse(acc.description) : {}
                        const upiId = meta.upi_id || paymentSettings.upi_id
                        const payAmt = amountReceived < grandTotal ? (grandTotal - amountReceived > 0 ? grandTotal - amountReceived : grandTotal) : grandTotal;
                        
                        if (payAmt > 0) {
                            return (
                                <div className="mt-2 border border-black rounded-lg p-2 flex flex-col items-center gap-1 text-center overflow-hidden break-inside-avoid">
                                    <div className="uppercase font-black tracking-widest border-b border-black pb-0.5 mb-1 text-[9px] w-full">Scan to Pay (Digital)</div>
                                    
                                    <div className="flex flex-row items-start justify-start w-full gap-2">
                                        {/* Left: QR Code */}
                                        <div className="flex-shrink-0 flex flex-col items-center w-[100px]">
                                            {upiId && <QRCodeSVG value={`upi://pay?pa=${upiId}&pn=${encodeURIComponent(orgName)}&am=${payAmt.toFixed(2)}&cu=INR`} size={100} level="M" className="my-1" />}
                                            {upiId && <div className="text-[7px] font-bold break-all opacity-80">{upiId}</div>}
                                        </div>

                                        {/* Right: Bank Details */}
                                        {printBankDetails && (() => {
                                            const accNo = meta.account_no || meta.account_number || meta.acc_no || paymentSettings.account_number || '';
                                            const ifscCode = meta.ifsc || meta.ifsc_code || paymentSettings.ifsc_code || '';
                                            return (
                                                <div className="flex-grow text-[9px] border-l border-dotted border-black/30 pl-2 text-left min-w-0">
                                                    <div className="font-bold uppercase mb-0.5 text-[7px] opacity-70">Bank Details</div>
                                                    <table className="w-full border-collapse table-fixed">
                                                        <tbody className="leading-tight">
                                                            <tr className="border-b border-dotted border-black/10">
                                                                <td className="py-0.5 font-medium opacity-60 text-[7px] w-[35%]">BANK</td>
                                                                <td className="py-0.5 font-bold text-right truncate">{acc.name}</td>
                                                            </tr>
                                                            {accNo && (
                                                                <tr className="border-b border-dotted border-black/10">
                                                                    <td className="py-0.5 font-medium opacity-60 text-[7px]">A/C NO</td>
                                                                    <td className="py-0.5 font-bold text-right text-[8px] tracking-tight">{accNo}</td>
                                                                </tr>
                                                            )}
                                                            {ifscCode && (
                                                                <tr className="border-b border-dotted border-black/10">
                                                                    <td className="py-0.5 font-medium opacity-60 text-[7px]">IFSC</td>
                                                                    <td className="py-0.5 font-bold text-right text-[8px] tracking-tight">{ifscCode}</td>
                                                                </tr>
                                                            )}
                                                            <tr>
                                                                <td className="py-0.5 font-medium opacity-60 text-[7px]">HOLDER</td>
                                                                <td className="py-0.5 font-bold text-right truncate">{orgName}</td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )
                                        })()}
                                    </div>
                                </div>
                            )
                        }
                        return null
                    })()}

                    {paymentMode === 'Cheque' && (
                        <div className="mt-4 border-2 border-black rounded p-2 text-center text-[10px] font-bold">
                            <div className="uppercase border-b border-black pb-1 mb-1 tracking-widest">Cheque Payment</div>
                            <div className="text-left space-y-1">
                                <div>No: {chequeDetails.no || 'NOT PROVIDED'}</div>
                                <div>Bank: {chequeDetails.bank || 'NOT PROVIDED'}</div>
                                <div>Status: {chequeStatus ? 'CLEARED' : 'PENDING CLEARENCE'}</div>
                            </div>
                        </div>
                    )}
                    
                    <div className="text-center mt-8 text-[11px] font-semibold border-t border-black pt-4">
                        <p>Thank you for your business!</p>
                        {platformBranding && (
                            <div className="mt-3 text-[9px] text-gray-500 font-medium uppercase tracking-widest flex flex-col gap-1 items-center">
                                <span>{platformBranding.document_footer_powered_by_text || 'Powered by MandiGrow'}</span>
                                {platformBranding.support_phone && (
                                    <span className="font-bold border-t border-gray-300 pt-1 mt-1">Ph: {platformBranding.support_phone}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

