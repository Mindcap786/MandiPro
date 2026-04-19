/**
 * hooks/mandi/useArrivals.ts
 *
 * Phase 10: Arrivals management hooks.
 * Centralizes arrival creation and interaction with the BFF (/api/mandi/arrivals).
 */
"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { CreateArrivalDTO } from "@mandi-pro/validation"

export function useArrivals() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [isCreating, setIsCreating] = useState(false)

  const createArrival = async (payload: CreateArrivalDTO) => {
    if (!profile?.organization_id) {
      toast({ title: "Session Expired", description: "Please log in again.", variant: "destructive" })
      return null
    }

    setIsCreating(true)
    try {
      const response = await fetch('/api/mandi/arrivals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || result.message || "Failed to create arrival")
      }

      toast({
        title: "Arrival Created",
        description: `Successfully recorded ${payload.items.length} lots for arrival.`,
      })

      return result
    } catch (err: any) {
      console.error("[useArrivals:create]", err)
      toast({
        title: "Creation Failed",
        description: err.message,
        variant: "destructive",
      })
      return null
    } finally {
      setIsCreating(false)
    }
  }

  return {
    createArrival,
    isCreating,
  }
}
