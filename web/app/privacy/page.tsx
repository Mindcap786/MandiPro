import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Privacy Policy | MandiGrow',
    description:
        'How MandiGrow collects, stores, processes and protects data of fruits & vegetable mandi traders in India. Indian IT Act 2000 and GDPR-aware privacy policy.',
    alternates: { canonical: 'https://www.mandigrow.com/privacy' },
}

export default function PrivacyPolicyPage() {
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
                    <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-gray-900 mb-4">Privacy Policy</h1>
                    <p className="text-lg text-gray-700 font-medium max-w-2xl mx-auto">
                        How MandiGrow collects, stores, processes and protects your mandi business data in compliance with Indian law.
                    </p>
                </div>

                <article className="bg-white border border-emerald-100 rounded-[32px] shadow-sm p-8 md:p-12 prose prose-emerald max-w-none">
                    <p className="text-sm text-gray-500 mb-8"><strong>Effective Date:</strong> 1 April 2026 &nbsp;·&nbsp; <strong>Last Updated:</strong> 1 April 2026</p>

                    <h2 className="text-2xl font-black text-gray-900 mt-0 mb-3">1. Introduction</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        MINDT Private Limited (&quot;MandiGrow&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the MandiGrow SaaS platform (the &quot;Service&quot;),
                        a mandi ERP solution for fruits &amp; vegetable commission agents, wholesalers and traders across India. This Privacy Policy
                        explains what information we collect, why we collect it, how we use it, and the rights you have over your data.
                    </p>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        This Policy is issued under the Information Technology Act, 2000, the Information Technology (Reasonable Security Practices
                        and Procedures and Sensitive Personal Data or Information) Rules, 2011, and the Digital Personal Data Protection Act, 2023
                        (&quot;DPDP Act&quot;). It is also designed to be GDPR-aware for users who interact with us from outside India.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">2. Information We Collect</h2>
                    <p className="text-gray-700 leading-relaxed mb-3"><strong>2.1 Account &amp; identity data:</strong> name, mobile number, email, business name, GSTIN, PAN, address, state, and login credentials.</p>
                    <p className="text-gray-700 leading-relaxed mb-3"><strong>2.2 Business &amp; transactional data:</strong> sales invoices, purchase bills, daybook entries, ledgers, commission agent accounts, mandi khata records, party details, stock movement, inventory, and payment records.</p>
                    <p className="text-gray-700 leading-relaxed mb-3"><strong>2.3 GST &amp; financial data:</strong> GST returns, HSN codes, tax computations, e-invoice data, and related fiscal records — classified as Sensitive Personal Data or Information (SPDI) under Indian law.</p>
                    <p className="text-gray-700 leading-relaxed mb-3"><strong>2.4 Payment data:</strong> subscription billing information processed via PCI-DSS compliant payment gateways (Razorpay, Stripe, SMEPay). We do <em>not</em> store full card numbers or CVV on our servers.</p>
                    <p className="text-gray-700 leading-relaxed mb-6"><strong>2.5 Technical data:</strong> IP address, device identifiers, browser type, operating system, app version, crash logs, and usage analytics.</p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">3. Purpose of Collection</h2>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-6">
                        <li>To provide, maintain and improve the Service including billing, accounting and compliance features.</li>
                        <li>To generate GST-compliant invoices, reports and filings on your behalf.</li>
                        <li>To authenticate users and protect against fraud and unauthorised access.</li>
                        <li>To communicate service updates, security alerts and billing notifications.</li>
                        <li>To comply with legal, tax and regulatory obligations in India.</li>
                        <li>To deliver customer support and resolve disputes.</li>
                    </ul>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">4. Legal Basis for Processing</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        We process personal data on the basis of (a) your consent at account creation, (b) performance of our contract with you,
                        (c) compliance with legal obligations (including GST, income tax and IT Act requirements), and (d) legitimate business
                        interests such as securing the platform and preventing misuse.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">5. Third-Party Sharing &amp; Sub-Processors</h2>
                    <p className="text-gray-700 leading-relaxed mb-3">We do not sell your personal data. We share data only with the following categories of recipients, under contractual confidentiality:</p>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-6">
                        <li><strong>Infrastructure providers:</strong> Supabase, AWS / GCP data centres located in India or regions offering equivalent safeguards.</li>
                        <li><strong>Payment processors:</strong> Razorpay, Stripe, SMEPay for subscription collection.</li>
                        <li><strong>Analytics &amp; monitoring:</strong> Sentry for error tracking, Google Analytics for aggregate usage (anonymised).</li>
                        <li><strong>Government authorities:</strong> GSTN, income tax department, or law-enforcement agencies where legally compelled.</li>
                        <li><strong>Professional advisors:</strong> auditors, lawyers and compliance consultants under strict confidentiality.</li>
                    </ul>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">6. Data Retention</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        We retain your business and financial data for as long as your account is active and thereafter for a minimum of
                        <strong> eight (8) years</strong> from the end of the relevant financial year, as required by Section 36 of the CGST Act, 2017
                        and Section 44AA of the Income Tax Act, 1961. Upon account closure, you may request export or deletion subject to these
                        statutory retention obligations.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">7. Data Security</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        We implement reasonable security practices aligned with ISO/IEC 27001 and Rule 8 of the SPDI Rules, 2011, including
                        TLS 1.2+ encryption in transit, AES-256 encryption at rest, role-based access control, row-level security, audit logging,
                        regular penetration testing, and encrypted off-site backups. No method of electronic storage is 100% secure; we therefore
                        cannot guarantee absolute security.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">8. Your Rights</h2>
                    <p className="text-gray-700 leading-relaxed mb-3">Subject to the DPDP Act, 2023 and applicable law, you have the right to:</p>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-6">
                        <li>Access and obtain a copy of the personal data we hold about you.</li>
                        <li>Correct or update inaccurate or incomplete data.</li>
                        <li>Withdraw consent (where processing is based on consent).</li>
                        <li>Request erasure, subject to statutory retention requirements.</li>
                        <li>Nominate another individual to exercise your rights in the event of death or incapacity.</li>
                        <li>Lodge a grievance with our Grievance Officer (see Section 12) or the Data Protection Board of India.</li>
                    </ul>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">9. Cookies &amp; Tracking</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        We use strictly-necessary cookies for authentication and session management, and analytics cookies (with your consent) to
                        understand aggregate usage. You can control cookies through your browser settings. Disabling strictly-necessary cookies may
                        impair your ability to sign in and use the Service.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">10. Cross-Border Transfers</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        Primary data storage is within India. Where limited processing occurs outside India (e.g. global CDN, payment gateways),
                        we rely on contractual safeguards and jurisdictions that ensure an adequate level of protection, as notified by the
                        Central Government under Section 16 of the DPDP Act.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">11. Children</h2>
                    <p className="text-gray-700 leading-relaxed mb-6">
                        The Service is intended for businesses and individuals aged 18 or above. We do not knowingly collect personal data from
                        children under 18. If you believe we have done so, please contact us and we will delete such data promptly.
                    </p>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">12. Grievance Officer &amp; Contact</h2>
                    <p className="text-gray-700 leading-relaxed mb-3">
                        In accordance with Rule 5(9) of the SPDI Rules, 2011 and Section 10 of the IT (Intermediary Guidelines) Rules, 2021:
                    </p>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-6">
                        <p className="text-gray-800 font-bold mb-1">Grievance Officer</p>
                        <p className="text-gray-700 text-sm">MandiGrow<br />
                            Email: <a href="mailto:privacy@mandigrow.com" className="text-emerald-700 font-bold">privacy@mandigrow.com</a><br />
                            Support: <a href="mailto:support@mandigrow.com" className="text-emerald-700 font-bold">support@mandigrow.com</a><br />
                            Response time: within 15 days of receipt of a valid request.
                        </p>
                    </div>

                    <h2 className="text-2xl font-black text-gray-900 mt-8 mb-3">13. Changes to this Policy</h2>
                    <p className="text-gray-700 leading-relaxed mb-0">
                        We may update this Privacy Policy from time to time. Material changes will be notified by email or in-app notice at least
                        7 days before they take effect. Your continued use of the Service after the effective date constitutes acceptance of the
                        revised Policy.
                    </p>
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
