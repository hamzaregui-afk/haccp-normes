import type { Printer } from '@prisma/client';
import type {
  PrintProvider,
  ProviderDescriptor,
  PrintDispatchInput,
  PrintDispatchResult,
} from './print-provider.interface';

/**
 * USB and BLUETOOTH printers are not reachable from the server. A client PULLS
 * the stored ZPL and prints it locally (Local Print Agent for USB; mobile native
 * BT relay for Bluetooth), then acks the job. This provider PARKS the job as
 * PENDING and never reports COMPLETED (no proof of physical print → audit).
 */
export class LocalAgentProvider implements PrintProvider {
  readonly name = 'local-agent';

  describe(): ProviderDescriptor {
    return {
      key:            'LOCAL_AGENT',
      label:          'Agent local (USB)',
      requiresApiKey: false,
      listsPrinters:  false,
      // The agent registers/serves the printer by name; no provider-specific
      // field is required in the add-printer form beyond the common name/site/zone.
      fields: [],
    };
  }

  supports(printer: Printer): boolean {
    return (
      printer.provider == null &&
      (printer.connectionType === 'USB' || printer.connectionType === 'BLUETOOTH')
    );
  }

  async dispatch(_input: PrintDispatchInput): Promise<PrintDispatchResult> {
    return { outcome: 'PENDING' };
  }
}
