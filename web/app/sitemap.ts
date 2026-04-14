import type { MetadataRoute } from 'next';
import { POSTS } from './blog/posts';

const BASE_URL = 'https://www.mandigrow.com';

export default function sitemap(): MetadataRoute.Sitemap {
    const now = new Date();
    const blogEntries: MetadataRoute.Sitemap = POSTS.map((p) => ({
        url: `${BASE_URL}/blog/${p.slug}`,
        lastModified: new Date(p.publishedAt),
        changeFrequency: 'monthly',
        priority: 0.7,
    }));

    return [
        { url: `${BASE_URL}/`,              lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
        { url: `${BASE_URL}/mandi-billing`,             lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/commission-agent-software`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/mandi-khata-software`,      lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/faq`,                       lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
        { url: `${BASE_URL}/blog`,          lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
        ...blogEntries,
        { url: `${BASE_URL}/login`,         lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
        { url: `${BASE_URL}/subscribe`,     lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
        { url: `${BASE_URL}/join`,          lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    ];
}
