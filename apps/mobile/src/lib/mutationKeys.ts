/**
 * mutationKeys.ts — offline-write contract shared by screens and the query client.
 *
 * ARCH-DECISION: This module is intentionally free of native imports
 * (AsyncStorage, NetInfo, api client). Screens import ONLY these keys + variable
 * types, so their jest unit tests never pull in native modules. The actual
 * mutationFn implementations are registered against these same keys in
 * queryClient.ts (imported only by App.tsx).
 *
 * Why keyed defaults: a mutation triggered while offline is PAUSED and persisted
 * to AsyncStorage. After an app restart the persisted entry only carries the
 * mutationKey + variables — React Query rehydrates the fn from the defaults
 * registered under that key, then replays it. Without keyed defaults, a queued
 * offline write would be lost on restart.
 */

export const MUTATION_KEYS = {
  controlSubmit: ['control', 'submit'] as const,
  ncCreate:      ['nonconformity', 'create'] as const,
};

/** A photo picked locally, uploaded as multipart/form-data after the NC exists. */
export interface QueuedPhoto {
  uri:  string;
  name: string;
  type: string;
}

/** Variables for the control-task completion mutation. */
export interface ControlSubmitVars {
  taskId:  string;
  payload: unknown;
}

/** Variables for the NC-create mutation (payload + any attached photos). */
export interface NcCreateVars {
  payload: Record<string, unknown>;
  photos:  QueuedPhoto[];
}

/** Result of the NC-create mutation. */
export interface NcCreateResult {
  photoFailures: number;
}
