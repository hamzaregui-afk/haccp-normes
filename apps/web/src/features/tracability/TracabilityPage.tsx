import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  ImageOff,
  Layers,
  Package,
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
import { EmptyState } from '@/components/ui/EmptyState';
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
  url:        string;
  caption?:   string | null;
  uploadedAt: string;
}

interface Tracability {
  id:           string;
  reference:    string;
  type:         TracabilityType;
  status:       TracabilityStatus;
  lotNumber:    string;
  productName:  string;
  supplierId?:  string | null;
  siteId?:      string | null;
  quantity?:    number | null;
  unit?:        string | null;
  receptionDate?: string | null;
  expiryDate?:  string | null;
  temperature?: number | null;
  notes?:       string | null;
  createdById:  string;
  createdAt:    string;
  photos?:      TracabilityPhoto[];
  _count?:      { photos: number };
}

interface Stats {
  total: number; inProgress: number; completed: number; cancelled: number; totalPhotos: number;
}

// ─── Style maps (values — labels come from i18n) ──────────────────────────────

const STATUS_STYLES: Record<TracabilityStatus, string> = {
  IN_PROGRESS: 'bg-orange-100 text-orange-700 border border-orange-200',
  COMPLETED:   'bg-green-100 text-green-700 border border-green-200',
  CANCELLED:   'bg-gray-100 text-gray-600 border border-gray-200',
};

const STATUS_ICONS: Record<TracabilityStatus, React.ElementType> = {
  IN_PROGRESS: Clock,
  COMPLETED:   CheckCircle2,
  CANCELLED:   XCircle,
};

const TYPE_STYLES: Record<TracabilityType, string> = {
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

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Photo upload helpers ─────────────────────────────────────────────────────

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

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps { label: string; value: number; icon: React.ElementType; color: string }
function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', color)}>
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

interface CreateModalProps { onClose: () => void }

function CreateTracabilityModal({ onClose }: CreateModalProps) {
  const qc = useQueryClient();
  const [type, setType]           = useState<TracabilityType>('RECEPTION');
  const [lotNumber, setLotNumber] = useState('');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity]   = useState('');
  const [unit, setUnit]           = useState('');
  const [receptionDate, setReceptionDate] = useState('');
  const [expiryDate, setExpiryDate]       = useState('');
  const [temperature, setTemperature]     = useState('');
  const [notes, setNotes]         = useState('');
  const [photos, setPhotos]       = useState<File[]>([]);
  const [previews, setPreviews]   = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await tracabilityApi.create({
        type,
        lotNumber:    lotNumber.trim(),
        productName:  productName.trim(),
        quantity:     quantity ? parseFloat(quantity) : undefined,
        unit:         unit.trim() || undefined,
        receptionDate: receptionDate ? new Date(receptionDate) : undefined,
        expiryDate:    expiryDate    ? new Date(expiryDate)    : undefined,
        temperature:  temperature ? parseFloat(temperature) : undefined,
        notes:        notes.trim() || undefined,
      });
      // Upload photos after creating the record
      if (photos.length > 0) {
        const id = (result.data as { id: string }).id;
        await Promise.allSettled(photos.map((f) => tracabilityApi.uploadPhoto(id, f)));
      }
      return result;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracabilities'] });
      void qc.invalidateQueries({ queryKey: ['tracability-stats'] });
      showToast('Fiche de traçabilité créée', 'success');
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la création';
      showToast(msg, 'error');
    },
  });

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const compressed = await Promise.all(arr.map(compressImage));
    setPhotos((p) => [...p, ...compressed]);
    const newPreviews = compressed.map((f) => URL.createObjectURL(f));
    setPreviews((p) => [...p, ...newPreviews]);
  }, []);

  const removePhoto = (idx: number) => {
    URL.revokeObjectURL(previews[idx]);
    setPhotos((p) => p.filter((_, i) => i !== idx));
    setPreviews((p) => p.filter((_, i) => i !== idx));
  };

  const valid = lotNumber.trim().length > 0 && productName.trim().length > 0;

  return (
    <Modal title="Nouvelle fiche de traçabilité" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
          <Select
            value={type}
            onChange={(v) => setType(v as TracabilityType)}
            options={Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))}
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
              onChange={(e) => setLotNumber(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produit *</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              placeholder="Nom du produit"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
          </div>
        </div>

        {/* Quantity / Unit / Temperature */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantité</label>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unité</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              placeholder="kg, L, unités..."
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Température (°C)</label>
            <input
              type="number"
              step="0.1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              placeholder="ex: 4"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date réception</label>
            <input
              type="date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              value={receptionDate}
              onChange={(e) => setReceptionDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date d'expiration (DLC)</label>
            <input
              type="date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observations</label>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium resize-none"
            placeholder="Observations, anomalies constatées..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Photo upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Photos ({photos.length})
          </label>
          <div
            className="relative flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-brand-medium hover:bg-brand-medium/5 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void addFiles(e.dataTransfer.files); }}
          >
            <Upload className="h-6 w-6 text-gray-400" />
            <p className="text-sm text-gray-500">
              Glisser-déposer ou <span className="text-brand-medium font-medium">parcourir</span>
            </p>
            <p className="text-xs text-gray-400">JPEG, PNG, WEBP — 20 Mo max par fichier</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
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
                    onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
            loading={mutation.isPending}
          >
            Créer la fiche
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

interface DetailModalProps { tracability: Tracability; onClose: () => void }

function DetailModal({ tracability: initial, onClose }: DetailModalProps) {
  const qc     = useQueryClient();
  const role   = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN' || role === 'OPERATOR';

  const { data } = useQuery({
    queryKey: ['tracability', initial.id],
    queryFn:  () => tracabilityApi.get(initial.id).then((r) => r.data as Tracability),
    initialData: initial,
  });
  const rec = data ?? initial;

  const [selectedPhoto, setSelectedPhoto] = useState<TracabilityPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const arr       = Array.from(files).filter((f) => f.type.startsWith('image/'));
      const compressed = await Promise.all(arr.map(compressImage));
      await Promise.all(compressed.map((f) => tracabilityApi.uploadPhoto(rec.id, f)));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracability', rec.id] });
      void qc.invalidateQueries({ queryKey: ['tracabilities'] });
    },
    onError: () => showToast('Erreur lors du téléversement', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => tracabilityApi.deletePhoto(rec.id, photoId),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['tracability', rec.id] });
      void qc.invalidateQueries({ queryKey: ['tracabilities'] });
      setSelectedPhoto(null);
    },
    onError: () => showToast('Erreur lors de la suppression', 'error'),
  });

  const completeMutation = useMutation({
    mutationFn: () => tracabilityApi.update(rec.id, { status: 'COMPLETED' }),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['tracability', rec.id] });
      void qc.invalidateQueries({ queryKey: ['tracabilities'] });
      void qc.invalidateQueries({ queryKey: ['tracability-stats'] });
      showToast('Fiche clôturée', 'success');
    },
    onError: () => showToast('Erreur', 'error'),
  });

  const StatusIcon = STATUS_ICONS[rec.status];

  return (
    <Modal title={rec.reference} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-5">
        {/* Header badges */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', STATUS_STYLES[rec.status])}>
            <StatusIcon className="h-3.5 w-3.5" />
            {STATUS_LABEL[rec.status]}
          </span>
          <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', TYPE_STYLES[rec.type])}>
            {TYPE_LABEL[rec.type]}
          </span>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
          <div><span className="font-medium text-gray-500">N° de lot :</span> <span className="ml-1 text-gray-900">{rec.lotNumber}</span></div>
          <div><span className="font-medium text-gray-500">Produit :</span> <span className="ml-1 text-gray-900">{rec.productName}</span></div>
          {rec.quantity != null && (
            <div><span className="font-medium text-gray-500">Quantité :</span> <span className="ml-1 text-gray-900">{rec.quantity} {rec.unit ?? ''}</span></div>
          )}
          {rec.temperature != null && (
            <div><span className="font-medium text-gray-500">Température :</span> <span className="ml-1 text-gray-900">{rec.temperature}°C</span></div>
          )}
          <div><span className="font-medium text-gray-500">Réception :</span> <span className="ml-1 text-gray-900">{formatDate(rec.receptionDate)}</span></div>
          <div><span className="font-medium text-gray-500">Expiration :</span> <span className="ml-1 text-gray-900">{formatDate(rec.expiryDate)}</span></div>
          <div className="col-span-2"><span className="font-medium text-gray-500">Créé le :</span> <span className="ml-1 text-gray-900">{formatDateTime(rec.createdAt)}</span></div>
          {rec.notes && (
            <div className="col-span-2">
              <span className="font-medium text-gray-500">Observations :</span>
              <p className="mt-1 rounded-lg bg-white p-2 text-gray-700 border border-gray-200">{rec.notes}</p>
            </div>
          )}
        </div>

        {/* Photos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Photos ({rec.photos?.length ?? 0})
            </h3>
            {canEdit && rec.status === 'IN_PROGRESS' && (
              <>
                <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} loading={uploadMutation.isPending}>
                  <Camera className="h-4 w-4 mr-1" />
                  Ajouter
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => { if (e.target.files) void uploadMutation.mutateAsync(e.target.files); }}
                />
              </>
            )}
          </div>

          {!rec.photos?.length ? (
            <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
              <ImageOff className="h-8 w-8" />
              <p className="text-sm">Aucune photo</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {rec.photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setSelectedPhoto(photo)}
                  className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 hover:border-brand-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-medium"
                >
                  <img src={photo.url} alt={photo.caption ?? ''} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <div />
          <div className="flex gap-2">
            {canEdit && rec.status === 'IN_PROGRESS' && (
              <Button
                onClick={() => completeMutation.mutate()}
                loading={completeMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Clôturer
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>Fermer</Button>
          </div>
        </div>
      </div>

      {/* Photo lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img src={selectedPhoto.url} alt="" className="max-h-[80vh] max-w-[80vw] object-contain rounded-lg" />
            {canEdit && (
              <button
                className="absolute top-2 right-2 rounded-full bg-red-600 p-2 text-white hover:bg-red-700"
                onClick={() => deleteMutation.mutate(selectedPhoto.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              className="absolute top-2 left-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              onClick={() => setSelectedPhoto(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TracabilityPage() {
  const { t }  = useTranslation();
  const role   = useAuthStore((s) => s.user?.role);
  const canCreate = role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN' || role === 'OPERATOR';
  const canDelete = role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN';

  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]                 = useState(1);
  const [showCreate, setShowCreate]     = useState(false);
  const [detail, setDetail]             = useState<Tracability | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const qc = useQueryClient();

  const { data: statsData } = useQuery({
    queryKey: ['tracability-stats'],
    queryFn:  () => tracabilityApi.stats().then((r) => r.data as Stats),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['tracabilities', page, debouncedSearch, typeFilter, statusFilter],
    queryFn:  () => tracabilityApi.list({
      page,
      limit: 20,
      search:  debouncedSearch || undefined,
      type:    (typeFilter   as never) || undefined,
      status:  (statusFilter as never) || undefined,
    }).then((r) => r as { data: Tracability[]; meta: { total: number; lastPage: number } }),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tracabilityApi.remove(id),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['tracabilities'] });
      void qc.invalidateQueries({ queryKey: ['tracability-stats'] });
      showToast('Fiche supprimée', 'success');
    },
    onError: () => showToast('Erreur lors de la suppression', 'error'),
  });

  const stats = statsData;
  const items = data?.data ?? [];
  const meta  = data?.meta;

  return (
    <PageWrapper>
      <Header
        title="Traçabilité"
        subtitle="Fiches de traçabilité des lots et produits"
        actions={
          canCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Nouvelle fiche
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
          <StatCard label="Total" value={stats.total} icon={Layers} color="bg-blue-50 text-blue-600" />
          <StatCard label="En cours" value={stats.inProgress} icon={Clock} color="bg-orange-50 text-orange-600" />
          <StatCard label="Terminés" value={stats.completed} icon={CheckCircle2} color="bg-green-50 text-green-600" />
          <StatCard label="Photos" value={stats.totalPhotos} icon={Camera} color="bg-purple-50 text-purple-600" />
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            placeholder="Rechercher lot, produit, référence..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); setPage(1); }}
          options={[
            { value: '', label: 'Tous les types' },
            ...Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v })),
          ]}
        />
        <Select
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          options={[
            { value: '', label: 'Tous les statuts' },
            ...Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v })),
          ]}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-medium border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Archive className="h-10 w-10 text-gray-400" />}
          title="Aucune fiche de traçabilité"
          description={search ? 'Aucun résultat pour votre recherche.' : 'Créez votre première fiche de traçabilité.'}
          action={canCreate ? <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />Nouvelle fiche</Button> : undefined}
        />
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
              {items.map((item) => {
                const StatusIcon = STATUS_ICONS[item.status];
                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-gray-700">{item.reference}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.productName}</div>
                      <div className="text-xs text-gray-500">Lot: {item.lotNumber}</div>
                      {item._count?.photos ? (
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                          <Camera className="h-3 w-3" />
                          {item._count.photos}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', TYPE_STYLES[item.type])}>
                        {TYPE_LABEL[item.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_STYLES[item.status])}>
                        <StatusIcon className="h-3 w-3" />
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div>Réception: {formatDate(item.receptionDate)}</div>
                      <div>Expiration: {formatDate(item.expiryDate)}</div>
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
                              if (confirm(`Supprimer la fiche ${item.reference} ?`))
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

          {/* Pagination */}
          {meta && meta.lastPage > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-sm text-gray-500">
                {meta.total} fiche{meta.total > 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
                <span className="flex items-center text-sm text-gray-500">Page {page} / {meta.lastPage}</span>
                <Button size="sm" variant="ghost" disabled={page >= meta.lastPage} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateTracabilityModal onClose={() => setShowCreate(false)} />}
      {detail      && <DetailModal tracability={detail} onClose={() => setDetail(null)} />}
    </PageWrapper>
  );
}
