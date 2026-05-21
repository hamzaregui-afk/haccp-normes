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
  Search,
  TrendingUp,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import type { ControlStats, ControlTask, ControlTemplate, TaskResult } from './types';
import { ChecklistExecutionModal } from './ChecklistExecutionModal';

// ─── Error Boundary ────────────────────────────────────────────────────────────

interface ErrorBoundaryState { hasError: boolean; error?: Error; }
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
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertTriangle className="mb-4 h-10 w-10 text-amber-400" />
          <p className="text-lg font-semibold text-gray-900">Une erreur est survenue</p>
          <p className="mt-1 text-sm text-gray-500">
            {this.state.error?.message ?? 'Erreur inconnue'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 rounded-lg bg-brand-medium px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Style maps ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ControlTask['status'], string> = {
  PLANNED:     'bg-gray-100 text-gray-700 border-gray-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED:   'bg-green-50 text-green-700 border-green-200',
  OVERDUE:     'bg-red-50 text-red-700 border-red-200',
  CANCELLED:   'bg-gray-100 text-gray-500 border-gray-200',
};

const STATUS_LABELS: Record<ControlTask['status'], string> = {
  PLANNED:     'Planifié',
  IN_PROGRESS: 'En cours',
  COMPLETED:   'Complété',
  OVERDUE:     'En retard',
  CANCELLED:   'Annulé',
};

const STATUS_FILTER_OPTIONS = [
  { value: '',            label: 'Tous les statuts' },
  { value: 'PLANNED',     label: 'Planifié' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'COMPLETED',   label: 'Complété' },
  { value: 'OVERDUE',     label: 'En retard' },
  { value: 'CANCELLED',   label: 'Annulé' },
];

const FREQUENCY_OPTIONS = [
  { value: 'DAILY',        label: 'Quotidienne' },
  { value: 'WEEKLY',       label: 'Hebdomadaire' },
  { value: 'MONTHLY',      label: 'Mensuelle' },
  { value: 'ON_RECEPTION', label: 'À la réception' },
  { value: 'ON_DEMAND',    label: 'À la demande' },
];

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

  const templateOptions = useMemo(
    () => (templatesData ?? []).map((t) => ({
      value:    t.id,
      label:    t.name,
      sublabel: FREQUENCY_OPTIONS.find((f) => f.value === t.frequency)?.label,
    })),
    [templatesData],
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
        rules={{ required: 'Veuillez sélectionner un modèle' }}
        render={({ field }) => (
          <Combobox
            label="Modèle de contrôle"
            placeholder="Rechercher un modèle…"
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
        rules={{ required: 'Veuillez sélectionner une zone' }}
        render={({ field }) => (
          <Combobox
            label="Zone / Emplacement"
            placeholder="Rechercher une zone…"
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
          <p className="mb-1.5 text-sm font-medium text-gray-700">Assigner à</p>
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
                    {type === 'user' ? 'Utilisateur' : 'Groupe'}
                  </span>
                </label>
              );
            })}
          </div>

          {!canAssignUser && assigneeType === 'group' && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              L'assignation individuelle n'est disponible que pour les administrateurs.
            </p>
          )}

          <div className="mt-3">
            {assigneeType === 'user' ? (
              <Select
                label="Utilisateur"
                placeholder="Sélectionner un utilisateur"
                options={userOptions}
                {...register('assigneeId')}
              />
            ) : (
              <Select
                label="Groupe"
                placeholder="Sélectionner un groupe"
                options={groupOptions}
                {...register('groupId')}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-xs text-orange-700">
          Aucun utilisateur ou groupe disponible. Contactez un administrateur pour en créer.
        </div>
      )}

      <Input
        label="Date planifiée"
        type="datetime-local"
        required
        {...register('scheduledAt', { required: 'Veuillez saisir une date planifiée' })}
      />
      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="submit" loading={loading}>Planifier</Button>
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
    onError: () => showToast({ title: 'Erreur lors de la réassignation', variant: 'error' }),
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
    onError: () => showToast({ title: 'Erreur', body: "Impossible d'annuler la tâche", variant: 'error' }),
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
  const assigneeKind = task.groupId ? 'Groupe' : 'Utilisateur';

  return (
    <>
      <Modal open={open} onClose={() => { onClose(); reset(); }} title="Détail de la tâche" size="lg">
        {/* Info grid */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="font-medium text-gray-500">Modèle</dt>
            <dd className="mt-0.5 text-gray-900">{task.template?.name ?? task.templateId.slice(0, 8)}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Zone</dt>
            <dd className="mt-0.5 text-gray-900">{zoneName}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Statut</dt>
            <dd className="mt-0.5">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[task.status]}`}>
                {STATUS_LABELS[task.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Date planifiée</dt>
            <dd className="mt-0.5 text-gray-900">
              {new Date(task.scheduledAt).toLocaleString('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">{assigneeKind} actuel</dt>
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
                <p className="text-sm font-semibold text-green-800">Résultats du contrôle</p>
                <span
                  className={[
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    result.overallCompliant
                      ? 'border-green-300 bg-green-100 text-green-700'
                      : 'border-red-300 bg-red-100 text-red-700',
                  ].join(' ')}
                >
                  {result.overallCompliant ? (
                    <><CheckCircle2 className="h-3 w-3" />Conforme</>
                  ) : (
                    <><Clock className="h-3 w-3" />Non conforme</>
                  )}
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border border-green-200 bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-green-100 bg-green-50 text-left text-[10px] font-semibold uppercase tracking-wider text-green-700">
                      <th className="px-3 py-2">Point</th>
                      <th className="px-3 py-2">Valeur</th>
                      <th className="px-3 py-2">Conformité</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-50">
                    {result.items.map((item) => {
                      const displayValue =
                        item.value === null || item.value === undefined
                          ? '—'
                          : item.type === 'BOOLEAN'
                            ? (item.value ? 'Oui' : 'Non')
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
                  <span className="font-medium">Notes :</span> {result.notes}
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
              Photos du contrôle ({photos.length})
            </h3>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPhotoMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-brand-medium bg-white px-3 py-1.5 text-xs font-medium text-brand-medium hover:bg-brand-light transition-colors disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploadPhotoMutation.isPending ? 'Upload…' : 'Ajouter une photo'}
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
              Erreur lors du téléversement. Veuillez réessayer.
            </p>
          )}

          {photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-surface-muted py-8 text-center">
              <ImageOff className="mb-2 h-7 w-7 text-gray-300" />
              <p className="text-sm text-gray-400">Aucune photo pour ce contrôle</p>
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
                    alt="Photo contrôle"
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
          <p className="mb-3 text-sm font-semibold text-gray-700">Réassigner la tâche</p>
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
                        {type === 'user' ? 'Utilisateur' : 'Groupe'}
                      </span>
                    </label>
                  );
                })}
              </div>

              {assigneeType === 'user' ? (
                <Select placeholder="Sélectionner un utilisateur" options={userOptions} {...register('assigneeId')} />
              ) : (
                <Select placeholder="Sélectionner un groupe" options={groupOptions} {...register('groupId')} />
              )}

              <div className="flex justify-end">
                <Button type="submit" size="sm" loading={reassignMutation.isPending}>
                  Réassigner
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-gray-400">
              Aucun utilisateur ou groupe disponible pour la réassignation.
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
              Annuler la tâche
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
            alt="Photo contrôle agrandie"
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
  const { register, handleSubmit } = useForm<CreateTemplateFormValues>();
  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <Input
        label="Nom du modèle"
        placeholder="Contrôle réception viande…"
        required
        {...register('name')}
      />
      <Select
        label="Fréquence"
        placeholder="Sélectionner une fréquence"
        options={FREQUENCY_OPTIONS}
        {...register('frequency')}
      />
      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="submit" loading={loading}>Créer le modèle</Button>
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
  const [page, setPage]                     = useState(1);
  const [statusFilter, setStatusFilter]     = useState('');
  const [search, setSearch]                 = useState('');
  const [planModalOpen, setPlanModalOpen]   = useState(false);
  const [selectedTask, setSelectedTask]     = useState<ControlTask | null>(null);
  const [selectedExecTaskId, setSelectedExecTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const tenantId    = useTenantId();

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
    onError: () => showToast({ title: 'Erreur lors de la planification', variant: 'error' }),
  });

  const tasks = data?.data ?? [];

  // Client-side search filter on the current page's data
  // (backend doesn't support task search yet)
  const filteredTasks = search.trim()
    ? tasks.filter((t) =>
        t.template?.name.toLowerCase().includes(search.toLowerCase()) ||
        t.zoneId.toLowerCase().includes(search.toLowerCase())
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
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* OPERATOR cannot plan tasks — that's the manager/admin role */}
        {!isOperator && (
          <Button size="sm" onClick={() => setPlanModalOpen(true)}>
            <Plus className="h-4 w-4" /> Planifier
          </Button>
        )}
      </div>

      {/* Search filter */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-surface-muted pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Aucune tâche"
          description="Planifiez votre première tâche de contrôle à partir d'un modèle existant."
          actionLabel="Planifier une tâche"
          onAction={() => setPlanModalOpen(true)}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Modèle</th>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">Assigné</th>
                <th className="px-4 py-3">Date planifiée</th>
                <th className="px-4 py-3">Statut</th>
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
                      {new Date(task.scheduledAt).toLocaleString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[task.status]}`}
                      >
                        {STATUS_LABELS[task.status]}
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
                        {isOperator ? 'Exécuter' : 'Voir'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {data?.meta && data.meta.lastPage > 1 && (
            <div className="flex items-center justify-between border-t border-surface-muted px-4 py-3 text-sm text-gray-500">
              <span>Page {data.meta.page} sur {data.meta.lastPage} — {data.meta.total} tâche(s)</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
                <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Plan task modal */}
      <Modal open={planModalOpen} onClose={() => setPlanModalOpen(false)} title="Planifier une tâche" size="md">
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
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient             = useQueryClient();
  const navigate                = useNavigate();
  const debouncedSearch         = useDebounce(search, 400);
  const tenantId                = useTenantId();

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
    onError: () => showToast({ title: 'Erreur lors de la création du modèle', variant: 'error' }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/controls/templates/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['controls.templates', tenantId] }),
    onError: () => showToast({ title: 'Erreur lors de la suppression', variant: 'error' }),
  });

  const templates = data?.data ?? [];

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Supprimer le modèle "${name}" ?`)) {
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
            placeholder="Rechercher un modèle…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-9 w-60 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Nouveau modèle
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Aucun modèle"
          description="Créez des modèles de contrôle réutilisables pour standardiser vos relevés HACCP."
          actionLabel="Créer un modèle"
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
                        {FREQUENCY_OPTIONS.find((f) => f.value === tpl.frequency)?.label ?? tpl.frequency}
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
                      Gérer la checklist
                    </button>
                    <span className="text-gray-300">·</span>
                    <button
                      className="text-xs text-red-500 hover:underline"
                      onClick={() => handleDelete(tpl.id, tpl.name)}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {data?.meta && data.meta.lastPage > 1 && (
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
              <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
            </div>
          )}
        </>
      )}

      {/* Create template modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau modèle de contrôle" size="md">
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

// ─── Page ───────────────────────────────────────────────────────────────────────

type Tab = 'tasks' | 'templates';

export default function ControlsPage() {
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

  return (
    <ControlsErrorBoundary>
      <Header title="Contrôle" subtitle="Planification et suivi des tâches de contrôle HACCP" />
      <PageWrapper>

        {/* KPI row */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Contrôles du jour"
            value={String(stats?.todayTotal ?? '—')}
            icon={CheckCircle2}
            iconColor="text-green-600"
            iconBg="bg-green-50"
            valueColor="text-green-600"
          />
          <KpiCard
            label="Complétés"
            value={stats ? `${stats.todayCompleted} / ${stats.todayTotal}` : '—'}
            icon={CheckCircle2}
            iconColor="text-brand-dark"
            iconBg="bg-brand-light"
            valueColor="text-brand-dark"
          />
          <KpiCard
            label="En retard"
            value={String(stats?.openOverdue ?? '—')}
            icon={Clock}
            iconColor={overdueIconColor}
            iconBg={overdueIconBg}
            valueColor={overdueColor}
          />
          <KpiCard
            label="Taux conformité"
            value={stats ? `${stats.complianceRate}%` : '—'}
            icon={TrendingUp}
            iconColor="text-brand-dark"
            iconBg="bg-brand-lighter"
            valueColor="text-brand-dark"
          />
        </div>

        {/* Tab bar — OPERATOR only sees "Tâches" (no template management) */}
        <div className="mb-5 flex border-b border-surface-muted">
          {(([
            { key: 'tasks',     label: 'Tâches planifiées' },
            ...(!isOperator ? [{ key: 'templates', label: 'Modèles de contrôle' }] : []),
          ]) as { key: Tab; label: string }[]).map(({ key, label }) => (
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
        ) : (
          <TemplatesTab />
        )}

      </PageWrapper>
    </ControlsErrorBoundary>
  );
}
