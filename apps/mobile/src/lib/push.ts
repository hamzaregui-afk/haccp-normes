/**
 * push.ts — Expo push-notification registration for the mobile app.
 *
 * Registers the device's Expo push token with the backend so notification-service
 * can send alerts (NC created → managers/quality, task assigned → the operator).
 * All calls are best-effort: push must never block login or crash the app.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiClient } from '../api/client';

// Public EAS project id (from app.json > extra.eas.projectId). Required by
// getExpoPushTokenAsync in standalone builds.
const EAS_PROJECT_ID = '86958c9b-32bc-4429-a8a3-1d78d85b8a6d';

// Foreground behaviour: surface incoming notifications while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// The last token we successfully registered — lets us skip redundant POSTs and
// gives unregisterForPush() something to delete on logout.
let registeredToken: string | null = null;

/** Request permission, obtain the Expo push token, and register it with the API. */
export async function registerForPush(): Promise<void> {
  try {
    // Android 8+ requires an explicit notification channel or notifications are
    // silently dropped / shown at minimal importance. Register one up front.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:             'Alertes HACCP',
        importance:       Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    if (!token || token === registeredToken) return;

    await apiClient.post('/api/v1/notifications/devices', {
      expoPushToken: token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    registeredToken = token;
  } catch {
    // Best-effort — a push-registration failure must never surface to the user.
  }
}

/** Remove the current device token (call on logout). */
export async function unregisterForPush(): Promise<void> {
  if (!registeredToken) return;
  try {
    await apiClient.delete('/api/v1/notifications/devices', {
      data: { expoPushToken: registeredToken },
    });
  } catch {
    // Ignore — Expo also purges dead tokens server-side via DeviceNotRegistered.
  }
  registeredToken = null;
}
