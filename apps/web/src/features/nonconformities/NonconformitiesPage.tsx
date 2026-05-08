import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Search,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';

// ─── Domain types ────────────────────────────────────────────────────────────

type NCStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'REJECTED';
type NCSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface NonConformity {
  id: string;
  reference: string;
  tenantId: string;
  siteId: string;
  productId?: string;
  reporterId: string;
  closedById?: string;
  status: NCStatus;
  severity: NCSeverity;
  description: string;
  correctiveAction?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  photos: { id: string; url: string; uploadedAt: string }[];
}

interface NCStats {
  total: number;
  open: number;
  inProgress: number;
  closed: number;
  critical: number;
}

interface ApiResponse<T> {
  data: T;
  meta?: { total: number; page: number; limit: number; lastPage: number };
  message?: string;
}

// ─── Style records ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<NCStatus, string> = {
  OPEN:        'bg-red-100 text-red-700 border border-red-200',
  IN_PROGRESS: 'bg-orange-100 text-orange-700 border border-orange-200',
  CLOSED:      'bg-green-100 text-green-700 border border-green-200',
  REJECTED:    'bg-gray-100 text-gray-600 border border-gray-200',
};

const STATUS_LABELS: Record<NCStatus, string> = {
  OPEN:        'Ouverte',
  IN_PROGRESS: 'En cours',
  CLOSED:      'Clôturée',
  REJECTED:    'Rejetée',
};

const SEVERITY_STYLES: Record<NCSeverity, string> = {
  LOW:      'bg-gray-100 text-gray-600 border border-gray-200',
  MEDIUM:   'bg-yellow-100 text-yellow-700 border border-yellow-200',
  HIGH:     'bg-orange-100 text-orange-700 border border-orange-200',
  CRITICAL: 'bg-red-100 text-red-700 border border-red-200',
};

const SEVERITY_LABELS: Record<NCSeverity, string> = {
  LOW:      'Faible',
  MEDIUM:   'Moyen',
  HIGH:     'Élevé',
  CRITICAL: 'Critique',
};

// ─── Query hooks ─────────────────────────────────────────────────────────────

function useNCStats() {
  return useQuery({
    queryKey: ['nonconformities', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<NCStats>>('/api/v1/nonconformities/stats');
      return data.data;
    },
  });
}

function useNonConformities(
  page: number,
  search: string,
  status: string,
  severity: string,
) {
  return useQuery({
    queryKey: ['nonconformities', page, search, status, severity],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (search)   p.set('search', search);
      if (status)   p.set('status', status);
      if (severity) p.set('severity', severity);
      const { data } = await api.get<ApiResponse<NonConformity[]>>(
        `/api/v1/nonconformities?${p}`,
      );
      return data;
    },
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
  color?: 'red' | 'orange' | 'green' | 'default';
}

const STAT_CARD_VALUE_COLOR: Record<NonNullable<StatCardProps['color']>, string> = {
  red:     'text-red-600',
  orange:  'text-orange-500',
  green:   'text-green-600',
  default: 'text-brand-dark',
};

function StatCard({ label, value, icon, color = 'default' }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-surface-muted bg-white p-4 shadow-sm">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-page">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p className={`text-2xl font-bold ${STAT_CARD_VALUE_COLOR[color]}`}>{value}</p>
      </div>
    </div>
  );
}

interface NCBadgeProps { value: NCStatus | NCSeverity; type: 'status' | 'severity' }
function NCBadge({ value, type }: NCBadgeProps) {
  const style = type === 'status'
    ? STATUS_STYLES[value as NCStatus]
    : SEVERITY_STYLES[value as NCSeverity];
  const label = type === 'status'
    ? STATUS_LABELS[value as NCStatus]
    : SEVERITY_LABELS[value as NCSeverity];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

// ─── Create NC form state ────────────────────────────────────────────────────

interface CreateNCValues {
  description: string;
  siteId: string;
  productId: string;
  severity: NCSeverity;
  correctiveAction: string;
}

const INITIAL_FORM: CreateNCValues = {
  description:       '',
  siteId:            '',
  productId:         '',
  severity:          'MEDIUM',
  correctiveAction:  '',
};

const SEVERITY_OPTIONS = [
  { value: 'LOW',      label: 'Faible' },
  { value: 'MEDIUM',   label: 'Moyen' },
  { value: 'HIGH',     label: 'Élevé' },
  { value: 'CRITICAL', label: 'Critique' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'OPEN',        label: 'Ouverte' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'CLOSED',      label: 'Clôturée' },
  { value: 'REJECTED',    label: 'Rejetée' },
];

const SEVERITY_FILTER_OPTIONS = [
  { value: 'LOW',      label: 'Faible' },
  { value: 'MEDIUM',   label: 'Moyen' },
  { value: 'HIGH',     label: 'Élevé' },
  { value: 'CRITICAL', label: 'Critique' },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NonconformitiesPage() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter]     = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [modalOpen, setModalOpen]           = useState(false);
  const [form, setForm]                     = useState<CreateNCValues>(INITIAL_FORM);

  const debouncedSearch = useDebounce(search, 400);
  const queryClient = useQueryClient();

  const { data: stats } = useNCStats();
  const { data, isLoading, isError } = useNonConformities(
    page,
    debouncedSearch,
    statusFilter,
    severityFilter,
  );

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/api/v1/nonconformities', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nonconformities'] });
      setModalOpen(false);
      setForm(INITIAL_FORM);
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/api/v1/nonconformities/${id}`, { status: 'CLOSED' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nonconformities'] });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      description:      form.description,
      siteId:           form.siteId,
      severity:         form.severity,
      productId:        form.productId || undefined,
      correctiveAction: form.correctiveAction || undefined,
    });
  }

  const ncList = data?.data ?? [];

  return (
    <>
      <Header
        title="Non-conformités"
        subtitle="Suivi et traitement des non-conformités HACCP"
      />
      <PageWrapper>
        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Total NCs"
            value={stats?.total ?? 0}
            icon={<AlertTriangle className="h-5 w-5 text-brand-medium" />}
          />
          <StatCard
            label="Ouvertes"
            value={stats?.open ?? 0}
            icon={<Circle className="h-5 w-5 text-red-500" />}
            color={(stats?.open ?? 0) > 0 ? 'red' : 'default'}
          />
          <StatCard
            label="En cours"
            value={stats?.inProgress ?? 0}
            icon={<Clock className="h-5 w-5 text-orange-500" />}
            color="orange"
          />
          <StatCard
            label="Critiques"
            value={stats?.critical ?? 0}
            icon={<XCircle className="h-5 w-5 text-red-500" />}
            color={(stats?.critical ?? 0) > 0 ? 'red' : 'default'}
          />
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher une NC…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-9 w-64 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>

            {/* Status filter */}
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              placeholder="Tous les statuts"
              options={STATUS_FILTER_OPTIONS}
              className="w-44"
            />

            {/* Severity filter */}
            <Select
              value={severityFilter}
              onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
              placeholder="Toutes les sévérités"
              options={SEVERITY_FILTER_OPTIONS}
              className="w-48"
            />
          </div>

          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Signaler une NC
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
        ) : isError ? (
          <div className="py-20 text-center text-sm text-red-500">
            Erreur lors du chargement des non-conformités.
          </div>
        ) : ncList.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Aucune non-conformité"
            description="Aucune non-conformité ne correspond aux filtres actuels. Commencez par en signaler une."
            actionLabel="Signaler une NC"
            onAction={() => setModalOpen(true)}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Référence</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Sévérité</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-muted">
                {ncList.map((nc) => (
                  <tr key={nc.id} className="transition-colors hover:bg-surface-page">
                    <td className="px-4 py-3">
                      <code className="rounded bg-surface-page px-1.5 py-0.5 text-xs font-mono text-brand-dark">
                        {nc.reference}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {nc.description.length > 60
                        ? `${nc.description.slice(0, 60)}…`
                        : nc.description}
                    </td>
                    <td className="px-4 py-3">
                      <NCBadge value={nc.status} type="status" />
                    </td>
                    <td className="px-4 py-3">
                      <NCBadge value={nc.severity} type="severity" />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(nc.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(nc.status === 'OPEN' || nc.status === 'IN_PROGRESS') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={closeMutation.isPending}
                          onClick={() => closeMutation.mutate(nc.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Clôturer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data?.meta && data.meta.lastPage > 1 && (
              <div className="flex items-center justify-between border-t border-surface-muted px-4 py-3 text-sm text-gray-500">
                <span>
                  Page {data.meta.page} sur {data.meta.lastPage} — {data.meta.total} NC(s)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === data.meta.lastPage}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Create NC Modal */}
        <Modal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setForm(INITIAL_FORM); }}
          title="Signaler une non-conformité"
          description="Renseignez les informations de la nouvelle non-conformité."
          size="md"
        >
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="Décrivez la non-conformité observée…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-surface-muted bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium resize-none"
              />
            </div>

            {/* Site ID */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Site <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                placeholder="ID du site"
                value={form.siteId}
                onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}
                className="h-9 w-full rounded-lg border border-surface-muted bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>

            {/* Product ID (optional) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Produit</label>
              <input
                type="text"
                placeholder="ID produit (optionnel)"
                value={form.productId}
                onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
                className="h-9 w-full rounded-lg border border-surface-muted bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>

            {/* Severity */}
            <Select
              label="Sévérité"
              required
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as NCSeverity }))}
              options={SEVERITY_OPTIONS}
            />

            {/* Corrective action (optional) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Action corrective</label>
              <input
                type="text"
                placeholder="Action corrective proposée (optionnel)"
                value={form.correctiveAction}
                onChange={(e) => setForm((f) => ({ ...f, correctiveAction: e.target.value }))}
                className="h-9 w-full rounded-lg border border-surface-muted bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>

            {/* Error */}
            {createMutation.isError && (
              <p className="text-xs text-red-600">
                Une erreur est survenue. Veuillez réessayer.
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => { setModalOpen(false); setForm(INITIAL_FORM); }}
              >
                Annuler
              </Button>
              <Button type="submit" size="sm" loading={createMutation.isPending}>
                Signaler
              </Button>
            </div>
          </form>
        </Modal>
      </PageWrapper>
    </>
  );
}
