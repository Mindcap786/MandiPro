"use client";

import React, { useRef, useCallback } from "react";
import { Trash2, User, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MandiSessionFarmerRow, computeFarmerRow } from "@/hooks/mandi/useMandiSession";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface FarmerOption {
    id: string;
    name: string;
    city?: string;
}

interface ItemOption {
    id: string;
    name: string;
    variety?: string;
    grade?: string;
    default_unit?: string;
    custom_attributes?: Record<string, any>;
}

interface FarmerRowProps {
    index: number;
    row: MandiSessionFarmerRow;
    farmers: FarmerOption[];
    items: ItemOption[];
    defaultCommissionPercent: number;
    units: string[];
    canDelete: boolean;
    onUpdate: (index: number, updated: Partial<MandiSessionFarmerRow>) => void;
    onDelete: (index: number) => void;
    onEnterLast: () => void; // called when Enter pressed on last field
    isLastRow: boolean;
}

// ─────────────────────────────────────────────────────────────
// Helper: label for a cell
// ─────────────────────────────────────────────────────────────
function CellLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 leading-none">
            {children}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// FarmerRow Component
// ─────────────────────────────────────────────────────────────
export function FarmerRow({
    index,
    row,
    farmers,
    items,
    defaultCommissionPercent,
    units,
    canDelete,
    onUpdate,
    onDelete,
    onEnterLast,
    isLastRow,
}: FarmerRowProps) {

    // Build label for item search: "Mango", "Mango – Grade A – Banganapalli"
    const buildItemLabel = (item: ItemOption) => {
        const parts = [item.name];
        if (item.variety) parts.push(item.variety);
        if (item.grade && item.grade !== "A") parts.push(`Gr.${item.grade}`);
        return parts.join(" – ");
    };

    const handleChange = useCallback(
        (field: keyof MandiSessionFarmerRow, value: any, editedField?: "lessPercent" | "lessUnits") => {
            const patch: Partial<MandiSessionFarmerRow> & { _lastEdited?: string } = {
                [field]: value,
                _lastEdited: editedField,
            };
            const computed = computeFarmerRow({ ...row, ...patch });
            onUpdate(index, computed as Partial<MandiSessionFarmerRow>);
        },
        [row, index, onUpdate]
    );

    const handleFarmerSelect = useCallback(
        (farmerId: string) => {
            const farmer = farmers.find((f) => f.id === farmerId);
            onUpdate(index, {
                farmerId,
                farmerName: farmer?.name || "",
            });
        },
        [farmers, index, onUpdate]
    );

    const handleItemSelect = useCallback(
        (itemId: string) => {
            const item = items.find((i) => i.id === itemId);
            const computed = computeFarmerRow({
                ...row,
                itemId,
                itemName: item?.name || "",
                variety: item?.variety || "",
                grade: item?.grade || "A",
                unit: item?.default_unit || row.unit || "Kg",
            });
            onUpdate(index, computed as Partial<MandiSessionFarmerRow>);
        },
        [items, row, index, onUpdate]
    );

    // Enter key on last editable field → add new row
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>, isLast: boolean) => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (isLast && isLastRow) {
                    onEnterLast();
                } else {
                    // Focus next input in row
                    const form = (e.target as HTMLElement).closest("[data-farmer-row]");
                    if (form) {
                        const inputs = Array.from(
                            form.querySelectorAll("input:not([disabled]), select:not([disabled])")
                        ) as HTMLElement[];
                        const idx = inputs.indexOf(e.target as HTMLElement);
                        if (idx !== -1 && idx < inputs.length - 1) {
                            inputs[idx + 1].focus();
                        }
                    }
                }
            }
        },
        [isLastRow, onEnterLast]
    );

    const inputCls = "h-8 text-sm font-bold text-slate-900 bg-white border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 rounded-lg px-2 transition-all";
    const dimCls = "h-8 text-sm font-bold text-slate-500 bg-slate-50 border-slate-100 rounded-lg px-2";
    const readOnlyCls = "h-8 text-sm font-black rounded-lg px-2 text-emerald-700 bg-emerald-50 border-emerald-100 text-right";

    return (
        <div
            data-farmer-row
            className="grid gap-1.5 p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group"
            style={{
                gridTemplateColumns: "28px 1fr 1.4fr 80px 80px 90px 90px 80px 70px 70px 76px 100px 28px",
            }}
        >
            {/* S.No */}
            <div className="flex items-center justify-center">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-black">
                    {index + 1}
                </span>
            </div>

            {/* Farmer */}
            <div>
                <CellLabel>Farmer</CellLabel>
                <SearchableSelect
                    options={farmers.map((f) => ({
                        label: `${f.name}${f.city ? ` (${f.city})` : ""}`,
                        value: f.id,
                    }))}
                    value={row.farmerId}
                    onChange={handleFarmerSelect}
                    placeholder="Search farmer..."
                    className="h-8 text-sm font-bold border-slate-200"
                />
            </div>

            {/* Item */}
            <div>
                <CellLabel>Item / Variety / Grade</CellLabel>
                <SearchableSelect
                    options={items.map((i) => ({
                        label: buildItemLabel(i),
                        value: i.id,
                    }))}
                    value={row.itemId}
                    onChange={handleItemSelect}
                    placeholder="Search item..."
                    className="h-8 text-sm font-bold border-slate-200"
                />
            </div>

            {/* Qty */}
            <div>
                <CellLabel>Qty</CellLabel>
                <Input
                    type="number"
                    min={0}
                    step="any"
                    value={row.qty || ""}
                    onChange={(e) => handleChange("qty", parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => handleKeyDown(e, false)}
                    className={inputCls}
                    placeholder="0"
                />
            </div>

            {/* Unit */}
            <div>
                <CellLabel>Unit</CellLabel>
                <select
                    value={row.unit || "Kg"}
                    onChange={(e) => handleChange("unit", e.target.value)}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-900 px-2 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                >
                    {units.map((u) => (
                        <option key={u} value={u}>{u}</option>
                    ))}
                </select>
            </div>

            {/* Rate */}
            <div>
                <CellLabel>Rate (₹)</CellLabel>
                <Input
                    type="number"
                    min={0}
                    step="any"
                    value={row.rate || ""}
                    onChange={(e) => handleChange("rate", parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => handleKeyDown(e, false)}
                    className={inputCls}
                    placeholder="0.00"
                />
            </div>

            {/* Less % */}
            <div>
                <CellLabel>Less %</CellLabel>
                <Input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={row.lessPercent || ""}
                    onChange={(e) =>
                        handleChange("lessPercent", parseFloat(e.target.value) || 0, "lessPercent")
                    }
                    onKeyDown={(e) => handleKeyDown(e, false)}
                    className={inputCls}
                    placeholder="0"
                />
            </div>

            {/* Less Wt */}
            <div>
                <CellLabel>Less Wt</CellLabel>
                <Input
                    type="number"
                    min={0}
                    step="any"
                    value={row.lessUnits || ""}
                    onChange={(e) =>
                        handleChange("lessUnits", parseFloat(e.target.value) || 0, "lessUnits")
                    }
                    onKeyDown={(e) => handleKeyDown(e, false)}
                    className={inputCls}
                    placeholder="0"
                />
            </div>

            {/* Loading */}
            <div>
                <CellLabel>Loading</CellLabel>
                <Input
                    type="number"
                    min={0}
                    step="any"
                    value={row.loadingCharges || ""}
                    onChange={(e) => handleChange("loadingCharges", parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => handleKeyDown(e, false)}
                    className={inputCls}
                    placeholder="0"
                />
            </div>

            {/* Other */}
            <div>
                <CellLabel>Other</CellLabel>
                <Input
                    type="number"
                    min={0}
                    step="any"
                    value={row.otherCharges || ""}
                    onChange={(e) => handleChange("otherCharges", parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => handleKeyDown(e, false)}
                    className={inputCls}
                    placeholder="0"
                />
            </div>

            {/* Comm % */}
            <div>
                <CellLabel>Comm %</CellLabel>
                <Input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={row.commissionPercent || ""}
                    onChange={(e) => handleChange("commissionPercent", parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => handleKeyDown(e, false)}
                    className={inputCls}
                    placeholder={String(defaultCommissionPercent)}
                />
            </div>

            {/* Net Payable (read-only) */}
            <div>
                <CellLabel>Net Payable</CellLabel>
                <div className={readOnlyCls + " flex items-center justify-end"}>
                    ₹{(row.netPayable || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </div>
                <div className="text-[9px] text-slate-400 text-right mt-0.5 font-mono">
                    {(row.netQty || 0).toFixed(0)} {row.unit}
                </div>
            </div>

            {/* Delete */}
            <div className="flex items-center justify-center mt-3">
                {canDelete && (
                    <button
                        type="button"
                        onClick={() => onDelete(index)}
                        className="w-7 h-7 flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                        title="Remove row"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Column Headers
// ─────────────────────────────────────────────────────────────
export function FarmerRowHeaders() {
    const hdrCls = "text-[9px] font-black uppercase tracking-widest text-slate-400 px-2 py-1";
    return (
        <div
            className="grid gap-1.5 px-3 pb-1"
            style={{
                gridTemplateColumns: "28px 1fr 1.4fr 80px 80px 90px 90px 80px 70px 70px 76px 100px 28px",
            }}
        >
            <div />
            <div className={hdrCls}>Farmer</div>
            <div className={hdrCls}>Item / Variety / Grade</div>
            <div className={hdrCls}>Qty</div>
            <div className={hdrCls}>Unit</div>
            <div className={hdrCls}>Rate</div>
            <div className={hdrCls}>Less%</div>
            <div className={hdrCls}>Less Wt</div>
            <div className={hdrCls}>Loading</div>
            <div className={hdrCls}>Other</div>
            <div className={hdrCls}>Comm%</div>
            <div className={hdrCls + " text-right"}>Net Payable</div>
            <div />
        </div>
    );
}
