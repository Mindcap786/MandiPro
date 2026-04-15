/**
 * packages/domain/src/index.ts
 *
 * Main export barrel for packages/domain.
 * Mobile (React Native/Expo) and Web import from this file.
 */

// Finance
export * from './finance/cheque-state-machine'
export * from './finance/ledger-engine'

// Arrivals
export * from './arrivals/commission-calculator'

// Sales
export * from './sales/invoice-totals'
