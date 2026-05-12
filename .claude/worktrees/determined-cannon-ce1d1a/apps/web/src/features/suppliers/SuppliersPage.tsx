import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Download, Mail, Phone, Plus, Search, Truck, Upload } from 'lucide-react';
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
import { exportCSV, importCSV } from '@/lib/csv';
import { useDebounce } from '@/hooks/useDebounce';
import type { ApiResponse, Supplier } from '@haccp/shared-types';

// ─── Supplier form ────────────────────────────────────────────────────────────

interface SupplierFormValues {
  code: string;
  name: string;
  vat: string;
  phone: string;
  email: string;
  address: string;
}

interface SupplierFormProps {
  onSubmit: (data: SupplierFormValues) => Promise<unknown>;
  loading?: boolean;
  defaultValues?: Partial<SupplierFormValues>;
}

function SupplierForm({ onSubmit, loading, defaultValues }: SupplierFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    defaultValues: {
      code: '',
      name: '',
      vat: '',
      phone: '',
      email: '',
      address: '',
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Code fournisseur"
          placeholder="FOUR-01"
          required
          error={errors.code?.message}
          {...register('code', { required: 'Code obligatoire' })}
        />
        <Input
          label="Raison sociale"
          placeholder="Boucherie Martin"
          required
          error={errors.name?.message}
          {...register('name', { required: 'Nom obligatoire' })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="N° TVA" placeholder="FR12345678901" {...register('vat')} />
        <Input label="Téléphone" placeholder="+33 1 23 45 67 89" {...register('phone')} />
      </div>

      <Input
        label="Email"
        type="email"
        placeholder="contact@fournisseur.fr"
        {...register('email')}
      />

      <Input
        label="Adresse"
        placeholder="12 rue du Commerce, 75001 Paris"
        {...register('address')}
      />

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="submit" loading={loading}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

// ─── CSV columns ──────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  { key: 'code', header: 'Code' },
  { key: 'name', header: 'Raison sociale' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Téléphone' },
  { key: 'vat', header: 'TVA' },
  { key: 'address', header: 'Adresse' },
] as const;

// ─── Extended supplier type ───────────────────────────────────────────────────

type SupplierWithCount = Supplier & { _count?: { products: number } };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<SupplierWithCount | null>(null);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', page, debouncedSearch],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) p.set('search', debouncedSearch);
      const { data } = await api.get<ApiResponse<SupplierWithCount[]>>(`/api/v1/suppliers?${p}`);
      return data;
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/suppliers', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setCreateOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/suppliers/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setEditSupplier(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/suppliers/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  // Helpers
  const buildBody = (values: SupplierFormValues): Record<string, unknown> => ({
    ...values,
    vat: values.vat || undefined,
    phone: values.phone || undefined,
    email: values.email || undefined,
    address: values.address || undefined,
  });

  const handleDelete = (supplier: SupplierWithCount) => {
    if (!window.confirm(`Supprimer le fournisseur « ${supplier.name} » ? Cette action est irréversible.`))
      return;
    deleteMutation.mutate(supplier.id);
  };

  // CSV export
  const handleExport = () => {
    const rows = (data?.data ?? []).map((s) => ({
      code: s.code,
      name: s.name,
      email: s.email ?? '',
      phone: s.phone ?? '',
      vat: s.vat ?? '',
      address: s.address ?? '',
    })) as Record<string, unknown>[];
    exportCSV(rows, CSV_COLUMNS, 'fournisseurs');
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
          await api.post('/api/v1/suppliers', {
            code: row['code'] ?? row['Code'] ?? '',
            name: row['nom'] ?? row['Raison sociale'] ?? '',
            email:   (row['email']     ?? row['Email'])      || undefined,
            phone:   (row['telephone'] ?? row['Téléphone']) || undefined,
            vat:     (row['tva']       ?? row['TVA'])        || undefined,
            address: (row['adresse']   ?? row['Adresse'])   || undefined,
          } satisfies Record<string, unknown>);
          ok++;
        } catch {
          fail++;
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      showToast({ title: `Import terminé : ${ok} ligne(s)${fail ? `, ${fail} erreur(s)` : ''}`, variant: fail ? 'warning' : 'success' });
    } catch {
      showToast({ title: 'Erreur lors de la lecture du fichier CSV.', variant: 'error' });
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  const rows = data?.data ?? [];

  const editDefaults = editSupplier
    ? {
        code: editSupplier.code,
        name: editSupplier.name,
        vat: editSupplier.vat ?? '',
        phone: editSupplier.phone ?? '',
        email: editSupplier.email ?? '',
        address: editSupplier.address ?? '',
      }
    : undefined;

  return (
    <>
      <Header title="Fournisseurs" subtitle="Référentiel des fournisseurs et partenaires" />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Rechercher un fournisseur…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full sm:w-72 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={rows.length === 0}
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
              <Plus className="h-4 w-4" /> Nouveau fournisseur
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Aucun fournisseur"
            description="Ajoutez vos fournisseurs pour les associer à vos produits et contrôles de réception."
            actionLabel="Ajouter un fournisseur"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-surface-muted">
              {rows.map((supplier) => (
                <div key={supplier.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-lighter">
                      <Building2 className="h-4 w-4 text-brand-dark" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{supplier.name}</p>
                      <code className="text-xs text-gray-500">{supplier.code}</code>
                    </div>
                  </div>
                  {supplier.email && (
                    <a href={`mailto:${supplier.email}`} className="flex items-center gap-1 text-xs text-brand-medium hover:underline">
                      <Mail className="h-3 w-3" /> {supplier.email}
                    </a>
                  )}
                  {supplier.phone && (
                    <a href={`tel:${supplier.phone}`} className="flex items-center gap-1 text-xs text-gray-500 hover:underline">
                      <Phone className="h-3 w-3" /> {supplier.phone}
                    </a>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    {supplier._count?.products != null && (
                      <span className="rounded-full border border-surface-muted bg-surface-page px-2 py-0.5 text-xs text-gray-600">
                        {supplier._count.products} produit(s)
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-3">
                      <button className="text-xs text-brand-medium hover:underline" onClick={() => setEditSupplier(supplier)}>Modifier</button>
                      <button className="text-xs text-red-500 hover:underline" onClick={() => handleDelete(supplier)} disabled={deleteMutation.isPending}>Supprimer</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <table className="hidden sm:table w-full text-sm">
              <thead>
                <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Raison sociale</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">N° TVA</th>
                  <th className="px-4 py-3">Produits</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-muted">
                {rows.map((supplier) => (
                  <tr key={supplier.id} className="transition-colors hover:bg-surface-page">
                    <td className="px-4 py-3">
                      <code className="rounded bg-surface-page px-1.5 py-0.5 font-mono text-xs text-brand-dark">
                        {supplier.code}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-lighter">
                          <Building2 className="h-4 w-4 text-brand-dark" />
                        </div>
                        <span className="font-medium text-gray-900">{supplier.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {supplier.email && (
                          <a
                            href={`mailto:${supplier.email}`}
                            className="flex items-center gap-1 text-xs text-brand-medium hover:underline"
                          >
                            <Mail className="h-3 w-3" /> {supplier.email}
                          </a>
                        )}
                        {supplier.phone && (
                          <a
                            href={`tel:${supplier.phone}`}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:underline"
                          >
                            <Phone className="h-3 w-3" /> {supplier.phone}
                          </a>
                        )}
                        {!supplier.email && !supplier.phone && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {supplier.vat ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {supplier._count?.products != null ? (
                        <span className="rounded-full border border-surface-muted bg-surface-page px-2 py-0.5 text-xs text-gray-600">
                          {supplier._count.products} produit(s)
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          className="text-xs text-brand-medium hover:underline"
                          onClick={() => setEditSupplier(supplier)}
                        >
                          Modifier
                        </button>
                        <span className="text-gray-300">·</span>
                        <button
                          className="text-xs text-red-500 hover:underline"
                          onClick={() => handleDelete(supplier)}
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
                  Page {data.meta.page} sur {data.meta.lastPage} — {data.meta.total} fournisseur(s)
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
        <Modal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Nouveau fournisseur"
          size="md"
        >
          <SupplierForm
            loading={createMutation.isPending}
            onSubmit={(values) => createMutation.mutateAsync(buildBody(values))}
          />
        </Modal>

        {/* Edit modal */}
        <Modal
          open={editSupplier !== null}
          onClose={() => setEditSupplier(null)}
          title={`Modifier — ${editSupplier?.name ?? ''}`}
          size="md"
        >
          {editSupplier && (
            <SupplierForm
              key={editSupplier.id}
              loading={updateMutation.isPending}
              defaultValues={editDefaults}
              onSubmit={(values) =>
                updateMutation.mutateAsync({ id: editSupplier.id, body: buildBody(values) })
              }
            />
          )}
        </Modal>
      </PageWrapper>
    </>
  );
}
