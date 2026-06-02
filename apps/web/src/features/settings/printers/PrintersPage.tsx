import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Printer, Star, Trash2, Wifi, Bluetooth, Usb } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useTenantId } from '@/hooks/useTenantId';

// ─── Domain types ─────────────────────────────────────────────────────────────

type ConnectionType = 'NETWORK' | 'BLUETOOTH' | 'USB';

interface Printer {
  id:                   string;
  name:                 string;
  model:                string | null;
  connectionType:       ConnectionType;
  ipAddress:            string | null;
  port:                 number | null;
  bluetoothIdentifier:  string | null;
  isDefault:            boolean;
  isActive:             boolean;
  siteId:               string | null;
  zoneId:               string | null;
  tenantId:             string;
  createdAt:            string;
}

interface PrinterFormValues {
  name:                 string;
  model:                string;
  connectionType:       ConnectionType;
  ipAddress:            string;
  port:                 number;
  bluetoothIdentifier:  string;
  isDefault:            boolean;
  siteId:               string;
  zoneId:               string;
}

interface ApiResponse<T> {
  data: T;
  message?: string;
}

// ─── Style maps ───────────────────────────────────────────────────────────────

const CONNECTION_STYLES: Record<ConnectionType, string> = {
  NETWORK:   'bg-blue-100 text-blue-700 border border-blue-200',
  BLUETOOTH: 'bg-purple-100 text-purple-700 border border-purple-200',
  USB:       'bg-gray-100 text-gray-700 border border-gray-200',
};

const CONNECTION_ICONS: Record<ConnectionType, React.ElementType> = {
  NETWORK:   Wifi,
  BLUETOOTH: Bluetooth,
  USB:       Usb,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_FORM: PrinterFormValues = {
  name:                '',
  model:               '',
  connectionType:      'NETWORK',
  ipAddress:           '',
  port:                9100,
  bluetoothIdentifier: '',
  isDefault:           false,
  siteId:              '',
  zoneId:              '',
};

function printerToForm(p: Printer): PrinterFormValues {
  return {
    name:                p.name,
    model:               p.model ?? '',
    connectionType:      p.connectionType,
    ipAddress:           p.ipAddress ?? '',
    port:                p.port ?? 9100,
    bluetoothIdentifier: p.bluetoothIdentifier ?? '',
    isDefault:           p.isDefault,
    siteId:              p.siteId ?? '',
    zoneId:              p.zoneId ?? '',
  };
}

// ─── Printer form modal ───────────────────────────────────────────────────────

interface PrinterModalProps {
  open:     boolean;
  onClose:  () => void;
  printer?: Printer;
}

function PrinterModal({ open, onClose, printer }: PrinterModalProps) {
  const { t }  = useTranslation();
  const qc     = useQueryClient();
  const tenantId = useTenantId();

  const [form, setForm] = useState<PrinterFormValues>(
    printer ? printerToForm(printer) : EMPTY_FORM,
  );
  const [errors, setErrors] = useState<Partial<Record<keyof PrinterFormValues, string>>>({});

  const isEdit = !!printer;

  function set<K extends keyof PrinterFormValues>(key: K, value: PrinterFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof PrinterFormValues, string>> = {};
    if (!form.name.trim()) next.name = t('printers.form.name') + ' ' + t('settings.validation.required');
    if (form.connectionType === 'NETWORK' && !form.ipAddress.trim()) {
      next.ipAddress = t('printers.form.ipAddress') + ' ' + t('settings.validation.required');
    }
    if (form.connectionType === 'BLUETOOTH' && !form.bluetoothIdentifier.trim()) {
      next.bluetoothIdentifier = t('printers.form.bluetoothIdentifier') + ' ' + t('settings.validation.required');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const mutation = useMutation({
    mutationFn: (body: Partial<PrinterFormValues>) =>
      isEdit
        ? api.patch<ApiResponse<Printer>>(`/api/v1/printers/${printer.id}`, body)
        : api.post<ApiResponse<Printer>>('/api/v1/printers', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['printers', tenantId] });
      showToast({ title: isEdit ? t('printers.editPrinter') : t('printers.addPrinter'), variant: 'success' });
      onClose();
    },
    onError: () => showToast({ title: t('common.error'), variant: 'error' }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const body: Partial<PrinterFormValues> = {
      name:           form.name.trim(),
      connectionType: form.connectionType,
      isDefault:      form.isDefault,
      port:           form.port,
    };
    if (form.model.trim())               body.model               = form.model.trim();
    if (form.siteId.trim())              body.siteId              = form.siteId.trim();
    if (form.zoneId.trim())              body.zoneId              = form.zoneId.trim();
    if (form.connectionType === 'NETWORK')   body.ipAddress           = form.ipAddress.trim();
    if (form.connectionType === 'BLUETOOTH') body.bluetoothIdentifier = form.bluetoothIdentifier.trim();

    mutation.mutate(body);
  }

  const inputClass =
    'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('printers.editPrinter') : t('printers.addPrinter')}
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('printers.form.name')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="ex: Imprimante cuisine"
            className={inputClass}
          />
          {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
        </div>

        {/* Model */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{t('printers.form.model')}</label>
          <input
            type="text"
            value={form.model}
            onChange={(e) => set('model', e.target.value)}
            placeholder="ex: Zebra ZD420"
            className={inputClass}
          />
        </div>

        {/* Connection type */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{t('printers.form.connectionType')}</label>
          <select
            value={form.connectionType}
            onChange={(e) => set('connectionType', e.target.value as ConnectionType)}
            className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-medium"
          >
            <option value="NETWORK">{t('printers.connectionType.NETWORK')}</option>
            <option value="BLUETOOTH">{t('printers.connectionType.BLUETOOTH')}</option>
            <option value="USB">{t('printers.connectionType.USB')}</option>
          </select>
        </div>

        {/* NETWORK fields */}
        {form.connectionType === 'NETWORK' && (
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t('printers.form.ipAddress')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.ipAddress}
                onChange={(e) => set('ipAddress', e.target.value)}
                placeholder="192.168.1.100"
                className={inputClass}
              />
              {errors.ipAddress && <p className="text-xs text-red-600">{errors.ipAddress}</p>}
            </div>
            <div className="flex w-28 flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t('printers.form.port')}</label>
              <input
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => set('port', parseInt(e.target.value, 10) || 9100)}
                className={inputClass}
              />
            </div>
          </div>
        )}

        {/* BLUETOOTH fields */}
        {form.connectionType === 'BLUETOOTH' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('printers.form.bluetoothIdentifier')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.bluetoothIdentifier}
              onChange={(e) => set('bluetoothIdentifier', e.target.value)}
              placeholder="xx:xx:xx:xx:xx:xx"
              className={inputClass}
            />
            {errors.bluetoothIdentifier && (
              <p className="text-xs text-red-600">{errors.bluetoothIdentifier}</p>
            )}
          </div>
        )}

        {/* Site / Zone */}
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Site</label>
            <input
              type="text"
              value={form.siteId}
              onChange={(e) => set('siteId', e.target.value)}
              placeholder="ID du site"
              className={inputClass}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Zone</label>
            <input
              type="text"
              value={form.zoneId}
              onChange={(e) => set('zoneId', e.target.value)}
              placeholder="ID de la zone"
              className={inputClass}
            />
          </div>
        </div>

        {/* Default checkbox */}
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(e) => set('isDefault', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-medium focus:ring-brand-medium"
          />
          <span className="text-sm text-gray-700">{t('printers.form.isDefault')}</span>
        </label>

        {mutation.isError && (
          <p className="text-sm text-red-600">{t('common.error')}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('printers.form.cancel')}
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {isEdit ? t('printers.form.save') : t('printers.form.add')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

interface DeleteModalProps {
  printer:  Printer;
  onClose:  () => void;
}

function DeleteModal({ printer, onClose }: DeleteModalProps) {
  const { t }    = useTranslation();
  const qc       = useQueryClient();
  const tenantId = useTenantId();

  const mutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/printers/${printer.id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['printers', tenantId] });
      showToast({ title: t('printers.deletePrinter'), variant: 'success' });
      onClose();
    },
    onError: () => showToast({ title: t('common.error'), variant: 'error' }),
  });

  return (
    <Modal open onClose={onClose} title={t('printers.deletePrinter')} size="sm">
      <p className="text-sm text-gray-700">
        {t('printers.deleteConfirm', { name: printer.name })}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('printers.form.cancel')}</Button>
        <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}>
          {t('printers.deletePrinter')}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrintersPage() {
  const { t }      = useTranslation();
  const tenantId   = useTenantId();
  const qc         = useQueryClient();
  const user       = useAuthStore((s) => s.user);
  const canManage  = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [showAdd, setShowAdd]               = useState(false);
  const [editTarget, setEditTarget]         = useState<Printer | null>(null);
  const [deleteTarget, setDeleteTarget]     = useState<Printer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['printers', tenantId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Printer[]>>('/api/v1/printers');
      return data.data;
    },
    enabled: !!tenantId,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (p: Printer) =>
      api.patch<ApiResponse<Printer>>(`/api/v1/printers/${p.id}`, { isActive: !p.isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['printers', tenantId] }),
    onError: () => showToast({ title: t('common.error'), variant: 'error' }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch<ApiResponse<Printer>>(`/api/v1/printers/${id}`, { isDefault: true }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['printers', tenantId] }),
    onError: () => showToast({ title: t('common.error'), variant: 'error' }),
  });

  const printers = data ?? [];

  return (
    <>
      <Header
        title={t('printers.title')}
        subtitle={t('printers.subtitle')}
        extra={
          canManage ? (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              {t('printers.addPrinter')}
            </Button>
          ) : undefined
        }
      />

      <PageWrapper>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-medium border-t-transparent" />
          </div>
        ) : printers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-lighter">
              <Printer className="h-8 w-8 text-brand-medium" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">{t('printers.noPrinters')}</h3>
            <p className="mt-1 max-w-xs text-sm text-gray-500">{t('printers.noPrintersDesc')}</p>
            {canManage && (
              <Button className="mt-6" size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4" />
                {t('printers.addPrinter')}
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">{t('printers.form.name')}</th>
                  <th className="px-4 py-3">{t('printers.form.connectionType')}</th>
                  <th className="px-4 py-3">{t('printers.form.model')}</th>
                  <th className="px-4 py-3">Adresse</th>
                  <th className="px-4 py-3">Statut</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {printers.map((printer) => {
                  const ConnIcon = CONNECTION_ICONS[printer.connectionType];
                  const address  = printer.connectionType === 'NETWORK'
                    ? `${printer.ipAddress ?? ''}:${printer.port ?? 9100}`
                    : printer.connectionType === 'BLUETOOTH'
                    ? (printer.bluetoothIdentifier ?? '—')
                    : 'USB';

                  return (
                    <tr key={printer.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{printer.name}</span>
                          {printer.isDefault && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-lighter px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-dark">
                              <Star className="h-2.5 w-2.5" />
                              {t('printers.default')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${CONNECTION_STYLES[printer.connectionType]}`}>
                          <ConnIcon className="h-3 w-3" />
                          {t(`printers.connectionType.${printer.connectionType}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{printer.model ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{address}</td>
                      <td className="px-4 py-3">
                        {printer.isActive ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            {t('printers.active')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                            {t('printers.inactive')}
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {!printer.isDefault && (
                              <button
                                onClick={() => setDefaultMutation.mutate(printer.id)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-yellow-50 hover:text-yellow-600"
                                title={t('printers.setDefault')}
                              >
                                <Star className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => toggleActiveMutation.mutate(printer)}
                              className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            >
                              {printer.isActive ? t('printers.inactive') : t('printers.active')}
                            </button>
                            <button
                              onClick={() => setEditTarget(printer)}
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              title={t('printers.editPrinter')}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(printer)}
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                              title={t('printers.deletePrinter')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageWrapper>

      {showAdd && (
        <PrinterModal open onClose={() => setShowAdd(false)} />
      )}
      {editTarget && (
        <PrinterModal open onClose={() => setEditTarget(null)} printer={editTarget} />
      )}
      {deleteTarget && (
        <DeleteModal printer={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </>
  );
}
