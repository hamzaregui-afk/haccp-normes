import type { Config } from 'jest';

const config: Config = {
  displayName: '@haccp/web',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',

  // Only run component/unit tests — NOT Playwright e2e (those use their own runner)
  testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/src/**/*.test.ts'],

  // Loads @testing-library/jest-dom matchers globally (toBeInTheDocument, etc.)
  // jest key: setupFilesAfterEnv (runs after the test framework installs — not "AfterFramework")
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],

  // Path aliases matching vite.config.ts resolve.alias
  moduleNameMapper: {
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
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
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

export default config;
