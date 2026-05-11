import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, Eye, EyeOff, Filter, Key, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { RoleBadge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse, User, UserRole, UserStatus } from '@haccp/shared-types';

// ─── Shared constants ─────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'ADMIN',           label: 'Admin' },
  { value: 'MANAGER',         label: 'Manager' },
  { value: 'QUALITY_OFFICER', label: 'Responsable qualité' },
  { value: 'OPERATOR',        label: 'Opérateur' },
  { value: 'VIEWER',          label: 'Lecteur' },
];

const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'ACTIVE',   label: 'Actif' },
  { value: 'INVITED',  label: 'Invité' },
  { value: 'INACTIVE', label: 'Inactif' },
];

const ROLE_FILTER_OPTIONS = [
  { value: '',               label: 'Tous les rôles' },
  { value: 'ADMIN',          label: 'Admin' },
  { value: 'MANAGER',        label: 'Manager' },
  { value: 'QUALITY_OFFICER',label: 'Responsable qualité' },
  { value: 'OPERATOR',       label: 'Opérateur' },
  { value: 'VIEWER',         label: 'Lecteur' },
];

const STATUS_FILTER_OPTIONS = [
  { value: '',         label: 'Tous les statuts' },
  { value: 'ACTIVE',   label: 'Actif' },
  { value: 'INVITED',  label: 'Invité' },
  { value: 'INACTIVE', label: 'Inactif' },
];

// ─── API error helper ─────────────────────────────────────────────────────────

function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (msg) return Array.isArray(msg) ? (msg as string[]).join(', ') : String(msg);
    if (err.response?.status === 409) return 'Cette adresse e-mail est déjà utilisée.';
    if (err.response?.status === 400) return 'Données invalides. Vérifiez le formulaire.';
  }
  return 'Une erreur est survenue. Réessayez.';
}

// ─── useUsers hook ────────────────────────────────────────────────────────────

function useUsers(page: number, search: string, role: string, status: string) {
  return useQuery({
    queryKey: ['users', page, search, role, status],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (role)   params.set('role', role);
      if (status) params.set('status', status);
      const { data } = await api.get<ApiResponse<User[]>>(`/api/v1/users?${params}`);
      return data;
    },
  });
}

// ─── PasswordField ────────────────────────────────────────────────────────────

interface PasswordFieldProps {
  label:        string;
  required?:    boolean;
  error?:       string;
  registration: UseFormRegisterReturn;
}

function PasswordField({ label, required, error, registration }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        label={label}
        type={show ? 'text' : 'password'}
        required={required}
        error={error}
        className="pr-10"
        {...registration}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-8 text-gray-400 hover:text-gray-600"
        tabIndex={-1}
        aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ─── InviteUserModal ──────────────────────────────────────────────────────────

interface InviteFormValues {
  email: string;
  name:  string;
  role:  UserRole;
}

interface InviteUserModalProps {
  onClose:   () => void;
  onSuccess: () => void;
}

function InviteUserModal({ onClose, onSuccess }: InviteUserModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<InviteFormValues>({
    defaultValues: { role: 'VIEWER' },
  });

  const mutation = useMutation({
    mutationFn: (body: InviteFormValues) => api.post('/api/v1/users', body),
    onSuccess:  () => { onSuccess(); onClose(); },
    onError:    (e) => setApiError(apiErrorMessage(e)),
  });

  return (
    <form
      onSubmit={(e) => { setApiError(null); void handleSubmit((v) => mutation.mutateAsync(v))(e); }}
      className="space-y-4"
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

      {apiError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{apiError}</p>}

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={mutation.isPending}>
          <UserPlus className="h-4 w-4" /> Envoyer l'invitation
        </Button>
      </div>
    </form>
  );
}

// ─── CreateUserModal ──────────────────────────────────────────────────────────

interface CreateFormValues {
  name:            string;
  email:           string;
  password:        string;
  confirmPassword: string;
  role:            UserRole;
}

interface CreateUserModalProps {
  onClose:   () => void;
  onSuccess: () => void;
}

function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<CreateFormValues>({
    defaultValues: { role: 'VIEWER' },
  });

  const mutation = useMutation({
    mutationFn: ({ name, email, password, role }: CreateFormValues) =>
      api.post('/api/v1/users', { name, email, password, role }),
    onSuccess:  () => { onSuccess(); onClose(); },
    onError:    (e) => setApiError(apiErrorMessage(e)),
  });

  return (
    <form
      onSubmit={(e) => { setApiError(null); void handleSubmit((v) => mutation.mutateAsync(v))(e); }}
      className="space-y-4"
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
      <PasswordField
        label="Mot de passe"
        required
        error={errors.password?.message}
        registration={register('password', {
          required: 'Mot de passe obligatoire',
          minLength: { value: 8, message: 'Minimum 8 caractères' },
        })}
      />
      <PasswordField
        label="Confirmer le mot de passe"
        required
        error={errors.confirmPassword?.message}
        registration={register('confirmPassword', {
          required: 'Confirmation obligatoire',
          validate: (v) => v === watch('password') || 'Les mots de passe ne correspondent pas',
        })}
      />
      <Select
        label="Rôle"
        options={ROLE_OPTIONS}
        error={errors.role?.message}
        {...register('role', { required: 'Rôle obligatoire' })}
      />

      {apiError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{apiError}</p>}

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={mutation.isPending}>
          <Plus className="h-4 w-4" /> Créer l'utilisateur
        </Button>
      </div>
    </form>
  );
}

// ─── EditUserModal ─────────────────────────────────────────────────────────────

interface EditFormValues {
  name:   string;
  role:   UserRole;
  status: UserStatus;
}

interface EditUserModalProps {
  user:      User;
  onClose:   () => void;
  onSuccess: () => void;
}

function EditUserModal({ user, onClose, onSuccess }: EditUserModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<EditFormValues>({
    defaultValues: { name: user.name, role: user.role, status: user.status },
  });

  const mutation = useMutation({
    mutationFn: (body: EditFormValues) => api.patch(`/api/v1/users/${user.id}`, body),
    onSuccess:  () => { onSuccess(); onClose(); },
    onError:    (e) => setApiError(apiErrorMessage(e)),
  });

  return (
    <form
      onSubmit={(e) => { setApiError(null); void handleSubmit((v) => mutation.mutateAsync(v))(e); }}
      className="space-y-4"
    >
      <Input
        label="Nom complet"
        required
        error={errors.name?.message}
        {...register('name', { required: 'Nom obligatoire' })}
      />
      <Select
        label="Rôle"
        options={ROLE_OPTIONS}
        error={errors.role?.message}
        {...register('role', { required: 'Rôle obligatoire' })}
      />
      <Select
        label="Statut"
        options={STATUS_OPTIONS}
        error={errors.status?.message}
        {...register('status', { required: 'Statut obligatoire' })}
      />

      {apiError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{apiError}</p>}

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={mutation.isPending}>
          <Edit2 className="h-4 w-4" /> Enregistrer
        </Button>
      </div>
    </form>
  );
}

// ─── ChangePasswordModal ──────────────────────────────────────────────────────

interface ChangePasswordFormValues {
  password:        string;
  confirmPassword: string;
}

interface ChangePasswordModalProps {
  userId:    string;
  userName:  string;
  onClose:   () => void;
  onSuccess: () => void;
}

function ChangePasswordModal({ userId, userName, onClose, onSuccess }: ChangePasswordModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ChangePasswordFormValues>();

  const mutation = useMutation({
    mutationFn: ({ password }: ChangePasswordFormValues) =>
      api.patch(`/api/v1/users/${userId}/password`, { password }),
    onSuccess:  () => { onSuccess(); onClose(); },
    onError:    (e) => setApiError(apiErrorMessage(e)),
  });

  return (
    <form
      onSubmit={(e) => { setApiError(null); void handleSubmit((v) => mutation.mutateAsync(v))(e); }}
      className="space-y-4"
    >
      <p className="text-sm text-gray-600">
        Modifier le mot de passe de <span className="font-semibold">{userName}</span>.
      </p>
      <PasswordField
        label="Nouveau mot de passe"
        required
        error={errors.password?.message}
        registration={register('password', {
          required: 'Mot de passe obligatoire',
          minLength: { value: 8, message: 'Minimum 8 caractères' },
        })}
      />
      <PasswordField
        label="Confirmer le mot de passe"
        required
        error={errors.confirmPassword?.message}
        registration={register('confirmPassword', {
          required: 'Confirmation obligatoire',
          validate: (v) => v === watch('password') || 'Les mots de passe ne correspondent pas',
        })}
      />

      {apiError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{apiError}</p>}

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={mutation.isPending}>
          <Key className="h-4 w-4" /> Changer le mot de passe
        </Button>
      </div>
    </form>
  );
}

// ─── Modal state types ────────────────────────────────────────────────────────

type ModalState =
  | { kind: 'none' }
  | { kind: 'invite' }
  | { kind: 'create' }
  | { kind: 'edit';           user: User }
  | { kind: 'changePassword'; user: User };

// ─── UsersPage ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [roleFilter, setRole] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [modal, setModal]     = useState<ModalState>({ kind: 'none' });
  const queryClient           = useQueryClient();
  const currentUser           = useAuthStore((s) => s.user);

  const { data, isLoading, isError } = useUsers(page, search, roleFilter, statusFilter);

  const closeModal = () => setModal({ kind: 'none' });
  const refresh    = () => { void queryClient.invalidateQueries({ queryKey: ['users'] }); };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/users/${id}`),
    onSuccess:  refresh,
  });

  const handleDelete = (user: User) => {
    if (!window.confirm(`Supprimer l'utilisateur « ${user.name} » ? Cette action est irréversible.`)) return;
    void deleteMutation.mutateAsync(user.id);
  };

  return (
    <>
      <Header title="Utilisateurs" subtitle="Gérez les membres de votre équipe" />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par nom ou email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-9 w-full sm:w-64 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-gray-400" />
            <select
              value={roleFilter}
              onChange={(e) => { setRole(e.target.value); setPage(1); }}
              className="h-9 rounded-lg border border-surface-muted bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
            >
              {ROLE_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="h-9 rounded-lg border border-surface-muted bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
            >
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setModal({ kind: 'invite' })}>
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Inviter</span>
            </Button>
            <Button size="sm" onClick={() => setModal({ kind: 'create' })}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Créer</span>
            </Button>
          </div>
        </div>

        {/* Table — desktop / Card — mobile */}
        <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
          {isLoading && (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">Chargement…</div>
          )}
          {isError && (
            <div className="flex h-40 items-center justify-center text-sm text-red-500">
              Erreur lors du chargement des utilisateurs.
            </div>
          )}
          {!isLoading && !isError && (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <th className="px-4 py-3">Utilisateur</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Rôle</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3">Créé le</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-muted">
                    {(data?.data ?? []).map((user) => {
                      const isSelf = currentUser?.sub === user.id;
                      return (
                        <tr key={user.id} className="hover:bg-surface-page transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-medium text-xs font-semibold text-white">
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
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button title="Modifier" onClick={() => setModal({ kind: 'edit', user })}
                                className="rounded-md p-1.5 text-gray-400 hover:bg-brand-lighter hover:text-brand-dark transition-colors">
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button title="Mot de passe" onClick={() => setModal({ kind: 'changePassword', user })}
                                className="rounded-md p-1.5 text-gray-400 hover:bg-brand-lighter hover:text-brand-dark transition-colors">
                                <Key className="h-4 w-4" />
                              </button>
                              {!isSelf && (
                                <button title="Supprimer" onClick={() => handleDelete(user)}
                                  disabled={deleteMutation.isPending}
                                  className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {(data?.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-sm text-gray-400">Aucun utilisateur trouvé.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-surface-muted">
                {(data?.data ?? []).map((user) => {
                  const isSelf = currentUser?.sub === user.id;
                  return (
                    <div key={user.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-medium text-sm font-semibold text-white">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{user.name}</p>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setModal({ kind: 'edit', user })}
                            className="rounded p-1.5 text-gray-400 hover:text-brand-dark">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => setModal({ kind: 'changePassword', user })}
                            className="rounded p-1.5 text-gray-400 hover:text-brand-dark">
                            <Key className="h-4 w-4" />
                          </button>
                          {!isSelf && (
                            <button onClick={() => handleDelete(user)} disabled={deleteMutation.isPending}
                              className="rounded p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <RoleBadge role={user.role} />
                        <StatusBadge status={user.status} />
                      </div>
                    </div>
                  );
                })}
                {(data?.data ?? []).length === 0 && (
                  <p className="py-10 text-center text-sm text-gray-400">Aucun utilisateur trouvé.</p>
                )}
              </div>
            </>
          )}

          {/* Pagination */}
          {data?.meta && data.meta.lastPage > 1 && (
            <div className="flex items-center justify-between border-t border-surface-muted px-4 py-3 text-sm text-gray-500">
              <span className="hidden sm:inline">
                Page {data.meta.page} sur {data.meta.lastPage} — {data.meta.total} utilisateur(s)
              </span>
              <div className="flex gap-2 ml-auto">
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
      </PageWrapper>

      {/* ── Invite modal ─────────────────────────────────────────────────────── */}
      <Modal open={modal.kind === 'invite'} onClose={closeModal}
        title="Inviter un utilisateur"
        description="Un email d'invitation sera envoyé à l'adresse indiquée."
        size="sm">
        <InviteUserModal onClose={closeModal} onSuccess={refresh} />
      </Modal>

      {/* ── Create modal ─────────────────────────────────────────────────────── */}
      <Modal open={modal.kind === 'create'} onClose={closeModal}
        title="Créer un utilisateur"
        description="Le compte sera actif immédiatement sans email d'invitation."
        size="sm">
        <CreateUserModal onClose={closeModal} onSuccess={refresh} />
      </Modal>

      {/* ── Edit modal ───────────────────────────────────────────────────────── */}
      {modal.kind === 'edit' && (
        <Modal open onClose={closeModal} title="Modifier l'utilisateur" size="sm">
          <EditUserModal user={modal.user} onClose={closeModal} onSuccess={refresh} />
        </Modal>
      )}

      {/* ── Change password modal ────────────────────────────────────────────── */}
      {modal.kind === 'changePassword' && (
        <Modal open onClose={closeModal} title="Changer le mot de passe" size="sm">
          <ChangePasswordModal userId={modal.user.id} userName={modal.user.name} onClose={closeModal} onSuccess={refresh} />
        </Modal>
      )}
    </>
  );
}
