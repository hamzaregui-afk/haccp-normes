import type { Printer } from '@prisma/client';
import type {
  PrintProvider,
  ProviderDescriptor,
  ProviderComputer,
  ProviderPrinter,
  ProviderTestResult,
  PrintDispatchInput,
  PrintDispatchResult,
} from './print-provider.interface';

const PRINTNODE_BASE = 'https://api.printnode.com';

/**
 * PrintNode cloud-relay provider (Lot 3). Lets a client print without the server
 * sharing the printer's LAN: printing-service POSTs the rendered label to
 * PrintNode's API, and a PrintNode client on the customer site prints it.
 *
 * Selected when `printer.provider === 'PRINTNODE'`. The per-tenant API key is
 * passed in as an argument (decrypted by the config module) — this provider never
 * reads the DB or secret storage. Also implements the enumeration used by the
 * add-printer flow: validate the key, list computers, list printers.
 */
export class PrintNodeProvider implements PrintProvider {
  readonly name = 'printnode';

  describe(): ProviderDescriptor {
    return {
      key:            'PRINTNODE',
      label:          'PrintNode',
      requiresApiKey: true,   // configured once at tenant level (encrypted), not per printer
      listsPrinters:  true,
      fields: [
        { name: 'providerComputerId',  label: 'Ordinateur PrintNode', type: 'select', required: true },
        { name: 'printNodePrinterId',  label: 'Imprimante',           type: 'select', required: true },
      ],
    };
  }

  supports(printer: Printer): boolean {
    return printer.provider === 'PRINTNODE';
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────────
  async dispatch({ printer, zpl, printNode }: PrintDispatchInput): Promise<PrintDispatchResult> {
    if (!printNode?.apiKey) {
      return { outcome: 'FAILED', errorMessage: 'PrintNode non configuré pour ce tenant (clé API manquante ou désactivée)' };
    }
    if (printer.printNodePrinterId == null) {
      return { outcome: 'FAILED', errorMessage: "Aucun identifiant d'imprimante PrintNode configuré sur cette imprimante" };
    }
    try {
      const res = await fetch(`${PRINTNODE_BASE}/printjobs`, {
        method:  'POST',
        headers: this.authHeaders(printNode.apiKey, true),
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
        return { outcome: 'FAILED', errorMessage: `PrintNode a refusé le job (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ''}` };
      }
      return { outcome: 'COMPLETED' };
    } catch (err) {
      return { outcome: 'FAILED', errorMessage: `Erreur réseau PrintNode: ${(err as Error).message}` };
    }
  }

  // ── Enumeration / validation (add-printer flow) ───────────────────────────────
  async testConnection(apiKey: string): Promise<ProviderTestResult> {
    try {
      const who = await fetch(`${PRINTNODE_BASE}/whoami`, { headers: this.authHeaders(apiKey) });
      if (who.status === 401 || who.status === 403) {
        return { ok: false, message: 'Clé API PrintNode invalide' };
      }
      if (!who.ok) {
        return { ok: false, message: `PrintNode inaccessible (HTTP ${who.status})` };
      }
      const computers = await this.listComputers(apiKey).catch(() => []);
      return { ok: true, message: 'Connexion PrintNode réussie', computerCount: computers.length };
    } catch (err) {
      return { ok: false, message: `PrintNode inaccessible: ${(err as Error).message}` };
    }
  }

  async listComputers(apiKey: string): Promise<ProviderComputer[]> {
    const rows = await this.getJson<Array<{ id: number; name: string; state?: string }>>('/computers', apiKey);
    return rows.map((c) => ({ id: c.id, name: c.name, state: c.state ?? 'unknown' }));
  }

  async listPrinters(apiKey: string, computerId?: number): Promise<ProviderPrinter[]> {
    const path = computerId != null ? `/computers/${computerId}/printers` : '/printers';
    const rows = await this.getJson<
      Array<{ id: number; name: string; state?: string; computer?: { id: number } }>
    >(path, apiKey);
    return rows.map((p) => ({
      id:         p.id,
      name:       p.name,
      computerId: p.computer?.id ?? computerId ?? 0,
      state:      p.state ?? 'unknown',
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  private authHeaders(apiKey: string, json = false): Record<string, string> {
    // PrintNode uses HTTP Basic auth with the API key as the username.
    const auth = Buffer.from(`${apiKey}:`).toString('base64');
    return json
      ? { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` }
      : { Authorization: `Basic ${auth}` };
  }

  private async getJson<T>(path: string, apiKey: string): Promise<T> {
    const res = await fetch(`${PRINTNODE_BASE}${path}`, { headers: this.authHeaders(apiKey) });
    if (!res.ok) throw new Error(`PrintNode ${path} → HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}
