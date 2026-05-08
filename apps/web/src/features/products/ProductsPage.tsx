import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Search, Snowflake, Thermometer } from 'lucide-react';
import { useState } from 'react';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import type { ApiResponse, Product } from '@haccp/shared-types';
import { ProductForm } from './components/ProductForm';

function useProducts(page: number, search: string) {
  return useQuery({
    queryKey: ['products', page, search],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) p.set('search', search);
      const { data } = await api.get<ApiResponse<Product[]>>(`/api/v1/products?${p}`);
      return data;
    },
  });
}

function TempIndicator({ min, max }: { min?: number | null; max?: number | null }) {
  if (min == null && max == null) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
      <Snowflake className="h-3 w-3" />
      {min ?? '?'}°C / {max ?? '?'}°C
    </span>
  );
}

export default function ProductsPage() {
  const [page, setPage]   = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useProducts(page, debouncedSearch);

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/products', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      setModalOpen(false);
    },
  });

  return (
    <>
      <Header title="Produits" subtitle="Catalogue des produits et matières premières" />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Rechercher un produit…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-9 w-72 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Nouveau produit
          </Button>
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
            onAction={() => setModalOpen(true)}
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
                  <tr key={product.id} className="hover:bg-surface-page transition-colors">
                    <td className="px-4 py-3">
                      <code className="rounded bg-surface-page px-1.5 py-0.5 text-xs font-mono text-brand-dark">
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
                      {(product as Product & { supplier?: { name: string } }).supplier?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {product.dlcDays ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700">
                          <Thermometer className="h-3 w-3" />
                          {product.dlcDays}j
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <TempIndicator min={product.tempStorage} max={product.tempStorage} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-xs text-brand-medium hover:underline">Modifier</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data?.meta && data.meta.lastPage > 1 && (
              <div className="flex items-center justify-between border-t border-surface-muted px-4 py-3 text-sm text-gray-500">
                <span>Page {data.meta.page} sur {data.meta.lastPage} — {data.meta.total} produit(s)</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
                  <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Create Modal */}
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau produit" size="lg">
          <ProductForm
            loading={createMutation.isPending}
            onSubmit={(values) =>
              createMutation.mutateAsync({
                ...values,
                dlcDays: values.dlcDays ? Number(values.dlcDays) : undefined,
                tempStorage: values.tempStorage ? Number(values.tempStorage) : undefined,
                supplierId: values.supplierId || undefined,
              })
            }
          />
        </Modal>
      </PageWrapper>
    </>
  );
}
