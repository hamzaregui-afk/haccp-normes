import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Printer, Tag, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenantId';

// ─── Domain types ─────────────────────────────────────────────────────────────

interface DLCLabel {
  id: string;
  productId: string;
  productName: string;
  lotNumber: string | null;
  producedAt: string;
  expiresAt: string;
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
}

interface ApiResponse<T> {
  data: T;
  meta?: { total: number; page: number; limit: number; lastPage: number };
  message?: string;
}

// ─── ZPL generation & printing ────────────────────────────────────────────────

function generateZPL(productName: string, openedAt: string, expiresAt: string, dlcDays: number): string {
  const opened  = new Date(openedAt).toLocaleDateString('fr-FR');
  const expires = new Date(expiresAt).toLocaleDateString('fr-FR');
  const safeName = productName.length > 28 ? productName.slice(0, 26) + '…' : productName;
  return [
    '^XA', '^MMT', '^PW323', '^LL182', '^LS0',
    `^FO10,12^A0N,32,32^FD${safeName}^FS`,
    '^FO10,55^GB303,2,2^FS',
    `^FO10,68^A0N,26,26^FDOuverture : ${opened}^FS`,
    `^FO10,104^A0N,26,26^FDDLC       : ${expires}^FS`,
    `^FO10,140^A0N,20,20^FD(${dlcDays} jour${dlcDays > 1 ? 's' : ''} de conservation)^FS`,
    '^PQ1,0,1,Y', '^XZ',
  ].join('\n');
}

async function printZPL(zpl: string, productName: string): Promise<void> {
  try {
    const resp = await fetch('http://localhost:9100/available', { signal: AbortSignal.timeout(800) });
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
        return;
      }
    }
  } catch { /* pas de Zebra Browser Print — fallback téléchargement */ }

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

// ─── ProductCombobox ──────────────────────────────────────────────────────────
// Autocomplete avec recherche en temps réel, navigation clavier et catégorie.

interface ProductComboboxProps {
  products: Product[];
  loading: boolean;
  value: Product | null;
  onChange: (product: Product | null) => void;
}

function ProductCombobox({ products, loading, value, onChange }: ProductComboboxProps) {
  const [query, setQuery]       = useState('');
  const [open, setOpen]         = useState(false);
  const [cursor, setCursor]     = useState(-1);
  const inputRef                = useRef<HTMLInputElement>(null);
  const listRef                 = useRef<HTMLUListElement>(null);
  const containerRef            = useRef<HTMLDivElement>(null);

  // Filtered list — search on name, code or category
  const filtered = query.length < 1
    ? products
    : products.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.code.toLowerCase().includes(query.toLowerCase()) ||
        p.category.toLowerCase().includes(query.toLowerCase()),
      );

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If user blurred without selecting, restore last valid value or clear
        if (!value) setQuery('');
        else setQuery('');
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [value]);

  // Scroll active item into view
  useEffect(() => {
    if (cursor >= 0 && listRef.current) {
      const item = listRef.current.children[cursor] as HTMLLIElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [cursor]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
    setCursor(-1);
    if (e.target.value === '') onChange(null);
  }

  function handleSelect(product: Product) {
    onChange(product);
    setQuery('');
    setOpen(false);
    setCursor(-1);
    inputRef.current?.blur();
  }

  function handleClear() {
    onChange(null);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && e.key !== 'Escape') { setOpen(true); return; }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (cursor >= 0 && filtered[cursor]) handleSelect(filtered[cursor]);
        break;
      case 'Escape':
        setOpen(false);
        setCursor(-1);
        break;
    }
  }

  const displayValue = value ? value.name : query;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          placeholder="Rechercher un produit…"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={() => { setOpen(true); if (value) onChange(null); }}
          onKeyDown={handleKeyDown}
          className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 pr-16 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
        />
        <div className="absolute right-0 flex items-center gap-0.5 pr-1">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => { setOpen((o) => !o); inputRef.current?.focus(); }}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-gray-600"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-gray-400">Chargement…</li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">Aucun produit trouvé</li>
          ) : (
            filtered.map((product, idx) => (
              <li
                key={product.id}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(product); }}
                onMouseEnter={() => setCursor(idx)}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors ${
                  idx === cursor
                    ? 'bg-brand-medium/10 text-brand-dark'
                    : 'text-gray-800 hover:bg-gray-50'
                }`}
              >
                <span className="font-medium">{product.name}</span>
                <span className="ml-3 shrink-0 text-xs text-gray-400">
                  {product.category}{product.dlcDays ? ` · ${product.dlcDays}j` : ''}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ─── DLC status helpers ───────────────────────────────────────────────────────

type DLCStatus = 'EXPIRED' | 'CRITICAL' | 'SOON' | 'OK';

function getDLCStatus(d: number): DLCStatus {
  if (d <= 0) return 'EXPIRED';
  if (d <= 3) return 'CRITICAL';
  if (d <= 7) return 'SOON';
  return 'OK';
}

const STATUS_STYLES: Record<DLCStatus, string> = {
  EXPIRED:  'bg-red-100 text-red-700 border border-red-200',
  CRITICAL: 'bg-orange-100 text-orange-700 border border-orange-200',
  SOON:     'bg-yellow-100 text-yellow-700 border border-yellow-200',
  OK:       'bg-green-100 text-green-700 border border-green-200',
};
const STATUS_LABELS: Record<DLCStatus, string> = {
  EXPIRED: 'Expiré', CRITICAL: 'Critique', SOON: 'Bientôt', OK: 'OK',
};

function daysLeft(expiresAt: string) {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}
function fmtDate(d: string) { return new Date(d).toLocaleDateString('fr-FR'); }
function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d;
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

type Tab = 'today' | 'soon' | 'all';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: "Expire aujourd'hui" },
  { id: 'soon',  label: 'Expire bientôt (7j)' },
  { id: 'all',   label: 'Tous les labels' },
];

// ─── Query hooks ──────────────────────────────────────────────────────────────

const REFETCH_MS = 5 * 60 * 1000;

function useProducts() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['products', tenantId, 'dlc-select'],
    // ARCH-DECISION: No active=true filter — the backend default (when active param
    // is omitted) already filters isActive:true. Passing active=true explicitly
    // triggers a Prisma query that returns 0 results due to enum parsing mismatch.
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Product[]>>(
        '/api/v1/products?page=1&limit=200',
      );
      return (data.data ?? []).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useExpiringToday() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['dlc', tenantId, 'today'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DLCLabel[]>>('/api/v1/dlc/labels/expiring-today');
      return data.data;
    },
    refetchInterval: REFETCH_MS,
  });
}
function useExpiringSoon() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['dlc', tenantId, 'soon'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DLCLabel[]>>('/api/v1/dlc/labels/expiring-soon?days=7');
      return data.data;
    },
    refetchInterval: REFETCH_MS,
  });
}
function useAllLabels(page: number) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['dlc', tenantId, 'all', page],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DLCLabel[]>>(`/api/v1/dlc/labels?page=${page}&limit=20`);
      return data;
    },
    refetchInterval: REFETCH_MS,
  });
}

// ─── DLC table ────────────────────────────────────────────────────────────────

function DLCTable({ labels }: { labels: DLCLabel[] }) {
  if (labels.length === 0) {
    return <EmptyState icon={Tag} title="Aucun label DLC" description="Aucun label ne correspond à ce filtre." />;
  }

  function handleReprint(label: DLCLabel) {
    const d = Math.round(
      (new Date(label.expiresAt).getTime() - new Date(label.producedAt).getTime()) / 86_400_000,
    );
    void printZPL(generateZPL(label.productName, label.producedAt, label.expiresAt, d), label.productName);
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

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  selectedProduct: Product | null;
  producedAt: string;
  dlcDays: number;
}
const INITIAL: FormState = {
  selectedProduct: null,
  producedAt: new Date().toISOString().slice(0, 10),
  dlcDays: 1,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DLCWebPage() {
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm]           = useState<FormState>(INITIAL);
  const [allPage, setAllPage]     = useState(1);
  const queryClient               = useQueryClient();
  const tenantId                  = useTenantId();

  const productsQuery = useProducts();
  const todayQuery    = useExpiringToday();
  const soonQuery     = useExpiringSoon();
  const allQuery      = useAllLabels(allPage);

  const previewDlc: Date | null =
    form.selectedProduct && form.producedAt && form.dlcDays > 0
      ? addDays(form.producedAt, form.dlcDays)
      : null;

  const createMutation = useMutation({
    mutationFn: (payload: {
      productId: string; productName: string; dlcDays: number;
      producedAt: string; expiresAt: string;
    }) => api.post<ApiResponse<DLCLabel>>('/api/v1/dlc/labels', payload),
    onSuccess: (resp, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['dlc', tenantId] });
      setModalOpen(false);
      setForm(INITIAL);
      const label = resp.data.data;
      const expiresAt = label?.expiresAt ?? vars.expiresAt;
      void printZPL(
        generateZPL(vars.productName, vars.producedAt, expiresAt, vars.dlcDays),
        vars.productName,
      );
    },
  });

  function handleProductChange(product: Product | null) {
    setForm((f) => ({
      ...f,
      selectedProduct: product,
      dlcDays: product?.dlcDays ?? f.dlcDays,
    }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.selectedProduct || !form.producedAt || form.dlcDays < 1) return;
    const expiresAt = addDays(form.producedAt, form.dlcDays).toISOString();
    createMutation.mutate({
      productId:   form.selectedProduct.id,
      productName: form.selectedProduct.name,
      dlcDays:     form.dlcDays,
      producedAt:  form.producedAt,
      expiresAt,
    });
  }

  function closeModal() { setModalOpen(false); setForm(INITIAL); }

  const activeQuery = activeTab === 'today' ? todayQuery : activeTab === 'soon' ? soonQuery : allQuery;
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
          <div className="flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'bg-brand-medium text-white shadow-sm' : 'text-gray-600 hover:text-brand-dark'
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
        {activeQuery.isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
        ) : activeQuery.isError ? (
          <div className="py-20 text-center text-sm text-red-500">Erreur lors du chargement des labels DLC.</div>
        ) : (
          <>
            <DLCTable labels={labels} />
            {allMeta && allMeta.lastPage > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                <span>Page {allMeta.page} sur {allMeta.lastPage} — {allMeta.total} label(s)</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={allPage === 1} onClick={() => setAllPage((p) => p - 1)}>Précédent</Button>
                  <Button variant="secondary" size="sm" disabled={allPage === allMeta.lastPage} onClick={() => setAllPage((p) => p + 1)}>Suivant</Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Modal */}
        <Modal
          open={modalOpen}
          onClose={closeModal}
          title="Nouveau label DLC"
          description="Sélectionnez un produit pour générer et imprimer une étiquette DLC."
          size="sm"
        >
          <form onSubmit={handleCreate} className="flex flex-col gap-4">

            {/* Autocomplete produit */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Produit <span className="text-red-500">*</span>
              </label>
              <ProductCombobox
                products={productsQuery.data ?? []}
                loading={productsQuery.isLoading}
                value={form.selectedProduct}
                onChange={handleProductChange}
              />
              {productsQuery.isError && (
                <p className="text-xs text-red-500">Impossible de charger les produits.</p>
              )}
            </div>

            {/* Date d'ouverture */}
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

            {/* Durée conservation */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Durée de conservation (jours) <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="number"
                min={1}
                value={form.dlcDays}
                onChange={(e) => setForm((f) => ({ ...f, dlcDays: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>

            {/* Aperçu étiquette */}
            {previewDlc && form.selectedProduct && (
              <div className="rounded-lg border border-brand-medium/30 bg-brand-medium/5 px-4 py-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Aperçu étiquette ZPL</p>
                <p className="text-sm font-bold text-gray-900">{form.selectedProduct.name}</p>
                <p className="text-sm text-gray-600">
                  Ouverture&nbsp;: {new Date(form.producedAt + 'T12:00:00').toLocaleDateString('fr-FR')}
                </p>
                <p className="text-sm font-semibold text-brand-dark">
                  DLC&nbsp;: {previewDlc.toLocaleDateString('fr-FR')}
                </p>
              </div>
            )}

            {createMutation.isError && (
              <p className="text-xs text-red-600">Une erreur est survenue. Veuillez réessayer.</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={closeModal}>Annuler</Button>
              <Button
                type="submit"
                size="sm"
                loading={createMutation.isPending}
                disabled={!form.selectedProduct}
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
