import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { publishDomainEvent } from '@haccp/shared-utils';
import { PrismaService } from '../prisma/prisma.service';
import { PrinterService } from '../printer/printer.service';
import { PrinterAssignmentService } from '../printer-assignment/printer-assignment.service';
import { TemplateService } from '../template/template.service';
import { renderTemplate, type LabelMedia } from '../printer/zpl.generator';
import { getLabelRenderer } from '../label-renderer';
import { selectPrintProvider, type PrintDispatchInput } from './providers';
import { PrintProviderConfigService } from '../print-provider-config/print-provider-config.service';
import type { CreatePrintJobDto, PrintJobQuery } from './dto/print-job.dto';
import { Prisma } from '@prisma/client';
import type { Printer } from '@prisma/client';

/** Per-tenant print-job counts (today) for the SUPER_ADMIN "Tous les clients" overview. */
export interface TenantPrintStatRow {
  tenantId: string;
  total: number;
  failed: number;
  pending: number;
  completed: number;
}

@Injectable()
export class PrintJobService {
  private readonly logger = new Logger(PrintJobService.name);

  constructor(
    private readonly prisma:         PrismaService,
    private readonly printers:       PrinterService,
    private readonly assignments:    PrinterAssignmentService,
    private readonly providerConfig: PrintProviderConfigService,
    private readonly templates:      TemplateService,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Cross-tenant supervision aggregate ("Tous les clients" / ALL mode).
   * SUPER_ADMIN-only. Groups today's print-job counts by tenant (failed /
   * pending / completed / total); keys by tenantId, names joined client-side.
   */
  async getStatsByTenant() {
    const now        = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const groups = await this.prisma.printJob.groupBy({
      by: ['tenantId', 'status'],
      where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      _count: { _all: true },
    });

    const rows = new Map<string, TenantPrintStatRow>();
    const row = (tenantId: string): TenantPrintStatRow => {
      let r = rows.get(tenantId);
      if (!r) {
        r = { tenantId, total: 0, failed: 0, pending: 0, completed: 0 };
        rows.set(tenantId, r);
      }
      return r;
    };

    for (const g of groups) {
      const r = row(g.tenantId);
      const n = g._count._all;
      r.total += n;
      if (g.status === 'FAILED') r.failed += n;
      else if (g.status === 'PENDING' || g.status === 'PROCESSING') r.pending += n;
      else if (g.status === 'COMPLETED') r.completed += n;
    }

    const byTenant = [...rows.values()];
    const totals = byTenant.reduce(
      (acc, r) => ({
        total:     acc.total + r.total,
        failed:    acc.failed + r.failed,
        pending:   acc.pending + r.pending,
        completed: acc.completed + r.completed,
      }),
      { total: 0, failed: 0, pending: 0, completed: 0 },
    );

    return toApiResponse({ totals, byTenant });
  }

  async findAll(tenantId: string, query: PrintJobQuery) {
    const { page, limit, status, labelType, printerId } = query;

    const where = {
      tenantId,
      ...(status    !== undefined ? { status }    : {}),
      ...(labelType !== undefined ? { labelType } : {}),
      ...(printerId !== undefined ? { printerId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.printJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        // ARCH-DECISION: the Local Print Agent polls this list endpoint and branches
        // on printer.connectionType + printer.port to decide how to print. Those
        // fields MUST be projected here — previously only {id,name,ipAddress} were
        // returned, so the agent read connectionType=undefined and threw
        // "Unsupported connection type" on EVERY job (nothing ever printed on USB).
        include: {
          printer: {
            select: {
              id: true, name: true, ipAddress: true,
              port: true, connectionType: true, protocol: true, connection: true,
            },
          },
        },
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
    // Resolve the target printer:
    //  • explicit printerId → that printer (tenant-scoped);
    //  • otherwise → context-aware routing via PrinterAssignment.resolve
    //    (ZONE > SITE > USER > MODULE), which falls back to the tenant's default
    //    printer. Callers passing no context get the default printer — i.e. the
    //    previous behaviour — so there is zero regression until assignments exist.
    const printer = dto.printerId
      ? (await this.printers.findOne(dto.printerId, tenantId)).data
      : (await this.assignments.resolve(tenantId, {
          zoneId: dto.zoneId,
          siteId: dto.siteId,
          userId,
          module: dto.module,
        })).data;

    // Create the job record in PENDING state
    const job = await this.prisma.printJob.create({
      data: {
        tenantId,
        userId,
        printerId:  printer?.id ?? null,
        templateId: dto.templateId ?? null,
        labelType:  dto.labelType,
        payload:    dto.payload as Prisma.InputJsonValue,
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

  /**
   * Called by the Local Print Agent via PATCH /print-jobs/:id to report
   * PROCESSING, COMPLETED, or FAILED status after physical printing.
   */
  async updateStatus(
    id:           string,
    tenantId:     string,
    status:       'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    errorMessage?: string,
  ) {
    // ── ATOMIC CLAIM ──────────────────────────────────────────────────────────
    // The PENDING→PROCESSING transition is how the Local Print Agent CLAIMS a
    // parked job. Guard it with a conditional updateMany (status: 'PENDING') so
    // two agents polling the same printer cannot both claim and double-print —
    // exactly one wins the row; the loser gets 409 Conflict.
    if (status === 'PROCESSING') {
      const claimed = await this.prisma.printJob.updateMany({
        where: { id, tenantId, status: 'PENDING' },
        data:  { status: 'PROCESSING' },
      });
      if (claimed.count === 0) {
        const exists = await this.prisma.printJob.findFirst({
          where: { id, tenantId }, select: { id: true },
        });
        if (!exists) throw new NotFoundException(`Tâche d'impression ${id} introuvable`);
        throw new ConflictException('Tâche déjà réclamée par un autre agent');
      }
      return toApiResponse(null, undefined, 'Tâche réclamée');
    }

    const existing = await this.prisma.printJob.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Tâche d'impression ${id} introuvable`);

    await this.prisma.printJob.update({
      where: { id, tenantId },
      data: {
        status,
        ...(status === 'COMPLETED' ? { printedAt: new Date() } : {}),
        ...(errorMessage           ? { errorMessage }           : {}),
        ...(status === 'COMPLETED' ? { errorMessage: null }     : {}),
      },
    });

    if (status === 'COMPLETED') {
      void publishDomainEvent({
        eventType: 'printing.job.completed.v1',
        tenantId,
        payload:   { jobId: id, printedBy: 'local-agent' },
      });
    }

    return toApiResponse(null, undefined, `Statut mis à jour: ${status}`);
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
      // ── Step 2: Generate / render the ZPL (media sized to the resolved printer) ─
      // NOTE: `zpl` holds the rendered label in the printer's protocol (ZPL/TSPL/
      // ESC_POS) — the column name is legacy; providers transmit the bytes as-is.
      zpl = await this.resolveZpl(dto, tenantId, printer?.id, printer?.protocol);

      // ── Step 3: Select the transport PROVIDER and dispatch ────────────────────
      // ARCH-DECISION: a provider strategy replaces the old `if (connectionType)`
      // ladder, so new backends (PrintNode = Lot 3) slot in without touching this
      // method. Providers never touch the DB — we persist the outcome + event here.
      const provider = selectPrintProvider(printer);

      // No printer / no supporting provider → genuinely unprintable → FAILED
      // (never a false success — HACCP audit integrity).
      if (!provider || !printer) {
        await this.prisma.printJob.update({
          where: { id: jobId, tenantId },
          data:  { status: 'FAILED', zpl, errorMessage: 'Aucune imprimante configurée pour ce contrôle' },
        });
        void publishDomainEvent({
          eventType: 'printing.job.failed.v1',
          tenantId,
          payload:   { jobId, error: 'no_printer_configured' },
        });
        return;
      }

      // Assemble the dispatch input; PrintNode needs the tenant's decrypted key
      // (fetched server-side here — never sent to any client).
      const dispatchInput: PrintDispatchInput = { jobId, tenantId, printer, zpl };
      if (provider.name === 'printnode') {
        const apiKey = await this.providerConfig.getPrintNodeApiKey(tenantId);
        if (!apiKey) {
          await this.prisma.printJob.update({
            where: { id: jobId, tenantId },
            data:  { status: 'FAILED', zpl, errorMessage: 'PrintNode non configuré pour ce tenant' },
          });
          void publishDomainEvent({
            eventType: 'printing.job.failed.v1',
            tenantId,
            payload:   { jobId, error: 'printnode_not_configured' },
          });
          return;
        }
        dispatchInput.printNode = { apiKey };
      }

      const result = await provider.dispatch(dispatchInput);

      if (result.outcome === 'PENDING') {
        // Parked for an out-of-band pulling client (agent / BT relay). Store the
        // ZPL and LEAVE PENDING — never COMPLETED here.
        await this.prisma.printJob.update({
          where: { id: jobId, tenantId },
          data:  { status: 'PENDING', zpl },
        });
        return;
      }

      if (result.outcome === 'FAILED') {
        await this.prisma.printJob.update({
          where: { id: jobId, tenantId },
          data:  { status: 'FAILED', zpl, errorMessage: result.errorMessage },
        });
        void publishDomainEvent({
          eventType: 'printing.job.failed.v1',
          tenantId,
          payload:   { jobId, error: result.errorMessage },
        });
        return;
      }

      // ── COMPLETED (synchronous transport, e.g. network TCP) ───────────────────
      await this.prisma.printJob.update({
        where: { id: jobId, tenantId },
        data:  { status: 'COMPLETED', zpl, printedAt: new Date() },
      });

      void publishDomainEvent({
        eventType: 'printing.job.completed.v1',
        tenantId,
        payload:   { jobId, printerId: printer.id, provider: provider.name },
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
   * Resolve the physical media (size / technology / thermal params) for a job so
   * the DLC generator can size and lay out the label to the real stock. Priority:
   *   1. the target printer's defaultMediaProfile,
   *   2. the tenant's default active MediaProfile,
   *   3. undefined → generator falls back to the legacy 100×50mm output.
   */
  private async resolveMedia(
    printerId: string | undefined,
    tenantId: string,
  ): Promise<LabelMedia | undefined> {
    const profile =
      (printerId
        ? (
            await this.prisma.printer.findFirst({
              where:   { id: printerId, tenantId },
              include: { defaultMediaProfile: true },
            })
          )?.defaultMediaProfile ?? null
        : null) ??
      (await this.prisma.mediaProfile.findFirst({
        where: { tenantId, isActive: true, isDefault: true },
      }));

    if (!profile) return undefined;

    return {
      widthMm:     profile.widthMm,
      heightMm:    profile.heightMm,
      dpi:         profile.dpi,
      mediaType:   profile.mediaType,
      gapMm:       profile.gapMm ?? undefined,
      blackMarkMm: profile.blackMarkMm ?? undefined,
      speed:       profile.speed ?? undefined,
      density:     profile.density ?? undefined,
    };
  }

  /**
   * Determine the ZPL to send for a given job:
   *  1. If a templateId is provided → load template and render {{placeholders}}.
   *  2. If labelType === 'DLC' and no template → use the built-in DLC generator.
   *  3. Otherwise → look up the default template for this labelType and render.
   *  4. If no template found → serialize payload as a minimal fallback label.
   */
  private async resolveZpl(
    dto: CreatePrintJobDto,
    tenantId: string,
    resolvedPrinterId?: string,
    protocol?: string | null,
  ): Promise<string> {
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
      // Size the label to the actually-resolved printer's media profile (falls
      // back to dto.printerId, then the tenant default) — not just dto.printerId.
      const media = await this.resolveMedia(resolvedPrinterId ?? dto.printerId, tenantId);
      // Render in the printer's protocol (ZPL/TSPL/ESC_POS); defaults to ZPL.
      return getLabelRenderer(protocol).renderDlc(
        {
          productName: String(payload['productName'] ?? ''),
          lotNumber:   payload['lotNumber'] != null ? String(payload['lotNumber']) : null,
          producedAt:  String(payload['producedAt'] ?? new Date().toISOString()),
          expiresAt:   String(payload['expiresAt']  ?? new Date().toISOString()),
          tenantName:  payload['tenantName'] != null ? String(payload['tenantName']) : undefined,
        },
        dto.copies,
        media,
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
