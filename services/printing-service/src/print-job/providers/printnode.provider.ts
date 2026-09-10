import type { Printer } from '@prisma/client';
import type {
  PrintProvider,
  PrintDispatchInput,
  PrintDispatchResult,
} from './print-provider.interface';

const PRINTNODE_ENDPOINT = 'https://api.printnode.com/printjobs';

/**
 * PrintNode cloud-relay provider (Lot 3).
 *
 * Lets a client print without the server sharing the printer's LAN: printing-
 * service POSTs the rendered label to PrintNode's API, and a PrintNode client on
 * the customer site prints it. Selected when `printer.provider === 'PRINTNODE'`.
 *
 * The per-tenant API key is passed in `input.printNode.apiKey` (decrypted by
 * executePrint from the tenant's encrypted config); this provider never reads the
 * DB or secrets storage. PrintNode accepting the job (HTTP 201) is our COMPLETED
 * signal — the physical print then happens on the client side.
 */
export class PrintNodeProvider implements PrintProvider {
  readonly name = 'printnode';

  supports(printer: Printer): boolean {
    return printer.provider === 'PRINTNODE';
  }

  async dispatch({ printer, zpl, printNode }: PrintDispatchInput): Promise<PrintDispatchResult> {
    if (!printNode?.apiKey) {
      return { outcome: 'FAILED', errorMessage: 'PrintNode non configuré pour ce tenant (clé API manquante ou désactivée)' };
    }
    if (printer.printNodePrinterId == null) {
      return { outcome: 'FAILED', errorMessage: "Aucun identifiant d'imprimante PrintNode configuré sur cette imprimante" };
    }

    // PrintNode uses HTTP Basic auth with the API key as the username.
    const auth = Buffer.from(`${printNode.apiKey}:`).toString('base64');

    try {
      const res = await fetch(PRINTNODE_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          printerId:   printer.printNodePrinterId,
          title:       `HACCP — ${printer.name}`,
          contentType: 'raw_base64',
          content:     Buffer.from(zpl, 'utf8').toString('base64'),
          source:      'NORMES HACCP',
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          outcome: 'FAILED',
          errorMessage: `PrintNode a refusé le job (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
        };
      }
      return { outcome: 'COMPLETED' };
    } catch (err) {
      return { outcome: 'FAILED', errorMessage: `Erreur réseau PrintNode: ${(err as Error).message}` };
    }
  }
}
