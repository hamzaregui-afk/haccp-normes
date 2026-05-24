import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { useTenantId } from '@/hooks/useTenantId';
import type { ApiResponse, Group, User } from '@haccp/shared-types';

// ─── Group card ───────────────────────────────────────────────────────────────

interface GroupCardProps {
  group: Group;
  onAddMember: (group: Group) => void;
  onDelete: (id: string) => void;
}

function GroupCard({ group, onAddMember, onDelete }: GroupCardProps) {
  const { t } = useTranslation();
  const memberCount = group._count?.members ?? group.members?.length ?? 0;

  return (
    <div className="rounded-xl border border-surface-muted bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-lighter">
            <Users className="h-5 w-5 text-brand-dark" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{group.name}</p>
            <p className="text-xs text-gray-500">
              {t(
                memberCount !== 1
                  ? 'groups.memberCount_other'
                  : 'groups.memberCount_one',
                { count: memberCount },
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => onDelete(group.id)}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          title={t('groups.deleteGroup')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Member list (only present in detail view) */}
      {group.members && group.members.length > 0 && (
        <ul className="mt-3 space-y-1">
          {group.members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between rounded-lg bg-surface-page px-3 py-1.5 text-xs">
              <span className="font-medium text-gray-800">{m.user?.name ?? m.userId}</span>
              <span className="text-gray-500">
                {m.user?.role
                  ? t(`groups.roles.${m.user.role}` as Parameters<typeof t>[0])
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-surface-muted pt-3">
        <button
          onClick={() => onAddMember(group)}
          className="flex items-center gap-1 text-xs text-brand-medium hover:underline"
        >
          <UserPlus className="h-3.5 w-3.5" /> {t('groups.addMember')}
        </button>
      </div>
    </div>
  );
}

// ─── Add member modal ─────────────────────────────────────────────────────────

interface AddMemberFormValues { userId: string }

interface AddMemberModalProps {
  group: Group;
  onClose: () => void;
  onAdded: () => void;
}

function AddMemberModal({ group, onClose, onAdded }: AddMemberModalProps) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { errors } } = useForm<AddMemberFormValues>();
  const tenantId = useTenantId();

  const { data: usersData } = useQuery({
    queryKey: ['users-select', tenantId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<User[]>>('/api/v1/users?limit=100');
      return data.data;
    },
  });

  const userOptions = (usersData ?? []).map((u) => ({
    value: u.id,
    label: `${u.name} — ${t(`groups.roles.${u.role}` as Parameters<typeof t>[0], u.role)}`,
  }));

  const addMutation = useMutation({
    mutationFn: (body: { userId: string }) =>
      api.post(`/api/v1/groups/${group.id}/members`, body),
    onSuccess: () => { onAdded(); onClose(); },
  });

  return (
    <form
      onSubmit={(e) => void handleSubmit((v) => addMutation.mutateAsync(v))(e)}
      className="space-y-4"
    >
      <p className="text-sm text-gray-600">
        {t('groups.addMemberModal.description', { name: group.name })}
      </p>

      <Select
        label={t('groups.addMemberModal.userLabel')}
        placeholder={t('groups.addMemberModal.userPlaceholder')}
        options={userOptions}
        error={errors.userId?.message}
        {...register('userId', { required: t('groups.addMemberModal.userRequired') })}
      />

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" loading={addMutation.isPending}>
          <UserPlus className="h-4 w-4" /> {t('groups.addMemberModal.addButton')}
        </Button>
      </div>
    </form>
  );
}

// ─── Create group form ────────────────────────────────────────────────────────

interface CreateGroupFormValues { name: string }

function CreateGroupForm({ onSubmit, loading }: { onSubmit: (d: CreateGroupFormValues) => Promise<unknown>; loading?: boolean }) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { errors } } = useForm<CreateGroupFormValues>();
  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <Input
        label={t('groups.createForm.nameLabel')}
        placeholder={t('groups.createForm.namePlaceholder')}
        required
        error={errors.name?.message}
        {...register('name', { required: t('groups.createForm.nameRequired') })}
      />
      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="submit" loading={loading}>{t('groups.createForm.submit')}</Button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [addMemberTarget, setAddMemberTarget] = useState<Group | null>(null);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(search, 400);
  const tenantId = useTenantId();

  const { data, isLoading } = useQuery({
    queryKey: ['groups', tenantId, page],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      const { data } = await api.get<ApiResponse<Group[]>>(`/api/v1/groups?${p}`);
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string }) => api.post('/api/v1/groups', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups', tenantId] });
      setCreateOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/groups/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['groups', tenantId] }),
    onError: () => showToast({ title: t('groups.toast.deleteError'), variant: 'error' }),
  });

  // Client-side filter by group name (groups list is typically small)
  const filtered = (data?.data ?? []).filter((g) =>
    debouncedSearch ? g.name.toLowerCase().includes(debouncedSearch.toLowerCase()) : true,
  );

  return (
    <>
      <Header title={t('groups.title')} subtitle={t('groups.subtitle')} />
      <PageWrapper>
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              placeholder={t('groups.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-72 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> {t('groups.new')}
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('groups.empty.title')}
            description={t('groups.empty.description')}
            actionLabel={t('groups.empty.action')}
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onAddMember={(g) => setAddMemberTarget(g)}
                  onDelete={(id) => void deleteMutation.mutateAsync(id)}
                />
              ))}
            </div>

            {data?.meta && data.meta.lastPage > 1 && (
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  {t('common.previous')}
                </Button>
                <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>
                  {t('common.next')}
                </Button>
              </div>
            )}
          </>
        )}

        {/* Create modal */}
        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('groups.modal.create')} size="sm">
          <CreateGroupForm
            loading={createMutation.isPending}
            onSubmit={(v) => createMutation.mutateAsync(v)}
          />
        </Modal>

        {/* Add member modal */}
        <Modal
          open={addMemberTarget !== null}
          onClose={() => setAddMemberTarget(null)}
          title={t('groups.modal.addMember')}
          size="sm"
        >
          {addMemberTarget && (
            <AddMemberModal
              group={addMemberTarget}
              onClose={() => setAddMemberTarget(null)}
              onAdded={() => void queryClient.invalidateQueries({ queryKey: ['groups', tenantId] })}
            />
          )}
        </Modal>
      </PageWrapper>
    </>
  );
}
