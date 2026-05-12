/**
 * React Native / Jest test setup
 *
 * Runs after the Jest test framework is installed in the environment.
 * Loads @testing-library/jest-native matchers (toBeVisible, toHaveTextContent, etc.)
 * and stubs out native modules that are not available in the JS test runner.
 */

import '@testing-library/jest-native/extend-expect';

// ── Stub Expo / RN modules that have no JS implementation ────────────────────

// expo-secure-store: tests don't persist tokens
jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn().mockResolvedValue(null),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// expo-camera
jest.mock('expo-camera', () => ({ Camera: {} }));

// expo-print / expo-sharing: not needed in unit tests
jest.mock('expo-print',   () => ({ printAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync:  jest.fn() }));

// React Native's Alert — control it in tests
jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);

// React Native's I18nManager — forceRTL is a no-op in tests
const { I18nManager } = require('react-native');
if (I18nManager) {
  I18nManager.forceRTL = jest.fn();
}
