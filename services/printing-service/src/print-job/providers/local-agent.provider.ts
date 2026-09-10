import type { Printer } from '@prisma/client';
import type {
  PrintProvider,
  PrintDispatchInput,
  PrintDispatchResult,
} from './print-provider.interface';

/**
 * USB and BLUETOOTH printers are not reachable from the server (they sit behind
 * the client's NAT / on a device). A client PULLS the stored ZPL and prints it
 * locally:
 *   • USB       → the Local Print Agent on the client PC
 *   • BLUETOOTH → the mobile app's native BT relay (Lot 7)
 * This provider therefore PARKS the job as PENDING (the caller persists the ZPL)
 * and returns immediately. It must NEVER report COMPLETED: there is no proof the
 * label physically printed until the pulling client acks it — a false "Imprimé"
 * corrupts the HACCP audit trail.
 */
export class LocalAgentProvider implements PrintProvider {
  readonly name = 'local-agent';

  supports(printer: Printer): boolean {
    return printer.connectionType === 'USB' || printer.connectionType === 'BLUETOOTH';
  }

  async dispatch(_input: PrintDispatchInput): Promise<PrintDispatchResult> {
    return { outcome: 'PENDING' };
  }
}
