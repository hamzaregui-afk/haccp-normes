import { generateDlcZpl, renderTemplate } from '../../printer/zpl.generator';

// ── generateDlcZpl ────────────────────────────────────────────────────────────

describe('generateDlcZpl', () => {
  const baseData = {
    productName: 'Camembert AOP',
    producedAt:  '2026-06-01',
    expiresAt:   '2026-06-08',
  };

  it('produces a string that starts with ^XA and ends with ^XZ', () => {
    const zpl = generateDlcZpl(baseData);
    expect(zpl.trimStart()).toMatch(/^\^XA/);
    expect(zpl.trimEnd()).toMatch(/\^XZ$/);
  });

  it('includes PW800 and LL400 for a 100mm×50mm label at 8dpt', () => {
    const zpl = generateDlcZpl(baseData);
    expect(zpl).toContain('^PW800');
    expect(zpl).toContain('^LL400');
  });

  it('includes the product name in the ZPL output', () => {
    const zpl = generateDlcZpl(baseData);
    expect(zpl).toContain('Camembert AOP');
  });

  it('formats producedAt date as DD/MM/YYYY', () => {
    const zpl = generateDlcZpl(baseData);
    expect(zpl).toContain('01/06/2026');
  });

  it('formats expiresAt date as DD/MM/YYYY', () => {
    const zpl = generateDlcZpl(baseData);
    expect(zpl).toContain('08/06/2026');
  });

  it('includes the lot number when provided', () => {
    const zpl = generateDlcZpl({ ...baseData, lotNumber: 'LOT-2026-001' });
    expect(zpl).toContain('LOT-2026-001');
  });

  it('does NOT include a lot field when lotNumber is null', () => {
    const zpl = generateDlcZpl({ ...baseData, lotNumber: null });
    expect(zpl).not.toContain('Lot:');
  });

  it('includes the tenant name when provided', () => {
    const zpl = generateDlcZpl({ ...baseData, tenantName: 'Fromagerie Dupont' });
    expect(zpl).toContain('Fromagerie Dupont');
  });

  it('includes PQ directive with the correct copy count', () => {
    const zpl = generateDlcZpl(baseData, 3);
    expect(zpl).toContain('^PQ3');
  });

  it('uses copies from data object when both are provided (data wins)', () => {
    const zpl = generateDlcZpl({ ...baseData, copies: 5 }, 2);
    expect(zpl).toContain('^PQ5');
  });

  it('defaults to 1 copy when not specified', () => {
    const zpl = generateDlcZpl(baseData);
    expect(zpl).toContain('^PQ1');
  });

  it('strips caret characters from product name to avoid ZPL command injection', () => {
    const zpl = generateDlcZpl({ ...baseData, productName: 'Bad^FX^Cheese' });
    expect(zpl).not.toContain('^FX');
    // The field should still contain the rest of the text
    expect(zpl).toContain('BadCheese');
  });

  it('sets CI28 for UTF-8 character set', () => {
    const zpl = generateDlcZpl(baseData);
    expect(zpl).toContain('^CI28');
  });

  it('handles full ISO datetime strings in producedAt', () => {
    const zpl = generateDlcZpl({ ...baseData, producedAt: '2026-06-01T08:30:00.000Z' });
    expect(zpl).toContain('01/06/2026');
  });

  it('falls back gracefully when producedAt is an invalid date string', () => {
    const zpl = generateDlcZpl({ ...baseData, producedAt: 'not-a-date' });
    // Should not throw; contains the raw string as fallback
    expect(zpl).toContain('not-a-date');
  });
});

// ── renderTemplate ────────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('replaces a single {{placeholder}} with its value', () => {
    const result = renderTemplate('^FD{{productName}}^FS', { productName: 'Brie' });
    expect(result).toBe('^FDBrie^FS');
  });

  it('replaces multiple distinct placeholders', () => {
    const result = renderTemplate(
      '^FD{{productName}} - Lot: {{lotNumber}}^FS',
      { productName: 'Brie', lotNumber: 'L001' },
    );
    expect(result).toBe('^FDBrie - Lot: L001^FS');
  });

  it('replaces the same placeholder every time it appears', () => {
    const result = renderTemplate(
      '{{x}} and {{x}} again',
      { x: 'hello' },
    );
    expect(result).toBe('hello and hello again');
  });

  it('replaces a missing key with an empty string', () => {
    const result = renderTemplate('^FD{{missing}}^FS', {});
    expect(result).toBe('^FD^FS');
  });

  it('replaces null value with an empty string', () => {
    const result = renderTemplate('^FD{{lot}}^FS', { lot: null });
    expect(result).toBe('^FD^FS');
  });

  it('replaces undefined value with an empty string', () => {
    const result = renderTemplate('^FD{{lot}}^FS', { lot: undefined });
    expect(result).toBe('^FD^FS');
  });

  it('coerces numeric values to string', () => {
    const result = renderTemplate('^FD{{qty}}^FS', { qty: 42 });
    expect(result).toBe('^FD42^FS');
  });

  it('coerces boolean values to string', () => {
    const result = renderTemplate('^FD{{flag}}^FS', { flag: true });
    expect(result).toBe('^FDtrue^FS');
  });

  it('strips caret characters from injected values', () => {
    const result = renderTemplate('^FD{{val}}^FS', { val: 'bad^FXvalue' });
    expect(result).toBe('^FDbadFXvalue^FS');
  });

  it('strips tilde characters from injected values', () => {
    const result = renderTemplate('^FD{{val}}^FS', { val: 'bad~value' });
    expect(result).toBe('^FDbadvalue^FS');
  });

  it('does not modify text outside of placeholders', () => {
    const tpl    = '^XA^PW800^LL400^XZ';
    const result = renderTemplate(tpl, {});
    expect(result).toBe(tpl);
  });

  it('handles placeholders with no surrounding text', () => {
    const result = renderTemplate('{{only}}', { only: 'value' });
    expect(result).toBe('value');
  });

  it('does NOT replace partial-match patterns like {single}', () => {
    const result = renderTemplate('{single}', { single: 'nope' });
    expect(result).toBe('{single}');
  });
});
