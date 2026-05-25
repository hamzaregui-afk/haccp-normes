import { Menu } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '@/components/ui/Toast';
import { ErrorBoundary } from './ErrorBoundary';

interface AppLayoutProps {
  children?: ReactNode;
}

/**
 * Root authenticated layout: collapsible sidebar on mobile, fixed 280px on lg+.
 *
 * ARCH-DECISION: The mobile top bar (hamburger + logo) is only shown on small
 * screens (< lg). On desktop, each page's own <Header> component provides the
 * page title, language switcher, and notification bell — so we don't duplicate
 * those controls here. On mobile the <Header> is still rendered inside the
 * scrollable <main>, so mobile users also get the page chrome.
 */
export function AppLayout({ children }: AppLayoutProps) {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-page">
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main area: offset by sidebar on desktop, full-width on mobile */}
      <div className="flex flex-1 flex-col overflow-hidden lg:pl-[280px]">
        {/* Mobile-only top bar: hamburger + logo.
            Desktop: this bar is hidden — <Header> inside each page provides chrome. */}
        <div className="flex h-14 shrink-0 items-center border-b border-surface-muted bg-white px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label={t('common.openMenu')}
            className="rounded-md p-2 text-gray-500 hover:bg-surface-page hover:text-gray-900"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-3 text-sm font-semibold text-brand-dark">NORMES HACCP</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary>
            {children ?? <Outlet />}
          </ErrorBoundary>
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
