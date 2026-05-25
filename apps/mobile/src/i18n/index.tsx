/**
 * Mobile i18n — lightweight React-context-based translation system.
 *
 * ARCH-DECISION: We intentionally avoid i18next on mobile.
 * Expo's bundler (Metro) struggles with i18next's dynamic plugin loading,
 * and the mobile app's translation surface is small enough for a typed
 * key-path lookup. This approach gives us:
 *  - Full TypeScript inference on all translation keys
 *  - RTL toggling via React Native's I18nManager
 *  - Zero additional dependencies
 *  - Persistence via expo-secure-store (same store used for auth tokens)
 *
 * Usage:
 *   const { t, lang, setLang } = useTranslation();
 *   t('auth.loginButton')   // → 'Se connecter' | 'Sign in' | 'دخول'
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { I18nManager } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { fr, type Translations } from './locales/fr';
import { en } from './locales/en';
import { ar } from './locales/ar';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LangCode = 'fr' | 'en' | 'ar';

export interface LangMeta {
  code:  LangCode;
  label: string;
  rtl:   boolean;
}

export const SUPPORTED_LANGUAGES: LangMeta[] = [
  { code: 'fr', label: 'Français', rtl: false },
  { code: 'en', label: 'English',  rtl: false },
  { code: 'ar', label: 'العربية',  rtl: true  },
];

// ─── Translation bundles ──────────────────────────────────────────────────────

const BUNDLES: Record<LangCode, Translations> = { fr, en, ar };

const LANG_STORE_KEY = 'haccp_mobile_lang';

// ─── Deep-key path accessor ───────────────────────────────────────────────────

/**
 * Type-safe dot-notation path extractor.
 * `t('common.loading')` is fully inferred; typos are compile errors.
 */
type Paths<T, Prefix extends string = ''> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? Paths<T[K], `${Prefix}${Prefix extends '' ? '' : '.'}${K & string}`>
    : `${Prefix}${Prefix extends '' ? '' : '.'}${K & string}`;
}[keyof T];

export type TranslationKey = Paths<Translations>;

function getByPath(obj: unknown, path: string): string {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj) as string ?? path;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface I18nContextValue {
  lang:    LangCode;
  setLang: (code: LangCode) => Promise<void>;
  t:       (key: TranslationKey) => string;
  isRtl:   boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface I18nProviderProps {
  children: React.ReactNode;
  /** Injected in tests to avoid SecureStore calls. */
  initialLang?: LangCode;
}

export function I18nProvider({ children, initialLang }: I18nProviderProps) {
  const [lang, setLangState] = useState<LangCode>(initialLang ?? 'fr');

  // Rehydrate from secure store on mount (skip in test env or when initialLang is set)
  useEffect(() => {
    if (initialLang) return;
    SecureStore.getItemAsync(LANG_STORE_KEY)
      .then((stored) => {
        const code = stored as LangCode | null;
        if (code && BUNDLES[code]) {
          setLangState(code);
          applyRtl(code);
        }
      })
      .catch(() => undefined); // silent — default to 'fr'
  }, [initialLang]);

  const setLang = useCallback(async (code: LangCode): Promise<void> => {
    setLangState(code);
    applyRtl(code);
    try {
      await SecureStore.setItemAsync(LANG_STORE_KEY, code);
    } catch {
      // Non-critical — UI still updates
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => getByPath(BUNDLES[lang], key),
    [lang],
  );

  const isRtl = SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;

  return (
    <I18nContext.Provider value={{ lang, setLang, t, isRtl }}>
      {children}
    </I18nContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used inside <I18nProvider>');
  }
  return ctx;
}

// ─── RTL helper ───────────────────────────────────────────────────────────────

/**
 * Applies React Native RTL direction.
 *
 * ARCH-DECISION: I18nManager.forceRTL + app restart is the standard RN
 * approach for RTL. We call it on language switch; the app reload is handled
 * by Expo's Updates module in production. In development, Metro hot-reload
 * picks it up immediately for most layout changes.
 */
function applyRtl(code: LangCode): void {
  const rtl = SUPPORTED_LANGUAGES.find((l) => l.code === code)?.rtl ?? false;
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
  }
}
