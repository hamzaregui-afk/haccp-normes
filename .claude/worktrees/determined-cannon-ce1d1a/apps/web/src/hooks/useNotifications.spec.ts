/**
 * useNotifications.spec.ts
 *
 * Unit tests for the useNotifications hook.
 *
 * Strategy:
 *  - Mock @/lib/socket  → expose a fake EventEmitter so we can trigger events
 *  - Mock @/lib/api     → return an empty notification list on GET
 *  - Mock @/store/auth.store → return a fake token so the hook's guards pass
 *  - Use renderHook from @testing-library/react
 *  - Emit domain events directly on the fake socket and assert state updates
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { EventEmitter } from 'events';

// ── Fake react-i18next ────────────────────────────────────────────────────────
// The hook calls useTranslation() to get t() for notification titles.
// We return a simple passthrough that echoes the key so tests can assert on keys.

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// ── Fake socket ───────────────────────────────────────────────────────────────

const fakeSocket = new EventEmitter();

jest.mock('@/lib/socket', () => ({
  getSocket:        () => fakeSocket,
  connectSocket:    jest.fn(),
  disconnectSocket: jest.fn(),
}));

// ── Fake auth store ───────────────────────────────────────────────────────────

jest.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { accessToken: string }) => unknown) =>
    selector({ accessToken: 'fake-jwt-token' }),
}));

// ── Fake API ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  api: {
    get:   jest.fn().mockResolvedValue({ data: { data: [] } }),
    patch: jest.fn().mockResolvedValue({}),
  },
}));

// ── Import hook after mocks are set up ────────────────────────────────────────

import { useNotifications } from './useNotifications';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NC_PAYLOAD = {
  eventId:     'evt-nc-001',
  timestamp:   '2026-05-07T10:00:00.000Z',
  ncId:        'nc-001',
  severity:    'HIGH',
  category:    'TEMPERATURE',
  description: 'Freezer temp exceeded 4°C',
  createdBy:   'operator-001',
};

const TASK_PAYLOAD = {
  eventId:     'evt-task-001',
  timestamp:   '2026-05-07T10:05:00.000Z',
  taskId:      'task-001',
  completedBy: 'operator-001',
  status:      'COMPLETED',
};

const REPORT_PAYLOAD = {
  eventId:     'evt-report-001',
  timestamp:   '2026-05-07T10:10:00.000Z',
  reportId:    'report-001',
  validatedBy: 'manager-001',
  status:      'VALIDATED',
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('useNotifications', () => {
  it('starts with an empty notification list', async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(0);
      expect(result.current.unreadCount).toBe(0);
    });
  });

  describe('notification:nc-created', () => {
    it('prepends a NC_CREATED notification and increments unreadCount', async () => {
      const { result } = renderHook(() => useNotifications());
      await waitFor(() => expect(result.current.notifications).toHaveLength(0));

      act(() => {
        fakeSocket.emit('notification:nc-created', NC_PAYLOAD);
      });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
        expect(result.current.unreadCount).toBe(1);
      });

      const n = result.current.notifications[0];
      expect(n.id).toBe('evt-nc-001');
      expect(n.type).toBe('NC_CREATED');
      expect(n.isRead).toBe(false);
      expect(n.body).toContain('Freezer temp exceeded 4°C');
    });
  });

  describe('notification:task-completed', () => {
    it('prepends a TASK_COMPLETED notification and increments unreadCount', async () => {
      const { result } = renderHook(() => useNotifications());
      await waitFor(() => expect(result.current.notifications).toHaveLength(0));

      act(() => {
        fakeSocket.emit('notification:task-completed', TASK_PAYLOAD);
      });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
        expect(result.current.unreadCount).toBe(1);
      });

      const n = result.current.notifications[0];
      expect(n.id).toBe('evt-task-001');
      expect(n.type).toBe('TASK_COMPLETED');
      expect(n.isRead).toBe(false);
      expect(n.body).toContain('task-001');
      expect(n.body).toContain('operator-001');
    });
  });

  describe('notification:report-validated', () => {
    it('prepends a REPORT_VALIDATED notification and increments unreadCount', async () => {
      const { result } = renderHook(() => useNotifications());
      await waitFor(() => expect(result.current.notifications).toHaveLength(0));

      act(() => {
        fakeSocket.emit('notification:report-validated', REPORT_PAYLOAD);
      });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
        expect(result.current.unreadCount).toBe(1);
      });

      const n = result.current.notifications[0];
      expect(n.id).toBe('evt-report-001');
      expect(n.type).toBe('REPORT_VALIDATED');
      expect(n.isRead).toBe(false);
      expect(n.body).toContain('report-001');
      expect(n.body).toContain('manager-001');
    });
  });

  describe('multiple domain events', () => {
    it('accumulates all three events in order (newest first)', async () => {
      const { result } = renderHook(() => useNotifications());
      await waitFor(() => expect(result.current.notifications).toHaveLength(0));

      act(() => {
        fakeSocket.emit('notification:nc-created',       NC_PAYLOAD);
        fakeSocket.emit('notification:task-completed',   TASK_PAYLOAD);
        fakeSocket.emit('notification:report-validated', REPORT_PAYLOAD);
      });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(3);
        expect(result.current.unreadCount).toBe(3);
      });

      // Newest (last emitted) is at index 0
      expect(result.current.notifications[0].type).toBe('REPORT_VALIDATED');
      expect(result.current.notifications[1].type).toBe('TASK_COMPLETED');
      expect(result.current.notifications[2].type).toBe('NC_CREATED');
    });
  });

  describe('markAllRead', () => {
    it('sets all notifications to isRead=true and resets unreadCount', async () => {
      const { result } = renderHook(() => useNotifications());
      await waitFor(() => expect(result.current.notifications).toHaveLength(0));

      act(() => {
        fakeSocket.emit('notification:nc-created', NC_PAYLOAD);
      });
      await waitFor(() => expect(result.current.unreadCount).toBe(1));

      await act(async () => {
        await result.current.markAllRead();
      });

      expect(result.current.unreadCount).toBe(0);
      expect(result.current.notifications.every((n) => n.isRead)).toBe(true);
    });
  });
});
