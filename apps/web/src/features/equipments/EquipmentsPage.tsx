import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cog, Download, Filter, Plus, Search, Thermometer, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { exportCSV, importFile } from '@/lib/csv';
import { useDebounce } from '@/hooks/useDebounce';
import { useTenantId } from '@/hooks/useTenantId';
import type { ApiResponse, Equipment } from '@haccp/shared-types';

// ─── Temperature badge ────────────────────────────────────────────────────────

function TempRange({ min, max }: { min?: number | null; max?: number | null }) {
  if (min == null && max == null)
    return <span className="text-gray-400 text-xs">Non défini</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
      <Thermometer className="h-3 w-3" />
      {min ?? '?'}°C → {max ?? '?'}°C
    </span>
  );
}

// ─── Equipment form ───────────────────────────────────────────────────────────

interface EquipmentFormValues {
  code: string;
  name: string;
  type: string;
  serialNumber: string;
  brand: string;
  tempMin: string;
  tempMax: string;
}

interface EquipmentFormProps {
  onSubmit: (d: EquipmentFormValues) => Promise<unknown>;
  loading?: boolean;
  defaultValues?: Partial<EquipmentFormValues>;
}

function EquipmentForm({ onSubmit, loading, defaultValues }: EquipmentFormProps) {
  const { register, handleSubmit } = useForm<EquipmentFormValues>({
    defaultValues: {
      code: '',
      name: '',
      type: '',
      serialNumber: '',
      brand: '',
      tempMin: '',
      tempMax: '',
      ...defaultValues,
    },
  });

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
        <Button type="submit" loading={loading}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function EquipmentDetail({ equipment }: { equipment: Equipment }) {
  const rows: { label: string; value: string | number | null | undefined }[] = [
    { label: 'Code', value: equipment.code },
    { label: 'Nom', value: equipment.name },
    { label: 'Type', value: equipment.type },
    { label: 'Marque', value: equipment.brand },
    { label: 'N° de série', value: equipment.serialNumber },
    { label: 'Temp. min', value: equipment.tempMin != null ? `${equipment.tempMin}°C` : null },
    { label: 'Temp. max', value: equipment.tempMax != null ? `${equipment.tempMax}°C` : null },
    { label: 'Actif', value: equipment.isActive ? 'Oui' : 'Non' },
  ];
  return (
    <dl className="divide-y divide-surface-muted text-sm">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between py-2.5">
          <dt className="text-gray-500">{label}</dt>
          <dd className="font-medium text-gray-900">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── CSV columns ──────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  { key: 'code', header: 'Code' },
  { key: 'name', header: 'Nom' },
  { key: 'type', header: 'Type' },
  { key: 'brand', header: 'Marque' },
  { key: 'serialNumber', header: 'N°Série' },
  { key: 'tempMin', header: 'Temp.Min' },
  { key: 'tempMax', header: 'Temp.Max' },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

type ModalMode = 'create' | 'edit' | 'detail';

export default function EquipmentsPage() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [typeFilter, setType]   = useState('');
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const queryClient     = useQueryClient();
  const debouncedSearch = useDebounce(search, 400);
  const tenantId        = useTenantId();

  const { data, isLoading } = useQuery({
    queryKey: ['equipments', tenantId, page, debouncedSearch, typeFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) p.set('search', debouncedSearch);
      if (typeFilter)      p.set('type', typeFilter);
      const { data } = await api.get<ApiResponse<Equipment[]>>(`/api/v1/equipments?${p}`);
      return data;
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/equipments', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['equipments', tenantId] });
      setModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/equipments/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['equipments', tenantId] });
      setModalOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/equipments/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['equipments', tenantId] }),
    onError: () => showToast({ title: 'Erreur lors de la suppression', variant: 'error' }),
  });

  // Helpers
  const openCreate = () => {
    setSelected(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const openDetail = (eq: Equipment) => {
    setSelected(eq);
    setModalMode('detail');
    setModalOpen(true);
  };

  const openEdit = (eq: Equipment) => {
    setSelected(eq);
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleDelete = (eq: Equipment) => {
    if (!window.confirm(`Supprimer l'équipement « ${eq.name} » ? Cette action est irréversible.`))
      return;
    deleteMutation.mutate(eq.id);
  };

  const buildBody = (v: EquipmentFormValues): Record<string, unknown> => ({
    ...v,
    tempMin: v.tempMin ? Number(v.tempMin) : undefined,
    tempMax: v.tempMax ? Number(v.tempMax) : undefined,
  });

  // CSV export
  const handleExport = () => {
    const rows = (data?.data ?? []) as Record<string, unknown>[];
    exportCSV(rows, CSV_COLUMNS, 'equipements');
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
        const tempMinRaw = row['temp.min'] ?? row['temp_min'] ?? row['temperature min'] ?? '';
        const tempMaxRaw = row['temp.max'] ?? row['temp_max'] ?? row['temperature max'] ?? '';
        try {
          await api.post('/api/v1/equipments', {
            code,
            name,
            type:         row['type']          || undefined,
            brand:        row['marque']         || row['brand']        || undefined,
            serialNumber: row['n° serie']       || row['serie']        || row['serial'] || undefined,
            tempMin:      tempMinRaw ? Number(tempMinRaw) : undefined,
            tempMax:      tempMaxRaw ? Number(tempMaxRaw) : undefined,
          } satisfies Record<string, unknown>);
          ok++;
        } catch {
          fail++;
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['equipments', tenantId] });
      showToast({
        title: `Import terminé : ${ok} ligne(s) importée(s)${fail ? `, ${fail} ignorée(s)` : ''}`,
        variant: fail && ok === 0 ? 'error' : fail ? 'warning' : 'success',
      });
    } catch {
      showToast({ title: 'Erreur lors de la lecture du fichier.', variant: 'error' });
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  // Modal title
  const modalTitle =
    modalMode === 'create'
      ? 'Nouvel équipement'
      : modalMode === 'edit'
        ? `Modifier — ${selected?.name ?? ''}`
        : selected?.name ?? '';

  return (
    <>
      <Header title="Équipements" subtitle="Parc matériel et plages de température critiques" />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Rechercher un équipement…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-9 w-full sm:w-60 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>
            <Filter className="h-4 w-4 shrink-0 text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => { setType(e.target.value); setPage(1); }}
              className="h-9 rounded-lg border border-surface-muted bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
            >
              <option value="">Tous les types</option>
              <option value="Réfrigérateur">Réfrigérateur</option>
              <option value="Congélateur">Congélateur</option>
              <option value="Four">Four</option>
              <option value="Friteuse">Friteuse</option>
              <option value="Lave-vaisselle">Lave-vaisselle</option>
              <option value="Sonde">Sonde</option>
              <option value="Autre">Autre</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={(data?.data ?? []).length === 0}>
              <Download className="h-4 w-4" /> Exporter
            </Button>
            <Button variant="secondary" size="sm" loading={importing} onClick={() => importRef.current?.click()}>
              <Upload className="h-4 w-4" /> Importer
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              className="hidden"
              onChange={(e) => void handleImportFile(e)}
            />
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nouvel équipement
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
        ) : (data?.data ?? []).length === 0 ? (
          <EmptyState
            icon={Cog}
            title="Aucun équipement"
            description="Ajoutez vos équipements pour planifier les relevés de température et les contrôles de maintenance."
            actionLabel="Ajouter un équipement"
            onAction={openCreate}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(data?.data ?? []).map((eq) => (
              <div
                key={eq.id}
                className="rounded-xl border border-surface-muted bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-lighter">
                      <Cog className="h-5 w-5 text-brand-dark" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{eq.name}</p>
                      <code className="font-mono text-xs text-gray-500">{eq.code}</code>
                    </div>
                  </div>
                  {eq.type && (
                    <span className="rounded-full border border-surface-muted bg-surface-page px-2 py-0.5 text-xs text-gray-600">
                      {eq.type}
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-1.5">
                  {eq.brand && (
                    <p className="text-xs text-gray-500">
                      Marque : <strong className="text-gray-700">{eq.brand}</strong>
                    </p>
                  )}
                  {eq.serialNumber && (
                    <p className="text-xs text-gray-500">
                      S/N :{' '}
                      <strong className="font-mono text-gray-700">{eq.serialNumber}</strong>
                    </p>
                  )}
                  <TempRange min={eq.tempMin} max={eq.tempMax} />
                </div>

                <div className="mt-4 flex gap-2 border-t border-surface-muted pt-3">
                  <button
                    className="text-xs text-gray-500 hover:underline"
                    onClick={() => openDetail(eq)}
                  >
                    Voir
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    className="text-xs text-brand-medium hover:underline"
                    onClick={() => openEdit(eq)}
                  >
                    Modifier
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => handleDelete(eq)}
                    disabled={deleteMutation.isPending}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {data?.meta && data.meta.lastPage > 1 && (
          <div className="mt-4 flex justify-end gap-2">
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
        )}

        {/* Modal */}
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={modalTitle}
          size="md"
        >
          {modalMode === 'detail' && selected ? (
            <EquipmentDetail equipment={selected} />
          ) : modalMode === 'edit' && selected ? (
            <EquipmentForm
              loading={updateMutation.isPending}
              defaultValues={{
                code: selected.code,
                name: selected.name,
                type: selected.type ?? '',
                brand: selected.brand ?? '',
                serialNumber: selected.serialNumber ?? '',
                tempMin: selected.tempMin != null ? String(selected.tempMin) : '',
                tempMax: selected.tempMax != null ? String(selected.tempMax) : '',
              }}
              onSubmit={(v) =>
                updateMutation.mutateAsync({ id: selected.id, body: buildBody(v) })
              }
            />
          ) : (
            <EquipmentForm
              loading={createMutation.isPending}
              onSubmit={(v) => createMutation.mutateAsync(buildBody(v))}
            />
          )}
        </Modal>
      </PageWrapper>
    </>
  );
}
