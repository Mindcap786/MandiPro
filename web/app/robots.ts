import type { MetadataRoute } from 'next';

const BASE_URL = 'https://www.mandigrow.com';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: [
                    '/',
                    '/mandi-billing',
                    '/commission-agent-software',
                    '/mandi-khata-software',
                    '/faq',
                    '/blog',
                    '/login',
                    '/subscribe',
                    '/join',
                ],
                disallow: [
                    '/admin',
                    '/api',
                    '/auth',
                    '/checkout',
                    '/dashboard',
                    '/sales',
                    '/arrivals',
                    '/finance',
                    '/settings',
                    '/reports',
                    '/inventory',
                    '/purchase',
                    '/ledgers',
                    '/contacts',
                    '/farmers',
                    '/buyers',
                    '/employees',
                    '/gate',
                    '/gate-logs',
                    '/auction',
                    '/auction-live',
                    '/bills',
                    '/quotations',
                    '/receipts',
                    '/credit-notes',
                    '/delivery-challans',
                    '/sales-orders',
                    '/price-lists',
                    '/accounting',
                    '/field-manager',
                    '/suspended',
                    '/seed',
                ],
            },
        ],
        sitemap: `${BASE_URL}/sitemap.xml`,
        host: BASE_URL,
    };
}
