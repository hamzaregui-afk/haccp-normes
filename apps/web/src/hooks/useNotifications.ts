import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { getSocket, connectSocket } from '@/lib/socket';

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  markAllRead: () => Promise<void>;
}

// ── Domain event payload shapes ───────────────────────────────────────────────
// These match what notification.consumer.ts spreads into emitToTenant calls.

interface NcCreatedPayload {
  eventId:     string;
  timestamp:   string;
  ncId?:       string;
  severity?:   string;
  category?:   string;
  description?: string;
  createdBy?:  string;
}

interface TaskCompletedPayload {
  eventId:     string;
  timestamp:   string;
  taskId?:     string;
  completedBy?: string;
  status?:     string;
}

interface ReportValidatedPayload {
  eventId:     string;
  timestamp:   string;
  reportId?:   string;
  validatedBy?: string;
  status?:     string;
}

// ── Helpers — synthesise a Notification from a domain event ──────────────────

type TFn = (key: string) => string;

function fromNcCreated(p: NcCreatedPayload, t: TFn): Notification {
  return {
    id:        p.eventId,
    title:     t('notifications.ncCreated'),
    body:      p.description ?? `NC ${p.ncId ?? ''} — ${p.severity ?? '?'} / ${p.category ?? '?'}`,
    type:      'NC_CREATED',
    isRead:    false,
    createdAt: p.timestamp,
  };
}

function fromTaskCompleted(p: TaskCompletedPayload, t: TFn): Notification {
  return {
    id:        p.eventId,
    title:     t('notifications.taskCompleted'),
    body:      `${p.taskId ?? ''} — ${p.completedBy ?? '—'}`,
    type:      'TASK_COMPLETED',
    isRead:    false,
    createdAt: p.timestamp,
  };
}

function fromReportValidated(p: ReportValidatedPayload, t: TFn): Notification {
  return {
    id:        p.eventId,
    title:     t('notifications.reportValidated'),
    body:      `${p.reportId ?? ''} — ${p.validatedBy ?? '—'}`,
    type:      'REPORT_VALIDATED',
    isRead:    false,
    createdAt: p.timestamp,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotifications(): NotificationsState {
  const { t }   = useTranslation();
  const token = useAuthStore((s) => s.accessToken);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // ── Fetch initial notifications via REST ──────────────────────────────────
  useEffect(() => {
    if (!token) return;
    api
      .get<{ data: Notification[] }>('/api/v1/notifications')
      .then((res) => {
        setNotifications(res.data.data);
        setUnreadCount(res.data.data.filter((n) => !n.isRead).length);
      })
      .catch(() => {
        // ARCH-DECISION: Silent fail — notifications are non-blocking.
        // If the service is unavailable on load the user still gets the full
        // app, and real-time events will still populate via Socket.io once
        // the service recovers.
      });
  }, [token]);

  // ── Socket.io real-time subscriptions ────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    // ARCH-DECISION: Use the shared singleton socket (lib/socket.ts) rather
    // than creating a second connection.  All components share one transport;
    // disconnectSocket() on unmount is intentionally NOT called here because
    // other parts of the app (e.g. live sensor charts) may still need the
    // connection.  The socket lifecycle is managed at the app shell level.
    connectSocket();
    const socket = getSocket();

    // Direct user notification (persisted in DB, pushed via user:{id} room)
    const onNew = (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    // Domain event: non-conformity created (tenant-scoped broadcast)
    const onNcCreated = (payload: NcCreatedPayload) => {
      const n = fromNcCreated(payload, t);
      setNotifications((prev) => [n, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    // Domain event: control task completed (tenant-scoped broadcast)
    const onTaskCompleted = (payload: TaskCompletedPayload) => {
      const n = fromTaskCompleted(payload, t);
      setNotifications((prev) => [n, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    // Domain event: report validated (tenant-scoped broadcast)
    const onReportValidated = (payload: ReportValidatedPayload) => {
      const n = fromReportValidated(payload, t);
      setNotifications((prev) => [n, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    socket.on('notification:new',              onNew);
    socket.on('notification:nc-created',       onNcCreated);
    socket.on('notification:task-completed',   onTaskCompleted);
    socket.on('notification:report-validated', onReportValidated);

    return () => {
      socket.off('notification:new',              onNew);
      socket.off('notification:nc-created',       onNcCreated);
      socket.off('notification:task-completed',   onTaskCompleted);
      socket.off('notification:report-validated', onReportValidated);
    };
  }, [token]);

  // ── Mark all read ─────────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    if (!token) return;
    await api.patch('/api/v1/notifications/read');
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, [token]);

  return { notifications, unreadCount, markAllRead };
}
