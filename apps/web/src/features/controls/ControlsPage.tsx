import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  Edit2,
  Eye,
  ImageOff,
  ListChecks,
  Plus,
  Repeat,
  Search,
  TrendingUp,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { useTenantId } from '@/hooks/useTenantId';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse } from '@haccp/shared-types';
import type { ControlSchedule, ControlStats, ControlTask, ControlTemplate, TaskResult } from './types';
import { ChecklistExecutionModal } from './ChecklistExecutionModal';
import { ScheduleFormModal } from './ScheduleFormModal';

// ─── Error Boundary ────────────────────────────────────────────────────────────
// ARCH-DECISION: ErrorBoundary is a class component (React requirement).
// useTranslation() cannot be called inside class methods.
// We delegate the translated error UI to a separate function component ErrorFallback
// that wraps the retry button and message, and pass t() results as props.

interface ErrorBoundaryState { hasError: boolean; error?: Error; }

function ErrorFallback({
  message,
  onRetry,
}: {
  message: string | undefined;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <AlertTriangle className="mb-4 h-10 w-10 text-amber-400" />
      <p className="text-lg font-semibold text-gray-900">{t('controls.errorBoundary.title')}</p>
      <p className="mt-1 text-sm text-gray-500">
        {message ?? t('controls.error.unknown')}
      </p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-lg bg-brand-medium px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        {t('controls.errorBoundary.retry')}
      </button>
    </div>
  );
}

class ControlsErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ControlsPage]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          message={this.state.error?.message}
          onRetry={() => this.setState({ hasError: false })}
        />
      );
    }
    return this.props.children;
  }
}

// ─── Style maps (CSS only — no labels) ─────────────────────────────────────────

const STATUS_STYLES: Record<ControlTask['status'], string> = {
  PLANNED:     'bg-gray-100 text-gray-700 border-gray-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED:   'bg-green-50 text-green-700 border-green-200',
  OVERDUE:     'bg-red-50 text-red-700 border-red-200',
  CANCELLED:   'bg-gray-100 text-gray-500 border-gray-200',
};

// ─── Lookup types ──────────────────────────────────────────────────────────────

interface ZoneRaw    { id: string; name: string }
interface SiteRaw    { id: string; name: string; zones: ZoneRaw[] }
interface UserRaw    { id: string; name: string; email: string }
interface GroupRaw   { id: string; name: string }

// ─── Lookup hooks ──────────────────────────────────────────────────────────────

function useZoneLookup() {
  const tenantId = useTenantId();
  const { data } = useQuery({
    queryKey: ['sites.all', tenantId],
    queryFn: async () => {
      const { data } = await api.get<{ data: SiteRaw[] }>('/api/v1/sites');
      return data.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const zoneMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const site of (data ?? [])) {
      for (const zone of (site.zones ?? [])) {
        map[zone.id] = zone.name;
      }
    }
    return map;
  }, [data]);

  const zoneOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (const site of (data ?? [])) {
      for (const zone of (site.zones ?? [])) {
        opts.push({ value: zone.id, label: `${site.name} — ${zone.name}` });
      }
    }
    return opts;
  }, [data]);

  return { zoneMap, zoneOptions };
}

function useUserLookup() {
  const tenantId = useTenantId();
  // ARCH-DECISION: retry:false + throwOnError:false so a 403 (MANAGER role cannot
  // list users) silently yields an empty array rather than crashing the form.
  const { data } = useQuery({
    queryKey: ['users.all', tenantId],
    queryFn: async () => {
      try {
        const { data } = await api.get<{ data: UserRaw[] }>('/api/v1/users?page=1&limit=100');
        return data.data ?? [];
      } catch {
        return [] as UserRaw[];
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of (data ?? [])) map[u.id] = u.name;
    return map;
  }, [data]);

  const userOptions = useMemo(
    () => (data ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
    [data],
  );

  return { userMap, userOptions };
}

function useGroupLookup() {
  const tenantId = useTenantId();
  const { data } = useQuery({
    queryKey: ['groups.all', tenantId],
    queryFn: async () => {
      try {
        const { data } = await api.get<{ data: GroupRaw[] }>('/api/v1/groups?page=1&limit=100');
        return data.data ?? [];
      } catch {
        return [] as GroupRaw[];
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const groupMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of (data ?? [])) map[g.id] = g.name;
    return map;
  }, [data]);

  const groupOptions = useMemo(
    () => (data ?? []).map((g) => ({ value: g.id, label: g.name })),
    [data],
  );

  return { groupMap, groupOptions };
}

// ─── KPI cards ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  valueColor: string;
}

function KpiCard({ label, value, icon: Icon, iconColor, iconBg, valueColor }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-surface-muted bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`mt-1 text-3xl font-bold ${valueColor}`}>{value}</p>
        </div>
        <div className={`rounded-lg p-2.5 ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}

// ─── Plan task form ────────────────────────────────────────────────────────────

interface PlanTaskFormValues {
  templateId:   string;
  zoneId:       string;
  assigneeType: 'user' | 'group';
  assigneeId:   string;
  groupId:      string;
  scheduledAt:  string;
}

/**
 * PlanTaskForm — fetches templates and zones directly so the dropdowns
 * always reflect the latest data without needing a page reload.
 * staleTime:0 ensures every modal-open triggers a fresh request.
 */
function PlanTaskForm({
  userOptions,
  groupOptions,
  onSubmit,
  loading,
}: {
  userOptions:  { value: string; label: string }[];
  groupOptions: { value: string; label: string }[];
  onSubmit:     (v: PlanTaskFormValues) => Promise<unknown>;
  loading?:     boolean;
}) {
  const { t } = useTranslation();

  // ── Live templates ────────────────────────────────────────────────────────
  const tenantId = useTenantId();
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['controls.templates.all', tenantId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ControlTemplate[]>>(
        '/api/v1/controls/templates?page=1&limit=100',
      );
      return data.data ?? [];
    },
    staleTime: 0,          // always re-fetch when the modal opens
    refetchOnWindowFocus: true,
  });

  // ── Live sites + zones ────────────────────────────────────────────────────
  const { data: sitesData, isLoading: zonesLoading } = useQuery({
    queryKey: ['sites.all.live', tenantId],
    queryFn: async () => {
      const { data } = await api.get<{ data: SiteRaw[] }>('/api/v1/sites');
      return data.data ?? [];
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const frequencyOptions = useMemo(() => [
    { value: 'DAILY',        label: t('controls.frequency.DAILY') },
    { value: 'WEEKLY',       label: t('controls.frequency.WEEKLY') },
    { value: 'MONTHLY',      label: t('controls.frequency.MONTHLY') },
    { value: 'ON_RECEPTION', label: t('controls.frequency.ON_RECEPTION') },
    { value: 'ON_DEMAND',    label: t('controls.frequency.ON_DEMAND') },
  ], [t]);

  const templateOptions = useMemo(
    () => (templatesData ?? []).map((tpl) => ({
      value:    tpl.id,
      label:    tpl.name,
      sublabel: frequencyOptions.find((f) => f.value === tpl.frequency)?.label,
    })),
    [templatesData, frequencyOptions],
  );

  const zoneOptions = useMemo(() => {
    const opts: { value: string; label: string; sublabel: string }[] = [];
    for (const site of (sitesData ?? [])) {
      for (const zone of (site.zones ?? [])) {
        opts.push({ value: zone.id, label: zone.name, sublabel: site.name });
      }
    }
    return opts;
  }, [sitesData]);

  // ── Form ──────────────────────────────────────────────────────────────────
  const canAssignUser  = userOptions.length > 0;
  const canAssignGroup = groupOptions.length > 0;

  const defaultAssigneeType: 'user' | 'group' =
    userOptions.length === 0 && groupOptions.length > 0 ? 'group' : 'user';

  const { register, handleSubmit, watch, control, formState: { errors } } =
    useForm<PlanTaskFormValues>({ defaultValues: { assigneeType: defaultAssigneeType } });

  const assigneeType = watch('assigneeType');

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">

      {/* ── Modèle de contrôle — Combobox avec autocomplete ──────────────── */}
      <Controller
        name="templateId"
        control={control}
        rules={{ required: t('controls.planForm.templateRequired') }}
        render={({ field }) => (
          <Combobox
            label={t('controls.planForm.templateLabel')}
            placeholder={t('controls.planForm.templatePlaceholder')}
            required
            loading={templatesLoading}
            options={templateOptions}
            value={field.value ?? ''}
            onChange={field.onChange}
            error={errors.templateId?.message}
          />
        )}
      />

      {/* ── Zone / Emplacement — Combobox avec autocomplete ──────────────── */}
      <Controller
        name="zoneId"
        control={control}
        rules={{ required: t('controls.planForm.zoneRequired') }}
        render={({ field }) => (
          <Combobox
            label={t('controls.planForm.zoneLabel')}
            placeholder={t('controls.planForm.zonePlaceholder')}
            required
            loading={zonesLoading}
            options={zoneOptions}
            value={field.value ?? ''}
            onChange={field.onChange}
            error={errors.zoneId?.message}
          />
        )}
      />

      {/* ── Assignation ──────────────────────────────────────────────────── */}
      {(canAssignUser || canAssignGroup) ? (
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-700">{t('controls.planForm.assignTo')}</p>
          <div className="flex gap-4">
            {(['user', 'group'] as const).map((type) => {
              const enabled = type === 'user' ? canAssignUser : canAssignGroup;
              return (
                <label
                  key={type}
                  className={`flex cursor-pointer items-center gap-2 ${!enabled ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  <input
                    type="radio"
                    value={type}
                    disabled={!enabled}
                    {...register('assigneeType')}
                    className="accent-brand-medium"
                  />
                  <span className="flex items-center gap-1 text-sm text-gray-700">
                    {type === 'user' ? <User className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                    {type === 'user' ? t('controls.planForm.userLabel') : t('controls.planForm.groupLabel')}
                  </span>
                </label>
              );
            })}
          </div>

          {!canAssignUser && assigneeType === 'group' && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              {t('controls.planForm.noUserAssign')}
            </p>
          )}

          <div className="mt-3">
            {assigneeType === 'user' ? (
              <Select
                label={t('controls.planForm.userLabel')}
                placeholder={t('controls.planForm.userPlaceholder')}
                options={userOptions}
                {...register('assigneeId')}
              />
            ) : (
              <Select
                label={t('controls.planForm.groupLabel')}
                placeholder={t('controls.planForm.groupPlaceholder')}
                options={groupOptions}
                {...register('groupId')}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-xs text-orange-700">
          {t('controls.empty.noAssignees')}
        </div>
      )}

      <Input
        label={t('controls.planForm.scheduledAt')}
        type="datetime-local"
        required
        {...register('scheduledAt', { required: t('controls.planForm.scheduledAtRequired') })}
      />
      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="submit" loading={loading}>{t('controls.actions.planTask')}</Button>
      </div>
    </form>
  );
}

// ─── Control photo type ────────────────────────────────────────────────────────

interface ControlPhoto {
  id:         string;
  taskId:     string;
  url:        string;
  uploadedAt: string;
}

// ─── Task detail + reassign modal ──────────────────────────────────────────────

interface ReassignFormValues {
  assigneeType: 'user' | 'group';
  assigneeId:   string;
  groupId:      string;
}

function TaskDetailModal({
  task,
  open,
  onClose,
  zoneMap,
  userMap,
  groupMap,
  userOptions,
  groupOptions,
  isOperator,
}: {
  task:         ControlTask | null;
  open:         boolean;
  onClose:      () => void;
  zoneMap:      Record<string, string>;
  userMap:      Record<string, string>;
  groupMap:     Record<string, string>;
  userOptions:  { value: string; label: string }[];
  groupOptions: { value: string; label: string }[];
  isOperator:   boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient  = useQueryClient();
  const tenantId     = useTenantId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Prefer the task's current assignment type, but fall back to 'group'
  // when userOptions is empty (e.g. MANAGER has no permission to list users).
  const defaultReassignType: 'user' | 'group' =
    userOptions.length === 0 && groupOptions.length > 0
      ? 'group'
      : (task?.groupId ? 'group' : 'user');

  const { register, handleSubmit, watch, reset } = useForm<ReassignFormValues>({
    defaultValues: {
      assigneeType: defaultReassignType,
      assigneeId:   task?.assigneeId ?? '',
      groupId:      task?.groupId ?? '',
    },
  });
  const assigneeType = watch('assigneeType');

  // Fetch photos for this task
  const { data: photosData, refetch: refetchPhotos } = useQuery({
    queryKey: ['controls.tasks.photos', tenantId, task?.id],
    queryFn: async () => {
      const { data } = await api.get<{ data: ControlPhoto[] }>(
        `/api/v1/controls/tasks/${task!.id}/photos`,
      );
      return data.data ?? [];
    },
    enabled: open && task !== null,
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      // ARCH-DECISION: Do NOT set Content-Type manually — the browser must set it
      // with the correct multipart boundary; a hardcoded header would break parsing.
      await api.post(`/api/v1/controls/tasks/${task!.id}/photos`, formData);
    },
    onSuccess: () => void refetchPhotos(),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadPhotoMutation.mutate(file);
    e.target.value = '';
  };

  const reassignMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/v1/controls/tasks/${task?.id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['controls.tasks', tenantId] });
      onClose();
    },
    onError: () => showToast({ title: t('controls.toast.reassignError'), variant: 'error' }),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      api.patch<ApiResponse<ControlTask>>(`/api/v1/controls/tasks/${task?.id}`, {
        status: 'CANCELLED',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['controls.tasks', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['controls.stats', tenantId] });
      onClose();
      reset();
    },
    onError: () => showToast({
      title: t('controls.toast.cancelErrorTitle'),
      body: t('controls.toast.cancelError'),
      variant: 'error',
    }),
  });

  const handleReassign = (v: ReassignFormValues) => {
    if (v.assigneeType === 'user' && v.assigneeId) {
      void reassignMutation.mutateAsync({ assigneeId: v.assigneeId });
    } else if (v.assigneeType === 'group' && v.groupId) {
      void reassignMutation.mutateAsync({ groupId: v.groupId });
    }
  };

  if (!task) return null;

  const photos       = photosData ?? [];
  const zoneName     = zoneMap[task.zoneId] ?? task.zoneId;
  const assigneeName = task.assigneeId
    ? (userMap[task.assigneeId] ?? task.assigneeId)
    : task.groupId
      ? (groupMap[task.groupId] ?? task.groupId)
      : '—';
  const assigneeKind = task.groupId
    ? t('controls.taskDetail.currentGroup')
    : t('controls.taskDetail.currentUser');

  return (
    <>
      <Modal open={open} onClose={() => { onClose(); reset(); }} title={t('controls.taskDetail.title')} size="lg">
        {/* Info grid */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="font-medium text-gray-500">{t('controls.taskDetail.template')}</dt>
            <dd className="mt-0.5 text-gray-900">{task.template?.name ?? task.templateId.slice(0, 8)}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">{t('controls.taskDetail.zone')}</dt>
            <dd className="mt-0.5 text-gray-900">{zoneName}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">{t('controls.taskDetail.status')}</dt>
            <dd className="mt-0.5">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[task.status]}`}>
                {t(`controls.statusLabel.${task.status}` as Parameters<typeof t>[0])}
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">{t('controls.taskDetail.scheduledAt')}</dt>
            <dd className="mt-0.5 text-gray-900">
              {new Date(task.scheduledAt).toLocaleString(i18n.language, {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">{assigneeKind}</dt>
            <dd className="mt-0.5 text-gray-900 flex items-center gap-1">
              {task.groupId ? <Users className="h-3.5 w-3.5 text-gray-400" /> : <User className="h-3.5 w-3.5 text-gray-400" />}
              {assigneeName}
            </dd>
          </div>
        </dl>

        {/* ── Completed results ──────────────────────────────────────────────── */}
        {task.status === 'COMPLETED' && task.resultJson != null && (() => {
          const result = task.resultJson as TaskResult;
          return (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-green-800">{t('controls.taskDetail.results')}</p>
                <span
                  className={[
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    result.overallCompliant
                      ? 'border-green-300 bg-green-100 text-green-700'
                      : 'border-red-300 bg-red-100 text-red-700',
                  ].join(' ')}
                >
                  {result.overallCompliant ? (
                    <><CheckCircle2 className="h-3 w-3" />{t('controls.taskDetail.compliant')}</>
                  ) : (
                    <><Clock className="h-3 w-3" />{t('controls.taskDetail.nonCompliant')}</>
                  )}
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border border-green-200 bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-green-100 bg-green-50 text-left text-[10px] font-semibold uppercase tracking-wider text-green-700">
                      <th className="px-3 py-2">{t('controls.columns.point')}</th>
                      <th className="px-3 py-2">{t('controls.columns.value')}</th>
                      <th className="px-3 py-2">{t('controls.columns.compliance')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-50">
                    {result.items.map((item) => {
                      const displayValue =
                        item.value === null || item.value === undefined
                          ? '—'
                          : item.type === 'BOOLEAN'
                            ? (item.value ? t('controls.taskDetail.yesCompliant') : t('controls.taskDetail.noCompliant'))
                            : item.type === 'TEMPERATURE'
                              ? `${String(item.value)} °C`
                              : item.unit
                                ? `${String(item.value)} ${item.unit}`
                                : String(item.value);
                      return (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-medium text-gray-900">{item.label}</td>
                          <td className="px-3 py-2 text-gray-700">{displayValue}</td>
                          <td className="px-3 py-2">
                            {item.compliant ? (
                              <span className="text-green-600">✓</span>
                            ) : (
                              <span className="text-red-600">✗</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {result.notes && (
                <p className="mt-2 text-xs text-green-800">
                  <span className="font-medium">{t('controls.taskDetail.notes')}</span> {result.notes}
                </p>
              )}
            </div>
          );
        })()}

        {/* ── Photo section ──────────────────────────────────────────────────── */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Camera className="h-4 w-4 text-brand-medium" />
              {t('controls.taskDetail.photosSection', { count: photos.length })}
            </h3>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPhotoMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-brand-medium bg-white px-3 py-1.5 text-xs font-medium text-brand-medium hover:bg-brand-light transition-colors disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploadPhotoMutation.isPending ? t('controls.taskDetail.uploading') : t('controls.actions.addPhoto')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {uploadPhotoMutation.isError && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {t('controls.taskDetail.uploadError')}
            </p>
          )}

          {photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-surface-muted py-8 text-center">
              <ImageOff className="mb-2 h-7 w-7 text-gray-300" />
              <p className="text-sm text-gray-400">{t('controls.empty.photos')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setLightboxUrl(photo.url)}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-surface-muted bg-gray-50 hover:border-brand-medium transition-colors"
                >
                  <img
                    src={photo.url}
                    alt={t('controls.columns.template')}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                    <Eye className="h-5 w-5 text-white" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reassign section — hidden for OPERATOR (only managers/admins can reassign) */}
        {!isOperator && <div className="mt-5 rounded-lg border border-surface-muted bg-surface-page px-4 py-4">
          <p className="mb-3 text-sm font-semibold text-gray-700">{t('controls.taskDetail.reassign')}</p>
          {(userOptions.length > 0 || groupOptions.length > 0) ? (
            <form onSubmit={(e) => void handleSubmit(handleReassign)(e)} className="space-y-3">
              <div className="flex gap-4">
                {(['user', 'group'] as const).map((type) => {
                  const enabled = type === 'user' ? userOptions.length > 0 : groupOptions.length > 0;
                  return (
                    <label
                      key={type}
                      className={`flex cursor-pointer items-center gap-2 ${!enabled ? 'cursor-not-allowed opacity-40' : ''}`}
                    >
                      <input
                        type="radio"
                        value={type}
                        disabled={!enabled}
                        {...register('assigneeType')}
                        className="accent-brand-medium"
                      />
                      <span className="flex items-center gap-1 text-sm text-gray-700">
                        {type === 'user' ? <User className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                        {type === 'user' ? t('controls.planForm.userLabel') : t('controls.planForm.groupLabel')}
                      </span>
                    </label>
                  );
                })}
              </div>

              {assigneeType === 'user' ? (
                <Select placeholder={t('controls.planForm.userPlaceholder')} options={userOptions} {...register('assigneeId')} />
              ) : (
                <Select placeholder={t('controls.planForm.groupPlaceholder')} options={groupOptions} {...register('groupId')} />
              )}

              <div className="flex justify-end">
                <Button type="submit" size="sm" loading={reassignMutation.isPending}>
                  {t('controls.actions.reassign')}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-gray-400">
              {t('controls.empty.noAssigneesReassign')}
            </p>
          )}
        </div>}

        {/* Cancel task — hidden for OPERATOR and for already terminal statuses */}
        {!isOperator && !['COMPLETED', 'CANCELLED'].includes(task.status) && (
          <div className="mt-4 flex justify-end border-t border-surface-muted pt-4">
            <Button
              variant="secondary"
              onClick={() => void cancelMutation.mutateAsync()}
              loading={cancelMutation.isPending}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              {t('controls.actions.cancelTask')}
            </Button>
          </div>
        )}
      </Modal>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
            onClick={() => setLightboxUrl(null)}
          >
            ✕
          </button>
          <img
            src={lightboxUrl}
            alt={t('controls.taskDetail.photosSection', { count: 1 })}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ─── Create template form ──────────────────────────────────────────────────────

interface CreateTemplateFormValues {
  name:      string;
  frequency: string;
}

function CreateTemplateForm({
  onSubmit,
  loading,
}: {
  onSubmit: (v: CreateTemplateFormValues) => Promise<unknown>;
  loading?: boolean;
}) {
  const { t } = useTranslation();

  const frequencyOptions = useMemo(() => [
    { value: 'DAILY',        label: t('controls.frequency.DAILY') },
    { value: 'WEEKLY',       label: t('controls.frequency.WEEKLY') },
    { value: 'MONTHLY',      label: t('controls.frequency.MONTHLY') },
    { value: 'ON_RECEPTION', label: t('controls.frequency.ON_RECEPTION') },
    { value: 'ON_DEMAND',    label: t('controls.frequency.ON_DEMAND') },
  ], [t]);

  const { register, handleSubmit } = useForm<CreateTemplateFormValues>();
  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <Input
        label={t('controls.templateForm.nameLabel')}
        placeholder={t('controls.templateForm.namePlaceholder')}
        required
        {...register('name')}
      />
      <Select
        label={t('controls.templateForm.frequencyLabel')}
        placeholder={t('controls.templateForm.frequencyPlaceholder')}
        options={frequencyOptions}
        {...register('frequency')}
      />
      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="submit" loading={loading}>{t('controls.actions.createModel')}</Button>
      </div>
    </form>
  );
}

// ─── Tasks tab ─────────────────────────────────────────────────────────────────

function TasksTab({
  zoneMap,
  userMap,
  userOptions,
  groupMap,
  groupOptions,
  isOperator,
  operatorId,
}: {
  zoneMap:      Record<string, string>;
  userMap:      Record<string, string>;
  userOptions:  { value: string; label: string }[];
  groupMap:     Record<string, string>;
  groupOptions: { value: string; label: string }[];
  isOperator:   boolean;
  operatorId:   string;
}) {
  const { t, i18n } = useTranslation();
  const [page, setPage]                     = useState(1);
  const [statusFilter, setStatusFilter]     = useState('');
  const [search, setSearch]                 = useState('');
  const [planModalOpen, setPlanModalOpen]   = useState(false);
  const [selectedTask, setSelectedTask]     = useState<ControlTask | null>(null);
  const [selectedExecTaskId, setSelectedExecTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const tenantId    = useTenantId();

  const statusFilterOptions = useMemo(() => [
    { value: '',            label: t('controls.statusFilter.all') },
    { value: 'PLANNED',     label: t('controls.statusFilter.PLANNED') },
    { value: 'IN_PROGRESS', label: t('controls.statusFilter.IN_PROGRESS') },
    { value: 'COMPLETED',   label: t('controls.statusFilter.COMPLETED') },
    { value: 'OVERDUE',     label: t('controls.statusFilter.OVERDUE') },
    { value: 'CANCELLED',   label: t('controls.statusFilter.CANCELLED') },
  ], [t]);

  // Reset search when status filter changes
  useEffect(() => {
    setSearch('');
  }, [statusFilter]);

  const { data, isLoading } = useQuery({
    // ARCH-DECISION: When the current user is an OPERATOR, inject their ID as
    // assigneeId filter so they only see tasks assigned to them. Managers and
    // admins see all tasks and can filter manually.
    queryKey: ['controls.tasks', tenantId, page, statusFilter, isOperator ? operatorId : null],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) p.set('status', statusFilter);
      if (isOperator)   p.set('assigneeId', operatorId);
      const { data } = await api.get<ApiResponse<ControlTask[]>>(`/api/v1/controls/tasks?${p}`);
      return data;
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/controls/tasks', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['controls.tasks', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['controls.stats', tenantId] });
      setPlanModalOpen(false);
    },
    onError: () => showToast({ title: t('controls.toast.planError'), variant: 'error' }),
  });

  const tasks = data?.data ?? [];

  // Client-side search filter on the current page's data
  // (backend doesn't support task search yet)
  const filteredTasks = search.trim()
    ? tasks.filter((task) =>
        task.template?.name.toLowerCase().includes(search.toLowerCase()) ||
        task.zoneId.toLowerCase().includes(search.toLowerCase())
      )
    : tasks;

  const handlePlanSubmit = (v: PlanTaskFormValues) =>
    createTaskMutation.mutateAsync({
      templateId:  v.templateId,
      zoneId:      v.zoneId,
      scheduledAt: v.scheduledAt,
      ...(v.assigneeType === 'user' && v.assigneeId  ? { assigneeId: v.assigneeId } : {}),
      ...(v.assigneeType === 'group' && v.groupId ? { groupId: v.groupId } : {}),
    });

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-surface-muted bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
        >
          {statusFilterOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* OPERATOR cannot plan tasks — that's the manager/admin role */}
        {!isOperator && (
          <Button size="sm" onClick={() => setPlanModalOpen(true)}>
            <Plus className="h-4 w-4" /> {t('controls.actions.planTask')}
          </Button>
        )}
      </div>

      {/* Search filter */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder={t('controls.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-surface-muted pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">{t('controls.loading')}</div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={t('controls.empty.tasks.title')}
          description={t('controls.empty.tasks.description')}
          actionLabel={t('controls.empty.tasks.action')}
          onAction={() => setPlanModalOpen(true)}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">{t('controls.columns.template')}</th>
                <th className="px-4 py-3">{t('controls.columns.zone')}</th>
                <th className="px-4 py-3">{t('controls.columns.assignee')}</th>
                <th className="px-4 py-3">{t('controls.columns.scheduledAt')}</th>
                <th className="px-4 py-3">{t('controls.columns.status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-muted">
              {filteredTasks.map((task) => {
                const zoneName = zoneMap[task.zoneId] ?? <span className="font-mono text-xs text-gray-400">{task.zoneId.slice(0, 8)}…</span>;
                const assigneeName = task.assigneeId
                  ? (userMap[task.assigneeId] ?? <span className="font-mono text-xs text-gray-400">{task.assigneeId.slice(0, 8)}…</span>)
                  : task.groupId
                    ? (groupMap[task.groupId] ?? <span className="font-mono text-xs text-gray-400">{task.groupId.slice(0, 8)}…</span>)
                    : <span className="text-gray-400">—</span>;

                return (
                  <tr
                    key={task.id}
                    className="cursor-pointer hover:bg-surface-page transition-colors"
                    onClick={() => {
                      if (isOperator) {
                        setSelectedExecTaskId(task.id);
                      } else {
                        setSelectedTask(task);
                      }
                    }}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {task.template?.name ?? <span className="text-gray-400 text-xs font-mono">{task.templateId.slice(0, 8)}…</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{zoneName}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="flex items-center gap-1">
                        {task.groupId
                          ? <Users className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          : <User  className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        }
                        {assigneeName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(task.scheduledAt).toLocaleString(i18n.language, {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[task.status]}`}
                      >
                        {t(`controls.statusLabel.${task.status}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="text-xs text-brand-medium hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isOperator) {
                            setSelectedExecTaskId(task.id);
                          } else {
                            setSelectedTask(task);
                          }
                        }}
                      >
                        {isOperator ? t('controls.actions.execute') : t('controls.actions.view')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {data?.meta && data.meta.lastPage > 1 && (
            <div className="flex items-center justify-between border-t border-surface-muted px-4 py-3 text-sm text-gray-500">
              <span>
                {t('controls.pagination.tasks', {
                  page: data.meta.page,
                  lastPage: data.meta.lastPage,
                  total: data.meta.total,
                })}
              </span>
              <div className="flex gap-2">
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
      )}

      {/* Plan task modal */}
      <Modal open={planModalOpen} onClose={() => setPlanModalOpen(false)} title={t('controls.planTask')} size="md">
        <PlanTaskForm
          userOptions={userOptions}
          groupOptions={groupOptions}
          loading={createTaskMutation.isPending}
          onSubmit={handlePlanSubmit}
        />
      </Modal>

      {/* Task detail / reassign modal — key resets form defaults when task changes */}
      <TaskDetailModal
        key={selectedTask?.id}
        task={selectedTask}
        open={selectedTask !== null}
        onClose={() => setSelectedTask(null)}
        zoneMap={zoneMap}
        userMap={userMap}
        groupMap={groupMap}
        userOptions={userOptions}
        groupOptions={groupOptions}
        isOperator={isOperator}
      />

      {/* Checklist execution modal — OPERATOR only */}
      {isOperator && (
        <ChecklistExecutionModal
          taskId={selectedExecTaskId}
          zoneMap={zoneMap}
          onClose={() => setSelectedExecTaskId(null)}
          onCompleted={() => {
            setSelectedExecTaskId(null);
            void queryClient.invalidateQueries({ queryKey: ['controls.tasks', tenantId] });
            void queryClient.invalidateQueries({ queryKey: ['controls.stats', tenantId] });
          }}
        />
      )}
    </>
  );
}

// ─── Templates tab ─────────────────────────────────────────────────────────────

function TemplatesTab() {
  const { t } = useTranslation();
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient             = useQueryClient();
  const navigate                = useNavigate();
  const debouncedSearch         = useDebounce(search, 400);
  const tenantId                = useTenantId();

  const frequencyOptions = useMemo(() => [
    { value: 'DAILY',        label: t('controls.frequency.DAILY') },
    { value: 'WEEKLY',       label: t('controls.frequency.WEEKLY') },
    { value: 'MONTHLY',      label: t('controls.frequency.MONTHLY') },
    { value: 'ON_RECEPTION', label: t('controls.frequency.ON_RECEPTION') },
    { value: 'ON_DEMAND',    label: t('controls.frequency.ON_DEMAND') },
  ], [t]);

  const { data, isLoading } = useQuery({
    queryKey: ['controls.templates', tenantId, page, debouncedSearch],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) p.set('search', debouncedSearch);
      const { data } = await api.get<ApiResponse<ControlTemplate[]>>(`/api/v1/controls/templates?${p}`);
      return data;
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/controls/templates', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['controls.templates', tenantId] });
      setModalOpen(false);
    },
    onError: () => showToast({ title: t('controls.toast.createTemplateError'), variant: 'error' }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/controls/templates/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['controls.templates', tenantId] }),
    onError: () => showToast({ title: t('controls.toast.deleteTemplateError'), variant: 'error' }),
  });

  const templates = data?.data ?? [];

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(t('controls.confirm.deleteTemplate', { name }))) {
      void deleteTemplateMutation.mutate(id);
    }
  };

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            placeholder={t('controls.searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-9 w-60 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> {t('controls.actions.newTemplate')}
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">{t('controls.loading')}</div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('controls.empty.templates.title')}
          description={t('controls.empty.templates.description')}
          actionLabel={t('controls.empty.templates.action')}
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((tpl) => {
              const itemCount = Array.isArray(tpl.checklistJson) ? (tpl.checklistJson as unknown[]).length : 0;
              return (
                <div
                  key={tpl.id}
                  className="rounded-xl border border-surface-muted bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-lighter">
                        <ClipboardList className="h-5 w-5 text-brand-dark" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{tpl.name}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                    {tpl.frequency && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold-light px-2.5 py-0.5 font-medium text-gold">
                        <Clock className="h-3 w-3" />
                        {frequencyOptions.find((f) => f.value === tpl.frequency)?.label ?? tpl.frequency}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5" />
                      {itemCount} point{itemCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2 border-t border-surface-muted pt-3">
                    <button
                      className="flex items-center gap-1 text-xs text-brand-medium hover:underline"
                      onClick={() => navigate(`/controls/templates/${tpl.id}`)}
                    >
                      <Edit2 className="h-3 w-3" />
                      {t('controls.actions.manageChecklist')}
                    </button>
                    <span className="text-gray-300">·</span>
                    <button
                      className="text-xs text-red-500 hover:underline"
                      onClick={() => handleDelete(tpl.id, tpl.name)}
                    >
                      {t('controls.actions.delete')}
                    </button>
                  </div>
                </div>
              );
            })}
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

      {/* Create template modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('controls.createTemplate')} size="md">
        <CreateTemplateForm
          loading={createTemplateMutation.isPending}
          onSubmit={(v) =>
            createTemplateMutation.mutateAsync({
              name:          v.name,
              frequency:     v.frequency || undefined,
              checklistJson: [],
            })
          }
        />
      </Modal>
    </>
  );
}

// ─── Schedules tab ─────────────────────────────────────────────────────────────

function SchedulesTab({
  zoneMap,
  userMap,
  groupMap,
}: {
  zoneMap:  Record<string, string>;
  userMap:  Record<string, string>;
  groupMap: Record<string, string>;
}) {
  const { t, i18n } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient               = useQueryClient();
  const tenantId                  = useTenantId();

  const { data, isLoading } = useQuery({
    queryKey: ['controls.schedules', tenantId],
    queryFn: async () => {
      const { data } = await api.get<{ data: ControlSchedule[] }>('/api/v1/controls/schedules');
      return data.data ?? [];
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/controls/schedules/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['controls.schedules', tenantId] });
      showToast({ title: t('controls.toast.scheduleDeactivated'), variant: 'success' });
    },
    onError: () => showToast({ title: t('controls.toast.scheduleDeactivateError'), variant: 'error' }),
  });

  const schedules = data ?? [];

  const handleDeactivate = (id: string) => {
    if (window.confirm(t('controls.confirm.deactivateSchedule'))) {
      void deactivateMutation.mutate(id);
    }
  };

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> {t('controls.actions.createSchedule')}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">{t('controls.loading')}</div>
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={t('controls.empty.schedules.title')}
          description={t('controls.empty.schedules.description')}
          actionLabel={t('controls.empty.schedules.action')}
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">{t('controls.columns.template')}</th>
                <th className="px-4 py-3">{t('controls.columns.zone')}</th>
                <th className="px-4 py-3">{t('controls.columns.frequency')}</th>
                <th className="px-4 py-3">{t('controls.columns.assignee')}</th>
                <th className="px-4 py-3">{t('controls.columns.nextRun')}</th>
                <th className="px-4 py-3">{t('controls.columns.status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-muted">
              {schedules.map((schedule) => {
                const zoneName = zoneMap[schedule.zoneId] ?? (
                  <span className="font-mono text-xs text-gray-400">{schedule.zoneId.slice(0, 8)}…</span>
                );
                const assigneeName = schedule.assigneeId
                  ? (userMap[schedule.assigneeId] ?? <span className="font-mono text-xs text-gray-400">{schedule.assigneeId.slice(0, 8)}…</span>)
                  : schedule.groupId
                    ? (groupMap[schedule.groupId] ?? <span className="font-mono text-xs text-gray-400">{schedule.groupId.slice(0, 8)}…</span>)
                    : <span className="text-gray-400">—</span>;

                return (
                  <tr key={schedule.id} className="hover:bg-surface-page transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {schedule.template?.name ?? (
                        <span className="font-mono text-xs text-gray-400">{schedule.templateId.slice(0, 8)}…</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{zoneName}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-lighter px-2.5 py-0.5 text-xs font-medium text-brand-dark">
                        <Repeat className="h-3 w-3" />
                        {t(`controls.frequency.${schedule.frequency}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="flex items-center gap-1">
                        {schedule.groupId
                          ? <Users className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          : <User  className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        }
                        {assigneeName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {schedule.nextRunAt
                        ? new Date(schedule.nextRunAt).toLocaleString(i18n.language, {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {schedule.isActive ? (
                        <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          {t('controls.schedule.scheduleActive')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                          {t('controls.schedule.scheduleInactive')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {schedule.isActive && (
                        <button
                          className="text-xs text-red-500 hover:underline disabled:opacity-40"
                          disabled={deactivateMutation.isPending}
                          onClick={() => handleDeactivate(schedule.id)}
                        >
                          {t('controls.actions.deactivate')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ScheduleFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['controls.schedules', tenantId] });
        }}
      />
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

type Tab = 'tasks' | 'templates' | 'schedules';

export default function ControlsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('tasks');

  const currentUser = useAuthStore((s) => s.user);
  const isOperator  = currentUser?.role === 'OPERATOR';
  const operatorId  = currentUser?.sub ?? '';
  const tenantId    = useTenantId();

  // Lookup data fetched once for the whole page
  // zoneOptions is intentionally not destructured — PlanTaskForm fetches zones with staleTime:0
  const { zoneMap } = useZoneLookup();
  const { userMap, userOptions }  = useUserLookup();
  const { groupMap, groupOptions } = useGroupLookup();

  // Stats
  const { data: statsData } = useQuery({
    queryKey: ['controls.stats', tenantId],
    queryFn: async () => {
      const { data } = await api.get<{ data: ControlStats }>('/api/v1/controls/stats');
      return data.data;
    },
  });

  const stats = statsData;

  const overdueColor    = (stats?.openOverdue ?? 0) > 0 ? 'text-red-600'  : 'text-gray-700';
  const overdueIconColor = (stats?.openOverdue ?? 0) > 0 ? 'text-red-600'  : 'text-gray-500';
  const overdueIconBg   = (stats?.openOverdue ?? 0) > 0 ? 'bg-red-50'     : 'bg-gray-100';

  const tabs = useMemo(() => ([
    { key: 'tasks' as Tab,     label: t('controls.tabs.tasks') },
    ...(!isOperator ? [{ key: 'templates' as Tab,  label: t('controls.tabs.templates') }] : []),
    ...(!isOperator ? [{ key: 'schedules' as Tab,  label: t('controls.tabs.schedules') }] : []),
  ]), [t, isOperator]);

  return (
    <ControlsErrorBoundary>
      <Header title={t('controls.title')} subtitle={t('controls.subtitle')} />
      <PageWrapper>

        {/* KPI row */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={t('controls.kpi.todayTotal')}
            value={String(stats?.todayTotal ?? '—')}
            icon={CheckCircle2}
            iconColor="text-green-600"
            iconBg="bg-green-50"
            valueColor="text-green-600"
          />
          <KpiCard
            label={t('controls.kpi.completed')}
            value={stats ? `${stats.todayCompleted} / ${stats.todayTotal}` : '—'}
            icon={CheckCircle2}
            iconColor="text-brand-dark"
            iconBg="bg-brand-light"
            valueColor="text-brand-dark"
          />
          <KpiCard
            label={t('controls.kpi.overdue')}
            value={String(stats?.openOverdue ?? '—')}
            icon={Clock}
            iconColor={overdueIconColor}
            iconBg={overdueIconBg}
            valueColor={overdueColor}
          />
          <KpiCard
            label={t('controls.kpi.complianceRate')}
            value={stats ? `${stats.complianceRate}%` : '—'}
            icon={TrendingUp}
            iconColor="text-brand-dark"
            iconBg="bg-brand-lighter"
            valueColor="text-brand-dark"
          />
        </div>

        {/* Tab bar — OPERATOR only sees "Tâches" (no template or schedule management) */}
        <div className="mb-5 flex border-b border-surface-muted">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={[
                'px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === key
                  ? 'border-brand-medium text-brand-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-800',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'tasks' ? (
          <TasksTab
            zoneMap={zoneMap}
            userMap={userMap}
            userOptions={userOptions}
            groupMap={groupMap}
            groupOptions={groupOptions}
            isOperator={isOperator}
            operatorId={operatorId}
          />
        ) : activeTab === 'templates' ? (
          <TemplatesTab />
        ) : (
          <SchedulesTab
            zoneMap={zoneMap}
            userMap={userMap}
            groupMap={groupMap}
          />
        )}

      </PageWrapper>
    </ControlsErrorBoundary>
  );
}
