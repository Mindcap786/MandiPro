"use client"

import { useLanguage } from "./language-provider"
import { Language } from "./translations"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Languages, Check } from "lucide-react"
import { motion } from "framer-motion"

export function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage()

    const languages: { code: Language; label: string; native: string; flag: string; rtl?: boolean }[] = [
        { code: 'en', label: 'English',   native: 'English',    flag: '🇺🇸' },
        { code: 'hi', label: 'Hindi',     native: 'हिन्दी',     flag: '🇮🇳' },
        { code: 'te', label: 'Telugu',    native: 'తెలుగు',     flag: '🇮🇳' },
        { code: 'ta', label: 'Tamil',     native: 'தமிழ்',      flag: '🇮🇳' },
        { code: 'kn', label: 'Kannada',   native: 'ಕನ್ನಡ',      flag: '🇮🇳' },
        { code: 'ml', label: 'Malayalam', native: 'മലയാളം',     flag: '🇮🇳' },
        { code: 'ur', label: 'Urdu',      native: 'اردو',       flag: '🇮🇳', rtl: true },
    ]

    const activeLang = languages.find(l => l.code === language) || languages[0];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    title="Change Language / भाषा बदलें"
                    className="flex items-center gap-2 px-3 h-10 rounded-xl bg-slate-50/80 backdrop-blur-sm hover:bg-emerald-50 border border-slate-100 transition-all duration-300 group relative z-50"
                >
                    <motion.div
                        whileHover={{ rotate: 15 }}
                        className="text-slate-400 group-hover:text-emerald-600"
                    >
                        <Languages className="w-4 h-4" />
                    </motion.div>
                    <span className="text-sm font-bold text-slate-700 hidden sm:inline-block">
                        {activeLang.native}
                    </span>
                    <span className="text-xs font-black text-slate-500 sm:hidden">
                        {activeLang.code.toUpperCase()}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-48 p-1 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[9999]"
            >
                <div className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Select Language
                </div>
                {languages.map((lang) => (
                    <DropdownMenuItem
                        key={lang.code}
                        onClick={() => setLanguage(lang.code)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 group focus:bg-emerald-50 ${language === lang.code
                            ? 'bg-emerald-50 text-emerald-700 font-bold'
                            : 'text-slate-600 hover:text-emerald-700'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-lg opacity-80 group-hover:opacity-100 transition-opacity">
                                {lang.flag}
                            </span>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold">{lang.native}</span>
                                <span className="text-[10px] uppercase font-black opacity-40">{lang.label}</span>
                            </div>
                        </div>
                        {language === lang.code && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            >
                                <Check className="w-4 h-4 text-emerald-600" />
                            </motion.div>
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
