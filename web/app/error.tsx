'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const router = useRouter();

    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Global Error Boundary Caught:', error);
        console.error('Error message:', error?.message);
        console.error('Error stack:', error?.stack);
    }, [error]);

    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-[#09090b] text-white p-4">
            <div className="flex flex-col items-center gap-6 max-w-md text-center">
                <div className="rounded-full bg-red-500/10 p-4 ring-1 ring-red-500/20">
                    <AlertTriangle className="h-12 w-12 text-red-500" />
                </div>

                <div className="space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight">Something went wrong!</h2>
                    <p className="text-muted-foreground text-sm">
                        An unexpected error occurred. This has been logged and we are looking into it.
                    </p>
                    {error?.message && (
                        <code className="block mt-3 rounded bg-black/50 px-3 py-2 text-xs font-mono text-red-400 max-h-20 overflow-auto">
                            {error.message}
                        </code>
                    )}
                    {error.digest && (
                        <code className="block mt-2 rounded bg-black/50 px-2 py-1 text-xs font-mono text-gray-500">
                            Error ID: {error.digest}
                        </code>
                    )}
                </div>

                <div className="flex gap-4">
                    <Button
                        onClick={() => router.push('/')}
                        variant="outline"
                        className="border-white/10 hover:bg-white/5"
                    >
                        Go Home
                    </Button>
                    <Button
                        onClick={() => reset()}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        Try Again
                    </Button>
                </div>
            </div>
        </div>
    );
}
