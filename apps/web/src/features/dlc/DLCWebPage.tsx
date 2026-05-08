import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag } from 'lucide-react';
import { useState } from 'react';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';

// ─── Domain types ─────────────────────────────────────────────────────────────

interface DLCLabel {
  id: string;
  productName: string;
  lotNumber: string;
  fabricationDate: string;
  expirationDate: string;
  shelfLifeDays: number;
  tenantId: string;
  createdAt: string;
}

interface ApiResponse<T> {
  data: T;
  meta?: { total: number; page: number; limit: number; lastPage: number };
  message?: string;
}

// ─── DLC status helpers ───────────────────────────────────────────────────────

type DLCStatus = 'EXPIRED' | 'CRITICAL' | 'SOON' | 'OK';

function getDLCStatus(daysLeft: number): DLCStatus {
  if (daysLeft <= 0) return 'EXPIRED';
  if (daysLeft <= 3) return 'CRITICAL';
  if (daysLeft <= 7) return 'SOON';
  return 'OK';
}

const STATUS_STYLES: Record<DLCStatus, string> = {
  EXPIRED:  'bg-red-100 text-red-700 border border-red-200',
  CRITICAL: 'bg-orange-100 text-orange-700 border border-orange-200',
  SOON:     'bg-yellow-100 text-yellow-700 border border-yellow-200',
  OK:       'bg-green-100 text-green-700 border border-green-200',
};

const STATUS_LABELS: Record<DLCStatus, string> = {
  EXPIRED:  'Expiré',
  CRITICAL: 'Critique',
  SOON:     'Bientôt',
  OK:       'OK',
};

function daysLeft(expirationDate: string): number {
  return Math.ceil((new Date(expirationDate).getTime() - Date.now()) / 86_400_000);
}

// ─── Tab definition ───────────────────────────────────────────────────────────

type Tab = 'today' | 'soon' | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: "Expire aujourd'hui" },
  { id: 'soon',  label: 'Expire bientôt (7j)' },
  { id: 'all',   label: 'Tous les labels' },
];

// ─── Query hooks ──────────────────────────────────────────────────────────────

const REFETCH_MS = 5 * 60 * 1000;

function useExpiringToday() {
  return useQuery({
    queryKey: ['dlc', 'today'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DLCLabel[]>>('/api/v1/dlc/expiring-today');
      return data.data;
    },
    refetchInterval: REFETCH_MS,
  });
}

function useExpiringSoon() {
  return useQuery({
    queryKey: ['dlc', 'soon'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DLCLabel[]>>('/api/v1/dlc/expiring-soon?days=7');
      return data.data;
    },
    refetchInterval: REFETCH_MS,
  });
}

function useAllLabels(page: number) {
  return useQuery({
    queryKey: ['dlc', 'all', page],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DLCLabel[]>>(
        `/api/v1/dlc/labels?page=${page}&limit=20`,
      );
      return data;
    },
    refetchInterval: REFETCH_MS,
  });
}

// ─── DLC table ────────────────────────────────────────────────────────────────

interface DLCTableProps {
  labels: DLCLabel[];
}

function DLCTable({ labels }: DLCTableProps) {
  if (labels.length === 0) {
    return (
      <EmptyState
        icon={Tag}
        title="Aucun label DLC"
        description="Aucun label ne correspond à ce filtre."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3">Produit</th>
            <th className="px-4 py-3">Lot</th>
            <th className="px-4 py-3">Fabrication</th>
            <th className="px-4 py-3">Expiration</th>
            <th className="px-4 py-3 text-center">Jours restants</th>
            <th className="px-4 py-3">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {labels.map((label) => {
            const remaining = daysLeft(label.expirationDate);
            const status    = getDLCStatus(remaining);
            return (
              <tr key={label.id} className="transition-colors hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{label.productName}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{label.lotNumber}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(label.fabricationDate).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(label.expirationDate).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-center font-semibold text-gray-800">
                  {remaining <= 0 ? '—' : remaining}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Create label form values ─────────────────────────────────────────────────

interface CreateLabelValues {
  productName: string;
  lotNumber: string;
  fabricationDate: string;
  shelfLifeDays: number;
}

const INITIAL_FORM: CreateLabelValues = {
  productName:     '',
  lotNumber:       '',
  fabricationDate: '',
  shelfLifeDays:   1,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DLCWebPage() {
  const [activeTab, setActiveTab]   = useState<Tab>('today');
  const [modalOpen, setModalOpen]   = useState(false);
  const [form, setForm]             = useState<CreateLabelValues>(INITIAL_FORM);
  const [allPage, setAllPage]       = useState(1);

  const queryClient = useQueryClient();

  const todayQuery  = useExpiringToday();
  const soonQuery   = useExpiringSoon();
  const allQuery    = useAllLabels(allPage);

  const createMutation = useMutation({
    mutationFn: (body: CreateLabelValues) =>
      api.post('/api/v1/dlc/labels', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dlc'] });
      setModalOpen(false);
      setForm(INITIAL_FORM);
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(form);
  }

  // Determine which data / state to show for current tab
  const activeQuery =
    activeTab === 'today' ? todayQuery :
    activeTab === 'soon'  ? soonQuery  :
    allQuery;

  const isLoading = activeQuery.isLoading;
  const isError   = activeQuery.isError;

  const labels: DLCLabel[] =
    activeTab === 'all'
      ? (allQuery.data?.data ?? [])
      : ((activeQuery.data as DLCLabel[] | undefined) ?? []);

  const allMeta = activeTab === 'all' ? allQuery.data?.meta : undefined;

  return (
    <>
      <Header title="DLC" subtitle="Gestion des dates limites de consommation" />

      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-brand-medium text-white shadow-sm'
                    : 'text-gray-600 hover:text-brand-dark'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* New label button */}
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouveau label DLC
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
        ) : isError ? (
          <div className="py-20 text-center text-sm text-red-500">
            Erreur lors du chargement des labels DLC.
          </div>
        ) : (
          <>
            <DLCTable labels={labels} />

            {/* Pagination for "all" tab */}
            {allMeta && allMeta.lastPage > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                <span>
                  Page {allMeta.page} sur {allMeta.lastPage} — {allMeta.total} label(s)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={allPage === 1}
                    onClick={() => setAllPage((p) => p - 1)}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={allPage === allMeta.lastPage}
                    onClick={() => setAllPage((p) => p + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Create label modal */}
        <Modal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setForm(INITIAL_FORM); }}
          title="Nouveau label DLC"
          description="Renseignez les informations du produit pour générer un label."
          size="sm"
        >
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            {/* Product name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Nom du produit <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                placeholder="Poulet rôti"
                value={form.productName}
                onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>

            {/* Lot number */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Numéro de lot <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                placeholder="LOT-20260103-001"
                value={form.lotNumber}
                onChange={(e) => setForm((f) => ({ ...f, lotNumber: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>

            {/* Fabrication date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Date de fabrication <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="date"
                value={form.fabricationDate}
                onChange={(e) => setForm((f) => ({ ...f, fabricationDate: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>

            {/* Shelf life */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Durée de conservation (jours) <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="number"
                min={1}
                placeholder="3"
                value={form.shelfLifeDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shelfLifeDays: parseInt(e.target.value, 10) || 1 }))
                }
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
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
                Créer le label
              </Button>
            </div>
          </form>
        </Modal>
      </PageWrapper>
    </>
  );
}
