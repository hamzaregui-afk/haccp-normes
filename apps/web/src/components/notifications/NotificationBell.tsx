import { Bell, CheckCheck } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications, type Notification } from '@/hooks/useNotifications';

// ── Type icon map — avoids inline ternaries per component conventions ──────
const TYPE_ICONS: Record<string, string> = {
  NC_CREATED:         '⚠️',
  TASK_COMPLETED:     '✅',
  CONTROL_COMPLETED:  '✅',  // legacy alias — kept for backwards-compat with persisted notifications
  TASK_ASSIGNED:      '📋',
  REPORT_VALIDATED:   '📄',
  DEFAULT:            '🔔',
};

function getTypeIcon(type: string): string {
  return TYPE_ICONS[type] ?? TYPE_ICONS['DEFAULT'];
}

// ── NotificationItem ──────────────────────────────────────────────────────

interface NotificationItemProps {
  notification: Notification;
}

function NotificationItem({ notification: n }: NotificationItemProps) {
  return (
    <li
      className={`flex gap-3 px-4 py-3 text-sm transition-colors hover:bg-gray-50 ${
        n.isRead ? 'opacity-60' : ''
      }`}
    >
      <span className="text-lg leading-none" aria-hidden="true">
        {getTypeIcon(n.type)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 truncate">{n.title}</p>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
        <p className="mt-1 text-[10px] text-gray-400">
          {new Date(n.createdAt).toLocaleString('fr-FR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
      {!n.isRead && (
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-mid"
          aria-label="Non lu"
        />
      )}
    </li>
  );
}

// ── NotificationBell (main export) ────────────────────────────────────────

interface NotificationBellProps {}

export function NotificationBell(_props: NotificationBellProps) {
  const { t }   = useTranslation();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarkAllRead = async () => {
    await markAllRead();
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative rounded-lg p-2 text-gray-500 hover:bg-surface-page hover:text-brand-dark transition-colors"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
            aria-label={`${unreadCount} notifications non lues`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Panneau de notifications"
          className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-brand-dark">
              {t('notifications.title')}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => void handleMarkAllRead()}
                className="flex items-center gap-1 text-xs text-brand-mid hover:text-brand-dark transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          {/* Notification list */}
          <ul
            role="list"
            className="max-h-80 divide-y divide-gray-50 overflow-y-auto"
          >
            {notifications.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-gray-400">
                {t('notifications.none')}
              </li>
            ) : (
              notifications
                .slice(0, 20)
                .map((n) => <NotificationItem key={n.id} notification={n} />)
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
