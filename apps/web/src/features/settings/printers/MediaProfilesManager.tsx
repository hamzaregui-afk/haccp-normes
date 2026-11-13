import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Ruler, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenantId';

/**
 * MediaProfilesManager — label-profile (MediaProfile) CRUD UI.
 *
 * Surfaces the §8 label configuration (size / orientation / DPI / margins / gap
 * / black-mark / cutter / density / speed) that previously existed only in the
 * DB and was seed/API-only. Lives inside Paramètres → Imprimantes alongside the
 * printer list, which references these profiles via defaultMediaProfileId.
 */

type MediaType = 'GAP' | 'BLACK_MARK' | 'CONTINUOUS';
type Orientation = 'PORTRAIT' | 'LANDSCAPE';

interface MediaProfile {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  mediaType: MediaType;
  gapMm: number | null;
  blackMarkMm: number | null;
  dpi: number;
  speed: number | null;
  density: number | null;
  autoCalibrate: boolean;
  isDefault: boolean;
  isActive: boolean;
  orientation: string | null;
  marginTopMm: number | null;
  marginBottomMm: number | null;
  marginLeftMm: number | null;
  marginRightMm: number | null;
  cutter: boolean;
}

interface ApiResponse<T> { data: T; message?: string; }

interface FormValues {
  name: string;
  widthMm: number | '';
  heightMm: number | '';
  orientation: Orientation;
  mediaType: MediaType;
  gapMm: number | '';
  blackMarkMm: number | '';
  dpi: number | '';
  speed: number | '';
  density: number | '';
  marginTopMm: number | '';
  marginBottomMm: number | '';
  marginLeftMm: number | '';
  marginRightMm: number | '';
  cutter: boolean;
  autoCalibrate: boolean;
  isDefault: boolean;
}

const EMPTY: FormValues = {
  name: '', widthMm: '', heightMm: '', orientation: 'PORTRAIT', mediaType: 'GAP',
  gapMm: '', blackMarkMm: '', dpi: 203, speed: '', density: '',
  marginTopMm: '', marginBottomMm: '', marginLeftMm: '', marginRightMm: '',
  cutter: false, autoCalibrate: true, isDefault: false,
};

function toForm(p: MediaProfile): FormValues {
  return {
    name: p.name,
    widthMm: p.widthMm, heightMm: p.heightMm,
    orientation: (p.orientation === 'LANDSCAPE' ? 'LANDSCAPE' : 'PORTRAIT'),
    mediaType: p.mediaType,
    gapMm: p.gapMm ?? '', blackMarkMm: p.blackMarkMm ?? '',
    dpi: p.dpi, speed: p.speed ?? '', density: p.density ?? '',
    marginTopMm: p.marginTopMm ?? '', marginBottomMm: p.marginBottomMm ?? '',
    marginLeftMm: p.marginLeftMm ?? '', marginRightMm: p.marginRightMm ?? '',
    cutter: p.cutter, autoCalibrate: p.autoCalibrate, isDefault: p.isDefault,
  };
}

/** Strip empty-string optionals so the backend Zod schema receives numbers/undefined. */
function toPayload(f: FormValues): Record<string, unknown> {
  const num = (v: number | '') => (v === '' ? undefined : Number(v));
  return {
    name: f.name.trim(),
    widthMm: Number(f.widthMm),
    heightMm: Number(f.heightMm),
    orientation: f.orientation,
    mediaType: f.mediaType,
    gapMm: f.mediaType === 'GAP' ? num(f.gapMm) : undefined,
    blackMarkMm: f.mediaType === 'BLACK_MARK' ? num(f.blackMarkMm) : undefined,
    dpi: num(f.dpi) ?? 203,
    speed: num(f.speed),
    density: num(f.density),
    marginTopMm: num(f.marginTopMm),
    marginBottomMm: num(f.marginBottomMm),
    marginLeftMm: num(f.marginLeftMm),
    marginRightMm: num(f.marginRightMm),
    cutter: f.cutter,
    autoCalibrate: f.autoCalibrate,
    isDefault: f.isDefault,
  };
}

const inputCls = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium';
const selectCls = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-medium';

export function MediaProfilesManager({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const tenantId = useTenantId();
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MediaProfile | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['media-profiles', tenantId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<MediaProfile[]>>('/api/v1/media-profiles?limit=100');
      return data.data;
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['media-profiles', tenantId] });
    void qc.invalidateQueries({ queryKey: ['media-profiles'] });
  };

  const saveMutation = useMutation({
    mutationFn: async (f: FormValues) => {
      const payload = toPayload(f);
      if (editing) return api.patch(`/api/v1/media-profiles/${editing.id}`, payload);
      return api.post('/api/v1/media-profiles', payload);
    },
    onSuccess: () => {
      showToast({ title: editing ? t('printers.mediaProfiles.updated') : t('printers.mediaProfiles.created'), variant: 'success' });
      invalidate();
      setModalOpen(false);
    },
    onError: () => showToast({ title: t('printers.mediaProfiles.saveError'), variant: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/media-profiles/${id}`),
    onSuccess: () => { showToast({ title: t('printers.mediaProfiles.deleted'), variant: 'success' }); invalidate(); },
    onError: () => showToast({ title: t('printers.mediaProfiles.deleteError'), variant: 'error' }),
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (p: MediaProfile) => { setEditing(p); setForm(toForm(p)); setModalOpen(true); };

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setForm((f) => ({ ...f, [k]: v }));

  const canSubmit = form.name.trim() !== '' && form.widthMm !== '' && form.heightMm !== '';

  return (
    <div className="rounded-xl border border-surface-muted bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ruler className="h-5 w-5 text-brand-medium" />
          <h3 className="text-sm font-semibold text-brand-dark">{t('printers.mediaProfiles.title')}</h3>
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />{t('printers.mediaProfiles.add')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-surface-page" />)}</div>
      ) : profiles.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{t('printers.mediaProfiles.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-surface-muted text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3 font-semibold">{t('printers.mediaProfiles.name')}</th>
                <th className="py-2 pr-3 font-semibold">{t('printers.mediaProfiles.size')}</th>
                <th className="py-2 pr-3 font-semibold">{t('printers.mediaProfiles.media')}</th>
                <th className="py-2 pr-3 font-semibold">DPI</th>
                <th className="py-2 pr-3 font-semibold">{t('printers.mediaProfiles.cutter')}</th>
                <th className="py-2 pr-3 text-right font-semibold">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-muted">
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-brand-lighter/40">
                  <td className="py-2.5 pr-3">
                    <span className="inline-flex items-center gap-1.5 font-medium text-gray-800">
                      {p.isDefault && <Star className="h-3.5 w-3.5 fill-gold text-gold" />}{p.name}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-gray-600">{p.widthMm} × {p.heightMm} mm</td>
                  <td className="py-2.5 pr-3 text-gray-600">{t(`printers.mediaProfiles.mediaType.${p.mediaType}` as Parameters<typeof t>[0])}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-gray-600">{p.dpi}</td>
                  <td className="py-2.5 pr-3 text-gray-600">{p.cutter ? t('common.yes') : t('common.no')}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {canManage && (
                      <div className="inline-flex gap-1">
                        <button onClick={() => openEdit(p)} className="rounded p-1.5 text-gray-400 hover:bg-brand-lighter hover:text-brand-dark" title={t('common.edit')}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { if (confirm(t('printers.mediaProfiles.confirmDelete', { name: p.name }))) deleteMutation.mutate(p.id); }}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title={t('common.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <Modal open onClose={() => setModalOpen(false)} title={editing ? t('printers.mediaProfiles.editTitle') : t('printers.mediaProfiles.createTitle')}>
          <form
            onSubmit={(e) => { e.preventDefault(); if (canSubmit) saveMutation.mutate(form); }}
            className="space-y-4"
          >
            <Field label={t('printers.mediaProfiles.name')} required>
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('printers.mediaProfiles.namePh')} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('printers.mediaProfiles.widthMm')} required>
                <input type="number" step="0.1" className={inputCls} value={form.widthMm} onChange={(e) => set('widthMm', e.target.value === '' ? '' : Number(e.target.value))} />
              </Field>
              <Field label={t('printers.mediaProfiles.heightMm')} required>
                <input type="number" step="0.1" className={inputCls} value={form.heightMm} onChange={(e) => set('heightMm', e.target.value === '' ? '' : Number(e.target.value))} />
              </Field>
              <Field label={t('printers.mediaProfiles.orientation')}>
                <select className={selectCls} value={form.orientation} onChange={(e) => set('orientation', e.target.value as Orientation)}>
                  <option value="PORTRAIT">{t('printers.mediaProfiles.orientationValue.PORTRAIT')}</option>
                  <option value="LANDSCAPE">{t('printers.mediaProfiles.orientationValue.LANDSCAPE')}</option>
                </select>
              </Field>
              <Field label="DPI">
                <input type="number" className={inputCls} value={form.dpi} onChange={(e) => set('dpi', e.target.value === '' ? '' : Number(e.target.value))} />
              </Field>
            </div>

            <Field label={t('printers.mediaProfiles.media')}>
              <select className={selectCls} value={form.mediaType} onChange={(e) => set('mediaType', e.target.value as MediaType)}>
                <option value="GAP">{t('printers.mediaProfiles.mediaType.GAP')}</option>
                <option value="BLACK_MARK">{t('printers.mediaProfiles.mediaType.BLACK_MARK')}</option>
                <option value="CONTINUOUS">{t('printers.mediaProfiles.mediaType.CONTINUOUS')}</option>
              </select>
            </Field>
            {form.mediaType === 'GAP' && (
              <Field label={t('printers.mediaProfiles.gapMm')}>
                <input type="number" step="0.1" className={inputCls} value={form.gapMm} onChange={(e) => set('gapMm', e.target.value === '' ? '' : Number(e.target.value))} />
              </Field>
            )}
            {form.mediaType === 'BLACK_MARK' && (
              <Field label={t('printers.mediaProfiles.blackMarkMm')}>
                <input type="number" step="0.1" className={inputCls} value={form.blackMarkMm} onChange={(e) => set('blackMarkMm', e.target.value === '' ? '' : Number(e.target.value))} />
              </Field>
            )}

            <div className="grid grid-cols-4 gap-2">
              {(['marginTopMm', 'marginBottomMm', 'marginLeftMm', 'marginRightMm'] as const).map((m) => (
                <Field key={m} label={t(`printers.mediaProfiles.${m}` as Parameters<typeof t>[0])}>
                  <input type="number" step="0.1" className={inputCls} value={form[m]} onChange={(e) => set(m, e.target.value === '' ? '' : Number(e.target.value))} />
                </Field>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('printers.mediaProfiles.speed')}>
                <input type="number" className={inputCls} value={form.speed} onChange={(e) => set('speed', e.target.value === '' ? '' : Number(e.target.value))} />
              </Field>
              <Field label={t('printers.mediaProfiles.density')}>
                <input type="number" className={inputCls} value={form.density} onChange={(e) => set('density', e.target.value === '' ? '' : Number(e.target.value))} />
              </Field>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.cutter} onChange={(e) => set('cutter', e.target.checked)} />{t('printers.mediaProfiles.cutter')}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.autoCalibrate} onChange={(e) => set('autoCalibrate', e.target.checked)} />{t('printers.mediaProfiles.autoCalibrate')}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />{t('printers.mediaProfiles.isDefault')}
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!canSubmit || saveMutation.isPending}>{t('common.save')}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
