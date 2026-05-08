import { type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children?: ReactNode;
}

/**
 * Root authenticated layout: fixed 280px sidebar + scrollable main content.
 * Used by the RequireAuth route wrapper — all protected pages render inside here.
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-page">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden pl-[280px]">
        <main className="flex-1 overflow-y-auto">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}

/** Reusable page wrapper with consistent padding + optional header slot */
interface PageWrapperProps {
  children: ReactNode;
  className?: string;
}

export function PageWrapper({ children, className = '' }: PageWrapperProps) {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  );
}
