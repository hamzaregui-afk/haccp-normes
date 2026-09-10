import type { Printer } from '@prisma/client';

/**
 * PrintProvider — transport strategy for a print job.
 *
 * ARCH-DECISION: transport was an inline `if (connectionType)` ladder inside
 * executePrint, which made adding PrintNode impossible without a rewrite and
 * froze protocol handling. A provider strategy decouples "how the bytes reach
 * the printer" from job lifecycle + label generation. Providers are pure and
 * stateless; they NEVER touch the DB — PrintJobService persists the outcome and
 * publishes the domain event. Providers that print synchronously (network TCP,
 * PrintNode) return COMPLETED/FAILED; providers served by an out-of-band pulling
 * client (local agent for USB, mobile BT relay for Bluetooth) return PENDING so
 * that client can later claim → print → ack.
 */
export interface PrintProvider {
  /** Stable identifier, persisted on the job event for traceability. */
  readonly name: string;
  /** True if this provider handles the given (non-null) printer. */
  supports(printer: Printer): boolean;
  /** Attempt to dispatch the rendered label. Must not throw for logical
   *  misconfiguration (return FAILED); may throw on transport errors (the
   *  caller's try/catch converts those to FAILED). */
  dispatch(input: PrintDispatchInput): Promise<PrintDispatchResult>;
}

export interface PrintDispatchInput {
  jobId:    string;
  tenantId: string;
  /** Always non-null: a provider is only selected once a printer supports it. */
  printer:  Printer;
  zpl:      string;
}

export type PrintDispatchResult =
  | { outcome: 'COMPLETED' }
  | { outcome: 'PENDING' }
  | { outcome: 'FAILED'; errorMessage: string };
