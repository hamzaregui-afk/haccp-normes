/**
 * Extracts the resource ID from a toApiResponse() result.
 *
 * ARCH-DECISION: toApiResponse wraps data in { data: T }. Controllers need the
 * id from the created resource to emit audit events, but the response type is
 * unknown at the call site. This helper centralises the unsafe cast instead of
 * repeating `(result as { data?: { id?: string } }).data?.id` in every controller.
 */
export function extractResourceId(result: unknown): string | undefined {
  return (result as { data?: { id?: string } } | null)?.data?.id ?? undefined;
}
