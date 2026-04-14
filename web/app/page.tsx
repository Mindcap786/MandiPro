'use client'

import Link from 'next/link'
import { ArrowRight, ShieldCheck, Zap, Globe, BarChart3, Package, Users, LayoutGrid, Calculator, Workflow, CheckCircle2, Lock, FileText, ClipboardCheck, Sparkles, Menu, X } from 'lucide-react'
import { HeroTitle } from '@/components/i18n/hero-title'
import { useLanguage } from '@/components/i18n/language-provider'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useEffect } from 'react'

export default function LandingPage() {
    const { t } = useLanguage();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [playstoreLink, setPlaystoreLink] = useState('');

    useEffect(() => {
        (async () => {
            const { data } = await supabase.schema('core').from('site_contact_settings').select('playstore_app_link').maybeSingle();
            if (data?.playstore_app_link) {
                setPlaystoreLink(data.playstore_app_link);
            }
        })();
    }, []);
    return (
        <div className="min-h-screen bg-[#dce7c8] text-gray-900 selection:bg-emerald-600 selection:text-white font-sans overflow-x-hidden">

            {/* Global Header */}
            <div className="fixed top-0 w-full z-50 flex flex-col">
                {/* Dynamic Promotional Banner */}
                {/* Dynamic Promotional Banner (Static for now since Client component) */}
                <div className="bg-emerald-900 text-emerald-50 text-[10px] sm:text-xs font-bold text-center py-2 px-4 flex items-center justify-center gap-2 tracking-wide w-full border-b border-emerald-800/50 shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                    <span>{t('auth.enterprise_live')}</span>
                </div>
                
                {/* Navigation */}
                <nav className="w-full border-b border-[#c8d6b0] bg-[#dce7c8]/90 backdrop-blur-md relative">
                    <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-emerald-700 flex items-center justify-center text-white font-black text-xl">M</div>
                        <span className="text-xl font-bold tracking-tighter text-gray-900">MandiGrow</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-700">
                        <a href="#features" className="hover:text-emerald-800 transition-colors">{t('landing.nav_features')}</a>
                        <a href="#solutions" className="hover:text-emerald-800 transition-colors">{t('landing.nav_solutions')}</a>
                        <Link href="/subscribe" className="hover:text-emerald-800 transition-colors font-bold text-emerald-800">{t('nav.subscription_billing')}</Link>
                        <a href="#compliance" className="hover:text-emerald-800 transition-colors">{t('nav.compliance')}</a>
                    </div>
                    <div className="flex items-center gap-4">
                        <LanguageSwitcher />
                        <Link href="/login" className="text-sm font-bold text-gray-700 hover:text-emerald-800 transition-colors">
                            {t('auth.sign_in_btn')}
                        </Link>
                        <Link href="/login" className="hidden md:flex items-center gap-2 bg-emerald-700 text-white px-5 py-2.5 rounded-full font-bold text-sm hover:bg-emerald-800 transition-all hover:scale-105">
                            {t('landing.get_started')} <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </nav>
            </div>

            {/* Hero Section */}
            <main className="relative pt-40 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
                {/* Background Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-200 bg-white/50 text-[10px] sm:text-xs font-bold text-emerald-800 mb-8 backdrop-blur-sm shadow-sm">
                    <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                    </span>
                    {t('auth.enterprise_live')}
                </div>

                <HeroTitle 
                    text={t('auth.hero_title')} 
                    className="text-6xl md:text-8xl mb-8 leading-[1] max-w-5xl" 
                />

                <p className="text-xl md:text-2xl text-gray-700 max-w-3xl mb-12 font-medium leading-relaxed">
                    {t('auth.hero_description')}
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10 w-full sm:w-auto">
                    <Link href="/subscribe" className="w-full sm:w-auto bg-emerald-700 text-white px-8 py-4 rounded-full font-black text-lg hover:bg-emerald-800 transition-all hover:scale-105 flex items-center justify-center gap-2 shadow-[0_0_40px_-10px_rgba(4,120,87,0.4)]">
                        {t('nav.subscription_billing')} <ArrowRight className="w-5 h-5" />
                    </Link>
                    {playstoreLink && (
                        <a href={playstoreLink} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto px-8 py-4 rounded-full font-bold text-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-all flex items-center justify-center gap-2">
                           📱 Android App
                        </a>
                    )}
                    <Link href="/login" className="w-full sm:w-auto px-8 py-4 rounded-full font-bold text-lg text-emerald-800 border border-emerald-300 hover:border-emerald-500 hover:bg-white/50 transition-all flex items-center justify-center">
                        {t('auth.have_account')}
                    </Link>
                </div>
            </main>

            {/* Features Grid */}
            <section id="features" className="py-24 px-6 bg-[#e8f1d4] relative z-10 border-t border-[#c8d6b0]">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-20">
                        <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-4 text-gray-900">{t('landing.enterprise_title')}</h2>
                        <p className="text-gray-700 text-lg font-medium">{t('landing.enterprise_subtitle')}</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        <div className="p-8 rounded-3xl bg-white border border-emerald-100 hover:border-emerald-400 transition-colors group shadow-sm">
                            <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-100 transition-colors">
                                <Package className="w-6 h-6 text-emerald-600" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-gray-900">{t('landing.feature_logistics_title')}</h3>
                            <p className="text-gray-600 leading-relaxed font-medium">{t('landing.feature_logistics_desc')}</p>
                        </div>

                        {/* Feature 2 */}
                        <div className="p-8 rounded-3xl bg-white border border-emerald-100 hover:border-emerald-400 transition-colors group shadow-sm">
                            <div className="w-14 h-14 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-100 transition-colors">
                                <BarChart3 className="w-6 h-6 text-blue-600" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-gray-900">{t('landing.feature_fintech_title')}</h3>
                            <p className="text-gray-600 leading-relaxed font-medium">{t('landing.feature_fintech_desc')}</p>
                        </div>

                        {/* Feature 3 */}
                        <div className="p-8 rounded-3xl bg-white border border-emerald-100 hover:border-emerald-400 transition-colors group shadow-sm">
                            <div className="w-14 h-14 bg-purple-50 border border-purple-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-purple-100 transition-colors">
                                <ShieldCheck className="w-6 h-6 text-purple-600" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-gray-900">{t('landing.feature_compliance_title')}</h3>
                            <p className="text-gray-600 leading-relaxed font-medium">{t('landing.feature_compliance_desc')}</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Solutions Section */}
            <section id="solutions" className="py-24 px-6 bg-[#dce7c8] relative z-10 border-t border-[#c8d6b0]">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-20 px-4">
                        <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-4 text-gray-900">{t('landing.solutions_title')}</h2>
                        <p className="text-gray-700 text-lg font-medium max-w-2xl mx-auto">{t('landing.solutions_subtitle')}</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="bg-emerald-900 text-emerald-50 p-10 rounded-[40px] flex flex-col justify-between">
                            <div>
                                <LayoutGrid className="w-10 h-10 mb-6 text-emerald-400" />
                                <h3 className="text-3xl font-black mb-4">{t('landing.solution_commission_title')}</h3>
                                <p className="text-emerald-200 font-medium mb-8">{t('landing.solution_commission_desc')}</p>
                            </div>
                            <ul className="space-y-3 font-bold text-sm">
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> {t('landing.feature_fintech_title')}</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> {t('landing.feature_logistics_title')}</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> {t('landing.feature_compliance_title')}</li>
                            </ul>
                        </div>
                        <div className="bg-white border border-emerald-100 p-10 rounded-[40px] flex flex-col justify-between">
                            <div>
                                <Calculator className="w-10 h-10 mb-6 text-emerald-600" />
                                <h3 className="text-3xl font-black mb-4 text-gray-900">{t('landing.solution_wholesaler_title')}</h3>
                                <p className="text-gray-600 font-medium mb-8">{t('landing.solution_wholesaler_desc')}</p>
                            </div>
                            <ul className="space-y-3 font-bold text-sm text-gray-700">
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {t('sales.title')}</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {t('purchase.title')}</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {t('nav.gst_compliance')}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* Compliance Section */}
            <section id="compliance" className="py-24 px-6 bg-white relative z-10 border-t border-[#c8d6b0]">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row items-center gap-16">
                        <div className="flex-1">
                            <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-8 text-gray-900">{t('landing.compliance_title')}</h2>
                            <div className="space-y-8">
                                <div className="flex gap-4">
                                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                                        <Lock className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-bold text-gray-900 mb-1">{t('landing.feature_compliance_title')}</h4>
                                        <p className="text-gray-600 font-medium">{t('landing.trust_security_desc')}</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-bold text-gray-900 mb-1">{t('nav.gst_compliance')}</h4>
                                        <p className="text-gray-600 font-medium">{t('landing.feature_compliance_desc')}</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                                        <ClipboardCheck className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-bold text-gray-900 mb-1">{t('landing.trust_audit_desc')}</h4>
                                        <p className="text-gray-600 font-medium">{t('auth.secure_connection')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 bg-emerald-50 p-1 rounded-[40px] rotate-2">
                             <div className="bg-white p-8 rounded-[38px] border border-emerald-100 shadow-xl">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="font-black text-xl tracking-tighter">{t('landing.compliance_health')}</div>
                                    <div className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-black uppercase">{t('landing.status_secure')}</div>
                                </div>
                                <div className="space-y-4">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 font-black text-xs">{i}</div>
                                            <div className="h-2 flex-1 bg-slate-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${Math.random() * 40 + 60}%` }} />
                                            </div>
                                            <div className="text-[10px] font-black text-slate-400">{t('landing.status_active')}</div>
                                        </div>
                                    ))}
                                </div>
                             </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-[#c8d6b0] py-12 px-6 bg-[#dce7c8]">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded bg-emerald-200 flex items-center justify-center text-emerald-800 font-bold text-sm">M</div>
                        <span className="font-bold text-emerald-800">{t('landing.copyright')}</span>
                    </div>
                    <div className="flex gap-6 text-sm font-medium text-emerald-700 flex-wrap justify-center">
                        <Link href="/mandi-billing" className="hover:text-emerald-900 transition-colors">Mandi Billing</Link>
                        <Link href="/commission-agent-software" className="hover:text-emerald-900 transition-colors">Commission Agent</Link>
                        <Link href="/mandi-khata-software" className="hover:text-emerald-900 transition-colors">Mandi Khata</Link>
                        <Link href="/blog" className="hover:text-emerald-900 transition-colors">Blog</Link>
                        <Link href="/faq" className="hover:text-emerald-900 transition-colors">FAQ</Link>
                        <Link href="/privacy" className="hover:text-emerald-900 transition-colors">{t('landing.privacy_policy')}</Link>
                        <Link href="/terms" className="hover:text-emerald-900 transition-colors">{t('landing.terms_of_service')}</Link>
                        <Link href="/contact" className="hover:text-emerald-900 transition-colors">{t('landing.footer_contact')}</Link>
                    </div>
                </div>
            </footer>
        </div>
    )
}
