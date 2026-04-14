"use client";

/**
 * use-i18n.ts
 * Master hook for MandiGrow i18n. Wraps existing useLanguage() hook
 * (backwards-compatible) and adds formatting, glossary, and dir support.
 *
 * Usage:
 *   const { t, language, dir, formatCurrency, formatDate, g } = useI18n();
 */

import { useMemo } from 'react';
import { useLanguage } from '@/components/i18n/language-provider';
import { getTextDirection, LANGUAGE_CONFIG, type SupportedLanguage } from './i18n-config';
import { formatCurrency, formatDate, formatCurrencyCompact } from './format';

// ---------------------------------------------------------------------------
// Glossary — Mandi domain terms with transliterated script forms
// These are phonetic transliterations, NOT translations.
// ---------------------------------------------------------------------------
const MANDI_GLOSSARY: Record<string, Record<SupportedLanguage, string>> = {
  mandi:    { en: 'Mandi',    hi: 'मंडी',      te: 'మండి',       ta: 'மண்டி',     kn: 'ಮಂಡಿ',      ml: 'മണ്ഡി',     ur: 'منڈی'      },
  khata:    { en: 'Khata',    hi: 'खाता',      te: 'ఖాతా',       ta: 'கணக்கு',    kn: 'ಖಾತೆ',      ml: 'ഖാത',       ur: 'کھاتہ'     },
  arhatiya: { en: 'Arhatiya', hi: 'अरहतिया',   te: 'అర్హతియా',   ta: 'அர்கதியா', kn: 'ಅರ್ಹತಿಯ',  ml: 'അർഹതിയ',   ur: 'آڑھتیہ'   },
  challan:  { en: 'Challan',  hi: 'चालान',     te: 'చలాన్',      ta: 'சலான்',     kn: 'ಚಲನ್',      ml: 'ചലാൻ',      ur: 'چالان'     },
  bilty:    { en: 'Bilty',    hi: 'बिल्टी',    te: 'బిల్టీ',     ta: 'பில்டி',    kn: 'ಬಿಲ್ಟಿ',    ml: 'ബിൽ‌ടി',    ur: 'بلٹی'      },
  galla:    { en: 'Galla',    hi: 'गल्ला',     te: 'గల్లా',      ta: 'கல்லா',     kn: 'ಗಲ್ಲಾ',     ml: 'ഗല്ല',      ur: 'گلا'       },
  munshi:   { en: 'Munshi',   hi: 'मुंशी',     te: 'ముంషీ',      ta: 'முன்ஷி',    kn: 'ಮುನ್ಶಿ',    ml: 'മുൻഷി',     ur: 'منشی'      },
  bora:     { en: 'Bora',     hi: 'बोरा',      te: 'బోరా',       ta: 'போரா',      kn: 'ಬೋರಾ',      ml: 'ബോറ',       ur: 'بورا'      },
  tola:     { en: 'Tola',     hi: 'तोला',      te: 'తోలా',       ta: 'தோலா',      kn: 'ತೋಲ',       ml: 'തൊല',       ur: 'تولہ'     },
  mandi_fee:{ en: 'Mandi Fee',hi: 'मंडी फीस',  te: 'మండి ఫీజు',  ta: 'மண்டி கட்டணம்', kn: 'ಮಂಡಿ ಶುಲ್ಕ', ml: 'മണ്ഡി ഫീ', ur: 'منڈی فیس'  },
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useI18n() {
  const { language, setLanguage, t } = useLanguage();

  const lang = language as SupportedLanguage;
  const config = LANGUAGE_CONFIG[lang];

  return useMemo(
    () => ({
      // Pass-through from existing hook (backwards compat)
      language: lang,
      setLanguage,
      t,

      /** Text direction for the current language ('ltr' | 'rtl') */
      dir: getTextDirection(lang),

      /** Metadata config for the active language */
      langConfig: config,

      /**
       * Glossary lookup — returns the domain term in the current script.
       * Falls back to English if the term is unknown.
       * @param key - One of the glossary term keys (e.g. 'mandi', 'khata')
       */
      g: (key: string): string => {
        const term = MANDI_GLOSSARY[key];
        if (!term) return key;
        return term[lang] ?? term['en'] ?? key;
      },

      /**
       * Format a number as Indian currency (₹ 1,00,000).
       * @param amount - Numeric amount
       * @param opts - Optional Intl.NumberFormat overrides
       */
      formatCurrency: (amount: number, opts?: Partial<Intl.NumberFormatOptions>) =>
        formatCurrency(amount, opts),

      /**
       * Compact currency format for stat cards (₹1.5L, ₹25K).
       */
      formatCurrencyCompact: (amount: number) => formatCurrencyCompact(amount),

      /**
       * Format a date as DD/MM/YYYY.
       * @param date - Date, ISO string, or timestamp
       */
      formatDate: (date: Date | string | number) => formatDate(date, lang),
    }),
    [lang, setLanguage, t, config]
  );
}
