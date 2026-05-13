import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Camera,
  Calendar,
  CheckCircle2,
  Hash,
  List,
  Pen,
  Thermometer,
  ToggleLeft,
  Trash2,
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

// ─── Constants ──────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<ChecklistItem['type'], React.ElementType> = {
  BOOLEAN:     ToggleLeft,
  NUMBER:      Hash,
  TEMPERATURE: Thermometer,
  TEXT:        Type,
  PHOTO:       Camera,
  SIGNATURE:   Pen,
  DATE:        Calendar,
  SELECT:      List,
};

const VALID_ITEM_TYPES = new Set<string>([
  'BOOLEAN', 'NUMBER', 'TEXT', 'TEMPERATURE', 'PHOTO', 'SIGNATURE', 'DATE', 'SELECT',
]);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  const result: ChecklistItem[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    // type must be a known, supported value — unknown types would crash the renderer
    if (typeof r['id'] !== 'string' || typeof r['label'] !== 'string') continue;
    if (!VALID_ITEM_TYPES.has(String(r['type']))) continue;
    result.push({
      id:       r['id'],
      label:    r['label'],
      type:     r['type'] as ChecklistItem['type'],
      unit:     typeof r['unit'] === 'string' ? r['unit'] : undefined,
      min:      typeof r['min'] === 'number' ? r['min'] : undefined,
      max:      typeof r['max'] === 'number' ? r['max'] : undefined,
      required: r['required'] !== false,
      options:  Array.isArray(r['options'])
        ? (r['options'] as unknown[]).filter((o): o is string => typeof o === 'string')
        : undefined,
    });
  }
  return result;
}

function isItemCompliant(
  item: ChecklistItem,
  value: boolean | number | string | null | undefined,
): boolean {
  if (value === null || value === undefined || value === '') return false;
  switch (item.type) {
    case 'BOOLEAN':
      // true = "Oui / Conforme", false = "Non / Non conforme"
      return value === true;
    case 'TEXT':
    case 'PHOTO':
    case 'SIGNATURE':
    case 'DATE':
    case 'SELECT':
      return typeof value === 'string' && value.length > 0;
    case 'NUMBER':
    case 'TEMPERATURE': {
      const n = Number(value);
      if (isNaN(n)) return false;
      if (item.min !== undefined && n < item.min) return false;
      if (item.max !== undefined && n > item.max) return false;
      return true;
    }
    default:
      return false;
  }
}

function hasValue(v: boolean | number | string | null | undefined): boolean {
  return v !== null && v !== undefined && v !== '';
}

/** Compress an image File to a base64 JPEG at max 800px wide, 70% quality. */
async function compressImage(file: File, maxWidth = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      img.src = e.target?.result as string;
      img.onerror = reject;
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas 2d not supported')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.70));
      };
    };
    reader.readAsDataURL(file);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemValue = boolean | number | string | null;
type ValuesMap = Record<string, ItemValue>;

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
  const color =
    pct === 100 ? 'bg-green-500' :
    pct >= 50   ? 'bg-brand-medium' :
                  'bg-amber-400';
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-gray-600">
          {filled} / {total} point{total !== 1 ? 's' : ''} renseigné{total !== 1 ? 's' : ''}
        </span>
        <span className="font-bold text-gray-700">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function ChecklistSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-2 rounded-full bg-surface-muted" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-surface-muted bg-white p-4">
          <div className="mb-3 flex items-start gap-2">
            <div className="h-4 w-4 rounded bg-surface-muted" />
            <div className="h-4 w-48 rounded bg-surface-muted" />
          </div>
          <div className="h-10 rounded-lg bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}

// ─── Photo input ──────────────────────────────────────────────────────────────

function PhotoInput({
  value,
  onChange,
}: {
  value:    ItemValue;
  onChange: (val: ItemValue) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const compressed = await compressImage(file);
      onChange(compressed);
    } catch {
      showToast({ title: 'Erreur lors du traitement de l'image', variant: 'error' });
    } finally {
      setLoading(false);
      // Reset input so the same file can be re-selected after clear
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const photoUrl = typeof value === 'string' && value.startsWith('data:') ? value : null;

  return (
    <div>
      {photoUrl ? (
        <div className="relative">
          <img
            src={photoUrl}
            alt="Photo capturée"
            className="h-40 w-full rounded-lg object-cover border border-surface-muted"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600 transition-colors"
            title="Supprimer la photo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-muted bg-gray-50 py-8 text-sm text-gray-500 transition-colors hover:border-brand-medium hover:bg-brand-lighter/20 hover:text-brand-medium disabled:opacity-50"
        >
          <Camera className="h-7 w-7" />
          <span>{loading ? 'Traitement…' : 'Ajouter une photo'}</span>
          <span className="text-xs text-gray-400">Appuyez pour ouvrir l'appareil photo</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { void handleFileChange(e); }}
      />
    </div>
  );
}

// ─── Signature input ──────────────────────────────────────────────────────────

function SignatureInput({
  value,
  onChange,
}: {
  value:    ItemValue;
  onChange: (val: ItemValue) => void;
}) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const isDrawing   = useRef(false);
  const hasSigned   = useRef(false);

  const getPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#1A3D2B';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    hasSigned.current = true;
  };

  const stopDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !hasSigned.current) return;
    onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSigned.current = false;
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={520}
        height={140}
        className="w-full cursor-crosshair rounded-xl border-2 border-surface-muted bg-white touch-none"
        style={{ touchAction: 'none' }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={(e) => { e.preventDefault(); draw(e); }}
        onTouchEnd={stopDraw}
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-gray-400">Signez dans la zone ci-dessus</p>
        {value && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700"
          >
            <Trash2 className="h-3 w-3" />
            Effacer
          </button>
        )}
      </div>
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
  const Icon      = TYPE_ICONS[item.type];
  const compliant = isItemCompliant(item, value);
  const filled    = hasValue(value);
  const isOutOfRange = filled && !compliant && (item.type === 'NUMBER' || item.type === 'TEMPERATURE');

  // Badge shown at top-right of each card when the item has been answered
  const badge = filled ? (
    compliant ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-semibold text-green-700">
        <CheckCircle2 className="h-3 w-3" />Conforme
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-600">
        <XCircle className="h-3 w-3" />Non conforme
      </span>
    )
  ) : null;

  return (
    <div
      className={[
        'rounded-xl border-2 bg-white p-4 transition-colors',
        filled && compliant
          ? 'border-green-200'
          : filled && !compliant
            ? 'border-red-200'
            : 'border-surface-muted',
      ].join(' ')}
    >
      {/* Label row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-medium" />
          <p className="text-sm font-medium text-gray-900">
            {item.label}
            {item.required && <span className="ml-1 text-red-500">*</span>}
          </p>
        </div>
        {badge}
      </div>

      {/* BOOLEAN */}
      {item.type === 'BOOLEAN' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={[
              'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-medium transition-all active:scale-95',
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
              'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-medium transition-all active:scale-95',
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

      {/* NUMBER / TEMPERATURE */}
      {(item.type === 'NUMBER' || item.type === 'TEMPERATURE') && (
        <div>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              value={value === null || value === undefined ? '' : String(value)}
              onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
              step="0.1"
              className={[
                'h-12 w-full rounded-xl border-2 px-4 pr-14 text-base transition-colors focus:outline-none focus:ring-2',
                isOutOfRange
                  ? 'border-red-300 bg-red-50 focus:ring-red-400'
                  : filled && compliant
                    ? 'border-green-300 bg-green-50 focus:ring-green-400'
                    : 'border-surface-muted focus:ring-brand-medium',
              ].join(' ')}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
              {item.type === 'TEMPERATURE' ? '°C' : (item.unit ?? '')}
            </span>
          </div>
          {/* Range hint */}
          {(item.min !== undefined || item.max !== undefined) && (
            <p className="mt-1.5 text-xs text-gray-500">
              Plage valide :{' '}
              {item.min !== undefined ? `min ${item.min}` : ''}
              {item.min !== undefined && item.max !== undefined ? ' – ' : ''}
              {item.max !== undefined ? `max ${item.max}` : ''}
              {item.type === 'TEMPERATURE' ? ' °C' : item.unit ? ` ${item.unit}` : ''}
            </p>
          )}
          {isOutOfRange && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
              <AlertTriangle className="h-3 w-3" />
              Valeur hors plage — une non-conformité sera enregistrée
            </p>
          )}
        </div>
      )}

      {/* TEXT */}
      {item.type === 'TEXT' && (
        <textarea
          rows={2}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Saisir une observation…"
          className="w-full resize-none rounded-xl border-2 border-surface-muted px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
        />
      )}

      {/* PHOTO */}
      {item.type === 'PHOTO' && (
        <PhotoInput value={value} onChange={onChange} />
      )}

      {/* SIGNATURE */}
      {item.type === 'SIGNATURE' && (
        <SignatureInput value={value} onChange={onChange} />
      )}

      {/* DATE */}
      {item.type === 'DATE' && (
        <input
          type="datetime-local"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-12 w-full rounded-xl border-2 border-surface-muted px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
        />
      )}

      {/* SELECT */}
      {item.type === 'SELECT' && (
        <div className="flex flex-wrap gap-2">
          {(item.options ?? []).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={[
                'min-h-[44px] rounded-xl border-2 px-5 py-2 text-sm font-medium transition-all active:scale-95',
                value === opt
                  ? 'border-brand-medium bg-brand-lighter text-brand-dark'
                  : 'border-surface-muted bg-white text-gray-600 hover:border-brand-medium hover:bg-brand-lighter/40',
              ].join(' ')}
            >
              {opt}
            </button>
          ))}
          {(item.options ?? []).length === 0 && (
            <p className="text-xs text-gray-400">Aucune option configurée</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Non-conformity panel ──────────────────────────────────────────────────────

interface NcPanelProps {
  comment:    string;
  photo:      string | null;
  onComment:  (v: string) => void;
  onPhoto:    (v: string | null) => void;
}

function NonConformityPanel({ comment, photo, onComment, onPhoto }: NcPanelProps) {
  return (
    <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-4 w-4 text-red-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-red-800">Non-conformité détectée</p>
          <p className="text-xs text-red-600">Un commentaire est obligatoire pour valider</p>
        </div>
      </div>

      {/* Mandatory comment */}
      <div className="mb-3">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-red-700">
          Commentaire de non-conformité <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => onComment(e.target.value)}
          placeholder="Décrivez la non-conformité et les actions correctives prises…"
          className="w-full resize-none rounded-xl border-2 border-red-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-red-300"
        />
      </div>

      {/* Optional photo */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-red-700">
          Photo (optionnel)
        </label>
        {photo ? (
          <div className="relative">
            <img
              src={photo}
              alt="Photo non-conformité"
              className="h-32 w-full rounded-lg object-cover border border-red-200"
            />
            <button
              type="button"
              onClick={() => onPhoto(null)}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <PhotoInput
            value={photo}
            onChange={(v) => onPhoto(typeof v === 'string' ? v : null)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Read-only results view ────────────────────────────────────────────────────

function ResultsView({ result }: { result: TaskResult }) {
  const completedAt = new Date(result.submittedAt).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const formatValue = (item: TaskResultItem) => {
    if (item.value === null || item.value === undefined) return '—';
    switch (item.type) {
      case 'BOOLEAN':
        return item.value ? 'Oui / Conforme' : 'Non / Non conforme';
      case 'TEMPERATURE':
        return `${String(item.value)} °C`;
      case 'PHOTO':
      case 'SIGNATURE':
        return typeof item.value === 'string' && item.value.startsWith('data:') ? (
          <img
            src={item.value}
            alt={item.type === 'PHOTO' ? 'Photo' : 'Signature'}
            className="h-16 rounded border border-surface-muted object-contain"
          />
        ) : '—';
      case 'DATE':
        return typeof item.value === 'string'
          ? new Date(item.value).toLocaleString('fr-FR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })
          : String(item.value);
      default:
        return item.unit ? `${String(item.value)} ${item.unit}` : String(item.value);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status banner */}
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
            {result.items.map((item) => (
              <tr key={item.id} className="hover:bg-surface-page transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {item.label}
                  {item.required && <span className="ml-1 text-red-500">*</span>}
                </td>
                <td className="px-4 py-3 text-gray-700">{formatValue(item)}</td>
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
            ))}
          </tbody>
        </table>
      </div>

      {/* NC section */}
      {!result.overallCompliant && result.ncComment && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-700">
            Action corrective
          </p>
          <p className="text-sm text-red-900">{result.ncComment}</p>
          {result.ncPhoto && (
            <img
              src={result.ncPhoto}
              alt="Photo non-conformité"
              className="mt-2 h-24 rounded-lg object-cover border border-red-200"
            />
          )}
        </div>
      )}

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

// ─── Success overlay ───────────────────────────────────────────────────────────

function SuccessOverlay({ compliant }: { compliant: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div
        className={[
          'flex h-20 w-20 items-center justify-center rounded-full',
          compliant ? 'bg-green-100' : 'bg-amber-100',
        ].join(' ')}
      >
        {compliant ? (
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        ) : (
          <AlertTriangle className="h-10 w-10 text-amber-500" />
        )}
      </div>
      <p className={`mt-4 text-lg font-bold ${compliant ? 'text-green-800' : 'text-amber-800'}`}>
        {compliant ? 'Contrôle conforme ✓' : 'Non-conformité enregistrée'}
      </p>
      <p className={`mt-1 text-sm ${compliant ? 'text-green-600' : 'text-amber-600'}`}>
        Les résultats ont été sauvegardés avec succès.
      </p>
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
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [values, setValues]         = useState<ValuesMap>({});
  const [notes, setNotes]           = useState('');
  const [ncComment, setNcComment]   = useState('');
  const [ncPhoto, setNcPhoto]       = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);
  const [lastCompliant, setLastCompliant] = useState(true);

  // Ref guards
  const closeTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef   = useRef(false);  // double-submit guard

  // Reset when task changes
  useEffect(() => {
    setValues({});
    setNotes('');
    setNcComment('');
    setNcPhoto(null);
    setSuccess(false);
    setLastCompliant(true);
    submittedRef.current = false;
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [taskId]);

  // Fetch full task detail
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
      // the IN_PROGRESS transition fails (already IN_PROGRESS on another device).
      showToast({
        title:   'Attention',
        body:    'Impossible de démarrer la tâche automatiquement. Vous pouvez continuer.',
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
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['controls.tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['controls.stats'] });
      const result = vars['resultJson'] as TaskResult | undefined;
      setLastCompliant(result?.overallCompliant ?? true);
      setSuccess(true);
      closeTimerRef.current = setTimeout(() => { onCompleted(); }, 2000);
    },
    onError: () => {
      submittedRef.current = false;
      showToast({ title: 'Erreur lors de la validation', variant: 'error' });
    },
  });

  // ─── Derived state ──────────────────────────────────────────────────────────

  const isOpen = taskId !== null;

  // ARCH-DECISION: Prefer the frozen checklistSnapshot (stored at task creation time)
  // over the live template checklistJson. Ensures operators fill the same checklist
  // that was planned, even if the template was updated since.
  const checklist = parseChecklist(
    taskDetail?.checklistSnapshot ?? taskDetail?.template?.checklistJson,
  );
  const isReadOnly     = taskDetail?.status === 'COMPLETED';
  const existingResult = isReadOnly && taskDetail?.resultJson
    ? (taskDetail.resultJson as TaskResult)
    : null;

  const filledCount = checklist.filter((item) => hasValue(values[item.id])).length;

  const buildItems = (): TaskResultItem[] =>
    checklist.map((item) => ({
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

  const computedItems      = buildItems();
  const overallCompliant   = computedItems
    .filter((i) => i.required)
    .every((i) => i.compliant);

  // Show NC panel when at least one required item is answered and non-compliant
  const anyRequiredAnswered = computedItems.some(
    (i) => i.required && hasValue(values[i.id]),
  );
  const showNcPanel = !overallCompliant && anyRequiredAnswered && !success;

  // All required items answered
  const requiredFulfilled = checklist
    .filter((item) => item.required)
    .every((item) => hasValue(values[item.id]));

  // NC comment is mandatory when overallCompliant is false
  const canSubmit =
    requiredFulfilled &&
    (overallCompliant || ncComment.trim().length > 0) &&
    !completeMutation.isPending;

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleItemChange = (id: string, val: ItemValue) => {
    setValues((prev) => ({ ...prev, [id]: val }));
  };

  const handleSubmit = () => {
    if (!currentUser || !taskId || submittedRef.current) return;
    submittedRef.current = true;

    const items = buildItems();
    const overall = items.filter((i) => i.required).every((i) => i.compliant);

    const resultJson: TaskResult = {
      submittedAt:      new Date().toISOString(),
      submittedBy:      currentUser.sub,
      overallCompliant: overall,
      notes:            notes.trim() || undefined,
      ncComment:        !overall && ncComment.trim() ? ncComment.trim() : undefined,
      ncPhoto:          !overall && ncPhoto          ? ncPhoto          : undefined,
      items,
    };

    void completeMutation.mutateAsync({
      status:      'COMPLETED',
      completedAt: new Date().toISOString(),
      notes:       notes.trim() || undefined,
      resultJson,
    });
  };

  const zoneName   = taskDetail ? (zoneMap[taskDetail.zoneId] ?? taskDetail.zoneId) : '';
  const modalTitle = taskDetail
    ? `${taskDetail.template?.name ?? 'Contrôle'} — ${zoneName}`
    : 'Exécution du contrôle';

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Modal
      open={isOpen}
      onClose={success ? onCompleted : onClose}
      title={modalTitle}
      size="lg"
    >
      {isLoading ? (
        <ChecklistSkeleton />
      ) : success ? (
        <SuccessOverlay compliant={lastCompliant} />
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
          {/* Progress */}
          <ProgressBar filled={filledCount} total={checklist.length} />

          {/* Checklist items */}
          {checklist.map((item) => (
            <ChecklistItemInput
              key={item.id}
              item={item}
              value={values[item.id] ?? null}
              onChange={(val) => handleItemChange(item.id, val)}
            />
          ))}

          {/* NC panel — shown reactively when non-compliant items detected */}
          {showNcPanel && (
            <NonConformityPanel
              comment={ncComment}
              photo={ncPhoto}
              onComment={setNcComment}
              onPhoto={setNcPhoto}
            />
          )}

          {/* Notes (optional) */}
          <div className="rounded-xl border border-surface-muted bg-white p-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Notes complémentaires <span className="text-xs text-gray-400">(optionnel)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observations, contexte, informations utiles…"
              className="w-full resize-none rounded-xl border border-surface-muted px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>

          {/* Submit row */}
          <div className="flex items-center justify-end gap-3 border-t border-surface-muted pt-3">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={completeMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              loading={completeMutation.isPending}
              disabled={!canSubmit}
              className={!overallCompliant && canSubmit ? 'bg-amber-600 hover:bg-amber-700' : ''}
            >
              {overallCompliant ? (
                <><CheckCircle2 className="h-4 w-4" />Valider le contrôle</>
              ) : (
                <><AlertTriangle className="h-4 w-4" />Valider avec non-conformité</>
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
