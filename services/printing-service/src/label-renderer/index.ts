import { ZplRenderer } from './zpl.renderer';
import { TsplRenderer } from './tspl.renderer';
import { EscPosRenderer } from './escpos.renderer';
import type { LabelRenderer } from './label-renderer.interface';

export type { LabelRenderer, LabelProtocol } from './label-renderer.interface';
export { ZplRenderer, TsplRenderer, EscPosRenderer };

// Stateless singletons keyed by printer.protocol.
const RENDERERS: Record<string, LabelRenderer> = {
  ZPL:     new ZplRenderer(),
  TSPL:    new TsplRenderer(),
  ESC_POS: new EscPosRenderer(),
};

/**
 * LabelRendererFactory — pick the renderer for a printer's protocol.
 * Defaults to ZPL (the legacy behaviour) for null/unknown protocols, so nothing
 * changes for existing printers.
 */
export function getLabelRenderer(protocol?: string | null): LabelRenderer {
  return (protocol ? RENDERERS[protocol] : undefined) ?? RENDERERS['ZPL'];
}
