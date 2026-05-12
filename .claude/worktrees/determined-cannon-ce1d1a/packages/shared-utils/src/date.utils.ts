/**
 * Pure date utility functions — no side effects, fully testable.
 * All functions accept/return plain Date objects or ISO strings.
 */

export const formatDate = (date: Date, locale = 'fr-FR'): string =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date);

export const formatDateOnly = (date: Date, locale = 'fr-FR'): string =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(date);

export const isExpired = (date: Date): boolean => date < new Date();

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const daysUntil = (date: Date): number => {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export const startOfDay = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

export const endOfDay = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
};
