import { useMutation, useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenantId';

// ─── Domain types ─────────────────────────────────────────────────────────────

interface PrinterOption {
  id:         string;
  name:       string;
  isDefault:  boolean;
  isActive:   boolean;
}

interface ApiResponse<T> {
  data: T;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DlcLabelPayload {
  id:          string;
  productName: string;
  lotNumber:   string | null;
  producedAt:  string;
  expiresAt:   string;
}

interface PrintDlcModalProps {
  dlcLabel: DlcLabelPayload;
  onClose:  () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PrintDlcModal({ dlcLabel, onClose }: PrintDlcModalProps) {
  const { t }      = useTranslation();
  const tenantId   = useTenantId();

  const { data: printers, isLoading: loadingPrinters } = useQuery({
    queryKey: ['printers', tenantId, 'active'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<PrinterOption[]>>('/api/v1/printers?isActive=true');
      return (data.data ?? []).filter((p) => p.isActive);
    },
    enabled: !!tenantId,
  });

  const defaultPrinter = printers?.find((p) => p.isDefault) ?? printers?.[0] ?? null;

  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [copies, setCopies]                       = useState<number>(1);

  // Once printers load, pre-select the default
  const effectivePrinterId = selectedPrinterId || defaultPrinter?.id || '';

  const printMutation = useMutation({
    mutationFn: () =>
      api.post('/api/v1/print-jobs', {
        printerId: effectivePrinterId,
        labelType: 'DLC',
        copies,
        payload: {
          productName: dlcLabel.productName,
          lotNumber:   dlcLabel.lotNumber ?? '',
          producedAt:  dlcLabel.producedAt,
          expiresAt:   dlcLabel.expiresAt,
        },
      }),
    onSuccess: () => {
      showToast({ title: t('dlc.printModal.success'), variant: 'success' });
      onClose();
    },
    onError: () => showToast({ title: t('dlc.printModal.error'), variant: 'error' }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectivePrinterId) return;
    printMutation.mutate();
  }

  const noPrinters = !loadingPrinters && (!printers || printers.length === 0);

  return (
    <Modal open onClose={onClose} title={t('dlc.printModal.title')} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Label preview */}
        <div className="rounded-lg border border-brand-medium/30 bg-brand-medium/5 px-4 py-3">
          <p className="text-sm font-bold text-gray-900">{dlcLabel.productName}</p>
          {dlcLabel.lotNumber && (
            <p className="text-xs text-gray-500">Lot : {dlcLabel.lotNumber}</p>
          )}
          <p className="mt-1 text-xs text-gray-600">
            Ouverture : {new Date(dlcLabel.producedAt).toLocaleDateString('fr-FR')}
          </p>
          <p className="text-xs font-semibold text-brand-dark">
            DLC : {new Date(dlcLabel.expiresAt).toLocaleDateString('fr-FR')}
          </p>
        </div>

        {/* Printer select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('dlc.printModal.selectPrinter')} <span className="text-red-500">*</span>
          </label>
          {loadingPrinters ? (
            <div className="flex h-9 items-center">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-medium border-t-transparent" />
            </div>
          ) : noPrinters ? (
            <p className="text-sm text-gray-500">{t('dlc.printModal.noPrinters')}</p>
          ) : (
            <select
              value={effectivePrinterId}
              onChange={(e) => setSelectedPrinterId(e.target.value)}
              required
              className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-medium"
            >
              {printers?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.isDefault ? ` (${t('printers.default')})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Copies */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{t('dlc.printModal.copies')}</label>
          <input
            type="number"
            min={1}
            max={99}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="h-9 w-24 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {t('dlc.printModal.cancel')}
          </Button>
          <Button
            type="submit"
            size="sm"
            loading={printMutation.isPending}
            disabled={noPrinters || !effectivePrinterId}
          >
            <Printer className="h-4 w-4" />
            {t('dlc.printModal.print')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
