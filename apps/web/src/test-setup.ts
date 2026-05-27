// Extends Jest matchers with @testing-library/jest-dom assertions
// (toBeInTheDocument, toHaveValue, toBeDisabled, etc.)
import '@testing-library/jest-dom';

// ─── react-i18next global test shim ──────────────────────────────────────────
// Initialize i18next with the real French locale so components that call
// useTranslation() render their actual translated strings in tests.
//
// ARCH-DECISION: `initImmediate: false` makes i18next.init() synchronous so
// translations are available before the first test render. Without it the init
// Promise resolves asynchronously and t() returns the raw key on first render.
//
// require() is used (not import) because ts-jest runs in CommonJS mode and
// top-level await is unavailable in setupFilesAfterEnv.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const fr: Record<string, unknown> = require('./i18n/locales/fr').default;

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng:           'fr',
    fallbackLng:   'fr',
    initImmediate: false,   // <-- synchronous init
    resources:     { fr: { translation: fr } },
    interpolation: { escapeValue: false },
  });
}

// Stub window.matchMedia — not available in jsdom but referenced by recharts
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Stub ResizeObserver — used by recharts ResponsiveContainer
// ARCH-DECISION: Use window instead of global — this file runs in jsdom (browser-like env),
// not Node.js. The web tsconfig has only DOM libs, so `global` is not typed.
(window as unknown as Record<string, unknown>)['ResizeObserver'] = class ResizeObserver {
  observe()   { /* no-op */ }
  unobserve() { /* no-op */ }
  disconnect(){ /* no-op */ }
};

// Suppress noisy console.error in tests (e.g. React act() warnings)
// Remove if you want full output during debugging.
const originalError = console.error.bind(console);
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = String(args[0]);
    if (
      msg.includes('Warning: ReactDOM.render') ||
      msg.includes('Warning: An update to') ||
      msg.includes('act(...)') ||
      msg.includes('not wrapped in act')
    ) {
      return;
    }
    originalError(...args);
  };
});
afterAll(() => { console.error = originalError; });
