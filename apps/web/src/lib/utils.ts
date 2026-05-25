import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes safely (shadcn/ui convention). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

/**
 * Extract a human-readable message from an API error.
 * Handles Axios errors (single string message, array of messages),
 * generic Error objects, and unknown throws.
 *
 * Pass `fallback` (e.g. `t('common.error')`) to override the default
 * last-resort message with a translated string.
 */
export function extractApiMessage(error: unknown, fallback = 'Une erreur inattendue est survenue'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | undefined;
    if (typeof data?.message === 'string') return data.message;
    if (Array.isArray(data?.message))      return (data.message as string[]).join(', ');
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * Returns true when a string value is safe to render as an <img> src.
 * Accepts presigned MinIO/S3 HTTPS URLs (new) and legacy base64 data URIs.
 */
export function isRenderableUrl(value: string): boolean {
  return value.startsWith('http') || value.startsWith('data:');
}

/**
 * Locale-aware date formatter. Pass `i18n.language` as `locale` so dates
 * render in the user's selected language (FR / EN / AR).
 *
 * ARCH-DECISION: We keep this as a plain function (not a hook) so it can be
 * used both inside React components and in module-level helpers that accept a
 * locale parameter. Call sites obtain `locale` from `useTranslation().i18n.language`.
 */
export function fmtDate(
  d: Date | string,
  locale: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Date(d).toLocaleDateString(locale, opts);
}
