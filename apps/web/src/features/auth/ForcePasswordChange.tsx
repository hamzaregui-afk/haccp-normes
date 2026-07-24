/**
 * ForcePasswordChange — interstitial shown when the JWT carries mustChangePassword.
 *
 * ARCH-DECISION: Rendered by RequireAuth INSTEAD of the app whenever
 * user.mustChangePassword is true (set by an admin-driven reset). It blocks every
 * authenticated route until the user sets a new password. On success the server
 * revokes all sessions, so we log out locally and fall back to /login for a clean
 * re-authentication with the new password.
 */
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ForcePasswordChange() {
  const { t } = useTranslation();
  const email = useAuthStore((s) => s.user?.email);
  const logout = useAuthStore((s) => s.logout);

  const {
    register, handleSubmit, watch, formState: { errors },
  } = useForm<FormValues>();

  const mutation = useMutation({
    mutationFn: (v: FormValues) =>
      api.post('/api/v1/auth/change-password', {
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      }),
    onSuccess: async () => {
      showToast({ title: t('auth.forceChange.success'), variant: 'success' });
      // Server revoked all sessions — log out locally, RequireAuth sends to /login.
      await logout();
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message
        : undefined;
      showToast({ title: msg ?? t('auth.forceChange.error'), variant: 'error' });
    },
  });

  const inputCls =
    'h-10 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-medium';

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <ShieldAlert className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{t('auth.forceChange.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('auth.forceChange.subtitle')}</p>
          {email && <p className="mt-1 text-xs font-mono text-gray-400">{email}</p>}
        </div>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t('auth.forceChange.currentPassword')}</label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder={t('auth.forceChange.currentPlaceholder')}
              className={inputCls}
              {...register('currentPassword', { required: t('auth.forceChange.required') })}
            />
            {errors.currentPassword && <p className="text-xs text-red-600">{errors.currentPassword.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t('auth.forceChange.newPassword')}</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder={t('auth.forceChange.newPlaceholder')}
              className={inputCls}
              {...register('newPassword', {
                required: t('auth.forceChange.required'),
                minLength: { value: 8, message: t('auth.forceChange.min') },
              })}
            />
            {errors.newPassword && <p className="text-xs text-red-600">{errors.newPassword.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t('auth.forceChange.confirmPassword')}</label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              {...register('confirmPassword', {
                required: t('auth.forceChange.required'),
                validate: (v) => v === watch('newPassword') || t('auth.forceChange.mismatch'),
              })}
            />
            {errors.confirmPassword && <p className="text-xs text-red-600">{errors.confirmPassword.message}</p>}
          </div>

          <Button type="submit" loading={mutation.isPending} className="mt-2 w-full">
            <KeyRound className="mr-1.5 h-4 w-4" /> {t('auth.forceChange.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}
