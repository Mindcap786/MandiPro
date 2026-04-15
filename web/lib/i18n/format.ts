/**
 * format.ts
 * Pure, side-effect-free formatting utilities for MandiGrow.
 * All functions use the Indian number system and locale conventions.
 */

import type { SupportedLanguage } from './i18n-config';

/**
 * Formats a numeric amount in the Indian number system (₹ 1,00,000).
 * Always uses the en-IN locale for number formatting regardless of UI language,
 * since the Indian market standard is always used for financial figures.
 *
 * @param amount - The numeric amount to format
 * @param options - Optional override for Intl.NumberFormat options
 * @returns Formatted string e.g. "₹1,00,000"
 */
export function formatCurrency(
  amount: number,
  options?: Partial<Intl.NumberFormatOptions>
): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);
}

/**
 * Formats a Date object or ISO date string as DD/MM/YYYY.
 * This format is standard across all Indian locales in MandiGrow.
 *
 * @param date - A Date object, ISO date string, or timestamp
 * @param _lang - Language code (reserved for future locale-specific formats)
 * @returns Formatted date string e.g. "31/03/2026"
 */
export function formatDate(
  date: Date | string | number,
  _lang?: SupportedLanguage
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Formats a Date as a short month+year label, e.g. "Mar 2026".
 * Useful for chart axis labels.
 */
export function formatMonthYear(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/**
 * Formats a number compactly for display in stat cards.
 * e.g. 1500000 → "₹15L", 250000 → "₹2.5L", 1000 → "₹1K"
 */
export function formatCurrencyCompact(amount: number): string {
  if (Math.abs(amount) >= 1_00_00_000) {
    return `₹${(amount / 1_00_00_000).toFixed(1)}Cr`;
  }
  if (Math.abs(amount) >= 1_00_000) {
    return `₹${(amount / 1_00_000).toFixed(1)}L`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `₹${(amount / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(amount);
}
