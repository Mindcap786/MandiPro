import { describe, it, expect } from 'vitest';
import { calculateGrossRevenue, formatCurrency, calculateItemNetAmount } from './accounting-logic';

describe('Accounting Logic Tests', () => {

    describe('calculateGrossRevenue', () => {
        it('should return 0 for empty data', () => {
            expect(calculateGrossRevenue([])).toBe(0);
        });

        it('should correctly sum basic total amounts', () => {
            const data = [
                { total_amount: 1000 },
                { total_amount: 2000 },
            ];
            expect(calculateGrossRevenue(data)).toBe(3000);
        });

        it('should include all taxes and charges in the sum', () => {
            const data = [
                {
                    total_amount: 1000,
                    market_fee: 100,
                    nirashrit: 50,
                    misc_fee: 20,
                    loading_charges: 30,
                    unloading_charges: 30,
                    other_expenses: 10
                }
            ];
            // 1000 + 100 + 50 + 20 + 30 + 30 + 10 = 1240
            expect(calculateGrossRevenue(data)).toBe(1240);
        });

        it('should handle string inputs correctly', () => {
            const data = [
                { total_amount: "1000", market_fee: "100.50" }
            ];
            expect(calculateGrossRevenue(data)).toBe(1100.50);
        });

        it('should handle undefined or missing fields gracefully', () => {
            const data = [
                { total_amount: 1000, market_fee: undefined },
                { total_amount: 2000 }
            ];
            expect(calculateGrossRevenue(data)).toBe(3000);
        });
    });

    describe('formatCurrency', () => {
        it('should format numbers with Indian locale symbol', () => {
            const result = formatCurrency(100000);
            expect(result).toContain('₹');
            // Indian specific formatting (1,00,000)
            expect(result).toMatch(/1,00,000/);
        });
    });

    describe('calculateItemNetAmount', () => {
        it('should calculate base net amount correctly', () => {
            // 10kg * ₹50 = ₹500
            expect(calculateItemNetAmount(10, 50)).toBe(500);
        });

        it('should include commission in net amount', () => {
            // 100kg * ₹10 = 1000
            // 5% commission = 50
            // Total = 1050
            expect(calculateItemNetAmount(100, 10, 5)).toBe(1050);
        });

        it('should subtract discounts', () => {
            // 100kg * ₹10 = 1000
            // Discount = 200
            // Total = 800
            expect(calculateItemNetAmount(100, 10, 0, 200)).toBe(800);
        });
    });
});
