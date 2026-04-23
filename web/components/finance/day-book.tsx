"use client";

import React, { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Calendar as CalendarIcon, Loader2, Download, BookOpen, Clock, Hash, Tag, Activity, FileText, Wallet, Building2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { isNativePlatform } from "@/lib/capacitor-utils";
import { NativeCard } from "@/components/mobile/NativeCard";
import { NativeSectionLabel } from "@/components/mobile/NativeInput";
import { BottomSheet } from "@/components/mobile/BottomSheet";
import { Calendar as NativeCalendar } from "@/components/ui/calendar";
import { snackbar } from "@/components/mobile/Snackbar";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";
import { exportToCSV } from "@/lib/utils/export-csv";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency, roundTo2 } from "@/lib/accounting-logic";
import { cacheGet, cacheSet } from "@/lib/data-cache";
import { useTableKeyboard } from "@/hooks/use-table-keyboard";
import { findImbalancedVoucherIds, summarizeVoucherHealth } from "@/lib/finance/voucher-integrity";

const DAYBOOK_CACHE_VERSION = 'v2.8'; // Bumped 2026-04-20: Fix legs is not iterable crash
const AMOUNT_EPSILON = 0.01;

// ── TRANSACTION TYPE MAP (from real DB audit — all known transaction_type values) ──────────────
// Maps raw DB transaction_type strings to Day Book flow categories.
// goods_arrival  → purchase (Cr to supplier, goods received by mandi)
// advance_payment → purchase (Dr advance paid to farmer at arrival time)
// purchase_draft  → purchase (legacy draft entries — treated as purchase for display)
// sale           → sale
// sale_payment   → sale_payment (partial payment leg on a sale)
// cash_receipt   → receive_receipt (cash counter-leg, money received from buyer)
// cash_payment   → paid_receipt (cash counter-leg, money paid to supplier)
// v_party        → depends on context (party credit/debit leg)
// ─────────────────────────────────────────────────────────────────────────────────────────────
const TX_TYPE_FLOW_MAP: Record<string, string> = {
    goods_arrival:    'purchase',
    advance_payment:  'purchase',
    purchase_draft:   'purchase',
    purchase:         'purchase',
    purchase_payment: 'paid_receipt',
    sale:             'sale',
    sale_payment:     'sale_payment',
    // cash_receipt is a cash counter-leg (Dr Cash) for a receipt — money received
    // NOT the same as sale_payment (which is a partial payment on a sale)
    cash_receipt:     'receive_receipt',
    // cash_payment is a cash counter-leg (Cr Cash) for a payment — money paid out
    cash_payment:     'paid_receipt',
    payment:          'paid_receipt',
    receipt:          'receive_receipt',
    opening_balance:  'opening_balance',
};

const inferVoucherFlow = (entry: any) => {
    const rawType = String(entry.transaction_type || entry.voucher?.type || "").toLowerCase();
    const text = `${entry.description || ""} ${entry.voucher?.narration || ""} ${entry.voucher?.source || ""}`.toLowerCase();

    // Step 1: Explicit mapping from real DB transaction_type values (fastest, most accurate)
    if (TX_TYPE_FLOW_MAP[rawType]) {
        const mapped = TX_TYPE_FLOW_MAP[rawType];
        // For 'receive_receipt', check if it's actually an expense
        if (mapped === 'receive_receipt' && (text.includes('expense') || entry.account?.type === 'expense')) {
            return 'expense_receipt';
        }
        // For 'paid_receipt', check if it's an expense outflow
        if (mapped === 'paid_receipt' && (text.includes('expense') || entry.account?.type === 'expense')) {
            return 'expense_receipt';
        }
        return mapped;
    }

    // Step 2: opening balance override (before text heuristics)
    if (text.includes('opening balance')) return 'opening_balance';

    // Step 3: Text-based heuristics for legacy/unmapped types
    // Sale payment: receipt tied to a sale invoice / partial settlement
    if (
        text.includes('sale payment') ||
        (text.includes('partial payment') && text.includes('sale')) ||
        ((text.includes('payment received') || text.includes('payment recvd')) &&
            (text.includes('invoice #') || text.includes('inv #') || text.includes('sale #')))
    ) return 'sale_payment';

    // Purchase: arrivals, advance payments, lot purchases
    if (
        text.includes('bill for arrival') ||
        text.includes('bill for lot') ||
        text.includes('lot_purchase') ||
        text.includes('direct purchase') ||
        text.includes('commission arrival') ||
        text.includes('advance paid') ||
        text.includes('inward purchase') ||
        (text.includes('cash paid') && (text.includes('arrival') || text.includes('lot')))
    ) return 'purchase';

    // Expense / Payment out
    if (
        rawType.includes('payment') ||
        rawType.includes('expense') ||
        text.includes('expense') ||
        text.includes('paid to')
    ) {
        if (text.includes('expense') || entry.account?.type === 'expense') return 'expense_receipt';
        return 'paid_receipt';
    }

    // Receipt / money in
    if (rawType.includes('receipt')) {
        if (text.includes('expense') || entry.account?.type === 'expense') return 'expense_receipt';
        return 'receive_receipt';
    }

    // Sale
    if (rawType.includes('sale') || text.includes('sale invoice') || text.includes('invoice #')) return 'sale';

    // v_party: context-dependent — check debit/credit orientation
    if (rawType === 'v_party') {
        if (Number(entry.credit || 0) > 0) return 'receive_receipt'; // money received
        if (Number(entry.debit || 0) > 0) return 'paid_receipt';    // money paid
    }

    return rawType || 'transaction';
};

const extractVoucherBillNo = (entry: any) => {
    const explicit = entry.reference_no || entry.voucher?.voucher_no;
    if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') {
        return String(explicit).trim();
    }

    const text = `${entry.description || ""} ${entry.voucher?.narration || ""}`;
    const match = text.match(/#\s*(\d+)/);
    return match?.[1] || null;
};

const getDuplicateSaleKey = (entry: any) => {
    if (inferVoucherFlow(entry) !== 'sale') return null;

    // Only deduplicate DEBIT legs (goods sold = money owed by buyer).
    // Income-account counter-legs (Cr to 'Direct Sales Revenue') should NOT
    // participate in deduplication — they must not shadow the buyer debit leg that
    // carries contact_id and reference_id, otherwise totalSaleValue = 0.
    if (Number(entry.debit || 0) <= 0) return null;

    const invoiceId = entry.voucher?.invoice_id || entry.reference_id;
    if (invoiceId) {
        return `sale_invoice_${invoiceId}`;
    }

    if (!entry.contact_id) return null;

    const billNo = extractVoucherBillNo(entry);
    if (!billNo) return null;

    const entryDate = String(entry.entry_date || entry.created_at || '').slice(0, 10);
    const amount = Number(entry.debit || 0).toFixed(2);
    return `${entry.contact_id}|${billNo}|${entryDate}|${amount}`;
};

const getSaleCanonicalScore = (entry: any) => {
    const description = String(entry.description || "").toLowerCase();
    let score = 0;

    if (entry.reference_id) score += 4;
    if (description.startsWith('invoice #')) score += 2;
    if (String(entry.voucher?.type || "").toLowerCase() === 'sales') score += 1;

    return score;
};

const shouldHideDuplicateSaleEntry = (entry: any, allEntries: any[]) => {
    const duplicateKey = getDuplicateSaleKey(entry);
    if (!duplicateKey) return false;

    const duplicates = allEntries.filter((other) =>
        other.id !== entry.id &&
        getDuplicateSaleKey(other) === duplicateKey
    );

    if (duplicates.length === 0) return false;

    const preferredEntry = [entry, ...duplicates]
        .sort((a, b) => {
            const scoreDelta = getSaleCanonicalScore(b) - getSaleCanonicalScore(a);
            if (scoreDelta !== 0) return scoreDelta;
            return String(a.id).localeCompare(String(b.id));
        })[0];

	return preferredEntry.id !== entry.id;
};

const isSaleSettlementReceiptEntry = (entry: any) => {
    const flowType = inferVoucherFlow(entry);
    const text = `${entry.description || ""} ${entry.voucher?.narration || ""}`.toLowerCase();
    const credit = Number(entry.credit || 0);
    
    if (credit <= AMOUNT_EPSILON) return false; // Must be a credit entry
    
    // Pattern 1: Explicit sale_payment flowType
    if (flowType === 'sale_payment') return true;
    
    // Pattern 2: "Payment Received Against Sale #X" (new standardized format)
    if (text.includes('payment received') && text.includes('sale #')) return true;
    
    // Pattern 3: "Sales Revenue - Inv #X" (legacy format from old migrations)
    if (text.includes('sales revenue') && text.includes('inv #')) return true;
    
    // Pattern 4: Receipt entries linked to sales
    if (flowType === 'receipt' || flowType === 'receive_receipt') {
        return (
            !!entry.voucher?.invoice_id ||
            text.includes('invoice #') ||
            text.includes('inv #') ||
            text.includes('sale #')
        );
    }

    // Pattern 5: Mixed Sale (Cash part of a Sale Voucher)
    // If the leg is a Credit to a contact inside a Sale flow, it's a payment receipt.
    if (flowType === 'sale' && entry.contact_id) {
        return true;
    }
    
    return false;
};

const getSaleSettlementKey = (entry: any) => {
    const flowType = inferVoucherFlow(entry);

    // Priority 1: Invoice ID matching (system-generated linked records)
    // ONLY group if it's the actual 'sale' voucher part. 
    // Separate 'receipt' vouchers should remain independent rows.
    const invoiceId = entry.voucher?.invoice_id || (flowType === 'sale' ? entry.reference_id : null);
    if (invoiceId && entry.voucher?.type === 'sale') return `invoice_${invoiceId}`;

    // Priority 2: Contact-aware bill number matching for manual/legacy rows
    const billNo = extractVoucherBillNo(entry);
    if (billNo && entry.contact_id) {
        return `contact_${entry.contact_id}_bill_${billNo}`;
    }

    if (billNo) return `bill_${billNo}`;

    // Priority 3: Voucher ID matching (atomic transactions with multiple legs)
    const voucherId = entry.voucher_id;
    if (voucherId) return `voucher_${voucherId}`;

    return null;
};

const isSaleReceivableEntry = (entry: any) => {
    const flowType = inferVoucherFlow(entry);
    const isSale = flowType === 'sale' || 
                   String(entry.transaction_type || "").includes('sale') || 
                   String(entry.description || "").toLowerCase().includes('items sold');
                   
    return isSale && Number(entry.debit || 0) > AMOUNT_EPSILON;
};

const buildSaleSettlementMap = (entries: any[]) => {
    const settlements = new Map<string, { saleAmount: number; receivedAmount: number }>();

    entries.forEach((entry) => {
        const key = getSaleSettlementKey(entry);
        if (!key) return;

        const current = settlements.get(key) || { saleAmount: 0, receivedAmount: 0 };

        if (isSaleReceivableEntry(entry)) {
            current.saleAmount += Number(entry.debit || 0);
        }

        if (isSaleSettlementReceiptEntry(entry)) {
            current.receivedAmount += Number(entry.credit || 0);
        }

        settlements.set(key, current);
    });

    return settlements;
};

const getSaleSettlementStatus = (entry: any, settlements: Map<string, { saleAmount: number; receivedAmount: number }>) => {
    const key = getSaleSettlementKey(entry);
    if (!key) return null;

    const settlement = settlements.get(key);
    if (!settlement) return null;

    const saleAmount = Number(settlement.saleAmount || 0);
    const receivedAmount = Math.min(Number(settlement.receivedAmount || 0), saleAmount);
    const outstandingAmount = Math.max(saleAmount - receivedAmount, 0);

    return {
        saleAmount,
        receivedAmount,
        outstandingAmount,
        isFullCash: saleAmount > AMOUNT_EPSILON && receivedAmount > AMOUNT_EPSILON && outstandingAmount <= AMOUNT_EPSILON,
        isFullUdhaar: saleAmount > AMOUNT_EPSILON && receivedAmount <= AMOUNT_EPSILON,
        isPartial: saleAmount > AMOUNT_EPSILON && receivedAmount > AMOUNT_EPSILON && outstandingAmount > AMOUNT_EPSILON,
    };
};

const getScenarioStyles = (scenario: string = "") => {
    const lower = scenario.toLowerCase();
    
    // 1. Sales Scenarios (Indigo/Rose/Violet)
    if (lower.includes('sale')) {
        if (lower.includes('full') && (lower.includes('amount') || lower.includes('cash'))) 
            return { bg: "bg-indigo-50/60", border: "border-indigo-200", chipBg: "bg-indigo-100", chipBorder: "border-indigo-200", text: "text-indigo-700", color: "#6366f1" };
        if (lower.includes('udhaar') || lower.includes('credit')) 
            return { bg: "bg-rose-50/60", border: "border-rose-200", chipBg: "bg-rose-100", chipBorder: "border-rose-200", text: "text-rose-700", color: "#f43f5e" };
        if (lower.includes('partial')) 
            return { bg: "bg-violet-50/60", border: "border-violet-200", chipBg: "bg-violet-100", chipBorder: "border-violet-200", text: "text-violet-700", color: "#8b5cf6" };
    }
    
    // 2. Purchase Scenarios (Emerald/Orange/Amber)
    if (lower.includes('purchase') || lower.includes('buy')) {
        if (lower.includes('scenario 1') || (lower.includes('full') && (lower.includes('amount') || lower.includes('paid')))) 
            return { bg: "bg-emerald-50/60", border: "border-emerald-200", chipBg: "bg-emerald-100", chipBorder: "border-emerald-200", text: "text-emerald-700", color: "#10b981" };
        if (lower.includes('scenario 3') || (lower.includes('udhaar') || lower.includes('credit') || lower.includes('outstanding'))) 
            return { bg: "bg-orange-50/60", border: "border-orange-200", chipBg: "bg-orange-100", chipBorder: "border-orange-200", text: "text-orange-700", color: "#f97316" };
        if (lower.includes('scenario 2') || lower.includes('partial')) 
            return { bg: "bg-amber-50/60", border: "border-amber-200", chipBg: "bg-amber-100", chipBorder: "border-amber-200", text: "text-amber-700", color: "#f59e0b" };
    }

    // Default
    return { bg: "bg-slate-50/60", border: "border-slate-200", chipBg: "bg-slate-100", chipBorder: "border-slate-200", text: "text-slate-700", color: "#1e293b" };
};

const getPurchaseSettlementKey = (entry: any) => {
    // 1. Explicit voucher link to arrival
    if (entry.voucher?.arrival_id) return `purchase_${entry.voucher.arrival_id}`;
    
    // 2. Reference ID (usually arrival ID or lot ID for purchases)
    if (entry.reference_id) return `purchase_${entry.reference_id}`;

    // 3. Fallback: try to extract bill number
    const billNo = extractVoucherBillNo(entry);
    if (billNo && entry.contact_id) {
        return `purchase_contact_${entry.contact_id}_bill_${billNo}`;
    }

    if (billNo) return `purchase_bill_${billNo}`;
    
    // 4. Voucher ID for the atomic transaction
    if (entry.voucher_id) return `purchase_voucher_${entry.voucher_id}`;
    
    return null;
};

const getEntryGroupKey = (entry: any) => {
    const v = entry.voucher || {};
    const flow = inferVoucherFlow(entry);
    const text = `${entry.description || ""} ${v.narration || ""}`.toLowerCase();
    
    // 1. Linked Transactions (Group by Arrival/Invoice ID)
    const refId = entry.reference_id || v.invoice_id || v.arrival_id;
    if (refId) {
        if (flow === 'sale' || flow === 'sale_payment' || flow === 'receive_receipt' || text.includes('invoice #') || text.includes('sale #')) {
            return `sale_group_${refId}`;
        }
        if (flow === 'purchase' || flow === 'payment' || flow === 'paid_receipt' || text.includes('bill #') || text.includes('arrival #')) {
            return `purchase_ref_${refId}`;
        }
    }

    // 2. Fallback to Bill No extraction for manual entries
    const billNo = extractVoucherBillNo(entry);
    if (billNo) {
        if (flow === 'sale' || flow === 'sale_payment') return `sale_bill_${billNo}`;
        if (flow === 'purchase' || flow === 'payment') return `purchase_bill_${billNo}`;
    }

    // 3. Fallback to Voucher ID (one group per voucher)
    if (entry.voucher_id) return `voucher_${entry.voucher_id}`;
    
    return `entry_${entry.id}`;
};

// Returns the single best "representative" entry for a group (one card per transaction)
const getGroupRepresentative = (group: any[]): any => {
    // Prefer the entry that has a contact_id (buyer / supplier / farmer)
    const contactLeg = group.find(l => !!l.contact_id);
    if (contactLeg) return contactLeg;
    // Fallback: pick any entry
    return group[0];
};


const isLiquidAccountEntry = (entry: any) => {
    const accName = (entry.account?.name || "").toLowerCase();
    const accType = (entry.account?.type || "").toLowerCase();
    const subType = (entry.account?.account_sub_type || "").toLowerCase();
    const description = (entry.description || "").toLowerCase();
    const narration = (entry.voucher?.narration || "").toLowerCase();
    const text = `${accName} ${description} ${narration}`;

    return accName.includes('cash') || accName.includes('bank') ||
        subType === 'cash' || subType === 'bank' ||
        accType === 'bank' || accType === 'asset' && (subType === 'bank' || subType === 'cash') ||
        accName === 'hdfc' || accName === 'sbi' || accName === 'axis' || accName === 'icici' ||
        text.includes('cheque') ||
        text.includes('upi') ||
        text.includes('bank transfer') ||
        text.includes('digital payment') ||
        text.includes('(cash)');
};

const isInstantSettlementEntry = (entry: any) => {
    const text = `${entry.account?.name || ""} ${entry.description || ""} ${entry.voucher?.narration || ""}`.toLowerCase();
    return isLiquidAccountEntry(entry) ||
        text.includes('cheque') ||
        text.includes('upi') ||
        text.includes('bank transfer');
};

const isPendingChequeEntry = (entry: any) => {
    const voucherChequeStatus = String(entry.voucher?.cheque_status || "").toLowerCase();
    const voucherIsPendingCheque =
        voucherChequeStatus === 'pending' ||
        (entry.voucher?.cheque_no && entry.voucher?.is_cleared === false);

    if (!voucherIsPendingCheque) return false;

    // Legacy support: hide old clearing-buffer rows if they still exist in historical data.
    const accName = String(entry.account?.name || "").toLowerCase();
    const isLegacyBufferAccount = accName.includes('cheque');

    return !entry.contact_id && (isLegacyBufferAccount || isLiquidAccountEntry(entry));
};

const shouldHideDirectPurchaseCost = (entry: any, group: any[]) => {
    return false;
};

const shouldHideNonContactCounterLeg = (entry: any, group: any[]) =>
    !entry.contact_id && group.some((leg) => !!leg.contact_id);

const shouldHideExpenseSettlementLeg = (entry: any, group: any[]) => {
    if (entry.contact_id) return false;
    if (!isLiquidAccountEntry(entry)) return false;

    // Do not hide Advance Contra (cash outflow) legs for purchases. We want to show the payment leg in the Day Book.
    const flow = inferVoucherFlow(entry);
    if (isAdvanceSettlementEntry(entry) && flow === 'purchase') {
        return false;
    }

    if (flow === 'expense_receipt') return false;

    return group.some((leg) =>
        leg.id !== entry.id &&
        !leg.contact_id &&
        !isLiquidAccountEntry(leg) &&
        leg.account?.type === 'expense'
    );
};

const getPurchaseSettlementTotals = (group: any[]) => {
    // 1. Cash paid
    // A fully formed payment transaction has a Liquid Credit (money leaving bank) AND an Advance Debit (reducing party liability).
    // Summing both results in 2x double counting. By taking the max, we capture the amount accurately 
    // whether the transaction is perfectly formed or a legacy single-entry.
    const liquidCredits = group.reduce((sum, leg) => sum + (isLiquidAccountEntry(leg) && Number(leg.credit || 0) > AMOUNT_EPSILON ? Number(leg.credit || 0) : 0), 0);
    const advanceDebits = group.reduce((sum, leg) => sum + (leg.contact_id && isAdvanceSettlementEntry(leg) && Number(leg.debit || 0) > AMOUNT_EPSILON ? Number(leg.debit || 0) : 0), 0);
    const cashPaid = Math.max(liquidCredits, advanceDebits);

    // 2. Gross Purchase Credits (Total Supplier Payable from Invoice before any payments)
    const grossSupplierCredits = group.reduce((sum, leg) => {
        if (!leg.contact_id) return sum;
        if (isAdvanceSettlementEntry(leg)) return sum;
        if (inferVoucherFlow(leg) !== 'purchase') return sum;
        return sum + Number(leg.credit || 0);
    }, 0);

    // 2b. Inventory Debits (Total Value of goods arriving)
    const inventoryDebits = group.reduce((sum, leg) => {
        if (!isLiquidAccountEntry(leg) && !isAdvanceSettlementEntry(leg) && inferVoucherFlow(leg) === 'purchase') {
            return sum + Number(leg.debit || 0);
        }
        return sum;
    }, 0);

    // 3. Total Supplier Payments (Debits to Supplier on this exact transaction group)
    const supplierPayments = group.reduce((sum, leg) => {
        if (!leg.contact_id) return sum;
        if (isAdvanceSettlementEntry(leg)) return sum;
        if (inferVoucherFlow(leg) !== 'purchase' && inferVoucherFlow(leg) !== 'paid_receipt') return sum;
        return sum + Number(leg.debit || 0);
    }, 0);

    // 4. Total purchase value (Max of explicit supplier credit or the actual inventory arrived)
    // This perfectly rescues "Unknown Supplier" purchases where the supplier credit was skipped.
    const totalValue = Math.max(grossSupplierCredits, inventoryDebits, cashPaid);

    // 5. Net Udhaar = Total Value minus cash paid directly and any supplier debit settlements
    const udhaar = Math.max(0, totalValue - supplierPayments - cashPaid);

    return {
        cashPaid,
        udhaar,
        totalValue,
        // Backward compat aliases
        purchaseCredit: totalValue,
        purchasePaid: cashPaid,
        isFullyCash: cashPaid >= totalValue - AMOUNT_EPSILON && totalValue > AMOUNT_EPSILON,
        isFullyUdhaar: udhaar >= totalValue - AMOUNT_EPSILON && totalValue > AMOUNT_EPSILON,
        isPartial: cashPaid > AMOUNT_EPSILON && udhaar > AMOUNT_EPSILON,
    };
};

const shouldHideFullySettledPurchasePayableLeg = (entry: any, group: any[]) => {
    // DISABLING: The user wants to see BOTH entries even if fully settled.
    return false;
};

const getPurchasePaidAmount = (group: any[]) =>
    group.reduce((sum, leg) => {
        const description = String(leg.description || "").toLowerCase();
        const isAdvanceContra = description.includes('advance contra');
        const isCashOut = isLiquidAccountEntry(leg) && Number(leg.credit || 0) > 0;

        if (!isAdvanceContra && !isCashOut) return sum;
        return sum + Number(leg.credit || 0);
    }, 0);

const isAdvanceSettlementEntry = (entry: any) => {
    const description = String(entry.description || "").toLowerCase();
    return description.includes('advance paid') || 
           description.includes('advance contra') || 
           description.includes('cash paid to') ||
           description.includes('payment to ') ||
           description.includes('payment for arrival') ||
           description.includes('advance - '); // Mandi-specific lot advance pattern
};

const formatArrivalLotLabel = (lots: any[]) => {
    if (!lots.length) return null;

    const firstLot = lots[0];
    const itemName = firstLot?.item?.name || null;
    const baseLabel = [firstLot?.lot_code, itemName ? `(${itemName})` : null]
        .filter(Boolean)
        .join(' ');

    if (lots.length === 1) return baseLabel;
    return `${baseLabel} +${lots.length - 1} more`;
};

const formatArrivalLotPrefix = (lots: any[]) => {
    if (!lots.length) return null;

    const firstLotCode = lots[0]?.lot_code || null;
    if (!firstLotCode) return null;

    if (lots.length === 1) return firstLotCode;
    return `${firstLotCode} +${lots.length - 1} more`;
};

const getTransactionScenario = (
    group: any[],
    saleSettlements: Map<string, { saleAmount: number; receivedAmount: number }>,
    t: any
) => {
    if (!group || group.length === 0) return t('daybook.scenarios.other');

    const hasPurchaseLeg = group.some(l => inferVoucherFlow(l) === 'purchase');
    const hasSaleLeg = group.some(l => inferVoucherFlow(l) === 'sale' || inferVoucherFlow(l) === 'sale_payment');
    const firstLeg = group[0];
    
    const flowType = hasPurchaseLeg ? 'purchase' : (hasSaleLeg ? 'sale' : inferVoucherFlow(firstLeg));
    
    if (flowType === 'purchase') {
        const { isFullyCash, isFullyUdhaar, isPartial, totalValue } = getPurchaseSettlementTotals(group);
        if (totalValue > AMOUNT_EPSILON || group.length > 0) {
            if (isFullyCash) return "SCENARIO 1: FULL PAID PURCHASE";
            if (isFullyUdhaar) return "SCENARIO 3: UDHAAR PURCHASE";
            if (isPartial) return "SCENARIO 2: PARTIAL PURCHASE";
            
            const hasAnyCashLeg = group.some(l => isLiquidAccountEntry(l) && Number(l.credit || 0) > AMOUNT_EPSILON);
            if (hasAnyCashLeg) return "SCENARIO 1: FULL PAID PURCHASE";
            return "SCENARIO 3: UDHAAR PURCHASE";
        }
    }
    
    if (flowType === 'sale' || flowType === 'sale_payment') {
        const saleLegs = group.filter(l => isSaleReceivableEntry(l));
        const paymentLegs = group.filter(l => isSaleSettlementReceiptEntry(l));
        
        if (saleLegs.length > 0) {
            const saleTotal = saleLegs.reduce((sum, l) => sum + Number(l.debit || 0), 0);
            const paidTotal = paymentLegs.reduce((sum, l) => sum + Number(l.credit || 0), 0);
            
            if (paidTotal >= saleTotal - AMOUNT_EPSILON && saleTotal > AMOUNT_EPSILON) return "SCENARIO 1: FULL CASH SALE";
            if (paidTotal <= AMOUNT_EPSILON) return "SCENARIO 3: UDHAAR SALE";
            return "SCENARIO 2: PARTIAL CASH SALE";
        }
        
        if (flowType === 'sale_payment') return "SALE SETTLEMENT";
        if (flowType === 'sale') return "SALE RECORD";
    }

    if (flowType === 'receipt' || flowType === 'receive_receipt') {
        const hasWriteOff = group.some(l => (l.description || '').includes('Settlement Write-off'));
        if (hasWriteOff && !group.some(l => isLiquidAccountEntry(l) && Number(l.debit || 0) > 0)) {
            return 'SETTLEMENT WRITE-OFF';
        }
        return t('daybook.scenarios.receipt');
    }
    if (flowType === 'payment' || flowType === 'paid_receipt') {
        const hasSettlementGain = group.some(l => (l.description || '').includes('Settlement Gain'));
        if (hasSettlementGain && !group.some(l => isLiquidAccountEntry(l) && Number(l.credit || 0) > 0)) {
            return 'SETTLEMENT GAIN';
        }
        return t('daybook.scenarios.payment');
    }
    if (flowType === 'opening_balance') return 'OPENING BALANCE';

    // Transfer Scenarios
    if (flowType === 'transfer') return 'BANK TRANSFER';
    if (flowType === 'deposit') return 'CASH DEPOSIT';
    if (flowType === 'withdrawal') return 'CASH WITHDRAWAL';
    
    return t(`daybook.labels.${flowType}`) || flowType.charAt(0).toUpperCase() + flowType.slice(1);
};

const extractBillNo = (e: any) => {
    const fromRef = String(e.reference_no || "").trim();
    if (fromRef && !isNaN(Number(fromRef))) return fromRef;
    const match = (e.description || e.voucher?.narration || "").match(/#(\d+)/);
    return match ? match[1] : null;
};

const getEntryDescription = (
    entry: any,
    group: any[],
    contactMap: Record<string, string>,
    arrivalLotMap: Record<string, any>,
    arrivalReferenceMap: Record<string, string>,
    saleItemMap: Record<string, any>,
    saleReferenceMap: Record<string, string>,
    t: any,
    rawData?: any 
) => {
    const baseDescription = entry.description || entry.voucher?.narration || t('daybook.descriptions.no_description');
    const flowType = inferVoucherFlow(entry);
    const entryContactId = entry.contact_id || group.find(l => !!l.contact_id)?.contact_id;
    let counterpartyName = entryContactId ? contactMap[entryContactId] : null;
    const billNo = extractBillNo(entry);
    const saleIdFromBill = billNo ? (rawData as any)?.billToSaleMap?.[billNo] : null;
    const arrivalIdFromBill = billNo ? (rawData as any)?.billToArrivalMap?.[billNo] : null;
    const effectiveReferenceId = entry.reference_id || saleIdFromBill || arrivalIdFromBill;
    
    // If name is unknown, try to get it from the linked Sale/Arrival record
    if (!counterpartyName && saleIdFromBill) {
        const buyerId = (rawData as any)?.saleToBuyerMap?.[saleIdFromBill];
        if (buyerId) counterpartyName = contactMap[buyerId];
    }
    if (!counterpartyName && arrivalIdFromBill) {
        const farmerId = (rawData as any)?.arrivalToFarmerMap?.[arrivalIdFromBill];
        if (farmerId) counterpartyName = contactMap[farmerId];
    }

    if (flowType === 'purchase') {
        const refId = effectiveReferenceId;
        const arrivalInfo = refId ? arrivalLotMap?.[String(refId)] : null;
        
        if (arrivalInfo) {
            const { details, qtyByUnit } = (arrivalInfo as any);
            const bNo = refId ? arrivalReferenceMap?.[String(refId)] : 'N/A';
            
            const detailStr = (details || []).map((d: any) => `${d.name}: ${d.qty} ${d.unit || ''} @ ₹${d.rate}`).join(', ');
            const totals = qtyByUnit ? Object.entries(qtyByUnit).map(([u, q]) => `${q} ${u}`).join(', ') : '0';
            
            return `Purchase Bill #${bNo || 'N/A'} (${detailStr})\nTotal Qty: ${totals}`;
        }
        
        if (isAdvanceSettlementEntry(entry) || entry.transaction_type === 'payment') {
            return `Payment for Bill #${billNo || 'N/A'}`;
        }
    }
    
    if (flowType === 'sale' || flowType === 'sale_payment' || flowType === 'receive_receipt') {
        const isSettlement = flowType === 'sale_payment' || flowType === 'receive_receipt' || entry.transaction_type === 'sale_payment' || Number(entry.credit || 0) > 0;
        if (isSettlement) {
            return `Payment for Invoice #${billNo || 'N/A'}`;
        } else if (Number(entry.debit || 0) > 0) {
            const bNo = effectiveReferenceId ? saleReferenceMap?.[String(effectiveReferenceId)] : null;
            const saleInfo = effectiveReferenceId ? saleItemMap?.[String(effectiveReferenceId)] : null;
            
            if (saleInfo) {
                const { details, qtyByUnit, qty, unit, avgPrice } = (saleInfo as any);
                const detailStr = (details || []).map((d: any) => `${d.name}: ${d.qty} ${d.unit || ''} @ ₹${d.rate}`).join(', ');
                const totals = qtyByUnit ? Object.entries(qtyByUnit).map(([u, q]) => `${q} ${u}`).join(', ') : `${qty} ${unit}`;
                return `Sale Bill #${bNo || 'N/A'} (${detailStr})\nTotal Qty: ${totals}`;
            }
        }
    }

    if (flowType === 'transfer' || flowType === 'deposit' || flowType === 'withdrawal') {
        const fromLeg = group.find(l => Number(l.credit || 0) > 0);
        const toLeg = group.find(l => Number(l.debit || 0) > 0);
        const fromName = fromLeg?.account?.name || 'Unknown';
        const toName = toLeg?.account?.name || 'Unknown';
        return `Transfer: ${fromName} → ${toName}`;
    }

    return baseDescription;
};

export default function DayBook() {
    const { profile } = useAuth();
    const { t } = useLanguage();
    
    const [date, setDate] = useState<Date>(new Date());
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'cash' | 'all'>('all');
    const [cashFilter, setCashFilter] = useState<'all' | 'inflow' | 'outflow' | 'sales' | 'purchases' | 'liquid' | 'expenses'>('all');
    const tableContainerRef = React.useRef<HTMLDivElement>(null);
    
    const orgId = profile?.organization_id;
    // Cache is now shared across views for the same date
    const dateKey = `${DAYBOOK_CACHE_VERSION}_${format(date, 'yyyy-MM-dd')}`;
    const cachedData = orgId ? cacheGet<any>(`day_book_${dateKey}`, orgId) : null;

    const [rawData, setRawData] = useState<{
        entries: any[];
        arrivalTimestampMap: Record<string, string>;
        arrivalLotMap: Record<string, any>;
        arrivalLotPrefixMap: Record<string, string>;
        arrivalReferenceMap: Record<string, string>;
        saleReferenceMap: Record<string, string>;
        saleItemMap: Record<string, any>;
        contactMap: Record<string, string>;
        billToSaleMap?: Record<string, string>;
        billToArrivalMap?: Record<string, string>;
        saleToBuyerMap?: Record<string, string>;
        arrivalToFarmerMap?: Record<string, string>;
    } | null>(cachedData?.rawData || null);

    const [loading, setLoading] = useState(!cachedData);

    useEffect(() => {
        if (profile?.organization_id && profile?.business_domain) {
            const orgId = profile.organization_id;
            const currentCache = cacheGet<any>(`day_book_${dateKey}`, orgId);
            if (currentCache) {
                setRawData(currentCache.rawData || null);
                setLoading(false);
            } else {
                setRawData(null);
            }
            fetchDayBook();

            // Realtime subscription
            const channel = supabase.channel(`daybook-realtime-${orgId}-${dateKey}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'mandi', table: 'ledger_entries', filter: `organization_id=eq.${orgId}` }, () => {
                    fetchDayBook(true); // silent background fresh
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'mandi', table: 'ledger_entries', filter: `organization_id=eq.${orgId}` }, () => {
                    fetchDayBook(true); // silent background fresh
                })
                .subscribe();

            // Smart refresh from keyboard shortcuts
            const handleRefresh = () => fetchDayBook(true);
            window.addEventListener('smart-refresh', handleRefresh);

            return () => {
                supabase.removeChannel(channel);
                window.removeEventListener('smart-refresh', handleRefresh);
            };
        }
    }, [profile?.organization_id, profile?.business_domain, date]);

    const fetchDayBook = async (isManualRefresh = false) => {
        const orgId = profile?.organization_id;
        if (!orgId) return;
        if (!rawData) setLoading(true);
        try {
            const schema = 'mandi';
            const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);

            const { data, error } = await supabase
                .schema(schema)
                .from('ledger_entries')
                .select(`
                    *,
                    account:accounts(name, account_sub_type, type),
                    voucher:vouchers(type, voucher_no, narration, source, invoice_id, cheque_status, is_cleared, arrival_id)
                `)
                .eq('organization_id', profile?.organization_id)
                .eq('entry_date', dateString)
                .order('entry_date', { ascending: false })
                .order('id', { ascending: false });

            if (error) throw error;
            if (!data) return;

            const activeEntries = data.filter((entry: any) => {
                // Remove reversed entries
                if (entry.status === 'reversed') return false;

                // Remove legacy purchase_draft entries — these are unconfirmed arrivals
                // that should not appear in Day Book financial summaries
                if (entry.transaction_type === 'purchase_draft') return false;

                // Remove pure balancing counter-legs written by the v5.26 integrity
                // migration (description='Cash Settlement', type cash_receipt/cash_payment).
                // These are not real cash flows — they were added to satisfy double-entry
                // math on legacy single-leg vouchers and should not inflate Day Book.
                if (
                    (entry.transaction_type === 'cash_receipt' || entry.transaction_type === 'cash_payment') &&
                    (entry.description === 'Cash Settlement' || entry.narration === 'Cash Settlement')
                ) return false;

                return true;
            });
            const normalizedEntries = activeEntries.filter((entry: any) => !shouldHideDuplicateSaleEntry(entry, activeEntries));

            const purchaseReferenceIds = Array.from(new Set(
                normalizedEntries
                    .filter((entry: any) => inferVoucherFlow(entry) === 'purchase' && entry.reference_id)
                    .map((entry: any) => String(entry.reference_id))
            ));

            const saleReferenceIds = Array.from(new Set(
                normalizedEntries
                    .filter((entry: any) => inferVoucherFlow(entry) === 'sale' && entry.reference_id)
                    .map((entry: any) => String(entry.reference_id))
            ));

            let arrivalTimestampMap: Record<string, string> = {};
            let arrivalLotMap: Record<string, any> = {};
            let arrivalLotPrefixMap: Record<string, string> = {};
            let arrivalReferenceMap: Record<string, string> = {};
            let saleReferenceMap: Record<string, string> = {};
            let saleItemMap: Record<string, any> = {};
            
            const billToSaleMap: Record<string, string> = {};
            const saleToBuyerMap: Record<string, string> = {};
            const saleDiscountMap: Record<string, number> = {};
            const billToArrivalMap: Record<string, string> = {};
            const arrivalToFarmerMap: Record<string, string> = {};

            if (purchaseReferenceIds.length > 0 || true) { // Always fetch daily records for smart linking
                const { data: arrivalsData } = await supabase
                    .schema(schema)
                    .from('arrivals')
                    .select('*')
                    .eq('organization_id', orgId)
                    .gte('created_at', start.toISOString())
                    .lte('created_at', end.toISOString());

                arrivalsData?.forEach(arrival => {
                    arrivalTimestampMap[arrival.id] = arrival.created_at;
                    arrivalReferenceMap[arrival.id] = String(arrival.contact_bill_no || arrival.bill_no || '');
                    if (arrival.bill_no) billToArrivalMap[String(arrival.bill_no)] = arrival.id;
                    if (arrival.contact_bill_no) billToArrivalMap[String(arrival.contact_bill_no)] = arrival.id;
                    if (arrival.contact_id) arrivalToFarmerMap[arrival.id] = arrival.contact_id;
                });
                
                const allArrvIds = Array.from(new Set([...purchaseReferenceIds, ...(arrivalsData?.map(a => a.id) || [])]));

                const { data: lotsData } = await supabase
                    .schema(schema)
                    .from('lots')
                    .select('arrival_id, lot_code, initial_qty, total_weight, unit, supplier_rate, commission_percent, packing_cost, loading_cost, farmer_charges, less_percent, item:commodities(name, custom_attributes)')
                    .in('arrival_id', allArrvIds)
                    .order('created_at', { ascending: true });

                const lotsByArrival = new Map<string, any[]>();
                lotsData?.forEach((lot) => {
                    const arrivalId = String(lot.arrival_id);
                    if (!lotsByArrival.has(arrivalId)) lotsByArrival.set(arrivalId, []);
                    lotsByArrival.get(arrivalId)!.push(lot);
                });

                lotsByArrival.forEach((lots, arrivalId) => {
                    const formatItemName = (it: any) => {
                        const name = it?.name || '';
                        const attrs = it?.custom_attributes || {};
                        const entry = Object.entries(attrs).find(([k, v]) => !!v && String(v).trim() !== '');
                        return entry ? `${name} (${entry[0]}: ${entry[1]})` : name;
                    };
                    
                    const uniqueItems = Array.from(new Set(lots.map(l => formatItemName(l.item)).filter(Boolean)));
                    const itemLabel = uniqueItems.length > 2 ? `${uniqueItems[0]}, ${uniqueItems[1]} +${uniqueItems.length - 2} more` : uniqueItems.join(', ');
                    
                    // Qty Sum & Average Rate
                    const totalQty = lots.reduce((sum, l) => sum + Number(l.initial_qty || 0), 0);
                    const avgRate = lots.length > 0 ? lots.reduce((sum, l) => sum + Number(l.supplier_rate || 0), 0) / lots.length : 0;
                    const mainUnit = lots[0]?.unit || '';

                    // Charges Calculation (Detailed Breakdown)
                    let totalCharges = 0;
                    const breakdown = { comm: 0, exp: 0, less: 0 };
                    
                    lots.forEach(lot => {
                        const gross = Number(lot.initial_qty || 0) * Number(lot.supplier_rate || 0);
                        const lessWeightVal = gross * (Number(lot.less_percent || 0) / 100.0);
                        const weightAdjusted = gross - lessWeightVal;
                        
                        const commission = weightAdjusted * (Number(lot.commission_percent || 0) / 100.0);
                        const exps = Number(lot.packing_cost || 0) + Number(lot.loading_cost || 0) + Number(lot.farmer_charges || 0);
                        
                        breakdown.comm += commission;
                        breakdown.exp += exps;
                        breakdown.less += lessWeightVal;
                        totalCharges += lessWeightVal + commission + exps;
                    });

                    // Mixed Unit Aggregation
                    const qtyByUnit: Record<string, number> = {};
                    lots.forEach(l => {
                        const u = l.unit || 'Unit';
                        qtyByUnit[u] = (qtyByUnit[u] || 0) + Number(l.initial_qty || 0);
                    });

                    arrivalLotMap[arrivalId] = { 
                        items: itemLabel, 
                        qtyByUnit,
                        details: lots.map(l => ({
                            name: `${formatItemName(l.item)}${l.lot_code ? ` [Lot: ${l.lot_code}]` : ''}`,
                            qty: Number(l.initial_qty || 0),
                            rate: Number(l.supplier_rate || 0),
                            unit: l.unit
                        })),
                        qty: totalQty, 
                        unit: mainUnit, 
                        avgRate: avgRate,
                        totalCharges: totalCharges,
                        breakdown
                    };
                    
                    const lotPrefix = formatArrivalLotPrefix(lots);
                    if (lotPrefix) arrivalLotPrefixMap[arrivalId] = lotPrefix;
                });
            }

            if (saleReferenceIds.length > 0 || true) { // Always fetch daily records for smart linking
                const { data: salesData } = await supabase
                    .schema(schema)
                    .from('sales')
                    .select('id, contact_bill_no, bill_no, buyer_id, discount_amount')
                    .eq('organization_id', orgId)
                    .gte('sale_date', dateString)
                    .lte('sale_date', dateString);

                salesData?.forEach(sale => {
                    saleReferenceMap[sale.id] = String(sale.contact_bill_no || sale.bill_no || '');
                    if (sale.bill_no) billToSaleMap[String(sale.bill_no)] = sale.id;
                    if (sale.contact_bill_no) billToSaleMap[String(sale.contact_bill_no)] = sale.id;
                    if (sale.buyer_id) saleToBuyerMap[sale.id] = sale.buyer_id;
                    if (Number(sale.discount_amount || 0) > 0) saleDiscountMap[sale.id] = Number(sale.discount_amount);
                });
                
                const allSaleIds = Array.from(new Set([...saleReferenceIds, ...(salesData?.map(s => s.id) || [])]));

                const { data: saleItemsData } = await supabase
                    .schema(schema)
                    .from('sale_items')
                    .select('sale_id, quantity, unit, rate, item:commodities(name, custom_attributes), lot:lots(lot_code)')
                    .in('sale_id', allSaleIds);

                const statsBySale = new Map<string, { 
                    items: string[], 
                    detailsMap: Map<string, { qty: number, rate: number, unit: string }>, 
                    qty: number, 
                    unit: string, 
                    priceSum: number, 
                    count: number 
                }>();

                saleItemsData?.forEach(si => {
                    const sid = String(si.sale_id);
                    if (!statsBySale.has(sid)) {
                        statsBySale.set(sid, { 
                            items: [], 
                            detailsMap: new Map(), 
                            qty: 0, 
                            unit: '', 
                            priceSum: 0, 
                            count: 0 
                        });
                    }
                    
                    const stat = statsBySale.get(sid)!;
                    const itemNode = Array.isArray(si.item) ? si.item[0] : si.item;
                    const itemNameFull = (() => {
                        const base = itemNode?.name || '';
                        const attrs = itemNode?.custom_attributes || {};
                        const entry = Object.entries(attrs).find(([k, v]) => !!v && String(v).trim() !== '');
                        return entry ? `${base} (${entry[0]}: ${entry[1]})` : base;
                    })();
                    
                    const lotNode = Array.isArray(si.lot) ? si.lot[0] : si.lot;
                    const lotCode = lotNode?.lot_code ? ` [Lot: ${lotNode.lot_code}]` : '';
                    const itemNameWithLot = itemNameFull + lotCode;
                    
                    if (itemNameFull) {
                        stat.items.push(itemNameFull);
                        const rateKey = `${itemNameFull}_${si.rate}_${lotNode?.lot_code || 'N/A'}`;
                        if (!stat.detailsMap.has(rateKey)) {
                            stat.detailsMap.set(rateKey, { name: itemNameWithLot, qty: 0, rate: Number(si.rate || 0), unit: si.unit } as any);
                        }
                        const d = stat.detailsMap.get(rateKey)!;
                        d.qty += Number(si.quantity || 0);
                    }
                    stat.qty += Number(si.quantity || 0);
                    stat.priceSum += Number(si.rate || 0);
                    stat.count++;
                    if (!stat.unit) stat.unit = si.unit || '';
                });

                statsBySale.forEach((stat, sid) => {
                    const uniqueItems = Array.from(new Set(stat.items));
                    const itemLabel = uniqueItems.length > 2 ? `${uniqueItems[0]}, ${uniqueItems[1]} +${uniqueItems.length - 2} more` : uniqueItems.join(', ');
                    
                    saleItemMap[sid] = { 
                        items: itemLabel, 
                        details: Array.from(stat.detailsMap.values()),
                        qty: stat.qty, 
                        unit: stat.unit, 
                        avgPrice: stat.count > 0 ? stat.priceSum / stat.count : 0,
                        lotPrefix: Array.from(new Set(stat.items.map(i => {
                            const match = i.match(/\[Lot: (.*?)\]/);
                            return match ? match[1] : null;
                        }).filter(Boolean))).join(', ')
                    };
                });
            }

            const contactIds = Array.from(new Set(normalizedEntries.map((e: any) => e.contact_id).filter(Boolean)));
            let contactMap: Record<string, string> = {};
            if (contactIds.length > 0) {
                const { data: contactsData } = await supabase
                    .schema(schema)
                    .from('contacts')
                    .select('id, name')
                    .in('id', contactIds);
                contactsData?.forEach(c => { contactMap[c.id] = c.name; });
            }

            const newRawData = {
                entries: normalizedEntries,
                arrivalTimestampMap,
                arrivalLotMap,
                arrivalLotPrefixMap,
                arrivalReferenceMap,
                saleReferenceMap,
                saleItemMap,
                contactMap,
                billToSaleMap,
                billToArrivalMap,
                saleToBuyerMap,
                saleDiscountMap,
                arrivalToFarmerMap
            } as any;

            setRawData(newRawData);
            setLoading(false);
            if (orgId) {
                cacheSet(`day_book_${dateKey}`, orgId, { rawData: newRawData });
            }
        } catch (error) {
            console.error("DayBook Fetch Error:", error);
            setLoading(false);
        }
    };
    const { transactionGroups, summary } = useMemo(() => {
        if (!rawData) return {
            transactionGroups: [],
            summary: {
                sales: { total: 0, cash: 0, credit: 0 },
                purchases: { total: 0, cash: 0, credit: 0 },
                cash: { inflow: 0, outflow: 0 },
                digital: { inflow: 0, outflow: 0 },
                margin: 0,
                expenses: 0,
                rawDebit: 0,
                rawCredit: 0,
                imbalancedCount: 0,
                imbalancedWorst: 0,
                imbalancedVoucherIds: [] as string[]
            }
        };

        const { entries: normalizedEntries, arrivalTimestampMap, arrivalLotMap, arrivalLotPrefixMap, arrivalReferenceMap, saleReferenceMap, saleItemMap, contactMap, billToSaleMap } = rawData;
        const saleSettlements = buildSaleSettlementMap(normalizedEntries);

        // ── VOUCHER INTEGRITY QUARANTINE ─────────────────────────────────────
        // Compute the set of vouchers whose Dr ≠ Cr. These are rendered
        // (so the user can see them) but EXCLUDED from summary KPI totals,
        // so one corrupt voucher can't poison Sales/Purchase/Liquid/Expense
        // cards. A warning banner surfaces the count above the cards.
        // ─────────────────────────────────────────────────────────────────────
        const imbalancedVoucherIds = findImbalancedVoucherIds(normalizedEntries);
        const health = summarizeVoucherHealth(normalizedEntries);

        const entriesByGroupKey = new Map<string, any[]>();
        const entriesByVoucherID = new Map<string, any[]>();
        normalizedEntries.forEach(e => {
            const gkey = getEntryGroupKey(e);
            if (!entriesByGroupKey.has(gkey)) entriesByGroupKey.set(gkey, []);
            entriesByGroupKey.get(gkey)!.push(e);
            if (e.voucher_id) {
                if (!entriesByVoucherID.has(e.voucher_id)) entriesByVoucherID.set(e.voucher_id, []);
                entriesByVoucherID.get(e.voucher_id)!.push(e);
            }
        });

        // ONE CARD PER TRANSACTION RULE
        // Build a set of representative entry IDs — one per group
        const groupRepMap = new Map<string, string>(); // gkey -> representative entry.id
        normalizedEntries.forEach((entry: any) => {
            const gkey = getEntryGroupKey(entry);
            const group = entriesByGroupKey.get(gkey) || [];
            if (!groupRepMap.has(gkey)) {
                const rep = getGroupRepresentative(group);
                groupRepMap.set(gkey, rep.id);
            }
        });

        const visibleEntries = normalizedEntries.filter((entry: any) => {
            if (isPendingChequeEntry(entry)) return false;
            const gkey = getEntryGroupKey(entry);
            return groupRepMap.get(gkey) === entry.id;
        });

        const entriesByGroup = new Map<string, any[]>();
        normalizedEntries.forEach(e => {
            const gid = getEntryGroupKey(e);
            if (!entriesByGroup.has(gid)) entriesByGroup.set(gid, []);
            entriesByGroup.get(gid)!.push(e);
        });

        const enriched = visibleEntries.map((e: any, index: number) => {
            const rawDebit = Number(e.debit || 0), rawCredit = Number(e.credit || 0), flowType = inferVoucherFlow(e);
            const rowType = flowType === 'purchase' && isAdvanceSettlementEntry(e) ? 'payment' : flowType;
            const groupKey = getEntryGroupKey(e), group = entriesByGroup.get(groupKey) || [];
            const transactionTimestamp = flowType === 'purchase' && e.reference_id ? arrivalTimestampMap[String(e.reference_id)] : undefined;
            const groupContactId = group.find(l => !!l.contact_id)?.contact_id;
            const effectiveContactId = e.contact_id || groupContactId;
            const baseDisplayName = effectiveContactId ? contactMap[effectiveContactId] : (e.account?.name || 'Unknown');
            const purchaseLotPrefix = effectiveContactId && flowType === 'purchase' && e.reference_id ? arrivalLotPrefixMap[String(e.reference_id)] : null;
            const saleIdFromBill = e.bill_id ? billToSaleMap?.[String(e.bill_id)] : null;
            const saleLotPrefix = effectiveContactId && (flowType === 'sale' || flowType === 'sale_payment') && (e.reference_id || saleIdFromBill) ? saleItemMap[String(e.reference_id || saleIdFromBill)]?.lotPrefix : null;
            const displayLotPrefix = purchaseLotPrefix || saleLotPrefix;
            
            const displayDescription = getEntryDescription(e, group, contactMap, arrivalLotMap, arrivalReferenceMap, saleItemMap, saleReferenceMap, t, rawData);
            let displayLabel = 'Transaction';
            if (rowType === 'receive_receipt') displayLabel = 'Receipt';
            else if (rowType === 'sale_payment') displayLabel = 'Receipt';
            else if (rowType === 'paid_receipt') displayLabel = 'Receipt';
            else if (rowType === 'expense_receipt') displayLabel = 'Expense';
            else if (rowType === 'payment') displayLabel = 'Receipt';
            else if (rowType === 'sale') displayLabel = 'Sale';
            else if (rowType === 'opening_balance') displayLabel = 'Opening Balance';
            else if (flowType === 'purchase') displayLabel = 'Purchase';
            return { ...e, sortIndex: index, displayTimestamp: transactionTimestamp || e.created_at || e.entry_date, reference_no: e.reference_no || (flowType === 'purchase' && e.reference_id ? arrivalReferenceMap[String(e.reference_id)] : e.reference_no), contact: { name: baseDisplayName }, displayNameLotPrefix: displayLotPrefix, displayType: rowType, displayLabel, displayDescription, displayDebit: rawDebit, displayCredit: rawCredit, isUdhaar: (rowType === 'sale' || rowType === 'purchase') && !((e.account?.account_sub_type === 'cash' || e.account?.account_sub_type === 'bank' || e.account?.type === 'bank')) };
        });

        const finalGroupMap = new Map<string, any[]>();
        enriched.forEach(e => {
            const gid = getEntryGroupKey(e);
            if (!finalGroupMap.has(gid)) finalGroupMap.set(gid, []);
            finalGroupMap.get(gid)!.push(e);
        });

        const processedGroups = Array.from(finalGroupMap.keys()).map(gid => {
            const visibleLegs = [...finalGroupMap.get(gid)!];
            // Always use the FULL set of raw entries for the group (all database legs)
            // so scenario (Full/Udhaar/Partial) and amount totals are accurate
            const repEntry = visibleLegs[0];
            const fullGroupKey = repEntry ? getEntryGroupKey(repEntry) : gid;
            const rawLegs = entriesByGroup.get(fullGroupKey) || visibleLegs;
            const hasSaleLeg = rawLegs.some(l => inferVoucherFlow(l) === 'sale' || inferVoucherFlow(l) === 'sale_payment');
            const hasPurchaseLeg = rawLegs.some(l => inferVoucherFlow(l) === 'purchase');
            const flowType = hasPurchaseLeg ? 'purchase' : (hasSaleLeg ? 'sale' : inferVoucherFlow(rawLegs[0]));
            let legs: any[] = [];
            if (flowType === 'purchase') {
                const { cashPaid, totalValue } = getPurchaseSettlementTotals(rawLegs);
                const purchaseGoodsLeg = rawLegs.find(l => (inferVoucherFlow(l) === 'purchase' || l.transaction_type === 'purchase') && Number(l.credit || 0) > 0);
                const baseLeg = purchaseGoodsLeg || visibleLegs.find(l => l.contact_id) || visibleLegs[0];
                
                if (baseLeg) {
                    // 1. Bill Leg (Credit - Goods Received)
                    legs.push({
                        ...baseLeg,
                        displayDebit: 0,
                        displayCredit: totalValue,
                        displayLabel: 'Purchase',
                        displayDescription: getEntryDescription(baseLeg, rawLegs, contactMap, arrivalLotMap, arrivalReferenceMap, saleItemMap, saleReferenceMap, t, rawData),
                        displayType: 'purchase'
                    });

                    // 2. Payment Leg (Debit - Money Paid)
                    if (cashPaid > 0) {
                        const actualPaymentLeg = rawLegs.find(l => (inferVoucherFlow(l) === 'payment' || inferVoucherFlow(l) === 'paid_receipt') && Number(l.debit || 0) > 0);
                        const bNo = extractBillNo(baseLeg);
                        legs.push({
                            ...(actualPaymentLeg || baseLeg),
                            displayDebit: cashPaid,
                            displayCredit: 0,
                            displayLabel: '',
                            displayDescription: `Payment for Bill #${bNo || 'no.'}`,
                            displayType: 'payment'
                        });
                    }
                }
            } else if (flowType === 'sale') {
                const saleLegs = rawLegs.filter(l => isSaleReceivableEntry(l));
                const paymentLegs = rawLegs.filter(l => isSaleSettlementReceiptEntry(l));
                const totalSaleValue = saleLegs.reduce((sum, l) => sum + Number(l.debit || 0), 0);
                const totalPaidValue = paymentLegs.reduce((sum, l) => sum + Number(l.credit || 0), 0);
                
                // Find a proper sale leg for the goods description
                const saleGoodsLeg = rawLegs.find(l => (inferVoucherFlow(l) === 'sale' || l.transaction_type === 'sale') && Number(l.debit || 0) > 0);
                const baseLeg = saleGoodsLeg || visibleLegs.find(l => l.contact_id) || visibleLegs[0];
                
                if (baseLeg) {
                    // 1. Sale Leg (Debit - Goods Sold)
                    legs.push({
                        ...baseLeg,
                        displayDebit: totalSaleValue,
                        displayCredit: 0,
                        displayLabel: 'Sale',
                        displayDescription: getEntryDescription(baseLeg, rawLegs, contactMap, arrivalLotMap, arrivalReferenceMap, saleItemMap, saleReferenceMap, t, rawData),
                        displayType: 'sale'
                    });

                    // 2. Payment Leg (Credit - Money Received)
                    if (totalPaidValue > 0) {
                        const actualReceiptLeg = rawLegs.find(l => (inferVoucherFlow(l) === 'sale_payment' || inferVoucherFlow(l) === 'receive_receipt') && Number(l.credit || 0) > 0);
                        const bNo = extractBillNo(baseLeg);
                        legs.push({
                            ...(actualReceiptLeg || baseLeg),
                            displayDebit: 0,
                            displayCredit: totalPaidValue,
                            displayLabel: '',
                            displayDescription: `Payment for Invoice #${bNo || 'no.'}`,
                            displayType: 'receipt'
                        });
                    }
                }
            } else {
                const mainLeg = visibleLegs.find(l => l.contact_id) || visibleLegs[0];
                if (mainLeg) {
                    const groupVolume = rawLegs.reduce((sum, l) => sum + Number(l.debit || 0), 0);
                    const singleVal = groupVolume > 0 && groupVolume < 999999999 ? groupVolume : Math.max(Number(mainLeg.debit || 0), Number(mainLeg.credit || 0));
                    
                    const isReceipt = flowType === 'receive_receipt' || flowType === 'receipt' || flowType === 'sale_payment';
                    const isPayment = flowType === 'paid_receipt' || flowType === 'payment';
                    const isExpense = flowType === 'expense_receipt';

                    const v = mainLeg.voucher || {};
                    let label = 'Other';
                    if (isReceipt) label = 'Receipt';
                    else if (isPayment) label = 'Payment';
                    else if (isExpense) label = 'Expense';

                    // Mandi Terminology Flip:
                    // Receipt (Receive Money) -> Credit
                    // Payment (Pay Money) -> Debit
                    // Expense -> Debit
                    legs.push({
                        ...mainLeg,
                        displayDebit: (isPayment || isExpense) ? singleVal : 0,
                        displayCredit: isReceipt ? singleVal : 0,
                        displayLabel: label,
                        displayDescription: v.narration || mainLeg.description,
                        displayType: flowType
                    });
                }
            }
            // Collect voucher_ids covered by this group (from raw legs, not just
            // the one rendered leg) so we can flag it as "imbalanced" if any of
            // them are in the quarantine set — the badge shows in the table and
            // the summary loop below will skip it.
            const groupVoucherIds = Array.from(new Set(rawLegs.map(l => l.voucher_id).filter(Boolean))) as string[];
            const hasImbalancedVoucher = groupVoucherIds.some(vid => imbalancedVoucherIds.has(vid));
            const hasCash = rawLegs.some(isInstantSettlementEntry);
            return {
                gid,
                scenario: getTransactionScenario(rawLegs, saleSettlements, t),
                summaryLegs: legs.filter(Boolean),
                renderLegs: rawLegs.map(l => ({
                    ...l,
                    displayTimestamp: l.entry_date || l.created_at,
                    displayDebit: Number(l.debit || 0),
                    displayCredit: Number(l.credit || 0),
                    displayDescription: l.voucher?.narration || l.description
                })).sort((a, b) => {
                    // Sort Debits first, then Credits
                    if (a.displayDebit > 0 && b.displayCredit > 0) return -1;
                    if (a.displayCredit > 0 && b.displayDebit > 0) return 1;
                    return 0;
                }),
                // Legacy support for any cached components expecting .legs
                legs: rawLegs.map(l => ({
                    ...l,
                    displayTimestamp: l.entry_date || l.created_at,
                    displayDebit: Number(l.debit || 0),
                    displayCredit: Number(l.credit || 0),
                    displayDescription: l.voucher?.narration || l.description
                })).sort((a, b) => {
                    if (a.displayDebit > 0 && b.displayCredit > 0) return -1;
                    if (a.displayCredit > 0 && b.displayDebit > 0) return 1;
                    return 0;
                }),
                timestamp: (visibleLegs[0]) ? (visibleLegs[0].displayTimestamp || visibleLegs[0].created_at || visibleLegs[0].entry_date) : new Date().toISOString(),
                voucherIds: groupVoucherIds,
                isImbalanced: hasImbalancedVoucher,
                hasCash,
            };
        }).filter(Boolean);

        processedGroups.sort((a, b) => { if (!a || !b) return 0; const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0, timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0, timeDiff = timeB - timeA; return timeDiff !== 0 ? timeDiff : String(b.gid || '').localeCompare(String(a.gid || '')); });

        // Standardize summaries and include 3-way breakdown (Full, Partial, Credit)
        // Simplified summaries to show 'Cash Portion' vs 'Udhaar Portion' as requested
        let totalSales = 0, cashSales = 0;
        let totalPurchases = 0, cashPurchases = 0;
        let totalExpenses = 0, totalInflow = 0, totalOutflow = 0;
        let digitalInflow = 0, digitalOutflow = 0;

        // ── STRICT SUMMARY ISOLATION ──────────────────────────────────────────
        // Purchase  → Purchase Insights only  (total, cashPaid, udhaar)
        // Sale      → Sales Summary only      (total, cashReceived, udhaar)
        // Manual Receipt/Payment → Liquid Assets ONLY
        // Expense   → Daily Expenses ONLY
        // The cash leg of a purchase/sale never touches Liquid Assets.
        // ─────────────────────────────────────────────────────────────────────
        processedGroups.forEach(group => {
            // Skip any group that contains a voucher whose Dr ≠ Cr — we do not
            // want a corrupt voucher (e.g. the ₹34 crore phantom) inflating
            // the Sales/Purchase/Liquid/Expense totals. The group is still
            // rendered in the transaction table with a ⚠️ badge so the user
            // can see and investigate it.
            if ((group as any).isImbalanced) return;
            group.summaryLegs.forEach((leg: any) => {
                const type = leg.displayType as string;

                // 1. PURCHASE → Only Purchase Insights
                //    displayCredit = total purchase value (goods received from supplier)
                //    displayDebit  = cash paid immediately at time of purchase
                if (type === 'purchase') {
                    totalPurchases += (leg.displayCredit || 0);  // goods received value
                    cashPurchases  += (leg.displayDebit  || 0);  // cash paid out
                    return;
                }

                // 2. SALE → Only Sales Summary
                //    displayDebit  = total sale value (goods sold to buyer)
                //    displayCredit = cash collected at time of sale
                if (type === 'sale') {
                    totalSales += (leg.displayDebit  || 0);  // goods sold value
                    cashSales  += (leg.displayCredit || 0);  // cash/bank collected
                    return;
                }

                // 2b. SALE PAYMENT → counted under Sales (cash collected after the fact)
                //     These are partial/later payments from buyer against a sale invoice.
                //     They add to cashSales but NOT to totalSales (already counted on sale day).
                if (type === 'sale_payment') {
                    cashSales += Math.max(leg.displayDebit || 0, leg.displayCredit || 0);
                    return;
                }

                // 3. MANUAL RECEIPT (money received from buyer — standalone Receive Money)
                //    → Only Liquid Assets Inflow
                //    Does NOT add to Sales (already captured in sale card above)
                if (type === 'receipt' || type === 'receive_receipt') {
                    const val = Math.max(leg.displayDebit || 0, leg.displayCredit || 0);
                    const isBank = String(leg.account?.account_sub_type || '').toLowerCase() === 'bank'
                        || String(leg.account?.name || '').toLowerCase().includes('bank')
                        || String(leg.displayDescription || '').toLowerCase().includes('upi');
                    if (isBank) digitalInflow += val; else totalInflow += val;
                    
                    // If this is a payment for a sale in the SAME group, count as cash sale
                    if (leg.displayDescription?.includes('Payment for Invoice')) {
                        cashSales += val;
                    }
                    return;
                }

                if (type === 'payment' || type === 'paid_receipt') {
                    const val = Math.max(leg.displayDebit || 0, leg.displayCredit || 0);
                    const isBank = String(leg.account?.account_sub_type || '').toLowerCase() === 'bank'
                        || String(leg.account?.name || '').toLowerCase().includes('bank')
                        || String(leg.displayDescription || '').toLowerCase().includes('upi');
                    if (isBank) digitalOutflow += val; else totalOutflow += val;

                    // If this is a payment for a purchase in the SAME group, count as cash purchase
                    if (leg.displayDescription?.includes('Payment for Bill')) {
                        cashPurchases += val;
                    }
                    return;
                }

                // 5. EXPENSE → Only Daily Expenses
                if (type === 'expense_receipt') {
                    totalExpenses += Math.max(leg.displayDebit || 0, leg.displayCredit || 0);
                }
            });
        });


        // Finalize Sub-totals and Outstandings
        const creditSalesTotal = Math.max(totalSales - cashSales, 0);
        const creditPurchasesTotal = Math.max(totalPurchases - cashPurchases, 0);

        const newSummary = {
            sales: {
                total: totalSales,
                cash: cashSales,
                credit: creditSalesTotal
            },
            purchases: {
                total: totalPurchases,
                cash: cashPurchases,
                credit: creditPurchasesTotal
            },
            cash: { inflow: totalInflow, outflow: totalOutflow },
            digital: { inflow: digitalInflow, outflow: digitalOutflow },
            margin: totalSales - totalPurchases,
            expenses: totalExpenses,
            rawDebit: normalizedEntries.reduce((sum: number, e: any) => sum + Number(e.debit || 0), 0),
            rawCredit: normalizedEntries.reduce((sum: number, e: any) => sum + Number(e.credit || 0), 0),
            imbalancedCount: health.imbalancedCount,
            imbalancedWorst: health.worstImbalance,
            imbalancedVoucherIds: health.imbalancedVoucherIds,
        };

        return { transactionGroups: processedGroups, summary: newSummary };
    }, [rawData, viewMode, t]);


    const exportTransactionGroups = (groups: any[], filename: string) => {
        const flatEntries = groups.flatMap(g => g.renderLegs.map((l: any) => ({
            ...l,
            scenario: g.scenario,
            groupTimestamp: g.timestamp
        })));
        exportToCSV(flatEntries, filename);
    };

    const isBalanced = Math.abs(summary.rawDebit - summary.rawCredit) < 1;
    
    const totalDebit = transactionGroups.reduce((sum, g) => sum + g.summaryLegs.reduce((s: any, e: any) => s + (e.displayDebit || 0), 0), 0);
    const totalCredit = transactionGroups.reduce((sum, g) => sum + g.summaryLegs.reduce((s: any, e: any) => s + (e.displayCredit || 0), 0), 0);
    const footerDebitTextClass = 'text-rose-700';
    const footerCreditTextClass = 'text-emerald-700';

    // Cash Book filter: compute filtered list before render
    const filteredGroups = transactionGroups.filter(g => {
        if (cashFilter !== 'all') {
            if (cashFilter === 'sales')     return g.summaryLegs.some((l: any) => ['sale', 'sale_payment', 'receive_receipt', 'receipt'].includes(l.displayType));
            if (cashFilter === 'purchases') return g.summaryLegs.some((l: any) => ['purchase', 'payment', 'paid_receipt'].includes(l.displayType));
            if (cashFilter === 'liquid')    return g.summaryLegs.some((l: any) => ['receipt', 'payment', 'receive_receipt', 'paid_receipt', 'sale_payment', 'expense_receipt'].includes(l.displayType));
            if (cashFilter === 'expenses')  return g.summaryLegs.some((l: any) => l.displayType === 'expense_receipt');
        } else if (viewMode === 'cash') {
            return (g as any).hasCash;
        }
        return true;
    });

    const { focusedIndex } = useTableKeyboard({
        rowCount: filteredGroups.length,
        containerRef: tableContainerRef
    });

    if (isNativePlatform()) {
        return (
            <div className="space-y-6 pb-24">
                {/* Mobile Header: Date Selection */}
                <div className="bg-white px-4 py-6 border-b border-slate-100 shadow-sm sticky top-0 z-40">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center">
                                <BookOpen className="w-5 h-5 text-yellow-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-900 tracking-tight">Day Book</h2>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{format(date, "MMMM d, yyyy")}</p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            className="bg-slate-50 border-slate-200 h-11 px-4 rounded-xl flex items-center gap-2 font-bold text-xs"
                            onClick={() => setDatePickerOpen(true)}
                        >
                            <CalendarIcon className="w-4 h-4 text-emerald-600" />
                            {format(date, "MMM d")}
                        </Button>
                    </div>

                    <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
                        <button
                            className={cn("flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", viewMode === 'cash' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500")}
                            onClick={() => setViewMode('cash')}
                        >
                            Cash Book
                        </button>
                        <button
                            className={cn("flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", viewMode === 'all' ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500")}
                            onClick={() => setViewMode('all')}
                        >
                            All Ledger
                        </button>
                    </div>
                </div>

                {/* Mobile Summary: Horizontal Scroll */}
                <div className="flex gap-4 px-4 overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden">
                    <div className="min-w-[280px] bg-slate-900 p-5 rounded-3xl shadow-lg text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16" />
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Sales Summary</span>
                            <Tag className="w-5 h-5 opacity-40" />
                        </div>
                        <p className="text-2xl font-black tracking-tight mb-2">₹{summary.sales.total.toLocaleString()}</p>
                        <div className="flex justify-between text-[10px] items-center border-t border-white/20 pt-3">
                            <span className="font-bold flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Cash: ₹{summary.sales.cash.toLocaleString()}</span>
                            <span className="font-bold opacity-70 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Udhaar: ₹{summary.sales.credit.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="min-w-[280px] bg-emerald-600 p-5 rounded-3xl shadow-lg text-white">
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Liquid Flow</span>
                            <Wallet className="w-5 h-5 opacity-40" />
                        </div>
                        <p className="text-2xl font-black tracking-tight mb-2">₹{(summary.cash.inflow - summary.cash.outflow + summary.digital.inflow - summary.digital.outflow).toLocaleString()}</p>
                        <div className="flex justify-between text-[10px] items-center border-t border-white/20 pt-3">
                            <span className="font-bold">Inflow: ₹{(summary.cash.inflow + summary.digital.inflow).toLocaleString()}</span>
                            <span className="font-bold opacity-70">Outflow: ₹{(summary.cash.outflow + summary.digital.outflow).toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="min-w-[280px] bg-indigo-600 p-5 rounded-3xl shadow-lg text-white">
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Purchase/Expense</span>
                            <ArrowUpRight className="w-5 h-5 opacity-40" />
                        </div>
                        <p className="text-2xl font-black tracking-tight mb-2">₹{(summary.purchases.total + summary.expenses).toLocaleString()}</p>
                        <div className="flex justify-between text-[10px] items-center border-t border-white/20 pt-3">
                            <span className="font-bold">Purch: ₹{summary.purchases.total.toLocaleString()}</span>
                            <span className="font-bold opacity-70">Exp: ₹{summary.expenses.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="min-w-[280px] bg-rose-600 p-5 rounded-3xl shadow-lg text-white">
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Daily Expenses</span>
                            <Activity className="w-5 h-5 opacity-40" />
                        </div>
                        <p className="text-2xl font-black tracking-tight mb-2">₹{summary.expenses.toLocaleString()}</p>
                        <div className="border-t border-white/20 pt-3">
                            <p className="text-[10px] opacity-70 leading-relaxed">Operational costs & direct expenses recorded today</p>
                        </div>
                    </div>
                </div>

                {/* Mobile Tabs Row */}
                {true && (
                    <div className="px-4 flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-2">
                        {[
                            { label: 'All', value: 'all' },
                            { label: 'Sales', value: 'sales' },
                            { label: 'Purchases', value: 'purchases' },
                            { label: 'Liquid', value: 'liquid' },
                            { label: 'Expenses', value: 'expenses' }    
                        ].map(f => (
                            <button
                                key={f.value}
                                onClick={() => setCashFilter(f.value as any)}
                                className={cn(
                                    "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                                    cashFilter === f.value ? "bg-slate-900 text-white shadow-md border-black" : "bg-white text-slate-500 border border-slate-200"
                                )}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Transaction List: Clean Ledger Style */}
                <div className="px-4 pb-20">
                    <div className="flex items-center justify-between px-4 mb-4">
                        <NativeSectionLabel>Transactions ({filteredGroups.length})</NativeSectionLabel>
                    </div>
                    
                    {loading && filteredGroups.length === 0 ? (
                        <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-emerald-600" /></div>
                    ) : filteredGroups.length === 0 ? (
                        <div className="py-20 text-center bg-white rounded-3xl border border-slate-100">
                            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">No entries found today</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            {/* Table Header */}
                            <div className="grid grid-cols-[1fr_120px_120px_120px] gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <div>Particulars(partyname)</div>
                                <div>Type</div>
                                <div className="text-right">Debit</div>
                                <div className="text-right">Credit</div>
                            </div>

                            <div className="space-y-6 px-6 py-8 bg-white">
                                {filteredGroups.map((g: any) => (
                                    <div key={g.gid} className="border-t-2 border-b-2 border-slate-600 bg-white">
                                        {g.summaryLegs.map((leg: any, idx: number) => {
                                            const particulars = leg.contact?.name || leg.account?.name;
                                            const description = leg.displayDescription;
                                            const isDebit = (leg.displayDebit || 0) > 0.01;
                                            const isCredit = (leg.displayCredit || 0) > 0.01;

                                            return (
                                                <div key={`${g.gid}_${idx}`} className={cn(
                                                    "grid grid-cols-[1fr_120px_120px_120px] gap-4 px-2 py-4 items-start",
                                                    idx > 0 && "pt-0 pb-4" // Payment sub-row styling
                                                )}>
                                                    {/* Particulars Column (Description in Screenshot 2) */}
                                                    <div className="min-w-0">
                                                        <div className="text-[14px] text-slate-800 leading-relaxed font-medium">
                                                            {idx === 0 && particulars && (
                                                                <div className="text-[12px] font-black text-slate-400 mb-1 uppercase tracking-tight">
                                                                    {particulars}
                                                                </div>
                                                            )}
                                                            <div className="whitespace-pre-wrap">
                                                                {description}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Type Column */}
                                                    <div className="text-[14px] font-medium text-slate-700 pt-0.5">
                                                        {leg.displayLabel || ""}
                                                    </div>

                                                    {/* Debit Column */}
                                                    <div className="text-right text-[15px] font-bold text-slate-900 pt-0.5">
                                                        {isDebit ? Number(leg.displayDebit).toLocaleString() : ""}
                                                    </div>

                                                    {/* Credit Column */}
                                                    <div className="text-right text-[15px] font-bold text-slate-900 pt-0.5">
                                                        {isCredit ? Number(leg.displayCredit).toLocaleString() : ""}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                }
            </div>

                {/* Date Picker BottomSheet */}
                <BottomSheet open={datePickerOpen} onClose={() => setDatePickerOpen(false)} title="Go to Date">
                    <div className="p-4 flex justify-center bg-white">
                        <NativeCalendar
                            mode="single"
                            selected={date}
                            onSelect={(d) => { if(d) { setDate(d); setDatePickerOpen(false); } }}
                            disabled={(d) => d > new Date() || d < new Date("1900-01-01")}
                            initialFocus
                        />
                    </div>
                </BottomSheet>
            </div>
        );
    }

    return (
        <div className="space-y-8 p-8 animate-in fade-in duration-700 print:p-0 print:space-y-4 print:block">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-[#FEFCE8] p-8 rounded-[32px] border border-yellow-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none opacity-40"></div>
                <div className="relative z-10">
                    <h1 className="text-4xl font-[1000] text-slate-800 tracking-tighter uppercase mb-2">
                        {t('daybook.title')}
                    </h1>
                    <p className="text-slate-500 font-bold text-lg flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-emerald-600" />
                        {t('daybook.subtitle')}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                        <div className={cn(
                            "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border shadow-sm transition-all",
                            isBalanced 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                                : "bg-amber-50 text-amber-600 border-amber-100 animate-pulse"
                        )}>
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                isBalanced ? "bg-emerald-500" : "bg-amber-500"
                            )}></div>
                            {isBalanced ? "✅ " + t('daybook.verified') : "⚖️ " + t('daybook.imbalanced')}
                        </div>
                        <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm">
                            {t('daybook.engine_version')}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4 relative z-10">
                    <div className="flex bg-slate-100/80 backdrop-blur-md p-1 rounded-2xl border border-slate-200 shadow-sm">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("rounded-xl px-4 h-9 font-black text-xs uppercase tracking-wider", viewMode === 'cash' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800")}
                            onClick={() => setViewMode('cash')}
                        >
                            {t('daybook.cash_book')}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("rounded-xl px-4 h-9 font-black text-xs uppercase tracking-wider", viewMode === 'all' ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800")}
                            onClick={() => setViewMode('all')}
                        >
                            {t('daybook.all_ledger')}
                        </Button>
                    </div>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="flex-1 md:flex-none h-14 px-6 rounded-2xl border-slate-200 font-black text-sm text-slate-600 hover:bg-slate-50 gap-3 shadow-md border-t-2 print:border-none print:shadow-none print:px-0">
                                <CalendarIcon className="w-5 h-5 text-emerald-600" />
                                {format(date, 'PPP')}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-3xl overflow-hidden shadow-2xl border-none">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={(d) => d && setDate(d)}
                                initialFocus
                                className="font-bold"
                            />
                        </PopoverContent>
                    </Popover>

                    <Button 
                        variant="outline" 
                        onClick={() => window.print()}
                        className="h-14 px-6 rounded-2xl border-slate-200 font-black text-[10px] uppercase tracking-[0.2em] gap-2 shadow-md hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-all print:hidden"
                    >
                        <FileText className="w-4 h-4" /> PRINT
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => exportTransactionGroups(
                            filteredGroups,
                            `daybook_${viewMode}_${format(date, 'yyyy-MM-dd')}.csv`
                        )}
                        className="h-14 w-14 p-0 rounded-2xl border-slate-200 shadow-md hover:bg-indigo-50 hover:text-indigo-600 transition-all print:hidden"
                    >
                        <Download className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            {/* Data Health Banner — surfaces vouchers where Dr ≠ Cr. These are
                excluded from the summary KPIs below so one broken voucher can't
                inflate the totals, but they are still shown in the transaction
                table (with a ⚠️ badge) so the mandi owner can find and fix them. */}
            {summary.imbalancedCount > 0 && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5 flex items-start gap-4 print:hidden">
                    <div className="flex-shrink-0 mt-0.5">
                        <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-xl">⚠️</div>
                    </div>
                    <div className="flex-1">
                        <p className="font-black text-amber-800 text-sm uppercase tracking-wide">
                            {summary.imbalancedCount} voucher{summary.imbalancedCount === 1 ? '' : 's'} with broken double-entry
                        </p>
                        <p className="text-xs text-amber-700 font-medium mt-1 leading-relaxed">
                            These vouchers have Debit ≠ Credit (largest imbalance: ₹{Math.round(summary.imbalancedWorst).toLocaleString()}).
                            They are shown below with a ⚠️ marker but are <b>excluded from the summary totals</b> so your KPIs stay accurate.
                            Run <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-[10px]">scripts/audit-daybook-and-finance.sql</code> (Q1) to see the exact voucher IDs.
                        </p>
                    </div>
                </div>
            )}

            {/* Business Tycoon Analytics Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 print:grid-cols-4 print:gap-4">
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl hover:shadow-2xl transition-all relative overflow-hidden print:shadow-none print:border print:rounded-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400">📊 {t('daybook.sales_summary')}</span>
                        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 print:hidden"><Tag className="w-4 h-4" /></div>
                    </div>
                    <div className="text-3xl font-[1000] text-slate-800 tracking-tighter mb-4 print:text-xl print:mb-2">{t('common.currency_symbol')}{summary.sales.total.toLocaleString()}</div>
                    <div className="space-y-2 border-t border-slate-50 pt-3 print:pt-1">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400 font-bold">🟢 {t('daybook.sales_cash')}</span>
                            <span className="font-black text-emerald-600">{t('common.currency_symbol')}{(summary.sales.cash || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-400 font-bold">🔴 {t('daybook.sales_udhaar')}</span>
                            <span className="font-black text-rose-600">{t('common.currency_symbol')}{(summary.sales.credit || 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl hover:shadow-2xl transition-all relative overflow-hidden print:shadow-none print:border print:rounded-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400">📦 {t('daybook.purchase_insights')}</span>
                        <div className="p-2 bg-amber-50 rounded-xl text-amber-600 print:hidden"><ArrowUpRight className="w-4 h-4" /></div>
                    </div>
                    <div className="text-3xl font-[1000] text-slate-800 tracking-tighter mb-4 print:text-xl print:mb-2">{t('common.currency_symbol')}{summary.purchases.total.toLocaleString()}</div>
                    <div className="space-y-2 border-t border-slate-50 pt-3 print:pt-1">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400 font-bold">🟢 {t('daybook.purchase_cash')}</span>
                            <span className="font-black text-emerald-600">{t('common.currency_symbol')}{(summary.purchases.cash || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-400 font-bold">🔴 {t('daybook.purchase_udhaar')}</span>
                            <span className="font-black text-rose-600">{t('common.currency_symbol')}{(summary.purchases.credit || 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl hover:shadow-2xl transition-all relative overflow-hidden print:shadow-none print:border print:rounded-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400">💰 {t('daybook.liquid_assets')}</span>
                        <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600 print:hidden"><ArrowDownLeft className="w-4 h-4" /></div>
                    </div>
                    <div className="text-3xl font-[1000] text-slate-800 tracking-tighter mb-4 print:text-xl print:mb-2">{t('common.currency_symbol')}{(summary.cash.inflow - summary.cash.outflow + summary.digital.inflow - summary.digital.outflow).toLocaleString()}</div>
                    <div className="space-y-2 border-t border-slate-50 pt-3 print:pt-1">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400 font-bold">🟢 {t('daybook.inflow')}</span>
                            <span className="font-black text-emerald-600">{t('common.currency_symbol')}{(summary.cash.inflow + summary.digital.inflow).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400 font-bold">🔴 {t('daybook.outflow')}</span>
                            <span className="font-black text-rose-600">{t('common.currency_symbol')}{(summary.cash.outflow + summary.digital.outflow).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl hover:shadow-2xl transition-all relative overflow-hidden print:shadow-none print:border print:rounded-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400">🛠️ {t('daybook.daily_expenses')}</span>
                        <div className="p-2 bg-rose-50 rounded-xl text-rose-600 print:hidden"><Activity className="w-4 h-4" /></div>
                    </div>
                    <div className="text-3xl font-[1000] text-slate-800 tracking-tighter mb-4 print:text-xl print:mb-2">{t('common.currency_symbol')}{summary.expenses.toLocaleString()}</div>
                    <div className="space-y-1 border-t border-slate-50 pt-3 print:pt-1">
                        <p className="text-[10px] text-slate-400 leading-tight">{t('daybook.expenses_desc')}</p>
                    </div>
                </div>
            </div>

            {/* Transaction List */}
            {loading && transactionGroups.length === 0 ? (
                <div className="flex justify-center items-center h-64 bg-white/50 backdrop-blur-sm rounded-[32px] border border-slate-100 print:hidden">
                    <Loader2 className="animate-spin text-emerald-600 w-10 h-10" />
                </div>
            ) : (
                <div className="space-y-4 print:space-y-2">
                    {/* ── Tabs Bar ─────────────────────────────────── */}
                    {true && (
                        <div className="flex items-center gap-3 flex-wrap print:hidden">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">
                                Tabs:
                            </span>
                            {(
                                [
                                    { id: 'all',       label: '📋 All Transactions',  bg: 'bg-slate-800 text-white border-slate-800',           ghost: 'border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700' },
                                    { id: 'sales',     label: '📊 Sales Summary',     bg: 'bg-indigo-600 text-white border-indigo-600',          ghost: 'border-indigo-200 text-indigo-500 hover:border-indigo-400' },
                                    { id: 'purchases', label: '📦 Purchase Insights', bg: 'bg-amber-500 text-white border-amber-500',            ghost: 'border-amber-200 text-amber-600 hover:border-amber-400' },
                                    { id: 'liquid',    label: '💰 Liquid Assets',     bg: 'bg-emerald-600 text-white border-emerald-600',        ghost: 'border-emerald-200 text-emerald-600 hover:border-emerald-400' },
                                    { id: 'expenses',  label: '🛠️ Daily Expense',    bg: 'bg-rose-600 text-white border-rose-600',              ghost: 'border-rose-200 text-rose-500 hover:border-rose-400' },
                                ] as const
                            ).map((f) => (
                                <button
                                    key={f.id}
                                    onClick={() => setCashFilter(f.id)}
                                    className={cn(
                                        'px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider border-2 transition-all duration-200',
                                        cashFilter === f.id ? f.bg : f.ghost
                                    )}
                                >
                                    {f.label}
                                </button>
                            ))}
                            {cashFilter !== 'all' && (
                                <span className="ml-auto text-[10px] text-slate-400 font-bold">
                                    {transactionGroups.filter(g => {
                                    if (!(g as any).hasCash) return false;
                                    if (cashFilter === 'inflow')    return g.renderLegs.some((l: any) => (l.displayCredit || 0) > 0);
                                    if (cashFilter === 'outflow')   return g.renderLegs.some((l: any) => (l.displayDebit || 0) > 0 && ['purchase','payment','paid_receipt','expense_receipt'].includes(l.displayType));
                                    if (cashFilter === 'sales')     return g.summaryLegs.some((l: any) => l.displayType === 'sale' || l.displayType === 'sale_payment' || l.displayType === 'receipt' || l.displayType === 'receive_receipt');
                                    if (cashFilter === 'purchases') return g.summaryLegs.some((l: any) => l.displayType === 'purchase');
                                    return true;
                                }).length} results
                                </span>
                            )}
                        </div>
                    )}

                    <div className="overflow-hidden print:overflow-visible rounded-[40px] print:rounded-none shadow-xl print:shadow-none">
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-500 bg-slate-50/50 border-b border-slate-100">
                            <tr>
                                <th className="p-6 pl-8 flex items-center gap-2 font-black text-slate-800"><Clock className="w-4 h-4 text-slate-400" /> {t('daybook.table.time')}</th>
                                <th className="p-6 font-black text-slate-800">{t('daybook.table.particulars')}</th>
                                <th className="p-6 font-black text-slate-800">{t('daybook.table.type')}</th>
                                <th className="p-6 text-right">
                                    <div className="flex flex-col items-end">
                                        <span className="font-black text-slate-800 tracking-tight">DEBIT</span>
                                        <span className="text-[10px] font-bold text-slate-400 capitalize tracking-normal leading-tight">Goods Sold<br/>Money Paid</span>
                                    </div>
                                </th>
                                <th className="p-6 text-right pr-8">
                                    <div className="flex flex-col items-end">
                                        <span className="font-black text-slate-800 tracking-tight">CREDIT</span>
                                        <span className="text-[10px] font-bold text-slate-400 capitalize tracking-normal leading-tight text-right">Goods Received<br/>Money Received</span>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-transparent">
                            {filteredGroups.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-24 text-center">
                                        <div className="flex flex-col items-center gap-4 text-slate-300">
                                            <BookOpen className="w-16 h-16 opacity-20" />
                                            <p className="font-black uppercase tracking-[0.3em] text-sm">{t('daybook.no_transactions')}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredGroups.map((group, groupIdx) => {
                                const legs = [...(group.summaryLegs || [])];
                                return (
                                    <React.Fragment key={group.gid}>
                                        {legs.map((e, legIdx) => {
                                            const styles = getScenarioStyles(group.scenario);
                                            const isFirst = legIdx === 0;
                                            const isLast = legIdx === legs.length - 1;
                                            const borderClass = styles.border;

                                            return (
                                                <tr
                                                    key={e.id}
                                                    data-row-index={isFirst ? groupIdx : undefined}
                                                    className={cn(
                                                        "transition-all group border-none relative print:break-inside-avoid bg-white",
                                                        focusedIndex === groupIdx ? "brightness-95" : "",
                                                        e.status === 'reversed' ? "opacity-50 grayscale" : "hover:bg-slate-50/30"
                                                    )}
                                                >
                                                    <td className={cn(
                                                        "p-6 pl-8 text-slate-400 font-mono text-xs font-black border-t border-slate-100",
                                                        legIdx !== 0 && "border-t-0"
                                                    )}>
                                                        <span className={cn(legIdx !== 0 && "opacity-0 invisible")}>
                                                            {format(new Date(e.displayTimestamp || e.created_at || e.entry_date), 'h:mm a')}
                                                        </span>
                                                    </td>
                                                    <td className={cn(
                                                        "p-6 border-t border-slate-100",
                                                        legIdx !== 0 && "border-t-0"
                                                    )}>
                                                        <div className="flex flex-col">
                                                            <span className={cn("font-black text-slate-800 text-lg tracking-tight leading-none mb-1 inline-flex items-baseline gap-2 flex-wrap", e.status === 'reversed' && "line-through text-slate-500")}>
                                                                {e.status === 'reversed' && <span className="text-rose-500 mr-2 uppercase text-[10px] bg-rose-50 px-2 py-0.5 rounded-sm inline-block no-underline align-middle mb-1">{t('daybook.labels.reversed')}</span>}
                                                                
                                                                <span>{(e.displayDescription || e.description || e.voucher?.narration || t('daybook.descriptions.no_description')).replace(/(\d+)\.0+(?=\s|[A-Za-z]|$)/g, '$1')}</span>
                                                                {isFirst && e.displayNameLotPrefix && (
                                                                    <span className="text-[11px] font-bold tracking-wide text-slate-400">
                                                                        ({e.displayNameLotPrefix})
                                                                    </span>
                                                                )}
                                                            </span>
                                                            {(isFirst || !!e.contact?.name) && (
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                                                    {e.contact?.name || e.account?.name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className={cn(
                                                        "p-6 border-t border-slate-100",
                                                        legIdx !== 0 && "border-t-0"
                                                    )}>
                                                        <span className={cn(
                                                            "text-[9px] font-[1000] px-3 py-1 rounded-full uppercase tracking-widest border shadow-sm",
                                                            e.displayType === 'sale' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                            e.displayType === 'purchase' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                            'bg-slate-50 text-slate-500 border-slate-100'
                                                        )}>
                                                            {e.displayLabel}
                                                        </span>
                                                    </td>
                                                    <td className={cn(
                                                        "p-6 text-right font-mono font-[900] text-xl tracking-tighter border-t border-slate-100",
                                                        legIdx !== 0 && "border-t-0",
                                                        (e.displayDebit || 0) > 0 ? "text-slate-800" : "text-slate-100"
                                                    )}>
                                                        {(e.displayDebit || 0) > 0 ? (e.displayDebit).toLocaleString() : '-'}
                                                    </td>
                                                    <td className={cn(
                                                        "p-6 text-right pr-8 font-mono font-[900] text-xl tracking-tighter border-t border-slate-100",
                                                        legIdx !== 0 && "border-t-0",
                                                        (e.displayCredit || 0) > 0 ? "text-slate-800" : "text-slate-100"
                                                    )}>
                                                        {(e.displayCredit || 0) > 0 ? (e.displayCredit).toLocaleString() : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {/* Spacer Row and visual gap */}
                                        <tr className="h-4 border-none bg-transparent">
                                            <td colSpan={6} className="p-2"></td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                        {transactionGroups.length > 0 && (
                            <tfoot className="bg-slate-50/50 border-t-2 border-slate-200">
                                <tr>
                                    <td colSpan={4} className="p-6 pl-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('daybook.total_volume_for')} {format(date, 'PPP')}</td>
                                    <td className={cn("p-6 text-right font-mono font-black text-2xl", footerDebitTextClass)}>
                                        <span className="inline-flex items-center justify-end gap-2">
                                            <ArrowUpRight className="w-7 h-7" />
                                            <span>{t('common.currency_symbol')}{totalDebit.toLocaleString()}</span>
                                        </span>
                                    </td>
                                    <td className={cn("p-6 text-right font-mono font-black text-2xl pr-8", footerCreditTextClass)}>
                                        <span className="inline-flex items-center justify-end gap-2">
                                            <ArrowDownLeft className="w-7 h-7" />
                                            <span>{t('common.currency_symbol')}{totalCredit.toLocaleString()}</span>
                                        </span>
                                    </td>
                                </tr>
                                {/* Strict trial balance computed from the raw ledger (not UI-remapped).
                                    This is the line a mandi owner or auditor would check: Dr must equal Cr. */}
                                <tr className="border-t border-slate-200">
                                    <td colSpan={4} className="p-4 pl-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                        Trial Balance (ledger)
                                        <span className={cn(
                                            "ml-3 inline-block px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest align-middle",
                                            Math.abs(summary.rawDebit - summary.rawCredit) < 1
                                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                : "bg-amber-50 text-amber-700 border border-amber-200"
                                        )}>
                                            {Math.abs(summary.rawDebit - summary.rawCredit) < 1 ? '✓ Balanced' : `⚠️ Off by ${t('common.currency_symbol')}${Math.round(Math.abs(summary.rawDebit - summary.rawCredit)).toLocaleString()}`}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono font-black text-lg text-slate-600">
                                        {t('common.currency_symbol')}{Math.round(summary.rawDebit).toLocaleString()}
                                    </td>
                                    <td className="p-4 text-right pr-8 font-mono font-black text-lg text-slate-600">
                                        {t('common.currency_symbol')}{Math.round(summary.rawCredit).toLocaleString()}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                    </div>
                </div>
            )}
        </div>
    );
}
