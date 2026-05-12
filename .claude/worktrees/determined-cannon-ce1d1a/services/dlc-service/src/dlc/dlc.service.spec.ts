/**
 * Unit tests for dlc-service: DlcService.
 * Covers: calculate (pure, no DB), printLabel, findAll (tenant isolation),
 * findOne, getExpiringToday, getExpiringSoon.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { DlcService } from './dlc.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-aaa';
const TENANT_B = 'tenant-bbb';
const USER_ID  = 'user-xyz';

/** Build a DlcLabel-shaped object for mock returns. */
function makeLabel(overrides: Partial<{
  id: string;
  tenantId: string;
  productId: string;
  productName: string;
  producedAt: Date;
  expiresAt: Date;
  printedBy: string;
  printedAt: Date;
}> = {}) {
  const produced = overrides.producedAt ?? new Date('2026-05-01T00:00:00Z');
  const expires  = overrides.expiresAt  ?? new Date('2026-05-06T00:00:00Z');
  return {
    id:          overrides.id          ?? 'label-1',
    tenantId:    overrides.tenantId    ?? TENANT_A,
    productId:   overrides.productId   ?? 'prod-1',
    productName: overrides.productName ?? 'Poulet fermier',
    producedAt:  produced,
    expiresAt:   expires,
    printedBy:   overrides.printedBy   ?? USER_ID,
    printedAt:   overrides.printedAt   ?? new Date(),
  };
}

function makePrismaMock() {
  return {
    dlcLabel: {
      create:   jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count:    jest.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DlcService', () => {
  let service: DlcService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlcService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DlcService>(DlcService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── calculate (pure, no DB) ───────────────────────────────────────────────

  it('calculate — computes expiresAt as producedAt + dlcDays without a DB write', () => {
    const producedAt = new Date('2026-05-01T00:00:00Z');

    const result = service.calculate({
      productId:   'prod-1',
      productName: 'Poulet fermier',
      dlcDays:     5,
      producedAt,
    });

    // Expected expiry: 2026-05-06
    expect(result.data.expiresAt).toEqual(new Date('2026-05-06T00:00:00Z'));
    expect(prisma.dlcLabel.create).not.toHaveBeenCalled();
  });

  it('calculate — does not mutate the producedAt argument', () => {
    const producedAt = new Date('2026-05-01T00:00:00Z');
    const original   = producedAt.getTime();

    service.calculate({ productId: 'p', productName: 'X', dlcDays: 10, producedAt });

    expect(producedAt.getTime()).toBe(original);
  });

  it('calculate — returns the supplied productId and productName unchanged', () => {
    const result = service.calculate({
      productId:   'prod-42',
      productName: 'Fromage AOP',
      dlcDays:     30,
      producedAt:  new Date('2026-05-01T00:00:00Z'),
    });

    expect(result.data.productId).toBe('prod-42');
    expect(result.data.productName).toBe('Fromage AOP');
  });

  // ─── printLabel ───────────────────────────────────────────────────────────

  it('printLabel — creates a label with tenantId and printedBy from args', async () => {
    const label = makeLabel();
    prisma.dlcLabel.create.mockResolvedValue(label);

    const dto = {
      productId:   'prod-1',
      productName: 'Poulet fermier',
      dlcDays:     5,
      producedAt:  new Date('2026-05-01T00:00:00Z'),
    };

    const result = await service.printLabel(dto, TENANT_A, USER_ID);

    expect(prisma.dlcLabel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId:  TENANT_A,
          printedBy: USER_ID,
        }),
      }),
    );
    expect(result.message).toBe('Label enregistré');
  });

  it('printLabel — uses provided expiresAt instead of calculating when supplied', async () => {
    const manualExpiry = new Date('2026-06-01T00:00:00Z');
    const label = makeLabel({ expiresAt: manualExpiry });
    prisma.dlcLabel.create.mockResolvedValue(label);

    const dto = {
      productId:   'prod-1',
      productName: 'Lait cru',
      dlcDays:     5,
      producedAt:  new Date('2026-05-01T00:00:00Z'),
      expiresAt:   manualExpiry,
    };

    await service.printLabel(dto, TENANT_A, USER_ID);

    const created = prisma.dlcLabel.create.mock.calls[0][0].data;
    expect(created.expiresAt).toEqual(manualExpiry);
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('findAll — scopes query strictly to the caller tenantId', async () => {
    prisma.dlcLabel.findMany.mockResolvedValue([makeLabel()]);
    prisma.dlcLabel.count.mockResolvedValue(1);

    await service.findAll(TENANT_A, { page: 1, limit: 20 });

    const where = prisma.dlcLabel.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT_A);
  });

  it('findAll — does NOT expose tenant B labels to tenant A', async () => {
    prisma.dlcLabel.findMany.mockResolvedValue([]);
    prisma.dlcLabel.count.mockResolvedValue(0);

    await service.findAll(TENANT_B, { page: 1, limit: 20 });

    const where = prisma.dlcLabel.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT_B);
    expect(where.tenantId).not.toBe(TENANT_A);
  });

  it('findAll — applies productId filter when provided', async () => {
    prisma.dlcLabel.findMany.mockResolvedValue([]);
    prisma.dlcLabel.count.mockResolvedValue(0);

    await service.findAll(TENANT_A, { page: 1, limit: 20, productId: 'prod-99' });

    const where = prisma.dlcLabel.findMany.mock.calls[0][0].where;
    expect(where.productId).toBe('prod-99');
  });

  it('findAll — returns correct pagination meta', async () => {
    prisma.dlcLabel.findMany.mockResolvedValue([makeLabel()]);
    prisma.dlcLabel.count.mockResolvedValue(100);

    const result = await service.findAll(TENANT_A, { page: 2, limit: 10 });

    expect(result.meta).toMatchObject({ total: 100, page: 2, limit: 10 });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  it('findOne — returns label when it belongs to the tenant', async () => {
    const label = makeLabel();
    prisma.dlcLabel.findFirst.mockResolvedValue(label);

    const result = await service.findOne('label-1', TENANT_A);

    expect(prisma.dlcLabel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'label-1', tenantId: TENANT_A } }),
    );
    expect(result.data).toMatchObject({ id: 'label-1' });
  });

  it('findOne — throws NotFoundException for unknown or cross-tenant label', async () => {
    prisma.dlcLabel.findFirst.mockResolvedValue(null);

    await expect(service.findOne('ghost', TENANT_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── getExpiringToday ─────────────────────────────────────────────────────

  it('getExpiringToday — queries with a same-day UTC range scoped to tenant', async () => {
    prisma.dlcLabel.findMany.mockResolvedValue([makeLabel()]);

    const result = await service.getExpiringToday(TENANT_A);

    const where = prisma.dlcLabel.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT_A);
    expect(where.expiresAt).toBeDefined();
    expect(where.expiresAt.gte).toBeInstanceOf(Date);
    expect(where.expiresAt.lte).toBeInstanceOf(Date);
    // lte must be end-of-day (after gte)
    expect(where.expiresAt.lte.getTime()).toBeGreaterThan(where.expiresAt.gte.getTime());
    expect(result.data).toHaveLength(1);
  });

  // ─── getExpiringSoon ──────────────────────────────────────────────────────

  it('getExpiringSoon — default window is 3 days, scoped to tenant', async () => {
    prisma.dlcLabel.findMany.mockResolvedValue([makeLabel(), makeLabel({ id: 'label-2' })]);

    const result = await service.getExpiringSoon(TENANT_A);

    const where = prisma.dlcLabel.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT_A);
    expect(where.expiresAt.gte).toBeInstanceOf(Date);
    expect(where.expiresAt.lte).toBeInstanceOf(Date);
    // cutoff must be roughly 3 days from now
    const diffMs = where.expiresAt.lte.getTime() - where.expiresAt.gte.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(3, 0);
    expect(result.data).toHaveLength(2);
  });

  it('getExpiringSoon — respects a custom days argument', async () => {
    prisma.dlcLabel.findMany.mockResolvedValue([]);

    await service.getExpiringSoon(TENANT_A, 7);

    const where = prisma.dlcLabel.findMany.mock.calls[0][0].where;
    const diffMs   = where.expiresAt.lte.getTime() - where.expiresAt.gte.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });
});
