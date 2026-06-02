/**
 * Global Jest mock for @/store/auth.store
 *
 * Used by jest.config.js moduleNameMapper so all feature-page tests get a
 * default ADMIN user without each test file having to call jest.mock().
 *
 * Tests that need a different user (e.g. null, VIEWER, SUPER_ADMIN) can still
 * override this per-file with jest.mock('@/store/auth.store', () => ({ ... })).
 */

type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'QUALITY_OFFICER'
  | 'OPERATOR'
  | 'VIEWER';

interface MockUser {
  sub:       string;
  email:     string;
  role:      Role;
  tenantId:  string;
  name:      string;
  modules?:  string[];
}

interface MockState {
  accessToken:  string;
  refreshToken: string;
  user:         MockUser;
  setTokens:    jest.Mock;
  refreshTokens:jest.Mock;
  logout:       jest.Mock;
  hasRole:      jest.Mock;
  isSuperAdmin: jest.Mock;
  hasModule:    jest.Mock;
  allowedModules: jest.Mock;
}

const MOCK_STATE: MockState = {
  accessToken:  'mock-access-token',
  refreshToken: 'mock-refresh-token',
  user: {
    sub:      'user-admin-test-001',
    email:    'admin@haccp-test.com',
    role:     'ADMIN',
    tenantId: 'tenant-test-001',
    name:     'Admin Test',
    modules:  [
      'DASHBOARD', 'HACCP_CONTROLS', 'NONCONFORMITIES', 'DLC', 'REPORTS',
      'EQUIPMENTS', 'PRODUCTS', 'SUPPLIERS', 'GED', 'NOTIFICATIONS', 'AUDIT',
    ],
  },
  setTokens:     jest.fn(),
  refreshTokens: jest.fn().mockResolvedValue(undefined),
  logout:        jest.fn().mockResolvedValue(undefined),
  hasRole:       jest.fn().mockReturnValue(true),
  isSuperAdmin:  jest.fn().mockReturnValue(false),
  hasModule:     jest.fn().mockReturnValue(true),
  allowedModules: jest.fn().mockReturnValue([]),
};

// Simulate Zustand's hook: useAuthStore(selector) pattern
export const useAuthStore = jest.fn(<T>(selector?: (state: MockState) => T): T | MockState => {
  if (typeof selector === 'function') return selector(MOCK_STATE);
  return MOCK_STATE;
});
