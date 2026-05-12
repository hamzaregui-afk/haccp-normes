import type { Config } from 'jest';
import baseConfig from '../../packages/config/jest-base.config';

const config: Config = {
  ...baseConfig,
  displayName: '@haccp/report-service',
  rootDir: '.',
};

export default config;
