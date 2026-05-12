// Extends Jest matchers with @testing-library/jest-dom assertions
// (toBeInTheDocument, toHaveValue, toBeDisabled, etc.)
import '@testing-library/jest-dom';

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
