/**
 * offline.ts — wire React Query's connectivity awareness to the real device.
 *
 * ARCH-DECISION: React Query's onlineManager defaults to `navigator.onLine`,
 * which does not exist / is unreliable in React Native. We drive it from
 * @react-native-community/netinfo instead, so that:
 *  - queries pause/refetch correctly around connectivity changes, and
 *  - mutations triggered offline are paused and auto-resumed on reconnect.
 *
 * Imported only by App.tsx (pulls in the native NetInfo module), so screen unit
 * tests never load it.
 */
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

/** Bridge NetInfo → onlineManager. Call once at app startup. */
export function initOnlineManager(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // isInternetReachable can be null (unknown) right after boot — treat unknown
      // as "reachable" so we don't wrongly pause the app on a cold start.
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
      setOnline(online);
    }),
  );
}
