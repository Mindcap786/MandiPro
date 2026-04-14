import { describe, expect, it } from "vitest";
import {
    calculateArrivalSettlementAmount,
    calculateLotSettlementAmount,
} from "./purchase-payables";

describe("purchase payable helpers", () => {
    it("calculates direct purchase settlement without adding mandi costs", () => {
        const amount = calculateLotSettlementAmount({
            arrival_type: "direct",
            initial_qty: 100,
            supplier_rate: 20,
            less_percent: 10,
            farmer_charges: 50,
            packing_cost: 100,
            loading_cost: 100,
            advance: 200,
        });

        expect(amount).toBe(1550);
    });

    it("calculates commission settlement from actual sales, deductions, and advance", () => {
        const amount = calculateLotSettlementAmount({
            arrival_type: "commission",
            initial_qty: 100,
            supplier_rate: 20,
            less_percent: 10,
            farmer_charges: 50,
            packing_cost: 100,
            loading_cost: 50,
            transport_share: 25,
            advance: 200,
            commission_percent: 10,
            sale_items: [{ amount: 3000 }],
        });

        expect(amount).toBe(2275);
    });

    it("subtracts arrival-level expenses once per grouped inward", () => {
        const amount = calculateArrivalSettlementAmount(
            [
                {
                    arrival_type: "commission",
                    initial_qty: 100,
                    supplier_rate: 20,
                    commission_percent: 10,
                    sale_items: [{ amount: 3000 }],
                },
            ],
            {
                hire_charges: 100,
                hamali_expenses: 50,
                other_expenses: 25,
            }
        );

        expect(amount).toBe(2525);
    });
});
