/**
 * Standard API response shapes — all services must return these structures.
 * Never return raw Prisma objects or internal error details to clients.
 */

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
  message?: string;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
}

/** Wrap a service result in the standard ApiResponse envelope */
export const toApiResponse = <T>(
  data: T,
  meta?: PaginationMeta,
  message?: string,
): ApiResponse<T> => ({ data, ...(meta ? { meta } : {}), ...(message ? { message } : {}) });

export const toPaginationMeta = (
  total: number,
  page: number,
  limit: number,
): PaginationMeta => ({
  total,
  page,
  limit,
  lastPage: Math.ceil(total / limit),
});
