/**
 * ClientDetailPage — Full SaaS tenant management panel
 * Accessible via /clients/:id — SUPER_ADMIN only
 *
 * Tabs:
 *  1. Informations     — name, slug, contacts, status, sector
 *  2. Admin principal  — create/view the tenant's ADMIN user
 *  3. Modules          — feature flag toggles (17 modules)
 *  4. Abonnement       — plan, limits, trial dates
 *  5. Sites & Zones    — hierarchical reference data
 *  6. Utilisateurs     — tenant user list (read-only from SA view)
 *  7. Historique       — real-time audit trail scoped to the tenant
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  ArrowLeft, Building2, CheckCircle2, ChevronRight, Cog,
  CreditCard, History, LayoutDashboard, Loader2, MapPin,
  Package, Plus, RotateCcw, ScrollText, Shield, ToggleLeft,
  Trash2, User2, Users, XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { Header } from '@/components/layout/Header';
import { PageWrapper } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import type {
  ApiResponse, Tenant, TenantModule, TenantModuleKey,
  TenantSubscription,
} from '@haccp/shared-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractApiError(err: unknown, t: ReturnType<typeof useTranslation>['t']): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { message?: string } | undefined)?.message;
    if (msg) return msg;
  }
  return t('common.error');
}

// ─── Style maps (CSS-only — safe at module level) ─────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-800',
  ARCHIVED:  'bg-gray-100  text-gray-600',
  SUSPENDED: 'bg-red-100   text-red-700',
};

const SUB_STATUS_STYLES: Record<string, string> = {
  TRIAL:     'bg-amber-100 text-amber-800',
  ACTIVE:    'bg-green-100 text-green-800',
  SUSPENDED: 'bg-red-100   text-red-700',
  CANCELLED: 'bg-gray-100  text-gray-600',
  EXPIRED:   'bg-gray-100  text-gray-500',
};

const ACTION_STYLES: Record<string, string> = {
  CREATE: 'bg-green-50 text-green-700',
  UPDATE: 'bg-blue-50 text-blue-700',
  DELETE: 'bg-red-50 text-red-700',
  LOGIN:  'bg-purple-50 text-purple-700',
  LOGOUT: 'bg-gray-100 text-gray-600',
  EXPORT: 'bg-orange-50 text-orange-700',
};

// ─── Module icon map (icons only — safe at module level) ──────────────────────

const MODULE_ICONS: Record<TenantModuleKey, React.FC<{ className?: string }>> = {
  DASHBOARD:       LayoutDashboard,
  HACCP_CONTROLS:  Shield,
  NONCONFORMITIES: XCircle,
  DLC:             ToggleLeft,
  REPORTS:         ScrollText,
  EQUIPMENTS:      Cog,
  PRODUCTS:        Package,
  SUPPLIERS:       Building2,
  GED:             ScrollText,
  NOTIFICATIONS:   CheckCircle2,
  AUDIT:           History,
  PLANNING:        LayoutDashboard,
  TEMPERATURES:    Shield,
  RECEPTIONS:      Package,
  HYGIENE:         Shield,
  ANALYTICS:       ChevronRight,
  MOBILE_ACCESS:   Users,
};

const MODULE_KEYS: TenantModuleKey[] = [
  'DASHBOARD', 'HACCP_CONTROLS', 'NONCONFORMITIES', 'DLC', 'REPORTS',
  'EQUIPMENTS', 'PRODUCTS', 'SUPPLIERS', 'GED', 'NOTIFICATIONS',
  'AUDIT', 'PLANNING', 'TEMPERATURES', 'RECEPTIONS', 'HYGIENE',
  'ANALYTICS', 'MOBILE_ACCESS',
];

// ─── Tab IDs ──────────────────────────────────────────────────────────────────

const TAB_IDS = ['info', 'admin', 'modules', 'subscription', 'sites', 'users', 'history'] as const;
type TabId = (typeof TAB_IDS)[number];

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useTenant(id: string) {
  return useQuery({
    queryKey: ['tenant', id],
    queryFn:  async () => {
      const { data } = await api.get<ApiResponse<Tenant>>(`/api/v1/tenants/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

function useTenantModules(id: string) {
  return useQuery({
    queryKey: ['tenant-modules', id],
    queryFn:  async () => {
      const { data } = await api.get<ApiResponse<TenantModule[]>>(`/api/v1/tenants/${id}/modules`);
      return data.data;
    },
    enabled: !!id,
  });
}

function useTenantSubscription(id: string) {
  return useQuery({
    queryKey: ['tenant-subscription', id],
    queryFn:  async () => {
      const { data } = await api.get<ApiResponse<TenantSubscription | null>>(`/api/v1/tenants/${id}/subscription`);
      return data.data;
    },
    enabled: !!id,
  });
}

function useTenantSites(id: string) {
  return useQuery({
    queryKey: ['tenant-sites', id],
    queryFn:  async () => {
      type SiteWithZones = { id: string; name: string; address?: string | null; zones: { id: string; name: string }[] };
      const { data } = await api.get<ApiResponse<SiteWithZones[]>>(`/api/v1/tenants/${id}/sites`);
      return data.data;
    },
    enabled: !!id,
  });
}

// ─── Tab: Informations ────────────────────────────────────────────────────────

function InfoTab({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      name:    tenant.name,
      email:   tenant.email   ?? '',
      phone:   tenant.phone   ?? '',
      siret:   tenant.siret   ?? '',
      address: tenant.address ?? '',
      sector:  tenant.sector  ?? '',
      status:  tenant.status,
    },
  });

  const mutation = useMutation({
    mutationFn: (v: Record<string, string>) => api.patch(`/api/v1/tenants/${tenantId}`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      showToast({ title: t('clients.detail.infoUpdated'), variant: 'success' });
      setEditing(false);
    },
    onError: (err) => showToast({ title: extractApiError(err, t), variant: 'error' }),
  });

  if (!editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{t('clients.detail.generalInfo')}</h3>
          <Button size="sm" variant="secondary" onClick={() => { reset(); setEditing(true); }}>
            {t('clients.detail.subscription.edit')}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[
            { label: t('clients.detail.fields.name'),      value: tenant.name },
            { label: t('clients.detail.fields.slug'),      value: `/${tenant.slug}`, mono: true },
            { label: t('clients.detail.fields.email'),     value: tenant.email },
            { label: t('clients.detail.fields.phone'),     value: tenant.phone },
            { label: t('clients.detail.fields.siret'),     value: tenant.siret },
            { label: t('clients.detail.fields.sector'),    value: tenant.sector },
            { label: t('clients.detail.fields.status'),    value: t(`clients.status.${tenant.status}` as Parameters<typeof t>[0]) },
            { label: t('clients.detail.fields.plan'),      value: t(`clients.plans.${tenant.plan}` as Parameters<typeof t>[0]) },
            { label: t('clients.detail.fields.createdAt'), value: new Date(tenant.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' }) },
          ].map(({ label, value, mono }) => (
            <div key={label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
              <dd className={`mt-1 text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>
                {value ?? <span className="text-gray-300">—</span>}
              </dd>
            </div>
          ))}
        </div>

        {tenant.address && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {t('clients.detail.fields.address')}
            </dt>
            <dd className="mt-1 text-sm text-gray-900 whitespace-pre-line">{tenant.address}</dd>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
      <h3 className="text-base font-semibold text-gray-900">{t('clients.detail.editInfo')}</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { key: 'name',  label: `${t('clients.detail.fields.name')} *`, type: 'text',  placeholder: 'Boulangerie Dupont' },
          { key: 'email', label: t('clients.detail.fields.email'),        type: 'email', placeholder: 'contact@client.com' },
          { key: 'phone', label: t('clients.detail.fields.phone'),        type: 'tel',   placeholder: '+33 1 23 45 67 89' },
          { key: 'siret', label: t('clients.detail.fields.siret'),        type: 'text',  placeholder: '12345678901234' },
        ].map(({ key, label, type, placeholder }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{label}</label>
            <input
              {...register(key as 'name' | 'email' | 'phone' | 'siret')}
              type={type}
              placeholder={placeholder}
              className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">{t('clients.detail.fields.sector')}</label>
        <select
          {...register('sector')}
          className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
        >
          <option value="">{t('clients.detail.sectorSelect')}</option>
          {['RESTAURATION', 'INDUSTRIE_ALIMENTAIRE', 'GRANDE_DISTRIBUTION', 'TRAITEUR', 'AUTRE'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">{t('clients.detail.fields.address')}</label>
        <textarea
          {...register('address')}
          rows={3}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
          placeholder="12 rue des Boulangers, 75001 Paris"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">{t('clients.detail.fields.status')}</label>
        <select
          {...register('status')}
          className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
        >
          <option value="ACTIVE">{t('clients.detail.statusOptions.ACTIVE')}</option>
          <option value="SUSPENDED">{t('clients.detail.statusOptions.SUSPENDED')}</option>
          <option value="ARCHIVED">{t('clients.detail.statusOptions.ARCHIVED')}</option>
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" loading={mutation.isPending}>{t('common.save')}</Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

// ─── Tab: Admin principal ─────────────────────────────────────────────────────

interface AdminTabProps { tenant: Tenant; tenantId: string; }

function AdminTab({ tenant, tenantId }: AdminTabProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<{
    name: string; email: string; password: string;
  }>();

  const createMutation = useMutation({
    mutationFn: (v: { name: string; email: string; password: string }) =>
      // ARCH-DECISION: SUPER_ADMIN cannot use POST /api/v1/users (that would create
      // the user in the 'platform' pseudo-tenant). The dedicated cross-tenant endpoint
      // POST /api/v1/users/for-tenant/:tenantId uses the URL param as the target tenant,
      // so the new admin is correctly scoped to this client's tenant — not the platform.
      api.post(`/api/v1/users/for-tenant/${tenantId}`, { ...v, role: 'ADMIN' }),
    onSuccess: (res) => {
      const userId = (res.data as ApiResponse<{ id: string }>).data?.id;
      if (userId) {
        // Store primaryAdminId on the tenant
        void api.patch(`/api/v1/tenants/${tenantId}`, { primaryAdminId: userId });
        qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      }
      showToast({ title: t('clients.detail.admin.createModal.toast'), variant: 'success' });
      setShowCreate(false);
      reset();
    },
    onError: (err) => showToast({ title: extractApiError(err, t), variant: 'error' }),
  });

  const hasAdmin = !!tenant.primaryAdminId;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">{t('clients.detail.admin.title')}</h3>
        {!hasAdmin && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> {t('clients.detail.admin.createBtn')}
          </Button>
        )}
      </div>

      {hasAdmin ? (
        <div className="rounded-xl border border-green-100 bg-green-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-200">
              <User2 className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="font-medium text-green-900">{t('clients.detail.admin.assigned')}</p>
              <p className="text-xs text-green-600 font-mono">{tenant.primaryAdminId}</p>
            </div>
            <span className="ml-auto rounded-full bg-green-200 px-2.5 py-0.5 text-xs font-medium text-green-800">
              ADMIN
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                showToast({ title: t('clients.detail.admin.resetPwdToast'), variant: 'info' });
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> {t('clients.detail.admin.resetPwd')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
          <User2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-500">{t('clients.detail.admin.noAdmin')}</p>
          <p className="mt-1 text-xs text-gray-400">
            {t('clients.detail.admin.noAdminSub')}
          </p>
          <Button className="mt-4" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> {t('clients.detail.admin.createBtn')}
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-blue-50 bg-blue-50/60 p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">{t('clients.detail.admin.rulesTitle')}</p>
        <ul className="space-y-0.5 text-xs list-disc list-inside text-blue-700">
          <li>{t('clients.detail.admin.rules.scope', { name: tenant.name })}</li>
          <li>{t('clients.detail.admin.rules.role')}</li>
          <li>{t('clients.detail.admin.rules.can')}</li>
          <li>{t('clients.detail.admin.rules.cannot')}</li>
        </ul>
      </div>

      {showCreate && (
        <Modal open title={t('clients.detail.admin.createModal.title')} onClose={() => setShowCreate(false)}>
          <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="flex flex-col gap-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              {t('clients.detail.admin.createModal.warning', { name: tenant.name })}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t('clients.detail.admin.createModal.fullName')}</label>
              <input
                {...register('name', { required: t('clients.detail.admin.createModal.required') })}
                type="text"
                placeholder="Jean Dupont"
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
              {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t('clients.detail.admin.createModal.email')}</label>
              <input
                {...register('email', { required: t('clients.detail.admin.createModal.required') })}
                type="email"
                placeholder="admin@client.com"
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
              {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t('clients.detail.admin.createModal.password')}</label>
              <input
                {...register('password', {
                  required:  t('clients.detail.admin.createModal.required'),
                  minLength: { value: 8, message: t('clients.detail.admin.createModal.passwordMin') },
                })}
                type="password"
                placeholder={t('clients.detail.admin.createModal.passwordPlaceholder')}
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
              {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
              <Button type="submit" loading={createMutation.isPending}>{t('clients.detail.admin.createModal.submit')}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: Modules ─────────────────────────────────────────────────────────────

function ModulesTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: modules, isLoading } = useTenantModules(tenantId);
  const [localState, setLocalState] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  const mutation = useMutation({
    mutationFn: (mods: { moduleKey: string; enabled: boolean }[]) =>
      api.put(`/api/v1/tenants/${tenantId}/modules`, { modules: mods }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-modules', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      showToast({ title: t('clients.detail.modules.toast'), variant: 'success' });
      setDirty(false);
      setLocalState({});
    },
    onError: (err) => showToast({ title: extractApiError(err, t), variant: 'error' }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-medium" />
      </div>
    );
  }

  const effectiveState = (key: TenantModuleKey): boolean => {
    if (key in localState) return localState[key] ?? false;
    return modules?.find((m) => m.moduleKey === key)?.enabled ?? false;
  };

  const toggle = (key: TenantModuleKey) => {
    setLocalState((prev) => ({ ...prev, [key]: !effectiveState(key) }));
    setDirty(true);
  };

  const enabledCount = MODULE_KEYS.filter((k) => effectiveState(k)).length;

  const handleSave = () => {
    const changes = MODULE_KEYS.map((key) => ({
      moduleKey: key,
      enabled:   effectiveState(key),
    }));
    mutation.mutate(changes);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{t('clients.detail.modules.title')}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {t('clients.detail.modules.count', { count: enabledCount })}
          </p>
        </div>
        {dirty && (
          <Button onClick={handleSave} loading={mutation.isPending} size="sm">
            {t('clients.detail.modules.save')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MODULE_KEYS.map((key) => {
          const enabled = effectiveState(key);
          const Icon    = MODULE_ICONS[key];
          const label   = t(`clients.detail.modulesMeta.${key}.label` as Parameters<typeof t>[0]);
          const desc    = t(`clients.detail.modulesMeta.${key}.description` as Parameters<typeof t>[0]);

          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`group flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                enabled
                  ? 'border-brand-medium/30 bg-brand-lighter/60 shadow-sm'
                  : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                enabled ? 'bg-brand-medium text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium ${enabled ? 'text-brand-dark' : 'text-gray-600'}`}>
                    {label}
                  </span>
                  {/* Toggle pill */}
                  <div className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    enabled ? 'bg-brand-medium' : 'bg-gray-200'
                  }`}>
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-gray-400 leading-tight">{desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: Abonnement ──────────────────────────────────────────────────────────

function SubscriptionTab({ tenantId, tenant }: { tenantId: string; tenant: Tenant }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: sub, isLoading } = useTenantSubscription(tenantId);
  const [editing, setEditing] = useState(false);

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      plan:        sub?.plan        ?? tenant.plan ?? 'standard',
      status:      sub?.status      ?? 'ACTIVE',
      maxUsers:    sub?.maxUsers    ?? 10,
      maxSites:    sub?.maxSites    ?? 3,
      trialEndsAt: sub?.trialEndsAt ? new Date(sub.trialEndsAt).toISOString().slice(0, 10) : '',
      notes:       sub?.notes       ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.patch(`/api/v1/tenants/${tenantId}/subscription`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-subscription', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      showToast({ title: t('clients.detail.subscription.toast'), variant: 'success' });
      setEditing(false);
    },
    onError: (err) => showToast({ title: extractApiError(err, t), variant: 'error' }),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-brand-medium" /></div>;
  }

  const trialDays = sub?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  if (!editing) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{t('clients.detail.subscription.title')}</h3>
          <Button size="sm" variant="secondary" onClick={() => { reset(); setEditing(true); }}>
            {t('clients.detail.subscription.edit')}
          </Button>
        </div>

        {!sub ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
            <CreditCard className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-500">{t('clients.detail.subscription.none')}</p>
            <Button className="mt-4" size="sm" onClick={() => setEditing(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> {t('clients.detail.subscription.configure')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: t('clients.detail.subscription.fields.plan'),   value: t(`clients.plans.${sub.plan}` as Parameters<typeof t>[0]) },
              {
                label: t('clients.detail.subscription.fields.status'),
                value: (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SUB_STATUS_STYLES[sub.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {t(`clients.subStatus.${sub.status}` as Parameters<typeof t>[0])}
                  </span>
                ),
              },
              { label: t('clients.detail.subscription.fields.maxUsers'), value: sub.maxUsers },
              { label: t('clients.detail.subscription.fields.maxSites'), value: sub.maxSites },
              {
                label: t('clients.detail.subscription.fields.trialEndsAt'),
                value: sub.trialEndsAt
                  ? `${new Date(sub.trialEndsAt).toLocaleDateString('fr-FR')} (${t('clients.detail.subscription.fields.trialDaysLeft', { count: trialDays ?? 0 })})`
                  : '—',
              },
              {
                label: t('clients.detail.subscription.fields.startedAt'),
                value: new Date(sub.startedAt).toLocaleDateString('fr-FR', { dateStyle: 'long' }),
              },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
                <dd className="mt-2 text-sm font-semibold text-gray-900">
                  {typeof value === 'string' || typeof value === 'number' ? value : value}
                </dd>
              </div>
            ))}
          </div>
        )}

        {sub?.notes && (
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 text-sm text-gray-700">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
              {t('clients.detail.subscription.fields.notes')}
            </p>
            {sub.notes}
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
      <h3 className="text-base font-semibold text-gray-900">{t('clients.detail.subscription.editTitle')}</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">{t('clients.detail.subscription.fields.plan')}</label>
          <select {...register('plan')} className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium">
            <option value="trial">{t('clients.form.planOptions.trial')}</option>
            <option value="standard">{t('clients.form.planOptions.standard')}</option>
            <option value="premium">{t('clients.form.planOptions.premium')}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">{t('clients.detail.subscription.fields.status')}</label>
          <select {...register('status')} className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium">
            <option value="TRIAL">{t('clients.subStatus.TRIAL')}</option>
            <option value="ACTIVE">{t('clients.subStatus.ACTIVE')}</option>
            <option value="SUSPENDED">{t('clients.subStatus.SUSPENDED')}</option>
            <option value="CANCELLED">{t('clients.subStatus.CANCELLED')}</option>
            <option value="EXPIRED">{t('clients.subStatus.EXPIRED')}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">{t('clients.detail.subscription.fields.maxUsers')}</label>
          <input {...register('maxUsers', { valueAsNumber: true })} type="number" min={1} className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">{t('clients.detail.subscription.fields.maxSites')}</label>
          <input {...register('maxSites', { valueAsNumber: true })} type="number" min={1} className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">{t('clients.detail.subscription.fields.trialEndsAt')}</label>
          <input {...register('trialEndsAt')} type="date" className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">{t('clients.detail.subscription.fields.notes')}</label>
        <textarea
          {...register('notes')}
          rows={3}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
          placeholder={t('clients.detail.subscription.fields.notesPlaceholder')}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={mutation.isPending}>{t('common.save')}</Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

// ─── Tab: Sites & Zones ───────────────────────────────────────────────────────

function SitesTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: sites, isLoading } = useTenantSites(tenantId);
  const [showAdd, setShowAdd] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddr, setNewSiteAddr] = useState('');

  const addMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/tenants/${tenantId}/sites`, { name: newSiteName, address: newSiteAddr || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-sites', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      showToast({ title: t('clients.detail.sites.toast.created'), variant: 'success' });
      setShowAdd(false);
      setNewSiteName('');
      setNewSiteAddr('');
    },
    onError: (err) => showToast({ title: extractApiError(err, t), variant: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (siteId: string) => api.delete(`/api/v1/tenants/${tenantId}/sites/${siteId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-sites', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      showToast({ title: t('clients.detail.sites.toast.deleted'), variant: 'success' });
    },
    onError: (err) => showToast({ title: extractApiError(err, t), variant: 'error' }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">{t('clients.detail.sites.title')}</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> {t('clients.detail.sites.add')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (sites ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
          <MapPin className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-500">{t('clients.detail.sites.none')}</p>
          <Button className="mt-4" size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> {t('clients.detail.sites.add')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {(sites ?? []).map((site) => (
            <div key={site.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-lighter">
                    <MapPin className="h-4 w-4 text-brand-dark" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{site.name}</p>
                    {site.address && <p className="text-xs text-gray-400">{site.address}</p>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(t('clients.detail.sites.deleteConfirm', { name: site.name })))
                      deleteMutation.mutate(site.id);
                  }}
                  className="rounded p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {(site.zones ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 pl-11">
                  {site.zones.map((z) => (
                    <span key={z.id} className="rounded-full border border-gray-100 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-600">
                      {z.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal open title={t('clients.detail.sites.modal.title')} onClose={() => setShowAdd(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t('clients.detail.sites.modal.name')}</label>
              <input
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                type="text"
                placeholder={t('clients.detail.sites.modal.namePlaceholder')}
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t('clients.detail.sites.modal.address')}</label>
              <input
                value={newSiteAddr}
                onChange={(e) => setNewSiteAddr(e.target.value)}
                type="text"
                placeholder={t('clients.detail.sites.modal.addressPlaceholder')}
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
              <Button
                onClick={() => newSiteName.trim() && addMutation.mutate()}
                loading={addMutation.isPending}
                disabled={!newSiteName.trim()}
              >
                {t('clients.detail.sites.modal.submit')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: Utilisateurs ────────────────────────────────────────────────────────

function UsersTab({ tenant }: { tenant: Tenant }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold text-gray-900">{t('clients.detail.users.title')}</h3>
      <div className="rounded-xl border border-blue-50 bg-blue-50/60 p-5 text-sm text-blue-800">
        <p className="font-medium mb-2">{t('clients.detail.users.infoTitle')}</p>
        <p className="text-xs text-blue-700 mb-3">
          {t('clients.detail.users.infoBody', { name: tenant.name })}
        </p>
        <div className="rounded-lg bg-white/80 border border-blue-100 p-3 font-mono text-xs text-blue-600">
          GET /api/v1/users  <span className="text-gray-400">→ scoped to JWT tenantId</span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{t('clients.detail.users.primaryAdmin')}</span>
          <span className="font-mono text-xs text-gray-400">
            {tenant.primaryAdminId ?? '—'}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{t('clients.detail.users.userLimit')}</span>
          <span className="text-sm font-semibold text-gray-900">
            {(tenant.subscription as TenantSubscription | null | undefined)?.maxUsers ?? '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Historique ──────────────────────────────────────────────────────────

interface AuditEntry {
  id:         string;
  userId:     string;
  action:     string;
  resource:   string;
  resourceId?: string;
  ipAddress?: string;
  createdAt:  string;
}

function HistoryTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit.tenant', tenantId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      const { data } = await api.get<ApiResponse<AuditEntry[]>>(
        `/api/v1/audit/tenant/${tenantId}?${params}`,
      );
      return data;
    },
    staleTime: 30_000,
  });

  const entries  = data?.data ?? [];
  const meta     = data?.meta;
  const lastPage = meta?.lastPage ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">{t('clients.detail.history.title')}</h3>
        {meta && (
          <span className="text-xs text-gray-400">
            {t('clients.detail.history.pagination.entries', { total: meta.total })}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">{t('clients.detail.history.error')}</p>
        </div>
      )}

      {!isLoading && !isError && entries.length === 0 && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-8 text-center">
          <History className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">{t('clients.detail.history.noEntries')}</p>
        </div>
      )}

      {!isLoading && entries.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border border-surface-muted bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-surface-page text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">{t('clients.detail.history.columns.action')}</th>
                  <th className="px-4 py-3 text-left">{t('clients.detail.history.columns.resource')}</th>
                  <th className="px-4 py-3 text-left">{t('clients.detail.history.columns.user')}</th>
                  <th className="px-4 py-3 text-left">{t('clients.detail.history.columns.ip')}</th>
                  <th className="px-4 py-3 text-left">{t('clients.detail.history.columns.date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-muted">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_STYLES[entry.action] ?? 'bg-gray-100 text-gray-600'}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">
                      <span className="font-medium">{entry.resource}</span>
                      {entry.resourceId && (
                        <span className="ml-1.5 font-mono text-xs text-gray-400">
                          {entry.resourceId.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                      {entry.userId.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                      {entry.ipAddress ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {new Date(entry.createdAt).toLocaleString('fr-FR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {lastPage > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                {t('clients.detail.history.pagination.prev')}
              </button>
              <span className="text-xs text-gray-500">
                {t('clients.detail.history.pagination.page', { page, lastPage })}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                {t('clients.detail.history.pagination.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabId>('info');

  const { data: tenant, isLoading, error } = useTenant(id ?? '');

  // TABS are computed with useMemo so labels re-render on language change
  const TABS = useMemo(() => [
    { id: 'info'         as const, label: t('clients.detail.tabs.info'),         icon: Building2  },
    { id: 'admin'        as const, label: t('clients.detail.tabs.admin'),        icon: User2       },
    { id: 'modules'      as const, label: t('clients.detail.tabs.modules'),      icon: ToggleLeft  },
    { id: 'subscription' as const, label: t('clients.detail.tabs.subscription'), icon: CreditCard  },
    { id: 'sites'        as const, label: t('clients.detail.tabs.sites'),        icon: MapPin      },
    { id: 'users'        as const, label: t('clients.detail.tabs.users'),        icon: Users       },
    { id: 'history'      as const, label: t('clients.detail.tabs.history'),      icon: History     },
  ], [t]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-medium" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <XCircle className="h-12 w-12 text-red-300" />
        <p className="font-medium text-gray-500">{t('clients.detail.notFound')}</p>
        <Link to="/clients" className="text-sm text-brand-medium hover:underline">
          {t('clients.detail.history.pagination.prev')}
        </Link>
      </div>
    );
  }

  const statusClasses = STATUS_STYLES[tenant.status] ?? 'bg-gray-100 text-gray-600';
  const statusLabel   = t(`clients.status.${tenant.status}` as Parameters<typeof t>[0]);
  const planLabel     = t(`clients.plans.${tenant.plan}` as Parameters<typeof t>[0]);

  return (
    <>
      <Header
        title={tenant.name}
        subtitle={`/${tenant.slug} · ${planLabel}`}
        icon={Building2}
        iconColor="bg-brand-light text-brand-dark"
        extra={
          <Link
            to="/clients"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> {t('clients.detail.back')}
          </Link>
        }
      />

      <PageWrapper>
        {/* Summary bar */}
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-surface-muted bg-white p-4 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-lighter">
            <Building2 className="h-6 w-6 text-brand-dark" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-gray-900 text-lg">{tenant.name}</p>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses}`}>
                {statusLabel}
              </span>
              <span className="rounded-full bg-brand-lighter px-2.5 py-0.5 text-xs font-medium text-brand-dark">
                {planLabel}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 mt-1 text-xs text-gray-400">
              {tenant.email && <span>{tenant.email}</span>}
              {tenant.phone && <span>{tenant.phone}</span>}
              <span>{t('clients.detail.summaryBar.sites', { count: tenant._count?.sites ?? 0 })}</span>
              <span>{t('clients.detail.summaryBar.createdAt', { date: new Date(tenant.createdAt).toLocaleDateString('fr-FR') })}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-surface-muted bg-white p-1 shadow-sm mb-5">
          {TABS.map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              onClick={() => setActiveTab(tabId)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tabId
                  ? 'bg-brand-dark text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="rounded-xl border border-surface-muted bg-white p-5 shadow-sm">
          {activeTab === 'info'         && <InfoTab         tenant={tenant} tenantId={id!} />}
          {activeTab === 'admin'        && <AdminTab        tenant={tenant} tenantId={id!} />}
          {activeTab === 'modules'      && <ModulesTab      tenantId={id!} />}
          {activeTab === 'subscription' && <SubscriptionTab tenantId={id!} tenant={tenant} />}
          {activeTab === 'sites'        && <SitesTab        tenantId={id!} />}
          {activeTab === 'users'        && <UsersTab        tenant={tenant} />}
          {activeTab === 'history'      && <HistoryTab      tenantId={id!} />}
        </div>
      </PageWrapper>
    </>
  );
}
