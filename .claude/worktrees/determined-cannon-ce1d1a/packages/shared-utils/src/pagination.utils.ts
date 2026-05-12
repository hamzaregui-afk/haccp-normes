/**
 * Pagination helpers — standardised across all services.
 */

export interface PaginationParams {
  page: number;   // 1-indexed
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export const toPaginationMeta = (
  total: number,
  { page, limit }: PaginationParams,
) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page < Math.ceil(total / limit),
  hasPrevPage: page > 1,
});

export const toSkipTake = ({ page, limit }: PaginationParams) => ({
  skip: (page - 1) * limit,
  take: limit,
});

export const DEFAULT_PAGINATION: PaginationParams = { page: 1, limit: 20 };
export const MAX_LIMIT = 100;
