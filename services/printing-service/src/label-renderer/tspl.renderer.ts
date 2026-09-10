import type { DlcLabelData, LabelMedia } from '../printer/zpl.generator';
import type { LabelRenderer } from './label-renderer.interface';

/** DD/MM/YYYY, tolerant of bad input. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
// TSPL strings are wrapped in double quotes → neutralise embedded quotes.
function esc(v: string): string {
  return v.replace(/["\r\n]/g, ' ');
}

/**
 * TSPL / TSPL2 renderer (TSC, many GPrinter/Gprinter models). Produces a
 * self-contained job: SIZE/GAP/DIRECTION, optional DENSITY/SPEED, CLS, TEXT
 * fields, an optional Code-128 of the lot, then PRINT <copies>.
 *
 * NOTE: syntactically valid TSPL; exact on-paper layout should be validated on
 * the target hardware (fonts/offsets vary slightly by model).
 */
export class TsplRenderer implements LabelRenderer {
  readonly protocol = 'TSPL' as const;

  renderDlc(data: DlcLabelData, copies: number, media?: LabelMedia): string {
    const widthMm  = media?.widthMm ?? 100;
    const heightMm = media?.heightMm ?? 50;
    const gapMm    = media?.mediaType === 'CONTINUOUS' ? 0 : (media?.gapMm ?? 2);
    const product  = esc(data.productName).slice(0, 40);
    const tenant   = data.tenantName ? esc(data.tenantName).slice(0, 40) : '';

    const lines: string[] = [
      `SIZE ${widthMm} mm,${heightMm} mm`,
      `GAP ${gapMm} mm,0 mm`,
      'DIRECTION 1',
      ...(media?.density != null ? [`DENSITY ${media.density}`] : []),
      ...(media?.speed   != null ? [`SPEED ${media.speed}`]     : []),
      'CLS',
    ];

    let yPos = 12;
    if (tenant) { lines.push(`TEXT 16,${yPos},"2",0,1,1,"${tenant}"`); yPos += 28; }
    lines.push(`TEXT 16,${yPos},"4",0,1,1,"${product}"`); yPos += 52;
    lines.push(`TEXT 16,${yPos},"3",0,1,1,"Fabrication: ${fmtDate(data.producedAt)}"`); yPos += 40;
    lines.push(`TEXT 16,${yPos},"3",0,1,1,"A consommer avant:"`); yPos += 36;
    lines.push(`TEXT 16,${yPos},"5",0,1,1,"${fmtDate(data.expiresAt)}"`); yPos += 60;
    if (data.lotNumber) {
      const lot = esc(String(data.lotNumber));
      lines.push(`TEXT 16,${yPos},"2",0,1,1,"Lot: ${lot}"`); yPos += 34;
      lines.push(`BARCODE 16,${yPos},"128",56,1,0,2,2,"${lot}"`);
    }
    lines.push(`PRINT ${Math.max(1, data.copies ?? copies)}`);
    return lines.join('\n');
  }
}
