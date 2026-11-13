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

// expo-print / expo-sharing: stub every method the screens call so tests can
// override them per-case (DLCScreen uses printToFileAsync + isAvailableAsync).
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
  printAsync:       jest.fn(),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync:       jest.fn(),
}));

// react-native-ble-plx: native BLE module — stub the manager so imports resolve
// in jest. Tests that exercise bluetoothPrint override these per-case.
// virtual:true so the mock resolves even when the native package is not
// physically installed in the local tree (it is installed in CI/EAS builds).
jest.mock(
  'react-native-ble-plx',
  () => {
    class BleManager {
      state = jest.fn().mockResolvedValue('PoweredOn');
      onStateChange = jest.fn((cb: (s: string) => void, emitCurrent: boolean) => {
        if (emitCurrent) cb('PoweredOn');
        return { remove: jest.fn() };
      });
      startDeviceScan = jest.fn();
      stopDeviceScan = jest.fn();
      connectToDevice = jest.fn();
      cancelDeviceConnection = jest.fn().mockResolvedValue(undefined);
    }
    return { BleManager, State: { PoweredOn: 'PoweredOn', PoweredOff: 'PoweredOff' } };
  },
  { virtual: true },
);

// React Native's Alert — control it in tests
jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);

// React Native's I18nManager — forceRTL is a no-op in tests
const { I18nManager } = require('react-native');
if (I18nManager) {
  I18nManager.forceRTL = jest.fn();
}
