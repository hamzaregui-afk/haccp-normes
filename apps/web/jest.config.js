/** @type {import('jest').Config} */
const config = {
  displayName: '@haccp/web',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',

  // Only run component/unit tests — NOT Playwright e2e (those use their own runner)
  testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/src/**/*.test.ts'],

  // Loads @testing-library/jest-dom matchers globally (toBeInTheDocument, etc.)
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],

  // Path aliases matching vite.config.ts resolve.alias
  moduleNameMapper: {
    // Mock api and socket modules that use import.meta (Vite ESM — invalid in Jest CJS)
    '^@/lib/api$':    '<rootDir>/src/lib/__mocks__/api.ts',
    '^@/lib/socket$': '<rootDir>/src/lib/__mocks__/socket.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    // Stub CSS and static asset imports
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg|ico)$': '<rootDir>/src/__mocks__/fileMock.ts',
    // Resolve workspace packages to their source directly (no build step needed)
    '^@haccp/shared-types$':      '<rootDir>/../../packages/shared-types/src',
    '^@haccp/shared-utils$':      '<rootDir>/../../packages/shared-utils/src',
    '^@haccp/shared-errors$':     '<rootDir>/../../packages/shared-errors/src',
    '^@haccp/shared-validators$': '<rootDir>/../../packages/shared-validators/src',
  },

  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      // ARCH-DECISION: ts-jest runs in CommonJS mode (Jest default). Vite uses
      // ESM import.meta.env — stub it here so files that reference it don't
      // throw "Cannot use 'import.meta' outside a module" in tests.
      diagnostics: { ignoreCodes: ['TS2339'] },
    }],
  },

  // Stub import.meta.env for Vite-style env vars so Jest (CommonJS) can parse
  // source files that use VITE_* env vars. Values are empty strings — tests
  // that need specific URLs should mock the api/socket modules directly.
  globals: {
    'import.meta': {
      env: {
        VITE_API_URL:    '',
        VITE_SOCKET_URL: '',
        MODE:            'test',
        DEV:             false,
        PROD:            false,
      },
    },
  },

  // Never run e2e specs in the Jest runner
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],

  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/**/__tests__/**',
    '!src/test-setup.ts',
    '!src/__mocks__/**',
  ],
};

module.exports = config;
