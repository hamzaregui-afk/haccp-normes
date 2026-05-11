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

const FR_DATE = (d: Date): string => d.toLocaleDateString('fr-FR');

/**
 * Generates a HACCP monthly hygiene report PDF buffer using pdfmake.
 * Returns a Promise<Buffer> compatible with NestJS `res.end()`.
 */
export function generateReportPdf(report: ReportRecord): Promise<Buffer> {
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
