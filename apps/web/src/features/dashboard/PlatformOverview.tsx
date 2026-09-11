import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, Clock, Layers3, Printer, ShieldAlert, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { api } from '@/lib/api';
import type { ApiResponse, Tenant } from '@haccp/shared-types';

/**
 * Cross-tenant platform overview — the SUPER_ADMIN "Tous les clients" (ALL)
 * dashboard. Fans out to each service's SUPER_ADMIN-only /stats/by-tenant
 * endpoint and joins the per-tenant rows (keyed by tenantId) with tenant names
 * from /tenants. Aggregation is done server-side per service; this only merges
 * and renders. Heavy list pages still require selecting a single client.
 */

interface ControlAgg { totals: { openOverdue: number }; byTenant: { tenantId: string; openOverdue: number }[] }
interface NcAgg { totals: { open: number; critical: number }; byTenant: { tenantId: string; open: number; critical: number }[] }
interface DlcAgg { totals: { expiringToday: number; expired: number }; byTenant: { tenantId: string; expiringToday: number; expired: number }[] }
interface PrintAgg { totals: { failed: number }; byTenant: { tenantId: string; failed: number }[] }

interface Row {
  tenantId: string;
  name: string;
  overdue: number;
  ncOpen: number;
  ncCritical: number;
  dlcToday: number;
  dlcExpired: number;
  printFailed: number;
}

function useAgg<T>(key: string, url: string) {
  return useQuery({
    queryKey: ['supervision', 'overview', key],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<T>>(url);
      return data.data;
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60 * 1000,
  });
}

export function PlatformOverview() {
  const { t } = useTranslation();

  const controls = useAgg<ControlAgg>('controls', '/api/v1/controls/stats/by-tenant');
  const ncs      = useAgg<NcAgg>('nc', '/api/v1/nonconformities/stats/by-tenant');
  const dlc      = useAgg<DlcAgg>('dlc', '/api/v1/dlc/stats/by-tenant');
  const prints   = useAgg<PrintAgg>('print', '/api/v1/print-jobs/stats/by-tenant');

  const tenantsQuery = useQuery({
    queryKey: ['supervision', 'tenants'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Tenant[]>>('/api/v1/tenants?page=1&limit=500');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const loading =
    controls.isLoading || ncs.isLoading || dlc.isLoading || prints.isLoading || tenantsQuery.isLoading;

  // Merge all sources into one row per tenant that appears anywhere.
  const nameOf = new Map((tenantsQuery.data ?? []).map((tn) => [tn.id, tn.name]));
  const rows = new Map<string, Row>();
  const ensure = (tenantId: string): Row => {
    let r = rows.get(tenantId);
    if (!r) {
      r = {
        tenantId,
        name: nameOf.get(tenantId) ?? tenantId,
        overdue: 0, ncOpen: 0, ncCritical: 0, dlcToday: 0, dlcExpired: 0, printFailed: 0,
      };
      rows.set(tenantId, r);
    }
    return r;
  };
  for (const r of controls.data?.byTenant ?? []) ensure(r.tenantId).overdue = r.openOverdue;
  for (const r of ncs.data?.byTenant ?? []) { const x = ensure(r.tenantId); x.ncOpen = r.open; x.ncCritical = r.critical; }
  for (const r of dlc.data?.byTenant ?? []) { const x = ensure(r.tenantId); x.dlcToday = r.expiringToday; x.dlcExpired = r.expired; }
  for (const r of prints.data?.byTenant ?? []) ensure(r.tenantId).printFailed = r.failed;

  const rowList = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));

  const totals = {
    overdue: controls.data?.totals.openOverdue ?? 0,
    ncOpen: ncs.data?.totals.open ?? 0,
    ncCritical: ncs.data?.totals.critical ?? 0,
    dlcToday: dlc.data?.totals.expiringToday ?? 0,
    dlcExpired: dlc.data?.totals.expired ?? 0,
    printFailed: prints.data?.totals.failed ?? 0,
  };

  return (
    <>
      <Header title={t('supervision.all')} subtitle={t('supervision.overview.subtitle')} icon={Layers3} />
      <PageWrapper>
        {/* Platform-wide KPI totals */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi label={t('supervision.overview.overdue')}     value={totals.overdue}     icon={Clock}       danger={totals.overdue > 0} loading={loading} />
          <Kpi label={t('supervision.overview.ncOpen')}      value={totals.ncOpen}      icon={AlertTriangle} danger={totals.ncOpen > 0} loading={loading} />
          <Kpi label={t('supervision.overview.ncCritical')}  value={totals.ncCritical}  icon={ShieldAlert}  danger={totals.ncCritical > 0} loading={loading} />
          <Kpi label={t('supervision.overview.dlcToday')}    value={totals.dlcToday}    icon={Tag}          loading={loading} />
          <Kpi label={t('supervision.overview.dlcExpired')}  value={totals.dlcExpired}  icon={Tag}          danger={totals.dlcExpired > 0} loading={loading} />
          <Kpi label={t('supervision.overview.printFailed')} value={totals.printFailed} icon={Printer}      danger={totals.printFailed > 0} loading={loading} />
        </div>

        {/* Per-tenant breakdown */}
        <div className="mt-6 overflow-x-auto rounded-xl border border-surface-muted bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-surface-muted text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 font-semibold">{t('supervision.overview.client')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('supervision.overview.overdue')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('supervision.overview.ncOpen')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('supervision.overview.ncCritical')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('supervision.overview.dlcToday')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('supervision.overview.dlcExpired')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('supervision.overview.printFailed')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-muted">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t('common.loading')}</td></tr>
              )}
              {!loading && rowList.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t('supervision.overview.empty')}</td></tr>
              )}
              {!loading && rowList.map((r) => (
                <tr key={r.tenantId} className="hover:bg-brand-lighter/40">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-medium text-brand-dark">
                      <Building2 className="h-4 w-4 text-brand-medium" />{r.name}
                    </span>
                  </td>
                  <Num v={r.overdue} danger />
                  <Num v={r.ncOpen} danger />
                  <Num v={r.ncCritical} danger />
                  <Num v={r.dlcToday} />
                  <Num v={r.dlcExpired} danger />
                  <Num v={r.printFailed} danger />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageWrapper>
    </>
  );
}

function Num({ v, danger }: { v: number; danger?: boolean }) {
  return (
    <td className={`px-4 py-3 text-right tabular-nums ${danger && v > 0 ? 'font-semibold text-red-600' : 'text-gray-700'}`}>
      {v}
    </td>
  );
}

interface KpiProps {
  label: string;
  value: number;
  icon: React.FC<{ className?: string }>;
  danger?: boolean;
  loading?: boolean;
}

function Kpi({ label, value, icon: Icon, danger, loading }: KpiProps) {
  return (
    <div className="rounded-xl border border-surface-muted bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <Icon className={`h-4 w-4 ${danger && value > 0 ? 'text-red-500' : 'text-brand-medium'}`} />
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-12 animate-pulse rounded bg-surface-page" />
      ) : (
        <p className={`mt-1 text-2xl font-bold ${danger && value > 0 ? 'text-red-600' : 'text-brand-dark'}`}>{value}</p>
      )}
    </div>
  );
}
