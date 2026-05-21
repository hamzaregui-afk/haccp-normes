import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronDown, ChevronRight, Edit2, MapPin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenantId';
import type { ApiResponse } from '@haccp/shared-types';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Zone {
  id:     string;
  name:   string;
  siteId: string;
}

interface Site {
  id:      string;
  name:    string;
  address: string | null;
  zones:   Zone[];
  _count:  { zones: number };
}

// ─── Site form ─────────────────────────────────────────────────────────────────

interface SiteFormValues {
  name:    string;
  address: string;
}

interface SiteFormProps {
  onSubmit:      (d: SiteFormValues) => Promise<unknown>;
  loading?:      boolean;
  defaultValues?: Partial<SiteFormValues>;
  onCancel:      () => void;
}

function SiteForm({ onSubmit, loading, defaultValues, onCancel }: SiteFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<SiteFormValues>({
    defaultValues: { name: '', address: '', ...defaultValues },
  });
  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <Input
        label="Nom du site"
        placeholder="Cuisine centrale, Boulangerie Nord…"
        required
        error={errors.name?.message}
        {...register('name', { required: 'Nom obligatoire' })}
      />
      <Input
        label="Adresse"
        placeholder="12 rue du Commerce, 75001 Paris"
        {...register('address')}
      />
      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={loading}>Enregistrer</Button>
      </div>
    </form>
  );
}

// ─── Zone form ─────────────────────────────────────────────────────────────────

interface ZoneFormProps {
  onSubmit:      (d: { name: string }) => Promise<unknown>;
  loading?:      boolean;
  defaultValues?: { name: string };
  onCancel:      () => void;
}

function ZoneForm({ onSubmit, loading, defaultValues, onCancel }: ZoneFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ name: string }>({
    defaultValues: { name: '', ...defaultValues },
  });
  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <Input
        label="Nom de la zone"
        placeholder="Chambre froide, Zone cuisson, Réception…"
        required
        error={errors.name?.message}
        {...register('name', { required: 'Nom obligatoire' })}
      />
      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={loading}>Enregistrer</Button>
      </div>
    </form>
  );
}

// ─── Modal state ───────────────────────────────────────────────────────────────

type ModalState =
  | { kind: 'none' }
  | { kind: 'createSite' }
  | { kind: 'editSite';   site: Site }
  | { kind: 'createZone'; site: Site }
  | { kind: 'editZone';   site: Site; zone: Zone };

// ─── Inline error ──────────────────────────────────────────────────────────────

function apiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { data?: { message?: string } } }).response;
    if (r?.data?.message) return String(r.data.message);
  }
  return 'Une erreur est survenue.';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ZonesPage() {
  const [modal, setModal]       = useState<ModalState>({ kind: 'none' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [apiError, setApiError] = useState<string | null>(null);
  const queryClient             = useQueryClient();
  const tenantId                = useTenantId();

  const { data, isLoading } = useQuery({
    queryKey: ['sites', tenantId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Site[]>>('/api/v1/sites');
      return data;
    },
  });

  const sites = data?.data ?? [];

  const closeModal = () => { setModal({ kind: 'none' }); setApiError(null); };
  const refresh    = () => { void queryClient.invalidateQueries({ queryKey: ['sites', tenantId] }); };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Site mutations ──────────────────────────────────────────────────────────

  const createSiteMutation = useMutation({
    mutationFn: (body: SiteFormValues) => api.post('/api/v1/sites', body),
    onSuccess:  () => { refresh(); closeModal(); },
    onError:    (e) => setApiError(apiErrorMessage(e)),
  });

  const updateSiteMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: SiteFormValues }) =>
      api.patch(`/api/v1/sites/${id}`, body),
    onSuccess:  () => { refresh(); closeModal(); },
    onError:    (e) => setApiError(apiErrorMessage(e)),
  });

  const deleteSiteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/sites/${id}`),
    onSuccess:  () => { refresh(); showToast({ title: 'Site supprimé', variant: 'success' }); },
    onError:    (e) => showToast({ title: apiErrorMessage(e), variant: 'error' }),
  });

  // ── Zone mutations ──────────────────────────────────────────────────────────

  const createZoneMutation = useMutation({
    mutationFn: ({ siteId, name }: { siteId: string; name: string }) =>
      api.post(`/api/v1/sites/${siteId}/zones`, { name }),
    onSuccess:  () => { refresh(); closeModal(); },
    onError:    (e) => setApiError(apiErrorMessage(e)),
  });

  const updateZoneMutation = useMutation({
    mutationFn: ({ siteId, zoneId, name }: { siteId: string; zoneId: string; name: string }) =>
      api.patch(`/api/v1/sites/${siteId}/zones/${zoneId}`, { name }),
    onSuccess:  () => { refresh(); closeModal(); },
    onError:    (e) => setApiError(apiErrorMessage(e)),
  });

  const deleteZoneMutation = useMutation({
    mutationFn: ({ siteId, zoneId }: { siteId: string; zoneId: string }) =>
      api.delete(`/api/v1/sites/${siteId}/zones/${zoneId}`),
    onSuccess:  () => { refresh(); showToast({ title: 'Zone supprimée', variant: 'success' }); },
    onError:    (e) => showToast({ title: apiErrorMessage(e), variant: 'error' }),
  });

  // ── Modal title ─────────────────────────────────────────────────────────────

  const modalTitle =
    modal.kind === 'createSite' ? 'Nouveau site'
    : modal.kind === 'editSite'   ? `Modifier — ${modal.site.name}`
    : modal.kind === 'createZone' ? `Nouvelle zone — ${modal.site.name}`
    : modal.kind === 'editZone'   ? `Modifier la zone — ${modal.zone.name}`
    : '';

  return (
    <>
      <Header
        title="Sites & Zones"
        subtitle="Gérez vos établissements et leurs zones HACCP"
      />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {sites.length} site(s) — {sites.reduce((n, s) => n + s.zones.length, 0)} zone(s)
          </p>
          <Button size="sm" onClick={() => setModal({ kind: 'createSite' })}>
            <Building2 className="h-4 w-4" /> Nouveau site
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
        ) : sites.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Aucun site"
            description="Créez vos sites de production puis ajoutez les zones HACCP à contrôler (réception, chambre froide, zone cuisson…)."
            actionLabel="Créer un site"
            onAction={() => setModal({ kind: 'createSite' })}
          />
        ) : (
          <div className="space-y-3">
            {sites.map((site) => {
              const isOpen = expanded.has(site.id);
              return (
                <div
                  key={site.id}
                  className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm"
                >
                  {/* Site header row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => toggleExpand(site.id)}
                      className="flex flex-1 items-center gap-3 text-left"
                      aria-expanded={isOpen}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-lighter">
                        <Building2 className="h-4 w-4 text-brand-dark" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900">{site.name}</p>
                        {site.address && (
                          <p className="truncate text-xs text-gray-500">{site.address}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full border border-surface-muted bg-surface-page px-2 py-0.5 text-xs text-gray-500">
                        {site.zones.length} zone(s)
                      </span>
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                        : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                      }
                    </button>

                    {/* Site actions */}
                    <div className="flex shrink-0 items-center gap-1 border-l border-surface-muted pl-3">
                      <button
                        title="Modifier le site"
                        onClick={() => setModal({ kind: 'editSite', site })}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-brand-lighter hover:text-brand-dark transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        title="Ajouter une zone"
                        onClick={() => { setExpanded((p) => new Set(p).add(site.id)); setModal({ kind: 'createZone', site }); }}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-brand-lighter hover:text-brand-dark transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        title="Supprimer le site"
                        disabled={deleteSiteMutation.isPending}
                        onClick={() => {
                          if (!window.confirm(`Supprimer le site « ${site.name} » et toutes ses zones ? Cette action est irréversible.`)) return;
                          deleteSiteMutation.mutate(site.id);
                        }}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Zone list */}
                  {isOpen && (
                    <div className="border-t border-surface-muted divide-y divide-surface-muted bg-surface-page">
                      {site.zones.length === 0 ? (
                        <div className="px-6 py-4 text-sm text-gray-400 italic">
                          Aucune zone — cliquez sur <strong>+</strong> pour en ajouter une.
                        </div>
                      ) : (
                        site.zones.map((zone) => (
                          <div key={zone.id} className="flex items-center gap-3 px-6 py-2.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-medium" />
                            <span className="flex-1 text-sm text-gray-700">{zone.name}</span>
                            <button
                              title="Modifier la zone"
                              onClick={() => setModal({ kind: 'editZone', site, zone })}
                              className="rounded p-1 text-gray-400 hover:text-brand-dark transition-colors"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              title="Supprimer la zone"
                              disabled={deleteZoneMutation.isPending}
                              onClick={() => {
                                if (!window.confirm(`Supprimer la zone « ${zone.name} » ?`)) return;
                                deleteZoneMutation.mutate({ siteId: site.id, zoneId: zone.id });
                              }}
                              className="rounded p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                      {/* Inline add-zone shortcut */}
                      <div className="px-6 py-2">
                        <button
                          onClick={() => setModal({ kind: 'createZone', site })}
                          className="flex items-center gap-1.5 text-xs text-brand-medium hover:underline"
                        >
                          <Plus className="h-3.5 w-3.5" /> Ajouter une zone
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal */}
        <Modal
          open={modal.kind !== 'none'}
          onClose={closeModal}
          title={modalTitle}
          size="sm"
        >
          {apiError && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{apiError}</p>
          )}

          {modal.kind === 'createSite' && (
            <SiteForm
              loading={createSiteMutation.isPending}
              onCancel={closeModal}
              onSubmit={(v) => createSiteMutation.mutateAsync(v)}
            />
          )}

          {modal.kind === 'editSite' && (
            <SiteForm
              loading={updateSiteMutation.isPending}
              defaultValues={{ name: modal.site.name, address: modal.site.address ?? '' }}
              onCancel={closeModal}
              onSubmit={(v) => updateSiteMutation.mutateAsync({ id: modal.site.id, body: v })}
            />
          )}

          {modal.kind === 'createZone' && (
            <ZoneForm
              loading={createZoneMutation.isPending}
              onCancel={closeModal}
              onSubmit={(v) => createZoneMutation.mutateAsync({ siteId: modal.site.id, name: v.name })}
            />
          )}

          {modal.kind === 'editZone' && (
            <ZoneForm
              loading={updateZoneMutation.isPending}
              defaultValues={{ name: modal.zone.name }}
              onCancel={closeModal}
              onSubmit={(v) =>
                updateZoneMutation.mutateAsync({
                  siteId: modal.site.id,
                  zoneId: modal.zone.id,
                  name:   v.name,
                })
              }
            />
          )}
        </Modal>
      </PageWrapper>
    </>
  );
}
