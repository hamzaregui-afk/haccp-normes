import { useQuery } from '@tanstack/react-query';
import { Building2, Plus, Search } from 'lucide-react';
import { useState } from 'react';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import type { ApiResponse, Tenant } from '@haccp/shared-types';

const STATUS_STYLES = {
  ACTIVE:    'bg-green-100 text-green-800',
  ARCHIVED:  'bg-gray-100 text-gray-600',
  SUSPENDED: 'bg-red-100 text-red-700',
};
const STATUS_LABELS = {
  ACTIVE: 'Actif', ARCHIVED: 'Archivé', SUSPENDED: 'Suspendu',
};

function useTenants(page: number, search: string) {
  return useQuery({
    queryKey: ['tenants', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const { data } = await api.get<ApiResponse<Tenant[]>>(`/api/v1/tenants?${params}`);
      return data;
    },
  });
}

export default function ClientsPage() {
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery]   = useState('');

  const { data, isLoading } = useTenants(page, query);

  return (
    <>
      <Header title="Clients" subtitle="Gestion des tenants — SUPER_ADMIN uniquement" />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex items-center justify-between">
          <form
            onSubmit={(e) => { e.preventDefault(); setQuery(search); setPage(1); }}
            className="flex gap-2"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Rechercher un client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-64 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">Filtrer</Button>
          </form>
          <Button size="sm">
            <Plus className="h-4 w-4" /> Nouveau client
          </Button>
        </div>

        {/* Grid of tenant cards */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(data?.data ?? []).map((tenant) => (
              <div
                key={tenant.id}
                className="rounded-xl border border-surface-muted bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-lighter">
                      <Building2 className="h-5 w-5 text-brand-dark" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{tenant.name}</p>
                      <p className="text-xs text-gray-500">/{tenant.slug}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[tenant.status]}`}>
                    {STATUS_LABELS[tenant.status]}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                  <span>Plan : <strong className="text-gray-700">{tenant.plan}</strong></span>
                  <span>{new Date(tenant.createdAt).toLocaleDateString('fr-FR')}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="text-xs text-brand-medium hover:underline">Voir</button>
                  <span className="text-gray-300">·</span>
                  <button className="text-xs text-brand-medium hover:underline">Modifier</button>
                  <span className="text-gray-300">·</span>
                  <button className="text-xs text-red-500 hover:underline">Archiver</button>
                </div>
              </div>
            ))}
            {(data?.data ?? []).length === 0 && (
              <div className="col-span-3 py-20 text-center text-sm text-gray-400">
                Aucun client trouvé.
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {data?.meta && data.meta.lastPage > 1 && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Précédent
            </Button>
            <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>
              Suivant
            </Button>
          </div>
        )}
      </PageWrapper>
    </>
  );
}
