import type { ErrorCode } from './error-codes';

/**
 * Standard API error response shape — all services return this format.
 * Never expose `stack` or internal prisma/db error messages to clients.
 */
export interface ApiErrorResponse {
  success: false;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly httpStatus: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toResponse(): ApiErrorResponse {
    return {
      success: false,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: new Date().toISOString(),
    };
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('RESOURCE_001', `${resource}${id ? ` (${id})` : ''} not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(details: Record<string, unknown>) {
    super('VALIDATION_001', 'Validation failed', 422, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code: ErrorCode = 'AUTH_003') {
    super(code, 'Unauthorized', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super('AUTH_004', 'Insufficient permissions', 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('RESOURCE_002', message, 409);
  }
}
