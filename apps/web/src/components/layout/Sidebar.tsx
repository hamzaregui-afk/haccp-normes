import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, BookOpen, Building2, ChevronRight, ClipboardList, Cog, FileText,
  FolderOpen, LayoutDashboard, LogOut, MapPin, Package, ScrollText, ShieldAlert, Tag, Truck, Users, UsersRound, X,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { RoleBadge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import type { UserRole } from '@haccp/shared-types';

// ─── Nav item definition ──────────────────────────────────────────────────────

interface NavItem {
  labelKey: string;
  to:    string;
  icon:  LucideIcon;
  roles: UserRole[];
}

interface NavSection {
  titleKey: string;
  items:    NavItem[];
}

// ARCH-DECISION: Role arrays follow least-privilege — each entry lists every role
// that may see the item. OPERATOR is explicitly listed only where it belongs:
//   - controls (own tasks)   - nonconformities   - dlc (label printing)   - documents (GED)
// MANAGER is ≈ ADMIN everywhere except user/client creation (enforced in UsersPage).
const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: 'nav.operations',
    items: [
      // Dashboard: OPERATOR is redirected to /controls on arrival — no sidebar entry for them
      { labelKey: 'nav.overview',        to: '/dashboard',       icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.controls',        to: '/controls',        icon: ClipboardList,   roles: ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN', 'OPERATOR'] },
      { labelKey: 'nav.nonconformities', to: '/nonconformities', icon: ShieldAlert,     roles: ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN', 'OPERATOR'] },
      { labelKey: 'nav.dlc',             to: '/dlc',             icon: Tag,             roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'OPERATOR'] },
    ],
  },
  {
    titleKey: 'nav.assets',
    items: [
      { labelKey: 'nav.products',   to: '/products',   icon: Package,  roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.equipments', to: '/equipments', icon: Cog,      roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.suppliers',  to: '/suppliers',  icon: Truck,    roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.zones',      to: '/zones',      icon: MapPin,   roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.documents',  to: '/documents',  icon: BookOpen, roles: ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN', 'OPERATOR'] },
    ],
  },
  {
    titleKey: 'nav.team',
    items: [
      // Users: MANAGER can view but cannot create/edit/delete (enforced in UsersPage)
      { labelKey: 'nav.users',  to: '/users',  icon: Users,      roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.groups', to: '/groups', icon: UsersRound, roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
    ],
  },
  {
    titleKey: 'nav.administration',
    items: [
      { labelKey: 'nav.reports',  to: '/reports',  icon: BarChart3,  roles: ['ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'VIEWER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.audit',    to: '/audit',    icon: ScrollText, roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
      { labelKey: 'nav.settings', to: '/settings', icon: Cog,        roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
      // Clients: ADMIN + SUPER_ADMIN (ADMIN manages their own client base; SUPER_ADMIN manages all tenants)
      { labelKey: 'nav.clients',  to: '/clients',  icon: Building2,  roles: ['ADMIN', 'SUPER_ADMIN'] },
    ],
  },
];

// ─── Sidebar inner content (shared between mobile overlay and desktop fixed) ──

interface SidebarContentProps {
  onClose?: () => void;
}

function SidebarContent({ onClose }: SidebarContentProps) {
  const { t }    = useTranslation();
  const user     = useAuthStore((s) => s.user);
  const logout   = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    void logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-brand-medium px-5">
        <FileText className="h-6 w-6 text-gold" />
        <span className="text-lg font-bold tracking-wide text-white">NORMES HACCP</span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded p-1 text-green-300 hover:text-white lg:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_SECTIONS.map((section) => {
          const visible = section.items.filter(
            (item) => item.roles.length === 0 || item.roles.includes(user.role),
          );
          if (!visible.length) return null;

          return (
            <div key={section.titleKey}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-green-400/70">
                {t(section.titleKey)}
              </p>
              <ul className="space-y-0.5">
                {visible.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onClose}
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
            {(user.name ?? user.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            {user.name && (
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            )}
            <p className="truncate text-xs text-green-300">{user.email}</p>
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
    </div>
  );
}

// ─── Sidebar component ────────────────────────────────────────────────────────

interface SidebarProps {
  mobileOpen: boolean;
  onClose:    () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" aria-hidden>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          {/* Drawer */}
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-brand-dark">
            <SidebarContent onClose={onClose} />
          </aside>
        </div>
      )}

      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-[280px] lg:flex-col bg-brand-dark">
        <SidebarContent />
      </aside>
    </>
  );
}
