/**
 * Wraps a Supabase query (or any thenable) in a hard timeout so a hung
 * network / token refresh / slow RLS path can't trap the UI in an infinite
 * spinner. On timeout the returned shape mimics Supabase's {data,error}
 * contract so call sites handle it like any other failure.
 *
 * Read-only helper. Does not touch business logic, writes, or RLS.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export interface TimeoutResult<T> {
    data: T | null;
    error: { message: string; code?: string } | null;
    timedOut: boolean;
}

export async function fetchWithTimeout<T = any>(
    promise: PromiseLike<{ data: T | null; error: any }>,
    timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    label: string = 'fetch',
): Promise<TimeoutResult<T>> {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<TimeoutResult<T>>((resolve) => {
        timer = setTimeout(() => {
            resolve({
                data: null,
                error: { message: `${label} timed out after ${timeoutMs}ms`, code: 'CLIENT_TIMEOUT' },
                timedOut: true,
            });
        }, timeoutMs);
    });

    const wrapped = Promise.resolve(promise).then((res) => ({
        data: res?.data ?? null,
        error: res?.error ?? null,
        timedOut: false,
    }));

    try {
        return await Promise.race([wrapped, timeoutPromise]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
