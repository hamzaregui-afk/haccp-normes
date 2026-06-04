import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  Filter,
  ListChecks,
  Percent,
  Plus,
  RefreshCw,
  Repeat,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { useTenantId } from '@/hooks/useTenantId';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

// ─── Domain types ─────────────────────────────────────────────────────────────

type TaskStatus = 'PLANNED' | 'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED';
type Frequency  = 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface ControlTask {
  id:            string;
  templateId:    string;
  templateName:  string;
  zoneId?:       string | null;
  zoneName?:     string | null;
  assigneeId?:   string | null;
  assigneeName?: string | null;
  groupId?:      string | null;
  groupName?:    string | null;
  scheduledAt:   string;
  status:        TaskStatus;
  tenantId:      string;
}

interface ControlTemplate {
  id:   string;
  name: string;
}

interface Site {
  id:    string;
  name:  string;
  zones: Zone[];
}

interface Zone {
  id:   string;
  name: string;
}

interface User {
  id:   string;
  name: string;
  email: string;
}

interface Group {
  id:   string;
  name: string;
}

interface ControlSchedule {
  id:          string;
  templateId:  string;
  templateName: string;
  zoneId?:     string | null;
  zoneName?:   string | null;
  assigneeId?: string | null;
  groupId?:    string | null;
  frequency:   Frequency;
  startDate:   string;
  endDate?:    string | null;
  isActive:    boolean;
}

interface PlanningStats {
  todayTotal:     number;
  overdue:        number;
  completedWeek:  number;
  complianceRate: number;
}

interface PagedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; lastPage: number };
}

// ─── Style maps ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<TaskStatus, string> = {
  PLANNED:     'bg-blue-100 text-blue-700 border border-blue-200',
  IN_PROGRESS: 'bg-orange-100 text-orange-700 border border-orange-200',
  OVERDUE:     'bg-red-100 text-red-700 border border-red-200',
  COMPLETED:   'bg-green-100 text-green-700 border border-green-200',
  CANCELLED:   'bg-gray-100 text-gray-600 border border-gray-200',
};

const STATUS_ICON: Record<TaskStatus, React.ElementType> = {
  PLANNED:     CalendarClock,
  IN_PROGRESS: Clock,
  OVERDUE:     AlertCircle,
  COMPLETED:   CheckCircle2,
  CANCELLED:   X,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function toast(title: string, variant: 'success' | 'error' | 'info' = 'info') {
  showToast({ title, variant });
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

// ─── API calls ────────────────────────────────────────────────────────────────

const planningApi = {
  listTasks: (params: Record<string, string | number | undefined>) =>
    api.get<PagedResponse<ControlTask>>('/api/v1/controls/tasks', { params }).then((r) => r.data),

  listTemplates: () =>
    api.get<{ data: ControlTemplate[] }>('/api/v1/controls/templates').then((r) => r.data.data),

  listSites: () =>
    api.get<{ data: Site[] }>('/api/v1/sites').then((r) => r.data.data),

  listUsers: () =>
    api.get<{ data: User[] }>('/api/v1/users').then((r) => r.data.data),

  listGroups: () =>
    api.get<{ data: Group[] }>('/api/v1/groups').then((r) => r.data.data),

  listSchedules: () =>
    api.get<{ data: ControlSchedule[] }>('/api/v1/controls/schedules').then((r) => r.data.data),

  createTask: (body: {
    templateId: string;
    zoneId?: string;
    assigneeId?: string;
    groupId?: string;
    scheduledAt: string;
  }) => api.post<{ data: ControlTask }>('/api/v1/controls/tasks', body).then((r) => r.data),

  createSchedule: (body: {
    templateId:  string;
    zoneId?:     string;
    assigneeId?: string;
    groupId?:    string;
    frequency:   Frequency;
    startDate:   string;
    endDate?:    string;
    timezone:    string;
  }) => api.post<{ data: ControlSchedule }>('/api/v1/controls/schedules', body).then((r) => r.data),
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, suffix }: {
  label: string;
  value: number;
  icon:  React.ElementType;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">
            {value}{suffix}
          </p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Status label map (needed because keys are camelCase in i18n but STATUS is UPPER_SNAKE) ─

const STATUS_I18N_KEY: Record<TaskStatus, string> = {
  PLANNED:     'planning.filters.planned',
  IN_PROGRESS: 'planning.filters.inProgress',
  OVERDUE:     'planning.filters.overdue',
  COMPLETED:   'planning.filters.completed',
  CANCELLED:   'common.cancel',
};

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: ControlTask }) {
  const { t } = useTranslation();
  const StatusIcon   = STATUS_ICON[task.status];
  const assigneeName = task.assigneeName ?? task.groupName ?? '—';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">{task.templateName}</p>
          {task.zoneName && (
            <p className="mt-0.5 text-sm text-gray-500">{task.zoneName}</p>
          )}
        </div>
        <span className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
          STATUS_STYLES[task.status],
        )}>
          <StatusIcon className="h-3 w-3" />
          {t(STATUS_I18N_KEY[task.status])}
        </span>
      </div>

      {/* Meta row */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{fmtDateTime(task.scheduledAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          <ListChecks className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{assigneeName}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Create task modal ────────────────────────────────────────────────────────

interface CreateTaskModalProps {
  open:      boolean;
  onClose:   () => void;
  tenantId:  string;
}

function CreateTaskModal({ open, onClose, tenantId }: CreateTaskModalProps) {
  const { t } = useTranslation();
  const qc    = useQueryClient();

  const [templateId,   setTemplateId]   = useState('');
  const [zoneId,       setZoneId]       = useState('');
  const [assigneeId,   setAssigneeId]   = useState('');
  const [groupId,      setGroupId]      = useState('');
  const [scheduledAt,  setScheduledAt]  = useState(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now.toISOString().slice(0, 16);
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', tenantId],
    queryFn:  planningApi.listTemplates,
    enabled:  open,
  });

  const { data: sites = [] } = useQuery({
    queryKey: ['sites', tenantId],
    queryFn:  planningApi.listSites,
    enabled:  open,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users', tenantId],
    queryFn:  planningApi.listUsers,
    enabled:  open,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', tenantId],
    queryFn:  planningApi.listGroups,
    enabled:  open,
  });

  const zones = sites.flatMap((s) => s.zones);

  const mutation = useMutation({
    mutationFn: () => planningApi.createTask({
      templateId,
      zoneId:    zoneId || undefined,
      assigneeId: assigneeId || undefined,
      groupId:   groupId || undefined,
      scheduledAt: new Date(scheduledAt).toISOString(),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planning-tasks'] });
      toast(t('planning.form.save'), 'success');
      onClose();
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : t('common.error'), 'error'),
  });

  const isValid = templateId !== '' && scheduledAt !== '';

  return (
    <Modal open={open} onClose={onClose} title={t('planning.createTask')} size="md">
      <div className="space-y-4">
        {/* Template */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.form.template')}
          </label>
          <Select
            value={templateId}
            onChange={(e) => setTemplateId((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
            options={[
              { value: '', label: t('common.select') },
              ...templates.map((tpl) => ({ value: tpl.id, label: tpl.name })),
            ]}
          />
        </div>

        {/* Zone */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.form.zone')}
          </label>
          <Select
            value={zoneId}
            onChange={(e) => setZoneId((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
            options={[
              { value: '', label: t('planning.form.allZones') },
              ...zones.map((z) => ({ value: z.id, label: z.name })),
            ]}
          />
        </div>

        {/* Assignee user */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.form.assignee')}
          </label>
          <Select
            value={assigneeId}
            onChange={(e) => {
              setAssigneeId((e as React.ChangeEvent<HTMLSelectElement>).target.value);
              setGroupId('');
            }}
            options={[
              { value: '', label: t('common.none') },
              ...users.map((u) => ({ value: u.id, label: u.name || u.email })),
            ]}
          />
        </div>

        {/* OR group */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.form.group')}
          </label>
          <Select
            value={groupId}
            onChange={(e) => {
              setGroupId((e as React.ChangeEvent<HTMLSelectElement>).target.value);
              setAssigneeId('');
            }}
            options={[
              { value: '', label: t('planning.form.noGroup') },
              ...groups.map((g) => ({ value: g.id, label: g.name })),
            ]}
          />
        </div>

        {/* Scheduled at */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.form.scheduledAt')}
          </label>
          <input
            type="datetime-local"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('planning.form.cancel')}</Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!isValid}
          >
            {t('planning.form.add')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Create schedule modal ────────────────────────────────────────────────────

interface CreateScheduleModalProps {
  open:     boolean;
  onClose:  () => void;
  tenantId: string;
}

function CreateScheduleModal({ open, onClose, tenantId }: CreateScheduleModalProps) {
  const { t } = useTranslation();
  const qc    = useQueryClient();

  const [templateId,  setTemplateId]  = useState('');
  const [zoneId,      setZoneId]      = useState('');
  const [assigneeId,  setAssigneeId]  = useState('');
  const [groupId,     setGroupId]     = useState('');
  const [frequency,   setFrequency]   = useState<Frequency>('DAILY');
  const [startDate,   setStartDate]   = useState(getToday());
  const [endDate,     setEndDate]     = useState('');
  const [timezone,    setTimezone]    = useState('UTC');

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', tenantId],
    queryFn:  planningApi.listTemplates,
    enabled:  open,
  });

  const { data: sites = [] } = useQuery({
    queryKey: ['sites', tenantId],
    queryFn:  planningApi.listSites,
    enabled:  open,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users', tenantId],
    queryFn:  planningApi.listUsers,
    enabled:  open,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', tenantId],
    queryFn:  planningApi.listGroups,
    enabled:  open,
  });

  const zones = sites.flatMap((s) => s.zones);

  const mutation = useMutation({
    mutationFn: () => planningApi.createSchedule({
      templateId,
      zoneId:     zoneId || undefined,
      assigneeId: assigneeId || undefined,
      groupId:    groupId || undefined,
      frequency,
      startDate,
      endDate:    endDate || undefined,
      timezone,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planning-schedules'] });
      toast(t('planning.form.save'), 'success');
      onClose();
    },
    onError: (err: unknown) =>
      toast(err instanceof Error ? err.message : t('common.error'), 'error'),
  });

  const isValid = templateId !== '' && startDate !== '';

  const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
    { value: 'DAILY',   label: t('planning.schedule.daily') },
    { value: 'WEEKLY',  label: t('planning.schedule.weekly') },
    { value: 'MONTHLY', label: t('planning.schedule.monthly') },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t('planning.schedule.title')} size="md">
      <div className="space-y-4">
        {/* Template */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.form.template')}
          </label>
          <Select
            value={templateId}
            onChange={(e) => setTemplateId((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
            options={[
              { value: '', label: t('common.select') },
              ...templates.map((tpl) => ({ value: tpl.id, label: tpl.name })),
            ]}
          />
        </div>

        {/* Zone */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.form.zone')}
          </label>
          <Select
            value={zoneId}
            onChange={(e) => setZoneId((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
            options={[
              { value: '', label: t('planning.form.allZones') },
              ...zones.map((z) => ({ value: z.id, label: z.name })),
            ]}
          />
        </div>

        {/* Assignee */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.form.assignee')}
          </label>
          <Select
            value={assigneeId}
            onChange={(e) => {
              setAssigneeId((e as React.ChangeEvent<HTMLSelectElement>).target.value);
              setGroupId('');
            }}
            options={[
              { value: '', label: t('common.none') },
              ...users.map((u) => ({ value: u.id, label: u.name || u.email })),
            ]}
          />
        </div>

        {/* Group */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.form.group')}
          </label>
          <Select
            value={groupId}
            onChange={(e) => {
              setGroupId((e as React.ChangeEvent<HTMLSelectElement>).target.value);
              setAssigneeId('');
            }}
            options={[
              { value: '', label: t('planning.form.noGroup') },
              ...groups.map((g) => ({ value: g.id, label: g.name })),
            ]}
          />
        </div>

        {/* Frequency */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.schedule.frequency')}
          </label>
          <Select
            value={frequency}
            onChange={(e) => setFrequency((e as React.ChangeEvent<HTMLSelectElement>).target.value as Frequency)}
            options={FREQ_OPTIONS}
          />
        </div>

        {/* Start date */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.schedule.startDate')}
          </label>
          <input
            type="date"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        {/* End date (optional) */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.schedule.endDate')}
          </label>
          <input
            type="date"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {/* Timezone */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('planning.schedule.timezone')}
          </label>
          <Select
            value={timezone}
            onChange={(e) => setTimezone((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
            options={[
              { value: 'UTC',             label: 'UTC' },
              { value: 'Europe/Paris',    label: 'Europe/Paris (CET/CEST)' },
              { value: 'Africa/Algiers',  label: 'Africa/Algiers (CET)' },
              { value: 'Africa/Casablanca', label: 'Africa/Casablanca (WET)' },
              { value: 'Africa/Tunis',    label: 'Africa/Tunis (CET)' },
              { value: 'Europe/London',   label: 'Europe/London (GMT/BST)' },
              { value: 'America/New_York', label: 'America/New_York (ET)' },
            ]}
          />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="ghost" onClick={onClose}>{t('planning.form.cancel')}</Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!isValid}
          >
            {t('planning.form.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Schedules panel ──────────────────────────────────────────────────────────

function SchedulesPanel({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['planning-schedules', tenantId],
    queryFn:  planningApi.listSchedules,
  });

  const FREQ_LABEL: Record<Frequency, string> = {
    DAILY:   t('planning.schedule.daily'),
    WEEKLY:  t('planning.schedule.weekly'),
    MONTHLY: t('planning.schedule.monthly'),
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="h-6 w-6 animate-spin rounded-full border-4 border-brand-medium border-t-transparent" />
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
        <Repeat className="mb-2 h-8 w-8" />
        <p className="text-sm">{t('controls.empty.schedules.title')}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {schedules.map((sc) => (
        <div key={sc.id} className="flex items-center justify-between gap-3 py-3 px-1">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{sc.templateName}</p>
            {sc.zoneName && (
              <p className="text-xs text-gray-500">{sc.zoneName}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {FREQ_LABEL[sc.frequency]}
            </span>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              sc.isActive
                ? 'bg-green-50 text-green-700'
                : 'bg-gray-100 text-gray-500',
            )}>
              {sc.isActive ? t('controls.schedule.scheduleActive') : t('controls.schedule.scheduleInactive')}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const { t }      = useTranslation();
  const tenantId   = useTenantId();
  const user       = useAuthStore((s) => s.user);
  const role       = user?.role;

  const canCreate  = role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN';
  const isOperator = role === 'OPERATOR';

  // ── Filters ────────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [fromDate,     setFromDate]     = useState<string>('');
  const [toDate,       setToDate]       = useState<string>('');
  const [showFilters,  setShowFilters]  = useState(false);
  const [showSchedules, setShowSchedules] = useState(false);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [showCreateTask,     setShowCreateTask]     = useState(false);
  const [showCreateSchedule, setShowCreateSchedule] = useState(false);

  // ── Query: tasks ───────────────────────────────────────────────────────────
  const qc = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: [
      'planning-tasks', tenantId,
      statusFilter, fromDate, toDate,
      isOperator ? user?.sub : null,
    ],
    queryFn: () => planningApi.listTasks({
      page:       1,
      limit:      50,
      status:     statusFilter || undefined,
      from:       fromDate    || undefined,
      to:         toDate      || undefined,
      assigneeId: isOperator && user ? user.sub : undefined,
    }),
    enabled: tenantId !== '',
  });

  // ── Derived stats ──────────────────────────────────────────────────────────
  // We compute stats locally from the fetched tasks when no dedicated stats endpoint exists.
  const allTasks: ControlTask[] = tasksQuery.data?.data ?? [];
  const todayStr = getToday();
  const weekStartStr = getWeekStart();

  const stats: PlanningStats = {
    todayTotal:    allTasks.filter((t) => t.scheduledAt.startsWith(todayStr)).length,
    overdue:       allTasks.filter((t) => t.status === 'OVERDUE').length,
    completedWeek: allTasks.filter(
      (t) => t.status === 'COMPLETED' && t.scheduledAt >= weekStartStr,
    ).length,
    complianceRate: allTasks.length > 0
      ? Math.round(
          (allTasks.filter((t) => t.status === 'COMPLETED').length / allTasks.length) * 100,
        )
      : 0,
  };

  const STATUS_FILTER_OPTIONS = [
    { value: '',            label: t('planning.filters.all') },
    { value: 'PLANNED',     label: t('planning.filters.planned') },
    { value: 'IN_PROGRESS', label: t('planning.filters.inProgress') },
    { value: 'OVERDUE',     label: t('planning.filters.overdue') },
    { value: 'COMPLETED',   label: t('planning.filters.completed') },
  ];

  return (
    <PageWrapper>
      <Header
        title={t('planning.title')}
        subtitle={t('planning.subtitle')}
        extra={
          canCreate ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowCreateSchedule(true)}>
                <Repeat className="mr-1 h-4 w-4" />
                {t('planning.createSchedule')}
              </Button>
              <Button size="sm" onClick={() => setShowCreateTask(true)}>
                <Plus className="mr-1 h-4 w-4" />
                {t('planning.createTask')}
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Stats bar */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={t('planning.stats.today')}
          value={stats.todayTotal}
          icon={CalendarCheck2}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label={t('planning.stats.overdue')}
          value={stats.overdue}
          icon={AlertCircle}
          color="bg-red-50 text-red-600"
        />
        <StatCard
          label={t('planning.stats.completedWeek')}
          value={stats.completedWeek}
          icon={CheckCircle2}
          color="bg-green-50 text-green-600"
        />
        <StatCard
          label={t('planning.stats.compliance')}
          value={stats.complianceRate}
          icon={Percent}
          color="bg-purple-50 text-purple-600"
          suffix="%"
        />
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter((e as React.ChangeEvent<HTMLSelectElement>).target.value)}
          options={STATUS_FILTER_OPTIONS}
        />

        <button
          onClick={() => setShowFilters((f) => !f)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
            showFilters
              ? 'border-brand-medium bg-brand-medium/10 text-brand-dark'
              : 'border-gray-300 text-gray-600 hover:border-gray-400',
          )}
        >
          <Filter className="h-4 w-4" />
          {t('common.filter')}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showFilters && 'rotate-180')} />
        </button>

        <button
          onClick={() => void qc.invalidateQueries({ queryKey: ['planning-tasks', tenantId] })}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:border-gray-400"
          title={t('common.retry')}
        >
          <RefreshCw className="h-4 w-4" />
        </button>

        {canCreate && (
          <button
            onClick={() => setShowSchedules((s) => !s)}
            className={cn(
              'ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
              showSchedules
                ? 'border-brand-medium bg-brand-medium/10 text-brand-dark'
                : 'border-gray-300 text-gray-600 hover:border-gray-400',
            )}
          >
            <Repeat className="h-4 w-4" />
            {t('planning.createSchedule')}
          </button>
        )}
      </div>

      {/* Date range filters (collapsible) */}
      {showFilters && (
        <div className="mb-4 flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">{t('common.from')}</label>
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">{t('common.to')}</label>
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600"
            >
              <X className="h-4 w-4" />
              {t('common.reset')}
            </button>
          )}
        </div>
      )}

      {/* Schedules side panel */}
      {showSchedules && canCreate && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            {t('planning.schedule.title')}
          </h3>
          <SchedulesPanel tenantId={tenantId} />
        </div>
      )}

      {/* Tasks list */}
      {tasksQuery.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-medium border-t-transparent" />
        </div>
      ) : tasksQuery.isError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-red-200 bg-red-50 py-12 text-center">
          <AlertCircle className="mb-2 h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-red-700">{t('common.error')}</p>
          <button
            onClick={() => void tasksQuery.refetch()}
            className="mt-3 text-sm text-red-600 underline hover:text-red-800"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : allTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            <CalendarCheck2 className="h-8 w-8 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">{t('planning.noTasks')}</h3>
          <p className="mt-1 max-w-xs text-sm text-gray-500">{t('planning.noTasksDesc')}</p>
          {canCreate && (
            <Button className="mt-6" size="sm" onClick={() => setShowCreateTask(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t('planning.createTask')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {allTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Modals */}
      <CreateTaskModal
        open={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        tenantId={tenantId}
      />
      <CreateScheduleModal
        open={showCreateSchedule}
        onClose={() => setShowCreateSchedule(false)}
        tenantId={tenantId}
      />
    </PageWrapper>
  );
}
