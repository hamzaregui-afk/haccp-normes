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

// PrintNode FIRST: an explicit `printer.provider === 'PRINTNODE'` overrides the
// connectionType-based transports (Network/LocalAgent), which only match when no
// provider override is set.
const DEFAULT_PROVIDERS: readonly PrintProvider[] = [
  new PrintNodeProvider(),
  new NetworkTcpProvider(),
  new LocalAgentProvider(),
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
