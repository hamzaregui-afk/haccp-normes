import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { getSocket, connectSocket } from '@/lib/socket';
import { showToast } from '@/components/ui/Toast';

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

interface DlcExpiringTodayPayload {
  eventId:   string;
  timestamp: string;
  count:     number;
  labels?:   Array<{ productName: string; lotNumber?: string | null }>;
}

interface TaskAssignedPayload {
  eventId:       string;
  timestamp:     string;
  taskId?:       string;
  assigneeId?:   string | null;
  groupId?:      string | null;
  templateName?: string;
  scheduledAt?:  string;
}

interface TasksOverduePayload {
  eventId:   string;
  timestamp: string;
  count:     number;
  taskIds?:  string[];
}

// ── Helpers — synthesise a Notification from a domain event ──────────────────

type TFn = (key: string, opts?: Record<string, string | number>) => string;

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

function fromTaskAssigned(p: TaskAssignedPayload, t: TFn): Notification {
  return {
    id:        p.eventId,
    title:     t('notifications.taskAssigned'),
    body:      p.templateName ?? t('notifications.taskFallback', { id: p.taskId ?? '' }),
    type:      'TASK_ASSIGNED',
    isRead:    false,
    createdAt: p.timestamp,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotifications(): NotificationsState {
  const { t }   = useTranslation();
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
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
      setNotifications((prev) => {
        // Deduplication: don't add the same id twice
        if (prev.some((e) => e.id === notification.id)) return prev;
        return [notification, ...prev];
      });
      setUnreadCount((prev) => prev + 1);
      showToast({ title: notification.title, body: notification.body, variant: 'info' });
    };

    // Domain event: non-conformity created (tenant-scoped broadcast)
    const onNcCreated = (payload: NcCreatedPayload) => {
      const n = fromNcCreated(payload, t);
      setNotifications((prev) => {
        if (prev.some((e) => e.id === n.id)) return prev;
        return [n, ...prev];
      });
      setUnreadCount((prev) => prev + 1);
      showToast({ title: n.title, body: n.body, variant: 'warning' });
    };

    // Domain event: control task completed (tenant-scoped broadcast)
    const onTaskCompleted = (payload: TaskCompletedPayload) => {
      const n = fromTaskCompleted(payload, t);
      setNotifications((prev) => {
        // Deduplication: don't add the same eventId twice
        if (prev.some((existing) => existing.id === n.id)) return prev;
        return [n, ...prev];
      });
      setUnreadCount((prev) => prev + 1);
      showToast({ title: n.title, body: n.body, variant: 'success' });
      // Invalidate task list and stats so managers see updated data without manual refresh
      void queryClient.invalidateQueries({ queryKey: ['controls.tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['controls.stats'] });
    };

    // Domain event: report validated (tenant-scoped broadcast)
    const onReportValidated = (payload: ReportValidatedPayload) => {
      const n = fromReportValidated(payload, t);
      setNotifications((prev) => {
        if (prev.some((e) => e.id === n.id)) return prev;
        return [n, ...prev];
      });
      setUnreadCount((prev) => prev + 1);
      showToast({ title: n.title, body: n.body, variant: 'success' });
    };

    // Domain event: DLC labels expiring today (tenant-scoped broadcast, daily 07:00 UTC)
    const onDlcExpiring = (payload: DlcExpiringTodayPayload) => {
      const body = payload.labels?.slice(0, 3).map((l) => l.productName).join(', ')
        ?? t('notifications.dlcExpiringProducts', { count: payload.count });
      showToast({
        title: t('notifications.dlcExpiringTitle', { count: payload.count }),
        body,
        variant: 'warning',
      });
    };

    // Domain event: task assigned to user or group (tenant-scoped broadcast)
    const onTaskAssigned = (payload: TaskAssignedPayload) => {
      const n = fromTaskAssigned(payload, t);
      setNotifications((prev) => {
        if (prev.some((e) => e.id === n.id)) return prev;
        return [n, ...prev];
      });
      setUnreadCount((prev) => prev + 1);
      showToast({ title: n.title, body: n.body, variant: 'info' });
      // Invalidate task list in case the current user is the assignee
      void queryClient.invalidateQueries({ queryKey: ['controls.tasks'] });
    };

    // Domain event: multiple tasks are overdue (tenant-scoped broadcast)
    const onTasksOverdue = (payload: TasksOverduePayload) => {
      showToast({
        title: t('notifications.tasksOverdueTitle', { count: payload.count, s: payload.count > 1 ? 's' : '' }),
        body:  t('notifications.tasksOverdueBody'),
        variant: 'warning',
      });
      void queryClient.invalidateQueries({ queryKey: ['controls.tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['controls.stats'] });
    };

    socket.on('notification:new',              onNew);
    socket.on('notification:nc-created',       onNcCreated);
    socket.on('notification:task-completed',   onTaskCompleted);
    socket.on('notification:report-validated', onReportValidated);
    socket.on('notification:dlc-expiring-today', onDlcExpiring);
    socket.on('notification:task-assigned',    onTaskAssigned);
    socket.on('notification:tasks-overdue',    onTasksOverdue);

    return () => {
      socket.off('notification:new',              onNew);
      socket.off('notification:nc-created',       onNcCreated);
      socket.off('notification:task-completed',   onTaskCompleted);
      socket.off('notification:report-validated', onReportValidated);
      socket.off('notification:dlc-expiring-today', onDlcExpiring);
      socket.off('notification:task-assigned',    onTaskAssigned);
      socket.off('notification:tasks-overdue',    onTasksOverdue);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, t, queryClient]);

  // ── Mark all read ─────────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    if (!token) return;
    await api.patch('/api/v1/notifications/read');
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, [token]);

  return { notifications, unreadCount, markAllRead };
}
