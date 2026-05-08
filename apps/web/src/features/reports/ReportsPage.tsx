import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Plus,
  Send,
} from 'lucide-react';
import { useState } from 'react';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';

// ─── Domain types ─────────────────────────────────────────────────────────────

type ReportStatus = 'PENDING' | 'UNDER_REVIEW' | 'VALIDATED' | 'SENT';
type ReportType = 'MONTHLY_HYGIENE' | 'ANNUAL_HACCP' | 'TEMPERATURE_LOG';

interface Report {
  id: string;
  type: string;
  status: ReportStatus;
  tenantId: string;
  fileUrl?: string;
  validatedBy?: string;
  generatedAt: string;
  validatedAt?: string;
  sentAt?: string;
}

interface ReportStats {
  total: number;
  pending: number;
  underReview: number;
  validated: number;
  sent: number;
}

interface ApiResponse<T> {
  data: T;
  meta?: { total: number; page: number; limit: number; lastPage: number };
  message?: string;
}

// ─── Style & label records ────────────────────────────────────────────────────

const STATUS_STYLES: Record<ReportStatus, string> = {
  PENDING:      'bg-gray-100 text-gray-600 border border-gray-200',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  VALIDATED:    'bg-green-100 text-green-700 border border-green-200',
  SENT:         'bg-blue-100 text-blue-700 border border-blue-200',
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  PENDING:      'En attente',
  UNDER_REVIEW: 'En révision',
  VALIDATED:    'Validé',
  SENT:         'Envoyé',
};

const TYPE_LABELS: Record<ReportType, string> = {
  MONTHLY_HYGIENE: 'Hygiène mensuelle',
  ANNUAL_HACCP:    'HACCP annuel',
  TEMPERATURE_LOG: 'Relevé températures',
};

// ─── Query hooks ──────────────────────────────────────────────────────────────

function useReportStats() {
  return useQuery({
    queryKey: ['reports', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ReportStats>>('/api/v1/reports/stats');
      return data.data;
    },
  });
}

function useReports(page: number, status: string, type: string) {
  return useQuery({
    queryKey: ['reports', page, status, type],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) p.set('status', status);
      if (type)   p.set('type', type);
      const { data } = await api.get<ApiResponse<Report[]>>(`/api/v1/reports?${p}`);
      return data;
    },
  });
}

// ─── Filter / form option arrays ─────────────────────────────────────────────

const STATUS_FILTER_OPTIONS = [
  { value: 'PENDING',      label: 'En attente' },
  { value: 'UNDER_REVIEW', label: 'En révision' },
  { value: 'VALIDATED',    label: 'Validé' },
  { value: 'SENT',         label: 'Envoyé' },
];

const TYPE_FILTER_OPTIONS = [
  { value: 'MONTHLY_HYGIENE', label: 'Hygiène mensuelle' },
  { value: 'ANNUAL_HACCP',    label: 'HACCP annuel' },
  { value: 'TEMPERATURE_LOG', label: 'Relevé températures' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  valueClass?: string;
}

function StatCard({ label, value, icon, valueClass = 'text-brand-dark' }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-surface-muted bg-white p-4 shadow-sm">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-page">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}

interface ReportStatusBadgeProps { status: ReportStatus }
function ReportStatusBadge({ status }: ReportStatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Create report form state ─────────────────────────────────────────────────

interface CreateReportValues {
  type: ReportType;
  period: string;
}

const INITIAL_FORM: CreateReportValues = {
  type:   'MONTHLY_HYGIENE',
  period: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [page, setPage]               = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [modalOpen, setModalOpen]       = useState(false);
  const [form, setForm]                 = useState<CreateReportValues>(INITIAL_FORM);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // ARCH-DECISION: PDF download uses api.get with responseType 'blob' rather than
  // a plain <a href> because the report endpoint is protected by JwtAuthGuard.
  // A bare anchor tag does not send the Authorization header, causing a 401.
  // We fetch as a blob, create an ephemeral object URL, click it programmatically,
  // then revoke it to release memory.
  async function downloadPdf(reportId: string) {
    if (downloadingId) return;
    setDownloadingId(reportId);
    try {
      const response = await api.get(`/api/v1/reports/${reportId}/pdf`, {
        responseType: 'blob',
      });
      const blob     = new Blob([response.data as BlobPart], { type: 'application/pdf' });
      const url      = URL.createObjectURL(blob);
      const anchor   = document.createElement('a');
      anchor.href    = url;
      anchor.download = `rapport-haccp-${reportId.slice(0, 8)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      // Silent — user can retry
    } finally {
      setDownloadingId(null);
    }
  }

  const { data: stats }                      = useReportStats();
  const { data, isLoading, isError }         = useReports(page, statusFilter, typeFilter);

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/reports', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      setModalOpen(false);
      setForm(INITIAL_FORM);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReportStatus }) =>
      api.patch(`/api/v1/reports/${id}`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      type:   form.type,
      period: form.period || undefined,
    });
  }

  function resolveTypeLabel(rawType: string): string {
    if (rawType in TYPE_LABELS) return TYPE_LABELS[rawType as ReportType];
    return rawType;
  }

  const reportList = data?.data ?? [];

  return (
    <>
      <Header
        title="Rapports"
        subtitle="Génération et validation des rapports HACCP"
      />
      <PageWrapper>
        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Total"
            value={stats?.total ?? 0}
            icon={<FileText className="h-5 w-5 text-brand-medium" />}
          />
          <StatCard
            label="En attente"
            value={stats?.pending ?? 0}
            icon={<Clock className="h-5 w-5 text-yellow-500" />}
            valueClass={(stats?.pending ?? 0) > 0 ? 'text-yellow-600' : 'text-brand-dark'}
          />
          <StatCard
            label="Validés"
            value={stats?.validated ?? 0}
            icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
            valueClass="text-green-600"
          />
          <StatCard
            label="Envoyés"
            value={stats?.sent ?? 0}
            icon={<Send className="h-5 w-5 text-blue-500" />}
            valueClass="text-blue-600"
          />
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status filter */}
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              placeholder="Tous les statuts"
              options={STATUS_FILTER_OPTIONS}
              className="w-44"
            />

            {/* Type filter */}
            <Select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              placeholder="Tous les types"
              options={TYPE_FILTER_OPTIONS}
              className="w-52"
            />
          </div>

          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Générer un rapport
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
        ) : isError ? (
          <div className="py-20 text-center text-sm text-red-500">
            Erreur lors du chargement des rapports.
          </div>
        ) : reportList.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucun rapport"
            description="Aucun rapport ne correspond aux filtres actuels. Générez votre premier rapport HACCP."
            actionLabel="Générer un rapport"
            onAction={() => setModalOpen(true)}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Généré le</th>
                  <th className="px-4 py-3">Validé le</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-muted">
                {reportList.map((report) => (
                  <tr key={report.id} className="transition-colors hover:bg-surface-page">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {resolveTypeLabel(report.type)}
                    </td>
                    <td className="px-4 py-3">
                      <ReportStatusBadge status={report.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(report.generatedAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {report.validatedAt
                        ? new Date(report.validatedAt).toLocaleDateString('fr-FR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {report.status === 'PENDING' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={statusMutation.isPending}
                            onClick={() =>
                              statusMutation.mutate({ id: report.id, status: 'UNDER_REVIEW' })
                            }
                          >
                            Soumettre
                          </Button>
                        )}
                        {report.status === 'UNDER_REVIEW' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={statusMutation.isPending}
                            onClick={() =>
                              statusMutation.mutate({ id: report.id, status: 'VALIDATED' })
                            }
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Valider
                          </Button>
                        )}
                        {(report.status === 'VALIDATED' || report.status === 'SENT') && (
                          <button
                            onClick={() => void downloadPdf(report.id)}
                            disabled={downloadingId === report.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-medium px-3 py-1.5 text-xs font-medium text-brand-medium hover:bg-brand-lighter transition-colors disabled:opacity-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {downloadingId === report.id ? '…' : 'PDF'}
                          </button>
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
                  Page {data.meta.page} sur {data.meta.lastPage} — {data.meta.total} rapport(s)
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

        {/* Create Report Modal */}
        <Modal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setForm(INITIAL_FORM); }}
          title="Générer un rapport"
          description="Sélectionnez le type et la période du rapport à générer."
          size="sm"
        >
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            {/* Report type */}
            <Select
              label="Type de rapport"
              required
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ReportType }))}
              options={TYPE_FILTER_OPTIONS}
            />

            {/* Period (optional) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Période</label>
              <input
                type="text"
                placeholder="2025-01 (optionnel)"
                value={form.period}
                onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
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
                Générer
              </Button>
            </div>
          </form>
        </Modal>
      </PageWrapper>
    </>
  );
}
