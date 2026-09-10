import type { DlcLabelData, LabelMedia } from '../printer/zpl.generator';
import type { LabelRenderer } from './label-renderer.interface';

const ESC = '\x1b';
const GS = '\x1d';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
// ESC/POS default code pages rarely include é/à — strip diacritics for safety.
function ascii(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\r\n]/g, ' ');
}

/**
 * ESC/POS renderer (many receipt-style / label devices). Produces raw control
 * codes: init, centred header, double-size product + DLC date, an optional
 * Code-128 of the lot, one block per copy, then a full cut.
 *
 * NOTE: valid ESC/POS; verify on the target device (some models differ on cut /
 * barcode support — the provider still transmits the bytes unchanged).
 */
export class EscPosRenderer implements LabelRenderer {
  readonly protocol = 'ESC_POS' as const;

  renderDlc(data: DlcLabelData, copies: number, _media?: LabelMedia): string {
    const build = (): string => {
      let s = '';
      s += ESC + '@';               // initialise
      s += ESC + 'a' + '\x01';      // align center
      if (data.tenantName) s += ascii(data.tenantName).slice(0, 42) + '\n';
      s += ESC + '!' + '\x30';      // double width + height
      s += ascii(data.productName).slice(0, 32) + '\n';
      s += ESC + '!' + '\x00';      // normal size
      s += ESC + 'a' + '\x00';      // align left
      s += `Fabrication: ${fmtDate(data.producedAt)}\n`;
      s += ESC + '!' + '\x10';      // double height
      s += `A consommer avant: ${fmtDate(data.expiresAt)}\n`;
      s += ESC + '!' + '\x00';
      if (data.lotNumber) {
        const lot = ascii(String(data.lotNumber));
        s += `Lot: ${lot}\n`;
        const payload = `{B${lot}`;           // CODE128 code-set B selector
        s += GS + 'h' + '\x50';               // barcode height 80 dots
        s += GS + 'w' + '\x02';               // barcode module width
        s += GS + 'k' + '\x49' + String.fromCharCode(payload.length) + payload; // CODE128
        s += '\n';
      }
      s += '\n\n';
      return s;
    };

    const n = Math.max(1, data.copies ?? copies);
    let out = '';
    for (let i = 0; i < n; i++) out += build();
    out += GS + 'V' + '\x00';       // full cut
    return out;
  }
}
