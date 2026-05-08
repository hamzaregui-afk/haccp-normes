import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Mail, Phone, Plus, Search, Truck } from 'lucide-react';
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
  onSubmit: (data: SupplierFormValues) => Promise<void>;
  loading?: boolean;
  defaultValues?: Partial<SupplierFormValues>;
}

function SupplierForm({ onSubmit, loading, defaultValues }: SupplierFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<SupplierFormValues>({
    defaultValues: { code: '', name: '', vat: '', phone: '', email: '', address: '', ...defaultValues },
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
        <Input
          label="N° TVA"
          placeholder="FR12345678901"
          {...register('vat')}
        />
        <Input
          label="Téléphone"
          placeholder="+33 1 23 45 67 89"
          {...register('phone')}
        />
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', page, debouncedSearch],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) p.set('search', debouncedSearch);
      const { data } = await api.get<ApiResponse<Supplier[]>>(`/api/v1/suppliers?${p}`);
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/suppliers', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setModalOpen(false);
    },
  });

  const rows = data?.data ?? [];

  return (
    <>
      <Header title="Fournisseurs" subtitle="Référentiel des fournisseurs et partenaires" />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Rechercher un fournisseur…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-9 w-72 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Nouveau fournisseur
          </Button>
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
            onAction={() => setModalOpen(true)}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
            <table className="w-full text-sm">
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
                  <tr key={supplier.id} className="hover:bg-surface-page transition-colors">
                    <td className="px-4 py-3">
                      <code className="rounded bg-surface-page px-1.5 py-0.5 text-xs font-mono text-brand-dark">
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
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                      {supplier.vat ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {/* _count.products is included in list query from supplier service */}
                      {(supplier as Supplier & { _count?: { products: number } })._count?.products != null ? (
                        <span className="rounded-full bg-surface-page border border-surface-muted px-2 py-0.5 text-xs text-gray-600">
                          {(supplier as Supplier & { _count?: { products: number } })._count!.products} produit(s)
                        </span>
                      ) : '—'}
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
                <span>Page {data.meta.page} sur {data.meta.lastPage} — {data.meta.total} fournisseur(s)</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    Précédent
                  </Button>
                  <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Create modal */}
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau fournisseur" size="md">
          <SupplierForm
            loading={createMutation.isPending}
            onSubmit={(values) =>
              createMutation.mutateAsync({
                ...values,
                vat: values.vat || undefined,
                phone: values.phone || undefined,
                email: values.email || undefined,
                address: values.address || undefined,
              })
            }
          />
        </Modal>
      </PageWrapper>
    </>
  );
}
