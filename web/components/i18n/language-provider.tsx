
"use client"

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language } from './translations';
import { getTextDirection } from '@/lib/i18n/i18n-config';
import type { SupportedLanguage } from '@/lib/i18n/i18n-config';

type LanguageContextType = {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string, params?: Record<string, any>) => string;
    dir: 'ltr' | 'rtl';
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguage] = useState<Language>('en');
    const [jsonTranslations, setJsonTranslations] = useState<Record<string, any>>(translations.en);
    const [loading, setLoading] = useState(true);

    // Initial load from local storage
    useEffect(() => {
        const saved = localStorage.getItem('app-language') as Language;
        const validLanguages: Language[] = ['en', 'hi', 'te', 'ta', 'kn', 'ml', 'ur'];
        if (saved && validLanguages.includes(saved)) {
            setLanguage(saved);
        }
    }, []);

    // Load JSON translations whenever language changes
    useEffect(() => {
        const loadLocales = async () => {
            setLoading(true);
            try {
                // Fetch common and glossary and merge them
                const [commonRes, glossaryRes] = await Promise.all([
                    fetch(`/locales/${language}/common.json`).then(res => res.ok ? res.json() : {}),
                    fetch(`/locales/${language}/glossary.json`).then(res => res.ok ? res.json() : {})
                ]) as [any, any];
                
                setJsonTranslations({
                    ...commonRes,
                    glossary: glossaryRes?.glossary || glossaryRes
                });
            } catch (error) {
                console.error('Failed to load JSON locales:', error);
            } finally {
                setLoading(false);
            }
        };

        loadLocales();
    }, [language]);

    const handleSetLanguage = (lang: Language) => {
        setLanguage(lang);
        localStorage.setItem('app-language', lang);
        document.documentElement.lang = lang;
        document.documentElement.dir = getTextDirection(lang as SupportedLanguage);
    };

    // Sync dir on initial load
    useEffect(() => {
        document.documentElement.dir = getTextDirection(language as SupportedLanguage);
    }, [language]);

    const t = (path: string, params?: Record<string, any>) => {
        const keys = path.split('.');
        
        // 1. Try JSON translations first
        let current: any = jsonTranslations;
        let found = true;
        for (const key of keys) {
            if (current && current[key] !== undefined) {
                current = current[key];
            } else {
                found = false;
                break;
            }
        }

        // 2. If not found in JSON, try translations.ts fallback
        if (!found && translations[language]) {
            current = translations[language];
            found = true;
            for (const key of keys) {
                if (current && current[key] !== undefined) {
                    current = current[key];
                } else {
                    found = false;
                    break;
                }
            }
        }

        // 3. If still not found, try English fallback in translations.ts
        if (!found && (translations as any)['en']) {
            current = (translations as any)['en'];
            found = true;
            for (const key of keys) {
                if (current && current[key] !== undefined) {
                    current = current[key];
                } else {
                    found = false;
                    break;
                }
            }
        }

        // 4. Final fallback to the path itself
        if (!found || typeof current === 'object') {
            return path;
        }

        if (typeof current === 'string' && params) {
            return Object.entries(params).reduce(
                (acc, [key, value]) => {
                    const valStr = String(value);
                    // Use regex with global flag to replace all occurrences correctly
                    // We handle {{key}} first, then {key} to avoid leftover braces
                    return acc
                        .replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), valStr)
                        .replace(new RegExp(`\\{${key}\\}`, 'g'), valStr);
                },
                current
            );
        }

        return current;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t, dir: getTextDirection(language as SupportedLanguage) }}>
            {children}
        </LanguageContext.Provider>
    );
}

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
