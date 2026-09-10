import type { Printer } from '@prisma/client';
import { sendZplOverTcp } from '../../printer/tcp.printer';
import type {
  PrintProvider,
  PrintDispatchInput,
  PrintDispatchResult,
} from './print-provider.interface';

/**
 * NETWORK printers reachable directly from the server over TCP (raw port 9100).
 * Prints synchronously → COMPLETED, or FAILED when misconfigured. A transport
 * error (timeout / connection refused) is thrown by sendZplOverTcp and converted
 * to FAILED by PrintJobService.executePrint's try/catch — preserving the previous
 * behaviour exactly.
 */
export class NetworkTcpProvider implements PrintProvider {
  readonly name = 'network-tcp';

  supports(printer: Printer): boolean {
    return printer.connectionType === 'NETWORK';
  }

  async dispatch({ printer, zpl }: PrintDispatchInput): Promise<PrintDispatchResult> {
    if (!printer.ipAddress) {
      return { outcome: 'FAILED', errorMessage: 'Imprimante réseau sans adresse IP configurée' };
    }
    await sendZplOverTcp(printer.ipAddress, printer.port, zpl);
    return { outcome: 'COMPLETED' };
  }
}
