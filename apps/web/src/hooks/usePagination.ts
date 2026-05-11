import { useState, useCallback } from 'react';

interface PaginationState {
  page:     number;
  limit:    number;
  setPage:  (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  reset:    () => void;
}

/**
 * Manages page/limit state for paginated API calls.
 *
 * Usage:
 *   const { page, limit, setPage, nextPage, prevPage, reset } = usePagination();
 *   const { data } = useQuery({ queryKey: ['items', page], queryFn: () => api.get(`/items?page=${page}&limit=${limit}`) });
 */
export function usePagination(initialPage = 1, initialLimit = 20): PaginationState {
  const [page, setPageState] = useState(initialPage);

  const setPage = useCallback((p: number) => {
    setPageState(Math.max(1, p));
  }, []);

  const nextPage = useCallback(() => setPageState((p) => p + 1), []);
  const prevPage = useCallback(() => setPageState((p) => Math.max(1, p - 1)), []);
  const reset    = useCallback(() => setPageState(initialPage), [initialPage]);

  return { page, limit: initialLimit, setPage, nextPage, prevPage, reset };
}
