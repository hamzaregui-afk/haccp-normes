import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  ImageOff,
  Plus,
  Search,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { useRef, useState, useMemo } from 'react';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';

// ─── Error helpers ────────────────────────────────────────────────────────────

function extractApiMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | undefined;
    if (typeof data?.message === 'string') return data.message;
    if (Array.isArray(data?.message))      return (data.message as string[]).join(', ');
  }
  return 'Une erreur est survenue. Veuillez réessayer.';
}

// ─── Domain types ────────────────────────────────────────────────────────────

type NCStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'REJECTED';
type NCSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface NCPhoto {
  id:         string;
  url:        string;
  uploadedAt: string;
}

interface NonConformity {
  id:               string;
  reference:        string;
  tenantId:         string;
  siteId:           string;
  productId?:       string;
  reporterId:       string;
  closedById?:      string;
  status:           NCStatus;
  severity:         NCSeverity;
  description:      string;
  correctiveAction?: string;
  closedAt?:        string;
  createdAt:        string;
  updatedAt:        string;
  photos:           NCPhoto[];
}

interface NCStats {
  total:      number;
  open:       number;
  inProgress: number;
  closed:     number;
  critical:   number;
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

function useNonConformities(page: number, search: string, status: string, severity: string) {
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
  label:      string;
  value:      number;
  icon:       React.ReactNode;
  color?:     'red' | 'orange' | 'green' | 'default';
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

// ─── NC Detail + Photo Modal ──────────────────────────────────────────────────

function NCDetailModal({
  nc,
  open,
  onClose,
  onPhotosUpdated,
}: {
  nc:               NonConformity | null;
  open:             boolean;
  onClose:          () => void;
  onPhotosUpdated?: () => void;
}) {
  const queryClient  = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      // Do NOT set Content-Type manually — browser must set it with the multipart boundary.
      await api.post(`/api/v1/nonconformities/${nc!.id}/photos`, formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nonconformities'] });
      onPhotosUpdated?.();
    },
    onError: () => showToast({ title: 'Erreur lors du téléversement', variant: 'error' }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadMutation.mutate(file);
    // reset so the same file can be re-selected
    e.target.value = '';
  };

  if (!nc) return null;

  const photos = nc.photos ?? [];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`NC ${nc.reference}`}
        description={nc.description}
        size="lg"
      >
        {/* Info grid */}
        <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-surface-muted bg-surface-page px-4 py-3 text-sm">
          <div>
            <dt className="font-medium text-gray-500">Statut</dt>
            <dd className="mt-0.5"><NCBadge value={nc.status} type="status" /></dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Sévérité</dt>
            <dd className="mt-0.5"><NCBadge value={nc.severity} type="severity" /></dd>
          </div>
          {nc.correctiveAction && (
            <div className="col-span-2">
              <dt className="font-medium text-gray-500">Action corrective</dt>
              <dd className="mt-0.5 text-gray-800">{nc.correctiveAction}</dd>
            </div>
          )}
          <div>
            <dt className="font-medium text-gray-500">Signalée le</dt>
            <dd className="mt-0.5 text-gray-800">
              {new Date(nc.createdAt).toLocaleDateString('fr-FR')}
            </dd>
          </div>
        </dl>

        {/* Photo section */}
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Camera className="h-4 w-4 text-brand-medium" />
            Photos ({photos.length})
          </h3>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-brand-medium bg-white px-3 py-1.5 text-xs font-medium text-brand-medium hover:bg-brand-light transition-colors disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {uploadMutation.isPending ? 'Upload…' : 'Ajouter une photo'}
          </button>
          {/* Hidden file input — accepts images + allows camera on mobile */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {uploadMutation.isError && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            Erreur lors du téléversement. Veuillez réessayer.
          </p>
        )}

        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-surface-muted py-10 text-center">
            <ImageOff className="mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-400">Aucune photo pour cette NC</p>
            <p className="text-xs text-gray-300">Cliquez sur "Ajouter une photo" pour commencer</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setLightboxUrl(photo.url)}
                className="group relative aspect-square overflow-hidden rounded-lg border border-surface-muted bg-gray-50 hover:border-brand-medium transition-colors"
              >
                <img
                  src={photo.url}
                  alt="Photo NC"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                  <Eye className="h-5 w-5 text-white" />
                </div>
                <p className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-1 py-0.5 text-[10px] text-white">
                  {new Date(photo.uploadedAt).toLocaleDateString('fr-FR')}
                </p>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
            onClick={() => setLightboxUrl(null)}
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Photo NC agrandie"
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ─── Create NC form state ────────────────────────────────────────────────────

interface CreateNCValues {
  description:      string;
  siteId:           string;
  productId:        string;
  severity:         NCSeverity;
  correctiveAction: string;
}

const INITIAL_FORM: CreateNCValues = {
  description:      '',
  siteId:           '',
  productId:        '',
  severity:         'MEDIUM',
  correctiveAction: '',
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

// ─── Lookup hooks ────────────────────────────────────────────────────────────

interface SiteRaw { id: string; name: string; zones?: unknown[] }
interface ProductRaw { id: string; name: string }

function useSiteOptions() {
  const { data } = useQuery({
    queryKey: ['sites.all'],
    queryFn: async () => {
      try {
        const { data } = await api.get<{ data: SiteRaw[] }>('/api/v1/sites?page=1&limit=100');
        return data.data ?? [];
      } catch {
        return [] as SiteRaw[];
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return useMemo(() => (data ?? []).map((s) => ({ value: s.id, label: s.name })), [data]);
}

function useProductOptions() {
  const { data } = useQuery({
    queryKey: ['products.all'],
    queryFn: async () => {
      try {
        const { data } = await api.get<{ data: ProductRaw[] }>('/api/v1/products?page=1&limit=100');
        return data.data ?? [];
      } catch {
        return [] as ProductRaw[];
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return useMemo(() => (data ?? []).map((p) => ({ value: p.id, label: p.name })), [data]);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NonconformitiesPage() {
  const [page, setPage]                   = useState(1);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedNC, setSelectedNC]       = useState<NonConformity | null>(null);
  const [form, setForm]                   = useState<CreateNCValues>(INITIAL_FORM);

  const debouncedSearch  = useDebounce(search, 400);
  const queryClient      = useQueryClient();
  const siteOptions      = useSiteOptions();
  const productOptions   = useProductOptions();

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
      setCreateModalOpen(false);
      setForm(INITIAL_FORM);
      showToast({ title: 'Non-conformité signalée avec succès', variant: 'success' });
    },
    onError: (error) => showToast({ title: extractApiMessage(error), variant: 'error' }),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/api/v1/nonconformities/${id}`, { status: 'CLOSED' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nonconformities'] });
      showToast({ title: 'Non-conformité clôturée avec succès', variant: 'success' });
    },
    onError: (error) => showToast({ title: extractApiMessage(error), variant: 'error' }),
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
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              placeholder="Tous les statuts"
              options={STATUS_FILTER_OPTIONS}
              className="w-44"
            />
            <Select
              value={severityFilter}
              onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
              placeholder="Toutes les sévérités"
              options={SEVERITY_FILTER_OPTIONS}
              className="w-48"
            />
          </div>

          <Button size="sm" onClick={() => setCreateModalOpen(true)}>
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
            description="Aucune non-conformité ne correspond aux filtres actuels."
            actionLabel="Signaler une NC"
            onAction={() => setCreateModalOpen(true)}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Référence</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Sévérité</th>
                    <th className="px-4 py-3">Photos</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-muted">
                  {ncList.map((nc) => (
                    <tr
                      key={nc.id}
                      className="cursor-pointer transition-colors hover:bg-surface-page"
                      onClick={() => setSelectedNC(nc)}
                    >
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
                      <td className="px-4 py-3"><NCBadge value={nc.status} type="status" /></td>
                      <td className="px-4 py-3"><NCBadge value={nc.severity} type="severity" /></td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Camera className="h-3.5 w-3.5" />
                          {nc.photos?.length ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(nc.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-brand-medium hover:underline"
                            onClick={(e) => { e.stopPropagation(); setSelectedNC(nc); }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Voir
                          </button>
                          {(nc.status === 'OPEN' || nc.status === 'IN_PROGRESS') && (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={closeMutation.isPending}
                              onClick={(e) => { e.stopPropagation(); closeMutation.mutate(nc.id); }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Clôturer
                            </Button>
                          )}
                        </div>
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
                    <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
                    <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {ncList.map((nc) => (
                <button
                  key={nc.id}
                  type="button"
                  onClick={() => setSelectedNC(nc)}
                  className="w-full text-left rounded-xl border border-surface-muted bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <code className="rounded bg-surface-page px-1.5 py-0.5 text-xs font-mono text-brand-dark">
                      {nc.reference}
                    </code>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Camera className="h-3 w-3" />
                      {nc.photos?.length ?? 0}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-700 line-clamp-2">{nc.description}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <NCBadge value={nc.status} type="status" />
                    <NCBadge value={nc.severity} type="severity" />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(nc.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </button>
              ))}

              {data?.meta && data.meta.lastPage > 1 && (
                <div className="flex justify-between pt-2">
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
                  <span className="text-xs text-gray-500 self-center">
                    {data.meta.page} / {data.meta.lastPage}
                  </span>
                  <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* NC Detail + Photos Modal */}
        <NCDetailModal
          key={selectedNC?.id}
          nc={selectedNC}
          open={selectedNC !== null}
          onClose={() => setSelectedNC(null)}
          onPhotosUpdated={() => {
            // Re-fetch the NC list to get updated photo counts
            void queryClient.invalidateQueries({ queryKey: ['nonconformities'] });
          }}
        />

        {/* Create NC Modal */}
        <Modal
          open={createModalOpen}
          onClose={() => { setCreateModalOpen(false); setForm(INITIAL_FORM); }}
          title="Signaler une non-conformité"
          description="Renseignez les informations de la nouvelle non-conformité."
          size="md"
        >
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
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

            <Select
              label="Site"
              required
              placeholder="Sélectionner un site…"
              options={siteOptions}
              value={form.siteId}
              onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}
            />

            <Select
              label="Produit (optionnel)"
              placeholder="Sélectionner un produit…"
              options={productOptions}
              value={form.productId}
              onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
            />

            <Select
              label="Sévérité"
              required
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as NCSeverity }))}
              options={SEVERITY_OPTIONS}
            />

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

            {createMutation.isError && (
              <p className="text-xs text-red-600">{extractApiMessage(createMutation.error)}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => { setCreateModalOpen(false); setForm(INITIAL_FORM); }}
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
