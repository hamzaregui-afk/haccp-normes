import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, Pencil, Plus, Printer, Star, Trash2, Wifi, Bluetooth, Usb, XCircle,
  Cloud, KeyRound, RefreshCw, Play,
} from 'lucide-react';
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
// Connection MODE shown in the UI (drives the dynamic form). PrintNode is a
// provider override; the others map to a connectionType with provider=null.
type Mode = 'NETWORK' | 'LOCAL_AGENT' | 'BLUETOOTH' | 'PRINTNODE';

interface Zone { id: string; name: string; }
interface Site { id: string; name: string; zones: Zone[]; }

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
  provider:             string | null;
  providerComputerId:   number | null;
  printNodePrinterId:   number | null;
  defaultMediaProfileId:string | null;
  tenantId:             string;
  createdAt:            string;
}

interface MediaProfile { id: string; name: string; widthMm: number; heightMm: number; }

interface PrintNodeStatus { printNodeEnabled: boolean; hasPrintNodeApiKey: boolean; encryptionConfigured: boolean; }
interface PnComputer { id: number; name: string; state: string; }
interface PnPrinter { id: number; name: string; computerId: number; state: string; }
interface ProviderTestResult { ok: boolean; message: string; computerCount?: number; }

interface PrinterFormValues {
  name: string; model: string; mode: Mode;
  ipAddress: string; port: number; bluetoothIdentifier: string;
  providerComputerId: number | ''; printNodePrinterId: number | '';
  isDefault: boolean; siteId: string; zoneId: string; defaultMediaProfileId: string;
}

interface ApiResponse<T> { data: T; message?: string; }

// ─── Style maps ───────────────────────────────────────────────────────────────

const CONNECTION_STYLES: Record<string, string> = {
  NETWORK:   'bg-blue-100 text-blue-700 border border-blue-200',
  BLUETOOTH: 'bg-purple-100 text-purple-700 border border-purple-200',
  USB:       'bg-gray-100 text-gray-700 border border-gray-200',
  PRINTNODE: 'bg-brand-light text-brand-dark border border-brand-medium',
};
const CONNECTION_ICONS: Record<string, React.ElementType> = {
  NETWORK: Wifi, BLUETOOTH: Bluetooth, USB: Usb, PRINTNODE: Cloud,
};

const MODE_LABELS: Record<Mode, string> = {
  NETWORK: 'Réseau (IP directe)', LOCAL_AGENT: 'Agent local (USB)',
  BLUETOOTH: 'Bluetooth', PRINTNODE: 'PrintNode',
};

const EMPTY_FORM: PrinterFormValues = {
  name: '', model: '', mode: 'NETWORK',
  ipAddress: '', port: 9100, bluetoothIdentifier: '',
  providerComputerId: '', printNodePrinterId: '',
  isDefault: false, siteId: '', zoneId: '', defaultMediaProfileId: '',
};

function printerToForm(p: Printer): PrinterFormValues {
  const mode: Mode =
    p.provider === 'PRINTNODE' ? 'PRINTNODE' :
    p.connectionType === 'USB' ? 'LOCAL_AGENT' :
    p.connectionType === 'BLUETOOTH' ? 'BLUETOOTH' : 'NETWORK';
  return {
    name: p.name, model: p.model ?? '', mode,
    ipAddress: p.ipAddress ?? '', port: p.port ?? 9100,
    bluetoothIdentifier: p.bluetoothIdentifier ?? '',
    providerComputerId: p.providerComputerId ?? '', printNodePrinterId: p.printNodePrinterId ?? '',
    isDefault: p.isDefault, siteId: p.siteId ?? '', zoneId: p.zoneId ?? '',
    defaultMediaProfileId: p.defaultMediaProfileId ?? '',
  };
}

const inputCls  = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium';
const selectCls = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-medium';

// ─── PrintNode configuration card (tenant-level API key) ────────────────────────

function PrintNodeConfigCard() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  const [apiKey, setApiKey] = useState('');
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);

  const { data: status } = useQuery({
    queryKey: ['printnode.status', tenantId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<PrintNodeStatus>>('/api/v1/print-provider-config');
      return data.data;
    },
    enabled: !!tenantId,
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse<ProviderTestResult>>(
        '/api/v1/print-provider-config/printnode/test',
        apiKey ? { apiKey } : {},
      );
      return data.data;
    },
    onSuccess: (r) => setTestResult(r),
    onError: () => setTestResult({ ok: false, message: 'PrintNode inaccessible' }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put('/api/v1/print-provider-config', { printNodeApiKey: apiKey, printNodeEnabled: true }),
    onSuccess: () => {
      setApiKey('');
      void qc.invalidateQueries({ queryKey: ['printnode.status', tenantId] });
      showToast({ title: 'Clé PrintNode enregistrée', variant: 'success' });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast({ title: msg ?? 'Erreur', variant: 'error' });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => api.delete('/api/v1/print-provider-config/printnode-key'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['printnode.status', tenantId] });
      showToast({ title: 'Clé PrintNode supprimée', variant: 'success' });
    },
  });

  const configured = status?.hasPrintNodeApiKey ?? false;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Cloud className="h-5 w-5 text-brand-medium" />
        <h3 className="text-sm font-semibold text-gray-900">Connexion PrintNode</h3>
        {configured && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3 w-3" /> API configurée
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Saisissez la clé API PrintNode du client pour imprimer via le relais PrintNode
        (sans réseau local partagé). La clé est chiffrée côté serveur et n'est jamais réaffichée.
      </p>

      {status && !status.encryptionConfigured && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Le chiffrement des secrets (ENCRYPTION_KEY) n'est pas activé côté serveur — impossible
          d'enregistrer une clé PrintNode pour l'instant.
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex min-w-[260px] flex-1 flex-col gap-1.5">
          <label className="flex items-center gap-1 text-sm font-medium text-gray-700">
            <KeyRound className="h-3.5 w-3.5" /> {configured ? 'Modifier la clé' : 'Clé API PrintNode'}
          </label>
          <input
            type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
            placeholder={configured ? '•••••••••• (laisser vide pour conserver)' : 'Clé API PrintNode'}
            className={inputCls} autoComplete="off"
          />
        </div>
        <Button type="button" variant="secondary" loading={testMutation.isPending}
          onClick={() => testMutation.mutate()}
          disabled={!apiKey && !configured}>
          Tester la connexion
        </Button>
        <Button type="button" loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          disabled={!apiKey || !(status?.encryptionConfigured ?? false)}>
          Enregistrer
        </Button>
        {configured && (
          <Button type="button" variant="danger" loading={clearMutation.isPending}
            onClick={() => clearMutation.mutate()}>
            Supprimer
          </Button>
        )}
      </div>

      {testResult && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {testResult.ok ? '✓ ' : '✕ '}{testResult.message}
          {testResult.ok && testResult.computerCount !== undefined && ` — ${testResult.computerCount} ordinateur(s) trouvé(s)`}
        </div>
      )}
    </div>
  );
}

// ─── Printer form modal ───────────────────────────────────────────────────────

interface PrinterModalProps { open: boolean; onClose: () => void; printer?: Printer; }

function PrinterModal({ open, onClose, printer }: PrinterModalProps) {
  const { t }    = useTranslation();
  const qc       = useQueryClient();
  const tenantId = useTenantId();

  const [form, setForm]     = useState<PrinterFormValues>(printer ? printerToForm(printer) : EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof PrinterFormValues, string>>>({});
  const [computers, setComputers] = useState<PnComputer[]>([]);
  const [pnPrinters, setPnPrinters] = useState<PnPrinter[]>([]);
  const isEdit = !!printer;

  const { data: sitesData } = useQuery({
    queryKey: ['sites.all', tenantId],
    queryFn: async () => (await api.get<ApiResponse<Site[]>>('/api/v1/sites')).data.data ?? [],
    enabled: open, staleTime: 60_000,
  });
  const { data: mediaData } = useQuery({
    queryKey: ['media-profiles', tenantId],
    queryFn: async () => (await api.get<ApiResponse<MediaProfile[]>>('/api/v1/media-profiles')).data.data ?? [],
    enabled: open, staleTime: 60_000,
  });

  const sites   = sitesData ?? [];
  const media   = mediaData ?? [];
  const selSite = sites.find((s) => s.id === form.siteId);
  const zones   = selSite?.zones ?? [];

  // PrintNode enumeration (uses the tenant's stored key)
  const computersMutation = useMutation({
    mutationFn: async () => (await api.post<ApiResponse<PnComputer[]>>('/api/v1/print-provider-config/printnode/computers', {})).data.data,
    onSuccess: (rows) => setComputers(rows),
    onError: () => showToast({ title: "Configurez d'abord la clé PrintNode", variant: 'error' }),
  });
  const printersMutation = useMutation({
    mutationFn: async (computerId: number) =>
      (await api.post<ApiResponse<PnPrinter[]>>('/api/v1/print-provider-config/printnode/printers', { computerId })).data.data,
    onSuccess: (rows) => setPnPrinters(rows),
    onError: () => showToast({ title: 'Impossible de récupérer les imprimantes', variant: 'error' }),
  });

  function set<K extends keyof PrinterFormValues>(key: K, value: PrinterFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    if (key === 'siteId') setForm((prev) => ({ ...prev, siteId: value as string, zoneId: '' }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof PrinterFormValues, string>> = {};
    if (!form.name.trim()) next.name = t('settings.validation.required');
    if (form.mode === 'NETWORK' && !form.ipAddress.trim()) next.ipAddress = t('settings.validation.required');
    if (form.mode === 'BLUETOOTH' && !form.bluetoothIdentifier.trim()) next.bluetoothIdentifier = t('settings.validation.required');
    if (form.mode === 'PRINTNODE' && !form.printNodePrinterId) next.printNodePrinterId = t('settings.validation.required');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isEdit
        ? api.patch<ApiResponse<Printer>>(`/api/v1/printers/${printer.id}`, body)
        : api.post<ApiResponse<Printer>>('/api/v1/printers', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['printers', tenantId] });
      showToast({ title: isEdit ? t('printers.editPrinter') : t('printers.addPrinter'), variant: 'success' });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast({ title: msg ?? t('common.error'), variant: 'error' });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const body: Record<string, unknown> = {
      name: form.name.trim(), isDefault: form.isDefault, port: form.port,
    };
    if (form.model.trim())            body.model                 = form.model.trim();
    if (form.siteId)                  body.siteId                = form.siteId;
    if (form.zoneId)                  body.zoneId                = form.zoneId;
    if (form.defaultMediaProfileId)   body.defaultMediaProfileId = form.defaultMediaProfileId;

    if (form.mode === 'NETWORK') {
      body.connectionType = 'NETWORK'; body.ipAddress = form.ipAddress.trim();
    } else if (form.mode === 'LOCAL_AGENT') {
      body.connectionType = 'USB';
    } else if (form.mode === 'BLUETOOTH') {
      body.connectionType = 'BLUETOOTH'; body.bluetoothIdentifier = form.bluetoothIdentifier.trim();
    } else if (form.mode === 'PRINTNODE') {
      // provider overrides connectionType for dispatch; connectionType kept for schema.
      body.connectionType    = 'NETWORK';
      body.provider          = 'PRINTNODE';
      if (form.providerComputerId !== '') body.providerComputerId = form.providerComputerId;
      body.printNodePrinterId = form.printNodePrinterId;
    }
    mutation.mutate(body);
  }

  return (
    <Modal open={open} onClose={onClose}
      title={isEdit ? t('printers.editPrinter') : t('printers.addPrinter')} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('printers.form.name')} <span className="text-red-500">*</span>
          </label>
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)}
            placeholder="ex: Imprimante cuisine" className={inputCls} />
          {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
        </div>

        {/* Model */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{t('printers.form.model')}</label>
          <input type="text" value={form.model} onChange={(e) => set('model', e.target.value)}
            placeholder="ex: Zebra ZD420, GPrinter GP-2120TUA, TSC TTP-244 Pro" className={inputCls} />
        </div>

        {/* Connection MODE (drives the dynamic fields) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Mode de connexion</label>
          <select value={form.mode} onChange={(e) => set('mode', e.target.value as Mode)} className={selectCls}>
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <option key={m} value={m}>{MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>

        {/* NETWORK */}
        {form.mode === 'NETWORK' && (
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t('printers.form.ipAddress')} <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.ipAddress} onChange={(e) => set('ipAddress', e.target.value)}
                placeholder="192.168.1.100" className={inputCls} />
              {errors.ipAddress && <p className="text-xs text-red-600">{errors.ipAddress}</p>}
            </div>
            <div className="flex w-28 flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t('printers.form.port')}</label>
              <input type="number" min={1} max={65535} value={form.port}
                onChange={(e) => set('port', parseInt(e.target.value, 10) || 9100)} className={inputCls} />
            </div>
          </div>
        )}

        {/* BLUETOOTH */}
        {form.mode === 'BLUETOOTH' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('printers.form.bluetoothIdentifier')} <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.bluetoothIdentifier}
              onChange={(e) => set('bluetoothIdentifier', e.target.value)}
              placeholder="xx:xx:xx:xx:xx:xx" className={inputCls} />
            {errors.bluetoothIdentifier && <p className="text-xs text-red-600">{errors.bluetoothIdentifier}</p>}
          </div>
        )}

        {/* LOCAL_AGENT (USB) */}
        {form.mode === 'LOCAL_AGENT' && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
            L'imprimante USB sera servie par l'agent d'impression local installé sur le PC du client.
          </div>
        )}

        {/* PRINTNODE */}
        {form.mode === 'PRINTNODE' && (
          <div className="flex flex-col gap-3 rounded-lg border border-brand-light bg-brand-lighter/40 p-3">
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Ordinateur PrintNode</label>
                <select value={form.providerComputerId}
                  onChange={(e) => { set('providerComputerId', e.target.value ? Number(e.target.value) : ''); setPnPrinters([]); }}
                  className={selectCls}>
                  <option value="">— Sélectionner —</option>
                  {computers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.state})</option>)}
                </select>
              </div>
              <Button type="button" variant="secondary" loading={computersMutation.isPending}
                onClick={() => computersMutation.mutate()}>
                <RefreshCw className="h-3.5 w-3.5" /> Ordinateurs
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Imprimante <span className="text-red-500">*</span>
                </label>
                <select value={form.printNodePrinterId}
                  onChange={(e) => set('printNodePrinterId', e.target.value ? Number(e.target.value) : '')}
                  className={selectCls}>
                  <option value="">— Sélectionner —</option>
                  {pnPrinters.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.state})</option>)}
                </select>
                {errors.printNodePrinterId && <p className="text-xs text-red-600">{errors.printNodePrinterId}</p>}
              </div>
              <Button type="button" variant="secondary" loading={printersMutation.isPending}
                disabled={form.providerComputerId === ''}
                onClick={() => printersMutation.mutate(Number(form.providerComputerId))}>
                <RefreshCw className="h-3.5 w-3.5" /> Imprimantes
              </Button>
            </div>
            <p className="text-[11px] text-gray-500">
              La clé API PrintNode se configure une fois dans « Connexion PrintNode » ci-dessus.
            </p>
          </div>
        )}

        {/* Site / Zone */}
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Site</label>
            <select value={form.siteId}
              onChange={(e) => setForm((prev) => ({ ...prev, siteId: e.target.value, zoneId: '' }))}
              className={selectCls}>
              <option value="">— Tous les sites —</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Zone</label>
            <select value={form.zoneId} onChange={(e) => set('zoneId', e.target.value)}
              disabled={!form.siteId || zones.length === 0} className={selectCls}>
              <option value="">— Toutes les zones —</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
        </div>

        {/* Label format */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Format d'étiquette</label>
          <select value={form.defaultMediaProfileId} onChange={(e) => set('defaultMediaProfileId', e.target.value)} className={selectCls}>
            <option value="">— Par défaut du tenant —</option>
            {media.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.widthMm}×{m.heightMm} mm)</option>)}
          </select>
        </div>

        {/* Default */}
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-medium focus:ring-brand-medium" />
          <span className="text-sm text-gray-700">{t('printers.form.isDefault')}</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('printers.form.cancel')}</Button>
          <Button type="submit" loading={mutation.isPending}>
            {isEdit ? t('printers.form.save') : t('printers.form.add')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteModal({ printer, onClose }: { printer: Printer; onClose: () => void }) {
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
      <p className="text-sm text-gray-700">{t('printers.deleteConfirm', { name: printer.name })}</p>
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
  // Printer management = ADMIN/SUPER_ADMIN (backend restricts it; MANAGER would 403).
  const canManage  = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [showAdd, setShowAdd]           = useState(false);
  const [editTarget, setEditTarget]     = useState<Printer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Printer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['printers', tenantId],
    queryFn: async () => (await api.get<ApiResponse<Printer[]>>('/api/v1/printers')).data.data,
    enabled: !!tenantId, refetchInterval: 30_000,
  });

  const { data: sitesData } = useQuery({
    queryKey: ['sites.all', tenantId],
    queryFn: async () => (await api.get<ApiResponse<Site[]>>('/api/v1/sites')).data.data ?? [],
    staleTime: 300_000,
  });

  const sitesMap = Object.fromEntries((sitesData ?? []).flatMap((s) => [
    [s.id, s.name], ...s.zones.map((z) => [z.id, z.name]),
  ]));

  const toggleActiveMutation = useMutation({
    mutationFn: (p: Printer) => api.patch<ApiResponse<Printer>>(`/api/v1/printers/${p.id}`, { isActive: !p.isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['printers', tenantId] }),
    onError: () => showToast({ title: t('common.error'), variant: 'error' }),
  });
  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => api.patch<ApiResponse<void>>(`/api/v1/printers/${id}/set-default`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['printers', tenantId] }),
    onError: () => showToast({ title: t('common.error'), variant: 'error' }),
  });
  const testPrintMutation = useMutation({
    mutationFn: (id: string) => api.post('/api/v1/print-jobs/test', { printerId: id }),
    onSuccess: () => showToast({ title: 'Test envoyé à l\'imprimante', variant: 'success' }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast({ title: msg ?? 'Échec du test', variant: 'error' });
    },
  });

  const printers = data ?? [];

  return (
    <>
      <Header
        title={t('printers.title')} subtitle={t('printers.subtitle')}
        extra={canManage ? (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> {t('printers.addPrinter')}
          </Button>
        ) : undefined}
      />

      <PageWrapper>
        {canManage && <PrintNodeConfigCard />}

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
                <Plus className="h-4 w-4" /> {t('printers.addPrinter')}
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">{t('printers.form.name')}</th>
                  <th className="px-4 py-3">Connexion</th>
                  <th className="px-4 py-3">{t('printers.form.model')}</th>
                  <th className="px-4 py-3">Cible</th>
                  <th className="px-4 py-3">Site / Zone</th>
                  <th className="px-4 py-3">Statut</th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {printers.map((p) => {
                  const kind    = p.provider === 'PRINTNODE' ? 'PRINTNODE' : p.connectionType;
                  const ConnIcon = CONNECTION_ICONS[kind] ?? Printer;
                  const target  =
                    p.provider === 'PRINTNODE'        ? `PrintNode #${p.printNodePrinterId ?? '—'}` :
                    p.connectionType === 'NETWORK'    ? `${p.ipAddress ?? ''}:${p.port ?? 9100}`     :
                    p.connectionType === 'BLUETOOTH'  ? (p.bluetoothIdentifier ?? '—')               :
                    'USB (local)';
                  const siteLabel = p.siteId ? sitesMap[p.siteId] ?? p.siteId : '—';
                  const zoneLabel = p.zoneId ? sitesMap[p.zoneId] ?? p.zoneId : '';

                  return (
                    <tr key={p.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{p.name}</span>
                          {p.isDefault && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-lighter px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-dark">
                              <Star className="h-2.5 w-2.5" /> {t('printers.default')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${CONNECTION_STYLES[kind] ?? CONNECTION_STYLES.USB}`}>
                          <ConnIcon className="h-3 w-3" />
                          {kind === 'PRINTNODE' ? 'PrintNode' : t(`printers.connectionType.${p.connectionType}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.model ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{target}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{siteLabel}{zoneLabel ? ` › ${zoneLabel}` : ''}</td>
                      <td className="px-4 py-3">
                        {p.isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            <CheckCircle2 className="h-3 w-3" /> {t('printers.active')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                            <XCircle className="h-3 w-3" /> {t('printers.inactive')}
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => testPrintMutation.mutate(p.id)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-lighter hover:text-brand-medium"
                              title="Tester l'impression">
                              <Play className="h-4 w-4" />
                            </button>
                            {!p.isDefault && (
                              <button onClick={() => setDefaultMutation.mutate(p.id)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-yellow-50 hover:text-yellow-600"
                                title={t('printers.setDefault')}>
                                <Star className="h-4 w-4" />
                              </button>
                            )}
                            <button onClick={() => toggleActiveMutation.mutate(p)}
                              className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700">
                              {p.isActive ? t('printers.inactive') : t('printers.active')}
                            </button>
                            <button onClick={() => setEditTarget(p)}
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              title={t('printers.editPrinter')}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => setDeleteTarget(p)}
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                              title={t('printers.deletePrinter')}>
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

      {showAdd    && <PrinterModal open onClose={() => setShowAdd(false)} />}
      {editTarget && <PrinterModal open onClose={() => setEditTarget(null)} printer={editTarget} />}
      {deleteTarget && <DeleteModal printer={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </>
  );
}
