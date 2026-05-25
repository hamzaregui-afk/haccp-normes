/**
 * ScheduleFormModal — create a recurring ControlSchedule.
 *
 * Covers all five frequencies (DAILY / WEEKLY / MONTHLY / YEARLY / CUSTOM)
 * with a live preview of the next 5 occurrences computed client-side so the
 * user can verify the pattern before saving.
 */

import { Controller, useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, Plus, RefreshCw, Repeat, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button }   from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Input }    from '@/components/ui/Input';
import { Modal }    from '@/components/ui/Modal';
import { Select }   from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { useTenantId } from '@/hooks/useTenantId';
import { api }      from '@/lib/api';
import type { ControlTemplate, ScheduleFrequency, IntervalUnit } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ZoneRaw  { id: string; name: string }
interface SiteRaw  { id: string; name: string; zones: ZoneRaw[] }
interface UserRaw  { id: string; name: string; email: string }
interface GroupRaw { id: string; name: string }

interface FormValues {
  templateId:   string;
  zoneId:       string;
  assigneeType: 'user' | 'group';
  assigneeId:   string;
  groupId:      string;
  frequency:    ScheduleFrequency;
  interval:     number;
  intervalUnit: IntervalUnit;
  startDate:    string;
  endDate:      string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// French labels — Mon = 1, Tue = 2 … Sun = 0
const DAYS_FR = [
  { dow: 1, short: 'L' },
  { dow: 2, short: 'M' },
  { dow: 3, short: 'M' },
  { dow: 4, short: 'J' },
  { dow: 5, short: 'V' },
  { dow: 6, short: 'S' },
  { dow: 0, short: 'D' },
];

// ─── Local preview computation ─────────────────────────────────────────────────

function applySlot(date: Date, slot: string): Date {
  const [h, m] = slot.split(':').map(Number) as [number, number];
  const d = new Date(date);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

function computePreview(
  frequency:   ScheduleFrequency,
  interval:    number,
  daysOfWeek:  number[],
  daysOfMonth: number[],
  timeSlots:   string[],
  intervalUnit: IntervalUnit,
  startDate:   string,
  count = 5,
): string[] {
  if (!startDate) return [];
  const slots = timeSlots.filter(Boolean);
  const isHours = frequency === 'CUSTOM' && intervalUnit === 'HOURS';
  if (!isHours && !slots.length) return [];

  const start = new Date(startDate);
  const now   = new Date();
  const from  = start > now ? new Date(start) : new Date(now);
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() + 2);
  const results: string[] = [];

  const push = (d: Date) => {
    if (results.length < count) results.push(d.toISOString());
  };

  if (frequency === 'DAILY') {
    const cursor = new Date(start);
    cursor.setUTCHours(0, 0, 0, 0);
    const fromDay = new Date(from); fromDay.setUTCHours(0, 0, 0, 0);
    while (cursor < fromDay) cursor.setUTCDate(cursor.getUTCDate() + interval);
    while (results.length < count && cursor < cutoff) {
      for (const slot of slots) {
        const occ = applySlot(cursor, slot);
        if (occ >= from) push(occ);
      }
      cursor.setUTCDate(cursor.getUTCDate() + interval);
    }
  }

  if (frequency === 'WEEKLY' && daysOfWeek.length) {
    const startDay = new Date(start); startDay.setUTCHours(0, 0, 0, 0);
    const anchor   = new Date(startDay);
    anchor.setUTCDate(anchor.getUTCDate() - anchor.getUTCDay());
    const cursor = new Date(anchor);
    while (results.length < count && cursor < cutoff) {
      const diff = Math.round((cursor.getTime() - anchor.getTime()) / (7 * 86_400_000));
      if (diff % interval === 0) {
        const batch: Date[] = [];
        for (const dow of daysOfWeek) {
          const day = new Date(cursor);
          day.setUTCDate(day.getUTCDate() + dow);
          for (const slot of slots) {
            const occ = applySlot(day, slot);
            if (occ >= from && occ >= start) batch.push(occ);
          }
        }
        batch.sort((a, b) => a.getTime() - b.getTime()).forEach(push);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  if (frequency === 'MONTHLY' && daysOfMonth.length) {
    let yr = start.getUTCFullYear(), mon = start.getUTCMonth();
    while (results.length < count && new Date(Date.UTC(yr, mon, 1)) < cutoff) {
      const daysInMon = new Date(Date.UTC(yr, mon + 1, 0)).getUTCDate();
      for (const dom of [...daysOfMonth].sort((a, b) => a - b)) {
        const day = new Date(Date.UTC(yr, mon, Math.min(dom, daysInMon)));
        for (const slot of slots) {
          const occ = applySlot(day, slot);
          if (occ >= from && occ >= start) push(occ);
        }
      }
      mon += interval;
      if (mon > 11) { yr += Math.floor(mon / 12); mon = mon % 12; }
    }
  }

  if (frequency === 'CUSTOM') {
    if (isHours) {
      const ms = interval * 3_600_000;
      const elapsed = from.getTime() - start.getTime();
      const periods = Math.max(0, Math.ceil(elapsed / ms));
      const cursor  = new Date(start.getTime() + periods * ms);
      while (results.length < count && cursor < cutoff) {
        if (cursor >= from) push(new Date(cursor));
        cursor.setTime(cursor.getTime() + ms);
      }
    } else {
      const ms = intervalUnit === 'WEEKS' ? interval * 7 * 86_400_000 : interval * 86_400_000;
      const cursor = new Date(start); cursor.setUTCHours(0, 0, 0, 0);
      const fromDay = new Date(from); fromDay.setUTCHours(0, 0, 0, 0);
      while (cursor < fromDay) cursor.setTime(cursor.getTime() + ms);
      while (results.length < count && cursor < cutoff) {
        for (const slot of slots) {
          const occ = applySlot(cursor, slot);
          if (occ >= from) push(occ);
        }
        cursor.setTime(cursor.getTime() + ms);
      }
    }
  }

  return results;
}

function formatPreviewDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Time slot manager ────────────────────────────────────────────────────────

function TimeSlotManager({
  slots,
  onChange,
}: {
  slots:    string[];
  onChange: (s: string[]) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) && !slots.includes(v)) {
      onChange([...slots, v].sort());
      setDraft('');
    }
  };

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {t('controls.schedule.timeSlots')} <span className="text-red-500">*</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {slots.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full border border-brand-medium bg-brand-light px-3 py-0.5 text-sm font-medium text-brand-dark"
          >
            <Clock className="h-3 w-3" />
            {s}
            <button
              type="button"
              onClick={() => onChange(slots.filter((x) => x !== s))}
              className="ml-1 text-brand-medium hover:text-red-500"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            type="time"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            className="h-7 rounded border border-surface-muted bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-medium"
          />
          <button
            type="button"
            onClick={add}
            className="flex h-7 w-7 items-center justify-center rounded border border-brand-medium bg-white text-brand-medium hover:bg-brand-light"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {slots.length === 0 && (
        <p className="mt-1 text-xs text-red-500">{t('controls.schedule.timeSlotsRequired')}</p>
      )}
    </div>
  );
}

// ─── Day-of-week toggle ───────────────────────────────────────────────────────

function DayOfWeekPicker({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (d: number[]) => void;
}) {
  const { t } = useTranslation();
  const toggle = (dow: number) => {
    onChange(
      selected.includes(dow) ? selected.filter((d) => d !== dow) : [...selected, dow],
    );
  };
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {t('controls.schedule.daysOfWeek')} <span className="text-red-500">*</span>
      </label>
      <div className="flex gap-1.5">
        {DAYS_FR.map(({ dow, short }) => (
          <button
            key={dow}
            type="button"
            onClick={() => toggle(dow)}
            className={[
              'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
              selected.includes(dow)
                ? 'bg-brand-medium text-white'
                : 'border border-surface-muted bg-white text-gray-600 hover:border-brand-medium hover:text-brand-medium',
            ].join(' ')}
          >
            {short}
          </button>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="mt-1 text-xs text-red-500">{t('controls.schedule.daysOfWeekRequired')}</p>
      )}
    </div>
  );
}

// ─── Day-of-month chips ───────────────────────────────────────────────────────

function DayOfMonthPicker({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (d: number[]) => void;
}) {
  const { t } = useTranslation();
  const toggle = (d: number) => {
    onChange(selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d].sort((a, b) => a - b));
  };
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {t('controls.schedule.daysOfMonth')} <span className="text-red-500">*</span>
      </label>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            className={[
              'flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors',
              selected.includes(d)
                ? 'bg-brand-medium text-white'
                : 'border border-surface-muted bg-white text-gray-600 hover:border-brand-medium',
            ].join(' ')}
          >
            {d}
          </button>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="mt-1 text-xs text-red-500">{t('controls.schedule.daysOfMonthRequired')}</p>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface ScheduleFormModalProps {
  open:    boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function ScheduleFormModal({ open, onClose, onCreated }: ScheduleFormModalProps) {
  const { t, i18n } = useTranslation();
  const tenantId    = useTenantId();
  const queryClient = useQueryClient();

  // Array state not managed by react-hook-form (easier for dynamic lists)
  const [timeSlots,   setTimeSlots]   = useState<string[]>(['08:00']);
  const [daysOfWeek,  setDaysOfWeek]  = useState<number[]>([1]); // Monday
  const [daysOfMonth, setDaysOfMonth] = useState<number[]>([1]);

  const { register, handleSubmit, control, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      frequency:    'DAILY',
      interval:     1,
      intervalUnit: 'HOURS',
      assigneeType: 'user',
    },
  });

  const frequency    = useWatch({ control, name: 'frequency'    });
  const interval     = useWatch({ control, name: 'interval'     });
  const intervalUnit = useWatch({ control, name: 'intervalUnit' });
  const startDate    = useWatch({ control, name: 'startDate'    });

  const freqTabs = useMemo<{ value: ScheduleFrequency; label: string }[]>(() => [
    { value: 'DAILY',   label: t('controls.frequency.DAILY') },
    { value: 'WEEKLY',  label: t('controls.frequency.WEEKLY') },
    { value: 'MONTHLY', label: t('controls.frequency.MONTHLY') },
    { value: 'CUSTOM',  label: t('controls.frequency.CUSTOM') },
  ], [t]);

  const intervalUnitOptions = useMemo(() => [
    { value: 'HOURS', label: t('controls.schedule.hours', 'heures') },
    { value: 'DAYS',  label: t('controls.schedule.days') },
    { value: 'WEEKS', label: t('controls.schedule.weeks') },
  ], [t]);

  // ── Data lookups ──────────────────────────────────────────────────────────
  const { data: templatesRaw, isLoading: templatesLoading } = useQuery({
    queryKey: ['controls.templates.all', tenantId],
    queryFn: async () => {
      const { data } = await api.get<{ data: ControlTemplate[] }>('/api/v1/controls/templates?page=1&limit=100');
      return data.data ?? [];
    },
    staleTime: 0,
    enabled: open,
  });

  const { data: sitesRaw, isLoading: zonesLoading } = useQuery({
    queryKey: ['sites.all.live', tenantId],
    queryFn: async () => {
      const { data } = await api.get<{ data: SiteRaw[] }>('/api/v1/sites');
      return data.data ?? [];
    },
    staleTime: 0,
    enabled: open,
  });

  const { data: usersRaw } = useQuery({
    queryKey: ['users.all', tenantId],
    queryFn: async () => {
      try {
        const { data } = await api.get<{ data: UserRaw[] }>('/api/v1/users?page=1&limit=100');
        return data.data ?? [];
      } catch { return [] as UserRaw[]; }
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
    retry: false,
  });

  const { data: groupsRaw } = useQuery({
    queryKey: ['groups.all', tenantId],
    queryFn: async () => {
      try {
        const { data } = await api.get<{ data: GroupRaw[] }>('/api/v1/groups?page=1&limit=100');
        return data.data ?? [];
      } catch { return [] as GroupRaw[]; }
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
    retry: false,
  });

  const templateOptions = useMemo(
    () => (templatesRaw ?? []).map((t) => ({ value: t.id, label: t.name })),
    [templatesRaw],
  );

  const zoneOptions = useMemo(() => {
    const opts: { value: string; label: string; sublabel: string }[] = [];
    for (const site of (sitesRaw ?? [])) {
      for (const zone of site.zones ?? []) {
        opts.push({ value: zone.id, label: zone.name, sublabel: site.name });
      }
    }
    return opts;
  }, [sitesRaw]);

  const userOptions  = useMemo(() => (usersRaw ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })), [usersRaw]);
  const groupOptions = useMemo(() => (groupsRaw ?? []).map((g) => ({ value: g.id, label: g.name })), [groupsRaw]);

  const assigneeType = useWatch({ control, name: 'assigneeType' });

  // ── Live preview ──────────────────────────────────────────────────────────
  const preview = useMemo(
    () =>
      computePreview(
        frequency,
        Number(interval) || 1,
        daysOfWeek,
        daysOfMonth,
        timeSlots,
        intervalUnit,
        startDate,
      ),
    [frequency, interval, daysOfWeek, daysOfMonth, timeSlots, intervalUnit, startDate],
  );

  // ── Submit ────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/api/v1/controls/schedules', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['controls.schedules', tenantId] });
      showToast({ title: t('controls.toast.scheduleCreated'), variant: 'success' });
      onCreated?.();
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast({ title: t('controls.toast.scheduleCreateError'), body: msg ?? t('controls.toast.scheduleCreateErrorBody'), variant: 'error' });
    },
  });

  const onSubmit = (v: FormValues) => {
    const recurrence: Record<string, unknown> = {
      interval:            Number(v.interval) || 1,
      timeSlots:           frequency === 'CUSTOM' && intervalUnit === 'HOURS' ? ['00:00'] : timeSlots,
      advanceGenerateDays: 7,
    };
    if (frequency === 'WEEKLY')  recurrence.daysOfWeek  = daysOfWeek;
    if (frequency === 'MONTHLY') recurrence.daysOfMonth = daysOfMonth;
    if (frequency === 'CUSTOM')  recurrence.intervalUnit = v.intervalUnit;

    createMutation.mutate({
      templateId:  v.templateId,
      zoneId:      v.zoneId,
      frequency:   v.frequency,
      recurrence,
      timezone:    'UTC',
      startDate:   new Date(v.startDate).toISOString(),
      ...(v.endDate ? { endDate: new Date(v.endDate).toISOString() } : {}),
      ...(v.assigneeType === 'user'  && v.assigneeId ? { assigneeId: v.assigneeId } : {}),
      ...(v.assigneeType === 'group' && v.groupId    ? { groupId:    v.groupId    } : {}),
    });
  };

  const isHours = frequency === 'CUSTOM' && intervalUnit === 'HOURS';

  return (
    <Modal open={open} onClose={onClose} title={t('controls.schedule.title')} size="lg">
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        <div className="max-h-[70vh] overflow-y-auto space-y-5 pr-1">

          {/* ── Modèle + Zone ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="templateId"
              control={control}
              rules={{ required: t('controls.schedule.modelRequired') }}
              render={({ field }) => (
                <Combobox
                  label={t('controls.schedule.templateLabel')}
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
            <Controller
              name="zoneId"
              control={control}
              rules={{ required: t('controls.schedule.zoneRequired') }}
              render={({ field }) => (
                <Combobox
                  label={t('controls.schedule.zoneLabel')}
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
          </div>

          {/* ── Assignation ────────────────────────────────────────────── */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">{t('controls.schedule.assignTo')}</p>
            <div className="flex gap-4 mb-2">
              {(['user', 'group'] as const).map((assignType) => {
                const enabled = assignType === 'user' ? userOptions.length > 0 : groupOptions.length > 0;
                return (
                  <label key={assignType} className={`flex cursor-pointer items-center gap-2 ${!enabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <input type="radio" value={assignType} disabled={!enabled} {...register('assigneeType')} className="accent-brand-medium" />
                    <span className="text-sm text-gray-700">{assignType === 'user' ? t('controls.schedule.userRadio') : t('controls.schedule.groupRadio')}</span>
                  </label>
                );
              })}
            </div>
            {assigneeType === 'user' ? (
              <Select placeholder={t('controls.schedule.userPlaceholder')} options={userOptions} {...register('assigneeId')} />
            ) : (
              <Select placeholder={t('controls.schedule.groupPlaceholder')} options={groupOptions} {...register('groupId')} />
            )}
          </div>

          {/* ── Fréquence ──────────────────────────────────────────────── */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">
              <Repeat className="mr-1.5 inline h-3.5 w-3.5 text-brand-medium" />
              {t('controls.schedule.frequencyLabel')}
            </p>
            {/* Frequency tabs */}
            <div className="flex rounded-lg border border-surface-muted bg-surface-page p-0.5">
              {freqTabs.map(({ value, label }) => (
                <label key={value} className="flex-1 cursor-pointer text-center">
                  <input type="radio" value={value} {...register('frequency')} className="sr-only" />
                  <span
                    className={[
                      'block rounded-md py-1.5 text-xs font-medium transition-colors',
                      frequency === value
                        ? 'bg-white text-brand-dark shadow-sm'
                        : 'text-gray-500 hover:text-gray-700',
                    ].join(' ')}
                  >
                    {label}
                  </span>
                </label>
              ))}
            </div>

            {/* Frequency-specific options */}
            <div className="mt-3 space-y-3">
              {/* Interval row */}
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span>{t('controls.schedule.interval')}</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  {...register('interval', { min: 1, valueAsNumber: true })}
                  className="h-8 w-16 rounded-lg border border-surface-muted px-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
                />
                {frequency === 'DAILY'   && <span>{t('controls.schedule.days')}</span>}
                {frequency === 'WEEKLY'  && <span>{t('controls.schedule.weeks')}</span>}
                {frequency === 'MONTHLY' && <span>{t('controls.schedule.months')}</span>}
                {frequency === 'CUSTOM'  && (
                  <select
                    {...register('intervalUnit')}
                    className="h-8 rounded-lg border border-surface-muted bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  >
                    {intervalUnitOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Weekly: day-of-week picker */}
              {frequency === 'WEEKLY' && (
                <DayOfWeekPicker selected={daysOfWeek} onChange={setDaysOfWeek} />
              )}

              {/* Monthly: day-of-month picker */}
              {frequency === 'MONTHLY' && (
                <DayOfMonthPicker selected={daysOfMonth} onChange={setDaysOfMonth} />
              )}
            </div>
          </div>

          {/* ── Time slots (hidden for CUSTOM/HOURS) ───────────────────── */}
          {!isHours && (
            <TimeSlotManager slots={timeSlots} onChange={setTimeSlots} />
          )}
          {isHours && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <Clock className="mr-1 inline h-3 w-3" />
              {t('controls.schedule.hourlyInfo', { count: Number(interval) || 1 })}
            </div>
          )}

          {/* ── Période ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('controls.schedule.startDate')}
              type="datetime-local"
              required
              {...register('startDate', { required: t('controls.schedule.startDateRequired') })}
              error={errors.startDate?.message}
            />
            <Input
              label={t('controls.schedule.endDate')}
              type="datetime-local"
              {...register('endDate')}
            />
          </div>

          {/* ── Live preview ───────────────────────────────────────────── */}
          {preview.length > 0 && (
            <div className="rounded-xl border border-brand-medium/30 bg-brand-light px-4 py-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-dark">
                <Calendar className="h-3.5 w-3.5" />
                {t('controls.schedule.previewTitle')}
              </p>
              <ul className="space-y-1">
                {preview.map((iso) => (
                  <li key={iso} className="flex items-center gap-2 text-sm text-brand-dark">
                    <RefreshCw className="h-3 w-3 text-brand-medium shrink-0" />
                    {formatPreviewDate(iso, i18n.language)}
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>{/* end scrollable */}

        {/* Footer */}
        <div className="mt-5 flex justify-end gap-3 border-t border-surface-muted pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('controls.checklist.cancel')}
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            {t('controls.actions.createScheduleBtn')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
