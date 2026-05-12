import type { Config } from 'jest';

/**
 * Shared Jest base configuration for all NestJS microservices.
 * Each service creates a jest.config.ts that spreads this and overrides
 * only service-specific fields (displayName, moduleNameMapper extras, etc.)
 *
 * Unit tests only — integration tests use a separate jest.integration.config.ts
 * per service so they can be opted-in explicitly (they require Docker).
 */
const baseConfig: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Match *.spec.ts files anywhere in src/ — excludes integration tests
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '\\.integration\\.test\\.ts$',
  ],

  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          // Inherit the service's local tsconfig but force CommonJS for Jest
          module: 'commonjs',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
        },
      },
    ],
  },

  // Resolve @haccp/* workspace packages to their source directly
  // (avoids needing a build step before running tests)
  moduleNameMapper: {
    '^@haccp/shared-types$':      '<rootDir>/../../packages/shared-types/src',
    '^@haccp/shared-utils$':      '<rootDir>/../../packages/shared-utils/src',
    '^@haccp/shared-errors$':     '<rootDir>/../../packages/shared-errors/src',
    '^@haccp/shared-validators$': '<rootDir>/../../packages/shared-validators/src',
  },

  // Per-test timeout — unit tests should never need more than 10s
  testTimeout: 10_000,

  // Coverage settings (only collected when `--coverage` flag is passed)
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.integration.test.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/prisma/**',
  ],
  coverageReporters: ['text-summary', 'lcov'],

  verbose: false,
};

export default baseConfig;
