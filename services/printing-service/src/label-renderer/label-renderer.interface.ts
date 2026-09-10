import type { DlcLabelData, LabelMedia } from '../printer/zpl.generator';

/**
 * LabelRenderer — turns a DLC label + media into a printer-language string,
 * decoupled from the transport (provider) and from the printer model.
 *
 * ARCH-DECISION: label generation was ZPL-only, so non-Zebra printers (TSC /
 * many GPrinter models speaking TSPL, or ESC/POS devices) printed garbage. A
 * renderer strategy keyed by `printer.protocol` lets any supported protocol be
 * produced without touching the DLC flow, providers, jobs, history or reports.
 * The label DATA is identical across protocols — only the command syntax differs.
 */
export type LabelProtocol = 'ZPL' | 'TSPL' | 'ESC_POS';

export interface LabelRenderer {
  readonly protocol: LabelProtocol;
  renderDlc(data: DlcLabelData, copies: number, media?: LabelMedia): string;
}
