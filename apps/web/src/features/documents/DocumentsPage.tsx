/**
 * DocumentsPage — Gestion Électronique de Documents (GED)
 *
 * Tabs:
 *  - Bibliothèque  → unified doc library: search + filter + drag-drop upload + grid/list view
 *  - Demandes      → request docs (all users create, admins fulfil/reject)
 *  - Photos NC     → photos from non-conformities
 *  - Rapports      → validated HACCP reports
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Book,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Grid3X3,
  LayoutList,
  Lock,
  MessageSquarePlus,
  ScrollText,
  Search,
  Send,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/store/auth.store';
import { useTenantId } from '@/hooks/useTenantId';

// ─── Domain types ─────────────────────────────────────────────────────────────

type DocumentCategory  = 'PROCEDURE' | 'RECIPE' | 'OTHER';
type DocRequestStatus  = 'PENDING' | 'FULFILLED' | 'REJECTED';
type ViewMode          = 'grid' | 'list';
type GedTab            = 'library' | 'requests' | 'nc_photos' | 'reports';

interface GedDocument {
  id:        string;
  name:      string;
  category:  DocumentCategory;
  mimeType:  string;
  sizeBytes: number;
  url:       string;
  createdAt: string;
}

interface DocRequest {
  id:          string;
  requesterId: string;
  title:       string;
  description?: string;
  category?:   DocumentCategory;
  status:      DocRequestStatus;
  fulfillerId?: string;
  documentId?:  string;
  createdAt:   string;
  updatedAt:   string;
}

interface NCPhoto { id: string; url: string; uploadedAt: string }
interface NonConformity {
  id: string; reference: string; status: string;
  severity: string; createdAt: string; photos: NCPhoto[];
}
interface Report {
  id: string; type: string; status: string;
  createdAt: string; fileUrl?: string;
}

interface ApiResponse<T> {
  data: T;
  meta?: { total: number; page: number; limit: number; lastPage: number };
}

// ─── Constants (CSS-only — safe at module level) ───────────────────────────────

const ADMIN_ROLES = new Set(['ADMIN', 'MANAGER', 'SUPER_ADMIN']);

/** CSS colour + icon only — no translated label here. */
const CATEGORY_META: Record<DocumentCategory, { color: string; icon: React.ElementType }> = {
  PROCEDURE: { color: 'bg-blue-100 text-blue-700',   icon: FileText },
  RECIPE:    { color: 'bg-green-100 text-green-700', icon: Book },
  OTHER:     { color: 'bg-gray-100 text-gray-600',   icon: FolderOpen },
};

/** CSS colour + icon only — no translated label here. */
const REQUEST_STATUS_META: Record<DocRequestStatus, { color: string; icon: React.ElementType }> = {
  PENDING:   { color: 'bg-orange-100 text-orange-700', icon: Clock },
  FULFILLED: { color: 'bg-green-100 text-green-700',   icon: Check },
  REJECTED:  { color: 'bg-red-100 text-red-700',       icon: XCircle },
};

const REPORT_STATUS_STYLES: Record<string, string> = {
  PENDING:       'bg-gray-100 text-gray-600',
  UNDER_REVIEW:  'bg-yellow-100 text-yellow-700',
  VALIDATED:     'bg-green-100 text-green-700',
  SENT:          'bg-blue-100 text-blue-700',
};

const SEVERITY_BORDER: Record<string, string> = {
  LOW: 'border-gray-200', MEDIUM: 'border-yellow-300',
  HIGH: 'border-orange-400', CRITICAL: 'border-red-500',
};

const MIME_EMOJI: Record<string, string> = {
  'application/pdf': '📄',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'image/jpeg': '🖼️', 'image/png': '🖼️', 'image/webp': '🖼️',
};

function mimeEmoji(mime: string) { return MIME_EMOJI[mime] ?? '📁'; }
function formatBytes(b: number) {
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
  return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={url}
        alt=""
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

function useDocuments(category: DocumentCategory | '', search: string, page: number) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['ged.documents', tenantId, category, search, page],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '24' });
      if (category) p.set('category', category);
      if (search)   p.set('search', search);
      const { data } = await api.get<ApiResponse<GedDocument[]>>(`/api/v1/documents?${p}`);
      return data;
    },
  });
}

function useDocRequests(statusFilter: DocRequestStatus | '') {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['ged.requests', tenantId, statusFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: '50' });
      if (statusFilter) p.set('status', statusFilter);
      const { data } = await api.get<ApiResponse<DocRequest[]>>(`/api/v1/document-requests?${p}`);
      return data.data ?? [];
    },
  });
}

function useNCPhotos() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['ged.nc_photos', tenantId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<NonConformity[]>>('/api/v1/nonconformities?limit=50');
      return (data.data ?? []).filter((nc) => nc.photos?.length > 0);
    },
    staleTime: 2 * 60 * 1000,
  });
}

function useReports(page: number) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['ged.reports', tenantId, page],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Report[]>>(`/api/v1/reports?page=${page}&limit=20`);
      return data;
    },
  });
}

// ─── Upload modal (with drag-and-drop) ───────────────────────────────────────

function UploadModal({
  open,
  defaultCategory,
  onClose,
}: {
  open:            boolean;
  defaultCategory: DocumentCategory;
  onClose:         () => void;
}) {
  const { t } = useTranslation();
  const queryClient  = useQueryClient();
  const tenantId     = useTenantId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [name, setName]         = useState('');
  const [category, setCategory] = useState<DocumentCategory>(defaultCategory);
  const [dragging, setDragging] = useState(false);

  const categoryEntries = useMemo(
    () =>
      (Object.entries(CATEGORY_META) as [DocumentCategory, typeof CATEGORY_META[DocumentCategory]][]).map(
        ([key, meta]) => ({ key, meta, label: t(`documents.categories.${key}` as Parameters<typeof t>[0]) }),
      ),
    [t],
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); if (!name) setName(f.name.replace(/\.[^/.]+$/, '')); }
  }, [name]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); if (!name) setName(f.name.replace(/\.[^/.]+$/, '')); }
  };

  const reset = () => { setFile(null); setName(''); setCategory(defaultCategory); };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name || file.name);
      fd.append('category', category);
      // Do NOT set Content-Type manually — browser must set it with the multipart boundary.
      await api.post('/api/v1/documents', fd);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ged.documents', tenantId] });
      reset();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); reset(); }}
      title={t('documents.uploadModal.title')}
      size="sm"
    >
      <form onSubmit={(e) => { e.preventDefault(); void uploadMutation.mutate(); }} className="space-y-4">

        {/* Drop zone */}
        <div
          className={[
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 cursor-pointer transition-colors',
            dragging
              ? 'border-brand-medium bg-brand-light/30'
              : 'border-surface-muted bg-surface-page hover:border-brand-medium',
          ].join(' ')}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? (
            <div className="text-center">
              <p className="text-2xl">{mimeEmoji(file.type)}</p>
              <p className="mt-1 text-sm font-medium text-gray-800 max-w-[200px] truncate">{file.name}</p>
              <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
            </div>
          ) : (
            <>
              <Upload className="mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">{t('documents.uploadModal.dropzone')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('documents.uploadModal.dropzoneHint')}</p>
            </>
          )}
          <input ref={fileInputRef} type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
            className="hidden" onChange={handleFileChange}
          />
        </div>

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{t('documents.uploadModal.nameLabel')}</label>
          <input
            type="text"
            placeholder={t('documents.uploadModal.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-full rounded-lg border border-surface-muted bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
        </div>

        {/* Category */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{t('documents.uploadModal.categoryLabel')}</label>
          <div className="grid grid-cols-3 gap-2">
            {categoryEntries.map(({ key, meta, label }) => {
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={[
                    'flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                    category === key
                      ? 'border-brand-medium bg-brand-light text-brand-dark'
                      : 'border-surface-muted bg-white text-gray-600 hover:border-brand-medium',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {uploadMutation.isError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            {t('documents.uploadModal.uploadError')}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-surface-muted pt-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => { onClose(); reset(); }}>
            {t('documents.uploadModal.cancel')}
          </Button>
          <Button type="submit" size="sm" loading={uploadMutation.isPending} disabled={!file}>
            <Upload className="h-3.5 w-3.5" />
            {t('documents.uploadModal.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Document card (grid mode) ────────────────────────────────────────────────

function DocCard({
  doc,
  onDelete,
  onView,
  canDelete,
}: {
  doc:       GedDocument;
  onDelete:  (id: string, name: string) => void;
  onView:    (doc: GedDocument) => void;
  canDelete: boolean;
}) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[doc.category];
  const CatIcon = meta.icon;
  const catLabel = t(`documents.categories.${doc.category}` as Parameters<typeof t>[0]);
  const isImage = doc.mimeType.startsWith('image/');

  return (
    <div className="group relative flex flex-col rounded-xl border border-surface-muted bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Preview area */}
      <div
        className="flex h-28 cursor-pointer items-center justify-center bg-surface-page text-4xl"
        onClick={() => onView(doc)}
      >
        {isImage ? (
          <img src={doc.url} alt={doc.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          mimeEmoji(doc.mimeType)
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-semibold text-gray-900" title={doc.name}>{doc.name}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.color}`}>
            <CatIcon className="h-2.5 w-2.5" />
            {catLabel}
          </span>
          <span className="text-[10px] text-gray-400">{formatBytes(doc.sizeBytes)}</span>
        </div>
        <p className="text-[10px] text-gray-400">{new Date(doc.createdAt).toLocaleDateString('fr-FR')}</p>
      </div>

      {/* Action buttons */}
      <div className="flex border-t border-surface-muted">
        <button
          type="button"
          onClick={() => onView(doc)}
          className="flex flex-1 items-center justify-center gap-1.5 py-2 text-xs text-gray-500 hover:bg-surface-page hover:text-brand-medium transition-colors"
        >
          {isImage ? <Eye className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
          {isImage ? t('documents.card.view') : t('documents.card.open')}
        </button>
        {canDelete && (
          <>
            <div className="w-px bg-surface-muted" />
            <button
              type="button"
              onClick={() => onDelete(doc.id, doc.name)}
              className="flex items-center justify-center px-3 py-2 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Document row (list mode) ─────────────────────────────────────────────────

function DocRow({
  doc,
  onDelete,
  onView,
  canDelete,
}: {
  doc:       GedDocument;
  onDelete:  (id: string, name: string) => void;
  onView:    (doc: GedDocument) => void;
  canDelete: boolean;
}) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[doc.category];
  const CatIcon = meta.icon;
  const catLabel = t(`documents.categories.${doc.category}` as Parameters<typeof t>[0]);
  const isImage = doc.mimeType.startsWith('image/');

  return (
    <tr className="hover:bg-surface-page transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">{mimeEmoji(doc.mimeType)}</span>
          <span className="font-medium text-gray-900 text-sm">{doc.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.color}`}>
          <CatIcon className="h-3 w-3" />
          {catLabel}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">{formatBytes(doc.sizeBytes)}</td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onView(doc)}
            className="flex items-center gap-1 text-xs text-brand-medium hover:underline"
          >
            {isImage ? <Eye className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
            {isImage ? t('documents.card.view') : t('documents.card.open')}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(doc.id, doc.name)}
              className="text-xs text-red-400 hover:text-red-600 hover:underline"
            >
              {t('documents.card.delete')}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Library tab ──────────────────────────────────────────────────────────────

function LibraryTab({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation();
  const queryClient  = useQueryClient();
  const tenantId     = useTenantId();

  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState('');
  const [catFilter, setCatFilter] = useState<DocumentCategory | ''>('');
  const [viewMode, setViewMode]   = useState<ViewMode>('grid');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data, isLoading, isError } = useDocuments(catFilter, search, page);
  const docs = data?.data ?? [];

  const categoryEntries = useMemo(
    () =>
      (Object.entries(CATEGORY_META) as [DocumentCategory, typeof CATEGORY_META[DocumentCategory]][]).map(
        ([key]) => ({ key, label: t(`documents.categories.${key}` as Parameters<typeof t>[0]) }),
      ),
    [t],
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/documents/${id}`),
    onSuccess:  () => void queryClient.invalidateQueries({ queryKey: ['ged.documents', tenantId] }),
    onError: () => showToast({ title: t('documents.deleteError'), variant: 'error' }),
  });

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(t('documents.deleteConfirm', { name }))) void deleteMutation.mutate(id);
  };

  const handleView = (doc: GedDocument) => {
    if (doc.mimeType.startsWith('image/')) setLightboxUrl(doc.url);
    else window.open(doc.url, '_blank');
  };

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t('documents.toolbar.searchPlaceholder')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-9 w-52 rounded-lg border border-surface-muted bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>

          {/* Category filter */}
          <div className="relative">
            <select
              value={catFilter}
              onChange={(e) => { setCatFilter(e.target.value as DocumentCategory | ''); setPage(1); }}
              className="h-9 appearance-none rounded-lg border border-surface-muted bg-white pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            >
              <option value="">{t('documents.toolbar.allCategories')}</option>
              {categoryEntries.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-surface-muted bg-white">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`rounded-l-lg p-2 transition-colors ${viewMode === 'grid' ? 'bg-brand-light text-brand-dark' : 'text-gray-400 hover:text-gray-700'}`}
              title={t('documents.toolbar.viewGrid')}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded-r-lg p-2 transition-colors ${viewMode === 'list' ? 'bg-brand-light text-brand-dark' : 'text-gray-400 hover:text-gray-700'}`}
              title={t('documents.toolbar.viewList')}
            >
              <LayoutList className="h-4 w-4" />
            </button>
          </div>

          {isAdmin && (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              {t('documents.toolbar.uploadBtn')}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">{t('documents.loading')}</div>
      ) : isError ? (
        <div className="py-20 text-center text-sm text-red-500">{t('documents.loadError')}</div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={t('documents.emptyLibrary.title')}
          description={isAdmin
            ? t('documents.emptyLibrary.descAdmin')
            : t('documents.emptyLibrary.descUser')}
          {...(isAdmin ? { actionLabel: t('documents.emptyLibrary.action'), onAction: () => setUploadOpen(true) } : {})}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {docs.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onDelete={handleDelete}
              onView={handleView}
              canDelete={isAdmin}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">{t('documents.table.name')}</th>
                <th className="px-4 py-3">{t('documents.table.category')}</th>
                <th className="px-4 py-3">{t('documents.table.size')}</th>
                <th className="px-4 py-3">{t('documents.table.date')}</th>
                <th className="px-4 py-3 text-right">{t('documents.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-muted">
              {docs.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  onDelete={handleDelete}
                  onView={handleView}
                  canDelete={isAdmin}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data?.meta && data.meta.lastPage > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            {t('documents.documentCount', { count: data.meta.total })}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {t('documents.pagination.previous')}
            </Button>
            <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>
              {t('documents.pagination.next')}
            </Button>
          </div>
        </div>
      )}

      <UploadModal open={uploadOpen} defaultCategory={catFilter || 'OTHER'} onClose={() => setUploadOpen(false)} />

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </>
  );
}

// ─── New request modal ────────────────────────────────────────────────────────

function NewRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tenantId    = useTenantId();
  const [title, setTitle]         = useState('');
  const [description, setDesc]    = useState('');
  const [category, setCategory]   = useState<DocumentCategory | ''>('');

  const categoryEntries = useMemo(
    () =>
      (Object.entries(CATEGORY_META) as [DocumentCategory, typeof CATEGORY_META[DocumentCategory]][]).map(
        ([key, meta]) => ({ key, meta, label: t(`documents.categories.${key}` as Parameters<typeof t>[0]) }),
      ),
    [t],
  );

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/v1/document-requests', {
      title,
      description: description || undefined,
      category:    category || undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ged.requests', tenantId] });
      setTitle(''); setDesc(''); setCategory('');
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={t('documents.requestModal.title')} size="sm">
      <form
        onSubmit={(e) => { e.preventDefault(); void createMutation.mutate(); }}
        className="space-y-4"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('documents.requestModal.titleLabel')} <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="text"
            placeholder={t('documents.requestModal.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 w-full rounded-lg border border-surface-muted bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{t('documents.requestModal.descriptionLabel')}</label>
          <textarea
            rows={3}
            placeholder={t('documents.requestModal.descriptionPlaceholder')}
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full resize-none rounded-lg border border-surface-muted bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{t('documents.requestModal.categoryLabel')}</label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setCategory('')}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${!category ? 'border-brand-medium bg-brand-light text-brand-dark' : 'border-surface-muted bg-white text-gray-600 hover:border-brand-medium'}`}
            >
              {t('documents.requestModal.categoryNone')}
            </button>
            {categoryEntries.map(({ key, meta, label }) => {
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${category === key ? 'border-brand-medium bg-brand-light text-brand-dark' : 'border-surface-muted bg-white text-gray-600 hover:border-brand-medium'}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {createMutation.isError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{t('documents.requestModal.error')}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-surface-muted pt-3">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {t('documents.requestModal.cancel')}
          </Button>
          <Button type="submit" size="sm" loading={createMutation.isPending} disabled={!title.trim()}>
            <Send className="h-3.5 w-3.5" />
            {t('documents.requestModal.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Fulfill request modal (admin only) ───────────────────────────────────────

function FulfillModal({
  request,
  open,
  onClose,
}: {
  request: DocRequest | null;
  open:    boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tenantId    = useTenantId();
  const [action, setAction] = useState<'FULFILLED' | 'REJECTED'>('FULFILLED');

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/document-requests/${request!.id}`, { status: action }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ged.requests', tenantId] });
      onClose();
    },
  });

  if (!request) return null;

  const catLabel = request.category
    ? t(`documents.categories.${request.category}` as Parameters<typeof t>[0])
    : null;
  const catColor = request.category ? CATEGORY_META[request.category].color : '';

  return (
    <Modal open={open} onClose={onClose} title={t('documents.fulfillModal.title')} size="sm">
      <div className="mb-4 rounded-lg border border-surface-muted bg-surface-page p-3">
        <p className="text-sm font-semibold text-gray-900">{request.title}</p>
        {request.description && (
          <p className="mt-1 text-xs text-gray-500">{request.description}</p>
        )}
        {catLabel && (
          <span className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${catColor}`}>
            {catLabel}
          </span>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAction('FULFILLED')}
          className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors ${action === 'FULFILLED' ? 'border-green-400 bg-green-50 text-green-700' : 'border-surface-muted bg-white text-gray-600 hover:border-green-300'}`}
        >
          <Check className="h-4 w-4" />
          {t('documents.fulfillModal.fulfill')}
        </button>
        <button
          type="button"
          onClick={() => setAction('REJECTED')}
          className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors ${action === 'REJECTED' ? 'border-red-400 bg-red-50 text-red-700' : 'border-surface-muted bg-white text-gray-600 hover:border-red-300'}`}
        >
          <XCircle className="h-4 w-4" />
          {t('documents.fulfillModal.reject')}
        </button>
      </div>

      {action === 'FULFILLED' && (
        <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          {t('documents.fulfillModal.fulfillHint')}
        </p>
      )}

      {updateMutation.isError && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {t('documents.fulfillModal.error')}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-surface-muted pt-3">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          {t('documents.fulfillModal.cancel')}
        </Button>
        <Button
          size="sm"
          loading={updateMutation.isPending}
          onClick={() => void updateMutation.mutate()}
          className={action === 'REJECTED' ? 'bg-red-600 hover:bg-red-700' : ''}
        >
          {action === 'FULFILLED'
            ? <><Check className="h-3.5 w-3.5" />{t('documents.fulfillModal.fulfill')}</>
            : <><XCircle className="h-3.5 w-3.5" />{t('documents.fulfillModal.reject')}</>}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Requests tab ─────────────────────────────────────────────────────────────

function RequestsTab({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation();

  const [statusFilter, setStatusFilter] = useState<DocRequestStatus | ''>('');
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [selectedReq, setSelectedReq]  = useState<DocRequest | null>(null);

  const { data: requests, isLoading, isError } = useDocRequests(statusFilter);

  const statusFilterOptions = useMemo(
    () => [
      { value: '' as DocRequestStatus | '',          label: t('documents.statusFilter.all') },
      { value: 'PENDING' as DocRequestStatus,        label: t('documents.statusFilter.PENDING') },
      { value: 'FULFILLED' as DocRequestStatus,      label: t('documents.statusFilter.FULFILLED') },
      { value: 'REJECTED' as DocRequestStatus,       label: t('documents.statusFilter.REJECTED') },
    ],
    [t],
  );

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DocRequestStatus | '')}
              className="h-9 appearance-none rounded-lg border border-surface-muted bg-white pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            >
              {statusFilterOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          {isAdmin && (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
              {t('documents.requestsTab.adminBadge')}
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => setNewModalOpen(true)}>
          <MessageSquarePlus className="h-4 w-4" />
          {t('documents.requestsTab.soliciteBtn')}
        </Button>
      </div>

      {/* Info banner for non-admins */}
      {!isAdmin && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t('documents.requestsTab.privateInfo')}</span>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">{t('documents.loading')}</div>
      ) : isError ? (
        <div className="py-20 text-center text-sm text-red-500">{t('documents.loadError')}</div>
      ) : !requests || requests.length === 0 ? (
        <EmptyState
          icon={MessageSquarePlus}
          title={t('documents.requestsTab.emptyTitle')}
          description={t('documents.requestsTab.emptyDesc')}
          actionLabel={t('documents.requestsTab.soliciteBtn')}
          onAction={() => setNewModalOpen(true)}
        />
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const statusMeta = REQUEST_STATUS_META[req.status];
            const StatusIcon = statusMeta.icon;
            const statusLabel = t(`documents.status.${req.status}` as Parameters<typeof t>[0]);
            const catLabel    = req.category
              ? t(`documents.categories.${req.category}` as Parameters<typeof t>[0])
              : null;
            const catColor = req.category ? CATEGORY_META[req.category].color : '';

            return (
              <div
                key={req.id}
                className="flex items-start gap-4 rounded-xl border border-surface-muted bg-white p-4 shadow-sm"
              >
                {/* Status icon */}
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${statusMeta.color}`}>
                  <StatusIcon className="h-4 w-4" />
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm">{req.title}</p>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusMeta.color}`}>
                      {statusLabel}
                    </span>
                    {catLabel && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${catColor}`}>
                        {catLabel}
                      </span>
                    )}
                  </div>
                  {req.description && (
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2">{req.description}</p>
                  )}
                  <p className="mt-1 text-[10px] text-gray-400">
                    {t('documents.requestsTab.requestedOn', {
                      date: new Date(req.createdAt).toLocaleDateString('fr-FR'),
                    })}
                  </p>
                </div>

                {/* Admin action */}
                {isAdmin && req.status === 'PENDING' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedReq(req)}
                  >
                    {t('documents.requestsTab.treat')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <NewRequestModal open={newModalOpen} onClose={() => setNewModalOpen(false)} />

      <FulfillModal
        key={selectedReq?.id}
        request={selectedReq}
        open={selectedReq !== null}
        onClose={() => setSelectedReq(null)}
      />
    </>
  );
}

// ─── NC Photos tab ────────────────────────────────────────────────────────────

function NCPhotosTab() {
  const { t } = useTranslation();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const { data: ncs, isLoading, isError } = useNCPhotos();

  if (isLoading) return <div className="py-20 text-center text-sm text-gray-400">{t('documents.loading')}</div>;
  if (isError)   return <div className="py-20 text-center text-sm text-red-500">{t('documents.loadError')}</div>;
  if (!ncs?.length) {
    return (
      <EmptyState
        icon={Camera}
        title={t('documents.ncPhotosTab.emptyTitle')}
        description={t('documents.ncPhotosTab.emptyDesc')}
      />
    );
  }

  return (
    <>
      <div className="space-y-6">
        {ncs.map((nc) => {
          const photoCount = nc.photos.length;
          const photoCountLabel = t('documents.ncPhotosTab.photoCount', { count: photoCount });
          return (
            <div
              key={nc.id}
              className={`rounded-xl border-l-4 ${SEVERITY_BORDER[nc.severity] ?? 'border-gray-200'} border border-surface-muted bg-white p-4 shadow-sm`}
            >
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <Camera className="h-4 w-4 text-brand-medium shrink-0" />
                <code className="rounded bg-surface-page px-1.5 py-0.5 text-xs font-mono text-brand-dark">
                  {nc.reference}
                </code>
                <span className="text-xs text-gray-400">
                  · {new Date(nc.createdAt).toLocaleDateString('fr-FR')}
                  · {photoCountLabel}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {nc.photos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setLightboxUrl(photo.url)}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-surface-muted bg-gray-50 hover:border-brand-medium transition-colors"
                  >
                    <img
                      src={photo.url}
                      alt={t('documents.ncPhotosTab.photoAlt')}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                      <Eye className="h-4 w-4 text-white" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </>
  );
}

// ─── Reports tab ──────────────────────────────────────────────────────────────

function ReportsTab() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useReports(page);
  const reports = data?.data ?? [];

  if (isLoading) return <div className="py-20 text-center text-sm text-gray-400">{t('documents.loading')}</div>;
  if (isError)   return <div className="py-20 text-center text-sm text-red-500">{t('documents.loadError')}</div>;
  if (!reports.length) {
    return (
      <EmptyState
        icon={ScrollText}
        title={t('documents.reportsTab.emptyTitle')}
        description={t('documents.reportsTab.emptyDesc')}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-muted bg-surface-page text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3">{t('documents.reportsTab.colType')}</th>
            <th className="px-4 py-3">{t('documents.reportsTab.colStatus')}</th>
            <th className="px-4 py-3">{t('documents.reportsTab.colDate')}</th>
            <th className="px-4 py-3 text-right">{t('documents.reportsTab.colActions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-muted">
          {reports.map((report) => {
            const typeLabel   = t(`documents.reportType.${report.type}` as Parameters<typeof t>[0], { defaultValue: report.type });
            const statusLabel = t(`documents.reportStatus.${report.status}` as Parameters<typeof t>[0], { defaultValue: report.status });

            return (
              <tr key={report.id} className="hover:bg-surface-page transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {typeLabel}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${REPORT_STATUS_STYLES[report.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {statusLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(report.createdAt).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-right">
                  {report.fileUrl && (
                    <a
                      href={report.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand-medium hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t('documents.reportsTab.download')}
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {data?.meta && data.meta.lastPage > 1 && (
        <div className="flex items-center justify-between border-t border-surface-muted px-4 py-3 text-sm text-gray-500">
          <span>{t('documents.pagination.pageOf', { page: data.meta.page, lastPage: data.meta.lastPage })}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {t('documents.pagination.previous')}
            </Button>
            <Button variant="secondary" size="sm" disabled={page === data.meta.lastPage} onClick={() => setPage((p) => p + 1)}>
              {t('documents.pagination.next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TAB_KEYS: { key: GedTab; icon: React.ElementType }[] = [
  { key: 'library',   icon: FolderOpen },
  { key: 'requests',  icon: MessageSquarePlus },
  { key: 'nc_photos', icon: Camera },
  { key: 'reports',   icon: ClipboardCheck },
];

const TAB_I18N_MAP: Record<GedTab, string> = {
  library:   'documents.tabs.library',
  requests:  'documents.tabs.requests',
  nc_photos: 'documents.tabs.ncPhotos',
  reports:   'documents.tabs.reports',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<GedTab>('library');
  const user    = useAuthStore((s) => s.user);
  const isAdmin = ADMIN_ROLES.has(user?.role ?? '');

  return (
    <>
      <Header
        icon={BookOpen}
        iconColor="bg-brand-light text-brand-dark"
        title={t('documents.title')}
        subtitle={t('documents.subtitle')}
      />
      <PageWrapper>
        {/* Tab bar */}
        <div className="mb-6 flex overflow-x-auto border-b border-surface-muted">
          {TAB_KEYS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={[
                'flex items-center gap-2 whitespace-nowrap px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === key
                  ? 'border-brand-medium text-brand-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-800',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" />
              {t(TAB_I18N_MAP[key] as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'library'   && <LibraryTab  isAdmin={isAdmin} />}
        {activeTab === 'requests'  && <RequestsTab isAdmin={isAdmin} />}
        {activeTab === 'nc_photos' && <NCPhotosTab />}
        {activeTab === 'reports'   && <ReportsTab />}
      </PageWrapper>
    </>
  );
}
