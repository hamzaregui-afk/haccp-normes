import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Filter, Package, Plus, Search, Snowflake, Thermometer, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { exportCSV, importCSV } from '@/lib/csv';
import { useDebounce } from '@/hooks/useDebounce';
import type { ApiResponse, Product } from '@haccp/shared-types';
import { ProductForm } from './components/ProductForm';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ProductWithSupplier = Product & { supplier?: { name: string } };

function TempIndicator({ min, max }: { min?: number | null; max?: number | null }) {
  if (min == null && max == null) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
      <Snowflake className="h-3 w-3" />
      {min ?? '?'}°C / {max ?? '?'}°C
    </span>
  );
}

// ─── CSV columns ──────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  { key: 'code', header: 'Code' },
  { key: 'name', header: 'Nom' },
  { key: 'category', header: 'Catégorie' },
  { key: 'dlcDays', header: 'DLC(jours)' },
  { key: 'tempStorage', header: 'Temp.Stockage' },
  { key: 'supplierName', header: 'Fournisseur' },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

interface ProductFormValues {
  code: string;
  name: string;
  category: string;
  packaging: string;
  dlcDays: string;
  tempStorage: string;
  supplierId: string;
}

export default function ProductsPage() {
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [categoryFilter, setCategory] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductWithSupplier | null>(null);
  const [importing, setImporting]   = useState(false);
  const importRef                   = useRef<HTMLInputElement>(null);

  const queryClient     = useQueryClient();
  const debouncedSearch = useDebounce(search, 400);

  // Re-declare useProducts inline to support category filter
  const { data, isLoading } = useQuery({
    queryKey: ['products', page, debouncedSearch, categoryFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) p.set('search', debouncedSearch);
      if (categoryFilter)  p.set('category', categoryFilter);
      const { data: res } = await api.get<ApiResponse<ProductWithSupplier[]>>(`/api/v1/products?${p}`);
      return res;
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/products', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      setCreateOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/products/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditProduct(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/products/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['products'] }),
    onError: () => showToast({ title: 'Erreur lors de la suppression', variant: 'error' }),
  });

  // Helpers
  const buildBody = (values: ProductFormValues): Record<string, unknown> => ({
    ...values,
    dlcDays: values.dlcDays ? Number(values.dlcDays) : undefined,
    tempStorage: values.tempStorage ? Number(values.tempStorage) : undefined,
    supplierId: values.supplierId || undefined,
  });

  const handleDelete = (product: ProductWithSupplier) => {
    if (!window.confirm(`Supprimer le produit « ${product.name} » ? Cette action est irréversible.`))
      return;
    deleteMutation.mutate(product.id);
  };

  // CSV export
  const handleExport = () => {
    const rows = (data?.data ?? []).map((p) => ({
      code: p.code,
      name: p.name,
      category: p.category,
      dlcDays: p.dlcDays ?? '',
      tempStorage: p.tempStorage ?? '',
      supplierName: p.supplier?.name ?? '',
    })) as Record<string, unknown>[];
    exportCSV(rows, CSV_COLUMNS, 'produits');
  };

  // CSV import
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const records = await importCSV(file);
      let ok = 0;
      let fail = 0;
      for (const row of records) {
        try {
          await api.post('/api/v1/products', {
            code: row['code'] ?? row['Code'] ?? '',
            name: row['nom'] ?? row['Nom'] ?? '',
            category: row['categorie'] ?? row['Catégorie'] ?? '',
            dlcDays: row['dlc_jours'] ?? row['DLC(jours)'] ? Number(row['dlc_jours'] ?? row['DLC(jours)']) : undefined,
            tempStorage: row['temp_stockage'] ?? row['Temp.Stockage'] ? Number(row['temp_stockage'] ?? row['Temp.Stockage']) : undefined,
          } satisfies Record<string, unknown>);
          ok++;
        } catch {
          fail++;
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      showToast({ title: `Import terminé : ${ok} ligne(s)${fail ? `, ${fail} erreur(s)` : ''}`, variant: fail ? 'warning' : 'success' });
    } catch {
      showToast({ title: 'Erreur lors de la lecture du fichier CSV.', variant: 'error' });
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  // Edit default values
  const editDefaults = editProduct
    ? {
        code: editProduct.code,
        name: editProduct.name,
        category: editProduct.category,
        packaging: editProduct.packaging ?? '',
        dlcDays: editProduct.dlcDays != null ? String(editProduct.dlcDays) : '',
        tempStorage: editProduct.tempStorage != null ? String(editProduct.tempStorage) : '',
        supplierId: (editProduct as ProductWithSupplier & { supplierId?: string }).supplierId ?? '',
      }
    : undefined;

  return (
    <>
      <Header title="Produits" subtitle="Catalogue des produits et matières premières" />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Rechercher un produit…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-9 w-full sm:w-60 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>
            <Filter className="h-4 w-4 shrink-0 text-gray-400" />
            <select
              value={categoryFilter}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="h-9 rounded-lg border border-surface-muted bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
            >
              <option value="">Toutes les catégories</option>
              <option value="Viande">Viande</option>
              <option value="Poisson">Poisson</option>
              <option value="Légume">Légume</option>
              <option value="Fruit">Fruit</option>
              <option value="Produit laitier">Produit laitier</option>
              <option value="Épicerie">Épicerie</option>
              <option value="Boulangerie">Boulangerie</option>
              <option value="Boisson">Boisson</option>
              <option value="Autre">Autre</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={(data?.data ?? []).length === 0}
            >
              <Download className="h-4 w-4" /> Exporter
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={importing}
              onClick={() => importRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> Importer
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void handleImportFile(e)}
            />
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Nouveau produit
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
        ) : (data?.data ?? []).length === 0 ? (
          <EmptyState
            icon={Package}
            title="Aucun produit"
            description="Commencez par ajouter vos produits et matières premières pour les associer à vos contrôles et non-conformités."
            actionLabel="Créer un produit"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Produit</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3">Fournisseur</th>
                  <th className="px-4 py-3">DLC</th>
                  <th className="px-4 py-3">Stockage</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-muted">
                {(data?.data ?? []).map((product) => (
                  <tr key={product.id} className="transition-colors hover:bg-surface-page">
                    <td className="px-4 py-3">
                      <code className="rounded bg-surface-page px-1.5 py-0.5 font-mono text-xs text-brand-dark">
                        {product.code}
                      </code>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gold-light px-2.5 py-0.5 text-xs font-medium text-gold">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {product.supplier?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {product.dlcDays ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700">
                          <Thermometer className="h-3 w-3" />
                          {product.dlcDays}j
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <TempIndicator min={product.tempStorage} max={product.tempStorage} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          className="text-xs text-brand-medium hover:underline"
                          onClick={() => setEditProduct(product)}
                        >
                          Modifier
                        </button>
                        <span className="text-gray-300">·</span>
                        <button
                          className="text-xs text-red-500 hover:underline"
                          onClick={() => handleDelete(product)}
                          disabled={deleteMutation.isPending}
                        >
                          Supprimer
                        </button>
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
                  Page {data.meta.page} sur {data.meta.lastPage} — {data.meta.total} produit(s)
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

        {/* Create modal */}
        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau produit" size="lg">
          <ProductForm
            loading={createMutation.isPending}
            onSubmit={(values) => createMutation.mutateAsync(buildBody(values))}
          />
        </Modal>

        {/* Edit modal */}
        <Modal
          open={editProduct !== null}
          onClose={() => setEditProduct(null)}
          title={`Modifier — ${editProduct?.name ?? ''}`}
          size="lg"
        >
          {editProduct && (
            <ProductForm
              key={editProduct.id}
              loading={updateMutation.isPending}
              defaultValues={editDefaults}
              onSubmit={(values) =>
                updateMutation.mutateAsync({ id: editProduct.id, body: buildBody(values) })
              }
            />
          )}
        </Modal>
      </PageWrapper>
    </>
  );
}
