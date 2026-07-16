/**
 * queryClient.ts — the app's single QueryClient, configured for offline-first.
 *
 * Imported ONLY by App.tsx (it pulls in AsyncStorage). Screens import their
 * mutation keys/types from mutationKeys.ts instead, keeping their unit tests
 * free of native modules.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

import { controlClient, nonconformityClient } from '../api/client';
import {
  MUTATION_KEYS,
  type ControlSubmitVars,
  type NcCreateResult,
  type NcCreateVars,
} from './mutationKeys';

// ARCH-DECISION: gcTime is long (24 h) so cached reads (agenda, checklist
// templates, sites) survive in the persisted cache and are available offline.
// Mutations use the default networkMode 'online': triggered offline they are
// PAUSED (not failed) and auto-resume on reconnect / after restart via
// resumePausedMutations().
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
    },
    mutations: {
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    },
  },
});

// Register the offline-replayable write mutations against their keys. A mutation
// paused offline is persisted with only its key + variables; on replay React
// Query looks up the fn here. See mutationKeys.ts.
queryClient.setMutationDefaults(MUTATION_KEYS.controlSubmit, {
  mutationFn: async (vars: ControlSubmitVars) => {
    await controlClient.patch(`/api/v1/controls/tasks/${vars.taskId}`, vars.payload);
  },
});

queryClient.setMutationDefaults(MUTATION_KEYS.ncCreate, {
  mutationFn: async (vars: NcCreateVars): Promise<NcCreateResult> => {
    const res = await nonconformityClient.post<{ data?: { id?: string } }>(
      '/api/v1/nonconformities',
      vars.payload,
    );
    const ncId = res?.data?.data?.id;

    let photoFailures = 0;
    if (ncId && vars.photos.length > 0) {
      for (const photo of vars.photos) {
        try {
          const form = new FormData();
          form.append('file', { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
          await nonconformityClient.post(`/api/v1/nonconformities/${ncId}/photos`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          photoFailures += 1;
        }
      }
    }
    return { photoFailures };
  },
});

// AsyncStorage-backed persister — mirrors the query + paused-mutation cache to
// disk so the app is usable offline and queued writes survive a restart.
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  throttleTime: 1000,
});
