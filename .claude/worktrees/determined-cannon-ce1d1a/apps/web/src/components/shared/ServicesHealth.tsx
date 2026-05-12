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
import { api } from '@/lib/api';

// ─── Service catalog ──────────────────────────────────────────────────────────

interface ServiceMeta {
  key:   string;
  label: string;
  path:  string;
}

const SERVICES: ServiceMeta[] = [
  { key: 'auth',             label: 'Auth',              path: '/api/health/auth' },
  { key: 'users',            label: 'Utilisateurs',      path: '/api/health/users' },
  { key: 'controls',         label: 'Contrôles',         path: '/api/health/controls' },
  { key: 'nonconformities',  label: 'Non-conformités',   path: '/api/health/nonconformities' },
  { key: 'assets',           label: 'Actifs / GED',      path: '/api/health/assets' },
  { key: 'notifications',    label: 'Notifications',     path: '/api/health/notifications' },
  { key: 'reports',          label: 'Rapports',          path: '/api/health/reports' },
  { key: 'dlc',              label: 'DLC',               path: '/api/health/dlc' },
  { key: 'tenants',          label: 'Tenants',           path: '/api/health/tenants' },
  { key: 'audit',            label: 'Audit',             path: '/api/health/audit' },
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

// ─── Style map ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ServiceStatus, { icon: React.ReactNode; label: string; dot: string }> = {
  ok: {
    icon:  <CheckCircle2 className="h-4 w-4 text-green-500" />,
    label: 'En ligne',
    dot:   'bg-green-500',
  },
  down: {
    icon:  <AlertTriangle className="h-4 w-4 text-red-500" />,
    label: 'Hors ligne',
    dot:   'bg-red-500',
  },
  loading: {
    icon:  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />,
    label: 'Vérification…',
    dot:   'bg-gray-300',
  },
};

// ─── Service row ──────────────────────────────────────────────────────────────

function ServiceRow({ service }: { service: ServiceMeta }) {
  const health = useServiceHealth(service.path);
  const cfg    = STATUS_CONFIG[health.status];

  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
        <span className="text-sm text-gray-700">{service.label}</span>
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
        <span className={`text-xs font-medium ${health.status === 'ok' ? 'text-green-600' : health.status === 'down' ? 'text-red-600' : 'text-gray-500'}`}>
          {cfg.label}
        </span>
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function ServicesHealth() {
  return (
    <div className="rounded-xl border border-surface-muted bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-brand-dark">
          État des microservices
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <RefreshCw className="h-3 w-3" />
          Rafraîchissement toutes les 30 s
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
