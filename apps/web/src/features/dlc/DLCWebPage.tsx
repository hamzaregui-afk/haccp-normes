import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Printer, Tag } from 'lucide-react';
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
  productId: string;
  productName: string;
  lotNumber: string | null;
  producedAt: string;   // date d'ouverture
  expiresAt: string;    // DLC calculée
  printedBy: string;
  printedAt: string;
  tenantId: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  dlcDays?: number | null;
  isActive: boolean;
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

function daysLeft(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
}

// ─── ZPL label generation ─────────────────────────────────────────────────────

// ARCH-DECISION: ZPL is the native language of Zebra thermal printers,
// the industry standard for food-safety labels. We generate the ZPL string
// client-side and offer two print paths:
//   1. Zebra Browser Print (local agent on port 9100) — seamless, no file needed
//   2. Download .zpl file — fallback that works with any Zebra driver / hot-folder
// Label size: 57 mm × 32 mm (PW=323 dots, LL=182 dots at 203 dpi) — standard
// retail food label. Adjust PW/LL for your printer media settings.

function generateZPL(productName: string, openedAt: string, expiresAt: string, dlcDays: number): string {
  const opened  = new Date(openedAt).toLocaleDateString('fr-FR');
  const expires = new Date(expiresAt).toLocaleDateString('fr-FR');

  // Truncate long names to avoid label overflow
  const safeName = productName.length > 28 ? productName.slice(0, 26) + '…' : productName;

  return [
    '^XA',
    '^MMT',
    '^PW323',      // 57 mm @ 203 dpi
    '^LL182',      // 32 mm @ 203 dpi
    '^LS0',
    // Product name — bold, large
    `^FO10,12^A0N,32,32^FD${safeName}^FS`,
    // Separator line
    '^FO10,55^GB303,2,2^FS',
    // Opening date
    `^FO10,68^A0N,26,26^FDOuverture : ${opened}^FS`,
    // DLC date
    `^FO10,104^A0N,26,26^FDDLC       : ${expires}^FS`,
    // Conservation duration — small
    `^FO10,140^A0N,20,20^FD(${dlcDays} jour${dlcDays > 1 ? 's' : ''} de conservation)^FS`,
    // Print 1 copy
    '^PQ1,0,1,Y',
    '^XZ',
  ].join('\n');
}

// Try Zebra Browser Print first (requires the local Zebra agent to be running).
// Falls back to downloading the .zpl file so it works on every machine.
async function printZPL(zpl: string, productName: string): Promise<void> {
  // Attempt Zebra Browser Print
  try {
    const resp = await fetch('http://localhost:9100/available', {
      signal: AbortSignal.timeout(800),
    });
    if (resp.ok) {
      const discovered = (await resp.json()) as { printer?: { uid: string } };
      const uid = discovered?.printer?.uid;
      if (uid) {
        await fetch('http://localhost:9100/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device: { uid }, data: zpl }),
          signal: AbortSignal.timeout(3000),
        });
        return; // success via Browser Print
      }
    }
  } catch {
    // Zebra Browser Print not available — fall through to download
  }

  // Fallback: download .zpl file
  const blob = new Blob([zpl], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `DLC_${productName.replace(/\s+/g, '_')}_${Date.now()}.zpl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

function useProducts() {
  return useQuery({
    queryKey: ['products', 'dlc-select'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Product[]>>(
        '/api/v1/products?page=1&limit=500&active=true',
      );
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useExpiringToday() {
  return useQuery({
    queryKey: ['dlc', 'today'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DLCLabel[]>>('/api/v1/dlc/labels/expiring-today');
      return data.data;
    },
    refetchInterval: REFETCH_MS,
  });
}

function useExpiringSoon() {
  return useQuery({
    queryKey: ['dlc', 'soon'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DLCLabel[]>>('/api/v1/dlc/labels/expiring-soon?days=7');
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

interface DLCTableProps { labels: DLCLabel[] }

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

  function handleReprint(label: DLCLabel) {
    const dlcDays = Math.round(
      (new Date(label.expiresAt).getTime() - new Date(label.producedAt).getTime()) / 86_400_000,
    );
    const zpl = generateZPL(label.productName, label.producedAt, label.expiresAt, dlcDays);
    void printZPL(zpl, label.productName);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3">Produit</th>
            <th className="px-4 py-3">Ouverture</th>
            <th className="px-4 py-3">DLC</th>
            <th className="px-4 py-3 text-center">Jours restants</th>
            <th className="px-4 py-3">Statut</th>
            <th className="px-4 py-3 text-center">Étiquette</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {labels.map((label) => {
            const remaining = daysLeft(label.expiresAt);
            const status    = getDLCStatus(remaining);
            return (
              <tr key={label.id} className="transition-colors hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{label.productName}</td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(label.producedAt)}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{fmtDate(label.expiresAt)}</td>
                <td className="px-4 py-3 text-center font-semibold text-gray-800">
                  {remaining <= 0 ? '—' : remaining}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
                    {STATUS_LABELS[status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleReprint(label)}
                    title="Réimprimer l'étiquette ZPL"
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:border-brand-medium hover:text-brand-dark"
                  >
                    <Printer className="h-3 w-3" />
                    Imprimer
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Create label form ────────────────────────────────────────────────────────

interface CreateLabelFormState {
  productId:   string;
  productName: string;
  producedAt:  string;
  dlcDays:     number;
}

const INITIAL_FORM: CreateLabelFormState = {
  productId:   '',
  productName: '',
  producedAt:  new Date().toISOString().slice(0, 10), // default to today
  dlcDays:     1,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DLCWebPage() {
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm]           = useState<CreateLabelFormState>(INITIAL_FORM);
  const [allPage, setAllPage]     = useState(1);

  const queryClient = useQueryClient();

  const productsQuery = useProducts();
  const todayQuery    = useExpiringToday();
  const soonQuery     = useExpiringSoon();
  const allQuery      = useAllLabels(allPage);

  // Real-time DLC preview
  const previewDlc: Date | null =
    form.producedAt && form.dlcDays > 0
      ? addDays(form.producedAt, form.dlcDays)
      : null;

  const createMutation = useMutation({
    mutationFn: (payload: CreateLabelFormState & { expiresAt: string }) =>
      api.post<ApiResponse<DLCLabel>>('/api/v1/dlc/labels', {
        productId:  payload.productId,
        productName: payload.productName,
        dlcDays:    payload.dlcDays,
        producedAt: payload.producedAt,
        expiresAt:  payload.expiresAt,
      }),
    onSuccess: (resp, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['dlc'] });
      setModalOpen(false);
      setForm(INITIAL_FORM);

      // Auto-print ZPL label after successful creation
      const label = resp.data.data;
      const expiresAt = label?.expiresAt ?? vars.expiresAt;
      const zpl = generateZPL(vars.productName, vars.producedAt, expiresAt, vars.dlcDays);
      void printZPL(zpl, vars.productName);
    },
  });

  function handleProductSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const selectedId = e.target.value;
    const product    = productsQuery.data?.find((p) => p.id === selectedId);
    if (!product) {
      setForm((f) => ({ ...f, productId: '', productName: '', dlcDays: 1 }));
      return;
    }
    setForm((f) => ({
      ...f,
      productId:   product.id,
      productName: product.name,
      dlcDays:     product.dlcDays ?? f.dlcDays,
    }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.productId || !form.producedAt || form.dlcDays < 1) return;
    const expiresAt = addDays(form.producedAt, form.dlcDays).toISOString();
    createMutation.mutate({ ...form, expiresAt });
  }

  function closeModal() {
    setModalOpen(false);
    setForm(INITIAL_FORM);
  }

  // ─── Active tab data ────────────────────────────────────────────────────────

  const activeQuery = activeTab === 'today' ? todayQuery : activeTab === 'soon' ? soonQuery : allQuery;
  const isLoading   = activeQuery.isLoading;
  const isError     = activeQuery.isError;
  const labels: DLCLabel[] =
    activeTab === 'all'
      ? (allQuery.data?.data ?? [])
      : ((activeQuery.data as DLCLabel[] | undefined) ?? []);
  const allMeta = activeTab === 'all' ? allQuery.data?.meta : undefined;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Header title="DLC" subtitle="Gestion des dates limites de consommation" />

      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex items-center justify-between gap-4">
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

            {allMeta && allMeta.lastPage > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                <span>
                  Page {allMeta.page} sur {allMeta.lastPage} — {allMeta.total} label(s)
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={allPage === 1}
                    onClick={() => setAllPage((p) => p - 1)}>
                    Précédent
                  </Button>
                  <Button variant="secondary" size="sm" disabled={allPage === allMeta.lastPage}
                    onClick={() => setAllPage((p) => p + 1)}>
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Create label modal ─────────────────────────────────────────────── */}
        <Modal
          open={modalOpen}
          onClose={closeModal}
          title="Nouveau label DLC"
          description="Sélectionnez un produit pour générer et imprimer une étiquette DLC."
          size="sm"
        >
          <form onSubmit={handleCreate} className="flex flex-col gap-4">

            {/* ── Product dropdown ── */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Produit <span className="text-red-500">*</span>
              </label>
              {productsQuery.isLoading ? (
                <div className="h-9 animate-pulse rounded-lg bg-gray-100" />
              ) : (
                <select
                  required
                  value={form.productId}
                  onChange={handleProductSelect}
                  className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
                >
                  <option value="">— Sélectionner un produit —</option>
                  {(productsQuery.data ?? [])
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.dlcDays ? ` (${p.dlcDays}j)` : ''}
                      </option>
                    ))}
                </select>
              )}
            </div>

            {/* ── Opening date ── */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Date d'ouverture <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="date"
                value={form.producedAt}
                onChange={(e) => setForm((f) => ({ ...f, producedAt: e.target.value }))}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>

            {/* ── DLC days (editable — may differ from product default) ── */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Durée de conservation (jours) <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="number"
                min={1}
                value={form.dlcDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dlcDays: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                }
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>

            {/* ── Real-time DLC preview ── */}
            {previewDlc && form.productName && (
              <div className="rounded-lg border border-brand-medium/30 bg-brand-medium/5 px-4 py-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Aperçu étiquette
                </p>
                <p className="text-sm font-semibold text-gray-900">{form.productName}</p>
                <p className="text-sm text-gray-600">
                  Ouverture : {new Date(form.producedAt).toLocaleDateString('fr-FR')}
                </p>
                <p className="text-sm font-medium text-brand-dark">
                  DLC : {previewDlc.toLocaleDateString('fr-FR')}
                </p>
              </div>
            )}

            {/* ── Error ── */}
            {createMutation.isError && (
              <p className="text-xs text-red-600">
                Une erreur est survenue. Veuillez réessayer.
              </p>
            )}

            {/* ── Actions ── */}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={closeModal}>
                Annuler
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={createMutation.isPending}
                disabled={!form.productId}
              >
                <Printer className="h-4 w-4" />
                Créer &amp; imprimer
              </Button>
            </div>
          </form>
        </Modal>
      </PageWrapper>
    </>
  );
}
