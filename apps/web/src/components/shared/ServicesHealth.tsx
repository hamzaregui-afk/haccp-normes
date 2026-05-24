/**
 * ServicesHealth — Real-time health status of all microservices.
 * Polls every 30 seconds; intended for the Settings page (ADMIN+ only).
 *
 * ARCH-DECISION: Each service exposes GET /health → { status: "ok", uptime, version }.
 * Nginx routes /api/health/<service> → <service>:PORT/health so the web app
 * never needs to know individual service ports.
 */

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';

// ─── Service catalog ──────────────────────────────────────────────────────────

interface ServiceMeta {
  key:  string;
  path: string;
}

const SERVICES: ServiceMeta[] = [
  { key: 'auth',            path: '/api/health/auth' },
  { key: 'users',           path: '/api/health/users' },
  { key: 'controls',        path: '/api/health/controls' },
  { key: 'nonconformities', path: '/api/health/nonconformities' },
  { key: 'assets',          path: '/api/health/assets' },
  { key: 'notifications',   path: '/api/health/notifications' },
  { key: 'reports',         path: '/api/health/reports' },
  { key: 'dlc',             path: '/api/health/dlc' },
  { key: 'tenants',         path: '/api/health/tenants' },
  { key: 'audit',           path: '/api/health/audit' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceStatus = 'ok' | 'down' | 'loading';

interface ServiceState {
  status:  ServiceStatus;
  uptime?: number;
  version?: string;
}

// ─── Single service status hook ───────────────────────────────────────────────

function useServiceHealth(path: string): ServiceState {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health', path],
    queryFn: async () => {
      const { data } = await api.get<{ status: string; uptime?: number; version?: string }>(path);
      return data;
    },
    refetchInterval: 30_000,
    retry: false,
  });

  if (isLoading) return { status: 'loading' };
  if (isError || data?.status !== 'ok') return { status: 'down' };
  return { status: 'ok', uptime: data.uptime, version: data.version };
}

// ─── Style map (CSS-only — no labels) ────────────────────────────────────────

const STATUS_CONFIG: Record<ServiceStatus, { icon: React.ReactNode; dot: string; textClass: string }> = {
  ok: {
    icon:      <CheckCircle2 className="h-4 w-4 text-green-500" />,
    dot:       'bg-green-500',
    textClass: 'text-green-600',
  },
  down: {
    icon:      <AlertTriangle className="h-4 w-4 text-red-500" />,
    dot:       'bg-red-500',
    textClass: 'text-red-600',
  },
  loading: {
    icon:      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />,
    dot:       'bg-gray-300',
    textClass: 'text-gray-500',
  },
};

// ─── Service row ──────────────────────────────────────────────────────────────

function ServiceRow({ service }: { service: ServiceMeta }) {
  const { t } = useTranslation();
  const health = useServiceHealth(service.path);
  const cfg    = STATUS_CONFIG[health.status];

  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
        <span className="text-sm text-gray-700">
          {t(`settings.services.names.${service.key}` as Parameters<typeof t>[0])}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {health.version && (
          <span className="text-xs text-gray-400">v{health.version}</span>
        )}
        {health.uptime !== undefined && (
          <span className="text-xs text-gray-400">
            {Math.floor(health.uptime / 60)} min
          </span>
        )}
        {cfg.icon}
        <span className={`text-xs font-medium ${cfg.textClass}`}>
          {t(`settings.services.status.${health.status}` as Parameters<typeof t>[0])}
        </span>
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function ServicesHealth() {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-surface-muted bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-brand-dark">
          {t('settings.services.title')}
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <RefreshCw className="h-3 w-3" />
          {t('settings.services.refreshNote')}
        </div>
      </div>
      <div className="divide-y divide-surface-muted">
        {SERVICES.map((s) => (
          <ServiceRow key={s.key} service={s} />
        ))}
      </div>
    </div>
  );
}
