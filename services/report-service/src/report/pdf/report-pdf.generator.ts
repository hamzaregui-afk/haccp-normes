// ARCH-DECISION: Using pdfmake (server-side, no Chromium dependency) for PDF
// generation. pdfmake renders directly to a PDF binary via PDFKit under the
// hood, making it safe for stateless multi-replica deployments where a
// headless browser would be impractical and resource-heavy.

// pdfmake ships its own type declarations via @types/pdfmake.
// The Node.js build exposes a default-export class; we require() it at runtime
// to avoid ES-module interop issues with pdfmake's CommonJS bundle.
import type { Content, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';

// pdfmake for Node.js does not include font files in the bundle — we use the
// four built-in PDF standard fonts (Helvetica family) which are always
// available in any PDF reader without embedding.
const fonts: TFontDictionary = {
  Roboto: {
    normal:      'Helvetica',
    bold:        'Helvetica-Bold',
    italics:     'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

/** Shape of a Prisma Report row as returned by report.service.ts */
export interface ReportRecord {
  id:          string;
  type:        string;
  status:      string;
  tenantId:    string;
  fileUrl:     string | null;
  validatedBy: string | null;
  generatedAt: Date;
  validatedAt: Date | null;
  sentAt:      Date | null;
}

/** A non-conformity row embedded in a compliance report (from nonconformity-service). */
export interface NonConformityRow {
  reference:   string;
  status:      string;
  severity:    string;
  category:    string;
  description: string;
  createdAt:   string | Date;
}

/** Server-side aggregated control-execution counts (exact, no truncation). */
export interface ControlSummary {
  total:     number;
  completed: number;
  overdue:   number;
}

/** Real module data fetched by report.service and embedded into the PDF. */
export interface ReportEnrichment {
  nonConformities?: NonConformityRow[];
  controlSummary?:  ControlSummary | null;
}

const FR_DATE = (d: Date): string => d.toLocaleDateString('fr-FR');

const NC_SEVERITY_LABELS: Record<string, string> = {
  LOW: 'Faible', MEDIUM: 'Moyen', HIGH: 'Élevé', CRITICAL: 'Critique',
};
const NC_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouverte', IN_PROGRESS: 'En cours', CLOSED: 'Clôturée', REJECTED: 'Rejetée',
};

/**
 * Build the "Non-conformités" section (title + summary + table) from real data.
 * Returns [] when there is nothing to show so the caller can spread it safely.
 */
function buildNonConformitySection(rows: NonConformityRow[]): Content[] {
  if (rows.length === 0) return [];

  const openCount     = rows.filter((r) => r.status === 'OPEN' || r.status === 'IN_PROGRESS').length;
  const criticalCount = rows.filter((r) => r.severity === 'CRITICAL').length;

  const headerRow = ['Référence', 'Date', 'Sévérité', 'Statut', 'Description'].map((h) => ({
    text: h, style: 'label' as const,
  }));

  const bodyRows = rows.slice(0, 200).map((r) => [
    { text: r.reference, style: 'value' as const },
    { text: FR_DATE(new Date(r.createdAt)), style: 'value' as const },
    { text: NC_SEVERITY_LABELS[r.severity] ?? r.severity, style: 'value' as const },
    { text: NC_STATUS_LABELS[r.status] ?? r.status, style: 'value' as const },
    { text: r.description.length > 90 ? `${r.description.slice(0, 90)}…` : r.description, style: 'value' as const },
  ]);

  return [
    { text: '\nNon-conformités enregistrées', style: 'sectionTitle' } as Content,
    {
      text:  `${rows.length} non-conformité(s) — ${openCount} en cours, ${criticalCount} critique(s).`,
      style: 'body',
      margin: [0, 0, 0, 8] as [number, number, number, number],
    } as Content,
    {
      style: 'infoTable',
      table: {
        headerRows: 1,
        widths:     [70, 55, 55, 60, '*'],
        body:       [headerRow, ...bodyRows],
      },
      layout: 'lightHorizontalLines',
    } as Content,
    ...(rows.length > 200
      ? [{ text: `… et ${rows.length - 200} autres non affichées.`, style: 'disclaimer' } as Content]
      : []),
  ];
}

/**
 * Build the "Contrôles HACCP" summary section from server-side aggregated counts.
 * Returns [] when there is nothing meaningful to show.
 */
function buildControlSection(summary: ControlSummary | null | undefined): Content[] {
  if (!summary || summary.total === 0) return [];
  const rate = Math.round((summary.completed / summary.total) * 100);

  return [
    { text: '\nContrôles HACCP', style: 'sectionTitle' } as Content,
    {
      style: 'infoTable',
      table: {
        widths: [200, '*'],
        body:   [
          [{ text: 'Contrôles planifiés', style: 'label' }, { text: String(summary.total), style: 'value' }],
          [{ text: 'Contrôles réalisés', style: 'label' }, { text: `${summary.completed} (${rate}%)`, style: 'value' }],
          [{ text: 'Contrôles en retard', style: 'label' }, { text: String(summary.overdue), style: 'value' }],
        ],
      },
      layout: 'lightHorizontalLines',
    } as Content,
  ];
}

/**
 * Generates a HACCP report PDF buffer using pdfmake. When `enrichment` carries real
 * module data (e.g. non-conformities), it is embedded as a dedicated section so the
 * report is an actual compliance record rather than a metadata-only shell.
 * Returns a Promise<Buffer> compatible with NestJS `res.end()`.
 */
export function generateReportPdf(report: ReportRecord, enrichment?: ReportEnrichment): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PdfPrinter = require('pdfmake') as new (fonts: TFontDictionary) => {
    createPdfKitDocument(docDefinition: TDocumentDefinitions): NodeJS.EventEmitter & { end(): void };
  };

  const printer = new PdfPrinter(fonts);

  const STATUS_LABELS: Record<string, string> = {
    PENDING:      'En attente',
    UNDER_REVIEW: 'En cours de révision',
    VALIDATED:    'Validé',
    SENT:         'Envoyé',
  };

  const docDefinition: TDocumentDefinitions = {
    pageSize:    'A4',
    pageMargins: [40, 70, 40, 60],

    header: {
      columns: [
        {
          text:   'NORMES HACCP',
          style:  'header',
          margin: [40, 20, 0, 0] as [number, number, number, number],
        },
        {
          text:      `Rapport N° ${report.id.slice(0, 8).toUpperCase()}`,
          style:     'headerRight',
          margin:    [0, 20, 40, 0] as [number, number, number, number],
        },
      ],
    },

    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text:   `Généré le ${FR_DATE(new Date())}`,
          style:  'footer',
          margin: [40, 0, 0, 20] as [number, number, number, number],
        },
        {
          text:      `Page ${currentPage} / ${pageCount}`,
          style:     'footerRight',
          margin:    [0, 0, 40, 20] as [number, number, number, number],
        },
      ],
    }),

    content: ([
      // ── Title block ──────────────────────────────────────────────────────────
      {
        text:  `Rapport ${report.type.replace(/_/g, ' ')}`,
        style: 'title',
      },
      {
        canvas: [
          {
            type:      'line',
            x1:        0,
            y1:        0,
            x2:        515,
            y2:        0,
            lineWidth: 2,
            lineColor: '#2D6A4F',
          },
        ],
        margin: [0, 8, 0, 16] as [number, number, number, number],
      },

      // ── Metadata table ───────────────────────────────────────────────────────
      {
        style: 'infoTable',
        table: {
          widths: [160, '*'],
          body:   [
            [
              { text: 'Statut', style: 'label' },
              { text: STATUS_LABELS[report.status] ?? report.status, style: 'value' },
            ],
            [
              { text: 'Type', style: 'label' },
              { text: report.type.replace(/_/g, ' '), style: 'value' },
            ],
            [
              { text: 'Date de génération', style: 'label' },
              { text: FR_DATE(report.generatedAt), style: 'value' },
            ],
            ...(report.validatedAt
              ? [
                  [
                    { text: 'Date de validation', style: 'label' },
                    { text: FR_DATE(report.validatedAt), style: 'value' },
                  ],
                ]
              : []),
            ...(report.validatedBy
              ? [
                  [
                    { text: 'Validé par (ID)', style: 'label' },
                    { text: report.validatedBy, style: 'value' },
                  ],
                ]
              : []),
            ...(report.sentAt
              ? [
                  [
                    { text: 'Date d\'envoi', style: 'label' },
                    { text: FR_DATE(report.sentAt), style: 'value' },
                  ],
                ]
              : []),
          ],
        },
        layout: 'lightHorizontalLines',
      },

      // ── File URL section (if present) ────────────────────────────────────────
      ...(report.fileUrl
        ? [
            { text: '\nFichier joint', style: 'sectionTitle' } as Content,
            { text: report.fileUrl,    style: 'body'         } as Content,
          ]
        : []),

      // ── Real module data — control summary + non-conformities (when provided) ─
      ...buildControlSection(enrichment?.controlSummary),
      ...buildNonConformitySection(enrichment?.nonConformities ?? []),

      // ── Footer note ──────────────────────────────────────────────────────────
      {
        text:   '\n\nCe document est généré automatiquement par le système NORMES HACCP et constitue un enregistrement officiel de conformité.',
        style:  'disclaimer',
        margin: [0, 24, 0, 0] as [number, number, number, number],
      },
    ] as Content[]),

    styles: {
      header: {
        fontSize: 13,
        bold:     true,
        color:    '#1A3D2B',
      },
      headerRight: {
        fontSize:  10,
        color:     '#666666',
        alignment: 'right',
      },
      title: {
        fontSize: 20,
        bold:     true,
        color:    '#1A3D2B',
        margin:   [0, 0, 0, 4] as [number, number, number, number],
      },
      sectionTitle: {
        fontSize: 13,
        bold:     true,
        color:    '#1A3D2B',
        margin:   [0, 16, 0, 6] as [number, number, number, number],
      },
      infoTable: {
        margin: [0, 0, 0, 8] as [number, number, number, number],
      },
      label: {
        fontSize: 10,
        bold:     true,
        color:    '#444444',
      },
      value: {
        fontSize: 10,
        color:    '#1A3D2B',
      },
      body: {
        fontSize:   10,
        color:      '#333333',
        lineHeight: 1.5,
      },
      disclaimer: {
        fontSize: 8,
        italics:  true,
        color:    '#888888',
      },
      footer: {
        fontSize: 8,
        color:    '#999999',
      },
      footerRight: {
        fontSize:  8,
        color:     '#999999',
        alignment: 'right',
      },
    },

    defaultStyle: { font: 'Roboto' },
  };

  return new Promise<Buffer>((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}
