import { generateDlcZpl, type DlcLabelData, type LabelMedia } from '../printer/zpl.generator';
import type { LabelRenderer } from './label-renderer.interface';

/**
 * ZPL (Zebra) renderer. Delegates to the existing generateDlcZpl so the output
 * is BYTE-FOR-BYTE identical to the legacy path — existing labels/tests/golden
 * snapshots are unaffected.
 */
export class ZplRenderer implements LabelRenderer {
  readonly protocol = 'ZPL' as const;

  renderDlc(data: DlcLabelData, copies: number, media?: LabelMedia): string {
    return generateDlcZpl(data, copies, media);
  }
}
