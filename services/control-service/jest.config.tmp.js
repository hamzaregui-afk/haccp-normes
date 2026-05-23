module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './src',
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: './tsconfig.spec.json',
    }],
  },
  moduleNameMapper: {
    '^@haccp/shared-types$': '<rootDir>/../../../packages/shared-types/src',
  },
  testTimeout: 10000,
};
