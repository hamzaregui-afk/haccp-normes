/**
 * Centralised error codes — used in every service response and on the frontend
 * to display localised messages without leaking internal details.
 */
export const ErrorCode = {
  // Auth
  INVALID_CREDENTIALS: 'AUTH_001',
  TOKEN_EXPIRED: 'AUTH_002',
  TOKEN_INVALID: 'AUTH_003',
  INSUFFICIENT_PERMISSIONS: 'AUTH_004',
  ACCOUNT_DISABLED: 'AUTH_005',

  // Tenant
  TENANT_NOT_FOUND: 'TENANT_001',
  TENANT_SUSPENDED: 'TENANT_002',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_001',
  MISSING_REQUIRED_FIELD: 'VALIDATION_002',

  // Resource
  NOT_FOUND: 'RESOURCE_001',
  ALREADY_EXISTS: 'RESOURCE_002',
  CONFLICT: 'RESOURCE_003',

  // CCP / Control
  CRITICAL_LIMIT_BREACHED: 'CCP_001',
  CORRECTIVE_ACTION_REQUIRED: 'CCP_002',

  // Audit (write-once violation — should never happen, but guard anyway)
  AUDIT_WRITE_VIOLATION: 'AUDIT_001',

  // Server
  INTERNAL_ERROR: 'SERVER_001',
  SERVICE_UNAVAILABLE: 'SERVER_002',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
