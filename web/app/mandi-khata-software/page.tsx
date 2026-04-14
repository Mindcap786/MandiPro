import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Mandi Khata Software — Digital Khata for Mandi Traders | MandiGrow',
    description:
        'MandiGrow is the modern mandi khata software for fruits & vegetable merchants. Replace paper bahis with a real-time digital khata. Free trial — no card.',
    keywords: [
        'mandi khata software',
        'digital mandi khata',
        'mandi bahi software',
        'mandi ledger software',
        'khata book for mandi',
        'mandi udhar software',
    ],
    alternates: { canonical: 'https://www.mandigrow.com/mandi-khata-software' },
    openGraph: {
        title: 'Mandi Khata Software — Digital Khata for Mandi Traders | MandiGrow',
        description:
            'Replace paper bahis with a real-time digital khata for fruits & vegetable merchants and commission agents.',
        url: 'https://www.mandigrow.com/mandi-khata-software',
        type: 'website',
    },
};

const FAQ = [
    {
        q: 'What is mandi khata software?',
        a: 'Mandi khata software is a digital ledger built specifically for mandi traders and commission agents. It replaces paper bahis with a real-time, party-wise khata that updates the moment you record a sale, purchase, advance or payment.',
    },
    {
        q: 'How is MandiGrow khata different from a regular khata book app?',
        a: 'Generic khata apps only record udhar. MandiGrow is a full mandi ledger system: it links every khata entry to the underlying sale, purchase, commission and GST entry — so your books are always tally-clean and audit-ready.',
    },
    {
        q: 'Can I see all my party balances at once?',
        a: 'Yes. The party balances screen shows every farmer and buyer with their current outstanding, advance, last transaction date and total turnover — sortable and filterable.',
    },
    {
        q: 'Does the khata work offline?',
        a: 'Yes — MandiGrow caches your data locally and syncs as soon as the connection is back. You can record entries from the mandi gate even with patchy mobile data.',
    },
    {
        q: 'Can I share a party statement on WhatsApp?',
        a: 'Yes. Generate any party statement, export as PDF, and share on WhatsApp directly from the app. Bilingual: Hindi or English.',
    },
];

export default function MandiKhataPage() {
    return (
        <main className="min-h-screen bg-[#f7fbf3] text-gray-900">
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
                                name: 'Mandi Khata Software',
                                item: 'https://www.mandigrow.com/mandi-khata-software',
                            },
                        ],
                    }),
                }}
            />

            <section className="max-w-5xl mx-auto px-6 pt-24 pb-16">
                <p className="text-emerald-700 font-black uppercase tracking-widest text-xs mb-4">
                    Mandi Khata Software · India
                </p>
                <h1 className="text-5xl md:text-6xl font-black tracking-tighter leading-[1.05] mb-6">
                    The Modern Mandi Khata Software for Fruits &amp; Vegetable Traders
                </h1>
                <p className="text-xl text-gray-700 max-w-3xl mb-8">
                    Replace paper bahis with a real-time digital mandi khata. Every party
                    balance live. Every entry linked to the underlying sale, purchase or
                    payment. Built for fruits and vegetable merchants and commission agents
                    across India.
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

            <section className="max-w-5xl mx-auto px-6 py-16 border-t border-emerald-100">
                <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-6">
                    A Khata That Tallies Itself
                </h2>
                <p className="text-lg text-gray-700 mb-4">
                    Paper bahis lose entries, smudge in the rain and take hours to
                    reconcile. Generic khata apps only record udhar — they leave you to do
                    the accounting twice. MandiGrow is different: every khata entry is
                    linked to the underlying sale, purchase, commission or GST entry, so
                    your books are tally-clean by design.
                </p>
                <p className="text-lg text-gray-700">
                    Open the app at midnight. Every farmer and buyer balance is correct.
                    Every commission is posted. Every GSTR-1 line is ready. Go to bed.
                </p>
            </section>

            <section className="max-w-5xl mx-auto px-6 py-16 border-t border-emerald-100">
                <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-10">
                    Everything Your Khata Should Have Been
                </h2>
                <div className="grid md:grid-cols-2 gap-6">
                    {[
                        ['Real-time party balances', 'Every farmer and buyer balance updated the moment you save an entry.'],
                        ['Linked to sales & purchases', 'No double entry. Khata derives from your business records.'],
                        ['Advances & part payments', 'Track advances, part payments and credit notes natively.'],
                        ['Offline-ready', 'Record from the mandi gate even with no signal. Auto-syncs on reconnect.'],
                        ['WhatsApp share', 'Send any party statement as PDF directly from the app.'],
                        ['Bilingual khata', 'Print and share in Hindi, English or any of 5 regional languages.'],
                    ].map(([title, desc]) => (
                        <div key={title} className="p-6 bg-white border border-emerald-100 rounded-3xl shadow-sm">
                            <h3 className="text-xl font-black mb-2">{title}</h3>
                            <p className="text-gray-600">{desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="max-w-5xl mx-auto px-6 py-16 border-t border-emerald-100">
                <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-10">
                    Mandi Khata Software — FAQ
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

            <section className="max-w-5xl mx-auto px-6 py-20 text-center">
                <h2 className="text-3xl md:text-5xl font-black tracking-tighter mb-6">
                    Throw the Bahi in a Drawer. Switch to MandiGrow.
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
