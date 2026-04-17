import { ImageResponse } from 'next/og';

/**
 * Dynamic Open Graph image for the homepage.
 *
 * Next.js automatically picks this up at build time and serves it as the
 * og:image for `/`. No manual PNG required — fully maintainable in code.
 *
 * Resolution: 1200×630 (Facebook/Twitter/LinkedIn standard).
 */

export const runtime = 'edge';
export const alt = 'MandiGrow — Mandi ERP for Fruits & Vegetable Traders';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '72px',
                    background:
                        'linear-gradient(135deg, #064e3b 0%, #065f46 35%, #047857 70%, #10b981 100%)',
                    color: '#ffffff',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
            >
                {/* Top row: brand + pill */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            fontSize: 36,
                            fontWeight: 900,
                            letterSpacing: '-0.02em',
                        }}
                    >
                        <div
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: 16,
                                background: '#a7f3d0',
                                color: '#064e3b',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 32,
                                fontWeight: 900,
                            }}
                        >
                            M
                        </div>
                        MandiGrow
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            padding: '10px 22px',
                            borderRadius: 999,
                            background: 'rgba(255,255,255,0.15)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            fontSize: 18,
                            fontWeight: 800,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                        }}
                    >
                        India's #1 Mandi ERP
                    </div>
                </div>

                {/* Headline */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px',
                    }}
                >
                    <div
                        style={{
                            fontSize: 78,
                            fontWeight: 900,
                            lineHeight: 1.05,
                            letterSpacing: '-0.03em',
                            maxWidth: 1000,
                        }}
                    >
                        Mandi ERP for Fruits & Vegetable Traders
                    </div>
                    <div
                        style={{
                            fontSize: 28,
                            fontWeight: 600,
                            opacity: 0.9,
                            maxWidth: 950,
                            lineHeight: 1.3,
                        }}
                    >
                        GST billing · Mandi khata · Commission · Stock · Reports — in Hindi & English
                    </div>
                </div>

                {/* Bottom row: feature chips + CTA */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                    }}
                >
                    <div style={{ display: 'flex', gap: '14px' }}>
                        {['Tally Alternative', 'Zoho Alternative', 'Hindi + English'].map((c) => (
                            <div
                                key={c}
                                style={{
                                    display: 'flex',
                                    padding: '12px 22px',
                                    borderRadius: 14,
                                    background: 'rgba(255,255,255,0.12)',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    fontSize: 20,
                                    fontWeight: 700,
                                }}
                            >
                                {c}
                            </div>
                        ))}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            padding: '18px 32px',
                            borderRadius: 16,
                            background: '#ffffff',
                            color: '#064e3b',
                            fontSize: 24,
                            fontWeight: 900,
                            letterSpacing: '-0.01em',
                        }}
                    >
                        MandiGrow.com →
                    </div>
                </div>
            </div>
        ),
        { ...size }
    );
}
