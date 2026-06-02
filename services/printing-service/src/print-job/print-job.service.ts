import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { publishDomainEvent } from '@haccp/shared-utils';
import { PrismaService } from '../prisma/prisma.service';
import { PrinterService } from '../printer/printer.service';
import { TemplateService } from '../template/template.service';
import { generateDlcZpl, renderTemplate } from '../printer/zpl.generator';
import { sendZplOverTcp } from '../printer/tcp.printer';
import type { CreatePrintJobDto, PrintJobQuery } from './dto/print-job.dto';
import type { Printer } from '@prisma/client';

@Injectable()
export class PrintJobService {
  private readonly logger = new Logger(PrintJobService.name);

  constructor(
    private readonly prisma:    PrismaService,
    private readonly printers:  PrinterService,
    private readonly templates: TemplateService,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: PrintJobQuery) {
    const { page, limit, status, labelType } = query;

    const where = {
      tenantId,
      ...(status    !== undefined ? { status }    : {}),
      ...(labelType !== undefined ? { labelType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.printJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { printer: { select: { id: true, name: true, ipAddress: true } } },
      }),
      this.prisma.printJob.count({ where }),
    ]);

    return toApiResponse(items, toPaginationMeta(total, { page, limit }));
  }

  async findOne(id: string, tenantId: string) {
    const job = await this.prisma.printJob.findFirst({
      where: { id, tenantId },
      include: { printer: true },
    });
    if (!job) throw new NotFoundException(`Tâche d'impression ${id} introuvable`);
    return toApiResponse(job);
  }

  /**
   * Create a new print job record in PENDING state, then immediately attempt
   * to execute the print. The job record is created before the print attempt
   * so there is always an audit trail even if the printer is offline.
   */
  async create(dto: CreatePrintJobDto, tenantId: string, userId: string) {
    // Resolve printer (explicit or default)
    const printer = dto.printerId
      ? (await this.printers.findOne(dto.printerId, tenantId)).data
      : await this.printers.findDefault(tenantId);

    // Create the job record in PENDING state
    const job = await this.prisma.printJob.create({
      data: {
        tenantId,
        userId,
        printerId:  printer?.id ?? null,
        templateId: dto.templateId ?? null,
        labelType:  dto.labelType,
        payload:    dto.payload,
        status:     'PENDING',
        copies:     dto.copies,
      },
    });

    void publishDomainEvent({
      eventType: 'printing.job.created.v1',
      tenantId,
      payload:   { jobId: job.id, labelType: dto.labelType, userId },
    });

    // Attempt the print immediately (fire the execution pipeline)
    void this.executePrint(job.id, tenantId, dto, printer ?? null).catch((err: unknown) => {
      this.logger.error(
        `executePrint failed for job ${job.id}: ${(err as Error).message}`,
      );
    });

    return toApiResponse(job, undefined, 'Tâche d\'impression créée');
  }

  /**
   * Retry a previously FAILED print job with the same parameters.
   */
  async retry(id: string, tenantId: string) {
    const { data: job } = await this.findOne(id, tenantId);

    if (job.status !== 'FAILED') {
      throw new Error(`Impossible de relancer une tâche au statut ${job.status}`);
    }

    // Reset to PENDING before re-attempting
    await this.prisma.printJob.update({
      where: { id, tenantId },
      data:  { status: 'PENDING', errorMessage: null },
    });

    const printer = job.printerId
      ? (await this.printers.findOne(job.printerId, tenantId)).data
      : await this.printers.findDefault(tenantId);

    const dto: CreatePrintJobDto = {
      printerId:  job.printerId ?? undefined,
      templateId: job.templateId ?? undefined,
      labelType:  job.labelType,
      payload:    job.payload as Record<string, unknown>,
      copies:     job.copies,
    };

    void this.executePrint(id, tenantId, dto, printer ?? null).catch((err: unknown) => {
      this.logger.error(
        `retry executePrint failed for job ${id}: ${(err as Error).message}`,
      );
    });

    return toApiResponse(null, undefined, 'Tâche relancée');
  }

  // ── Private execution pipeline ────────────────────────────────────────────────

  /**
   * Core print execution:
   *  1. Mark job as PROCESSING.
   *  2. Resolve/generate the ZPL string.
   *  3. Send ZPL over TCP.
   *  4. Mark job COMPLETED or FAILED and persist the ZPL for audit.
   *
   * All errors are caught and persisted as job.errorMessage so a failed job
   * never causes an unhandled rejection that crashes the process.
   */
  private async executePrint(
    jobId:   string,
    tenantId: string,
    dto:     CreatePrintJobDto,
    printer: Printer | null,
  ): Promise<void> {
    // ── Step 1: Mark processing ───────────────────────────────────────────────
    await this.prisma.printJob.update({
      where: { id: jobId, tenantId },
      data:  { status: 'PROCESSING' },
    });

    let zpl: string;

    try {
      // ── Step 2: Generate / render ZPL ──────────────────────────────────────
      zpl = await this.resolveZpl(dto, tenantId);

      if (!printer || printer.connectionType !== 'NETWORK' || !printer.ipAddress) {
        // ARCH-DECISION: For non-network printers (Bluetooth, USB) or unconfigured
        // printers, we store the ZPL and mark COMPLETED — the mobile client is
        // responsible for pushing the ZPL to the physical device over Bluetooth.
        await this.prisma.printJob.update({
          where: { id: jobId, tenantId },
          data:  { status: 'COMPLETED', zpl, printedAt: new Date() },
        });

        void publishDomainEvent({
          eventType: 'printing.job.completed.v1',
          tenantId,
          payload:   { jobId, channel: 'mobile-relay' },
        });

        return;
      }

      // ── Step 3: Send over TCP ─────────────────────────────────────────────
      await sendZplOverTcp(printer.ipAddress, printer.port, zpl);

      // ── Step 4: Mark completed ────────────────────────────────────────────
      await this.prisma.printJob.update({
        where: { id: jobId, tenantId },
        data:  { status: 'COMPLETED', zpl, printedAt: new Date() },
      });

      void publishDomainEvent({
        eventType: 'printing.job.completed.v1',
        tenantId,
        payload:   { jobId, printerId: printer.id },
      });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      this.logger.warn(`Print job ${jobId} failed: ${message}`);

      await this.prisma.printJob.update({
        where: { id: jobId, tenantId },
        data:  { status: 'FAILED', errorMessage: message },
      }).catch((updateErr: unknown) => {
        // If the DB update also fails, log but don't throw — the job was
        // already marked PROCESSING so the operator can see it stalled.
        this.logger.error(
          `Failed to update job ${jobId} to FAILED: ${(updateErr as Error).message}`,
        );
      });

      void publishDomainEvent({
        eventType: 'printing.job.failed.v1',
        tenantId,
        payload:   { jobId, error: message },
      });
    }
  }

  /**
   * Determine the ZPL to send for a given job:
   *  1. If a templateId is provided → load template and render {{placeholders}}.
   *  2. If labelType === 'DLC' and no template → use the built-in DLC generator.
   *  3. Otherwise → look up the default template for this labelType and render.
   *  4. If no template found → serialize payload as a minimal fallback label.
   */
  private async resolveZpl(dto: CreatePrintJobDto, tenantId: string): Promise<string> {
    const payload = dto.payload;

    // ── Explicit template ──────────────────────────────────────────────────────
    if (dto.templateId) {
      const tpl = await this.prisma.printerTemplate.findFirst({
        where: { id: dto.templateId, tenantId, isActive: true },
      });
      if (tpl) {
        return renderTemplate(tpl.zplTemplate, payload);
      }
    }

    // ── Built-in DLC generator ────────────────────────────────────────────────
    if (dto.labelType === 'DLC') {
      return generateDlcZpl(
        {
          productName: String(payload['productName'] ?? ''),
          lotNumber:   payload['lotNumber'] != null ? String(payload['lotNumber']) : null,
          producedAt:  String(payload['producedAt'] ?? new Date().toISOString()),
          expiresAt:   String(payload['expiresAt']  ?? new Date().toISOString()),
          tenantName:  payload['tenantName'] != null ? String(payload['tenantName']) : undefined,
        },
        dto.copies,
      );
    }

    // ── Default template for this labelType ───────────────────────────────────
    const defaultTpl = await this.templates.findDefaultForType(tenantId, dto.labelType);
    if (defaultTpl) {
      return renderTemplate(defaultTpl.zplTemplate, payload);
    }

    // ── Minimal fallback: plain text label ────────────────────────────────────
    // ARCH-DECISION: Never throw when no template is found — produce a minimal
    // plain-text label so the operator gets something rather than an error.
    this.logger.warn(
      `No template found for labelType=${dto.labelType} tenant=${tenantId}; using fallback ZPL`,
    );
    const lines = Object.entries(payload)
      .slice(0, 6)
      .map(([k, v], i) => `^FO20,${30 + i * 30}^A0N,24,24^FD${k}: ${String(v ?? '')}^FS`)
      .join('\n');

    return `^XA\n^PW800\n^LL400\n^CI28\n${lines}\n^PQ${dto.copies}\n^XZ`;
  }
}
