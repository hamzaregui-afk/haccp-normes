/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.base.json', './apps/*/tsconfig.json', './services/*/tsconfig.json', './packages/*/tsconfig.json'],
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict',
    'plugin:@typescript-eslint/stylistic',
    'prettier',
  ],
  rules: {
    // Enforce no-any across the entire monorepo
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    // Enforce Result-based error handling patterns
    '@typescript-eslint/no-throw-literal': 'error',
    // Consistent imports
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    // Prevent accidental floating promises (critical for async NestJS handlers)
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
  },
  ignorePatterns: ['dist/', 'build/', 'node_modules/', '*.js', '!.eslintrc.js', 'coverage/'],
};
