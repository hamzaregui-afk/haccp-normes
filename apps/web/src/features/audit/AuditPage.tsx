import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/lib/api';

// ─── Domain types ─────────────────────────────────────────────────────────────

// Shape matches the audit-service Prisma schema (resource/resourceId)
interface AuditLog {
  id: string;
  action: string;
  resource: string;       // entityType in UI — e.g. "users", "products"
  resourceId: string | null;
  userId: string;
  tenantId: string;
  payload: unknown;
  ipAddress: string | null;
  createdAt: string;
}

interface ApiResponse<T> {
  data: T;
  meta?: { total: number; page: number; limit: number; lastPage: number };
  message?: string;
}

// ─── Query hook ───────────────────────────────────────────────────────────────

function useAuditLogs(page: number, from: string, to: string) {
  return useQuery({
    queryKey: ['audit', page, from, to],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (from) p.set('from', from);
      if (to)   p.set('to', to);
      const { data } = await api.get<ApiResponse<AuditLog[]>>(`/api/v1/audit?${p}`);
      return data;
    },
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [page, setPage]   = useState(1);
  const [from, setFrom]   = useState('');
  const [to, setTo]       = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useAuditLogs(page, from, to);

  // Client-side filter by action or userEmail
  const filteredLogs = useMemo<AuditLog[]>(() => {
    const logs = data?.data ?? [];
    if (!search.trim()) return logs;
    const needle = search.toLowerCase();
    return logs.filter(
      (l) =>
        l.action.toLowerCase().includes(needle) ||
        l.resource.toLowerCase().includes(needle) ||
        l.userId.toLowerCase().includes(needle),
    );
  }, [data, search]);

  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFrom(e.target.value);
    setPage(1);
  }

  function handleToChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTo(e.target.value);
    setPage(1);
  }

  const meta = data?.meta;

  return (
    <>
      <Header title="Journal d'audit" subtitle="Registre immuable — lecture seule" />

      <PageWrapper>
        {/* Immutability banner */}
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ Ce journal est en lecture seule conformément aux exigences HACCP. Aucune modification n'est possible.
        </div>

        {/* Filter toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          {/* Text search */}
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs font-medium text-gray-600">Recherche</label>
            <input
              type="text"
              placeholder="Filtrer par action ou email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Du</label>
            <input
              type="date"
              value={from}
              onChange={handleFromChange}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Au</label>
            <input
              type="date"
              value={to}
              onChange={handleToChange}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-medium"
            />
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement…</div>
        ) : isError ? (
          <div className="py-20 text-center text-sm text-red-500">
            Erreur lors du chargement du journal d'audit.
          </div>
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Aucune entrée"
            description="Aucun événement ne correspond aux filtres actuels."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Date / Heure</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Ressource</th>
                  <th className="px-4 py-3">ID Ressource</th>
                  <th className="px-4 py-3">Utilisateur (ID)</th>
                  <th className="px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {new Date(log.createdAt).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.resource}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.resourceId ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.userId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {log.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {meta && meta.lastPage > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
                <span>
                  Page {meta.page} sur {meta.lastPage} — {meta.total} entrée(s)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === meta.lastPage}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </PageWrapper>
    </>
  );
}
