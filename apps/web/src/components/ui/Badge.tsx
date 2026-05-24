import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { UserRole, UserStatus } from '@haccp/shared-types';

// ─── Role Badge ───────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<UserRole, string> = {
  SUPER_ADMIN:     'bg-purple-100 text-purple-800 border border-purple-300',
  ADMIN:           'bg-brand-light text-brand-dark border border-brand-medium',
  MANAGER:         'bg-amber-50 text-amber-800 border border-amber-300',
  QUALITY_OFFICER: 'bg-accent-purple/30 text-purple-800 border border-purple-300',
  OPERATOR:        'bg-gray-100 text-gray-600 border border-gray-300',
  VIEWER:          'bg-gray-50 text-gray-500 border border-gray-200',
};

interface RoleBadgeProps {
  role: UserRole;
  size?: 'sm' | 'md';
}

export function RoleBadge({ role, size = 'md' }: RoleBadgeProps) {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        ROLE_STYLES[role],
      )}
    >
      {t(`users.roles.${role}` as Parameters<typeof t>[0])}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<UserStatus, string> = {
  ACTIVE:   'bg-green-100 text-green-800 border border-green-300',
  INACTIVE: 'bg-red-100 text-red-700 border border-red-300',
  INVITED:  'bg-yellow-100 text-yellow-800 border border-yellow-300',
};

interface StatusBadgeProps {
  status: UserStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        STATUS_STYLES[status],
      )}
    >
      {t(`users.status.${status}` as Parameters<typeof t>[0])}
    </span>
  );
}
