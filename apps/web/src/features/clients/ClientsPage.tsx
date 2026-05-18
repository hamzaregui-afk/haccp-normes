import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Building2, ChevronRight, MoreHorizontal, Plus, Search,
  CheckCircle2, XCircle, Clock, Archive,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import type { ApiResponse, Tenant } from '@haccp/shared-types';

// ─── Error helper ─────────────────────────────────────────────────────────────

function extractApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { message?: string } | undefined)?.message;
    if (msg) return msg;
    if (err.response?.status === 409) return 'Ce slug est déjà utilisé par un autre client.';
    if (err.response?.status === 403) return 'Accès refusé — rôle SUPER_ADMIN requis.';
  }
  return 'Une erreur est survenue. Veuillez réessayer.';
}

// ─── Style constants ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; classes: string; icon: React.FC<{ className?: string }> }> = {
  ACTIVE:    { label: 'Actif',    classes: 'bg-green-100 text-green-800',  icon: CheckCircle2 },
  ARCHIVED:  { label: 'Archivé',  classes: 'bg-gray-100  text-gray-600',   icon: Archive },
  SUSPENDED: { label: 'Suspendu', classes: 'bg-red-100   text-red-700',    icon: XCircle },
};

const PLAN_CONFIG: Record<string, { label: string; classes: string }> = {
  trial:    { label: 'Essai',    classes: 'bg-amber-100 text-amber-800' },
  standard: { label: 'Standard', classes: 'bg-blue-100  text-brand-dark' },
  premium:  { label: 'Premium',  classes: 'bg-purple-100 text-purple-800' },
};

const SUB_STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  TRIAL:     { label: 'Essai',    classes: 'bg-amber-50  text-amber-700  border border-amber-200' },
  ACTIVE:    { label: 'Actif',    classes: 'bg-green-50  text-green-700  border border-green-200' },
  SUSPENDED: { label: 'Suspendu', classes: 'bg-red-50    text-red-700    border border-red-200' },
  CANCELLED: { label: 'Annulé',   classes: 'bg-gray-50   text-gray-600   border border-gray-200' },
  EXPIRED:   { label: 'Expiré',   classes: 'bg-gray-50   text-gray-500   border border-gray-200' },
};

// ─── Form types ───────────────────────────────────────────────────────────────

interface TenantFormValues { name: string; slug: string; plan: string; email: string; phone: string; }

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
      name:  tenant?.name  ?? '',
      slug:  tenant?.slug  ?? '',
      plan:  tenant?.plan  ?? 'standard',
      email: tenant?.email ?? '',
      phone: tenant?.phone ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (v: TenantFormValues) =>
      isEdit
        ? api.patch(`/api/v1/tenants/${tenant!.id}`, v)
        : api.post('/api/v1/tenants', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      showToast({ title: isEdit ? 'Client modifié' : 'Client créé avec succès', variant: 'success' });
      onClose();
    },
    onError: (err) => showToast({ title: extractApiError(err), variant: 'error' }),
  });

  return (
    <Modal open title={isEdit ? 'Modifier le client' : 'Nouveau client'} onClose={onClose}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
        {/* Name */}
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

        {/* Slug */}
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

        {/* Email + Phone */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input
              {...register('email')}
              type="email"
              placeholder="contact@client.com"
              className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Téléphone</label>
            <input
              {...register('phone')}
              type="tel"
              placeholder="+33 1 23 45 67 89"
              className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
        </div>

        {/* Plan */}
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
          <Button type="submit" loading={mutation.isPending}>{isEdit ? 'Enregistrer' : 'Créer le client'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Row actions dropdown ─────────────────────────────────────────────────────

interface RowActionsProps {
  tenant:   Tenant;
  onEdit:   () => void;
  onStatus: (status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED') => void;
}

function RowActions({ tenant, onEdit, onStatus }: RowActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded p-1 hover:bg-gray-100 text-gray-400 hover:text-gray-600"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 w-44 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
            <Link
              to={`/clients/${tenant.id}`}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setOpen(false)}
            >
              <ChevronRight className="h-4 w-4 text-brand-medium" /> Voir la fiche
            </Link>
            <button
              onClick={() => { onEdit(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Modifier
            </button>
            <div className="my-1 border-t border-gray-100" />
            {tenant.status === 'ACTIVE' && (
              <button
                onClick={() => { onStatus('SUSPENDED'); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-yellow-700 hover:bg-yellow-50"
              >
                Suspendre
              </button>
            )}
            {tenant.status === 'SUSPENDED' && (
              <button
                onClick={() => { onStatus('ACTIVE'); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50"
              >
                Réactiver
              </button>
            )}
            {tenant.status !== 'ARCHIVED' && (
              <button
                onClick={() => {
                  if (window.confirm(`Archiver « ${tenant.name} » ?`)) { onStatus('ARCHIVED'); }
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Archiver
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

interface TenantRowProps {
  tenant:   Tenant;
  onEdit:   (t: Tenant) => void;
  onStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED') => void;
}

function TenantRow({ tenant, onEdit, onStatus }: TenantRowProps) {
  const statusCfg = STATUS_CONFIG[tenant.status] ?? STATUS_CONFIG.ACTIVE;
  const planCfg   = PLAN_CONFIG[tenant.plan] ?? PLAN_CONFIG.standard;
  const subStatus = (tenant.subscription as { status?: string } | undefined | null)?.status;
  const subCfg    = subStatus ? SUB_STATUS_CONFIG[subStatus] : null;
  const siteCount = tenant._count?.sites ?? 0;
  const enabledModules = (tenant.modules ?? []).filter((m) => m.enabled).length;

  // Trial days remaining
  const trialEndsAt = (tenant.subscription as { trialEndsAt?: string | null } | null)?.trialEndsAt;
  const trialDays   = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  const StatusIcon = statusCfg.icon;

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
      {/* Name / slug */}
      <td className="px-4 py-3">
        <Link to={`/clients/${tenant.id}`} className="group flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-lighter">
            <Building2 className="h-4 w-4 text-brand-dark" />
          </div>
          <div>
            <p className="font-medium text-gray-900 group-hover:text-brand-medium transition-colors">
              {tenant.name}
            </p>
            <p className="text-xs font-mono text-gray-400">/{tenant.slug}</p>
          </div>
        </Link>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.classes}`}>
          <StatusIcon className="h-3 w-3" />
          {statusCfg.label}
        </span>
      </td>

      {/* Plan */}
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${planCfg.classes}`}>
          {planCfg.label}
        </span>
        {subCfg && (
          <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs ${subCfg.classes}`}>
            {subCfg.label}
          </span>
        )}
        {trialDays !== null && tenant.plan === 'trial' && (
          <p className="mt-0.5 text-xs text-amber-600">
            <Clock className="mr-0.5 inline h-3 w-3" />
            {trialDays}j restants
          </p>
        )}
      </td>

      {/* Modules */}
      <td className="px-4 py-3 text-sm text-gray-600">
        {enabledModules > 0 ? (
          <span className="font-medium text-gray-800">{enabledModules}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
        {' '}
        <span className="text-xs text-gray-400">/ 17</span>
      </td>

      {/* Sites */}
      <td className="px-4 py-3 text-sm text-gray-600">
        {siteCount > 0 ? (
          <span className="font-medium text-gray-800">{siteCount}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>

      {/* Email */}
      <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">
        {tenant.email ?? <span className="text-gray-200">—</span>}
      </td>

      {/* Created */}
      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
        {new Date(tenant.createdAt).toLocaleDateString('fr-FR')}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <Link
            to={`/clients/${tenant.id}`}
            className="hidden sm:inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-brand-medium hover:bg-brand-lighter transition-colors"
          >
            Voir <ChevronRight className="h-3 w-3" />
          </Link>
          <RowActions
            tenant={tenant}
            onEdit={() => onEdit(tenant)}
            onStatus={(status) => onStatus(tenant.id, status)}
          />
        </div>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const qc = useQueryClient();
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery]   = useState('');
  const [modalTenant, setModalTenant] = useState<Tenant | null | undefined>(undefined);

  const { data, isLoading } = useTenants(page, query);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/tenants/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      showToast({ title: 'Statut mis à jour', variant: 'success' });
    },
    onError: (err) => showToast({ title: extractApiError(err), variant: 'error' }),
  });

  const tenants = data?.data ?? [];

  return (
    <>
      <Header
        title="Clients"
        subtitle="Gestion des instances clientes SaaS"
        icon={Building2}
        iconColor="bg-brand-light text-brand-dark"
      />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <form
            onSubmit={(e) => { e.preventDefault(); setQuery(search); setPage(1); }}
            className="flex gap-2"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Nom, slug, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-64 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">Rechercher</Button>
          </form>

          <div className="flex items-center gap-3">
            {data?.meta && (
              <span className="text-xs text-gray-400">{data.meta.total} client(s)</span>
            )}
            <Button size="sm" onClick={() => setModalTenant(null)}>
              <Plus className="mr-1.5 h-4 w-4" /> Nouveau client
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-muted bg-gray-50/80">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Client</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Modules</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Sites</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Créé le</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {[...Array(8)].map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-gray-100" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-20 text-center">
                    <Building2 className="mx-auto mb-3 h-10 w-10 text-gray-200" />
                    <p className="font-medium text-gray-400">Aucun client trouvé</p>
                    <button
                      onClick={() => setModalTenant(null)}
                      className="mt-3 text-sm text-brand-medium hover:underline"
                    >
                      Créer le premier client →
                    </button>
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => (
                  <TenantRow
                    key={tenant.id}
                    tenant={tenant}
                    onEdit={setModalTenant}
                    onStatus={(id, status) => statusMutation.mutate({ id, status })}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

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
