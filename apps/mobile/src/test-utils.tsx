/**
 * Shared test helpers for React Native screen tests.
 *
 * ARCH-DECISION: Screens consume `useTranslation()` from the i18n context, which
 * throws if rendered outside an <I18nProvider>. Rather than mocking `@/i18n` in
 * every test file (and maintaining a parallel translation map), we wrap the unit
 * under test in the REAL provider pinned to French — the default, regulatory
 * locale. Assertions can then match the actual fr.ts copy, so the tests double
 * as a guard against accidental translation-key drift.
 */
import React from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';

import { I18nProvider } from './i18n';

export function renderWithI18n(
  ui: React.ReactElement,
  options?: RenderOptions,
) {
  return render(<I18nProvider initialLang="fr">{ui}</I18nProvider>, options);
}
