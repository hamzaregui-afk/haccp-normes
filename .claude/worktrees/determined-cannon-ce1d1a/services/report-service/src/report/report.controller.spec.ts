/**
 * report.controller.spec.ts
 *
 * Unit tests for ReportController — audit event emission on create / update /
 * delete / export (PDF download).
 *
 * Strategy:
 *  - Mock @haccp/shared-utils emitAuditEvent
 *  - Mock ReportService and PDF generator
 *  - Mock DTO schemas (pass-through parse)
 *  - Instantiate ReportController directly (no NestJS DI overhead)
 *  - Provide a fake Response object for downloadPdf tests
 */

jest.mock('@haccp/shared-utils', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./dto/report.dto', () => ({
  CreateReportDtoSchema: { parse: (x: unknown) => x },
  UpdateReportDtoSchema: { parse: (x: unknown) => x },
  ReportQuerySchema:     { parse: (x: unknown) => x },
}));

jest.mock('./pdf/report-pdf.generator', () => ({
  generateReportPdf: jest.fn().mockResolvedValue(Buffer.from('fake-pdf')),
}));

import { emitAuditEvent } from '@haccp/shared-utils';
import { ReportController } from './report.controller';
import type { JwtPayload } from '@haccp/shared-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTOR: JwtPayload = {
  sub:      'manager-001',
  email:    'manager@example.com',
  tenantId: 'tenant-abc',
  role:     'MANAGER',
};

const REPORT_ID = 'report-xyz-001';

const CREATED_REPORT = { data: { id: REPORT_ID, type: 'MONTHLY_HACCP' } };
const UPDATED_REPORT = { data: { id: REPORT_ID, status: 'VALIDATED' } };
const DELETED_REPORT = { message: 'Report deleted' };

// Minimal Express Response mock sufficient for downloadPdf
function makeFakeResponse() {
  return {
    set: jest.fn(),
    end: jest.fn(),
  };
}

// ─── ReportService mock ───────────────────────────────────────────────────────

function makeReportServiceMock() {
  return {
    findAll:     jest.fn().mockResolvedValue({ data: [] }),
    findOne:     jest.fn().mockResolvedValue({ data: CREATED_REPORT }),
    findOneRaw:  jest.fn().mockResolvedValue({ id: REPORT_ID, type: 'MONTHLY_HACCP' }),
    getStats:    jest.fn().mockResolvedValue({ data: {} }),
    create:      jest.fn().mockResolvedValue(CREATED_REPORT),
    update:      jest.fn().mockResolvedValue(UPDATED_REPORT),
    remove:      jest.fn().mockResolvedValue(DELETED_REPORT),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ReportController audit integration', () => {
  let controller: ReportController;
  let reportService: ReturnType<typeof makeReportServiceMock>;

  beforeEach(() => {
    reportService = makeReportServiceMock();
    controller    = new ReportController(reportService as never);
    jest.clearAllMocks();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { type: 'MONTHLY_HACCP', period: '2026-04' };

    it('returns the created report', async () => {
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_REPORT);
    });

    it('emits a CREATE audit event with correct fields', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   'manager-001',
          action:   'CREATE',
          resource: 'reports',
          tenantId: 'tenant-abc',
        }),
      );
    });

    it('sets resourceId from the created report id', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: REPORT_ID }),
      );
    });

    it('includes report type in audit payload', async () => {
      await controller.create(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ type: 'MONTHLY_HACCP' }),
        }),
      );
    });

    it('still returns the report when audit fails silently', async () => {
      (emitAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('down'));
      const result = await controller.create(dto, ACTOR);
      expect(result).toEqual(CREATED_REPORT);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('emits an UPDATE audit event with the correct resourceId', async () => {
      await controller.update(REPORT_ID, { status: 'VALIDATED' }, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'UPDATE',
          resource:   'reports',
          resourceId: REPORT_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('includes status in audit payload', async () => {
      await controller.update(REPORT_ID, { status: 'VALIDATED' }, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ status: 'VALIDATED' }),
        }),
      );
    });

    it('returns the updated report', async () => {
      const result = await controller.update(REPORT_ID, { status: 'VALIDATED' }, ACTOR);
      expect(result).toEqual(UPDATED_REPORT);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('emits a DELETE audit event with the correct resourceId', async () => {
      await controller.remove(REPORT_ID, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action:     'DELETE',
          resource:   'reports',
          resourceId: REPORT_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('returns the deleted report result', async () => {
      const result = await controller.remove(REPORT_ID, ACTOR);
      expect(result).toEqual(DELETED_REPORT);
    });

    it('emits exactly one audit event', async () => {
      await controller.remove(REPORT_ID, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ── downloadPdf (EXPORT) ───────────────────────────────────────────────────

  describe('downloadPdf', () => {
    it('emits an EXPORT audit event for regulatory traceability', async () => {
      const fakeRes = makeFakeResponse();
      await controller.downloadPdf(REPORT_ID, ACTOR, fakeRes as never);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:     'manager-001',
          action:     'EXPORT',
          resource:   'reports',
          resourceId: REPORT_ID,
          tenantId:   'tenant-abc',
        }),
      );
    });

    it('sets PDF response headers', async () => {
      const fakeRes = makeFakeResponse();
      await controller.downloadPdf(REPORT_ID, ACTOR, fakeRes as never);

      expect(fakeRes.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'application/pdf' }),
      );
    });

    it('calls res.end with the PDF buffer', async () => {
      const fakeRes = makeFakeResponse();
      await controller.downloadPdf(REPORT_ID, ACTOR, fakeRes as never);

      expect(fakeRes.end).toHaveBeenCalledWith(Buffer.from('fake-pdf'));
    });

    it('emits exactly one EXPORT event per download', async () => {
      const fakeRes = makeFakeResponse();
      await controller.downloadPdf(REPORT_ID, ACTOR, fakeRes as never);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });
});
