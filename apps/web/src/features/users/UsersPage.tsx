import { isAxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, Eye, EyeOff, Filter, Key, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { RoleBadge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import { extractApiMessage } from '@/lib/utils';
import { showToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/store/auth.store';
import { useTenantId } from '@/hooks/useTenantId';
import type { ApiResponse, User, UserRole, UserStatus } from '@haccp/shared-types';

// ─── useUsers hook ────────────────────────────────────────────────────────────

function useUsers(page: number, search: string, role: string, status: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['users', tenantId, page, search, role, status],
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

// ─── API error helper ─────────────────────────────────────────────────────────

// Wraps the shared extractApiMessage with domain-specific HTTP status overrides
// for the user-creation flow (409 = duplicate email, 400 = validation).
function makeApiErrorMessage(t: ReturnType<typeof useTranslation>['t']) {
  return (err: unknown): string => {
    if (isAxiosError(err) && !err.response?.data?.message) {
      if (err.response?.status === 409) return t('users.error.duplicate');
      if (err.response?.status === 400) return t('users.error.validation');
    }
    return extractApiMessage(err);
  };
}

// ─── PasswordField ────────────────────────────────────────────────────────────

interface PasswordFieldProps {
  label:        string;
  required?:    boolean;
  error?:       string;
  registration: UseFormRegisterReturn;
}

function PasswordField({ label, required, error, registration }: PasswordFieldProps) {
  const { t } = useTranslation();
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
        aria-label={show ? t('users.form.hidePassword') : t('users.form.showPassword')}
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
  const { t } = useTranslation();
  const apiError_ = makeApiErrorMessage(t);
  const [apiError, setApiError] = useState<string | null>(null);

  const roleOptions = useMemo(() => [
    { value: 'ADMIN',           label: t('users.roles.ADMIN') },
    { value: 'MANAGER',         label: t('users.roles.MANAGER') },
    { value: 'QUALITY_OFFICER', label: t('users.roles.QUALITY_OFFICER') },
    { value: 'OPERATOR',        label: t('users.roles.OPERATOR') },
    { value: 'VIEWER',          label: t('users.roles.VIEWER') },
  ], [t]);

  const { register, handleSubmit, formState: { errors } } = useForm<InviteFormValues>({
    defaultValues: { role: 'VIEWER' },
  });

  const mutation = useMutation({
    mutationFn: (body: InviteFormValues) => api.post('/api/v1/users', body),
    onSuccess:  () => { onSuccess(); onClose(); },
    onError:    (e) => setApiError(apiError_(e)),
  });

  return (
    <form
      onSubmit={(e) => { setApiError(null); void handleSubmit((v) => mutation.mutateAsync(v))(e); }}
      className="space-y-4"
    >
      <Input
        label={t('users.form.fullName')}
        placeholder={t('users.form.fullNamePlaceholder')}
        required
        error={errors.name?.message}
        {...register('name', { required: t('users.form.validation.nameRequired') })}
      />
      <Input
        label={t('users.form.email')}
        type="email"
        placeholder={t('users.form.emailPlaceholder')}
        required
        error={errors.email?.message}
        {...register('email', {
          required: t('users.form.validation.emailRequired'),
          pattern: { value: /\S+@\S+\.\S+/, message: t('users.form.validation.emailInvalid') },
        })}
      />
      <Select
        label={t('users.form.role')}
        options={roleOptions}
        error={errors.role?.message}
        {...register('role', { required: t('users.form.validation.roleRequired') })}
      />

      {apiError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{apiError}</p>}

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" loading={mutation.isPending}>
          <UserPlus className="h-4 w-4" /> {t('users.inviteModal.submit')}
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
  const { t } = useTranslation();
  const apiError_ = makeApiErrorMessage(t);
  const [apiError, setApiError] = useState<string | null>(null);

  const roleOptions = useMemo(() => [
    { value: 'ADMIN',           label: t('users.roles.ADMIN') },
    { value: 'MANAGER',         label: t('users.roles.MANAGER') },
    { value: 'QUALITY_OFFICER', label: t('users.roles.QUALITY_OFFICER') },
    { value: 'OPERATOR',        label: t('users.roles.OPERATOR') },
    { value: 'VIEWER',          label: t('users.roles.VIEWER') },
  ], [t]);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<CreateFormValues>({
    defaultValues: { role: 'VIEWER' },
  });

  const mutation = useMutation({
    mutationFn: ({ name, email, password, role }: CreateFormValues) =>
      api.post('/api/v1/users', { name, email, password, role }),
    onSuccess:  () => { onSuccess(); onClose(); },
    onError:    (e) => setApiError(apiError_(e)),
  });

  return (
    <form
      onSubmit={(e) => { setApiError(null); void handleSubmit((v) => mutation.mutateAsync(v))(e); }}
      className="space-y-4"
    >
      <Input
        label={t('users.form.fullName')}
        placeholder={t('users.form.fullNamePlaceholder')}
        required
        error={errors.name?.message}
        {...register('name', { required: t('users.form.validation.nameRequired') })}
      />
      <Input
        label={t('users.form.email')}
        type="email"
        placeholder={t('users.form.emailPlaceholder')}
        required
        error={errors.email?.message}
        {...register('email', {
          required: t('users.form.validation.emailRequired'),
          pattern: { value: /\S+@\S+\.\S+/, message: t('users.form.validation.emailInvalid') },
        })}
      />
      <PasswordField
        label={t('users.form.password')}
        required
        error={errors.password?.message}
        registration={register('password', {
          required: t('users.form.validation.passwordRequired'),
          minLength: { value: 8, message: t('users.form.validation.passwordMin') },
        })}
      />
      <PasswordField
        label={t('users.passwordModal.confirmPassword')}
        required
        error={errors.confirmPassword?.message}
        registration={register('confirmPassword', {
          required: t('users.form.validation.confirmRequired'),
          validate: (v) => v === watch('password') || t('users.form.validation.confirmMatch'),
        })}
      />
      <Select
        label={t('users.form.role')}
        options={roleOptions}
        error={errors.role?.message}
        {...register('role', { required: t('users.form.validation.roleRequired') })}
      />

      {apiError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{apiError}</p>}

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" loading={mutation.isPending}>
          <Plus className="h-4 w-4" /> {t('users.createModal.submit')}
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
  const { t } = useTranslation();
  const apiError_ = makeApiErrorMessage(t);
  const [apiError, setApiError] = useState<string | null>(null);

  const roleOptions = useMemo(() => [
    { value: 'ADMIN',           label: t('users.roles.ADMIN') },
    { value: 'MANAGER',         label: t('users.roles.MANAGER') },
    { value: 'QUALITY_OFFICER', label: t('users.roles.QUALITY_OFFICER') },
    { value: 'OPERATOR',        label: t('users.roles.OPERATOR') },
    { value: 'VIEWER',          label: t('users.roles.VIEWER') },
  ], [t]);

  const statusOptions = useMemo(() => [
    { value: 'ACTIVE',   label: t('users.status.ACTIVE') },
    { value: 'INVITED',  label: t('users.status.INVITED') },
    { value: 'INACTIVE', label: t('users.status.INACTIVE') },
  ], [t]);

  const { register, handleSubmit, formState: { errors } } = useForm<EditFormValues>({
    defaultValues: { name: user.name, role: user.role, status: user.status },
  });

  const mutation = useMutation({
    mutationFn: (body: EditFormValues) => api.patch(`/api/v1/users/${user.id}`, body),
    onSuccess:  () => { onSuccess(); onClose(); },
    onError:    (e) => setApiError(apiError_(e)),
  });

  return (
    <form
      onSubmit={(e) => { setApiError(null); void handleSubmit((v) => mutation.mutateAsync(v))(e); }}
      className="space-y-4"
    >
      <Input
        label={t('users.form.fullName')}
        required
        error={errors.name?.message}
        {...register('name', { required: t('users.form.validation.nameRequired') })}
      />
      <Select
        label={t('users.form.role')}
        options={roleOptions}
        error={errors.role?.message}
        {...register('role', { required: t('users.form.validation.roleRequired') })}
      />
      <Select
        label={t('users.form.status')}
        options={statusOptions}
        error={errors.status?.message}
        {...register('status', { required: t('users.form.validation.statusRequired') })}
      />

      {apiError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{apiError}</p>}

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" loading={mutation.isPending}>
          <Edit2 className="h-4 w-4" /> {t('users.editModal.submit')}
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
  const { t } = useTranslation();
  const apiError_ = makeApiErrorMessage(t);
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ChangePasswordFormValues>();

  const mutation = useMutation({
    mutationFn: ({ password }: ChangePasswordFormValues) =>
      api.patch(`/api/v1/users/${userId}/password`, { password }),
    onSuccess:  () => { onSuccess(); onClose(); },
    onError:    (e) => setApiError(apiError_(e)),
  });

  return (
    <form
      onSubmit={(e) => { setApiError(null); void handleSubmit((v) => mutation.mutateAsync(v))(e); }}
      className="space-y-4"
    >
      <p className="text-sm text-gray-600">
        {t('users.passwordModal.desc', { name: userName })}
      </p>
      <PasswordField
        label={t('users.passwordModal.newPassword')}
        required
        error={errors.password?.message}
        registration={register('password', {
          required: t('users.form.validation.passwordRequired'),
          minLength: { value: 8, message: t('users.form.validation.passwordMin') },
        })}
      />
      <PasswordField
        label={t('users.passwordModal.confirmPassword')}
        required
        error={errors.confirmPassword?.message}
        registration={register('confirmPassword', {
          required: t('users.form.validation.confirmRequired'),
          validate: (v) => v === watch('password') || t('users.form.validation.confirmMatch'),
        })}
      />

      {apiError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{apiError}</p>}

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" loading={mutation.isPending}>
          <Key className="h-4 w-4" /> {t('users.passwordModal.submit')}
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
  const { t } = useTranslation();
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [roleFilter, setRole] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [modal, setModal]     = useState<ModalState>({ kind: 'none' });
  const queryClient           = useQueryClient();
  const currentUser           = useAuthStore((s) => s.user);
  const tenantId              = useTenantId();

  const { data, isLoading, isError } = useUsers(page, search, roleFilter, statusFilter);

  // ARCH-DECISION: Only ADMIN (not SUPER_ADMIN) can create/invite users from this page.
  // SUPER_ADMIN's tenantId is 'platform' — creating users here would place them in the
  // platform pseudo-tenant, making them invisible to real tenants. SUPER_ADMIN must use
  // the Clients backoffice (ClientDetailPage) to manage users within a specific tenant.
  const isSuperAdmin   = currentUser?.role === 'SUPER_ADMIN';
  const canManageUsers = currentUser?.role === 'ADMIN';

  const roleFilterOptions = useMemo(() => [
    { value: '',               label: t('users.allRoles') },
    { value: 'ADMIN',          label: t('users.roles.ADMIN') },
    { value: 'MANAGER',        label: t('users.roles.MANAGER') },
    { value: 'QUALITY_OFFICER',label: t('users.roles.QUALITY_OFFICER') },
    { value: 'OPERATOR',       label: t('users.roles.OPERATOR') },
    { value: 'VIEWER',         label: t('users.roles.VIEWER') },
  ], [t]);

  const statusFilterOptions = useMemo(() => [
    { value: '',         label: t('users.allStatuses') },
    { value: 'ACTIVE',   label: t('users.status.ACTIVE') },
    { value: 'INVITED',  label: t('users.status.INVITED') },
    { value: 'INACTIVE', label: t('users.status.INACTIVE') },
  ], [t]);

  const closeModal = () => setModal({ kind: 'none' });
  const refresh    = () => { void queryClient.invalidateQueries({ queryKey: ['users', tenantId] }); };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/users/${id}`),
    onSuccess:  refresh,
    onError: () => showToast({ title: t('users.error.delete'), variant: 'error' }),
  });

  const handleDelete = (user: User) => {
    if (!window.confirm(t('users.deleteConfirm', { name: user.name }))) return;
    void deleteMutation.mutateAsync(user.id);
  };

  return (
    <>
      <Header title={t('users.title')} subtitle={t('users.subtitle')} />
      <PageWrapper>
        {/* SUPER_ADMIN info banner */}
        {isSuperAdmin && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>Mode Super Admin :</strong> {t('users.superAdminBanner')}
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t('users.searchPlaceholder')}
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
              {roleFilterOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="h-9 rounded-lg border border-surface-muted bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
            >
              {statusFilterOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Actions — hidden for MANAGER (read-only access) */}
          {canManageUsers && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModal({ kind: 'invite' })}>
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">{t('users.invite')}</span>
              </Button>
              <Button size="sm" onClick={() => setModal({ kind: 'create' })}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t('users.create')}</span>
              </Button>
            </div>
          )}
        </div>

        {/* Table — desktop / Card — mobile */}
        <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
          {isLoading && (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">{t('common.loading')}</div>
          )}
          {isError && (
            <div className="flex h-40 items-center justify-center text-sm text-red-500">
              {t('users.error.load')}
            </div>
          )}
          {!isLoading && !isError && (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <th className="px-4 py-3">{t('users.columns.user')}</th>
                      <th className="px-4 py-3">{t('users.columns.email')}</th>
                      <th className="px-4 py-3">{t('users.columns.role')}</th>
                      <th className="px-4 py-3">{t('users.columns.status')}</th>
                      <th className="px-4 py-3">{t('users.columns.created')}</th>
                      <th className="px-4 py-3 text-right">{t('common.actions')}</th>
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
                            {canManageUsers ? (
                              <div className="flex items-center justify-end gap-1">
                                <button title={t('common.edit')} onClick={() => setModal({ kind: 'edit', user })}
                                  className="rounded-md p-1.5 text-gray-400 hover:bg-brand-lighter hover:text-brand-dark transition-colors">
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button title={t('users.passwordModal.title')} onClick={() => setModal({ kind: 'changePassword', user })}
                                  className="rounded-md p-1.5 text-gray-400 hover:bg-brand-lighter hover:text-brand-dark transition-colors">
                                  <Key className="h-4 w-4" />
                                </button>
                                {!isSelf && (
                                  <button title={t('common.delete')} onClick={() => handleDelete(user)}
                                    disabled={deleteMutation.isPending}
                                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="block text-right text-xs text-gray-400">{t('users.readonly')}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {(data?.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-sm text-gray-400">{t('users.empty')}</td>
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
                        {canManageUsers && (
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
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <RoleBadge role={user.role} />
                        <StatusBadge status={user.status} />
                      </div>
                    </div>
                  );
                })}
                {(data?.data ?? []).length === 0 && (
                  <p className="py-10 text-center text-sm text-gray-400">{t('users.empty')}</p>
                )}
              </div>
            </>
          )}

          {/* Pagination */}
          {data?.meta && data.meta.lastPage > 1 && (
            <div className="flex items-center justify-between border-t border-surface-muted px-4 py-3 text-sm text-gray-500">
              <span className="hidden sm:inline">
                {t('users.pagination.info', {
                  page:     data.meta.page,
                  lastPage: data.meta.lastPage,
                  total:    data.meta.total,
                })}
              </span>
              <div className="flex gap-2 ml-auto">
                <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  {t('common.previous')}
                </Button>
                <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>
                  {t('common.next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </PageWrapper>

      {/* ── Invite modal ─────────────────────────────────────────────────────── */}
      <Modal open={modal.kind === 'invite'} onClose={closeModal}
        title={t('users.inviteModal.title')}
        description={t('users.inviteModal.description')}
        size="sm">
        <InviteUserModal onClose={closeModal} onSuccess={refresh} />
      </Modal>

      {/* ── Create modal ─────────────────────────────────────────────────────── */}
      <Modal open={modal.kind === 'create'} onClose={closeModal}
        title={t('users.createModal.title')}
        description={t('users.createModal.description')}
        size="sm">
        <CreateUserModal onClose={closeModal} onSuccess={refresh} />
      </Modal>

      {/* ── Edit modal ───────────────────────────────────────────────────────── */}
      {modal.kind === 'edit' && (
        <Modal open onClose={closeModal} title={t('users.editModal.title')} size="sm">
          <EditUserModal user={modal.user} onClose={closeModal} onSuccess={refresh} />
        </Modal>
      )}

      {/* ── Change password modal ────────────────────────────────────────────── */}
      {modal.kind === 'changePassword' && (
        <Modal open onClose={closeModal} title={t('users.passwordModal.title')} size="sm">
          <ChangePasswordModal userId={modal.user.id} userName={modal.user.name} onClose={closeModal} onSuccess={refresh} />
        </Modal>
      )}
    </>
  );
}
