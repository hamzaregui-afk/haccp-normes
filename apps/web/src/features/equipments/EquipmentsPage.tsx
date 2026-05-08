import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cog, Plus, Search, Thermometer } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import type { ApiResponse, Equipment } from '@haccp/shared-types';

function TempRange({ min, max }: { min?: number | null; max?: number | null }) {
  if (min == null && max == null) return <span className="text-gray-400 text-xs">Non défini</span>;

  const isOk = true; // would compare with last reading in a real scenario
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${isOk ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
      <Thermometer className="h-3 w-3" />
      {min ?? '?'}°C → {max ?? '?'}°C
    </span>
  );
}

interface EquipmentFormValues {
  code: string; name: string; type: string;
  serialNumber: string; brand: string;
  tempMin: string; tempMax: string;
}

function EquipmentForm({ onSubmit, loading }: { onSubmit: (d: EquipmentFormValues) => Promise<void>; loading?: boolean }) {
  const { register, handleSubmit } = useForm<EquipmentFormValues>();
  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Code" placeholder="FRIGO-01" required {...register('code')} />
        <Input label="Nom" placeholder="Chambre froide positive" required {...register('name')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Type" placeholder="Réfrigérateur, Four…" {...register('type')} />
        <Input label="Marque" placeholder="Liebherr, Rational…" {...register('brand')} />
      </div>
      <Input label="N° de série" placeholder="SN-0000000" {...register('serialNumber')} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Temp. min (°C)" type="number" placeholder="-2" {...register('tempMin')} />
        <Input label="Temp. max (°C)" type="number" placeholder="4" {...register('tempMax')} />
      </div>
      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="submit" loading={loading}>Enregistrer</Button>
      </div>
    </form>
  );
}

export default function EquipmentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useQuery({
    queryKey: ['equipments', page, debouncedSearch],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) p.set('search', debouncedSearch);
      const { data } = await api.get<ApiResponse<Equipment[]>>(`/api/v1/equipments?${p}`);
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/equipments', body),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['equipments'] }); setModalOpen(false); },
  });

  return (
    <>
      <Header title="Équipements" subtitle="Parc matériel et plages de température critiques" />
      <PageWrapper>
        <div className="mb-4 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Rechercher un équipement…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-9 w-72 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Nouvel équipement
          </Button>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
        ) : (data?.data ?? []).length === 0 ? (
          <EmptyState
            icon={Cog}
            title="Aucun équipement"
            description="Ajoutez vos équipements pour planifier les relevés de température et les contrôles de maintenance."
            actionLabel="Ajouter un équipement"
            onAction={() => setModalOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(data?.data ?? []).map((eq) => (
              <div key={eq.id} className="rounded-xl border border-surface-muted bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-lighter">
                      <Cog className="h-5 w-5 text-brand-dark" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{eq.name}</p>
                      <code className="text-xs text-gray-500 font-mono">{eq.code}</code>
                    </div>
                  </div>
                  {eq.type && (
                    <span className="rounded-full bg-surface-page px-2 py-0.5 text-xs text-gray-600 border border-surface-muted">
                      {eq.type}
                    </span>
                  )}
                </div>
                <div className="mt-4 space-y-1.5">
                  {eq.brand && <p className="text-xs text-gray-500">Marque : <strong className="text-gray-700">{eq.brand}</strong></p>}
                  {eq.serialNumber && <p className="text-xs text-gray-500">S/N : <strong className="text-gray-700 font-mono">{eq.serialNumber}</strong></p>}
                  <TempRange min={eq.tempMin} max={eq.tempMax} />
                </div>
                <div className="mt-4 flex gap-2 border-t border-surface-muted pt-3">
                  <button className="text-xs text-brand-medium hover:underline">Modifier</button>
                  <span className="text-gray-300">·</span>
                  <button className="text-xs text-red-500 hover:underline">Désactiver</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {data?.meta && data.meta.lastPage > 1 && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
            <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
          </div>
        )}

        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouvel équipement" size="md">
          <EquipmentForm
            loading={createMutation.isPending}
            onSubmit={(v) => createMutation.mutateAsync({
              ...v,
              tempMin: v.tempMin ? Number(v.tempMin) : undefined,
              tempMax: v.tempMax ? Number(v.tempMax) : undefined,
            })}
          />
        </Modal>
      </PageWrapper>
    </>
  );
}
