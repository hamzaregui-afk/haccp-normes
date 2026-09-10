import type { Printer } from '@prisma/client';

/**
 * PrintProvider — transport strategy for a print job PLUS the metadata that lets
 * the admin UI configure a printer without any code change ("configure, not code").
 *
 * ARCH-DECISION: transport was an inline `if (connectionType)` ladder inside
 * executePrint. A provider strategy decouples "how the bytes reach the printer"
 * from job lifecycle + label generation, and `describe()` exposes each provider's
 * capabilities + config fields as DATA so the frontend renders the right dynamic
 * form and the backend validates generically. Providers stay pure/stateless: they
 * never touch the DB — PrintJobService persists the outcome and the config module
 * supplies secrets (the tenant's decrypted PrintNode key) as arguments.
 */
export interface PrintProvider {
  /** Stable key, persisted on jobs + used by the factory. */
  readonly name: string;
  /** Capability + form descriptor that drives the dynamic add-printer UI. */
  describe(): ProviderDescriptor;
  /** True if this provider handles the given (non-null) printer. */
  supports(printer: Printer): boolean;
  /** Dispatch a rendered label (see PrintDispatchResult). */
  dispatch(input: PrintDispatchInput): Promise<PrintDispatchResult>;

  // ── Optional enumeration / validation (only providers that can — PrintNode) ──
  /** Validate credentials + reachability. */
  testConnection?(apiKey: string): Promise<ProviderTestResult>;
  /** List the provider's computers/agents (PrintNode). */
  listComputers?(apiKey: string): Promise<ProviderComputer[]>;
  /** List printers, optionally filtered to one computer. */
  listPrinters?(apiKey: string, computerId?: number): Promise<ProviderPrinter[]>;
}

// ── Dynamic-form / capability descriptor ────────────────────────────────────────
export interface ProviderFieldSpec {
  name:     string;
  label:    string;
  type:     'text' | 'number' | 'select' | 'secret';
  required: boolean;
}
export interface ProviderDescriptor {
  key:            string;  // 'PRINTNODE' | 'NETWORK' | 'LOCAL_AGENT' | 'BLUETOOTH'
  label:          string;  // human label for the connection-mode dropdown
  requiresApiKey: boolean; // needs a tenant secret (PrintNode)
  listsPrinters:  boolean; // supports testConnection/listComputers/listPrinters
  fields:         ProviderFieldSpec[]; // provider-specific fields the form must render
}

// ── PrintNode enumeration shapes (kept generic/provider-agnostic on purpose) ────
export interface ProviderComputer { id: number; name: string; state: string }
export interface ProviderPrinter  { id: number; name: string; computerId: number; state: string }
export interface ProviderTestResult { ok: boolean; message: string; computerCount?: number }

// ── Dispatch ────────────────────────────────────────────────────────────────────
export interface PrintDispatchInput {
  jobId:    string;
  tenantId: string;
  /** Always non-null: a provider is only selected once a printer supports it. */
  printer:  Printer;
  zpl:      string;
  /** PrintNode dispatch credentials — populated by executePrint only for
   *  PrintNode printers (the tenant's decrypted API key). Never logged. */
  printNode?: { apiKey: string };
}

export type PrintDispatchResult =
  | { outcome: 'COMPLETED' }
  | { outcome: 'PENDING' }
  | { outcome: 'FAILED'; errorMessage: string };
