import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import type { ApiResponse, Tenant } from '@haccp/shared-types';

// ─── Style constants ──────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-800',
  ARCHIVED:  'bg-gray-100 text-gray-600',
  SUSPENDED: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif', ARCHIVED: 'Archivé', SUSPENDED: 'Suspendu',
};

const PLAN_LABELS: Record<string, string> = {
  standard: 'Standard', premium: 'Premium', trial: 'Essai',
};

// ─── Form types ───────────────────────────────────────────────────────────────

interface TenantFormValues { name: string; slug: string; plan: string; }

// ─── Query hook ───────────────────────────────────────────────────────────────

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

// ─── Create / Edit modal ──────────────────────────────────────────────────────

interface TenantModalProps { tenant?: Tenant | null; onClose: () => void; }

function TenantModal({ tenant, onClose }: TenantModalProps) {
  const qc     = useQueryClient();
  const isEdit = !!tenant;

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<TenantFormValues>({
    defaultValues: {
      name: tenant?.name ?? '',
      slug: tenant?.slug ?? '',
      plan: tenant?.plan ?? 'standard',
    },
  });

  const mutation = useMutation({
    mutationFn: (v: TenantFormValues) =>
      isEdit
        ? api.patch(`/api/v1/tenants/${tenant!.id}`, v)
        : api.post('/api/v1/tenants', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      showToast({ title: isEdit ? 'Client modifié' : 'Client créé', variant: 'success' });
      onClose();
    },
    onError: () => showToast({ title: 'Erreur — vérifiez que le slug est unique', variant: 'error' }),
  });

  return (
    <Modal title={isEdit ? 'Modifier le client' : 'Nouveau client'} onClose={onClose}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Nom <span className="text-red-500">*</span></label>
          <input
            {...register('name', { required: 'Obligatoire' })}
            type="text"
            placeholder="Boulangerie Dupont"
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            onChange={(e) => {
              void register('name').onChange(e);
              if (!isEdit)
                setValue('slug', e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
            }}
          />
          {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Slug <span className="text-red-500">*</span></label>
          <input
            {...register('slug', {
              required: 'Obligatoire',
              pattern: { value: /^[a-z0-9-]+$/, message: 'Minuscules, chiffres et tirets uniquement' },
            })}
            type="text"
            placeholder="boulangerie-dupont"
            disabled={isEdit}
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-medium disabled:bg-gray-50 disabled:text-gray-400"
          />
          {errors.slug && <p className="text-xs text-red-600">{errors.slug.message}</p>}
          {!isEdit && <p className="text-xs text-gray-400">Unique et immuable après création</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Plan</label>
          <select
            {...register('plan')}
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
          >
            <option value="trial">Essai (14 jours)</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={mutation.isPending}>{isEdit ? 'Enregistrer' : 'Créer'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Tenant card ──────────────────────────────────────────────────────────────

interface TenantCardProps {
  tenant:   Tenant;
  onEdit:   (t: Tenant) => void;
  onStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED') => void;
}

function TenantCard({ tenant, onEdit, onStatus }: TenantCardProps) {
  return (
    <div className="rounded-xl border border-surface-muted bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-lighter">
            <Building2 className="h-5 w-5 text-brand-dark" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{tenant.name}</p>
            <p className="text-xs font-mono text-gray-400">/{tenant.slug}</p>
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[tenant.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[tenant.status] ?? tenant.status}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span>Plan : <strong className="text-gray-700">{PLAN_LABELS[tenant.plan] ?? tenant.plan}</strong></span>
        <span>{new Date(tenant.createdAt).toLocaleDateString('fr-FR')}</span>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs">
        <button onClick={() => onEdit(tenant)} className="text-brand-medium hover:underline">Modifier</button>
        {tenant.status === 'ACTIVE' && (
          <><span className="text-gray-200">·</span>
          <button onClick={() => onStatus(tenant.id, 'SUSPENDED')} className="text-yellow-600 hover:underline">Suspendre</button></>
        )}
        {tenant.status === 'SUSPENDED' && (
          <><span className="text-gray-200">·</span>
          <button onClick={() => onStatus(tenant.id, 'ACTIVE')} className="text-green-600 hover:underline">Réactiver</button></>
        )}
        {tenant.status !== 'ARCHIVED' && (
          <><span className="text-gray-200">·</span>
          <button
            onClick={() => {
              if (window.confirm(`Archiver « ${tenant.name} » ?`)) onStatus(tenant.id, 'ARCHIVED');
            }}
            className="text-red-500 hover:underline"
          >Archiver</button></>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const qc = useQueryClient();
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery]   = useState('');
  // undefined = closed, null = create mode, Tenant = edit mode
  const [modalTenant, setModalTenant] = useState<Tenant | null | undefined>(undefined);

  const { data, isLoading } = useTenants(page, query);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/tenants/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      showToast({ title: 'Statut mis à jour', variant: 'success' });
    },
  });

  return (
    <>
      <Header
        title="Clients"
        subtitle="Gestion des tenants — SUPER_ADMIN uniquement"
        icon={Building2}
        iconColor="bg-brand-light text-brand-dark"
      />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex items-center justify-between gap-4">
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
          <Button size="sm" onClick={() => setModalTenant(null)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nouveau client
          </Button>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-surface-page" />)}
          </div>
        ) : (data?.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-muted bg-white py-20 text-center">
            <Building2 className="mb-3 h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-500">Aucun client trouvé</p>
            <Button className="mt-4" size="sm" onClick={() => setModalTenant(null)}>
              <Plus className="mr-1 h-4 w-4" /> Créer le premier client
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(data?.data ?? []).map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                onEdit={setModalTenant}
                onStatus={(id, status) => statusMutation.mutate({ id, status })}
              />
            ))}
          </div>
        )}

        {data?.meta && (
          <Pagination
            page={data.meta.page}
            lastPage={data.meta.lastPage}
            total={data.meta.total}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
            onPage={setPage}
          />
        )}
      </PageWrapper>

      {modalTenant !== undefined && (
        <TenantModal tenant={modalTenant} onClose={() => setModalTenant(undefined)} />
      )}
    </>
  );
}
