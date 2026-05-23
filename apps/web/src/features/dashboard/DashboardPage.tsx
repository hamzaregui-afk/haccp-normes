import { useQueries, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Calendar, CheckCircle2, Clock, Repeat, ShieldAlert, ShieldCheck, Tag, TrendingUp } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useTenantId } from '@/hooks/useTenantId';
import type { ApiResponse, UserRole } from '@haccp/shared-types';

// ─── API shapes ───────────────────────────────────────────────────────────────

interface ControlStats {
  todayTotal:           number;
  todayCompleted:       number;
  openOverdue:          number;
  complianceRate:       number;
  ncControlsThisMonth:  number;
}

interface NcStats {
  total: number;
  open: number;
  inProgress: number;
  closed: number;
  rejected: number;
  critical: number;
}

// ─── Chart data shapes ────────────────────────────────────────────────────────

interface NcItem {
  id: string;
  createdAt: string;
  status: string;
}

interface ControlTask {
  id:         string;
  createdAt:  string;
  status:     string;
  resultJson: { overallCompliant: boolean } | null;
}

interface NcControl {
  id:          string;
  zoneId:      string;
  completedAt: string | null;
  resultJson:  { overallCompliant: boolean; ncComment?: string; items?: unknown[] } | null;
  template:    { id: string; name: string } | null;
}

// ─── Chart helper functions ───────────────────────────────────────────────────

const FR_MONTH_ABBR = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun',
  'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc',
] as const;

/** Returns the last 6 month labels (French abbreviations), oldest first. */
function getLast6MonthLabels(): string[] {
  const now = new Date();
  const labels: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(FR_MONTH_ABBR[d.getMonth()]);
  }
  return labels;
}

/**
 * Returns the "YYYY-MM" key for a given Date, used for grouping.
 * We need absolute month keys to avoid aliasing across years (e.g. two "Jan"s).
 */
function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Builds the ordered list of YYYY-MM keys for the last 6 months. */
function getLast6MonthKeys(): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(toMonthKey(d));
  }
  return keys;
}

/** Groups NC items by month and returns counts for each of the last 6 months. */
function groupByMonth(
  items: NcItem[],
  monthKeys: string[],
  monthLabels: string[],
): { month: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const key of monthKeys) counts[key] = 0;

  for (const item of items) {
    const key = toMonthKey(new Date(item.createdAt));
    if (key in counts) counts[key]++;
  }

  return monthKeys.map((key, idx) => ({
    month: monthLabels[idx],
    count: counts[key],
  }));
}

/**
 * Computes monthly compliance rate from resultJson.overallCompliant.
 *
 * ARCH-DECISION: We use resultJson.overallCompliant (true/false per submission)
 * as the numerator, not task.status === 'COMPLETED'. A task can be COMPLETED
 * with overallCompliant: false (e.g. temperature out of range). Using just
 * completion status would over-count conformant controls.
 *
 * Rate = overallCompliant:true / COMPLETED tasks per month.
 * Non-completed tasks (PLANNED, OVERDUE…) are excluded from the denominator.
 */
function computeComplianceByMonth(
  tasks: ControlTask[],
  monthKeys: string[],
  monthLabels: string[],
): { month: string; rate: number }[] {
  const completed: Record<string, number>  = {};
  const conformant: Record<string, number> = {};
  for (const key of monthKeys) { completed[key] = 0; conformant[key] = 0; }

  for (const task of tasks) {
    if (task.status !== 'COMPLETED') continue;
    const key = toMonthKey(new Date(task.createdAt));
    if (!(key in completed)) continue;
    completed[key]++;
    if (task.resultJson?.overallCompliant === true) conformant[key]++;
  }

  return monthKeys.map((key, idx) => ({
    month: monthLabels[idx],
    rate:  completed[key] > 0 ? Math.round((conformant[key] / completed[key]) * 1000) / 10 : 0,
  }));
}

// ─── KPI skeleton ─────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  bg,
  loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-surface-muted bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          {loading ? (
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-surface-page" />
          ) : (
            <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
          )}
          {sub && !loading && (
            <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
          )}
        </div>
        <div className={`rounded-lg p-2.5 ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

// ─── Role-aware banner ────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<UserRole, { label: string; desc: string; color: string; iconColor: string }> = {
  SUPER_ADMIN:     { label: 'Super Administrateur', desc: 'Accès complet à toutes les organisations.',            color: 'bg-purple-50 border-purple-200', iconColor: 'text-purple-600' },
  ADMIN:           { label: 'Administrateur',        desc: 'Gestion complète de votre organisation.',              color: 'bg-brand-lighter border-brand-lighter', iconColor: 'text-brand-dark' },
  MANAGER:         { label: 'Manager',               desc: 'Supervision des opérations et des équipes.',           color: 'bg-blue-50 border-blue-200',   iconColor: 'text-blue-600' },
  QUALITY_OFFICER: { label: 'Responsable Qualité',   desc: 'Suivi de la conformité et des non-conformités.',       color: 'bg-amber-50 border-amber-200', iconColor: 'text-amber-600' },
  OPERATOR:        { label: 'Opérateur',             desc: 'Vos tâches de contrôle planifiées pour aujourd\'hui.', color: 'bg-green-50 border-green-200', iconColor: 'text-green-600' },
  VIEWER:          { label: 'Lecteur',               desc: 'Accès en lecture seule aux données HACCP.',            color: 'bg-gray-50 border-gray-200',   iconColor: 'text-gray-500' },
};

function RoleBanner({ role, email }: { role: UserRole; email: string }) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.VIEWER;
  return (
    <div className={`mb-6 flex items-center gap-4 rounded-xl border px-5 py-4 ${cfg.color}`}>
      <ShieldCheck className={`h-8 w-8 shrink-0 ${cfg.iconColor}`} />
      <div>
        <p className="text-sm font-semibold text-gray-800">{cfg.label} — <span className="font-normal text-gray-600">{email}</span></p>
        <p className="mt-0.5 text-xs text-gray-500">{cfg.desc}</p>
      </div>
    </div>
  );
}

// ─── DLC expiry alert widget ──────────────────────────────────────────────────

interface DlcLabel {
  id:          string;
  productName: string;
  expiresAt:   string;
  lotNumber?:  string | null;
}

function DlcAlertWidget() {
  const tenantId = useTenantId();
  const { data, isLoading } = useQuery({
    queryKey: ['dlc.expiring-today', tenantId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DlcLabel[]>>('/api/v1/dlc/labels/expiring-today');
      return data.data ?? [];
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const count = data?.length ?? 0;

  if (isLoading || count === 0) return null;

  return (
    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Tag className="h-4 w-4 text-red-600" />
        <span className="text-sm font-semibold text-red-700">
          {count} étiquette{count > 1 ? 's' : ''} DLC expire{count > 1 ? 'nt' : ''} aujourd'hui
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {data?.map((label) => (
          <li
            key={label.id}
            className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700"
          >
            {label.productName}
            {label.lotNumber ? ` · Lot ${label.lotNumber}` : ''}
            {' · '}
            {new Date(label.expiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Operator today's tasks widget ───────────────────────────────────────────

interface MyTask {
  id: string;
  templateId: string;
  status: string;
  scheduledAt: string;
  template?: { name: string; type: string };
}

const MY_TASK_STATUS: Record<string, { label: string; color: string }> = {
  PLANNED:     { label: 'Planifiée',  color: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { label: 'En cours',  color: 'bg-blue-50 text-blue-700' },
  COMPLETED:   { label: 'Terminée',  color: 'bg-green-50 text-green-700' },
  OVERDUE:     { label: 'En retard', color: 'bg-red-50 text-red-700' },
  CANCELLED:   { label: 'Annulée',   color: 'bg-gray-100 text-gray-400' },
};

function OperatorTasksWidget({ assigneeId }: { assigneeId: string }) {
  const tenantId = useTenantId();
  const { data, isLoading } = useQuery({
    queryKey: ['my.tasks.today', tenantId, assigneeId],
    queryFn: async () => {
      const today = new Date();
      const from  = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const to    = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();
      const p     = new URLSearchParams({ assigneeId, from, to, limit: '50' });
      const { data } = await api.get<ApiResponse<MyTask[]>>(`/api/v1/controls/tasks?${p}`);
      return data.data ?? [];
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="rounded-xl border border-surface-muted bg-white p-6 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Calendar className="h-4 w-4 text-brand-medium" />
        Mes tâches du jour
      </h3>
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-surface-page" />)}</div>
      ) : (data ?? []).length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-gray-400">Aucune tâche planifiée aujourd'hui ✅</div>
      ) : (
        <ul className="divide-y divide-surface-muted">
          {(data ?? []).map((task) => {
            const s = MY_TASK_STATUS[task.status] ?? { label: task.status, color: 'bg-gray-100 text-gray-600' };
            return (
              <li key={task.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-800">{task.template?.name ?? 'Contrôle'}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(task.scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{s.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Recent NCs table ─────────────────────────────────────────────────────────

interface RecentNc {
  id: string;
  reference: string;
  description: string;
  status: string;
  createdAt: string;
}

const NC_STATUS_STYLE: Record<string, string> = {
  OPEN:        'bg-red-50 text-red-700',
  IN_PROGRESS: 'bg-orange-50 text-orange-700',
  CLOSED:      'bg-green-50 text-green-700',
  REJECTED:    'bg-gray-100 text-gray-600',
};
const NC_STATUS_LABEL: Record<string, string> = {
  OPEN:        'Ouverte',
  IN_PROGRESS: 'En cours',
  CLOSED:      'Clôturée',
  REJECTED:    'Rejetée',
};

// ─── Recent NC Controls widget ────────────────────────────────────────────────

function RecentNcControlsWidget({ zoneMap }: { zoneMap: Record<string, string> }) {
  const tenantId = useTenantId();
  const { data, isLoading } = useQuery({
    queryKey: ['controls.nc-controls', tenantId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<NcControl[]>>('/api/v1/controls/nc-controls');
      return data.data ?? [];
    },
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <div className="rounded-xl border border-surface-muted bg-white p-6 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <ShieldAlert className="h-4 w-4 text-red-500" />
        Derniers contrôles non conformes
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-surface-page" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          Aucun contrôle non conforme récent ✅
        </div>
      ) : (
        <ul className="divide-y divide-surface-muted">
          {(data ?? []).map((ctrl) => {
            const zone      = zoneMap[ctrl.zoneId] ?? ctrl.zoneId;
            const ncComment = ctrl.resultJson?.ncComment;
            const completedAt = ctrl.completedAt
              ? new Date(ctrl.completedAt).toLocaleString('fr-FR', {
                  day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })
              : '—';
            return (
              <li key={ctrl.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {ctrl.template?.name ?? 'Contrôle'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Zone : {zone} · {completedAt}
                    </p>
                    {ncComment && (
                      <p className="mt-1 line-clamp-1 text-xs text-red-600">
                        ↳ {ncComment}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                    NC
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const currentUser = useAuthStore((s) => s.user);
  const tenantId    = useTenantId();
  const isOperator  = currentUser?.role === 'OPERATOR';

  const [controlsQuery, ncStatsQuery, recentNcQuery] = useQueries({
    queries: [
      {
        queryKey: ['controls.stats', tenantId],
        queryFn: async () => {
          const { data } = await api.get<ApiResponse<ControlStats>>('/api/v1/controls/stats');
          return data.data;
        },
        // Refresh every 2 minutes — stats are operational, not archival
        refetchInterval: 2 * 60 * 1000,
      },
      {
        queryKey: ['nc.stats', tenantId],
        queryFn: async () => {
          const { data } = await api.get<ApiResponse<NcStats>>('/api/v1/nonconformities/stats');
          return data.data;
        },
        refetchInterval: 2 * 60 * 1000,
      },
      {
        queryKey: ['nc.recent', tenantId],
        queryFn: async () => {
          const { data } = await api.get<ApiResponse<RecentNc[]>>(
            '/api/v1/nonconformities?limit=5&status=OPEN',
          );
          return data.data;
        },
      },
    ],
  });

  // ── Chart queries ──────────────────────────────────────────────────────────
  const ncChartQuery = useQuery({
    queryKey: ['nc.chart.monthly', tenantId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<NcItem[]>>(
        '/api/v1/nonconformities?limit=100',
      );
      return data.data;
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const complianceChartQuery = useQuery({
    queryKey: ['controls.chart.monthly', tenantId],
    queryFn: async () => {
      // fetch up to 200 tasks to cover 6-month compliance history
      const { data } = await api.get<ApiResponse<ControlTask[]>>(
        '/api/v1/controls/tasks?limit=200',
      );
      return data.data;
    },
    refetchInterval: 5 * 60 * 1000,
  });

  // ── Active schedules count ─────────────────────────────────────────────────
  const activeSchedulesQuery = useQuery({
    queryKey: ['controls.schedules.active-count', tenantId],
    queryFn: async () => {
      const { data } = await api.get<{ data: { isActive: boolean }[] }>(
        '/api/v1/controls/schedules',
      );
      return (data.data ?? []).filter((s) => s.isActive).length;
    },
    refetchInterval: 5 * 60 * 1000,
    enabled: !isOperator,
  });

  // ── Zone map (id → name) for NC controls widget ────────────────────────────
  const zonesQuery = useQuery({
    queryKey: ['zones.list', tenantId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<{ id: string; name: string }[]>>(
        '/api/v1/tenants/zones?limit=200',
      );
      return data.data ?? [];
    },
    staleTime: 10 * 60 * 1000, // zones don't change often
  });

  const zoneMap: Record<string, string> = (zonesQuery.data ?? []).reduce<Record<string, string>>(
    (acc, z) => { acc[z.id] = z.name; return acc; },
    {},
  );

  // ── Pre-compute chart data (memoised via derived constants) ────────────────
  const monthKeys   = getLast6MonthKeys();
  const monthLabels = getLast6MonthLabels();

  const ncMonthlyData = groupByMonth(
    ncChartQuery.data ?? [],
    monthKeys,
    monthLabels,
  );

  const complianceData = computeComplianceByMonth(
    complianceChartQuery.data ?? [],
    monthKeys,
    monthLabels,
  );

  const cs = controlsQuery.data;
  const ns = ncStatsQuery.data;
  const loading = controlsQuery.isLoading || ncStatsQuery.isLoading;

  return (
    <>
      <Header title="Vue d'ensemble" subtitle="Tableau de bord HACCP" />
      <PageWrapper>
        {/* ── Role banner ── */}
        {currentUser && <RoleBanner role={currentUser.role} email={currentUser.email} />}

        {/* ── Operator view: show their tasks widget instead of the full dashboard ── */}
        {isOperator && currentUser && (
          <OperatorTasksWidget assigneeId={currentUser.sub} />
        )}

        {/* ── Full dashboard — shown for all non-operator roles ── */}
        {!isOperator && (
          <>
        {/* ── KPI cards ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <KpiCard
            label="Contrôles du jour"
            value={cs ? `${cs.todayCompleted} / ${cs.todayTotal}` : '—'}
            sub={cs?.todayTotal ? `${cs.todayTotal} planifié(s)` : undefined}
            icon={CheckCircle2}
            color="text-green-600"
            bg="bg-brand-light"
            loading={loading}
          />
          <KpiCard
            label="Non-conformités ouvertes"
            value={ns?.open ?? '—'}
            sub={ns?.critical ? `dont ${ns.critical} critique(s)` : undefined}
            icon={AlertTriangle}
            color={ns?.open ? 'text-red-600' : 'text-gray-400'}
            bg={ns?.open ? 'bg-red-50' : 'bg-surface-page'}
            loading={loading}
          />
          <KpiCard
            label="Tâches en retard"
            value={cs?.openOverdue ?? '—'}
            icon={Clock}
            color={cs?.openOverdue ? 'text-gold' : 'text-gray-400'}
            bg={cs?.openOverdue ? 'bg-gold-light' : 'bg-surface-page'}
            loading={loading}
          />
          <KpiCard
            label="Taux de conformité"
            value={cs ? `${cs.complianceRate}%` : '—'}
            sub="Tâches du jour"
            icon={TrendingUp}
            color="text-brand-dark"
            bg="bg-brand-lighter"
            loading={loading}
          />
          <KpiCard
            label="Contrôles NC ce mois"
            value={cs?.ncControlsThisMonth ?? '—'}
            sub="Contrôles complétés non conformes"
            icon={ShieldAlert}
            color={cs?.ncControlsThisMonth ? 'text-red-600' : 'text-gray-400'}
            bg={cs?.ncControlsThisMonth ? 'bg-red-50' : 'bg-surface-page'}
            loading={loading}
          />
          <KpiCard
            label="Planifications actives"
            value={activeSchedulesQuery.data ?? '—'}
            sub="Tâches auto-générées"
            icon={Repeat}
            color="text-brand-medium"
            bg="bg-brand-lighter"
            loading={activeSchedulesQuery.isLoading}
          />
        </div>

        {/* ── Charts / tables row ── */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Recent open NCs */}
          <div className="rounded-xl border border-surface-muted bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">
              Non-conformités ouvertes récentes
            </h3>
            {recentNcQuery.isLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-surface-page" />
                ))}
              </div>
            ) : (recentNcQuery.data ?? []).length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                Aucune non-conformité ouverte ✅
              </div>
            ) : (
              <ul className="divide-y divide-surface-muted">
                {(recentNcQuery.data ?? []).map((nc) => (
                  <li key={nc.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <code className="text-xs font-mono text-brand-medium">{nc.reference}</code>
                      <p className="mt-0.5 text-sm text-gray-700 line-clamp-1">{nc.description}</p>
                    </div>
                    <span className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${NC_STATUS_STYLE[nc.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {NC_STATUS_LABEL[nc.status] ?? nc.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent NC controls */}
          <RecentNcControlsWidget zoneMap={zoneMap} />
        </div>

        {/* ── DLC expiry alert widget ── */}
        <DlcAlertWidget />

        {/* ── Recharts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">

          {/* Chart 1 — NC par mois (bar) */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Non-conformités par mois
            </h2>
            {ncChartQuery.isLoading ? (
              <div className="h-[280px] animate-pulse rounded bg-surface-page" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={ncMonthlyData}
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E5E7EB',
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [value, 'Non-conformités']}
                  />
                  <Bar
                    dataKey="count"
                    fill="#2D6A4F"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart 2 — Taux de conformité (line) */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Taux de conformité (%)
            </h2>
            {complianceChartQuery.isLoading ? (
              <div className="h-[280px] animate-pulse rounded bg-surface-page" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart
                  data={complianceData}
                  margin={{ top: 4, right: 56, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E5E7EB',
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [
                      `${value.toFixed(1)}%`,
                      'Conformité',
                    ]}
                  />
                  <ReferenceLine
                    y={80}
                    stroke="#DC2626"
                    strokeDasharray="3 3"
                    label={{
                      value: 'Objectif 80%',
                      position: 'right',
                      fill: '#DC2626',
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#B5833A"
                    strokeWidth={2}
                    dot={{ fill: '#B5833A', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

        </div>
          </>
        )}
      </PageWrapper>
    </>
  );
}
