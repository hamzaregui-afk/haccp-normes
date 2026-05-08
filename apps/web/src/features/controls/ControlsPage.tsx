import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Plus,
  Search,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';
import type { ApiResponse } from '@haccp/shared-types';
import type { ControlStats, ControlTask, ControlTemplate, ControlType } from './types';

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

const TYPE_LABELS: Record<ControlType, string> = {
  RECEPTION:           'Réception',
  TEMPERATURE_STOCK:   'Temp. stock',
  TEMPERATURE_DISPLAY: 'Temp. vitrine',
  TEMPERATURE_OIL:     'Temp. huile',
  EQUIPMENT:           'Équipement',
  SANITARY:            'Sanitaire',
  DAILY_PRODUCTION:    'Production quotidienne',
};

const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as ControlType[]).map((k) => ({
  value: k,
  label: TYPE_LABELS[k],
}));

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
  templateId: string;
  zoneId: string;
  assigneeId: string;
  scheduledAt: string;
}

function PlanTaskForm({
  templates,
  onSubmit,
  loading,
}: {
  templates: ControlTemplate[];
  onSubmit: (v: PlanTaskFormValues) => Promise<void>;
  loading?: boolean;
}) {
  const { register, handleSubmit } = useForm<PlanTaskFormValues>();

  const templateOptions = templates.map((t) => ({
    value: t.id,
    label: `${t.name} — ${TYPE_LABELS[t.type]}`,
  }));

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <Select
        label="Modèle de contrôle"
        placeholder="Sélectionner un modèle"
        options={templateOptions}
        required
        {...register('templateId')}
      />
      <Input
        label="Zone / Emplacement"
        placeholder="Zone A, Cuisine froide…"
        required
        {...register('zoneId')}
      />
      <Input
        label="Assigné à"
        placeholder="ID utilisateur"
        required
        {...register('assigneeId')}
      />
      <Input
        label="Date planifiée"
        type="datetime-local"
        required
        {...register('scheduledAt')}
      />
      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="submit" loading={loading}>Planifier</Button>
      </div>
    </form>
  );
}

// ─── Create template form ──────────────────────────────────────────────────────

interface CreateTemplateFormValues {
  name: string;
  type: ControlType;
  frequency: string;
}

function CreateTemplateForm({
  onSubmit,
  loading,
}: {
  onSubmit: (v: CreateTemplateFormValues) => Promise<void>;
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
        label="Type"
        placeholder="Sélectionner un type"
        options={TYPE_OPTIONS}
        required
        {...register('type')}
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

function TasksTab({ templates }: { templates: ControlTemplate[] }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useQuery({
    queryKey: ['controls.tasks', page, debouncedSearch, statusFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) p.set('search', debouncedSearch);
      if (statusFilter) p.set('status', statusFilter);
      const { data } = await api.get<ApiResponse<ControlTask[]>>(`/api/v1/controls/tasks?${p}`);
      return data;
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/controls/tasks', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['controls.tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['controls.stats'] });
      setPlanModalOpen(false);
    },
  });

  const tasks = data?.data ?? [];

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-9 w-60 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-surface-muted bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={() => setPlanModalOpen(true)}>
          <Plus className="h-4 w-4" /> Planifier
        </Button>
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
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-surface-page transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {task.template?.name ?? <span className="text-gray-400 text-xs font-mono">{task.templateId.slice(0, 8)}…</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs font-mono">{task.zoneId}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs font-mono">{task.assigneeId}</td>
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
                    <button className="text-xs text-brand-medium hover:underline">Voir</button>
                  </td>
                </tr>
              ))}
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
          templates={templates}
          loading={createTaskMutation.isPending}
          onSubmit={(v) =>
            createTaskMutation.mutateAsync({
              templateId: v.templateId,
              zoneId: v.zoneId,
              assigneeId: v.assigneeId,
              scheduledAt: v.scheduledAt,
            })
          }
        />
      </Modal>
    </>
  );
}

// ─── Templates tab ─────────────────────────────────────────────────────────────

function TemplatesTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useQuery({
    queryKey: ['controls.templates', page, debouncedSearch],
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
      void queryClient.invalidateQueries({ queryKey: ['controls.templates'] });
      setModalOpen(false);
    },
  });

  const templates = data?.data ?? [];

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
            {templates.map((tpl) => (
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
                      <span className="inline-block rounded-full bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-dark border border-brand-lighter mt-0.5">
                        {TYPE_LABELS[tpl.type]}
                      </span>
                    </div>
                  </div>
                </div>

                {tpl.frequency && (
                  <div className="mt-4">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold-light px-2.5 py-0.5 text-xs font-medium text-gold">
                      <Clock className="h-3 w-3" />
                      {FREQUENCY_OPTIONS.find((f) => f.value === tpl.frequency)?.label ?? tpl.frequency}
                    </span>
                  </div>
                )}

                <div className="mt-4 flex gap-2 border-t border-surface-muted pt-3">
                  <button className="text-xs text-brand-medium hover:underline">Modifier</button>
                  <span className="text-gray-300">·</span>
                  <button className="text-xs text-red-500 hover:underline">Supprimer</button>
                </div>
              </div>
            ))}
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
              name: v.name,
              type: v.type,
              frequency: v.frequency || undefined,
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

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['controls.stats'],
    queryFn: async () => {
      const { data } = await api.get<{ data: ControlStats }>('/api/v1/controls/stats');
      return data.data;
    },
  });

  // Fetch templates once so the PlanTaskForm can populate the select
  const { data: templatesData } = useQuery({
    queryKey: ['controls.templates', 1, ''],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ControlTemplate[]>>('/api/v1/controls/templates?page=1&limit=100');
      return data;
    },
  });

  const stats = statsData;
  const allTemplates = templatesData?.data ?? [];

  const overdueColor = (stats?.openOverdue ?? 0) > 0 ? 'text-red-600' : 'text-gray-700';
  const overdueIconColor = (stats?.openOverdue ?? 0) > 0 ? 'text-red-600' : 'text-gray-500';
  const overdueIconBg  = (stats?.openOverdue ?? 0) > 0 ? 'bg-red-50' : 'bg-gray-100';

  return (
    <>
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

        {/* Tab bar */}
        <div className="mb-5 flex border-b border-surface-muted">
          {([
            { key: 'tasks',     label: 'Tâches' },
            { key: 'templates', label: 'Modèles' },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
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
          <TasksTab templates={allTemplates} />
        ) : (
          <TemplatesTab />
        )}

      </PageWrapper>
    </>
  );
}
