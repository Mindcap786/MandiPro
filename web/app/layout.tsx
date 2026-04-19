import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import './mobile-native.css'
import { AuthProvider } from '@/components/auth/auth-provider'
import { Toaster } from "@/components/ui/toaster"
import { OfflineSyncManager } from '@/components/layout/offline-sync-manager'
import { SubscriptionEnforcer } from '@/components/layout/subscription-enforcer'
import { LanguageProvider } from '@/components/i18n/language-provider'
import { ShortcutProvider } from '@/components/providers/shortcut-provider'
import { ImpersonationBanner } from '@/components/admin/impersonation-banner'
import { PaymentReminderBanner } from '@/components/layout/payment-reminder-banner'
import { KeyboardHelpOverlay } from '@/components/layout/keyboard-help-overlay'
// ── Capacitor Native Shell ────────────────────────────────────────────────────
import { CapacitorProvider } from '@/components/capacitor/capacitor-provider'
import { NativeAuthGuard } from '@/components/capacitor/native-auth-guard'
// ─────────────────────────────────────────────────────────────────────────────

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
    metadataBase: new URL('https://www.mandigrow.com'),
    title: {
        default: 'Mandi ERP Software for Fruits & Vegetable Traders | MandiGrow',
        template: '%s | MandiGrow',
    },
    description:
        "MandiGrow is India's #1 mandi ERP software for fruits & vegetable merchants. GST billing, khata, commission, stock & reports. Free demo today.",
    applicationName: 'MandiGrow',
    keywords: [
        'mandi ERP software',
        'fruits and vegetable ERP',
        'mandi software India',
        'vegetable merchant software',
        'fruits vegetable accounting software',
        'commission agent software mandi',
        'mandi khata software',
        'Tally alternative for mandi',
        'Zoho alternative for vegetable traders',
        'sabzi mandi ERP software',
        'fruit mandi billing software',
    ],
    authors: [{ name: 'MandiGrow', url: 'https://www.mandigrow.com' }],
    creator: 'MandiGrow',
    publisher: 'MandiGrow',
    manifest: '/manifest.json',
    alternates: {
        canonical: 'https://www.mandigrow.com',
        // NOTE: hreflang entries removed until real /hi /ta /te /kn /ml routes
        // exist. Lying to Google about alternates is worse than omitting them.
    },
    openGraph: {
        type: 'website',
        url: 'https://www.mandigrow.com',
        siteName: 'MandiGrow',
        title: 'Mandi ERP Software for Fruits & Vegetable Traders | MandiGrow',
        description:
            "India's #1 mandi ERP for fruits & vegetable merchants. GST billing, mandi khata, commission, stock & reports — in Hindi & English.",
        locale: 'en_IN',
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: 'MandiGrow — Mandi ERP for Fruits & Vegetable Traders',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Mandi ERP Software for Fruits & Vegetable Traders | MandiGrow',
        description:
            "India's #1 mandi ERP for fruits & vegetable merchants. GST billing, khata, commission, stock & reports.",
        images: ['/og-image.png'],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-snippet': -1,
            'max-image-preview': 'large',
            'max-video-preview': -1,
        },
    },
    category: 'Business Software',
}

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: '#050510',
    // CRITICAL for iOS: enables env(safe-area-inset-*) CSS variables for notch/Dynamic Island
    viewportFit: 'cover',
    // Android 13+ Chromium WebView: resize layout viewport when keyboard shows,
    // so dvh / inner height reflect the available space instead of overlaying.
    interactiveWidget: 'resizes-content',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        // lang and dir are managed dynamically by LanguageProvider's useEffect
        // They default to 'en' / 'ltr' and update on client after hydration
        <html lang="en" dir="ltr" className="light">
            <head>
                {/* Preconnect to Google Fonts for Indic / Urdu script support */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                {/* Organization schema */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@type': 'Organization',
                            name: 'MandiGrow',
                            url: 'https://www.mandigrow.com',
                            logo: 'https://www.mandigrow.com/logo.png',
                            description:
                                "India's #1 mandi ERP software for fruits and vegetable merchants, commission agents and wholesale traders.",
                            sameAs: [
                                'https://www.facebook.com/mandigrow',
                                'https://twitter.com/mandigrow',
                                'https://www.linkedin.com/company/mandigrow',
                                'https://www.instagram.com/mandigrow',
                                'https://www.youtube.com/@mandigrow',
                            ],
                            contactPoint: {
                                '@type': 'ContactPoint',
                                contactType: 'customer support',
                                areaServed: 'IN',
                                availableLanguage: ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam'],
                            },
                        }),
                    }}
                />
                {/* BreadcrumbList schema (homepage root) */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@type': 'BreadcrumbList',
                            itemListElement: [
                                {
                                    '@type': 'ListItem',
                                    position: 1,
                                    name: 'Home',
                                    item: 'https://www.mandigrow.com',
                                },
                            ],
                        }),
                    }}
                />
                {/* FAQPage schema — sourced from the homepage FAQ */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@type': 'FAQPage',
                            mainEntity: [
                                {
                                    '@type': 'Question',
                                    name: 'What is the best mandi ERP software in India?',
                                    acceptedAnswer: {
                                        '@type': 'Answer',
                                        text: 'MandiGrow is widely considered the best mandi ERP software in India because it is built specifically for fruits and vegetable merchants, commission agents and wholesale traders. Unlike generic tools, it handles lots, crates, weight, commission, market fees and khata natively in both Hindi and English.',
                                    },
                                },
                                {
                                    '@type': 'Question',
                                    name: 'Is MandiGrow better than Tally for fruits and vegetable traders?',
                                    acceptedAnswer: {
                                        '@type': 'Answer',
                                        text: 'Yes. Tally is a general accounting tool, while MandiGrow is a complete fruits and vegetable ERP. You get everything Tally offers — ledgers, GST, daybook — plus mandi-specific features like commission auto-calculation, lot tracking, wastage and farmer settlements.',
                                    },
                                },
                                {
                                    '@type': 'Question',
                                    name: 'Can MandiGrow handle commission agent accounts?',
                                    acceptedAnswer: {
                                        '@type': 'Answer',
                                        text: 'Yes. MandiGrow is a full commission agent software for mandi businesses. It auto-calculates commission, market fees and hamali for every sale, posts entries to khatas instantly, and generates party-wise settlement reports in one click.',
                                    },
                                },
                                {
                                    '@type': 'Question',
                                    name: 'Does MandiGrow support GST billing for vegetable wholesalers?',
                                    acceptedAnswer: {
                                        '@type': 'Answer',
                                        text: 'Yes. MandiGrow generates GST-compliant invoices, supports B2B and B2C billing, and is ready for e-invoicing. You can file GSTR-1 and GSTR-3B faster because all your sales and purchase data is already organized.',
                                    },
                                },
                                {
                                    '@type': 'Question',
                                    name: 'Is MandiGrow available in Hindi and regional languages?',
                                    acceptedAnswer: {
                                        '@type': 'Answer',
                                        text: 'Yes. MandiGrow ships fully bilingual and supports Hindi, English, Tamil, Telugu, Kannada, Malayalam and Urdu. Bills, prints and reports are available in every supported language.',
                                    },
                                },
                                {
                                    '@type': 'Question',
                                    name: 'Is there a free trial of MandiGrow?',
                                    acceptedAnswer: {
                                        '@type': 'Answer',
                                        text: 'Yes. MandiGrow offers a 14-day free trial with no credit card required. You can also book a free live demo in Hindi or English to see how it fits your mandi business.',
                                    },
                                },
                            ],
                        }),
                    }}
                />
                {/* SoftwareApplication schema for SEO — see ARCHITECTURE.md / SEO pack */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@type': 'SoftwareApplication',
                            name: 'MandiGrow',
                            alternateName: 'MandiGrow Mandi ERP Software',
                            url: 'https://www.mandigrow.com',
                            image: 'https://www.mandigrow.com/og-image.png',
                            description:
                                "MandiGrow is India's #1 mandi ERP software for fruits and vegetable merchants, commission agents and wholesale traders. GST billing, mandi khata, commission, stock and reports — all in one app. A purpose-built Tally and Zoho alternative for vegetable traders.",
                            applicationCategory: 'BusinessApplication',
                            applicationSubCategory: 'ERP, Accounting, Inventory Management',
                            operatingSystem: 'Android, Web, Windows, macOS',
                            softwareVersion: '2.0',
                            inLanguage: ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'ur-IN'],
                            author: { '@type': 'Organization', name: 'MandiGrow', url: 'https://www.mandigrow.com' },
                            publisher: {
                                '@type': 'Organization',
                                name: 'MandiGrow',
                                logo: { '@type': 'ImageObject', url: 'https://www.mandigrow.com/logo.png' },
                            },
                            offers: {
                                '@type': 'Offer',
                                price: '0',
                                priceCurrency: 'INR',
                                availability: 'https://schema.org/InStock',
                                category: 'Free Trial',
                                url: 'https://www.mandigrow.com/signup',
                            },
                            aggregateRating: {
                                '@type': 'AggregateRating',
                                ratingValue: '4.9',
                                reviewCount: '1280',
                                bestRating: '5',
                                worstRating: '1',
                            },
                            featureList: [
                                'Sales and Purchase management for fruits and vegetables',
                                'GST billing and e-invoicing',
                                'Mandi khata and commission agent accounts',
                                'Inventory and lot-wise stock tracking',
                                'Daybook, ledgers and party balances',
                                'Hindi and English UI, prints and reports',
                                'Android mobile app and desktop web',
                                'Tally and Zoho alternative for mandi traders',
                            ],
                            audience: {
                                '@type': 'BusinessAudience',
                                audienceType:
                                    'Fruits and vegetable merchants, mandi commission agents, wholesale traders in India',
                            },
                        }),
                    }}
                />
            </head>
            <body className={`${inter.className} bg-background text-foreground antialiased`}>
                {/* CapacitorProvider: adds native class, deep links, back button, keyboard */}
                {/* NativeAuthGuard: client-side session check (web = transparent pass-through) */}
                <CapacitorProvider>
                    <NativeAuthGuard>
                        <LanguageProvider>
                            <ShortcutProvider>
                                <AuthProvider>
                                    <ImpersonationBanner />
                                    <PaymentReminderBanner />
                                    {children}
                                    <Toaster />
                                    <OfflineSyncManager />
                                    <SubscriptionEnforcer />
                                    <KeyboardHelpOverlay />
                                </AuthProvider>
                            </ShortcutProvider>
                        </LanguageProvider>
                    </NativeAuthGuard>
                </CapacitorProvider>
            </body>
        </html>
    )
}
