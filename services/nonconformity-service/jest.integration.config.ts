/**
 * Jest configuration for integration tests (Testcontainers + real PostgreSQL).
 *
 * Kept separate from the default jest.config.ts so that:
 *   - `pnpm test` runs only fast unit tests (no Docker required)
 *   - `pnpm test:integration` runs only integration tests (requires Docker)
 *
 * Run: pnpm --filter @haccp/nonconformity-service test:integration
 */
import type { Config } from 'jest';

const config: Config = {
  // Use ts-jest so TypeScript files are transpiled without a separate build step
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Only match integration test files
  testRegex: '\\.integration\\.test\\.ts$',

  // Point ts-jest at the local tsconfig so path aliases resolve correctly
  globals: {
    'ts-jest': {
      tsconfig: {
        // Inherit base settings but override module to commonjs for Jest compatibility
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          module: 'commonjs',
        },
      },
    },
  },

  // Integration tests can be slow — allow 3 minutes per test file
  testTimeout: 180_000,

  // Run tests serially within a file and across files:
  // Testcontainers manages one container per suite (beforeAll/afterAll),
  // so parallel runners would compete for the same Docker resources.
  // --runInBand is set via CLI in the npm script.
  maxWorkers: 1,

  // Verbose output helps diagnose container startup failures in CI
  verbose: true,

  // Collect coverage only when explicitly requested (not in standard CI runs)
  collectCoverage: false,

  // Force Jest to exit after all tests complete (prevents open DB connections
  // from hanging the process if afterAll cleanup fails)
  forceExit: true,

  // Detect open handles so we can catch missed disconnects during development
  detectOpenHandles: true,
};

export default config;
