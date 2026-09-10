import type { Printer } from '@prisma/client';
import type { PrintProvider } from './print-provider.interface';
import { NetworkTcpProvider } from './network-tcp.provider';
import { LocalAgentProvider } from './local-agent.provider';
import { PrintNodeProvider } from './printnode.provider';

export type {
  PrintProvider,
  PrintDispatchInput,
  PrintDispatchResult,
} from './print-provider.interface';
export { NetworkTcpProvider, LocalAgentProvider, PrintNodeProvider };

// Most-specific / synchronous transports first. PrintNode is scaffolding
// (supports() === false) until its per-tenant key config lands in Lot 3.
const DEFAULT_PROVIDERS: readonly PrintProvider[] = [
  new NetworkTcpProvider(),
  new LocalAgentProvider(),
  new PrintNodeProvider(),
];

/**
 * Pick the provider that handles this printer, or null when there is no printer
 * or no provider supports it (→ the job fails as "no printer configured").
 */
export function selectPrintProvider(
  printer: Printer | null,
  providers: readonly PrintProvider[] = DEFAULT_PROVIDERS,
): PrintProvider | null {
  if (!printer) return null;
  return providers.find((p) => p.supports(printer)) ?? null;
}
