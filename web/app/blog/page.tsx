import type { Metadata } from 'next';
import Link from 'next/link';
import { POSTS } from './posts';

export const metadata: Metadata = {
    title: 'MandiGrow Blog — Mandi ERP, Billing & Fruits Vegetable Trade Insights',
    description:
        'Expert guides on mandi ERP software, GST billing, commission agent accounts and fruits & vegetable trade in India. Updated weekly by the MandiGrow team.',
    alternates: { canonical: 'https://www.mandigrow.com/blog' },
    openGraph: {
        title: 'MandiGrow Blog — Mandi ERP & Fruits Vegetable Trade Insights',
        description:
            'Expert guides on mandi ERP software, GST billing and fruits & vegetable trade in India.',
        url: 'https://www.mandigrow.com/blog',
        type: 'website',
    },
};

export default function BlogIndex() {
    return (
        <main className="min-h-screen bg-[#f7fbf3] text-gray-900">
            <section className="max-w-4xl mx-auto px-6 pt-24 pb-12">
                <p className="text-emerald-700 font-black uppercase tracking-widest text-xs mb-4">
                    MandiGrow Blog
                </p>
                <h1 className="text-5xl md:text-6xl font-black tracking-tighter leading-[1.05] mb-4">
                    Mandi ERP, Billing &amp; Fruits Vegetable Trade Insights
                </h1>
                <p className="text-xl text-gray-700 max-w-2xl">
                    Practical guides for fruits and vegetable merchants, mandi commission
                    agents and wholesale traders across India.
                </p>
            </section>

            <section className="max-w-4xl mx-auto px-6 pb-24">
                <ul className="space-y-6">
                    {POSTS.map((post) => (
                        <li key={post.slug}>
                            <Link
                                href={`/blog/${post.slug}`}
                                className="block p-7 bg-white border border-emerald-100 rounded-3xl shadow-sm hover:shadow-md transition"
                            >
                                <p className="text-xs font-black uppercase tracking-widest text-emerald-700 mb-2">
                                    {new Date(post.publishedAt).toLocaleDateString('en-IN', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                    })}{' '}
                                    · {post.readMinutes} min read
                                </p>
                                <h2 className="text-2xl font-black tracking-tight mb-3">{post.title}</h2>
                                <p className="text-gray-600">{post.description}</p>
                            </Link>
                        </li>
                    ))}
                </ul>
            </section>
        </main>
    );
}
