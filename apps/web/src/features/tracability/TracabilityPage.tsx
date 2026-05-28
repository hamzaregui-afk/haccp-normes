import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  Layers,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import { tracabilityApi } from './api';

// ─── Domain types ────────────────────────────────────────────────────────────

type TracabilityStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type TracabilityType   = 'RECEPTION' | 'PRODUCTION' | 'EXPEDITION' | 'INTERNAL' | 'DESTRUCTION' | 'OTHER';

interface TracabilityPhoto {
  id:         string;
  objectKey:  string;
  url:        string;
  caption?:   string | null;
  uploadedAt: string;
}

interface Tracability {
  id:            string;
  reference:     string;
  type:          TracabilityType;
  status:        TracabilityStatus;
  lotNumber:     string;
  productName:   string;
  supplierId?:   string | null;
  siteId?:       string | null;
  quantity?:     number | null;
  unit?:         string | null;
  receptionDate?: string | null;
  expiryDate?:   string | null;
  temperature?:  number | null;
  notes?:        string | null;
  createdById:   string;
  createdAt:     string;
  photos?:       TracabilityPhoto[];
  _count?:       { photos: number };
}

interface Stats {
  total: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  totalPhotos: number;
}

// ─── Style maps (values only — labels are hardcoded FR) ───────────────────────

const STATUS_STYLES: Record<TracabilityStatus, string> = {
  IN_PROGRESS: 'bg-orange-100 text-orange-700 border border-orange-200',
  COMPLETED:   'bg-green-100 text-green-700 border border-green-200',
  CANCELLED:   'bg-gray-100 text-gray-600 border border-gray-200',
};

const STATUS_ICON: Record<TracabilityStatus, React.ElementType> = {
  IN_PROGRESS: Clock,
  COMPLETED:   CheckCircle2,
  CANCELLED:   XCircle,
};

const TYPE_STYLE: Record<TracabilityType, string> = {
  RECEPTION:   'bg-blue-100 text-blue-700',
  PRODUCTION:  'bg-purple-100 text-purple-700',
  EXPEDITION:  'bg-teal-100 text-teal-700',
  INTERNAL:    'bg-yellow-100 text-yellow-700',
  DESTRUCTION: 'bg-red-100 text-red-700',
  OTHER:       'bg-gray-100 text-gray-600',
};

const STATUS_LABEL: Record<TracabilityStatus, string> = {
  IN_PROGRESS: 'En cours',
  COMPLETED:   'Terminé',
  CANCELLED:   'Annulé',
};

const TYPE_LABEL: Record<TracabilityType, string> = {
  RECEPTION:   'Réception',
  PRODUCTION:  'Production',
  EXPEDITION:  'Expédition',
  INTERNAL:    'Interne',
  DESTRUCTION: 'Destruction',
  OTHER:       'Autre',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function compressImage(file: File, maxWidth = 1920): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale  = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file),
        'image/jpeg', 0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function toast(title: string, variant: 'success' | 'error' | 'info' = 'info') {
  showToast({ title, variant });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType]         = useState<TracabilityType>('RECEPTION');
  const [lotNumber, setLot]     = useState('');
  const [productName, setProduct] = useState('');
  const [quantity, setQty]      = useState('');
  const [unit, setUnit]         = useState('');
  const [receptionDate, setRxDate] = useState('');
  const [expiryDate, setExpDate]   = useState('');
  const [temperature, setTemp]     = useState('');
  const [notes, setNotes]          = useState('');
  const [files, setFiles]          = useState<File[]>([]);
  const [previews, setPreviews]    = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await tracabilityApi.create({
        type,
        lotNumber:     lotNumber.trim(),
        productName:   productName.trim(),
        quantity:      quantity ? parseFloat(quantity) : undefined,
        unit:          unit.trim() || undefined,
        receptionDate: receptionDate ? new Date(receptionDate) : undefined,
        expiryDate:    expiryDate    ? new Date(expiryDate)    : undefined,
        temperature:   temperature ? parseFloat(temperature) : undefined,
        notes:         notes.trim() || undefined,
      });
      const id = (result.data as { id: string }).id;
      if (files.length > 0) {
        await Promise.allSettled(files.map((f) => tracabilityApi.uploadPhoto(id, f)));
      }
      return result;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracabilities'] });
      void qc.invalidateQueries({ queryKey: ['tracability-stats'] });
      toast('Fiche de traçabilité créée', 'success');
      onClose();
    },
    onError: (err: unknown) => toast(err instanceof Error ? err.message : 'Erreur', 'error'),
  });

  const addFiles = useCallback(async (fl: FileList | null) => {
    if (!fl) return;
    const arr        = Array.from(fl).filter((f) => f.type.startsWith('image/'));
    const compressed = await Promise.all(arr.map(compressImage));
    setFiles((p) => [...p, ...compressed]);
    setPreviews((p) => [...p, ...compressed.map((f) => URL.createObjectURL(f))]);
  }, []);

  const removePreview = (idx: number) => {
    URL.revokeObjectURL(previews[idx]);
    setFiles((p) => p.filter((_, i) => i !== idx));
    setPreviews((p) => p.filter((_, i) => i !== idx));
  };

  const valid = lotNumber.trim().length > 0 && productName.trim().length > 0;

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle fiche de traçabilité" size="lg">
      <div className="space-y-4">
        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
          <Select
            value={type}
            options={Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))}
            onChange={(e) => setType((e as React.ChangeEvent<HTMLSelectElement>).target.value as TracabilityType)}
          />
        </div>

        {/* Lot / Product */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">N° de lot *</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              placeholder="ex: LOT-2026-001"
              value={lotNumber}
              onChange={(e) => setLot(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produit *</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              placeholder="Nom du produit"
              value={productName}
              onChange={(e) => setProduct(e.target.value)}
            />
          </div>
        </div>

        {/* Qty / Unit / Temp */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantité</label>
            <input
              type="number" step="0.01"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              placeholder="0" value={quantity} onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unité</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              placeholder="kg, L…" value={unit} onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Température (°C)</label>
            <input
              type="number" step="0.1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              placeholder="4" value={temperature} onChange={(e) => setTemp(e.target.value)}
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date réception</label>
            <input type="date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              value={receptionDate} onChange={(e) => setRxDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date expiration (DLC)</label>
            <input type="date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              value={expiryDate} onChange={(e) => setExpDate(e.target.value)}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observations</label>
          <textarea rows={2}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            placeholder="Observations, anomalies…"
            value={notes} onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Photo upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Photos ({files.length})
          </label>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void addFiles(e.dataTransfer.files); }}
            className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center transition-colors hover:border-brand-medium hover:bg-brand-medium/5"
          >
            <Upload className="h-5 w-5 text-gray-400" />
            <p className="text-sm text-gray-500">
              Glisser-déposer ou <span className="font-medium text-brand-medium">parcourir</span>
            </p>
            <p className="text-xs text-gray-400">JPEG, PNG, WEBP · 20 Mo max</p>
            <input
              ref={fileRef} type="file" accept="image/*" multiple capture="environment"
              className="sr-only"
              onChange={(e) => void addFiles(e.target.files)}
            />
          </div>

          {previews.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {previews.map((src, idx) => (
                <div key={idx} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); removePreview(idx); }}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} loading={mutation.isPending}>
            Créer la fiche
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({ record: initial, open, onClose }: {
  record: Tracability; open: boolean; onClose: () => void;
}) {
  const qc   = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit   = role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN' || role === 'OPERATOR';
  const canDelete = role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN';

  const { data: fetched } = useQuery({
    queryKey: ['tracability', initial.id],
    queryFn:  () => tracabilityApi.get(initial.id).then((r: { data: Tracability }) => r.data),
    enabled:  open,
  });
  const rec = fetched ?? initial;

  const [lightbox, setLightbox] = useState<TracabilityPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (fl: FileList) => {
      const compressed = await Promise.all(
        Array.from(fl).filter((f) => f.type.startsWith('image/')).map(compressImage),
      );
      await Promise.all(compressed.map((f) => tracabilityApi.uploadPhoto(rec.id, f)));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tracability', rec.id] }),
    onError:   () => toast('Erreur lors du téléversement', 'error'),
  });

  const deletePicMutation = useMutation({
    mutationFn: (photoId: string) => tracabilityApi.deletePhoto(rec.id, photoId),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['tracability', rec.id] });
      void qc.invalidateQueries({ queryKey: ['tracabilities'] });
      setLightbox(null);
    },
    onError: () => toast('Erreur lors de la suppression', 'error'),
  });

  const completeMutation = useMutation({
    mutationFn: () => tracabilityApi.update(rec.id, { status: 'COMPLETED' }),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['tracability', rec.id] });
      void qc.invalidateQueries({ queryKey: ['tracabilities'] });
      void qc.invalidateQueries({ queryKey: ['tracability-stats'] });
      toast('Fiche clôturée', 'success');
    },
    onError: () => toast('Erreur', 'error'),
  });

  const StatusIcon = STATUS_ICON[rec.status];
  const photos     = rec.photos ?? [];

  return (
    <>
      <Modal open={open} onClose={onClose} title={rec.reference} size="lg">
        <div className="space-y-5">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', STATUS_STYLES[rec.status])}>
              <StatusIcon className="h-3.5 w-3.5" />
              {STATUS_LABEL[rec.status]}
            </span>
            <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', TYPE_STYLE[rec.type])}>
              {TYPE_LABEL[rec.type]}
            </span>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
            <div><span className="font-medium text-gray-500">N° de lot :</span> <span className="ml-1 text-gray-900">{rec.lotNumber}</span></div>
            <div><span className="font-medium text-gray-500">Produit :</span> <span className="ml-1 text-gray-900">{rec.productName}</span></div>
            {rec.quantity != null && (
              <div><span className="font-medium text-gray-500">Quantité :</span> <span className="ml-1 text-gray-900">{rec.quantity} {rec.unit ?? ''}</span></div>
            )}
            {rec.temperature != null && (
              <div><span className="font-medium text-gray-500">Température :</span> <span className="ml-1 text-gray-900">{rec.temperature}°C</span></div>
            )}
            <div><span className="font-medium text-gray-500">Réception :</span> <span className="ml-1 text-gray-900">{fmtDate(rec.receptionDate)}</span></div>
            <div><span className="font-medium text-gray-500">Expiration :</span> <span className="ml-1 text-gray-900">{fmtDate(rec.expiryDate)}</span></div>
            <div className="col-span-2"><span className="font-medium text-gray-500">Créé le :</span> <span className="ml-1 text-gray-900">{fmtDateTime(rec.createdAt)}</span></div>
            {rec.notes && (
              <div className="col-span-2">
                <span className="font-medium text-gray-500">Observations :</span>
                <p className="mt-1 rounded-lg border border-gray-200 bg-white p-2 text-gray-700">{rec.notes}</p>
              </div>
            )}
          </div>

          {/* Photos */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Photos ({photos.length})</h3>
              {canEdit && rec.status === 'IN_PROGRESS' && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} loading={uploadMutation.isPending}>
                    <Camera className="mr-1 h-4 w-4" />Ajouter
                  </Button>
                  <input
                    ref={fileRef} type="file" accept="image/*" multiple capture="environment"
                    className="sr-only"
                    onChange={(e) => { if (e.target.files) void uploadMutation.mutateAsync(e.target.files); }}
                  />
                </>
              )}
            </div>

            {photos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
                <Camera className="h-8 w-8" />
                <p className="text-sm">Aucune photo</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {photos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setLightbox(photo)}
                    className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 transition-colors hover:border-brand-medium focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption ?? ''}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
            {canEdit && rec.status === 'IN_PROGRESS' && (
              <Button
                onClick={() => completeMutation.mutate()}
                loading={completeMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />Clôturer
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>Fermer</Button>
          </div>
        </div>
      </Modal>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} alt="" className="max-h-[80vh] max-w-[80vw] rounded-lg object-contain" />
            {canDelete && (
              <button
                className="absolute right-2 top-2 rounded-full bg-red-600 p-2 text-white hover:bg-red-700"
                onClick={() => deletePicMutation.mutate(lightbox.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              className="absolute left-2 top-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              onClick={() => setLightbox(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TracabilityPage() {
  const { t }    = useTranslation();
  const role     = useAuthStore((s) => s.user?.role);
  const canCreate = role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN' || role === 'OPERATOR';
  const canDelete = role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN';

  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFlt]    = useState('');
  const [statusFilter, setStatFlt]  = useState('');
  const [page, setPage]             = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail]         = useState<Tracability | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const qc = useQueryClient();

  const { data: statsData } = useQuery({
    queryKey: ['tracability-stats'],
    queryFn:  () => tracabilityApi.stats().then((r: { data: Stats }) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['tracabilities', page, debouncedSearch, typeFilter, statusFilter],
    queryFn:  () => tracabilityApi.list({
      page,
      limit:  20,
      search: debouncedSearch || undefined,
      type:   (typeFilter   as never) || undefined,
      status: (statusFilter as never) || undefined,
    }).then((r: { data: Tracability[]; meta: { total: number; lastPage: number } }) => r),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tracabilityApi.remove(id),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['tracabilities'] });
      void qc.invalidateQueries({ queryKey: ['tracability-stats'] });
      toast('Fiche supprimée', 'success');
    },
    onError: () => toast('Erreur lors de la suppression', 'error'),
  });

  const stats = statsData;
  const items = data?.data ?? [];
  const meta  = data?.meta;

  return (
    <PageWrapper>
      <Header
        title={t('nav.tracability')}
        subtitle="Fiches de traçabilité des lots et produits"
        extra={
          canCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Nouvelle fiche
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total"    value={stats.total}      icon={Layers}        color="bg-blue-50 text-blue-600" />
          <StatCard label="En cours" value={stats.inProgress} icon={Clock}         color="bg-orange-50 text-orange-600" />
          <StatCard label="Terminés" value={stats.completed}  icon={CheckCircle2}  color="bg-green-50 text-green-600" />
          <StatCard label="Photos"   value={stats.totalPhotos} icon={Camera}       color="bg-purple-50 text-purple-600" />
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            placeholder="Rechercher lot, produit, référence…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => { setTypeFlt((e as React.ChangeEvent<HTMLSelectElement>).target.value); setPage(1); }}
          options={[
            { value: '', label: 'Tous les types' },
            ...Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v })),
          ]}
        />
        <Select
          value={statusFilter}
          onChange={(e) => { setStatFlt((e as React.ChangeEvent<HTMLSelectElement>).target.value); setPage(1); }}
          options={[
            { value: '', label: 'Tous les statuts' },
            ...Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v })),
          ]}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-medium border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            <Archive className="h-8 w-8 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">Aucune fiche de traçabilité</h3>
          <p className="mt-1 max-w-xs text-sm text-gray-500">
            {search ? 'Aucun résultat pour votre recherche.' : 'Créez votre première fiche de traçabilité.'}
          </p>
          {canCreate && (
            <Button className="mt-6" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 h-4 w-4" />Nouvelle fiche
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Produit / Lot</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item: Tracability) => {
                const SIcon = STATUS_ICON[item.status];
                return (
                  <tr key={item.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-gray-700">{item.reference}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.productName}</div>
                      <div className="text-xs text-gray-500">Lot: {item.lotNumber}</div>
                      {item._count?.photos ? (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                          <Camera className="h-3 w-3" />{item._count.photos}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', TYPE_STYLE[item.type])}>
                        {TYPE_LABEL[item.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_STYLES[item.status])}>
                        <SIcon className="h-3 w-3" />{STATUS_LABEL[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div>Réception: {fmtDate(item.receptionDate)}</div>
                      <div>Expiration: {fmtDate(item.expiryDate)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setDetail(item)}
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                          title="Voir détails"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Supprimer la fiche ${item.reference} ?`))
                                deleteMutation.mutate(item.id);
                            }}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {meta && meta.lastPage > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-sm text-gray-500">{meta.total} fiche{meta.total > 1 ? 's' : ''}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
                <span className="flex items-center text-sm text-gray-500">Page {page} / {meta.lastPage}</span>
                <Button size="sm" variant="ghost" disabled={page >= meta.lastPage} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} />
      {detail && (
        <DetailModal
          key={detail.id}
          record={detail}
          open={!!detail}
          onClose={() => setDetail(null)}
        />
      )}
    </PageWrapper>
  );
}
