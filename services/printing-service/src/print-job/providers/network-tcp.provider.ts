import type { Printer } from '@prisma/client';
import { sendZplOverTcp } from '../../printer/tcp.printer';
import type {
  PrintProvider,
  ProviderDescriptor,
  PrintDispatchInput,
  PrintDispatchResult,
} from './print-provider.interface';

/**
 * NETWORK printers reachable directly from the server over TCP (raw port 9100).
 * Prints synchronously → COMPLETED, or FAILED when misconfigured. A transport
 * error is thrown by sendZplOverTcp and converted to FAILED by executePrint.
 */
export class NetworkTcpProvider implements PrintProvider {
  readonly name = 'network-tcp';

  describe(): ProviderDescriptor {
    return {
      key:            'NETWORK',
      label:          'Réseau (IP directe)',
      requiresApiKey: false,
      listsPrinters:  false,
      fields: [
        { name: 'ipAddress', label: 'Adresse IP',  type: 'text',   required: true },
        { name: 'port',      label: 'Port',         type: 'number', required: false },
      ],
    };
  }

  supports(printer: Printer): boolean {
    return printer.connectionType === 'NETWORK' && printer.provider == null;
  }

  async dispatch({ printer, zpl }: PrintDispatchInput): Promise<PrintDispatchResult> {
    if (!printer.ipAddress) {
      return { outcome: 'FAILED', errorMessage: 'Imprimante réseau sans adresse IP configurée' };
    }
    await sendZplOverTcp(printer.ipAddress, printer.port, zpl);
    return { outcome: 'COMPLETED' };
  }
}
