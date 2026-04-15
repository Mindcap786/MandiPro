import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * /mandi-billing — feature landing page
 *
 * Server component. Targets the buying-intent keyword "mandi billing
 * software". Self-contained: own metadata, own JSON-LD, own copy. Acts
 * as the template for future feature pages (commission-agent-software,
 * sabzi-mandi-erp-software, etc).
 */

export const metadata: Metadata = {
    title: 'Mandi Billing Software for Fruits & Vegetable Traders | MandiGrow',
    description:
        'MandiGrow is the fastest mandi billing software in India. Generate GST bills for fruits & vegetable trade in under 10 seconds. Free trial — no card.',
    keywords: [
        'mandi billing software',
        'fruit mandi billing software',
        'vegetable billing software',
        'GST billing for mandi',
        'sabzi mandi billing app',
        'fruits vegetables invoice software',
        'mandi invoice software India',
    ],
    alternates: { canonical: 'https://www.mandigrow.com/mandi-billing' },
    openGraph: {
        title: 'Mandi Billing Software for Fruits & Vegetable Traders | MandiGrow',
        description:
            'Generate GST bills for fruits & vegetable trade in under 10 seconds. Built for mandi commission agents and wholesalers across India.',
        url: 'https://www.mandigrow.com/mandi-billing',
        type: 'website',
    },
};

const FAQ = [
    {
        q: 'What is mandi billing software?',
        a: 'Mandi billing software is a billing and invoicing tool built specifically for fruits and vegetable trade. Unlike generic invoicing tools, it handles lots, crates, weight, commission, market fees, hamali and palledari natively — exactly the way mandi traders work.',
    },
    {
        q: 'How fast can I generate a bill in MandiGrow?',
        a: 'Most MandiGrow users create a complete GST-compliant sales bill in under 10 seconds. Add the buyer, lot, weight and rate — MandiGrow auto-calculates totals, GST, commission and net payable instantly.',
    },
    {
        q: 'Does MandiGrow work in Hindi?',
        a: 'Yes. MandiGrow generates bills, prints and reports in Hindi, English, Tamil, Telugu, Kannada, Malayalam and Urdu. Switch language with one tap.',
    },
    {
        q: 'Is MandiGrow GST and e-invoicing ready?',
        a: 'Yes. MandiGrow generates GST-compliant invoices, supports B2B and B2C billing and is ready for e-invoicing. Filing GSTR-1 and GSTR-3B becomes a one-click export.',
    },
    {
        q: 'Can I print bills in regional languages?',
        a: 'Yes. Bills can be printed in Hindi, English, Tamil, Telugu, Kannada and Malayalam. You can also share them on WhatsApp as a PDF directly from the app.',
    },
];

export default function MandiBillingPage() {
    return (
        <main className="min-h-screen bg-[#f7fbf3] text-gray-900">
            {/* JSON-LD: FAQPage scoped to this page */}
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
            {/* JSON-LD: BreadcrumbList */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'BreadcrumbList',
                        itemListElement: [
                            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.mandigrow.com' },
                            {
                                '@type': 'ListItem',
                                position: 2,
                                name: 'Mandi Billing Software',
                                item: 'https://www.mandigrow.com/mandi-billing',
                            },
                        ],
                    }),
                }}
            />

            {/* Hero */}
            <section className="max-w-5xl mx-auto px-6 pt-24 pb-16">
                <p className="text-emerald-700 font-black uppercase tracking-widest text-xs mb-4">
                    Mandi Billing Software · India
                </p>
                <h1 className="text-5xl md:text-6xl font-black tracking-tighter leading-[1.05] mb-6">
                    The Fastest Mandi Billing Software for Fruits &amp; Vegetable Traders
                </h1>
                <p className="text-xl text-gray-700 max-w-3xl mb-8">
                    MandiGrow generates GST-compliant bills for fruits and vegetable trade in
                    under 10 seconds. Built for mandi commission agents, sabzi mandi
                    wholesalers and wholesale dealers across India. Hindi and English. Mobile
                    and desktop. Free 14-day trial.
                </p>
                <div className="flex gap-4 flex-wrap">
                    <Link
                        href="/subscribe"
                        className="px-8 py-4 bg-emerald-700 text-white font-black rounded-2xl shadow-lg hover:bg-emerald-800 transition"
                    >
                        Start Free Trial →
                    </Link>
                    <Link
                        href="/login"
                        className="px-8 py-4 bg-white text-emerald-800 font-black rounded-2xl border border-emerald-200 hover:bg-emerald-50 transition"
                    >
                        Book a Demo
                    </Link>
                </div>
            </section>

            {/* Why */}
            <section className="max-w-5xl mx-auto px-6 py-16 border-t border-emerald-100">
                <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-6">
                    Built for Mandi, Not Adapted to It
                </h2>
                <p className="text-lg text-gray-700 mb-4">
                    Tally and Zoho were built for shops and offices. MandiGrow was built for
                    the morning auction, the loading dock and the khata at midnight. Lots,
                    crates, weight, wastage, commission, market fees, hamali and palledari are
                    all native — not bolted on.
                </p>
                <p className="text-lg text-gray-700">
                    That is why MandiGrow is the leading <strong>Tally alternative for mandi</strong>{' '}
                    traders and the smartest <strong>Zoho alternative for vegetable traders</strong>{' '}
                    in India.
                </p>
            </section>

            {/* Features grid */}
            <section className="max-w-5xl mx-auto px-6 py-16 border-t border-emerald-100">
                <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-10">
                    Everything Your Mandi Billing Needs
                </h2>
                <div className="grid md:grid-cols-2 gap-6">
                    {[
                        ['Lot, crate & weight billing', 'Bill by lot, crate, carton or kilogram. Auto-calculate totals.'],
                        ['Auto commission & market fee', 'Commission, hamali, palledari, market fee — all calculated and posted.'],
                        ['GST & e-invoicing ready', 'B2B and B2C invoices, ready for GSTR-1 and GSTR-3B.'],
                        ['Hindi & 6 regional languages', 'Print bills in the language your buyers prefer.'],
                        ['WhatsApp share', 'Share PDF bills directly from the app to your buyers.'],
                        ['Mobile + desktop', 'Bill at the mandi gate. Review from your office. Same data.'],
                    ].map(([title, desc]) => (
                        <div key={title} className="p-6 bg-white border border-emerald-100 rounded-3xl shadow-sm">
                            <h3 className="text-xl font-black mb-2">{title}</h3>
                            <p className="text-gray-600">{desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* FAQ */}
            <section className="max-w-5xl mx-auto px-6 py-16 border-t border-emerald-100">
                <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-10">
                    Mandi Billing Software — FAQ
                </h2>
                <div className="space-y-6">
                    {FAQ.map((f) => (
                        <div key={f.q}>
                            <h3 className="text-lg font-black mb-2">{f.q}</h3>
                            <p className="text-gray-700">{f.a}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA */}
            <section className="max-w-5xl mx-auto px-6 py-20 text-center">
                <h2 className="text-3xl md:text-5xl font-black tracking-tighter mb-6">
                    Stop Fighting Tally. Start Billing the Mandi Way.
                </h2>
                <p className="text-xl text-gray-700 mb-8 max-w-2xl mx-auto">
                    14-day free trial. No credit card. Live demo in Hindi or English.
                </p>
                <Link
                    href="/subscribe"
                    className="inline-block px-10 py-5 bg-emerald-700 text-white font-black rounded-2xl shadow-xl hover:bg-emerald-800 transition text-lg"
                >
                    Start Free Trial →
                </Link>
            </section>
        </main>
    );
}
