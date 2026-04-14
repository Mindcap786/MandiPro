/**
 * Blog post registry.
 *
 * Add new posts by appending to this array. Each post becomes a route at
 * /blog/[slug]. Keep `body` as plain HTML or simple JSX strings — when you
 * outgrow this, migrate to MDX. This file is intentionally dependency-free.
 */

export interface BlogPost {
    slug: string;
    title: string;
    description: string;
    keywords: string[];
    publishedAt: string; // ISO date
    author: string;
    readMinutes: number;
    body: string; // HTML
}

export const POSTS: BlogPost[] = [
    {
        slug: 'best-mandi-erp-software-india-2026',
        title: 'Best Mandi ERP Software in India 2026 — A Buyer\'s Guide',
        description:
            'A no-nonsense buyer\'s guide to the best mandi ERP software in India for 2026. What to look for, what to avoid, and why MandiGrow leads the category.',
        keywords: [
            'best mandi ERP software',
            'mandi ERP software India',
            'fruits vegetable ERP',
            'mandi software 2026',
            'mandi billing software India',
        ],
        publishedAt: '2026-04-09',
        author: 'MandiGrow Team',
        readMinutes: 7,
        body: `
<p>If you run a fruits and vegetable trading business in India — whether you\'re a sabzi mandi commission agent, a wholesale dealer, or a multi-mandi operator — picking the right ERP software is the single biggest operational decision you will make this year.</p>

<p>This guide cuts through the noise. No jargon. No vendor talk. Just the criteria that actually matter for mandi traders, and a brutally honest look at what to expect from the leading mandi ERP software in India in 2026.</p>

<h2>Why Generic Accounting Tools Fail Mandi Traders</h2>

<p>Tally and Zoho Books are excellent products. They power millions of Indian businesses. But they were never designed for fruits and vegetable trade. The moment you try to track lots, crates, weight, wastage, commission, hamali and palledari in a generic accounting tool, you end up with workarounds, custom journals, and Excel sheets on the side.</p>

<p>The best mandi ERP software in India is one that handles all of this <em>natively</em> — out of the box, without configuration.</p>

<h2>The 7 Things to Look For in Mandi ERP Software</h2>

<ol>
  <li><strong>Lot, crate and weight billing.</strong> Bills must accept any unit your buyers use, and convert seamlessly between them.</li>
  <li><strong>Auto commission and market fee calculation.</strong> If you have to type the commission manually for every line, the software has failed.</li>
  <li><strong>Mandi khata (digital ledger).</strong> Every party should have a live balance, updated the moment a sale or payment is recorded.</li>
  <li><strong>GST and e-invoicing.</strong> GSTR-1 and GSTR-3B should be a one-click export.</li>
  <li><strong>Hindi and regional languages.</strong> Your staff should not need an English keyboard to bill.</li>
  <li><strong>Mobile + desktop.</strong> Sales happen at the mandi gate at 5am. Reports happen from the office at 9pm. Same data, same account.</li>
  <li><strong>Affordable monthly pricing.</strong> No setup fees. No per-seat lock-ins.</li>
</ol>

<h2>Why MandiGrow Leads the Category</h2>

<p>MandiGrow is the only mandi ERP software in India that scores 7 out of 7 on the criteria above. It is built end-to-end for fruits and vegetable trade — not adapted from a generic accounting product. Every screen, every form and every report reflects the way real mandi traders work.</p>

<p>Try it free for 14 days at <a href="https://www.mandigrow.com">MandiGrow.com</a>. No credit card required. Live demos available in Hindi and English.</p>
`,
    },
    {
        slug: 'tally-vs-mandigrow-fruits-vegetable-traders',
        title: 'Tally vs MandiGrow: Why Sabzi Mandi Traders Are Switching in 2026',
        description:
            'A side-by-side comparison of Tally ERP and MandiGrow for fruits and vegetable trade. Where Tally falls short and why thousands of mandi traders are migrating.',
        keywords: [
            'Tally vs MandiGrow',
            'Tally alternative for mandi',
            'mandi accounting software',
            'fruits vegetable accounting software',
            'best mandi software India',
        ],
        publishedAt: '2026-04-09',
        author: 'MandiGrow Team',
        readMinutes: 6,
        body: `
<p>Tally is the most-used accounting software in India. It is also the wrong tool for the job if you trade fruits and vegetables for a living. Here is the honest, side-by-side breakdown.</p>

<h2>Where Tally Wins</h2>

<ol>
  <li><strong>General accounting depth.</strong> Two decades of accumulated features. Hard to beat for a CA-style office.</li>
  <li><strong>Familiarity.</strong> Most accountants in India already know Tally.</li>
  <li><strong>Offline by default.</strong> Works on any Windows machine without an internet connection.</li>
</ol>

<h2>Where Tally Falls Short for Mandi Trade</h2>

<ol>
  <li><strong>No native lot or crate tracking.</strong> You either skip it or build a custom workaround in stock items.</li>
  <li><strong>No commission auto-calculation.</strong> Every commission line has to be entered or scripted with TDL.</li>
  <li><strong>No mandi-specific deductions.</strong> Hamali, palledari, market fees — all manual.</li>
  <li><strong>Desktop-only.</strong> Tally Prime has limited mobile features. Your team at the mandi gate cannot use it from a phone.</li>
  <li><strong>English-first.</strong> Hindi and regional language support is limited.</li>
  <li><strong>No integrated khata view.</strong> Party balances exist, but no live "all parties at one tap" view.</li>
  <li><strong>WhatsApp share takes 5 clicks.</strong> Not 1.</li>
</ol>

<h2>Why MandiGrow Is the Better Fit</h2>

<p>MandiGrow is built end-to-end for fruits and vegetable trade. Lot, crate and weight billing are first-class. Commission, market fee, hamali and palledari are auto-calculated and posted on every sale. The mandi khata is real-time. The app runs equally well on Android phones at the mandi gate and on the desktop in the office. Hindi, English, Tamil, Telugu, Kannada, Malayalam and Urdu are all supported out of the box.</p>

<p>You also get GST and e-invoicing — the parts of Tally you actually liked — without giving up any of the mandi features Tally never had.</p>

<h2>Migration in One Afternoon</h2>

<p>Most traders migrate from Tally to MandiGrow in a single afternoon. Import your party master, bring over opening balances, and start billing the same day. Free onboarding is included with every plan.</p>

<p>Try MandiGrow free for 14 days at <a href="https://www.mandigrow.com">MandiGrow.com</a>. No credit card required.</p>
`,
    },
];

export const getPost = (slug: string) => POSTS.find((p) => p.slug === slug);
