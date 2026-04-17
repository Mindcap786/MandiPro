/** @type {import('next').NextConfig} */
const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR === 'true'
const isVercel = process.env.VERCEL === '1'

const nextConfig = {
    reactStrictMode: false,

    // Project lives under ~/Desktop (iCloud-synced). iCloud evicts/renames files
    // inside .next mid-compile, corrupting the build. Put the build dir outside
    // the synced tree. Only applied for local dev/web builds, not Capacitor exports.
    // CRITICAL: Disable on Vercel as it fails if the build dir isn't .next
    ...(!isCapacitorBuild && !isVercel && { distDir: '/tmp/mandipro-next' }),

    // Skip linting and type-checking during production builds on Vercel
    // This ensures minor warnings or types don't kill the deployment.
    ...(isVercel && {
        eslint: { ignoreDuringBuilds: true },
        typescript: { ignoreBuildErrors: true },
    }),

    // Strip all console.* in prod builds, keep error/warn for Sentry
    compiler: {
        removeConsole:
            process.env.NODE_ENV === 'production'
                ? { exclude: ['error', 'warn'] }
                : false,
    },

    // Don't ship raw source to the browser in prod
    productionBrowserSourceMaps: false,

    // ── Package import optimization (tree-shake only used exports) ───────────
    // This alone cuts lucide-react, recharts, date-fns by 40-60%
    experimental: {
        serverComponentsExternalPackages: [
            '@capacitor/core', '@capacitor/app',
            '@capacitor/status-bar', '@capacitor/keyboard',
        ],
        optimizePackageImports: [
            'lucide-react',
            'recharts',
            'date-fns',
            '@radix-ui/react-icons',
        ],
    },

    // ── Shared Package Transpilation ────────────────────────────────────────
    // Next.js needs to be told to transpile code from sibling directories.
    transpilePackages: ['@mandi-pro/validation', '@mandi-pro/domain'],

    // Project lives under ~/Desktop which is synced by iCloud; the filesystem
    // webpack cache races with iCloud and corrupts .next. Use memory cache in dev.
    webpack: (config, { dev, isServer }) => {
        const path = require('path');

        // Force webpack to look for dependencies (like 'zod') in the web app's 
        // node_modules, even when resolving imports from sibling /packages folders.
        config.resolve.modules = [
            path.resolve(__dirname, 'node_modules'),
            'node_modules',
            ...(config.resolve.modules || []),
        ];

        // Dev: use memory cache to avoid iCloud corruption
        if (dev) {
            config.cache = { type: 'memory' }
        }

        // Server-only packages — never bundle into client JS
        // (nodemailer, pg, stripe, razorpay, pdf-parse are API-route-only)
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                net: false,
                tls: false,
                dns: false,
                child_process: false,
                'pg-native': false,
            }
        }

        // Prevent heavy server-only libs from leaking into client bundle
        config.externals = config.externals || []
        if (!isServer && Array.isArray(config.externals)) {
            // These are only used in /api routes — never needed client-side
            config.externals.push(
                'nodemailer', 'pg', 'razorpay', 'stripe',
                'pdf-parse', 'nodemailer'
            )
        }

        return config
    },

    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
                    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
                    {
                        key: 'Content-Security-Policy',
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://checkout.razorpay.com https://js.stripe.com https://typhoon.smepay.in https://www.googletagmanager.com https://www.google-analytics.com",
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                            "font-src 'self' https://fonts.gstatic.com data:",
                            "img-src 'self' data: blob: https:",
                            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://api.stripe.com https://typhoon.smepay.in https://www.google-analytics.com",
                            "frame-src 'self' https://checkout.razorpay.com https://js.stripe.com https://typhoon.smepay.in",
                            "object-src 'none'",
                            "base-uri 'self'",
                            "form-action 'self'",
                            "frame-ancestors 'self'",
                        ].join('; '),
                    },
                ],
            },
        ]
    },

    // ── CAPACITOR STATIC EXPORT ──────────────────────────────────────────
    // When building for iOS/Android, we export a fully static bundle.
    // The web deployment is UNAFFECTED — only set when NEXT_PUBLIC_CAPACITOR=true.
    ...(isCapacitorBuild && {
        output: 'export',      // Generates /out directory (Capacitor webDir)
        trailingSlash: true,   // Required: ensures all routes have index.html
        images: {
            unoptimized: true, // No Next.js image server in native WebView
        },
    }),
    // ─────────────────────────────────────────────────────────────────────
}

module.exports = nextConfig
