/**
 * DLC (Date Limite de Consommation) utility functions.
 * Used by both dlc-service (backend) and mobile app (label printing).
 */

export type DlcStatus = 'SAFE' | 'WARNING' | 'EXPIRED';

export interface DlcInfo {
  status: DlcStatus;
  daysRemaining: number;
  label: string;
}

/**
 * Compute DLC status given an expiry date and a warning threshold (default 2 days).
 */
export const getDlcInfo = (expiresAt: Date, warningDays = 2): DlcInfo => {
  const now = new Date();
  const diffMs = expiresAt.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return { status: 'EXPIRED', daysRemaining, label: 'EXPIRÉ' };
  }
  if (daysRemaining <= warningDays) {
    return { status: 'WARNING', daysRemaining, label: `${daysRemaining}j restant(s)` };
  }
  return { status: 'SAFE', daysRemaining, label: `${daysRemaining}j restant(s)` };
};

/**
 * Calculate a DLC date from a production date and a shelf life in days.
 */
export const computeDlc = (producedAt: Date, shelfLifeDays: number): Date => {
  const result = new Date(producedAt);
  result.setDate(result.getDate() + shelfLifeDays);
  return result;
};
