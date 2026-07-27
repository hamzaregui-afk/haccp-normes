/**
 * zpl.generator.ts
 *
 * Pure ZPL string generation — no side effects, no I/O.
 * All functions are synchronous and referentially transparent.
 *
 * Label coordinate system: 8 dots per mm (standard thermal resolution)
 *   100mm wide = 800 dots  → ^PW800
 *    50mm tall  = 400 dots  → ^LL400
 *
 * ARCH-DECISION: ZPL is generated as raw strings rather than using a DOM or
 * template engine so that this module has zero runtime dependencies and can
 * be used in any environment — including CLI migration scripts and unit tests
 * that run without NestJS bootstrapping.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DlcLabelData {
  productName:  string;
  lotNumber?:   string | null;
  producedAt:   string; // ISO date string (YYYY-MM-DD or full ISO)
  expiresAt:    string; // ISO date string (YYYY-MM-DD or full ISO)
  tenantName?:  string;
  copies?:      number;
}

/**
 * Physical media a label is printed on — comes from the tenant's MediaProfile.
 * When provided, the ZPL is sized and laid out for THESE dimensions instead of
 * the hardcoded 100×50 mm default, and media-tracking / speed / density
 * commands are emitted so the printer feeds and cuts correctly.
 */
export interface LabelMedia {
  widthMm:      number;
  heightMm:     number;
  dpi?:         number;   // dots per inch — default 203
  mediaType?:   string;   // 'GAP' | 'CONTINUOUS' | 'BLACK_MARK'
  gapMm?:       number;
  blackMarkMm?: number;
  speed?:       number;   // ^PR print speed
  density?:     number;   // ^MD darkness
}

// Baseline the original layout was designed for: 100mm × 50mm at 203 dpi (8 dpmm).
const BASE_W = 800;
const BASE_H = 400;

function mediaTrackingCommand(mediaType?: string): string | null {
  switch (mediaType) {
    case 'CONTINUOUS': return '^MNN';                    // continuous media — no gap/mark sensing
    case 'BLACK_MARK': return '^MNM';                    // black-mark sensing
    case 'GAP':        return '^MNY';                    // web/gap sensing (die-cut labels)
    default:           return null;                      // leave the printer's configured default
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format an ISO date string to a human-readable DD/MM/YYYY label.
 * Gracefully falls back to the raw string if parsing fails.
 */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd   = String(d.getDate()).padStart(2, '0');
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return iso;
  }
}

/**
 * Escape special ZPL characters in user-provided strings.
 * Caret (^) and tilde (~) have special meaning in ZPL and must be escaped
 * when they appear in data fields.
 */
function escapeZpl(value: string): string {
  return value.replace(/\^/g, '').replace(/~/g, '');
}

// ── DLC label ─────────────────────────────────────────────────────────────────

/**
 * Generate a ZPL II string for a 100mm × 50mm DLC (Date Limite de Consommation)
 * food-safety label at 8 dpt (dots per mm) = 203 dpi.
 *
 * Layout (top → bottom):
 *   ─── separator line ──────────────────────────
 *   Company / product name  (large, bold, centred)
 *   ─── separator line ──────────────────────────
 *   Fabrication: DD/MM/YYYY
 *   À consommer avant: DD/MM/YYYY  (large, inverted/highlighted)
 *   Lot: XXXXXX  (if provided)
 *   ─── separator line ──────────────────────────
 *
 * @param data   Label data
 * @param copies Number of copies to print (default 1)
 */
export function generateDlcZpl(data: DlcLabelData, copies = 1, media?: LabelMedia): string {
  const effectiveCopies = Math.max(1, data.copies ?? copies);
  const productName     = escapeZpl(data.productName).substring(0, 40);
  const producedStr     = formatDate(data.producedAt);
  const expiresStr      = formatDate(data.expiresAt);
  const tenantLine      = data.tenantName ? escapeZpl(data.tenantName).substring(0, 40) : '';

  // ── Resolve print dimensions ────────────────────────────────────────────────
  // ARCH-DECISION: With no MediaProfile we reproduce the exact original 800×400
  // (100×50mm@203dpi) output byte-for-byte — existing templates/tests are unaffected.
  // With a profile, the whole layout scales proportionally to the real label so a
  // 50×29mm or 2×4in or continuous-roll label prints correctly instead of being
  // clipped to 100×50. Font sizes scale with height; widths with width.
  const dpmm = media ? Math.max(1, (media.dpi ?? 203) / 25.4) : 8;
  const pw   = media ? Math.round(media.widthMm * dpmm)  : BASE_W;
  const ll   = media ? Math.round(media.heightMm * dpmm) : BASE_H;
  const sx   = pw / BASE_W;
  const sy   = ll / BASE_H;
  const x = (v: number): number => Math.round(v * sx);
  const y = (v: number): number => Math.round(v * sy);
  const f = (v: number): number => Math.max(8, Math.round(v * sy)); // legible font floor

  const lines: string[] = [
    '^XA',
    `^PW${pw}`,
    `^LL${ll}`,
    '^CI28',            // UTF-8 character set

    // ── Media handling (only when a profile is known) ──────────────────────
    ...(media
      ? [
          ...(mediaTrackingCommand(media.mediaType) ? [mediaTrackingCommand(media.mediaType) as string] : []),
          ...(media.speed   != null ? [`^PR${media.speed}`] : []),
          ...(media.density != null ? [`^MD${media.density}`] : []),
        ]
      : []),

    // ── Top separator ──────────────────────────────────────────────────────
    `^FO0,${y(5)}^GB${x(800)},${y(3)},${y(3)}^FS`,

    // ── Tenant name (small, if provided) ──────────────────────────────────
    ...(tenantLine
      ? [`^FO${x(20)},${y(12)}^A0N,${f(20)},${f(20)}^FD${tenantLine}^FS`]
      : []),

    // ── Product name (large, bold) ─────────────────────────────────────────
    `^FO${x(20)},${y(tenantLine ? 36 : 15)}^A0N,${f(36)},${f(36)}^FD${productName}^FS`,

    // ── Separator ─────────────────────────────────────────────────────────
    `^FO0,${y(82)}^GB${x(800)},${y(2)},${y(2)}^FS`,

    // ── Fabrication date ──────────────────────────────────────────────────
    `^FO${x(20)},${y(90)}^A0N,${f(24)},${f(24)}^FDFabrication: ${producedStr}^FS`,

    // ── DLC date — highlighted via Field Reverse (^FR) ────────────────────
    `^FO0,${y(125)}^GB${x(800)},${y(70)},${y(70)}^FS`,
    `^FO${x(20)},${y(135)}^FR^A0N,${f(40)},${f(40)}^FD\xC0 consommer avant :^FS`,
    `^FO${x(20)},${y(180)}^FR^A0N,${f(50)},${f(50)}^FD${expiresStr}^FS`,

    // ── Separator ─────────────────────────────────────────────────────────
    `^FO0,${y(200)}^GB${x(800)},${y(2)},${y(2)}^FS`,

    // ── Lot number (if provided) ───────────────────────────────────────────
    ...(data.lotNumber
      ? [`^FO${x(20)},${y(210)}^A0N,${f(24)},${f(24)}^FDLot: ${escapeZpl(data.lotNumber)}^FS`]
      : []),

    // ── Bottom separator ───────────────────────────────────────────────────
    `^FO0,${y(245)}^GB${x(800)},${y(2)},${y(2)}^FS`,

    // ── Barcode — Code 128 of the lot number (if provided) ────────────────
    ...(data.lotNumber
      ? [
          `^FO${x(20)},${y(255)}^BY${Math.max(1, Math.round(2 * sx))}^BCN,${f(60)},Y,N,N^FD${escapeZpl(data.lotNumber)}^FS`,
        ]
      : []),

    // ── Copies ────────────────────────────────────────────────────────────
    `^PQ${effectiveCopies}`,

    '^XZ',
  ];

  return lines.join('\n');
}

// ── Generic template renderer ─────────────────────────────────────────────────

/**
 * Replace `{{key}}` placeholders in a raw ZPL template with values from
 * a payload object.
 *
 * Rules:
 *  - Keys are matched case-sensitively.
 *  - Missing keys are replaced with an empty string (never throw on sparse data).
 *  - Non-string values are coerced via String() — undefined/null become ''.
 *  - Placeholder syntax: `{{variableName}}` — double curly braces, no spaces.
 *
 * @example
 *   renderTemplate('^XA^FO10,10^FD{{productName}}^FS^XZ', { productName: 'Camembert' })
 *   // → '^XA^FO10,10^FDCamembert^FS^XZ'
 */
export function renderTemplate(
  zplTemplate: string,
  payload: Record<string, unknown>,
): string {
  return zplTemplate.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = payload[key];
    if (value === undefined || value === null) return '';
    return escapeZpl(String(value));
  });
}
