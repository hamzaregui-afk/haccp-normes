import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page:      number;
  lastPage:  number;
  total:     number;
  onPrev:    () => void;
  onNext:    () => void;
  onPage?:   (page: number) => void;
}

/**
 * Reusable pagination control — shows prev/next arrows and up to 5 page pills.
 * All pages are rendered as buttons for accessibility.
 */
export function Pagination({ page, lastPage, total, onPrev, onNext, onPage }: PaginationProps) {
  if (lastPage <= 1) return null;

  // Build the visible page window: current ± 2, clamped to [1, lastPage]
  const windowStart = Math.max(1, Math.min(page - 2, lastPage - 4));
  const windowEnd   = Math.min(lastPage, windowStart + 4);
  const pages       = Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <p className="text-xs text-gray-500">
        {total} résultat{total !== 1 ? 's' : ''}
      </p>

      <div className="flex items-center gap-1">
        {/* Previous */}
        <button
          onClick={onPrev}
          disabled={page <= 1}
          aria-label="Page précédente"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-muted bg-white text-gray-500 hover:bg-surface-page disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Page pills */}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPage?.(p)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? 'page' : undefined}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
              p === page
                ? 'bg-brand-medium text-white'
                : 'border border-surface-muted bg-white text-gray-600 hover:bg-surface-page'
            }`}
          >
            {p}
          </button>
        ))}

        {/* Next */}
        <button
          onClick={onNext}
          disabled={page >= lastPage}
          aria-label="Page suivante"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-muted bg-white text-gray-500 hover:bg-surface-page disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
