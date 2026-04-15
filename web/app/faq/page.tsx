import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * /faq — public FAQ page
 *
 * Server-rendered. Targets "People Also Ask" results in Google with a real
 * visible FAQ plus FAQPage JSON-LD scoped to this URL. Independent of the
 * homepage schema (Google prefers the schema to live on the same URL as
 * the visible content).
 */

export const metadata: Metadata = {
    title: 'Mandi ERP Software FAQ — MandiGrow',
    description:
        'Answers to common questions about MandiGrow — India\'s #1 mandi ERP software for fruits & vegetable merchants. Pricing, features, GST, languages and more.',
    keywords: [
        'mandi ERP software FAQ',
        'mandi software questions',
        'fruits vegetable ERP help',
        'MandiGrow pricing',
        'MandiGrow features',
    ],
    alternates: { canonical: 'https://www.mandigrow.com/faq' },
    openGraph: {
        title: 'Mandi ERP Software FAQ — MandiGrow',
        description:
            'Answers to common questions about MandiGrow — India\'s #1 mandi ERP software for fruits & vegetable merchants.',
        url: 'https://www.mandigrow.com/faq',
        type: 'website',
    },
};

const FAQ = [
    {
        q: 'What is the best mandi ERP software in India?',
        a: 'MandiGrow is widely considered the best mandi ERP software in India because it is built specifically for fruits and vegetable merchants, commission agents and wholesale traders. Unlike generic tools, it handles lots, crates, weight, commission, market fees and khata natively in both Hindi and English.',
    },
    {
        q: 'Is MandiGrow better than Tally for fruits and vegetable traders?',
        a: 'Yes. Tally is a general accounting tool, while MandiGrow is a complete fruits and vegetable ERP. You get everything Tally offers — ledgers, GST, daybook — plus mandi-specific features like commission auto-calculation, lot tracking, wastage and farmer settlements.',
    },
    {
        q: 'Can MandiGrow handle commission agent accounts?',
        a: 'Absolutely. MandiGrow is a full commission agent software for mandi businesses. It auto-calculates commission, market fees and hamali for every sale, posts entries to khatas instantly, and generates party-wise settlement reports in one click.',
    },
    {
        q: 'Does MandiGrow support GST billing for vegetable wholesalers?',
        a: 'Yes. MandiGrow generates GST-compliant invoices, supports B2B and B2C billing, and is ready for e-invoicing. You can file GSTR-1 and GSTR-3B faster because all your sales and purchase data is already organized.',
    },
    {
        q: 'Is MandiGrow available in Hindi and regional languages?',
        a: 'Yes. MandiGrow is fully multilingual and supports Hindi, English, Tamil, Telugu, Kannada, Malayalam and Urdu. The entire app, bills, prints and reports are available in every supported language. Switch with one tap.',
    },
    {
        q: 'Does MandiGrow work as a mandi khata software?',
        a: 'Yes. MandiGrow is a modern mandi khata software that replaces paper bahis with a fast, mobile-friendly digital khata. Track party balances, advances, payments and credits in real time.',
    },
    {
        q: 'Can I use MandiGrow on a mobile phone?',
        a: 'Yes. MandiGrow runs on Android phones and on the desktop web — using the same account and the same data. You can take orders at the mandi gate and review reports from home.',
    },
    {
        q: 'Is MandiGrow a good Zoho Books alternative for vegetable traders?',
        a: 'Yes. MandiGrow is the leading Zoho alternative for vegetable traders because Zoho was built for service businesses, while MandiGrow is built for fruits and vegetable trade — including stock, lots, commission and khata.',
    },
    {
        q: 'How long does it take to set up MandiGrow?',
        a: 'Most fruits and vegetable merchants are live within 30 minutes. Import your party list, add your items and start billing the same day. Free onboarding and Hindi support are included.',
    },
    {
        q: 'Is there a free trial of MandiGrow?',
        a: 'Yes. MandiGrow offers a 14-day free trial with no credit card required. You can also book a free live demo in Hindi or English to see how it fits your mandi business.',
    },
];

export default function FaqPage() {
    return (
        <main className="min-h-screen bg-[#f7fbf3] text-gray-900">
            {/* FAQPage JSON-LD scoped to this URL */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'FAQPage',
                        mainEntity: FAQ.map((f) => ({
                            '@type': 'Question',
                            name: f.q,
                            acceptedAnswer: { '@type': 'Answer', text: f.a },
                        })),
                    }),
                }}
            />
            {/* BreadcrumbList JSON-LD */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'BreadcrumbList',
                        itemListElement: [
                            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.mandigrow.com' },
                            { '@type': 'ListItem', position: 2, name: 'FAQ', item: 'https://www.mandigrow.com/faq' },
                        ],
                    }),
                }}
            />

            <section className="max-w-3xl mx-auto px-6 pt-24 pb-12">
                <p className="text-emerald-700 font-black uppercase tracking-widest text-xs mb-4">
                    Help Center
                </p>
                <h1 className="text-5xl md:text-6xl font-black tracking-tighter leading-[1.05] mb-4">
                    Frequently Asked Questions
                </h1>
                <p className="text-xl text-gray-700">
                    Everything you need to know about MandiGrow — India&apos;s #1 mandi ERP
                    software for fruits and vegetable merchants.
                </p>
            </section>

            <section className="max-w-3xl mx-auto px-6 pb-16">
                <div className="space-y-4">
                    {FAQ.map((f, i) => (
                        <details
                            key={f.q}
                            className="group bg-white border border-emerald-100 rounded-3xl p-6 shadow-sm open:shadow-md transition"
                            open={i === 0}
                        >
                            <summary className="cursor-pointer text-lg font-black tracking-tight list-none flex items-start justify-between gap-4">
                                <span>{f.q}</span>
                                <span className="text-emerald-600 text-2xl leading-none group-open:rotate-45 transition-transform">
                                    +
                                </span>
                            </summary>
                            <p className="text-gray-700 mt-4 leading-relaxed">{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            <section className="max-w-3xl mx-auto px-6 pb-24">
                <div className="p-8 bg-emerald-700 text-white rounded-3xl text-center">
                    <h2 className="text-2xl font-black tracking-tighter mb-2">
                        Still have questions?
                    </h2>
                    <p className="opacity-90 mb-6">
                        Book a free live demo in Hindi or English. 14-day free trial. No
                        credit card.
                    </p>
                    <div className="flex gap-3 justify-center flex-wrap">
                        <Link
                            href="/subscribe"
                            className="px-8 py-3 bg-white text-emerald-800 font-black rounded-xl hover:bg-emerald-50 transition"
                        >
                            Start Free Trial →
                        </Link>
                        <Link
                            href="/login"
                            className="px-8 py-3 bg-emerald-800 text-white font-black rounded-xl hover:bg-emerald-900 transition border border-emerald-500"
                        >
                            Book a Demo
                        </Link>
                    </div>
                </div>
            </section>
        </main>
    );
}
