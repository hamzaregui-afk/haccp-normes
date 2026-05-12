import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ServicesHealth } from '@/components/shared/ServicesHealth';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';

// â”€â”€â”€ Change password modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PwdForm { password: string; confirm: string; }

function ChangePasswordModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<PwdForm>();
  const pwd = watch('password', '');

  const mutation = useMutation({
    mutationFn: (body: { password: string }) =>
      api.patch(`/api/v1/users/${userId}/password`, body),
    onSuccess: onClose,
  });

  return (
    <Modal open title="Changer le mot de passe" onClose={onClose}>
      <form
        onSubmit={handleSubmit((v) => mutation.mutate({ password: v.password }))}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Nouveau mot de passe</label>
          <input
            {...register('password', {
              required: 'Obligatoire',
              minLength: { value: 8, message: '8 caractÃ¨res minimum' },
            })}
            type="password"
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Confirmer le mot de passe</label>
          <input
            {...register('confirm', {
              required: 'Obligatoire',
              validate: (v) => v === pwd || 'Les mots de passe ne correspondent pas',
            })}
            type="password"
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium"
          />
          {errors.confirm && <p className="text-xs text-red-600">{errors.confirm.message}</p>}
        </div>
        {mutation.isError && (
          <p className="text-sm text-red-600">Une erreur est survenue. Veuillez rÃ©essayer.</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={mutation.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Modal>
  );
}

// â”€â”€â”€ Domain types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Sector options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SECTOR_OPTIONS = [
  { value: 'RESTAURATION',         label: 'Restauration' },
  { value: 'INDUSTRIE_ALIMENTAIRE', label: 'Industrie alimentaire' },
  { value: 'GRANDE_DISTRIBUTION',  label: 'Grande distribution' },
  { value: 'TRAITEUR',             label: 'Traiteur' },
  { value: 'AUTRE',                label: 'Autre' },
] as const;

// â”€â”€â”€ Toggle component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Section card wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SettingsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const [showPwdModal, setShowPwdModal] = useState(false);

  const [toast, setToast]           = useState<string | null>(null);
  const [notifyNc, setNotifyNc]     = useState(false);
  const [notifyReports, setNotifyReports] = useState(false);
  const [notifyDlc, setNotifyDlc]   = useState(false);

  const { data: tenantData, isLoading } = useQuery({
    queryKey: ['tenant', 'me'],
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
      setToast('ParamÃ¨tres enregistrÃ©s avec succÃ¨s.');
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

  return (
    <>
      <Header title="ParamÃ¨tres" subtitle="Configuration de l'Ã©tablissement" />

      <PageWrapper>
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargementâ€¦</div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 max-w-2xl">

            {/* â”€â”€ Section 1: Establishment info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <SectionCard title="Informations de l'Ã©tablissement">
              <div className="flex flex-col gap-4">
                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    Nom de l'Ã©tablissement <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('name', { required: 'Champ obligatoire' })}
                    type="text"
                    placeholder="Boulangerie Dupont"
                    className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  />
                  {errors.name && (
                    <p className="text-xs text-red-600">{errors.name.message}</p>
                  )}
                </div>

                {/* SIRET */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">NumÃ©ro SIRET</label>
                  <input
                    {...register('siret')}
                    type="text"
                    placeholder="123 456 789 00012"
                    className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  />
                </div>

                {/* Address */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Adresse</label>
                  <textarea
                    {...register('address')}
                    rows={3}
                    placeholder="12 rue des Boulangers, 75001 Paris"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium resize-none"
                  />
                </div>

                {/* Sector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Secteur d'activitÃ©</label>
                  <select
                    {...register('sector')}
                    className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
                  >
                    <option value="">-- SÃ©lectionner --</option>
                    {SECTOR_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </SectionCard>

            {/* â”€â”€ Section 2: Security â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <SectionCard title="SÃ©curitÃ©">
              <div className="flex flex-col gap-4">
                {/* JWT info box */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Les tokens expirent aprÃ¨s <strong>24h</strong>. Les utilisateurs sont automatiquement dÃ©connectÃ©s Ã  l'expiration.
                </div>

                {/* Change password */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Mot de passe</p>
                    <p className="text-xs text-gray-500">Modifier le mot de passe du compte administrateur</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowPwdModal(true)}
                  >
                    Changer le mot de passe
                  </Button>
                </div>
              </div>
            </SectionCard>

            {/* â”€â”€ Section 3: Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <SectionCard title="Notifications">
              <div className="divide-y divide-gray-100">
                <Toggle
                  id="notifyNc"
                  label="Nouvelles non-conformitÃ©s par email"
                  checked={notifyNc}
                  onChange={setNotifyNc}
                />
                <Toggle
                  id="notifyReports"
                  label="Rapports validÃ©s par email"
                  checked={notifyReports}
                  onChange={setNotifyReports}
                />
                <Toggle
                  id="notifyDlc"
                  label="Alertes DLC critiques"
                  checked={notifyDlc}
                  onChange={setNotifyDlc}
                />
              </div>
            </SectionCard>

            {/* â”€â”€ Error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {updateMutation.isError && (
              <p className="text-sm text-red-600">
                Une erreur est survenue lors de l'enregistrement. Veuillez rÃ©essayer.
              </p>
            )}

            {/* â”€â”€ Save button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div className="flex justify-end">
              <Button type="submit" size="md" loading={updateMutation.isPending}>
                Enregistrer
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
            setToast('Mot de passe modifiÃ© avec succÃ¨s.');
            setTimeout(() => setToast(null), 3500);
          }}
        />
      )}

      {/* Services health widget â€” ADMIN/SUPER_ADMIN only */}
      {isSuperAdmin && (
        <PageWrapper>
          <ServicesHealth />
        </PageWrapper>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-800 shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
