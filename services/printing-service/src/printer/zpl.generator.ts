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
export function generateDlcZpl(data: DlcLabelData, copies = 1): string {
  const effectiveCopies = Math.max(1, data.copies ?? copies);
  const productName     = escapeZpl(data.productName).substring(0, 40);
  const producedStr     = formatDate(data.producedAt);
  const expiresStr      = formatDate(data.expiresAt);
  const tenantLine      = data.tenantName ? escapeZpl(data.tenantName).substring(0, 40) : '';

  const lines: string[] = [
    '^XA',
    '^PW800',           // 100mm × 8 dpt
    '^LL400',           // 50mm × 8 dpt
    '^CI28',            // UTF-8 character set

    // ── Top separator ──────────────────────────────────────────────────────
    '^FO0,5^GB800,3,3^FS',

    // ── Tenant name (small, if provided) ──────────────────────────────────
    ...(tenantLine
      ? [`^FO20,12^A0N,20,20^FD${tenantLine}^FS`]
      : []),

    // ── Product name (large, bold) ─────────────────────────────────────────
    // A0 = scalable font; N = normal orientation; 36,36 = height,width in dots
    `^FO20,${tenantLine ? 36 : 15}^A0N,36,36^FD${productName}^FS`,

    // ── Separator ─────────────────────────────────────────────────────────
    '^FO0,82^GB800,2,2^FS',

    // ── Fabrication date ──────────────────────────────────────────────────
    `^FO20,90^A0N,24,24^FDFabrication: ${producedStr}^FS`,

    // ── DLC date — highlighted via Field Reverse (^FR) ────────────────────
    // ^FR inverts the colour of the next ^FD field (white on black)
    '^FO0,125^GB800,70,70^FS',
    '^FO20,135^FR^A0N,40,40^FD\xC0 consommer avant :^FS',
    `^FO20,180^FR^A0N,50,50^FD${expiresStr}^FS`,

    // ── Separator ─────────────────────────────────────────────────────────
    '^FO0,200^GB800,2,2^FS',

    // ── Lot number (if provided) ───────────────────────────────────────────
    ...(data.lotNumber
      ? [`^FO20,210^A0N,24,24^FDLot: ${escapeZpl(data.lotNumber)}^FS`]
      : []),

    // ── Bottom separator ───────────────────────────────────────────────────
    '^FO0,245^GB800,2,2^FS',

    // ── Barcode — Code 128 of the lot number (if provided) ────────────────
    ...(data.lotNumber
      ? [
          `^FO20,255^BY2^BCN,60,Y,N,N^FD${escapeZpl(data.lotNumber)}^FS`,
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
