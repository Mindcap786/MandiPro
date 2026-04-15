import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { POSTS, getPost } from '../posts';

export async function generateStaticParams() {
    return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: { slug: string };
}): Promise<Metadata> {
    const post = getPost(params.slug);
    if (!post) return { title: 'Post not found' };
    const url = `https://www.mandigrow.com/blog/${post.slug}`;
    return {
        title: `${post.title} | MandiGrow Blog`,
        description: post.description,
        keywords: post.keywords,
        alternates: { canonical: url },
        authors: [{ name: post.author }],
        openGraph: {
            title: post.title,
            description: post.description,
            url,
            type: 'article',
            publishedTime: post.publishedAt,
            authors: [post.author],
        },
        twitter: {
            card: 'summary_large_image',
            title: post.title,
            description: post.description,
        },
    };
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
    const post = getPost(params.slug);
    if (!post) notFound();

    const url = `https://www.mandigrow.com/blog/${post.slug}`;

    return (
        <main className="min-h-screen bg-[#f7fbf3] text-gray-900">
            {/* Article JSON-LD */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'BlogPosting',
                        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
                        headline: post.title,
                        description: post.description,
                        keywords: post.keywords.join(', '),
                        datePublished: post.publishedAt,
                        dateModified: post.publishedAt,
                        author: { '@type': 'Organization', name: post.author },
                        publisher: {
                            '@type': 'Organization',
                            name: 'MandiGrow',
                            logo: { '@type': 'ImageObject', url: 'https://www.mandigrow.com/logo.png' },
                        },
                        inLanguage: 'en-IN',
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
                            { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://www.mandigrow.com/blog' },
                            { '@type': 'ListItem', position: 3, name: post.title, item: url },
                        ],
                    }),
                }}
            />

            <article className="max-w-3xl mx-auto px-6 pt-24 pb-24">
                <Link
                    href="/blog"
                    className="text-emerald-700 font-black uppercase tracking-widest text-xs mb-6 inline-block hover:underline"
                >
                    ← MandiGrow Blog
                </Link>

                <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-[1.05] mb-4">
                    {post.title}
                </h1>
                <p className="text-sm text-gray-500 font-bold mb-10">
                    {new Date(post.publishedAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                    })}{' '}
                    · {post.readMinutes} min read · By {post.author}
                </p>

                <div
                    className="prose prose-emerald prose-lg max-w-none [&_h2]:text-2xl [&_h2]:font-black [&_h2]:mt-10 [&_h2]:mb-4 [&_p]:my-4 [&_p]:text-gray-800 [&_p]:leading-relaxed [&_ol]:my-4 [&_ol]:pl-6 [&_li]:my-2 [&_a]:text-emerald-700 [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: post.body }}
                />

                <div className="mt-16 p-8 bg-emerald-700 text-white rounded-3xl text-center">
                    <h2 className="text-2xl font-black tracking-tighter mb-2">
                        Try MandiGrow Free
                    </h2>
                    <p className="opacity-90 mb-6">
                        14-day free trial · No credit card · Hindi &amp; English support
                    </p>
                    <Link
                        href="/subscribe"
                        className="inline-block px-8 py-3 bg-white text-emerald-800 font-black rounded-xl hover:bg-emerald-50 transition"
                    >
                        Start Free Trial →
                    </Link>
                </div>
            </article>
        </main>
    );
}
