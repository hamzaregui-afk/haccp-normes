import type { Config } from 'jest';
import baseConfig from '../../packages/config/jest-base.config';

const config: Config = {
  ...baseConfig,
  displayName: '@haccp/control-service',
  rootDir: '.',
  // Map @prisma/client to this service's own generated client so runtime enum
  // values (TaskStatus, OutboxEventStatus, Prisma.JsonNull) resolve without
  // clobbering other services in the shared pnpm store. See schema.prisma.
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^@prisma/client$': '<rootDir>/prisma/generated/test-client',
  },
};

export default config;
