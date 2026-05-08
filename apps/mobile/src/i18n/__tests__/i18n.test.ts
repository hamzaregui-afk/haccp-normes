/**
 * i18n.test.ts
 *
 * Unit tests for the mobile i18n module.
 *
 * Covers:
 *  - All three bundles (fr / en / ar) have the same top-level keys
 *  - getByPath returns the correct string for a known key
 *  - getByPath returns the path itself for an unknown key (no crash)
 *  - Each bundle is structurally complete (no missing keys relative to FR)
 *  - AR bundle has RTL locale in SUPPORTED_LANGUAGES
 *  - FR and EN bundles have non-RTL entries
 */

import { fr } from '../locales/fr';
import { en } from '../locales/en';
import { ar } from '../locales/ar';
import { SUPPORTED_LANGUAGES } from '../index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect every dot-notation path from an object. */
function collectPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    collectPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

function getByPath(obj: unknown, path: string): string {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj) as string ?? path;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FR_PATHS = collectPaths(fr);

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Mobile i18n bundles', () => {

  // ── Structural completeness ─────────────────────────────────────────────────

  it('EN bundle has the same keys as FR', () => {
    const enPaths = collectPaths(en);
    expect(enPaths.sort()).toEqual(FR_PATHS.sort());
  });

  it('AR bundle has the same keys as FR', () => {
    const arPaths = collectPaths(ar);
    expect(arPaths.sort()).toEqual(FR_PATHS.sort());
  });

  // ── String resolution ────────────────────────────────────────────────────────

  it('resolves a top-level nested key in FR', () => {
    expect(getByPath(fr, 'auth.loginButton')).toBe('Se connecter');
  });

  it('resolves a top-level nested key in EN', () => {
    expect(getByPath(en, 'auth.loginButton')).toBe('Sign in');
  });

  it('resolves a top-level nested key in AR', () => {
    expect(getByPath(ar, 'auth.loginButton')).toBe('دخول');
  });

  it('resolves a deeply nested key (severity_values)', () => {
    expect(getByPath(fr, 'ncForm.severity_values.CRITICAL')).toBe('Critique');
    expect(getByPath(en, 'ncForm.severity_values.CRITICAL')).toBe('Critical');
    expect(getByPath(ar, 'ncForm.severity_values.CRITICAL')).toBe('حرج');
  });

  it('returns the key path when the key does not exist', () => {
    expect(getByPath(fr, 'nonexistent.deep.key')).toBe('nonexistent.deep.key');
  });

  // ── All bundles contain non-empty strings for every path ────────────────────

  it('all FR values are non-empty strings', () => {
    for (const path of FR_PATHS) {
      const value = getByPath(fr, path);
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('all EN values are non-empty strings', () => {
    for (const path of FR_PATHS) {
      const value = getByPath(en, path);
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('all AR values are non-empty strings', () => {
    for (const path of FR_PATHS) {
      const value = getByPath(ar, path);
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  // ── SUPPORTED_LANGUAGES metadata ─────────────────────────────────────────────

  it('exports exactly 3 supported languages', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(3);
  });

  it('AR is marked as RTL', () => {
    const arMeta = SUPPORTED_LANGUAGES.find((l) => l.code === 'ar');
    expect(arMeta?.rtl).toBe(true);
  });

  it('FR is not RTL', () => {
    const frMeta = SUPPORTED_LANGUAGES.find((l) => l.code === 'fr');
    expect(frMeta?.rtl).toBe(false);
  });

  it('EN is not RTL', () => {
    const enMeta = SUPPORTED_LANGUAGES.find((l) => l.code === 'en');
    expect(enMeta?.rtl).toBe(false);
  });

  // ── Key spot-checks across all sections ──────────────────────────────────────

  it.each([
    ['common.loading',             'Chargement…',           'Loading…',           'جارٍ التحميل…'],
    ['auth.loginError',            'Identifiants incorrects. Veuillez réessayer.', 'Invalid credentials. Please try again.', 'بيانات اعتماد غير صحيحة. يرجى المحاولة مرة أخرى.'],
    ['agenda.tabs.today',          "Aujourd'hui",           'Today',              'اليوم'],
    ['checklist.ok',               '✓ OK',                  '✓ OK',               '✓ مقبول'],
    ['checklist.nok',              '✗ NOK',                 '✗ NOK',              '✗ مرفوض'],
    ['dlc.calculate',              'Calculer la DLC',       'Calculate use-by date', 'حساب تاريخ الصلاحية'],
    ['ncForm.category_values.OTHER', 'Autre',               'Other',              'أخرى'],
  ])('key "%s" translates correctly in all locales', (path, expectedFr, expectedEn, expectedAr) => {
    expect(getByPath(fr, path)).toBe(expectedFr);
    expect(getByPath(en, path)).toBe(expectedEn);
    expect(getByPath(ar, path)).toBe(expectedAr);
  });
});
