/**
 * useIdleTimeout
 *
 * Tracks user activity (mouse, keyboard, scroll, touch) and fires a callback
 * after a configurable idle period. Optionally fires a warning callback before
 * the final timeout so the UI can show a "You'll be logged out" countdown.
 *
 * Used by AuthProvider to auto-logout after 10 minutes of complete inactivity.
 *
 * Rules:
 * - Only active when `enabled` is true (i.e. user is logged in and on a protected page)
 * - Any of: mousemove, mousedown, keydown, scroll, touchstart, click resets the timer
 * - Document visibility changes count too — returning to a tab resets the timer
 * - Uses a single interval for the countdown display (no drift)
 */

import { useEffect, useRef, useCallback } from 'react'

const ACTIVITY_EVENTS = [
    'mousemove',
    'mousedown',
    'keydown',
    'scroll',
    'touchstart',
    'click',
    'visibilitychange',
] as const

interface UseIdleTimeoutOptions {
    /** Total idle time (ms) before onTimeout fires. Default: 10 minutes */
    idleMs?: number
    /** How many ms before timeout to fire onWarning. Default: 60 seconds */
    warningMs?: number
    /** Called when idle timeout is reached → should call signOut() */
    onTimeout: () => void
    /** Called when warning window begins (idleMs - warningMs remaining) */
    onWarning: (secondsLeft: number) => void
    /** Called when user activity resets the timer (cancels any active warning) */
    onReset: () => void
    /** Set to false to pause the timer (e.g. when user is signed out or on public pages) */
    enabled: boolean
}

export function useIdleTimeout({
    idleMs = 10 * 60 * 1000,   // 10 minutes
    warningMs = 60 * 1000,      // warn 1 minute before
    onTimeout,
    onWarning,
    onReset,
    enabled,
}: UseIdleTimeoutOptions) {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const warningActiveRef = useRef(false)

    const clearAll = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current)
        if (countdownRef.current) clearInterval(countdownRef.current)
        timeoutRef.current = null
        warningTimeoutRef.current = null
        countdownRef.current = null
    }, [])

    const startCountdown = useCallback((secondsLeft: number) => {
        onWarning(secondsLeft)
        let remaining = secondsLeft
        countdownRef.current = setInterval(() => {
            remaining -= 1
            if (remaining <= 0) {
                if (countdownRef.current) clearInterval(countdownRef.current)
                return
            }
            onWarning(remaining)
        }, 1000)
    }, [onWarning])

    const resetTimer = useCallback(() => {
        if (!enabled) return

        clearAll()

        // If we were in warning state, notify the caller so the UI can dismiss the warning
        if (warningActiveRef.current) {
            warningActiveRef.current = false
            onReset()
        }

        // Schedule the warning (fires idleMs - warningMs after last activity)
        const warningDelay = idleMs - warningMs
        warningTimeoutRef.current = setTimeout(() => {
            warningActiveRef.current = true
            startCountdown(Math.ceil(warningMs / 1000))
        }, warningDelay)

        // Schedule the actual logout (fires idleMs after last activity)
        timeoutRef.current = setTimeout(() => {
            clearAll()
            warningActiveRef.current = false
            onTimeout()
        }, idleMs)
    }, [enabled, idleMs, warningMs, clearAll, startCountdown, onTimeout, onReset])

    useEffect(() => {
        if (!enabled) {
            clearAll()
            warningActiveRef.current = false
            return
        }

        // Start the timer immediately on mount / when enabled becomes true
        resetTimer()

        // Attach all activity listeners to the document
        const handleActivity = () => resetTimer()

        ACTIVITY_EVENTS.forEach(event => {
            document.addEventListener(event, handleActivity, { passive: true })
        })

        return () => {
            ACTIVITY_EVENTS.forEach(event => {
                document.removeEventListener(event, handleActivity)
            })
            clearAll()
        }
    }, [enabled, resetTimer, clearAll])
}
