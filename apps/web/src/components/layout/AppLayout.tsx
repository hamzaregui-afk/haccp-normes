import { Menu } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children?: ReactNode;
}

/**
 * Root authenticated layout: collapsible sidebar on mobile, fixed 280px on lg+.
 * The hamburger button sits in a top bar visible only below lg breakpoint.
 */
export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-page">
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main area: offset by sidebar on desktop, full-width on mobile */}
      <div className="flex flex-1 flex-col overflow-hidden lg:pl-[280px]">
        {/* Mobile top bar */}
        <div className="flex h-14 shrink-0 items-center border-b border-surface-muted bg-white px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir le menu"
            className="rounded-md p-2 text-gray-500 hover:bg-surface-page hover:text-gray-900"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-3 text-sm font-semibold text-brand-dark">NORMES HACCP</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}

/** Reusable page wrapper with consistent padding */
interface PageWrapperProps {
  children:   ReactNode;
  className?: string;
}

export function PageWrapper({ children, className = '' }: PageWrapperProps) {
  return (
    <div className={`p-4 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}
