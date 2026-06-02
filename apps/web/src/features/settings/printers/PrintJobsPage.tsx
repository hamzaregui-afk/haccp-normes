import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, PrinterIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenantId';

// ─── Domain types ─────────────────────────────────────────────────────────────

type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface PrintJob {
  id:           string;
  labelType:    string;
  status:       JobStatus;
  copies:       number;
  errorMessage: string | null;
  createdAt:    string;
  printer:      { id: string; name: string } | null;
}

interface ApiResponse<T> {
  data: T;
  meta?: { total: number; page: number; limit: number; lastPage: number };
}

// ─── Style maps ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<JobStatus, string> = {
  PENDING:    'bg-gray-100 text-gray-600 border border-gray-200',
  PROCESSING: 'bg-blue-100 text-blue-700 border border-blue-200',
  COMPLETED:  'bg-green-100 text-green-700 border border-green-200',
  FAILED:     'bg-red-100 text-red-700 border border-red-200',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrintJobsPage() {
  const { t }      = useTranslation();
  const tenantId   = useTenantId();
  const qc         = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]                 = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['print-jobs', tenantId, page, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get<ApiResponse<PrintJob[]>>(`/api/v1/print-jobs?${params.toString()}`);
      return data;
    },
    enabled: !!tenantId,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/v1/print-jobs/${id}/retry`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['print-jobs', tenantId] });
      showToast({ title: t('printers.printJobs.retry'), variant: 'info' });
    },
    onError: () => showToast({ title: t('common.error'), variant: 'error' }),
  });

  const jobs = data?.data ?? [];
  const meta = data?.meta;

  const statusOptions: Array<{ value: string; label: string }> = [
    { value: '',           label: 'Tous les statuts' },
    { value: 'PENDING',    label: t('printers.printJobs.status.PENDING') },
    { value: 'PROCESSING', label: t('printers.printJobs.status.PROCESSING') },
    { value: 'COMPLETED',  label: t('printers.printJobs.status.COMPLETED') },
    { value: 'FAILED',     label: t('printers.printJobs.status.FAILED') },
  ];

  return (
    <>
      <Header
        title={t('printers.printJobs.title')}
        subtitle={t('printers.printJobs.subtitle')}
      />

      <PageWrapper>
        {/* Filter */}
        <div className="mb-4 flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-medium border-t-transparent" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
              <PrinterIcon className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">{t('printers.printJobs.noJobs')}</h3>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">{t('printers.printJobs.cols.date')}</th>
                  <th className="px-4 py-3">{t('printers.printJobs.cols.type')}</th>
                  <th className="px-4 py-3">{t('printers.printJobs.cols.printer')}</th>
                  <th className="px-4 py-3">{t('printers.printJobs.cols.copies')}</th>
                  <th className="px-4 py-3">{t('printers.printJobs.cols.status')}</th>
                  <th className="px-4 py-3">{t('printers.printJobs.cols.error')}</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDateTime(job.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{job.labelType}</td>
                    <td className="px-4 py-3 text-gray-700">{job.printer?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{job.copies}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status]}`}>
                        {t(`printers.printJobs.status.${job.status}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      {job.errorMessage ? (
                        <p className="truncate text-xs text-red-600" title={job.errorMessage}>
                          {job.errorMessage}
                        </p>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {job.status === 'FAILED' && (
                        <button
                          onClick={() => retryMutation.mutate(job.id)}
                          disabled={retryMutation.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:border-brand-medium hover:text-brand-dark disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          {t('printers.printJobs.retry')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {meta && meta.lastPage > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                <p className="text-sm text-gray-500">{meta.total} travail{meta.total > 1 ? 'x' : ''}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    {t('common.previous')}
                  </Button>
                  <span className="flex items-center text-sm text-gray-500">
                    Page {page} / {meta.lastPage}
                  </span>
                  <Button size="sm" variant="ghost" disabled={page >= meta.lastPage} onClick={() => setPage((p) => p + 1)}>
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </PageWrapper>
    </>
  );
}
