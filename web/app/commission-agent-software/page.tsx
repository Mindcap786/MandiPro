import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Commission Agent Software for Mandi Traders | MandiGrow',
    description:
        'MandiGrow is the #1 commission agent software for mandi businesses in India. Auto commission, market fee, hamali, khata and party settlements. Free trial.',
    keywords: [
        'commission agent software',
        'commission agent software mandi',
        'mandi commission software India',
        'mandi commission agent app',
        'arhtiya software',
        'commission agent billing software',
    ],
    alternates: { canonical: 'https://www.mandigrow.com/commission-agent-software' },
    openGraph: {
        title: 'Commission Agent Software for Mandi Traders | MandiGrow',
        description:
            'Auto commission, market fee, hamali, khata and party settlements — built for mandi commission agents across India.',
        url: 'https://www.mandigrow.com/commission-agent-software',
        type: 'website',
    },
};

const FAQ = [
    {
        q: 'What is commission agent software for mandi?',
        a: 'Commission agent software is a purpose-built tool for mandi commission agents (arhtiyas) that automates commission calculation, market fees, hamali and palledari, and maintains a real-time khata for every farmer and buyer.',
    },
    {
        q: 'How does MandiGrow calculate commission automatically?',
        a: 'You configure your commission rate per party or per item once. After that, every sale you record auto-calculates commission, market fees and hamali — and posts the entries to the right ledger instantly. No manual journal vouchers.',
    },
    {
        q: 'Can I settle multiple farmers at once?',
        a: 'Yes. MandiGrow lets you select multiple farmer parties and run a one-click batch settlement, generating a single payable list with all balances in one screen.',
    },
    {
        q: 'Is MandiGrow good for arhtiyas?',
        a: 'Yes — MandiGrow is the most popular arhtiya software in India. It is built around the way commission agents work at the mandi: gate entry, lot, auction, sale, commission, settlement, payout.',
    },
    {
        q: 'Does it generate commission statements?',
        a: 'Yes. Generate party-wise commission statements for any date range in one click, in Hindi or English, ready to print or share on WhatsApp.',
    },
];

export default function CommissionAgentPage() {
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
                                name: 'Commission Agent Software',
                                item: 'https://www.mandigrow.com/commission-agent-software',
                            },
                        ],
                    }),
                }}
            />

            <section className="max-w-5xl mx-auto px-6 pt-24 pb-16">
                <p className="text-emerald-700 font-black uppercase tracking-widest text-xs mb-4">
                    Commission Agent Software · India
                </p>
                <h1 className="text-5xl md:text-6xl font-black tracking-tighter leading-[1.05] mb-6">
                    The #1 Commission Agent Software for Mandi Traders
                </h1>
                <p className="text-xl text-gray-700 max-w-3xl mb-8">
                    Auto commission, auto market fee, auto hamali, auto khata. MandiGrow is
                    built for arhtiyas and mandi commission agents who refuse to spend their
                    nights with a calculator. Hindi and English. Mobile and desktop. Free
                    14-day trial.
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
                    Built for Arhtiyas, Not for Office Accountants
                </h2>
                <p className="text-lg text-gray-700 mb-4">
                    Generic accounting software treats commission as an afterthought. For an
                    arhtiya, commission <em>is</em> the business. MandiGrow puts commission,
                    market fee, hamali and palledari at the centre of every screen — exactly
                    where they belong.
                </p>
                <p className="text-lg text-gray-700">
                    Whether you handle 20 farmers or 200, MandiGrow scales with you and keeps
                    every party balance live, every settlement clean, and every report ready
                    for tax season.
                </p>
            </section>

            <section className="max-w-5xl mx-auto px-6 py-16 border-t border-emerald-100">
                <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-10">
                    Everything an Arhtiya Needs in One App
                </h2>
                <div className="grid md:grid-cols-2 gap-6">
                    {[
                        ['Auto commission per sale', 'Configure once. Calculated on every sale, every line, automatically.'],
                        ['Market fee, hamali, palledari', 'All deductions calculated and posted with the sale entry.'],
                        ['Live party khata', 'Every farmer and buyer has a real-time balance — no end-of-day reconciliation.'],
                        ['Batch settlements', 'Settle multiple farmers in one click. One screen, one list, one payment.'],
                        ['Commission statements', 'Party-wise statements for any date range, in Hindi or English.'],
                        ['GST + e-invoicing', 'Stay compliant without leaving the app.'],
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
                    Commission Agent Software — FAQ
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
                    Stop Calculating Commission. Start Closing the Day.
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
