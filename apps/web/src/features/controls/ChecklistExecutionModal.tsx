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
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
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
    if (typeof r['id'] !== 'string' || typeof r['label'] !== 'string') continue;
    // Legacy items (created before type field existed) default to BOOLEAN
    const itemType: ChecklistItem['type'] = VALID_ITEM_TYPES.has(String(r['type']))
      ? (r['type'] as ChecklistItem['type'])
      : 'BOOLEAN';
    result.push({
      id:       r['id'],
      label:    r['label'],
      type:     itemType,
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
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-600">
        <span>{filled} / {total} point{total !== 1 ? 's' : ''} renseigné{filled !== 1 ? 's' : ''}</span>
        <span className="font-bold text-gray-800">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function ChecklistSkeleton() {
  return (
    <div className="space-y-3 animate-pulse p-4">
      <div className="h-2.5 w-full rounded-full bg-gray-200" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-start gap-2">
            <div className="h-5 w-5 rounded bg-gray-200 shrink-0" />
            <div className="h-4 flex-1 rounded bg-gray-200" />
          </div>
          <div className="h-12 rounded-xl bg-gray-200" />
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
      showToast({ title: 'Erreur lors du traitement de l\'image', variant: 'error' });
    } finally {
      setLoading(false);
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
            className="h-44 w-full rounded-xl object-cover border-2 border-surface-muted"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-10 text-sm text-gray-500 transition-all hover:border-brand-medium hover:bg-brand-lighter/20 hover:text-brand-medium active:scale-[0.98] disabled:opacity-50"
        >
          <Camera className="h-8 w-8" />
          <div className="text-center">
            <p className="font-medium">{loading ? 'Traitement…' : 'Prendre une photo'}</p>
            <p className="text-xs text-gray-400 mt-0.5">Appuyez pour ouvrir l'appareil photo</p>
          </div>
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
    ctx.lineWidth   = 2.5;
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
    <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-2">
      <canvas
        ref={canvasRef}
        width={520}
        height={160}
        className="w-full cursor-crosshair rounded-lg border border-gray-200 bg-white"
        style={{ touchAction: 'none' }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={(e) => { e.preventDefault(); draw(e); }}
        onTouchEnd={stopDraw}
      />
      <div className="mt-2 flex items-center justify-between px-1">
        <p className="text-xs text-gray-400">Signez dans la zone blanche</p>
        {value && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Effacer
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Checklist item card ──────────────────────────────────────────────────────

function ChecklistItemCard({
  item,
  value,
  onChange,
  measuredTemp,
  onMeasuredTempChange,
}: {
  item:                 ChecklistItem;
  value:                ItemValue;
  onChange:             (val: ItemValue) => void;
  measuredTemp:         string;
  onMeasuredTempChange: (v: string) => void;
}) {
  const Icon         = TYPE_ICONS[item.type];
  const compliant    = isItemCompliant(item, value);
  const filled       = hasValue(value);
  const isOutOfRange = filled && !compliant && (item.type === 'NUMBER' || item.type === 'TEMPERATURE');

  return (
    <div
      className={[
        'rounded-2xl border-2 bg-white transition-all duration-200',
        filled && compliant  ? 'border-green-300 shadow-sm shadow-green-100' :
        filled && !compliant ? 'border-red-300 shadow-sm shadow-red-100'    :
                               'border-gray-200',
      ].join(' ')}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={[
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            filled && compliant  ? 'bg-green-100 text-green-600' :
            filled && !compliant ? 'bg-red-100 text-red-500'     :
                                   'bg-gray-100 text-gray-500',
          ].join(' ')}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-snug">
              {item.label}
              {item.required && <span className="ml-1 text-red-500">*</span>}
            </p>
            {(item.type === 'TEMPERATURE' || item.type === 'NUMBER') && (item.min !== undefined || item.max !== undefined) && (
              <p className="mt-0.5 text-xs text-gray-400">
                Plage : {item.min !== undefined ? `${item.min}` : ''}
                {item.min !== undefined && item.max !== undefined ? ' → ' : ''}
                {item.max !== undefined ? `${item.max}` : ''}
                {item.type === 'TEMPERATURE' ? ' °C' : item.unit ? ` ${item.unit}` : ''}
              </p>
            )}
          </div>
        </div>
        {/* Status badge */}
        {filled && (
          <span className={[
            'shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
            compliant
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-600',
          ].join(' ')}>
            {compliant
              ? <><CheckCircle2 className="h-3.5 w-3.5" />Conforme</>
              : <><XCircle className="h-3.5 w-3.5" />Non conforme</>
            }
          </span>
        )}
      </div>

      {/* ── Température relevée — visible sur tous les items ─────────────── */}
      <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
        <Thermometer className="h-4 w-4 shrink-0 text-blue-500" />
        <span className="text-xs font-medium text-blue-700 whitespace-nowrap">Valeur relevée</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={measuredTemp}
          onChange={(e) => onMeasuredTempChange(e.target.value)}
          placeholder="—"
          className="min-w-0 flex-1 bg-transparent text-right text-sm font-bold text-blue-900 placeholder:text-blue-300 focus:outline-none"
        />
        <span className="text-xs font-semibold text-blue-600">°C</span>
      </div>

      {/* Card input area */}
      <div className="px-4 pb-4">
        {/* BOOLEAN */}
        {item.type === 'BOOLEAN' && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onChange(true)}
              className={[
                'flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all active:scale-95',
                value === true
                  ? 'border-green-500 bg-green-500 text-white shadow-md'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-green-300 hover:bg-green-50',
              ].join(' ')}
            >
              <CheckCircle2 className="h-5 w-5" />
              Oui / Conforme
            </button>
            <button
              type="button"
              onClick={() => onChange(false)}
              className={[
                'flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all active:scale-95',
                value === false
                  ? 'border-red-500 bg-red-500 text-white shadow-md'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-red-300 hover:bg-red-50',
              ].join(' ')}
            >
              <XCircle className="h-5 w-5" />
              Non
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
                placeholder="Saisir une valeur…"
                className={[
                  'h-14 w-full rounded-xl border-2 px-4 pr-16 text-lg font-semibold transition-colors focus:outline-none focus:ring-2',
                  isOutOfRange
                    ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-300'
                    : filled && compliant
                      ? 'border-green-300 bg-green-50 text-green-800 focus:ring-green-300'
                      : 'border-gray-200 bg-white focus:ring-brand-medium',
                ].join(' ')}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-500">
                {item.type === 'TEMPERATURE' ? '°C' : (item.unit ?? '')}
              </span>
            </div>
            {isOutOfRange && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Valeur hors plage — non-conformité enregistrée
              </p>
            )}
          </div>
        )}

        {/* TEXT */}
        {item.type === 'TEXT' && (
          <textarea
            rows={3}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="Saisir une observation…"
            className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
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
            className="h-14 w-full rounded-xl border-2 border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
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
                  'min-h-[44px] rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all active:scale-95',
                  value === opt
                    ? 'border-brand-medium bg-brand-medium text-white shadow-md'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-brand-medium hover:bg-brand-lighter/40',
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
    </div>
  );
}

// ─── Non-conformity panel ──────────────────────────────────────────────────────

function NonConformityPanel({
  comment,
  photo,
  onComment,
  onPhoto,
}: {
  comment:   string;
  photo:     string | null;
  onComment: (v: string) => void;
  onPhoto:   (v: string | null) => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <p className="font-bold text-red-800">Non-conformité détectée</p>
          <p className="text-xs text-red-600">Un commentaire est obligatoire avant de valider</p>
        </div>
      </div>

      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-red-700">
        Commentaire de non-conformité <span className="text-red-500">*</span>
      </label>
      <textarea
        rows={3}
        value={comment}
        onChange={(e) => onComment(e.target.value)}
        placeholder="Décrivez la non-conformité et les actions correctives prises…"
        className="w-full resize-none rounded-xl border-2 border-red-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-red-300"
      />

      <div className="mt-3">
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-red-700">
          Photo (optionnel)
        </label>
        {photo ? (
          <div className="relative">
            <img src={photo} alt="Photo NC" className="h-32 w-full rounded-xl object-cover border-2 border-red-200" />
            <button
              type="button"
              onClick={() => onPhoto(null)}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <PhotoInput value={null} onChange={(v) => onPhoto(typeof v === 'string' ? v : null)} />
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

  return (
    <div className="space-y-4 p-4">
      {/* Status banner */}
      <div className={[
        'flex items-center gap-3 rounded-2xl border-2 px-4 py-3',
        result.overallCompliant
          ? 'border-green-200 bg-green-50'
          : 'border-red-200 bg-red-50',
      ].join(' ')}>
        {result.overallCompliant
          ? <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
          : <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
        }
        <div className="flex-1">
          <p className={`font-bold ${result.overallCompliant ? 'text-green-800' : 'text-red-800'}`}>
            {result.overallCompliant ? 'Contrôle conforme' : 'Non-conformité enregistrée'}
          </p>
          <p className={`text-xs ${result.overallCompliant ? 'text-green-600' : 'text-red-600'}`}>
            Complété le {completedAt}
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {result.items.map((item) => {
          let displayValue: React.ReactNode = '—';
          if (item.value !== null && item.value !== undefined) {
            if (item.type === 'BOOLEAN') {
              displayValue = item.value ? 'Oui / Conforme' : 'Non / Non conforme';
            } else if (item.type === 'TEMPERATURE') {
              displayValue = `${String(item.value)} °C`;
            } else if ((item.type === 'PHOTO' || item.type === 'SIGNATURE') && typeof item.value === 'string' && item.value.startsWith('data:')) {
              displayValue = <img src={item.value} alt={item.type} className="h-16 rounded-lg border object-contain" />;
            } else if (item.type === 'DATE' && typeof item.value === 'string') {
              displayValue = new Date(item.value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            } else {
              displayValue = item.unit ? `${String(item.value)} ${item.unit}` : String(item.value);
            }
          }

          return (
            <div key={item.id} className={[
              'flex items-start justify-between gap-3 rounded-xl border p-3',
              item.compliant ? 'border-green-100 bg-green-50/50' : 'border-red-100 bg-red-50/50',
            ].join(' ')}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">
                  {item.label}
                  {item.required && <span className="ml-1 text-red-400">*</span>}
                </p>
                {item.measuredTemp && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-blue-700">
                    <Thermometer className="h-3 w-3" />
                    Relevé : {item.measuredTemp} °C
                  </p>
                )}
                <p className="mt-0.5 text-sm text-gray-600">{displayValue}</p>
              </div>
              <span className={[
                'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                item.compliant ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600',
              ].join(' ')}>
                {item.compliant
                  ? <><CheckCircle2 className="h-3 w-3" />OK</>
                  : <><XCircle className="h-3 w-3" />NC</>
                }
              </span>
            </div>
          );
        })}
      </div>

      {/* NC comment */}
      {!result.overallCompliant && result.ncComment && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-red-700">Action corrective</p>
          <p className="text-sm text-red-900">{result.ncComment}</p>
          {result.ncPhoto && (
            <img src={result.ncPhoto} alt="Photo NC" className="mt-2 h-24 rounded-xl object-cover border border-red-200" />
          )}
        </div>
      )}

      {result.notes && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Notes</p>
          <p className="text-sm text-gray-700">{result.notes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Success overlay ───────────────────────────────────────────────────────────

function SuccessOverlay({ compliant }: { compliant: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className={[
        'flex h-24 w-24 items-center justify-center rounded-full',
        compliant ? 'bg-green-100' : 'bg-amber-100',
      ].join(' ')}>
        {compliant
          ? <CheckCircle2 className="h-12 w-12 text-green-600" />
          : <AlertTriangle className="h-12 w-12 text-amber-500" />
        }
      </div>
      <p className={`mt-5 text-xl font-bold ${compliant ? 'text-green-800' : 'text-amber-800'}`}>
        {compliant ? 'Contrôle conforme ✓' : 'Non-conformité enregistrée'}
      </p>
      <p className={`mt-2 text-sm ${compliant ? 'text-green-600' : 'text-amber-600'}`}>
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

  const [values, setValues]               = useState<ValuesMap>({});
  const [measuredTemps, setMeasuredTemps] = useState<Record<string, string>>({});
  const [notes, setNotes]                 = useState('');
  const [ncComment, setNcComment]         = useState('');
  const [ncPhoto, setNcPhoto]             = useState<string | null>(null);
  const [success, setSuccess]             = useState(false);
  const [lastCompliant, setLastCompliant] = useState(true);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef  = useRef(false);

  useEffect(() => {
    setValues({});
    setMeasuredTemps({});
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

  const completeMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/v1/controls/tasks/${taskId}`, body),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['controls.tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['controls.stats'] });
      const result = vars['resultJson'] as TaskResult | undefined;
      setLastCompliant(result?.overallCompliant ?? true);
      setSuccess(true);
      closeTimerRef.current = setTimeout(() => { onCompleted(); }, 2500);
    },
    onError: () => {
      submittedRef.current = false;
      showToast({ title: 'Erreur lors de la validation', variant: 'error' });
    },
  });

  // ─── Derived state ──────────────────────────────────────────────────────────

  const isOpen = taskId !== null;

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
      id:           item.id,
      label:        item.label,
      type:         item.type,
      value:        values[item.id] ?? null,
      unit:         item.unit,
      min:          item.min,
      max:          item.max,
      compliant:    isItemCompliant(item, values[item.id]),
      required:     item.required,
      measuredTemp: measuredTemps[item.id] || undefined,
    }));

  const computedItems    = buildItems();
  const overallCompliant = computedItems.filter((i) => i.required).every((i) => i.compliant);
  const anyRequiredAnswered = computedItems.some((i) => i.required && hasValue(values[i.id]));
  const showNcPanel      = !overallCompliant && anyRequiredAnswered && !success;
  const requiredFulfilled = checklist.filter((i) => i.required).every((i) => hasValue(values[i.id]));
  const canSubmit =
    requiredFulfilled &&
    (overallCompliant || ncComment.trim().length > 0) &&
    !completeMutation.isPending;

  const handleItemChange = (id: string, val: ItemValue) => {
    setValues((prev) => ({ ...prev, [id]: val }));
  };

  const handleSubmit = () => {
    if (!currentUser || !taskId || submittedRef.current) return;
    submittedRef.current = true;

    const items   = buildItems();
    const overall = items.filter((i) => i.required).every((i) => i.compliant);

    const resultJson: TaskResult = {
      submittedAt:      new Date().toISOString(),
      submittedBy:      currentUser.sub,
      overallCompliant: overall,
      notes:            notes.trim() || undefined,
      ncComment:        !overall && ncComment.trim() ? ncComment.trim() : undefined,
      ncPhoto:          !overall && ncPhoto ? ncPhoto : undefined,
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

  if (!isOpen) return null;

  // ─── Render — full-screen overlay (responsive) ────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={success ? onCompleted : onClose}
      />

      {/* Panel — bottom-sheet on mobile, centered dialog on sm+ */}
      <div className="relative flex w-full flex-col bg-white shadow-2xl
                      rounded-t-3xl sm:rounded-2xl
                      max-h-[95dvh] sm:max-h-[90vh]
                      sm:max-w-2xl">

        {/* ── Header (sticky) ─────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-gray-100">
          {/* Drag handle (mobile) */}
          <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-gray-300 sm:hidden" />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-brand-dark leading-snug truncate">
                {modalTitle}
              </h2>
              {taskDetail && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {taskDetail.template?.type
                    ? { RECEPTION:'Réception', TEMPERATURE_STOCK:'Temp. stockage',
                        TEMPERATURE_DISPLAY:'Temp. vitrine', TEMPERATURE_OIL:'Temp. huile',
                        EQUIPMENT:'Équipement', SANITARY:'Sanitaire',
                        DAILY_PRODUCTION:'Production quotidienne',
                      }[taskDetail.template.type] ?? taskDetail.template.type
                    : ''}
                </p>
              )}
            </div>
            <button
              onClick={success ? onCompleted : onClose}
              className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Progress bar (shown while filling) */}
          {!isLoading && !success && !isReadOnly && checklist.length > 0 && (
            <div className="mt-4">
              <ProgressBar filled={filledCount} total={checklist.length} />
            </div>
          )}
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <ChecklistSkeleton />
          ) : success ? (
            <SuccessOverlay compliant={lastCompliant} />
          ) : isReadOnly && existingResult ? (
            <ResultsView result={existingResult} />
          ) : checklist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              </div>
              <p className="mt-4 font-semibold text-gray-700">Aucun point de contrôle défini</p>
              <p className="mt-1 text-sm text-gray-500">
                Ce modèle ne contient pas encore d'items.<br />Contactez un responsable.
              </p>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {/* Checklist items */}
              {checklist.map((item) => (
                <ChecklistItemCard
                  key={item.id}
                  item={item}
                  value={values[item.id] ?? null}
                  onChange={(val) => handleItemChange(item.id, val)}
                  measuredTemp={measuredTemps[item.id] ?? ''}
                  onMeasuredTempChange={(v) =>
                    setMeasuredTemps((prev) => ({ ...prev, [item.id]: v }))
                  }
                />
              ))}

              {/* NC panel */}
              {showNcPanel && (
                <NonConformityPanel
                  comment={ncComment}
                  photo={ncPhoto}
                  onComment={setNcComment}
                  onPhoto={setNcPhoto}
                />
              )}

              {/* Notes */}
              <div className="rounded-2xl border-2 border-gray-200 bg-white p-4">
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Notes complémentaires
                  <span className="ml-1 text-xs font-normal text-gray-400">(optionnel)</span>
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observations, contexte, informations utiles…"
                  className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer — sticky validate button ─────────────────────────────── */}
        {!isLoading && !success && !isReadOnly && checklist.length > 0 && (
          <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-4 pb-safe">
            {/* Helper text when button is disabled */}
            {!requiredFulfilled && (
              <p className="mb-2 text-center text-xs text-gray-400">
                Renseignez tous les points obligatoires (<span className="text-red-500">*</span>) pour valider
              </p>
            )}
            {requiredFulfilled && !overallCompliant && ncComment.trim().length === 0 && (
              <p className="mb-2 text-center text-xs text-amber-600 font-medium">
                ⚠ Ajoutez un commentaire de non-conformité ci-dessus pour valider
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={completeMutation.isPending}
                className="h-14 rounded-2xl border-2 border-gray-200 px-5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={[
                  'flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-base font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed',
                  overallCompliant
                    ? 'bg-green-600 hover:bg-green-700 shadow-green-200'
                    : 'bg-amber-600 hover:bg-amber-700 shadow-amber-200',
                ].join(' ')}
              >
                {completeMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Validation…
                  </span>
                ) : overallCompliant ? (
                  <><CheckCircle2 className="h-5 w-5" />Valider le contrôle</>
                ) : (
                  <><AlertTriangle className="h-5 w-5" />Valider avec non-conformité</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
