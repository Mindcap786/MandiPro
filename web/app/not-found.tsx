import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 text-slate-900 p-4">
            <div className="flex flex-col items-center gap-6 max-w-md text-center">
                <h2 className="text-4xl font-black tracking-tighter text-blue-600">404</h2>
                <div className="space-y-2">
                    <h3 className="text-2xl font-bold tracking-tight">Page Not Found</h3>
                    <p className="text-muted-foreground text-sm">
                        The page you are looking for does not exist or has been moved.
                    </p>
                </div>
                <Button asChild className="mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg">
                    <Link href="/">
                        Return Home
                    </Link>
                </Button>
            </div>
        </div>
    )
}
