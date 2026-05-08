import fr from './locales/fr.json';
import en from './locales/en.json';

export const locales = { fr, en } as const;
export type Locale = keyof typeof locales;
export type TranslationKey = keyof typeof fr;

export const DEFAULT_LOCALE: Locale = 'fr';
export const SUPPORTED_LOCALES: Locale[] = ['fr', 'en'];
