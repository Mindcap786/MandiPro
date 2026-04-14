'use client'

import { useAuth } from '@/components/auth/auth-provider'
import { useOfflineSync } from '@/lib/hooks/use-offline-sync'

export function OfflineSyncManager() {
    const { profile } = useAuth()

    // Mount the sync hook with the active organization ID
    // This ensures that whenever the app is open, we are attempting to sync pending data
    useOfflineSync(profile?.organization_id)

    return null
}
