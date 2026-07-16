import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner } from './src/components/OfflineBanner';
import { initOnlineManager } from './src/lib/offline';
import { asyncStoragePersister, queryClient } from './src/lib/queryClient';
import { RootNavigator } from './src/navigation/RootNavigator';

// Bridge device connectivity → React Query (must run before the tree mounts).
initOnlineManager();

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        // Keep the offline cache for a week; older snapshots are discarded.
        maxAge: 1000 * 60 * 60 * 24 * 7,
      }}
      // Once the persisted cache is restored, replay any writes that were queued
      // while offline in a previous session.
      onSuccess={() => {
        void queryClient.resumePausedMutations();
      }}
    >
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#1A3D2B" />
        <OfflineBanner />
        <RootNavigator />
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}
