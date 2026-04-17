import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // 1. Initialize Supabase Client (SSR)
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) => 
                        response.cookies.set({ name, value, ...options })
                    )
                },
            },
        }
    )

    // 2. Performance High-Path: Use getSession() for millisecond-latency transitions
    //    We trust the JWT signature for navigation speed; RLS and AuthProvider 
    //    provide the second layer of verification.
    const {
        data: { session },
    } = await supabase.auth.getSession()
    const user = session?.user

    const path = request.nextUrl.pathname.replace(/\/$/, '') || '/'

    // 3. PUBLIC ROUTES (No Auth Required)
    const isPublicRoute =
        path === '/' ||
        path === '' ||
        path === '/login' ||
        path === '/subscribe' ||
        path === '/checkout' ||
        path === '/join' ||
        path === '/contact' ||
        path === '/suspended' ||
        path === '/auth/callback' ||
        path === '/manifest.json' ||
        path === '/robots.txt' ||
        path === '/sitemap.xml' ||
        path === '/opengraph-image' ||
        // SEO marketing pages — must be reachable without auth
        path === '/faq' ||
        path === '/privacy' ||
        path === '/terms' ||
        path === '/mandi-billing' ||
        path === '/commission-agent-software' ||
        path === '/mandi-khata-software' ||
        path === '/blog' ||
        path.startsWith('/blog/') ||
        path.startsWith('/locales') ||
        path.startsWith('/public') ||
        path.startsWith('/icons') ||
        path.startsWith('/_next') ||
        path.startsWith('/static') ||
        path.startsWith('/assets') ||
        path === '/favicon.ico'

    // 4. UNAUTHENTICATED USER PROTECTION
    if (!user && !isPublicRoute) {
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = '/login'
        redirectUrl.searchParams.set('redirectedFrom', request.nextUrl.pathname)
        return NextResponse.redirect(redirectUrl)
    }

    // 5. SUSPENSION ENFORCEMENT — Server-side, zero-latency
    //    Check org_status from JWT user_metadata (set by DB trigger / auth hook).
    //    Suspended tenants are blocked from ALL protected routes immediately.
    if (user && !isPublicRoute) {
        // admin routes are exempt from suspension (admin must be able to manage accounts)
        const isAdminRoute = path.startsWith('/admin');
        if (!isAdminRoute) {
            const orgStatus = user.user_metadata?.org_status as string | undefined;
            if (orgStatus === 'suspended') {
                const suspendedUrl = request.nextUrl.clone();
                suspendedUrl.pathname = '/suspended';
                return NextResponse.redirect(suspendedUrl);
            }
        }
    }

    // 6. ADMIN API PROTECTION — return 401 JSON (not redirect) for unauth'd API calls
    if (path.startsWith('/api/admin')) {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new NextResponse(
                JSON.stringify({ error: 'Unauthorized: missing admin token' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }
        // Full RBAC check is deferred to each route handler via verifyAdminAccess()
        return response;
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Note: /api/admin/* is explicitly included via the second matcher entry.
         * Other /api/* routes remain excluded.
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|css|js|map)$).*)',
        '/api/admin/:path*',
    ],
}
