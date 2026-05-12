/**
 * dlc.controller.spec.ts
 *
 * Unit tests for DlcController — audit event emission on printLabel.
 *
 * Key invariant: calculate() must NEVER emit an audit event.
 * It is a pure, stateless computation — no DB write, no regulatory event.
 *
 * Strategy:
 *  - Mock @haccp/shared-utils emitAuditEvent
 *  - Mock DlcService (no DB)
 *  - Mock DTO schemas (pass-through parse)
 *  - Instantiate DlcController directly (no NestJS DI overhead)
 */

jest.mock('@haccp/shared-utils', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./dto/dlc.dto', () => ({
  CalculateDlcDtoSchema: { parse: (x: unknown) => x },
  PrintLabelDtoSchema:   { parse: (x: unknown) => x },
  DlcQuerySchema:        { parse: (x: unknown) => x },
}));

import { emitAuditEvent } from '@haccp/shared-utils';
import { DlcController } from './dlc.controller';
import type { JwtPayload } from '@haccp/shared-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTOR: JwtPayload = {
  sub:      'operator-001',
  email:    'operator@example.com',
  tenantId: 'tenant-abc',
  role:     'OPERATOR',
};

const LABEL_ID = 'label-xyz-001';

const CALCULATE_RESULT = {
  data: {
    expirationDate: '2026-05-12',
    daysLeft:       5,
    status:         'OK',
  },
};

const PRINT_LABEL_RESULT = {
  data: {
    label: { id: LABEL_ID, productName: 'Chicken Breast', lotNumber: 'LOT-2026-001' },
  },
};

// ─── DlcService mock ──────────────────────────────────────────────────────────

function makeDlcServiceMock() {
  return {
    calculate:       jest.fn().mockReturnValue(CALCULATE_RESULT),
    printLabel:      jest.fn().mockResolvedValue(PRINT_LABEL_RESULT),
    getExpiringToday: jest.fn().mockResolvedValue({ data: [] }),
    getExpiringSoon:  jest.fn().mockResolvedValue({ data: [] }),
    findAll:         jest.fn().mockResolvedValue({ data: [] }),
    findOne:         jest.fn().mockResolvedValue({ data: {} }),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('DlcController audit integration', () => {
  let controller: DlcController;
  let dlcService: ReturnType<typeof makeDlcServiceMock>;

  beforeEach(() => {
    dlcService = makeDlcServiceMock();
    controller = new DlcController(dlcService as never);
    jest.clearAllMocks();
  });

  // ── calculate — NO audit ───────────────────────────────────────────────────

  describe('calculate', () => {
    const dto = { productName: 'Chicken Breast', fabricationDate: '2026-05-07', shelfLifeDays: 5 };

    it('returns the calculation result', () => {
      const result = controller.calculate(dto);
      expect(result).toEqual(CALCULATE_RESULT);
    });

    it('does NOT emit any audit event (pure computation, no DB write)', () => {
      controller.calculate(dto);
      expect(emitAuditEvent).not.toHaveBeenCalled();
    });
  });

  // ── printLabel — CREATE audit ──────────────────────────────────────────────

  describe('printLabel', () => {
    const dto = {
      productName: 'Chicken Breast',
      lotNumber:   'LOT-2026-001',
      fabricationDate: '2026-05-07',
      shelfLifeDays: 5,
    };

    it('returns the print label result', async () => {
      const result = await controller.printLabel(dto, ACTOR);
      expect(result).toEqual(PRINT_LABEL_RESULT);
    });

    it('calls DlcService.printLabel with dto, tenantId, and actor sub', async () => {
      await controller.printLabel(dto, ACTOR);
      expect(dlcService.printLabel).toHaveBeenCalledWith(dto, ACTOR.tenantId, ACTOR.sub);
    });

    it('emits a CREATE audit event with correct fields', async () => {
      await controller.printLabel(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   'operator-001',
          action:   'CREATE',
          resource: 'dlc',
          tenantId: 'tenant-abc',
        }),
      );
    });

    it('sets resourceId from the created label id', async () => {
      await controller.printLabel(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: LABEL_ID }),
      );
    });

    it('includes productName and lotNumber in audit payload', async () => {
      await controller.printLabel(dto, ACTOR);
      await Promise.resolve();

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            productName: 'Chicken Breast',
            lotNumber:   'LOT-2026-001',
          }),
        }),
      );
    });

    it('still returns the label result when audit fails silently', async () => {
      (emitAuditEvent as jest.Mock).mockRejectedValueOnce(new Error('down'));
      const result = await controller.printLabel(dto, ACTOR);
      expect(result).toEqual(PRINT_LABEL_RESULT);
    });

    it('emits exactly one audit event per label print', async () => {
      await controller.printLabel(dto, ACTOR);
      await Promise.resolve();
      expect(emitAuditEvent).toHaveBeenCalledTimes(1);
    });
  });
});
