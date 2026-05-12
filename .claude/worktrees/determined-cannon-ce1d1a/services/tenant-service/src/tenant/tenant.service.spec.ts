/**
 * Unit tests for tenant-service: TenantService.
 * Covers: findAll (with search/pagination), findOne, create (slug conflict),
 * update, remove (soft-archive).
 *
 * Note: TenantService is a SUPER_ADMIN-only service — it has no per-tenant
 * scoping (it IS the tenant registry). Tests verify slug-uniqueness enforcement
 * and soft-delete (status → ARCHIVED) instead of tenant-isolation.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { TenantService } from './tenant.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrismaMock() {
  return {
    tenant: {
      findMany:  jest.fn(),
      findUnique: jest.fn(),
      count:     jest.fn(),
      create:    jest.fn(),
      update:    jest.fn(),
    },
  };
}

/** Build a Tenant-shaped object for mock returns. */
function makeTenant(overrides: Partial<{
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  createdAt: Date;
  updatedAt: Date;
  sites: unknown[];
  _count: { sites: number };
}> = {}) {
  return {
    id:        overrides.id        ?? 'tenant-1',
    name:      overrides.name      ?? 'Boulangerie Dupont',
    slug:      overrides.slug      ?? 'boulangerie-dupont',
    status:    overrides.status    ?? 'ACTIVE',
    plan:      overrides.plan      ?? 'standard',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-15T00:00:00Z'),
    sites:     overrides.sites     ?? [],
    _count:    overrides._count    ?? { sites: 0 },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TenantService', () => {
  let service: TenantService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('findAll — returns paginated list of tenants with meta', async () => {
    const tenants = [makeTenant(), makeTenant({ id: 'tenant-2', slug: 'fromagerie-martin' })];
    prisma.tenant.findMany.mockResolvedValue(tenants);
    prisma.tenant.count.mockResolvedValue(2);

    const result = await service.findAll(1, 20);

    expect(result.data).toHaveLength(2);
    expect(result.meta).toMatchObject({ total: 2, page: 1, limit: 20 });
  });

  it('findAll — passes no where filter when search is omitted', async () => {
    prisma.tenant.findMany.mockResolvedValue([]);
    prisma.tenant.count.mockResolvedValue(0);

    await service.findAll(1, 20);

    const where = prisma.tenant.findMany.mock.calls[0][0].where;
    expect(where).toEqual({});
  });

  it('findAll — passes OR filter on name and slug when search is provided', async () => {
    prisma.tenant.findMany.mockResolvedValue([makeTenant()]);
    prisma.tenant.count.mockResolvedValue(1);

    await service.findAll(1, 20, 'dupont');

    const where = prisma.tenant.findMany.mock.calls[0][0].where;
    expect(where).toHaveProperty('OR');
    expect(where.OR).toHaveLength(2);
    const fields = (where.OR as Array<Record<string, unknown>>).map((c) => Object.keys(c)[0]);
    expect(fields).toContain('name');
    expect(fields).toContain('slug');
  });

  it('findAll — applies correct skip/take for page 3 with limit 5', async () => {
    prisma.tenant.findMany.mockResolvedValue([]);
    prisma.tenant.count.mockResolvedValue(0);

    await service.findAll(3, 5);

    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  it('findOne — returns tenant with nested sites and zones', async () => {
    const tenant = makeTenant({ sites: [{ id: 'site-1', zones: [] }] });
    prisma.tenant.findUnique.mockResolvedValue(tenant);

    const result = await service.findOne('tenant-1');

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-1' },
        include: expect.objectContaining({ sites: expect.anything() }),
      }),
    );
    expect(result.data).toMatchObject({ id: 'tenant-1' });
  });

  it('findOne — throws NotFoundException for a non-existent id', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.findOne('ghost-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  it('create — persists a new tenant and returns 201-style message', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null); // slug not taken
    const newTenant = makeTenant();
    prisma.tenant.create.mockResolvedValue(newTenant);

    const dto = { name: 'Boulangerie Dupont', slug: 'boulangerie-dupont', plan: 'standard' };
    const result = await service.create(dto);

    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: dto }),
    );
    expect(result.message).toBe('Tenant created');
    expect(result.data).toMatchObject({ slug: 'boulangerie-dupont' });
  });

  it('create — throws ConflictException when slug is already taken', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant()); // slug exists

    const dto = { name: 'Another Bakery', slug: 'boulangerie-dupont' };
    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tenant.create).not.toHaveBeenCalled();
  });

  it('create — checks slug uniqueness by calling findUnique with where: { slug }', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.tenant.create.mockResolvedValue(makeTenant());

    await service.create({ name: 'Fermier Bio', slug: 'fermier-bio' });

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { slug: 'fermier-bio' } });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  it('update — verifies existence then patches the tenant', async () => {
    // findOne internally calls prisma.tenant.findUnique
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    const updatedTenant = makeTenant({ name: 'Boulangerie Dupont SARL', plan: 'premium' });
    prisma.tenant.update.mockResolvedValue(updatedTenant);

    const result = await service.update('tenant-1', { name: 'Boulangerie Dupont SARL', plan: 'premium' });

    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-1' },
        data: { name: 'Boulangerie Dupont SARL', plan: 'premium' },
      }),
    );
    expect(result.data).toMatchObject({ name: 'Boulangerie Dupont SARL' });
  });

  it('update — throws NotFoundException if the tenant does not exist', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null); // findOne will throw

    await expect(service.update('ghost-id', { name: 'New Name' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  // ─── remove (soft-archive) ────────────────────────────────────────────────

  it('remove — sets status to ARCHIVED instead of deleting the row', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    const archived = makeTenant({ status: 'ARCHIVED' });
    prisma.tenant.update.mockResolvedValue(archived);

    const result = await service.remove('tenant-1');

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { status: 'ARCHIVED' },
    });
    expect(result.message).toBe('Tenant archived');
    expect(result.data).toMatchObject({ status: 'ARCHIVED' });
  });

  it('remove — throws NotFoundException if tenant does not exist', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.remove('ghost-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('remove — never performs a hard DELETE (prisma.tenant.delete must not be called)', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.tenant.update.mockResolvedValue(makeTenant({ status: 'ARCHIVED' }));

    await service.remove('tenant-1');

    // The tenant-service prisma mock has no .delete — this assertion confirms
    // the service relies only on .update for the remove operation.
    expect(prisma.tenant.update).toHaveBeenCalledTimes(1);
    // Ensure the update sets ARCHIVED, not any other destructive op
    const updateData = prisma.tenant.update.mock.calls[0][0].data;
    expect(updateData).toEqual({ status: 'ARCHIVED' });
  });
});
