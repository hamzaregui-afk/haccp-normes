import { Menu } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ToastContainer } from '@/components/ui/Toast';

interface AppLayoutProps {
  children?: ReactNode;
}

/**
 * Root authenticated layout: collapsible sidebar on mobile, fixed 280px on lg+.
 * The hamburger button and notification bell sit in a top bar visible on all screens.
 * Desktop: top bar floats above the main content area (sidebar has its own header).
 * Mobile: top bar is the primary chrome (sidebar opens as a drawer).
 */
export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-page">
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main area: offset by sidebar on desktop, full-width on mobile */}
      <div className="flex flex-1 flex-col overflow-hidden lg:pl-[280px]">
        {/* Top bar — mobile: full chrome; desktop: notification bell only */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-surface-muted bg-white px-4">
          {/* Left: hamburger (mobile only) + logo */}
          <div className="flex items-center gap-3 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Ouvrir le menu"
              className="rounded-md p-2 text-gray-500 hover:bg-surface-page hover:text-gray-900"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-brand-dark">NORMES HACCP</span>
          </div>

          {/* Spacer so bell stays right on desktop (no left content visible) */}
          <div className="hidden lg:block" />

          {/* Right: notification bell (always visible) */}
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto">
          {children ?? <Outlet />}
        </main>
      </div>

      {/* Toast portal — renders above everything */}
      <ToastContainer />
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
