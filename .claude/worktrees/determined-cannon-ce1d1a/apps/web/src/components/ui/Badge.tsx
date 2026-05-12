import { cn } from '@/lib/utils';
import type { UserRole, UserStatus } from '@haccp/shared-types';

// ─── Role Badge ───────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<UserRole, string> = {
  SUPER_ADMIN:     'bg-purple-100 text-purple-800 border border-purple-300',
  ADMIN:           'bg-brand-light text-brand-dark border border-brand-medium',
  MANAGER:         'bg-orange-100 text-orange-800 border border-orange-300',
  QUALITY_OFFICER: 'bg-purple-100 text-purple-800 border border-purple-300',
  OPERATOR:        'bg-gray-100 text-gray-700 border border-gray-300',
  VIEWER:          'bg-gray-100 text-gray-500 border border-gray-200',
};

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN:     'Super Admin',
  ADMIN:           'Admin',
  MANAGER:         'Manager',
  QUALITY_OFFICER: 'Resp. Qualité',
  OPERATOR:        'Opérateur',
  VIEWER:          'Lecteur',
};

interface RoleBadgeProps {
  role: UserRole;
  size?: 'sm' | 'md';
}

export function RoleBadge({ role, size = 'md' }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        ROLE_STYLES[role],
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<UserStatus, string> = {
  ACTIVE:   'bg-green-100 text-green-800 border border-green-300',
  INACTIVE: 'bg-red-100 text-red-700 border border-red-300',
  INVITED:  'bg-yellow-100 text-yellow-800 border border-yellow-300',
};

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE:   'Actif',
  INACTIVE: 'Inactif',
  INVITED:  'Invité',
};

interface StatusBadgeProps {
  status: UserStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
