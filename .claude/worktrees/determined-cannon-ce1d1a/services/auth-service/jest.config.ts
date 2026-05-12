import type { Config } from 'jest';
import baseConfig from '../../packages/config/jest-base.config';

const config: Config = {
  ...baseConfig,
  displayName: '@haccp/auth-service',
  rootDir: '.',
};

export default config;
