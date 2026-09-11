import { useQuery } from '@tanstack/react-query';
import { Building2, Check, ChevronDown, Globe2, Layers3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useSupervisionStore } from '@/store/supervision.store';
import type { ApiResponse, Tenant } from '@haccp/shared-types';

/**
 * SUPER_ADMIN client-supervision selector (top bar).
 *
 * Renders nothing for non-SUPER_ADMIN users. Choosing a client sets the
 * supervision context (see supervision.store), which flows to the backend as
 * the X-Selected-Tenant header and re-scopes every page's data.
 *
 * ARCH-DECISION: split into a guard + inner component so the data-fetching
 * (useQuery, which requires a QueryClientProvider) is only mounted for a
 * SUPER_ADMIN. Non-admin renders return null immediately with no heavy hooks —
 * this also keeps the Header usable in tests/pages without a QueryClient.
 */
export function SupervisionSelector() {
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  if (!isSuperAdmin) return null;
  return <SupervisionSelectorInner />;
}

function SupervisionSelectorInner() {
  const { t } = useTranslation();

  const mode = useSupervisionStore((s) => s.mode);
  const selectedTenantName = useSupervisionStore((s) => s.selectedTenantName);
  const selectTenant = useSupervisionStore((s) => s.selectTenant);
  const selectAll = useSupervisionStore((s) => s.selectAll);
  const selectPlatform = useSupervisionStore((s) => s.selectPlatform);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['supervision', 'tenants'],
    queryFn: async () => {
      // Dynamic import keeps api.ts (which uses import.meta.env) out of this
      // module's static graph, so mounting the Header in tests/non-admin paths
      // never eval-loads it — matches auth.store's lazy `import('@/lib/api')`.
      const { api } = await import('@/lib/api');
      const { data } = await api.get<ApiResponse<Tenant[]>>('/api/v1/tenants?page=1&limit=100');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const currentLabel =
    mode === 'SINGLE' && selectedTenantName
      ? selectedTenantName
      : mode === 'ALL'
        ? t('supervision.all')
        : t('supervision.platform');

  const tenants = (data ?? []).filter((tn) => tn.status === 'ACTIVE');

  return (
    <div ref={ref} className="relative">
      <span className="mr-2 hidden text-xs font-medium text-gray-400 md:inline">
        {t('supervision.label')}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
          mode === 'SINGLE'
            ? 'border-brand-medium bg-brand-lighter text-brand-dark'
            : 'border-surface-muted bg-white text-gray-600 hover:text-brand-dark',
        )}
      >
        {mode === 'SINGLE' ? (
          <Building2 className="h-4 w-4 text-brand-medium" />
        ) : mode === 'ALL' ? (
          <Layers3 className="h-4 w-4 text-brand-medium" />
        ) : (
          <Globe2 className="h-4 w-4 text-gray-400" />
        )}
        <span className="max-w-[160px] truncate">{currentLabel}</span>
        <ChevronDown className="h-4 w-4 opacity-60" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-1 max-h-[70vh] w-72 overflow-y-auto rounded-lg border border-surface-muted bg-white py-1 shadow-lg"
        >
          <OptionRow
            icon={<Globe2 className="h-4 w-4 text-gray-400" />}
            label={t('supervision.platform')}
            selected={mode === 'PLATFORM'}
            onClick={() => { selectPlatform(); setOpen(false); }}
          />
          <OptionRow
            icon={<Layers3 className="h-4 w-4 text-brand-medium" />}
            label={t('supervision.all')}
            selected={mode === 'ALL'}
            onClick={() => { selectAll(); setOpen(false); }}
          />
          <div className="my-1 border-t border-surface-muted" />
          {isLoading && (
            <p className="px-3 py-2 text-xs text-gray-400">{t('supervision.loading')}</p>
          )}
          {!isLoading && tenants.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">{t('supervision.noClients')}</p>
          )}
          {tenants.map((tn) => (
            <OptionRow
              key={tn.id}
              icon={<Building2 className="h-4 w-4 text-brand-medium" />}
              label={tn.name}
              selected={mode === 'SINGLE' && selectedTenantName === tn.name}
              onClick={() => { selectTenant(tn.id, tn.name); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface OptionRowProps {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}

function OptionRow({ icon, label, selected, onClick }: OptionRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-brand-lighter',
        selected ? 'font-semibold text-brand-dark' : 'text-gray-600',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {selected && <Check className="h-4 w-4 text-brand-medium" />}
    </button>
  );
}
