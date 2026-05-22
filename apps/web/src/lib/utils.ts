import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes safely (shadcn/ui convention). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

/**
 * Extract a human-readable message from an API error.
 * Handles Axios errors (single string message, array of messages),
 * generic Error objects, and unknown throws.
 */
export function extractApiMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | undefined;
    if (typeof data?.message === 'string') return data.message;
    if (Array.isArray(data?.message))      return (data.message as string[]).join(', ');
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Une erreur inattendue est survenue';
}

/**
 * Returns true when a string value is safe to render as an <img> src.
 * Accepts presigned MinIO/S3 HTTPS URLs (new) and legacy base64 data URIs.
 */
export function isRenderableUrl(value: string): boolean {
  return value.startsWith('http') || value.startsWith('data:');
}
