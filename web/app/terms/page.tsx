import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Terms & Conditions | MandiGrow',
    description:
        'Terms of Service for MandiGrow — SaaS subscription, acceptable use, billing, IP, liability and governing law for Indian mandi traders.',
    alternates: { canonical: 'https://www.mandigrow.com/terms' },
}

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[#dce7c8] text-gray-900 font-sans overflow-x-hidden">
            {/* Header */}
            <div className="fixed top-0 w-full z-50 flex flex-col">
                <div className="bg-emerald-900 text-emerald-50 text-[10px] sm:text-xs font-bold text-center py-2 px-4 flex items-center justify-center gap-2 tracking-wide w-full border-b border-emerald-800/50 shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                    <span>MandiGrow — Live</span>
                </div>
                <nav className="w-full border-b border-[#c8d6b0] bg-[#dce7c8]/90 backdrop-blur-md relative">
                    <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-emerald-700 flex items-center justify-center text-white font-black text-xl">M</div>
                            <span className="text-xl font-bold tracking-tighter text-gray-900">MandiGrow</span>
                        </Link>
                        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-700">
                            <Link href="/#features" className="hover:text-emerald-800 transition-colors">Features</Link>
                            <Link href="/#solutions" className="hover:text-emerald-800 transition-colors">Solutions</Link>
                            <Link href="/subscribe" className="hover:text-emerald-800 transition-colors font-bold text-emerald-800">Subscription &amp; Billing</Link>
                            <Link href="/#compliance" className="hover:text-emerald-800 transition-colors">Compliance</Link>
                        </div>
                        <div className="flex items-center gap-4">
                            <Link href="/login" className="text-sm font-bold text-gray-700 hover:text-emerald-800 transition-colors">Sign In</Link>
                            <Link href="/login" className="hidden md:flex items-center gap-2 bg-emerald-700 text-white px-5 py-2.5 rounded-full font-bold text-sm hover:bg-emerald-800 transition-all hover:scale-105">
                                Get Started Free <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </div>
                </nav>
            </div>

            {/* Hero */}
            <main className="relative pt-40 pb-16 px-6 max-w-4xl mx-auto">
                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-200 bg-white/60 text-xs font-bold text-emerald-800 mb-6 backdrop-blur-sm shadow-sm">
                        Legal · Effective 1 April 2026
                    </div>
                    <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-gray-900 mb-4">Terms &amp; Conditions</h1>
                    <p className="text-lg text-gray-700 font-medium max-w-2xl mx-auto">
                        The contract between you and MandiGrow governing your use of our mandi ERP SaaS platform.
                    </p>
                </div>

                <article className="bg-white border border-emerald-100 rounded-[32px] shadow-sm p-8 md:p-12 max-w-none">
                    <p className="text-sm text-gray-500 mb-8"><strong>Effective Date:</strong> 1 April 2026 &nbsp;·&nbsp; <strong>Last Updated:</strong> 1 April 2026</p>

                    <h2 className="text-2xl font-black text-gray-900 mt-0 mb-3">1. Acceptance of Terms</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        These Terms &amp; Conditions (&quot;Terms&quot;) form a legally binding agreement between you, or the entity you represent
                        (&quot;Customer&quot;, &quot;you&quot;), and MINDT Private Limited (&quot;MandiGrow&quot;, &quot;we&quot;, &quot;us&quot;), governing
                        access to and use of the MandiGrow SaaS platform, mobile applications, APIs and related services (the &quot;Service&quot;).
                        By creating an account, subscribing or using the Service, you confirm that you have read, understood and agree to be bound by
                        these Terms and our Privacy Policy.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">2. Eligibility &amp; Account</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        The Service is intended for businesses lawfully operating in India, including commission agents, wholesalers, traders and
                        retailers dealing in fruits, vegetables and allied produce. You must be at least 18 years old and legally capable of entering
                        into a contract under the Indian Contract Act, 1872. You are responsible for maintaining the confidentiality of your login
                        credentials and for all activities conducted through your account.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">3. Subscription, Plans &amp; Free Trial</h2>
                    <p className="text-gray-700 leading-relaxed mb-3">
                        <strong>3.1</strong> The Service is offered on a subscription basis under the plans published on our pricing page. Plans may
                        include a free tier, trial period or promotional offer, each governed by the terms disclosed at sign-up.
                    </p>
                    <p className="text-gray-700 leading-relaxed mb-3">
                        <strong>3.2</strong> Subscriptions auto-renew for successive terms unless cancelled before the renewal date. You may downgrade,
                        upgrade or cancel from your account settings.
                    </p>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        <strong>3.3</strong> We reserve the right to revise subscription fees with at least thirty (30) days&apos; prior notice. Revised
                        fees apply from the next billing cycle.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">4. Payment &amp; Billing</h2>
                    <p className="text-gray-700 leading-relaxed mb-3">
                        <strong>4.1</strong> All fees are quoted in Indian Rupees (INR) and are exclusive of applicable GST, which will be added to
                        invoices at the prevailing rate.
                    </p>
                    <p className="text-gray-700 leading-relaxed mb-3">
                        <strong>4.2</strong> Payments are collected through PCI-DSS compliant gateways (Razorpay, Stripe, SMEPay). You authorise us
                        to charge your selected payment instrument for subscription fees, renewals and applicable taxes.
                    </p>
                    <p className="text-gray-700 leading-relaxed mb-3">
                        <strong>4.3</strong> If a payment fails, we may suspend access to the Service after reasonable reminder notices. Continued
                        non-payment may lead to termination under Section 11.
                    </p>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        <strong>4.4</strong> Except where required by law, all fees are non-refundable. Refunds, if any, will be issued to the
                        original payment instrument within 7–10 working days of approval.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">5. Acceptable Use</h2>
                    <p className="text-gray-700 leading-relaxed mb-3">You agree not to, and not to permit any person to:</p>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-6">
                        <li>Use the Service to issue fraudulent invoices, evade GST or other taxes, or engage in hawala, benami or money-laundering activity.</li>
                        <li>Upload or process data you are not legally authorised to handle.</li>
                        <li>Reverse engineer, decompile, disassemble, or attempt to derive the source code of the Service.</li>
                        <li>Circumvent access controls, rate-limits, tenant isolation or security features.</li>
                        <li>Resell, sublicense, white-label or offer the Service to third parties without our prior written consent.</li>
                        <li>Use the Service to send spam, malware, phishing content or any material that violates Indian law.</li>
                        <li>Interfere with the integrity, performance or availability of the Service.</li>
                    </ul>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        Violation of this section may result in immediate suspension or termination without refund, and reporting to competent
                        authorities where required.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">6. Customer Data &amp; Ownership</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        You retain all rights, title and interest in your business data (invoices, ledgers, party details, stock, reports —
                        &quot;Customer Data&quot;). You grant MandiGrow a limited, non-exclusive, royalty-free licence to process Customer Data solely
                        to provide and improve the Service, comply with law and enforce these Terms. You may export your data at any time in
                        machine-readable format from your account.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">7. Intellectual Property</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        The Service, including software, designs, trademarks, logos, documentation and all underlying intellectual property, is the
                        sole property of MandiGrow and is protected under the Copyright Act, 1957, the Trade Marks Act, 1999, and applicable
                        international IP laws. No rights are granted except as expressly stated in these Terms. The &quot;MandiGrow&quot; name and logo may
                        not be used without our prior written consent.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">8. Service Availability &amp; Support</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        We aim to provide the Service on a 24×7 basis and target a monthly uptime of 99.5% excluding scheduled maintenance and events
                        beyond our reasonable control. Support is provided via in-app chat and email during business hours (IST). Nothing in these
                        Terms guarantees uninterrupted or error-free operation.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">9. Disclaimers</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum extent permitted by law, we
                        disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose and non-infringement.
                        MandiGrow does not act as a chartered accountant, tax advisor or legal counsel; the Service is a tool and does not substitute
                        professional advice. You are solely responsible for the accuracy of data you input and for verifying outputs (including GST
                        returns) before submission to any authority.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">10. Limitation of Liability</h2>
                    <p className="text-gray-700 leading-relaxed mb-3">
                        To the maximum extent permitted by applicable law:
                    </p>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-6">
                        <li>MandiGrow&apos;s total aggregate liability arising out of or relating to these Terms or the Service shall not exceed the
                            subscription fees actually paid by you to MandiGrow during the twelve (12) months immediately preceding the event giving
                            rise to the claim.</li>
                        <li>MandiGrow shall not be liable for indirect, incidental, special, consequential or punitive damages, loss of profits,
                            loss of goodwill, loss of data, business interruption, or tax penalties, howsoever arising.</li>
                        <li>Nothing in this section limits liability for fraud, wilful misconduct, or any liability that cannot be excluded under
                            Indian law.</li>
                    </ul>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">11. Suspension &amp; Termination</h2>
                    <p className="text-gray-700 leading-relaxed mb-3">
                        <strong>11.1</strong> You may cancel your subscription at any time from your account. Cancellation becomes effective at the
                        end of the current billing cycle.
                    </p>
                    <p className="text-gray-700 leading-relaxed mb-3">
                        <strong>11.2</strong> We may suspend or terminate your access, with or without notice, if you breach these Terms, fail to pay
                        fees when due, or engage in activity that risks harm to the Service, other users, or MandiGrow&apos;s reputation.
                    </p>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        <strong>11.3</strong> Upon termination, your right to use the Service ends immediately. For thirty (30) days after termination
                        you may export your Customer Data; thereafter we may delete it, subject to statutory retention obligations described in our
                        Privacy Policy.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">12. Indemnification</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        You agree to indemnify and hold harmless MandiGrow, its directors, employees and affiliates against any claim, demand, loss,
                        liability or expense (including reasonable legal fees) arising out of (i) your breach of these Terms, (ii) your violation of
                        applicable law, or (iii) Customer Data that infringes third-party rights.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">13. Force Majeure</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        Neither party shall be liable for failure or delay in performance caused by events beyond reasonable control, including acts
                        of God, war, riots, cyber-attacks, pandemics, government orders, power or internet outages, or failures of third-party
                        infrastructure.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">14. Governing Law &amp; Dispute Resolution</h2>
                    <p className="text-gray-700 leading-relaxed mb-3">
                        These Terms are governed by and construed in accordance with the laws of India, without regard to conflict-of-laws principles.
                    </p>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        Any dispute arising out of or in connection with these Terms shall first be attempted to be resolved amicably within thirty
                        (30) days of written notice. Unresolved disputes shall be referred to binding arbitration by a sole arbitrator under the
                        Arbitration and Conciliation Act, 1996. The seat and venue of arbitration shall be Bengaluru, India, and proceedings shall be
                        conducted in English. Subject to arbitration, the courts at Bengaluru shall have exclusive jurisdiction.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">15. Changes to these Terms</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        We may modify these Terms from time to time. Material changes will be notified by email or in-app notice at least fifteen (15)
                        days before they take effect. Continued use of the Service after the effective date constitutes acceptance of the revised Terms.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">16. Miscellaneous</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        If any provision of these Terms is held invalid or unenforceable, the remaining provisions shall remain in full force. No
                        waiver of any term shall be deemed a further or continuing waiver. These Terms, together with the Privacy Policy and any
                        order form or plan-specific terms, constitute the entire agreement between the parties and supersede all prior understandings.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">17. Contact</h2>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-0">
                        <p className="text-gray-800 font-bold mb-1">MandiGrow</p>
                        <p className="text-gray-700 text-sm">
                            Legal: <a href="mailto:legal@mandigrow.com" className="text-emerald-700 font-bold">legal@mandigrow.com</a><br />
                            Billing: <a href="mailto:billing@mandigrow.com" className="text-emerald-700 font-bold">billing@mandigrow.com</a><br />
                            Support: <a href="mailto:support@mandigrow.com" className="text-emerald-700 font-bold">support@mandigrow.com</a>
                        </p>
                    </div>
                </article>
            </main>

            {/* Footer */}
            <footer className="border-t border-[#c8d6b0] py-12 px-6 bg-[#dce7c8]">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded bg-emerald-200 flex items-center justify-center text-emerald-800 font-bold text-sm">M</div>
                        <span className="font-bold text-emerald-800">© 2026 MandiGrow</span>
                    </div>
                    <div className="flex gap-6 text-sm font-medium text-emerald-700 flex-wrap justify-center">
                        <Link href="/mandi-billing" className="hover:text-emerald-900 transition-colors">Mandi Billing</Link>
                        <Link href="/commission-agent-software" className="hover:text-emerald-900 transition-colors">Commission Agent</Link>
                        <Link href="/mandi-khata-software" className="hover:text-emerald-900 transition-colors">Mandi Khata</Link>
                        <Link href="/blog" className="hover:text-emerald-900 transition-colors">Blog</Link>
                        <Link href="/faq" className="hover:text-emerald-900 transition-colors">FAQ</Link>
                        <Link href="/privacy" className="hover:text-emerald-900 transition-colors">Privacy Policy</Link>
                        <Link href="/terms" className="hover:text-emerald-900 transition-colors">Terms of Service</Link>
                        <Link href="/contact" className="hover:text-emerald-900 transition-colors">Contact</Link>
                    </div>
                </div>
            </footer>
        </div>
    )
}
