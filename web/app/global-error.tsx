'use client'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <html>
            <body>
                <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
                    <h2>Something went wrong!</h2>
                    <p style={{ color: '#b00' }}>An unexpected error occurred. Please try again.</p>
                    {error.digest && (
                        <p style={{ fontSize: 12, color: '#666' }}>Reference: {error.digest}</p>
                    )}
                    <button onClick={() => reset()} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
                        Try again
                    </button>
                </div>
            </body>
        </html>
    )
}
