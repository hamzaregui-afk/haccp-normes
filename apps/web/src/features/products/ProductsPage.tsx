import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Filter, Package, Plus, Search, Snowflake, Thermometer, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { exportCSV, importFile } from '@/lib/csv';
import { useDebounce } from '@/hooks/useDebounce';
import { useTenantId } from '@/hooks/useTenantId';
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
  const { t } = useTranslation();
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [categoryFilter, setCategory] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductWithSupplier | null>(null);
  const [importing, setImporting]   = useState(false);
  const importRef                   = useRef<HTMLInputElement>(null);

  const queryClient     = useQueryClient();
  const debouncedSearch = useDebounce(search, 400);
  const tenantId        = useTenantId();

  // Re-declare useProducts inline to support category filter
  const { data, isLoading } = useQuery({
    queryKey: ['products', tenantId, page, debouncedSearch, categoryFilter],
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
      void queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      setCreateOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/products/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      setEditProduct(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/products/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['products', tenantId] }),
    onError: () => showToast({ title: t('products.toast.deleteError'), variant: 'error' }),
  });

  // Helpers
  const buildBody = (values: ProductFormValues): Record<string, unknown> => ({
    ...values,
    dlcDays: values.dlcDays ? Number(values.dlcDays) : undefined,
    tempStorage: values.tempStorage ? Number(values.tempStorage) : undefined,
    supplierId: values.supplierId || undefined,
  });

  const handleDelete = (product: ProductWithSupplier) => {
    if (!window.confirm(t('products.confirm.delete', { name: product.name })))
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

  // Import CSV / Excel
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      // importFile normalise toutes les clés : minuscules + sans accents
      const records = await importFile(file);
      let ok = 0;
      let fail = 0;
      for (const row of records) {
        const code = row['code'] ?? '';
        const name = row['nom'] ?? row['name'] ?? '';
        if (!code && !name) { fail++; continue; }
        const dlcRaw = row['dlc(jours)'] ?? row['dlc_jours'] ?? row['dlc jours'] ?? row['dlc'] ?? '';
        const tempRaw = row['temp.stockage'] ?? row['temp_stockage'] ?? row['temperature stockage'] ?? '';
        try {
          await api.post('/api/v1/products', {
            code,
            name,
            category:    row['categorie'] ?? row['category'] ?? undefined,
            dlcDays:     dlcRaw  ? Number(dlcRaw)  : undefined,
            tempStorage: tempRaw ? Number(tempRaw) : undefined,
          } satisfies Record<string, unknown>);
          ok++;
        } catch {
          fail++;
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      showToast({
        title: fail
          ? t('products.toast.importDoneWithFail', { ok, fail })
          : t('products.toast.importDone', { ok }),
        variant: fail && ok === 0 ? 'error' : fail ? 'warning' : 'success',
      });
    } catch {
      showToast({ title: t('products.toast.importReadError'), variant: 'error' });
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
      <Header title={t('products.title')} subtitle={t('products.subtitle')} />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                placeholder={t('products.searchPlaceholder')}
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
              <option value="">{t('products.allCategories')}</option>
              <option value="Viande">{t('products.categories.Viande')}</option>
              <option value="Poisson">{t('products.categories.Poisson')}</option>
              <option value="Légume">{t('products.categories.Légume' as Parameters<typeof t>[0])}</option>
              <option value="Fruit">{t('products.categories.Fruit')}</option>
              <option value="Produit laitier">{t('products.categories.Produit laitier' as Parameters<typeof t>[0])}</option>
              <option value="Épicerie">{t('products.categories.Épicerie' as Parameters<typeof t>[0])}</option>
              <option value="Boulangerie">{t('products.categories.Boulangerie')}</option>
              <option value="Boisson">{t('products.categories.Boisson')}</option>
              <option value="Autre">{t('products.categories.Autre')}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={(data?.data ?? []).length === 0}
            >
              <Download className="h-4 w-4" /> {t('products.export')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={importing}
              onClick={() => importRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> {t('products.import')}
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              className="hidden"
              onChange={(e) => void handleImportFile(e)}
            />
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> {t('products.new')}
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">{t('common.loading')}</div>
        ) : (data?.data ?? []).length === 0 ? (
          <EmptyState
            icon={Package}
            title={t('products.empty.title')}
            description={t('products.empty.description')}
            actionLabel={t('products.empty.action')}
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">{t('products.columns.code')}</th>
                  <th className="px-4 py-3">{t('products.columns.product')}</th>
                  <th className="px-4 py-3">{t('products.columns.category')}</th>
                  <th className="px-4 py-3">{t('products.columns.supplier')}</th>
                  <th className="px-4 py-3">{t('products.columns.dlc')}</th>
                  <th className="px-4 py-3">{t('products.columns.storage')}</th>
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
                          {t('common.edit')}
                        </button>
                        <span className="text-gray-300">·</span>
                        <button
                          className="text-xs text-red-500 hover:underline"
                          onClick={() => handleDelete(product)}
                          disabled={deleteMutation.isPending}
                        >
                          {t('common.delete')}
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
                  {t('products.pagination.info', {
                    page: data.meta.page,
                    lastPage: data.meta.lastPage,
                    total: data.meta.total,
                  })}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {t('common.previous')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === data.meta.lastPage}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Create modal */}
        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('products.modal.create')} size="lg">
          <ProductForm
            loading={createMutation.isPending}
            onSubmit={(values) => createMutation.mutateAsync(buildBody(values))}
          />
        </Modal>

        {/* Edit modal */}
        <Modal
          open={editProduct !== null}
          onClose={() => setEditProduct(null)}
          title={t('products.modal.edit', { name: editProduct?.name ?? '' })}
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
