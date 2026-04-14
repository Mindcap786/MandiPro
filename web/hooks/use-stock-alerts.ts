import { useContext } from 'react'
import { StockAlertsProvider, useStockAlerts as useStockAlertsHook } from '@/components/alerts/StockAlertsProvider'

export type { StockAlert, AlertSeverity, AlertType } from '@/components/alerts/StockAlertsProvider'

/**
 * useStockAlerts - Consumer hook for global stock alerts state.
 * Now wraps the StockAlertsProvider context to ensure singleton realtime subscription.
 */
export function useStockAlerts() {
    return useStockAlertsHook();
}
