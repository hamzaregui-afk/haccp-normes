import { useQueries, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
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
import type { ApiResponse } from '@haccp/shared-types';

// ─── API shapes ───────────────────────────────────────────────────────────────

interface ControlStats {
  todayTotal: number;
  todayCompleted: number;
  openOverdue: number;
  complianceRate: number;
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
  id: string;
  createdAt: string;
  status: string; // e.g. "DONE", "PENDING", "OVERDUE"
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

/** Computes monthly compliance rate (DONE tasks / total tasks) * 100. */
function computeComplianceByMonth(
  tasks: ControlTask[],
  monthKeys: string[],
  monthLabels: string[],
): { month: string; rate: number }[] {
  const totals: Record<string, number> = {};
  const done: Record<string, number> = {};
  for (const key of monthKeys) { totals[key] = 0; done[key] = 0; }

  for (const task of tasks) {
    const key = toMonthKey(new Date(task.createdAt));
    if (key in totals) {
      totals[key]++;
      if (task.status === 'COMPLETED') done[key]++; // matches TaskStatusSchema enum
    }
  }

  return monthKeys.map((key, idx) => ({
    month: monthLabels[idx],
    rate: totals[key] > 0 ? Math.round((done[key] / totals[key]) * 1000) / 10 : 0,
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [controlsQuery, ncStatsQuery, recentNcQuery] = useQueries({
    queries: [
      {
        queryKey: ['controls.stats'],
        queryFn: async () => {
          const { data } = await api.get<ApiResponse<ControlStats>>('/api/v1/controls/stats');
          return data.data;
        },
        // Refresh every 2 minutes — stats are operational, not archival
        refetchInterval: 2 * 60 * 1000,
      },
      {
        queryKey: ['nc.stats'],
        queryFn: async () => {
          const { data } = await api.get<ApiResponse<NcStats>>('/api/v1/nonconformities/stats');
          return data.data;
        },
        refetchInterval: 2 * 60 * 1000,
      },
      {
        queryKey: ['nc.recent'],
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
    queryKey: ['nc.chart.monthly'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<NcItem[]>>(
        '/api/v1/nonconformities?limit=200',
      );
      return data.data;
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const complianceChartQuery = useQuery({
    queryKey: ['controls.chart.monthly'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ControlTask[]>>(
        '/api/v1/controls/tasks?limit=200',
      );
      return data.data;
    },
    refetchInterval: 5 * 60 * 1000,
  });

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
        {/* ── KPI cards ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

          {/* Controls summary */}
          <div className="rounded-xl border border-surface-muted bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Résumé des contrôles</h3>
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-6 animate-pulse rounded bg-surface-page" />
                ))}
              </div>
            ) : cs ? (
              <dl className="space-y-3">
                {[
                  { label: 'Planifiés aujourd\'hui', value: cs.todayTotal, color: 'text-gray-700' },
                  { label: 'Complétés', value: cs.todayCompleted, color: 'text-green-600' },
                  { label: 'En retard', value: cs.openOverdue, color: cs.openOverdue > 0 ? 'text-red-600' : 'text-gray-400' },
                  { label: 'Taux conformité', value: `${cs.complianceRate}%`, color: 'text-brand-dark' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between rounded-lg bg-surface-page px-3 py-2">
                    <dt className="text-sm text-gray-500">{row.label}</dt>
                    <dd className={`text-sm font-semibold ${row.color}`}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                Données indisponibles
              </div>
            )}
          </div>
        </div>

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
      </PageWrapper>
    </>
  );
}
