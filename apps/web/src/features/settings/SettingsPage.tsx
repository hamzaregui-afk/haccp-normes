import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ServicesHealth } from '@/components/shared/ServicesHealth';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenantId';

// ─── Change password modal ────────────────────────────────────────────────────

interface PwdForm { password: string; confirm: string; }

function ChangePasswordModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<PwdForm>();
  const pwd = watch('password', '');

  const mutation = useMutation({
    mutationFn: (body: { password: string }) =>
      api.patch(`/api/v1/users/${userId}/password`, body),
    onSuccess: onClose,
  });

  return (
    <Modal open title={t('settings.security.changePassword')} onClose={onClose}>
      <form
        onSubmit={handleSubmit((v) => mutation.mutate({ password: v.password }))}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{t('users.passwordModal.newPassword')}</label>
          <input
            {...register('password', {
              required: t('settings.validation.required'),
              minLength: { value: 8, message: t('settings.validation.passwordMin') },
            })}
            type="password"
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{t('users.passwordModal.confirmPassword')}</label>
          <input
            {...register('confirm', {
              required: t('settings.validation.required'),
              validate: (v) => v === pwd || t('settings.validation.confirmMatch'),
            })}
            type="password"
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          {errors.confirm && <p className="text-xs text-red-600">{errors.confirm.message}</p>}
        </div>
        {mutation.isError && (
          <p className="text-sm text-red-600">{t('common.error')}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={mutation.isPending}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Domain types ─────────────────────────────────────────────────────────────

interface TenantSettings {
  name: string;
  siret: string;
  address: string;
  sector: string;
  notifyNewNc: boolean;
  notifyValidatedReports: boolean;
  notifyCriticalDlc: boolean;
}

interface ApiResponse<T> {
  data: T;
  message?: string;
}

// ─── Toggle component ─────────────────────────────────────────────────────────

interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ id, label, checked, onChange }: ToggleProps) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="relative">
        <input
          id={id}
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          onClick={() => onChange(!checked)}
          className={`h-6 w-11 rounded-full transition-colors ${
            checked ? 'bg-brand-medium' : 'bg-gray-200'
          }`}
        >
          <div
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </div>
      </div>
    </label>
  );
}

// ─── Section card wrapper ─────────────────────────────────────────────────────

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
}

function SectionCard({ title, children }: SectionCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-brand-dark">{title}</h2>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const [showPwdModal, setShowPwdModal] = useState(false);
  const tenantId = useTenantId();

  const [toast, setToast]           = useState<string | null>(null);
  const [notifyNc, setNotifyNc]     = useState(false);
  const [notifyReports, setNotifyReports] = useState(false);
  const [notifyDlc, setNotifyDlc]   = useState(false);

  const { data: tenantData, isLoading } = useQuery({
    queryKey: ['tenant', tenantId, 'me'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<TenantSettings>>('/api/v1/tenants/me');
      return data.data;
    },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<TenantSettings>();

  // Populate form + toggle state once data is loaded
  useEffect(() => {
    if (tenantData) {
      reset(tenantData);
      setNotifyNc(tenantData.notifyNewNc ?? false);
      setNotifyReports(tenantData.notifyValidatedReports ?? false);
      setNotifyDlc(tenantData.notifyCriticalDlc ?? false);
    }
  }, [tenantData, reset]);

  const updateMutation = useMutation({
    mutationFn: (body: TenantSettings) => api.patch('/api/v1/tenants/me', body),
    onSuccess: () => {
      setToast(t('settings.saveSuccess'));
      setTimeout(() => setToast(null), 3500);
    },
  });

  function onSubmit(values: TenantSettings) {
    updateMutation.mutate({
      ...values,
      notifyNewNc: notifyNc,
      notifyValidatedReports: notifyReports,
      notifyCriticalDlc: notifyDlc,
    });
  }

  // Sector options — built at render time so t() is available
  const sectorOptions = [
    { value: 'RESTAURATION',          label: t('settings.sectors.RESTAURATION') },
    { value: 'INDUSTRIE_ALIMENTAIRE', label: t('settings.sectors.INDUSTRIE_ALIMENTAIRE') },
    { value: 'GRANDE_DISTRIBUTION',   label: t('settings.sectors.GRANDE_DISTRIBUTION') },
    { value: 'TRAITEUR',              label: t('settings.sectors.TRAITEUR') },
    { value: 'AUTRE',                 label: t('settings.sectors.AUTRE') },
  ];

  return (
    <>
      <Header title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <PageWrapper>
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">{t('settings.loading')}</div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 max-w-2xl">

            {/* ── Section 1: Establishment info ─────────────────────────────── */}
            <SectionCard title={t('settings.sections.info')}>
              <div className="flex flex-col gap-4">
                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    {t('settings.fields.name')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('name', { required: t('settings.validation.required') })}
                    type="text"
                    placeholder={t('settings.fields.namePlaceholder')}
                    className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  />
                  {errors.name && (
                    <p className="text-xs text-red-600">{errors.name.message}</p>
                  )}
                </div>

                {/* SIRET */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">{t('settings.fields.siret')}</label>
                  <input
                    {...register('siret')}
                    type="text"
                    placeholder={t('settings.fields.siretPlaceholder')}
                    className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  />
                </div>

                {/* Address */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">{t('settings.fields.address')}</label>
                  <textarea
                    {...register('address')}
                    rows={3}
                    placeholder={t('settings.fields.addressPlaceholder')}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium resize-none"
                  />
                </div>

                {/* Sector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">{t('settings.fields.sector')}</label>
                  <select
                    {...register('sector')}
                    className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  >
                    <option value="">{t('settings.fields.sectorPlaceholder')}</option>
                    {sectorOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </SectionCard>

            {/* ── Section 2: Security ───────────────────────────────────────── */}
            <SectionCard title={t('settings.sections.security')}>
              <div className="flex flex-col gap-4">
                {/* JWT info box */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  {t('settings.security.jwtInfo')}
                </div>

                {/* Change password */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{t('settings.security.passwordLabel')}</p>
                    <p className="text-xs text-gray-500">{t('settings.security.passwordSub')}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowPwdModal(true)}
                  >
                    {t('settings.security.changePassword')}
                  </Button>
                </div>
              </div>
            </SectionCard>

            {/* ── Section 3: Notifications ──────────────────────────────────── */}
            <SectionCard title={t('settings.sections.notifications')}>
              <div className="divide-y divide-gray-100">
                <Toggle
                  id="notifyNc"
                  label={t('settings.notifications.newNc')}
                  checked={notifyNc}
                  onChange={setNotifyNc}
                />
                <Toggle
                  id="notifyReports"
                  label={t('settings.notifications.validatedReports')}
                  checked={notifyReports}
                  onChange={setNotifyReports}
                />
                <Toggle
                  id="notifyDlc"
                  label={t('settings.notifications.criticalDlc')}
                  checked={notifyDlc}
                  onChange={setNotifyDlc}
                />
              </div>
            </SectionCard>

            {/* ── Error ─────────────────────────────────────────────────────── */}
            {updateMutation.isError && (
              <p className="text-sm text-red-600">{t('settings.saveError')}</p>
            )}

            {/* ── Save button ───────────────────────────────────────────────── */}
            <div className="flex justify-end">
              <Button type="submit" size="md" loading={updateMutation.isPending}>
                {t('settings.save')}
              </Button>
            </div>
          </form>
        )}
      </PageWrapper>

      {/* Change password modal */}
      {showPwdModal && currentUser && (
        <ChangePasswordModal
          userId={currentUser.sub}
          onClose={() => {
            setShowPwdModal(false);
            setToast(t('settings.passwordSuccess'));
            setTimeout(() => setToast(null), 3500);
          }}
        />
      )}

      {/* Services health widget — ADMIN/SUPER_ADMIN only */}
      {isSuperAdmin && (
        <PageWrapper>
          <ServicesHealth />
        </PageWrapper>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-brand-medium/30 bg-brand-light px-5 py-3 text-sm font-medium text-brand-dark shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
