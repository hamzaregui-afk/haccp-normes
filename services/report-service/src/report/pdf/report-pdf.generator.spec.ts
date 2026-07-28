import { generateReportPdf, type ReportRecord, type NonConformityRow } from './report-pdf.generator';

const baseReport: ReportRecord = {
  id:          'clxreport0001testidabc12',
  type:        'MONTHLY_HYGIENE',
  status:      'VALIDATED',
  tenantId:    'clxtenant001testidabc123',
  fileUrl:     null,
  validatedBy: null,
  generatedAt: new Date('2026-06-01T10:00:00Z'),
  validatedAt: null,
  sentAt:      null,
};

const ncRows: NonConformityRow[] = [
  { reference: 'NC-2026-0001', status: 'OPEN',   severity: 'CRITICAL', category: 'BIO', description: 'Température frigo hors limite', createdAt: '2026-06-02T08:00:00Z' },
  { reference: 'NC-2026-0002', status: 'CLOSED', severity: 'LOW',      category: 'DOC', description: 'Étiquette manquante',         createdAt: '2026-06-03T09:00:00Z' },
];

describe('generateReportPdf', () => {
  it('produces a non-empty PDF buffer with no enrichment (backward compatible)', async () => {
    const buf = await generateReportPdf(baseReport);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    // PDF magic header
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('embeds the non-conformities section when data is provided', async () => {
    const plain    = await generateReportPdf(baseReport);
    const enriched = await generateReportPdf(baseReport, { nonConformities: ncRows });
    expect(Buffer.isBuffer(enriched)).toBe(true);
    // The NC table + summary add content, so the enriched PDF must be larger.
    expect(enriched.length).toBeGreaterThan(plain.length);
  });

  it('embeds the DLC-summary section when provided', async () => {
    const plain    = await generateReportPdf(baseReport);
    const enriched = await generateReportPdf(baseReport, {
      dlcSummary: { total: 120, expiringToday: 4, expiringSoon: 15, expired: 2 },
    });
    expect(enriched.length).toBeGreaterThan(plain.length);
  });

  it('embeds the control-summary section when provided', async () => {
    const plain    = await generateReportPdf(baseReport);
    const enriched = await generateReportPdf(baseReport, {
      controlSummary: { total: 40, completed: 34, overdue: 3 },
    });
    expect(enriched.length).toBeGreaterThan(plain.length);
  });

  it('skips the control section when total is 0', async () => {
    const plain    = await generateReportPdf(baseReport);
    const zero     = await generateReportPdf(baseReport, { controlSummary: { total: 0, completed: 0, overdue: 0 } });
    expect(zero.length).toBeLessThanOrEqual(plain.length + 8);
  });

  it('does not throw and stays metadata-only when nonConformities is empty', async () => {
    const plain    = await generateReportPdf(baseReport);
    const emptyEnr = await generateReportPdf(baseReport, { nonConformities: [] });
    // No rows → no NC section → the empty-enrichment PDF is no larger than the plain one.
    expect(Buffer.isBuffer(emptyEnr)).toBe(true);
    expect(emptyEnr.length).toBeLessThanOrEqual(plain.length + 8);
  });
});
