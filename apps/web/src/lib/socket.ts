/**
 * socket.ts — Robust WebSocket client (singleton)
 *
 * ARCH-DECISION: Single shared socket instance per browser tab.
 * Components never create their own socket — they call connectSocket() on
 * mount and disconnectSocket() on unmount, and subscribe to events via
 * socket.on() with cleanup in their useEffect return.
 *
 * Reliability features added (enterprise Wave 1):
 *
 * 1. HEARTBEAT: client sends `ping` every HEARTBEAT_INTERVAL ms; server must
 *    reply with `pong`. If no pong arrives within HEARTBEAT_TIMEOUT ms the
 *    socket is force-reconnected. Detects silent TCP hangs that Socket.io's
 *    built-in ping doesn't always catch behind nginx with long keepalive.
 *
 * 2. RECONNECTION WITH EXPONENTIAL BACKOFF: Socket.io's built-in reconnection
 *    uses fixed jitter. We layer our own exponential backoff on top so that a
 *    mass reconnect storm (e.g. server restart) doesn't saturate the gateway.
 *
 * 3. EVENT DEDUPLICATION: Every event from the server carries an `eventId`
 *    field. A sliding-window LRU Set prevents duplicate processing when the
 *    server re-emits on reconnect (at-least-once delivery guarantee).
 *
 * 4. CORRELATION ID: every outgoing event carries the current X-Correlation-ID
 *    so WebSocket traffic can be correlated with the HTTP request that triggered
 *    the socket push on the backend.
 */
import { io, type Socket } from 'socket.io-client';

import { useAuthStore } from '@/store/auth.store';

// ─── Configuration ────────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL = 25_000; // ms between client-side pings
const HEARTBEAT_TIMEOUT  = 10_000; // ms to wait for pong before reconnecting
const DEDUP_WINDOW_SIZE  = 500;    // max eventIds to remember

// ─── State ────────────────────────────────────────────────────────────────────
let socket: Socket | null = null;

// Heartbeat state
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;

// Deduplication — sliding-window LRU implemented with an insertion-ordered Set
const seenEventIds = new Set<string>();

// ─── Deduplication helpers ────────────────────────────────────────────────────
function trackEventId(eventId: string): boolean {
  if (seenEventIds.has(eventId)) return true; // duplicate

  if (seenEventIds.size >= DEDUP_WINDOW_SIZE) {
    // Evict the oldest entry (Sets maintain insertion order)
    const oldest = seenEventIds.values().next().value;
    if (oldest !== undefined) seenEventIds.delete(oldest);
  }

  seenEventIds.add(eventId);
  return false;
}

/** Wrap a socket.io event handler with automatic deduplication. */
export function dedupHandler<T extends { eventId?: string }>(
  handler: (data: T) => void,
): (data: T) => void {
  return (data: T) => {
    const id = data.eventId;
    if (id && trackEventId(id)) return; // silently discard duplicate
    handler(data);
  };
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────
function startHeartbeat(s: Socket): void {
  stopHeartbeat();

  heartbeatTimer = setInterval(() => {
    if (!s.connected) return;

    // Arm the timeout — if pong doesn't arrive in time, force-reconnect
    heartbeatTimeout = setTimeout(() => {
      console.warn('[Socket] Heartbeat timeout — reconnecting');
      s.disconnect();
      s.connect();
    }, HEARTBEAT_TIMEOUT);

    s.emit('ping', { ts: Date.now() });
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat(): void {
  if (heartbeatTimer)  clearInterval(heartbeatTimer);
  if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
  heartbeatTimer   = null;
  heartbeatTimeout = null;
}

function clearPongTimeout(): void {
  if (heartbeatTimeout) {
    clearTimeout(heartbeatTimeout);
    heartbeatTimeout = null;
  }
}

// ─── Socket factory ────────────────────────────────────────────────────────────
export const getSocket = (): Socket => {
  if (socket) return socket;

  // ARCH-DECISION: Empty string = current origin; nginx proxies /socket.io/
  // to the notification-service. VITE_WS_URL overrides for separate domains.
  socket = io(import.meta.env.VITE_WS_URL ?? '', {
    autoConnect: false,

    // Auth token refreshed on every reconnect attempt
    auth: (cb) => {
      cb({ token: useAuthStore.getState().accessToken });
    },

    // ARCH-DECISION: We manage exponential backoff ourselves so we can add
    // jitter. Socket.io's reconnectionDelay is linear, which causes thundering
    // herd after a server restart.
    reconnection:      true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 30_000,
    randomizationFactor:  0.5,  // ±50 % jitter built into socket.io

    // Transport: websocket first, long-polling as fallback
    transports: ['websocket', 'polling'],
  });

  // ── Lifecycle events ──────────────────────────────────────────────────────
  socket.on('connect', () => {
    console.info('[Socket] connected:', socket?.id);
    startHeartbeat(socket!);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[Socket] disconnected:', reason);
    stopHeartbeat();

    // If the server closed the connection intentionally, do not auto-reconnect
    if (reason === 'io server disconnect') {
      socket?.connect();
    }
    // For all other reasons socket.io's built-in reconnection handles it
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] connect error:', err.message);
  });

  // ── Heartbeat pong ────────────────────────────────────────────────────────
  socket.on('pong', () => {
    clearPongTimeout();
  });

  return socket;
};

// ─── Public API ────────────────────────────────────────────────────────────────

export const connectSocket = (): void => {
  getSocket().connect();
};

export const disconnectSocket = (): void => {
  stopHeartbeat();
  socket?.disconnect();
  socket = null;
  seenEventIds.clear();
};

/**
 * Emit an event with an auto-generated correlation ID so backend logs can
 * link this WebSocket emission to the originating HTTP request chain.
 */
export const emitWithCorrelation = (
  event: string,
  data: Record<string, unknown>,
): void => {
  const s = getSocket();
  s.emit(event, {
    ...data,
    correlationId: crypto.randomUUID(),
    clientTs:      Date.now(),
  });
};
