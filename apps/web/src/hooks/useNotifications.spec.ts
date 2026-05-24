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

  describe('notification:task-assigned', () => {
    const TASK_ASSIGNED_PAYLOAD = {
      eventId:      'evt-assigned-001',
      timestamp:    '2026-05-07T10:15:00.000Z',
      taskId:       'task-002',
      assigneeId:   'operator-002',
      groupId:      null,
      templateName: 'Contrôle température frigo',
      scheduledAt:  '2026-05-08T08:00:00.000Z',
    };

    it('prepends a TASK_ASSIGNED notification with templateName in body', async () => {
      const { result } = renderHook(() => useNotifications());
      await waitFor(() => expect(result.current.notifications).toHaveLength(0));

      act(() => {
        fakeSocket.emit('notification:task-assigned', TASK_ASSIGNED_PAYLOAD);
      });

      await waitFor(() => {
        expect(result.current.notifications).toHaveLength(1);
        expect(result.current.unreadCount).toBe(1);
      });

      const n = result.current.notifications[0];
      expect(n.id).toBe('evt-assigned-001');
      expect(n.type).toBe('TASK_ASSIGNED');
      expect(n.isRead).toBe(false);
      // body should contain the human-readable template name
      expect(n.body).toContain('Contrôle température frigo');
    });

    it('falls back to taskId when templateName is absent', async () => {
      const payloadWithoutName = { ...TASK_ASSIGNED_PAYLOAD, templateName: undefined, eventId: 'evt-assigned-002' };
      const { result } = renderHook(() => useNotifications());
      await waitFor(() => expect(result.current.notifications).toHaveLength(0));

      act(() => {
        fakeSocket.emit('notification:task-assigned', payloadWithoutName);
      });

      await waitFor(() => expect(result.current.notifications).toHaveLength(1));

      expect(result.current.notifications[0].body).toContain('task-002');
    });

    it('deduplicates the same eventId', async () => {
      const { result } = renderHook(() => useNotifications());
      await waitFor(() => expect(result.current.notifications).toHaveLength(0));

      act(() => {
        fakeSocket.emit('notification:task-assigned', TASK_ASSIGNED_PAYLOAD);
        fakeSocket.emit('notification:task-assigned', TASK_ASSIGNED_PAYLOAD); // duplicate
      });

      await waitFor(() => expect(result.current.notifications).toHaveLength(1));
      expect(result.current.unreadCount).toBe(1);
    });
  });

  describe('notification:tasks-overdue', () => {
    const OVERDUE_PAYLOAD = {
      eventId:   'evt-overdue-001',
      timestamp: '2026-05-07T10:20:00.000Z',
      count:     3,
      taskIds:   ['task-10', 'task-11', 'task-12'],
    };

    it('does NOT add to notification list (toast-only)', async () => {
      const { result } = renderHook(() => useNotifications());
      await waitFor(() => expect(result.current.notifications).toHaveLength(0));

      act(() => {
        fakeSocket.emit('notification:tasks-overdue', OVERDUE_PAYLOAD);
      });

      // Give React a tick to process state changes
      await waitFor(() => expect(result.current.notifications).toHaveLength(0));
      expect(result.current.unreadCount).toBe(0);
    });
  });

  describe('notification:dlc-expiring-today', () => {
    const DLC_PAYLOAD = {
      eventId:   'evt-dlc-001',
      timestamp: '2026-05-07T07:00:00.000Z',
      count:     4,
      labels: [
        { productName: 'Poulet rôti',  lotNumber: 'LOT-001' },
        { productName: 'Fromage blanc', lotNumber: null },
      ],
    };

    it('does NOT add to notification list (toast-only)', async () => {
      const { result } = renderHook(() => useNotifications());
      await waitFor(() => expect(result.current.notifications).toHaveLength(0));

      act(() => {
        fakeSocket.emit('notification:dlc-expiring-today', DLC_PAYLOAD);
      });

      await waitFor(() => expect(result.current.notifications).toHaveLength(0));
      expect(result.current.unreadCount).toBe(0);
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
