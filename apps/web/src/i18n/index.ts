/**
 * i18n/index.ts
 *
 * Bootstraps i18next + react-i18next.
 * Supported languages: FR (default) · EN · AR (RTL)
 *
 * ARCH-DECISION: FR is the default locale for HACCP compliance documents
 * (French regulatory requirement for food-safety businesses in France/Maghreb).
 * AR uses RTL — the <html dir> and lang attributes are toggled synchronously on
 * every language change so CSS logical properties (margin-inline-start, etc.)
 * and browser text rendering pick up the correct direction immediately.
 *
 * Usage in components:
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation();
 *   t('dashboard.title')  // → 'Vue d\'ensemble' | 'Overview' | 'نظرة عامة'
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// TypeScript translation files — no JSON parsing overhead, fully type-safe
import fr from './locales/fr';
import en from './locales/en';
import ar from './locales/ar';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'haccp_lang';

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français', dir: 'ltr' as const },
  { code: 'en', label: 'English',  dir: 'ltr' as const },
  { code: 'ar', label: 'العربية',  dir: 'rtl' as const },
] as const;

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

// ── DOM direction helper ──────────────────────────────────────────────────────

function applyDocumentDir(code: LangCode): void {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  const dir  = lang?.dir ?? 'ltr';
  document.documentElement.setAttribute('dir',  dir);
  document.documentElement.setAttribute('lang', code);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Persist language choice, update i18next, and flip document dir for RTL. */
export function setLanguage(code: LangCode): void {
  void i18n.changeLanguage(code);
  localStorage.setItem(STORAGE_KEY, code);
  applyDocumentDir(code);
}

// ── Initialisation ────────────────────────────────────────────────────────────

const savedLang = (localStorage.getItem(STORAGE_KEY) as LangCode | null) ?? 'fr';

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      ar: { translation: ar },
    },
    lng:           savedLang,
    fallbackLng:   'fr',
    // ARCH-DECISION: keySeparator '.' lets us use nested keys like
    // 'dashboard.title' while keeping translation files as nested objects.
    keySeparator:  '.',
    interpolation: { escapeValue: false },
  });

// Set document direction for the initially loaded language
applyDocumentDir(savedLang);

export { i18n };
