import { getLabelRenderer } from '..';
import { generateDlcZpl, type DlcLabelData } from '../../printer/zpl.generator';

const DATA: DlcLabelData = {
  productName: 'Lait entier',
  lotNumber:   'L12345',
  producedAt:  '2026-01-01T00:00:00.000Z',
  expiresAt:   '2026-01-05T00:00:00.000Z',
  tenantName:  'Restaurant Test',
};

describe('LabelRenderer factory', () => {
  it('defaults to ZPL for null / unknown protocols, and maps known ones', () => {
    expect(getLabelRenderer().protocol).toBe('ZPL');
    expect(getLabelRenderer(null).protocol).toBe('ZPL');
    expect(getLabelRenderer('UNKNOWN').protocol).toBe('ZPL');
    expect(getLabelRenderer('ZPL').protocol).toBe('ZPL');
    expect(getLabelRenderer('TSPL').protocol).toBe('TSPL');
    expect(getLabelRenderer('ESC_POS').protocol).toBe('ESC_POS');
  });

  it('ZPL renderer is BYTE-FOR-BYTE identical to generateDlcZpl (parity)', () => {
    expect(getLabelRenderer('ZPL').renderDlc(DATA, 2)).toBe(generateDlcZpl(DATA, 2));
    // and with no lot / no tenant
    const bare: DlcLabelData = { productName: 'X', producedAt: '2026-01-01', expiresAt: '2026-01-02' };
    expect(getLabelRenderer('ZPL').renderDlc(bare, 1)).toBe(generateDlcZpl(bare, 1));
  });

  it('TSPL renderer emits SIZE/GAP/PRINT + product + Code-128 of the lot', () => {
    const out = getLabelRenderer('TSPL').renderDlc(DATA, 3);
    expect(out).toContain('SIZE ');
    expect(out).toContain('GAP ');
    expect(out).toContain('Lait entier');
    expect(out).toContain('BARCODE');
    expect(out).toContain('L12345');
    expect(out).toContain('PRINT 3');
  });

  it('ESC/POS renderer initialises, repeats per copy, and full-cuts', () => {
    const out = getLabelRenderer('ESC_POS').renderDlc(DATA, 2);
    expect(out.startsWith('\x1b@')).toBe(true);         // ESC @ init
    expect(out).toContain('Lait entier');
    expect(out.endsWith('\x1dV\x00')).toBe(true);       // GS V — full cut
    expect(out.split('\x1b@').length - 1).toBe(2);      // 2 copies → 2 init sequences
  });

  it('ESC/POS strips diacritics for the default code page', () => {
    const out = getLabelRenderer('ESC_POS').renderDlc({ ...DATA, productName: 'Crème brûlée' }, 1);
    expect(out).toContain('Creme brulee');
  });
});
