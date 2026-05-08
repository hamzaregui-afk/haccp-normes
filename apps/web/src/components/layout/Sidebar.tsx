import {
  BarChart3, Building2, ChevronRight, ClipboardList, Cog, FileText,
  LayoutDashboard, LogOut, Package, ScrollText, ShieldAlert, Tag, Truck, Users, UsersRound,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { RoleBadge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import type { UserRole } from '@haccp/shared-types';

// ─── Nav item definition ──────────────────────────────────────────────────────

interface NavItem {
  labelKey: string;  // i18n key under nav.*
  to:    string;
  icon:  React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

interface NavSection {
  titleKey: string;  // i18n key under nav.*
  items:    NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: 'nav.operations',
    items: [
      { labelKey: 'nav.overview',        to: '/dashboard',        icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.controls',        to: '/controls',         icon: ClipboardList,   roles: ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.nonconformities', to: '/nonconformities',  icon: ShieldAlert,     roles: ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.dlc',             to: '/dlc',              icon: Tag,             roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
    ],
  },
  {
    titleKey: 'nav.assets',
    items: [
      { labelKey: 'nav.products',    to: '/products',   icon: Package,    roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.equipments',  to: '/equipments', icon: Cog,        roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.suppliers',   to: '/suppliers',  icon: Truck,      roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
    ],
  },
  {
    titleKey: 'nav.team',
    items: [
      { labelKey: 'nav.users',   to: '/users',  icon: Users,      roles: ['ADMIN', 'SUPER_ADMIN'] },
      { labelKey: 'nav.groups',  to: '/groups', icon: UsersRound, roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
    ],
  },
  {
    titleKey: 'nav.administration',
    items: [
      { labelKey: 'nav.reports',  to: '/reports',  icon: BarChart3,  roles: ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.audit',    to: '/audit',    icon: ScrollText, roles: ['ADMIN', 'SUPER_ADMIN'] },
      { labelKey: 'nav.settings', to: '/settings', icon: Cog,        roles: ['ADMIN', 'SUPER_ADMIN'] },
      { labelKey: 'nav.clients',  to: '/clients',  icon: Building2,  roles: ['SUPER_ADMIN'] },
    ],
  },
];

// ─── Sidebar component ────────────────────────────────────────────────────────

export function Sidebar() {
  const { t }   = useTranslation();
  const user    = useAuthStore((s) => s.user);
  const logout  = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col bg-brand-dark">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-brand-medium px-5">
        <FileText className="h-6 w-6 text-gold" />
        <span className="text-lg font-bold tracking-wide text-white">NORMES HACCP</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_SECTIONS.map((section) => {
          const visible = section.items.filter(
            (item) => item.roles.length === 0 || item.roles.includes(user.role),
          );
          if (!visible.length) return null;

          return (
            <div key={section.title}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-green-400/70">
                {t(section.titleKey)}
              </p>
              <ul className="space-y-0.5">
                {visible.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-brand-medium text-white'
                            : 'text-green-100 hover:bg-brand-medium/60 hover:text-white',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1">{t(item.labelKey)}</span>
                          {isActive && <ChevronRight className="h-3 w-3 opacity-60" />}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-brand-medium px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-medium text-sm font-semibold text-white">
            {user.email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.email}</p>
            <RoleBadge role={user.role} size="sm" />
          </div>
          <button
            onClick={handleLogout}
            title="Déconnexion"
            className="rounded-lg p-1.5 text-green-300 hover:bg-brand-medium hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
