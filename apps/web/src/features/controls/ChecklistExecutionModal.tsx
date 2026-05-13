import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Hash,
  Thermometer,
  ToggleLeft,
  Type,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse } from '@haccp/shared-types';
import type {
  ChecklistItem,
  ControlTaskDetail,
  TaskResult,
  TaskResultItem,
} from './types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is ChecklistItem =>
    item !== null &&
    typeof item === 'object' &&
    typeof (item as Record<string, unknown>).id === 'string' &&
    typeof (item as Record<string, unknown>).label === 'string',
  );
}

function isItemCompliant(
  item: ChecklistItem,
  value: boolean | number | string | null | undefined,
): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (item.type === 'BOOLEAN' || item.type === 'TEXT') return true;
  const n = Number(value);
  if (isNaN(n)) return false;
  if (item.min !== undefined && n < item.min) return false;
  if (item.max !== undefined && n > item.max) return false;
  return true;
}

// ─── Item input types ──────────────────────────────────────────────────────────

const TYPE_ICONS: Record<ChecklistItem['type'], React.ElementType> = {
  BOOLEAN:     ToggleLeft,
  NUMBER:      Hash,
  TEMPERATURE: Thermometer,
  TEXT:        Type,
};

type ItemValue = boolean | number | string | null;
type ValuesMap = Record<string, ItemValue>;

// ─── Read-only results view ────────────────────────────────────────────────────

function ResultsView({ result }: { result: TaskResult }) {
  const completedAt = new Date(result.submittedAt).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-800">Contrôle complété</p>
          <p className="text-xs text-green-600">{completedAt}</p>
        </div>
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
            <><XCircle className="h-3 w-3" />Non conforme</>
          )}
        </span>
      </div>

      {/* Items table */}
      <div className="overflow-hidden rounded-xl border border-surface-muted">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-4 py-2.5">Point de contrôle</th>
              <th className="px-4 py-2.5">Valeur</th>
              <th className="px-4 py-2.5">Conformité</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-muted">
            {result.items.map((item) => {
              const displayValue =
                item.value === null || item.value === undefined
                  ? '—'
                  : item.type === 'BOOLEAN'
                    ? (item.value ? 'Oui / Conforme' : 'Non / Non conforme')
                    : item.type === 'TEMPERATURE'
                      ? `${String(item.value)} °C`
                      : item.unit
                        ? `${String(item.value)} ${item.unit}`
                        : String(item.value);

              return (
                <tr key={item.id} className="hover:bg-surface-page transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {item.label}
                    {item.required && <span className="ml-1 text-red-500">*</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{displayValue}</td>
                  <td className="px-4 py-3">
                    {item.compliant ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />Conforme
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                        <XCircle className="h-3.5 w-3.5" />Non conforme
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      {result.notes && (
        <div className="rounded-lg border border-surface-muted bg-surface-page px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</p>
          <p className="text-sm text-gray-700">{result.notes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Checklist item input ──────────────────────────────────────────────────────

function ChecklistItemInput({
  item,
  value,
  onChange,
}: {
  item:     ChecklistItem;
  value:    ItemValue;
  onChange: (val: ItemValue) => void;
}) {
  const Icon = TYPE_ICONS[item.type];
  const compliant  = isItemCompliant(item, value);
  const hasValue   = value !== null && value !== undefined && value !== '';
  const isOutOfRange = hasValue && !compliant && (item.type === 'NUMBER' || item.type === 'TEMPERATURE');

  return (
    <div className="rounded-xl border border-surface-muted bg-white p-4">
      {/* Label row */}
      <div className="mb-3 flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-medium" />
        <p className="text-sm font-medium text-gray-900">
          {item.label}
          {item.required && <span className="ml-1 text-red-500">*</span>}
        </p>
      </div>

      {/* Input */}
      {item.type === 'BOOLEAN' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={[
              'flex flex-1 items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-all',
              value === true
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-surface-muted bg-white text-gray-600 hover:border-green-300 hover:bg-green-50/50',
            ].join(' ')}
          >
            <CheckCircle2 className="h-4 w-4" />
            Oui / Conforme
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={[
              'flex flex-1 items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-all',
              value === false
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-surface-muted bg-white text-gray-600 hover:border-red-300 hover:bg-red-50/50',
            ].join(' ')}
          >
            <XCircle className="h-4 w-4" />
            Non / Non conforme
          </button>
        </div>
      )}

      {(item.type === 'NUMBER' || item.type === 'TEMPERATURE') && (
        <div>
          <div className="relative">
            <input
              type="number"
              value={value === null || value === undefined ? '' : String(value)}
              onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
              step="0.1"
              className={[
                'h-10 w-full rounded-lg border px-3 pr-12 text-sm transition-colors focus:outline-none focus:ring-2',
                isOutOfRange
                  ? 'border-red-300 bg-red-50 focus:ring-red-400'
                  : hasValue && compliant
                    ? 'border-green-300 bg-green-50 focus:ring-green-400'
                    : 'border-surface-muted focus:ring-brand-medium',
              ].join(' ')}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500">
              {item.type === 'TEMPERATURE' ? '°C' : (item.unit ?? '')}
            </span>
          </div>
          {/* Range hint + conformity feedback */}
          <div className="mt-1.5 flex items-center justify-between">
            {(item.min !== undefined || item.max !== undefined) && (
              <p className="text-xs text-gray-500">
                Plage valide :{' '}
                {item.min !== undefined ? `min ${item.min}` : ''}
                {item.min !== undefined && item.max !== undefined ? ' | ' : ''}
                {item.max !== undefined ? `max ${item.max}` : ''}
                {item.type === 'TEMPERATURE' ? ' °C' : item.unit ? ` ${item.unit}` : ''}
              </p>
            )}
            {hasValue && (
              <span
                className={[
                  'ml-auto inline-flex items-center gap-1 text-xs font-medium',
                  compliant ? 'text-green-600' : 'text-red-600',
                ].join(' ')}
              >
                {compliant ? (
                  <><CheckCircle2 className="h-3 w-3" />Conforme</>
                ) : (
                  <><AlertTriangle className="h-3 w-3" />Hors plage</>
                )}
              </span>
            )}
          </div>
        </div>
      )}

      {item.type === 'TEXT' && (
        <textarea
          rows={2}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Saisir une observation…"
          className="w-full resize-none rounded-lg border border-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
        />
      )}
    </div>
  );
}

// ─── Success overlay ───────────────────────────────────────────────────────────

function SuccessOverlay() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>
      <p className="mt-4 text-lg font-semibold text-green-800">Contrôle validé</p>
      <p className="mt-1 text-sm text-green-600">Les résultats ont été enregistrés avec succès.</p>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface ChecklistExecutionModalProps {
  taskId:      string | null;
  zoneMap:     Record<string, string>;
  onClose:     () => void;
  onCompleted: () => void;
}

export function ChecklistExecutionModal({
  taskId,
  zoneMap,
  onClose,
  onCompleted,
}: ChecklistExecutionModalProps) {
  const currentUser  = useAuthStore((s) => s.user);
  const queryClient  = useQueryClient();

  const [values, setValues]   = useState<ValuesMap>({});
  const [notes, setNotes]     = useState('');
  const [success, setSuccess] = useState(false);

  // Ref for the auto-close timer so it can be cleared on unmount or taskId change
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset local state when task changes; also cancel any pending close timer
  useEffect(() => {
    setValues({});
    setNotes('');
    setSuccess(false);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [taskId]);

  // Fetch full task detail (includes checklistJson)
  const { data: taskDetail, isLoading } = useQuery({
    queryKey: ['controls.tasks.detail', taskId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<ControlTaskDetail>>(
        `/api/v1/controls/tasks/${taskId!}`,
      );
      return data.data;
    },
    enabled: taskId !== null,
    staleTime: 0,
  });

  // Auto-transition PLANNED / OVERDUE → IN_PROGRESS
  const startMutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/controls/tasks/${taskId}`, {
        status:    'IN_PROGRESS',
        startedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['controls.tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['controls.stats'] });
    },
    onError: () => {
      // Non-blocking: the operator can still fill the checklist even if
      // the IN_PROGRESS transition fails (e.g. already IN_PROGRESS on another device).
      // The COMPLETED submit will enforce the correct final state.
      showToast({
        title:   'Attention',
        body:    'Impossible de démarrer la tâche automatiquement. Vous pouvez continuer à remplir la checklist.',
        variant: 'warning',
      });
    },
  });

  useEffect(() => {
    if (
      taskDetail &&
      (taskDetail.status === 'PLANNED' || taskDetail.status === 'OVERDUE')
    ) {
      void startMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskDetail?.id, taskDetail?.status]);

  // Submit completed checklist
  const completeMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/v1/controls/tasks/${taskId}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['controls.tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['controls.stats'] });
      setSuccess(true);
      closeTimerRef.current = setTimeout(() => {
        onCompleted();
      }, 1500);
    },
    onError: () => showToast({ title: 'Erreur lors de la validation', variant: 'error' }),
  });

  const isOpen = taskId !== null;
  // ARCH-DECISION: Prefer the frozen checklistSnapshot (stored at task creation time)
  // over the live template checklistJson. This ensures operators fill the same
  // checklist that was intended when the task was planned, even if the template
  // was updated since. Falls back to template.checklistJson for tasks created
  // before this migration (legacy compatibility).
  const checklist  = parseChecklist(
    taskDetail?.checklistSnapshot ?? taskDetail?.template?.checklistJson
  );
  const isReadOnly = taskDetail?.status === 'COMPLETED';
  const existingResult =
    isReadOnly && taskDetail?.resultJson
      ? (taskDetail.resultJson as TaskResult)
      : null;

  // Validation: all required items must have a non-null value
  const requiredFulfilled = checklist
    .filter((item) => item.required)
    .every((item) => {
      const v = values[item.id];
      return v !== null && v !== undefined && v !== '';
    });

  const handleItemChange = (id: string, val: ItemValue) => {
    setValues((prev) => ({ ...prev, [id]: val }));
  };

  const handleSubmit = () => {
    if (!currentUser || !taskId) return;

    const items: TaskResultItem[] = checklist.map((item) => ({
      id:        item.id,
      label:     item.label,
      type:      item.type,
      value:     values[item.id] ?? null,
      unit:      item.unit,
      min:       item.min,
      max:       item.max,
      compliant: isItemCompliant(item, values[item.id]),
      required:  item.required,
    }));

    const overallCompliant = items
      .filter((i) => i.required)
      .every((i) => i.compliant);

    const resultJson: TaskResult = {
      submittedAt:      new Date().toISOString(),
      submittedBy:      currentUser.sub,
      overallCompliant,
      notes:            notes.trim() || undefined,
      items,
    };

    void completeMutation.mutateAsync({
      status:      'COMPLETED',
      completedAt: new Date().toISOString(),
      notes:       notes.trim() || undefined,
      resultJson,
    });
  };

  const zoneName = taskDetail ? (zoneMap[taskDetail.zoneId] ?? taskDetail.zoneId) : '';

  const modalTitle = taskDetail
    ? `${taskDetail.template?.name ?? 'Contrôle'} — ${zoneName}`
    : 'Exécution du contrôle';

  return (
    <Modal
      open={isOpen}
      onClose={success ? () => { onCompleted(); } : onClose}
      title={modalTitle}
      size="lg"
    >
      {isLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">Chargement de la checklist…</div>
      ) : success ? (
        <SuccessOverlay />
      ) : isReadOnly && existingResult ? (
        <ResultsView result={existingResult} />
      ) : checklist.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-amber-400" />
          <p className="text-sm font-medium text-gray-700">Aucun point de contrôle défini</p>
          <p className="mt-1 text-xs text-gray-500">
            Ce modèle ne contient pas encore d'items. Contactez un responsable.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Checklist items */}
          {checklist.map((item) => (
            <ChecklistItemInput
              key={item.id}
              item={item}
              value={values[item.id] ?? null}
              onChange={(val) => handleItemChange(item.id, val)}
            />
          ))}

          {/* Notes field */}
          <div className="rounded-xl border border-surface-muted bg-white p-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Notes (optionnel)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observations complémentaires, actions correctives…"
              className="w-full resize-none rounded-lg border border-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 border-t border-surface-muted pt-3">
            <Button variant="secondary" onClick={onClose} disabled={completeMutation.isPending}>
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              loading={completeMutation.isPending}
              disabled={!requiredFulfilled || completeMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              Valider le contrôle
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
