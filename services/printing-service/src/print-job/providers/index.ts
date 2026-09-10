import type { Printer } from '@prisma/client';
import type { PrintProvider, ProviderDescriptor } from './print-provider.interface';
import { NetworkTcpProvider } from './network-tcp.provider';
import { LocalAgentProvider } from './local-agent.provider';
import { PrintNodeProvider } from './printnode.provider';

export type {
  PrintProvider,
  ProviderDescriptor,
  ProviderFieldSpec,
  ProviderComputer,
  ProviderPrinter,
  ProviderTestResult,
  PrintDispatchInput,
  PrintDispatchResult,
} from './print-provider.interface';
export { NetworkTcpProvider, LocalAgentProvider, PrintNodeProvider };

// Stateless singletons, keyed by descriptor.key for the factory.
const printNode  = new PrintNodeProvider();
const network    = new NetworkTcpProvider();
const localAgent = new LocalAgentProvider();

const BY_KEY: Record<string, PrintProvider> = {
  PRINTNODE:   printNode,
  NETWORK:     network,
  LOCAL_AGENT: localAgent,
};

// Ordered list for dispatch selection — PrintNode's `printer.provider` override
// is checked first; Network/LocalAgent only match when no provider override is set.
const DEFAULT_PROVIDERS: readonly PrintProvider[] = [printNode, network, localAgent];

/**
 * PrinterProviderFactory — get a provider by its descriptor key
 * ('PRINTNODE' | 'NETWORK' | 'LOCAL_AGENT'). The rest of the system never needs
 * to know how each provider works.
 */
export function getProvider(key: string): PrintProvider | null {
  return BY_KEY[key] ?? null;
}

/** The provider catalog (data) that drives the dynamic add-printer UI. */
export function describeProviders(): ProviderDescriptor[] {
  return DEFAULT_PROVIDERS.map((p) => p.describe());
}

/** Pick the provider that handles a given printer for dispatch, or null. */
export function selectPrintProvider(
  printer: Printer | null,
  providers: readonly PrintProvider[] = DEFAULT_PROVIDERS,
): PrintProvider | null {
  if (!printer) return null;
  return providers.find((p) => p.supports(printer)) ?? null;
}
