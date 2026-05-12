import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env';

// ARCH-DECISION: EmailService is lazily initialised on first use (not in OnModuleInit)
// so that missing SMTP creds in development don't crash startup. Instead, the service
// falls back to an Ethereal test account and logs the preview URL to the console.

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: Transporter;

  async onModuleInit() {
    await this.initTransporter();
  }

  private async initTransporter(): Promise<void> {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
      this.logger.log(`📧 SMTP configured: ${env.SMTP_HOST}:${env.SMTP_PORT}`);
    } else {
      // ARCH-DECISION: Ethereal is a fake SMTP service for development.
      // Emails are captured and viewable at the URL logged below — nothing is
      // actually delivered. Production deployments must set SMTP_* env vars.
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      this.logger.warn(
        `📧 SMTP not configured — using Ethereal test account: ${testAccount.user}`,
      );
    }
  }

  async sendMail(options: EmailOptions): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: env.SMTP_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        this.logger.debug(`📧 Email preview: ${previewUrl}`);
      }
    } catch (err) {
      // Log but never throw — email failure must not block the notification flow
      this.logger.error(`Failed to send email to ${options.to}`, err);
    }
  }

  // ─── Template helpers ────────────────────────────────────────────────────────

  buildNcCreatedEmail(data: {
    recipientName: string;
    ncId: string;
    description: string;
    severity: string;
    category: string;
  }): string {
    return this.wrapLayout({
      title: '⚠️ Nouvelle non-conformité créée',
      preheader: `Non-conformité ${data.severity} — ${data.category}`,
      body: `
        <p>Bonjour ${escapeHtml(data.recipientName)},</p>
        <p>Une nouvelle non-conformité a été enregistrée et requiert votre attention.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr>
            <td style="padding:8px;background:#f5f5f0;font-weight:600;width:40%">Référence</td>
            <td style="padding:8px">${escapeHtml(data.ncId)}</td>
          </tr>
          <tr>
            <td style="padding:8px;background:#f5f5f0;font-weight:600">Sévérité</td>
            <td style="padding:8px">${escapeHtml(data.severity)}</td>
          </tr>
          <tr>
            <td style="padding:8px;background:#f5f5f0;font-weight:600">Catégorie</td>
            <td style="padding:8px">${escapeHtml(data.category)}</td>
          </tr>
          <tr>
            <td style="padding:8px;background:#f5f5f0;font-weight:600">Description</td>
            <td style="padding:8px">${escapeHtml(data.description)}</td>
          </tr>
        </table>
        <a href="${env.APP_URL}/nonconformities/${escapeHtml(data.ncId)}"
           style="display:inline-block;padding:12px 24px;background:#2D6A4F;color:#fff;
                  text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px">
          Voir la non-conformité →
        </a>
      `,
    });
  }

  buildReportValidatedEmail(data: {
    recipientName: string;
    reportId: string;
    reportTitle: string;
    period: string;
  }): string {
    return this.wrapLayout({
      title: '✅ Rapport validé',
      preheader: `Votre rapport ${data.period} a été validé`,
      body: `
        <p>Bonjour ${escapeHtml(data.recipientName)},</p>
        <p>Le rapport suivant a été <strong>validé</strong> et est disponible en téléchargement.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr>
            <td style="padding:8px;background:#f5f5f0;font-weight:600;width:40%">Rapport</td>
            <td style="padding:8px">${escapeHtml(data.reportTitle)}</td>
          </tr>
          <tr>
            <td style="padding:8px;background:#f5f5f0;font-weight:600">Période</td>
            <td style="padding:8px">${escapeHtml(data.period)}</td>
          </tr>
        </table>
        <a href="${env.APP_URL}/reports/${escapeHtml(data.reportId)}"
           style="display:inline-block;padding:12px 24px;background:#2D6A4F;color:#fff;
                  text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px">
          Télécharger le rapport →
        </a>
      `,
    });
  }

  private wrapLayout(opts: {
    title: string;
    preheader: string;
    body: string;
  }): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${opts.title}</title>
  <!--[if mso]><style>table{border-collapse:collapse}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;color:#333">
  <!-- preheader (hidden) -->
  <span style="display:none;max-height:0;overflow:hidden">${opts.preheader}&nbsp;</span>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;
                    box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr>
          <td style="background:#1A3D2B;padding:24px 32px">
            <span style="color:#B5833A;font-size:20px;font-weight:700;letter-spacing:.5px">
              NORMES HACCP
            </span>
          </td>
        </tr>
        <!-- Title -->
        <tr>
          <td style="padding:24px 32px 0">
            <h1 style="margin:0;font-size:22px;color:#1A3D2B">${opts.title}</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:16px 32px 32px;line-height:1.6;font-size:15px">
            ${opts.body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f5f5f0;padding:16px 32px;font-size:12px;color:#888;
                     border-top:1px solid #e5e5e0">
            Cet email a été envoyé automatiquement par NORMES HACCP.
            Ne pas répondre à cet email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
