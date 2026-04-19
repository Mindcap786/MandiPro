/**
 * hooks/mandi/useMandiSession.ts
 *
 * Hook for the Mandi Commission single-screen module.
 * Manages:
 *  - Creating / saving a draft session
 *  - Committing the session (atomically creates arrivals + sale)
 *  - Fetching recent sessions for the bills display
 */
"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

const SCHEMA = "mandi";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface MandiSessionFarmerRow {
    id?: string;           // local UUID before commit
    farmerId: string;
    farmerName: string;
    itemId: string;
    itemName: string;
    variety: string;
    grade: string;
    qty: number;
    unit: string;
    rate: number;
    lessPercent: number;
    lessUnits: number;
    loadingCharges: number;
    otherCharges: number;
    commissionPercent: number;
    // Computed (local, instant)
    grossAmount: number;
    lessAmount: number;
    netAmount: number;
    commissionAmount: number;
    netPayable: number;
    netQty: number;
}

export interface MandiSessionInput {
    organizationId: string;
    sessionDate: string; // 'YYYY-MM-DD'
    lotNo: string;
    vehicleNo: string;
    bookNo: string;
    farmers: MandiSessionFarmerRow[];
    buyerId: string | null;
    buyerName?: string;
    buyerLoadingCharges: number;
    buyerPackingCharges: number;
    totalNetQty: number;
    saleRate: number;
    buyerPayable: number;
}

export interface MandiSessionResult {
    sessionId: string;
    purchaseBillIds: string[];
    saleBillId: string | null;
    totalCommission: number;
    totalPurchase: number;
    totalNetQty: number;
}

// ─────────────────────────────────────────────────────────────
// Calculation engine (pure, <100ms)
// ─────────────────────────────────────────────────────────────
export function computeFarmerRow(row: Partial<MandiSessionFarmerRow>): Partial<MandiSessionFarmerRow> {
    const qty = Number(row.qty) || 0;
    const rate = Number(row.rate) || 0;
    const commPct = Number(row.commissionPercent) || 0;
    const loadingCharges = Number(row.loadingCharges) || 0;
    const otherCharges = Number(row.otherCharges) || 0;

    let lessUnits = Number(row.lessUnits) || 0;
    let lessPercent = Number(row.lessPercent) || 0;

    // Bidirectional Less logic
    if (row._lastEdited === "lessPercent" && lessPercent > 0) {
        lessUnits = parseFloat((qty * lessPercent / 100).toFixed(3));
    } else if (row._lastEdited === "lessUnits" && lessUnits > 0) {
        lessPercent = qty > 0 ? parseFloat((lessUnits / qty * 100).toFixed(2)) : 0;
    }

    const netQty = Math.max(qty - lessUnits, 0);
    const grossAmount = parseFloat((qty * rate).toFixed(2));
    const lessAmount = parseFloat((lessUnits * rate).toFixed(2));
    const netAmount = parseFloat((netQty * rate).toFixed(2));
    const commissionAmount = parseFloat((netAmount * commPct / 100).toFixed(2));
    const netPayable = parseFloat(
        (netAmount - commissionAmount - loadingCharges - otherCharges).toFixed(2)
    );

    return {
        ...row,
        lessUnits,
        lessPercent,
        netQty,
        grossAmount,
        lessAmount,
        netAmount,
        commissionAmount,
        netPayable,
    };
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export function useMandiSession() {
    const { toast } = useToast();
    const [isCommitting, setIsCommitting] = useState(false);

    /**
     * commitSession — creates all records atomically via RPC.
     */
    const commitSession = useCallback(
        async (input: MandiSessionInput): Promise<MandiSessionResult | null> => {
            setIsCommitting(true);
            try {
                // 1. Create the session header
                const { data: sessionData, error: sessionErr } = await supabase
                    .schema(SCHEMA)
                    .from("mandi_sessions")
                    .insert({
                        organization_id: input.organizationId,
                        session_date: input.sessionDate,
                        lot_no: input.lotNo || null,
                        vehicle_no: input.vehicleNo || null,
                        book_no: input.bookNo || null,
                        buyer_id: input.buyerId || null,
                        buyer_loading_charges: input.buyerLoadingCharges,
                        buyer_packing_charges: input.buyerPackingCharges,
                        buyer_payable: input.buyerPayable,
                        status: "draft",
                    })
                    .select("id")
                    .single();

                if (sessionErr || !sessionData) {
                    throw new Error(sessionErr?.message || "Failed to create session");
                }

                const sessionId = sessionData.id;

                // 2. Insert all farmer rows
                const farmerInserts = input.farmers.map((f, idx) => ({
                    session_id: sessionId,
                    organization_id: input.organizationId,
                    sort_order: idx,
                    farmer_id: f.farmerId || null,
                    farmer_name: f.farmerName,
                    item_id: f.itemId || null,
                    item_name: f.itemName,
                    variety: f.variety || null,
                    grade: f.grade || "A",
                    qty: f.qty,
                    unit: f.unit,
                    rate: f.rate,
                    less_percent: f.lessPercent,
                    less_units: f.lessUnits,
                    loading_charges: f.loadingCharges,
                    other_charges: f.otherCharges,
                    commission_percent: f.commissionPercent,
                    gross_amount: f.grossAmount,
                    less_amount: f.lessAmount,
                    net_amount: f.netAmount,
                    commission_amount: f.commissionAmount,
                    net_payable: f.netPayable,
                    net_qty: f.netQty,
                }));

                const { error: farmersErr } = await supabase
                    .schema(SCHEMA)
                    .from("mandi_session_farmers")
                    .insert(farmerInserts);

                if (farmersErr) {
                    throw new Error(farmersErr.message || "Failed to save farmer rows");
                }

                // 3. Commit session via RPC
                const { data: rpcData, error: rpcErr } = await supabase.rpc(
                    "commit_mandi_session" as any,
                    { p_session_id: sessionId }
                );

                if (rpcErr) {
                    throw new Error(rpcErr.message || "RPC commit failed");
                }

                const result = rpcData as any;

                if (!result?.success) {
                    throw new Error(result?.error || "Session commit returned failure");
                }

                return {
                    sessionId,
                    purchaseBillIds: result.purchase_bill_ids || [],
                    saleBillId: result.sale_bill_id || null,
                    totalCommission: result.total_commission || 0,
                    totalPurchase: result.total_purchase || 0,
                    totalNetQty: result.total_net_qty || 0,
                };
            } catch (err: any) {
                console.error("[useMandiSession] commitSession error:", err);
                toast({
                    title: "Commit Failed",
                    description: err.message || "Unknown error",
                    variant: "destructive",
                });
                return null;
            } finally {
                setIsCommitting(false);
            }
        },
        [toast]
    );

    /**
     * fetchSessionDetail — loads a committed session for the bills view.
     */
    const fetchSessionDetail = useCallback(async (sessionId: string) => {
        const { data, error } = await supabase
            .schema(SCHEMA)
            .from("view_mandi_session_summary" as any)
            .select("*")
            .eq("session_id", sessionId)
            .single();

        if (error) {
            console.error("[useMandiSession] fetchSessionDetail:", error);
            return null;
        }
        return data;
    }, []);

    /**
     * fetchRecentSessions — loads recent sessions for history tab.
     */
    const fetchRecentSessions = useCallback(async (orgId: string, limit = 20) => {
        const { data, error } = await supabase
            .schema(SCHEMA)
            .from("mandi_sessions")
            .select("id, session_date, lot_no, vehicle_no, book_no, status, total_purchase, total_commission, buyer_payable, buyer_id")
            .eq("organization_id", orgId)
            .eq("status", "committed")
            .order("session_date", { ascending: false })
            .limit(limit);

        if (error) return [];
        return data || [];
    }, []);

    return {
        isCommitting,
        commitSession,
        fetchSessionDetail,
        fetchRecentSessions,
    };
}
