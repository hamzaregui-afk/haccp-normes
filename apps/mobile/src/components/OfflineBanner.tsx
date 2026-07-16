import { onlineManager, useIsMutating } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '@/i18n';

// Subscribe to React Query's connectivity state (driven by NetInfo — see offline.ts).
function useIsOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  );
}

/**
 * A thin overlay bar surfacing offline / syncing state.
 *
 * ARCH-DECISION: position:absolute so it never disturbs the navigator's layout.
 * `useIsMutating()` counts pending mutations — offline these are the writes
 * queued for replay; online>0 means they are actively syncing.
 */
export function OfflineBanner() {
  const online = useIsOnline();
  const pending = useIsMutating();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (online && pending === 0) return null;

  const offlineLabel = pending > 0
    ? `${t('offline.offline')} · ${pending} ${t('offline.pending')}`
    : t('offline.offline');

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top + 4, backgroundColor: online ? '#B5833A' : '#991B1B' },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{online ? t('offline.syncing') : offlineLabel}</Text>
    </View>
  );
}

OfflineBanner.displayName = 'OfflineBanner';

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingBottom: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
