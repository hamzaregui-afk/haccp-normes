import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { RoleBadge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import type { ApiResponse, User, UserRole } from '@haccp/shared-types';

// ─── Invite user modal ────────────────────────────────────────────────────────

interface InviteFormValues {
  email:    string;
  name:     string;
  role:     UserRole;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'ADMIN',           label: 'Admin' },
  { value: 'MANAGER',         label: 'Manager' },
  { value: 'QUALITY_OFFICER', label: 'Responsable qualité' },
  { value: 'OPERATOR',        label: 'Opérateur' },
  { value: 'VIEWER',          label: 'Lecteur' },
];

interface InviteUserModalProps {
  onClose: () => void;
  onInvited: () => void;
}

function InviteUserModal({ onClose, onInvited }: InviteUserModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteFormValues>({ defaultValues: { role: 'VIEWER' } });

  const mutation = useMutation({
    mutationFn: (body: InviteFormValues) => api.post('/api/v1/users', body),
    onSuccess: () => { onInvited(); onClose(); },
  });

  return (
    <form
      onSubmit={(e) => void handleSubmit((v) => mutation.mutateAsync(v))(e)}
      className="space-y-4"
      aria-label="Formulaire d'invitation"
    >
      <Input
        label="Nom complet"
        placeholder="Prénom Nom"
        required
        error={errors.name?.message}
        {...register('name', { required: 'Nom obligatoire' })}
      />
      <Input
        label="Adresse e-mail"
        type="email"
        placeholder="prenom.nom@example.com"
        required
        error={errors.email?.message}
        {...register('email', {
          required: 'Email obligatoire',
          pattern: { value: /\S+@\S+\.\S+/, message: 'Email invalide' },
        })}
      />
      <Select
        label="Rôle"
        options={ROLE_OPTIONS}
        error={errors.role?.message}
        {...register('role', { required: 'Rôle obligatoire' })}
      />

      {mutation.isError && (
        <p className="text-sm text-red-600">Erreur lors de l'envoi de l'invitation.</p>
      )}

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          <UserPlus className="h-4 w-4" /> Envoyer l'invitation
        </Button>
      </div>
    </form>
  );
}

// ─── Users query hook ─────────────────────────────────────────────────────────

function useUsers(page: number, search: string) {
  return useQuery({
    queryKey: ['users', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const { data } = await api.get<ApiResponse<User[]>>(`/api/v1/users?${params}`);
      return data;
    },
  });
}

export default function UsersPage() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [query, setQuery]       = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const queryClient             = useQueryClient();

  const { data, isLoading, isError } = useUsers(page, query);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search);
    setPage(1);
  };

  const handleInvited = () => {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  return (
    <>
      <Header title="Utilisateurs" subtitle="Gérez les membres de votre équipe" />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher par nom ou email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-64 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">Rechercher</Button>
          </form>
          <Button size="sm" className="gap-2" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" />
            Inviter un utilisateur
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
          {isLoading && (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              Chargement…
            </div>
          )}
          {isError && (
            <div className="flex h-40 items-center justify-center text-sm text-red-500">
              Erreur lors du chargement des utilisateurs.
            </div>
          )}
          {!isLoading && !isError && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Rôle</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Date création</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-muted">
                {(data?.data ?? []).map((user) => (
                  <tr key={user.id} className="hover:bg-surface-page transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-medium text-xs font-semibold text-white">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                    <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-xs text-brand-medium hover:underline">Modifier</button>
                    </td>
                  </tr>
                ))}
                {(data?.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-gray-400">
                      Aucun utilisateur trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {data?.meta && data.meta.lastPage > 1 && (
            <div className="flex items-center justify-between border-t border-surface-muted px-4 py-3 text-sm text-gray-500">
              <span>
                Page {data.meta.page} sur {data.meta.lastPage} — {data.meta.total} utilisateur(s)
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
      </PageWrapper>

      {/* Invite user modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Inviter un utilisateur"
        size="sm"
      >
        <InviteUserModal
          onClose={() => setInviteOpen(false)}
          onInvited={handleInvited}
        />
      </Modal>
    </>
  );
}
