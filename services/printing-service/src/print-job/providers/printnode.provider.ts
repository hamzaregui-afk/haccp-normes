import type { Printer } from '@prisma/client';
import type {
  PrintProvider,
  PrintDispatchInput,
  PrintDispatchResult,
} from './print-provider.interface';

/**
 * PrintNode cloud-relay provider — scaffolding for Lot 3.
 *
 * PrintNode lets a client print without the server sharing the printer's LAN:
 * the server POSTs the label to api.printnode.com and a PrintNode client on the
 * customer site prints it. It requires a per-tenant, ENCRYPTED API key stored
 * backend-side (not yet modelled). Until that lands, this provider is NOT
 * selectable — supports() returns false — so no behaviour changes. It exists now
 * only to lock the provider contract and avoid rewriting executePrint later.
 */
export class PrintNodeProvider implements PrintProvider {
  readonly name = 'printnode';

  supports(_printer: Printer): boolean {
    // Lot 3: select when printer.provider === 'PRINTNODE' AND the tenant has a
    // configured (decrypted) PrintNode API key.
    return false;
  }

  async dispatch(_input: PrintDispatchInput): Promise<PrintDispatchResult> {
    return { outcome: 'FAILED', errorMessage: 'Fournisseur PrintNode non configuré' };
  }
}
