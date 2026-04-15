/**
 * i18n-config.ts
 * Central language registry. All new language metadata is added here.
 * Zero coupling to existing translations.ts — purely additive.
 */

export type SupportedLanguage = 'en' | 'hi' | 'te' | 'ta' | 'kn' | 'ml' | 'ur';

/** Languages that use right-to-left text direction. */
export const RTL_LANGUAGES: SupportedLanguage[] = [];

/** Human-readable metadata for each supported language. */
export const LANGUAGE_CONFIG: Record<
  SupportedLanguage,
  {
    code: SupportedLanguage;
    label: string;        // English label
    native: string;       // Label in native script
    flag: string;         // Emoji flag
    dir: 'ltr' | 'rtl';
    fontFamily: string;   // Primary font stack for the script
    googleFontName?: string; // Google Fonts name if applicable
  }
> = {
  en: {
    code: 'en',
    label: 'English',
    native: 'English',
    flag: '🇺🇸',
    dir: 'ltr',
    fontFamily: '"Inter", system-ui, sans-serif',
  },
  hi: {
    code: 'hi',
    label: 'Hindi',
    native: 'हिन्दी',
    flag: '🇮🇳',
    dir: 'ltr',
    fontFamily: '"Noto Sans Devanagari", "Inter", sans-serif',
    googleFontName: 'Noto+Sans+Devanagari',
  },
  te: {
    code: 'te',
    label: 'Telugu',
    native: 'తెలుగు',
    flag: '🇮🇳',
    dir: 'ltr',
    fontFamily: '"Noto Sans Telugu", "Inter", sans-serif',
    googleFontName: 'Noto+Sans+Telugu',
  },
  ta: {
    code: 'ta',
    label: 'Tamil',
    native: 'தமிழ்',
    flag: '🇮🇳',
    dir: 'ltr',
    fontFamily: '"Noto Sans Tamil", "Inter", sans-serif',
    googleFontName: 'Noto+Sans+Tamil',
  },
  kn: {
    code: 'kn',
    label: 'Kannada',
    native: 'ಕನ್ನಡ',
    flag: '🇮🇳',
    dir: 'ltr',
    fontFamily: '"Noto Sans Kannada", "Inter", sans-serif',
    googleFontName: 'Noto+Sans+Kannada',
  },
  ml: {
    code: 'ml',
    label: 'Malayalam',
    native: 'മലയാളം',
    flag: '🇮🇳',
    dir: 'ltr',
    fontFamily: '"Noto Sans Malayalam", "Inter", sans-serif',
    googleFontName: 'Noto+Sans+Malayalam',
  },
  ur: {
    code: 'ur',
    label: 'Urdu',
    native: 'اردو',
    flag: '🇮🇳',
    dir: 'ltr',
    fontFamily: '"Noto Nastaliq Urdu", "Noto Sans Arabic", serif',
    googleFontName: 'Noto+Nastaliq+Urdu',
  },
};

/** Ordered list for the language switcher UI. */
export const LANGUAGE_ORDER: SupportedLanguage[] = ['en', 'hi', 'te', 'ta', 'kn', 'ml', 'ur'];

/** Returns 'rtl' for RTL languages, 'ltr' for all others. */
export function getTextDirection(lang: SupportedLanguage): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';
}
