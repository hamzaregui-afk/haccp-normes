/**
 * site.service.spec.ts
 *
 * Unit tests for SiteService (tenant-service).
 *
 * Covers:
 *  - findAllByTenant — scopes to tenantId, includes zones
 *  - create         — creates site; throws ConflictException for duplicate name
 *  - createZone     — creates zone in site; guards: site not found, zone name conflict
 *  - remove         — deletes site; throws NotFoundException when not found
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { SiteService } from './site.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSiteDto, CreateZoneDto } from './dto/site.dto';

// ─── Prisma mock factory ──────────────────────────────────────────────────────

function makePrismaMock() {
  return {
    site: {
      findMany:  jest.fn(),
      findFirst: jest.fn(),
      create:    jest.fn(),
      delete:    jest.fn(),
    },
    zone: {
      findFirst: jest.fn(),
      create:    jest.fn(),
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-abc-001';
const SITE_ID   = 'site-xyz-001';

function makeSite(overrides: Partial<{ id: string; name: string; tenantId: string }> = {}) {
  return {
    id:        overrides.id       ?? SITE_ID,
    name:      overrides.name     ?? 'Entrepôt Central',
    tenantId:  overrides.tenantId ?? TENANT_ID,
    address:   '12 rue de la Paix',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    zones:     [],
    _count:    { zones: 0 },
  };
}

function makeZone(overrides: Partial<{ id: string; name: string; siteId: string }> = {}) {
  return {
    id:        overrides.id     ?? 'zone-001',
    name:      overrides.name   ?? 'Zone A',
    siteId:    overrides.siteId ?? SITE_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('SiteService', () => {
  let service: SiteService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiteService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SiteService>(SiteService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── findAllByTenant ─────────────────────────────────────────────────────────

  describe('findAllByTenant', () => {
    it('should scope the query to the provided tenantId', async () => {
      prisma.site.findMany.mockResolvedValue([makeSite()]);

      await service.findAllByTenant(TENANT_ID);

      expect(prisma.site.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_ID } }),
      );
    });

    it('should include zones in the result', async () => {
      prisma.site.findMany.mockResolvedValue([makeSite()]);

      await service.findAllByTenant(TENANT_ID);

      const call = prisma.site.findMany.mock.calls[0][0];
      expect(call).toHaveProperty('include');
      expect(call.include).toHaveProperty('zones');
    });

    it('should order results by name ascending', async () => {
      prisma.site.findMany.mockResolvedValue([]);

      await service.findAllByTenant(TENANT_ID);

      expect(prisma.site.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });

    it('should return wrapped ApiResponse with the site list', async () => {
      const sites = [makeSite({ id: 's1', name: 'Site A' }), makeSite({ id: 's2', name: 'Site B' })];
      prisma.site.findMany.mockResolvedValue(sites);

      const result = await service.findAllByTenant(TENANT_ID);

      expect(result.data).toHaveLength(2);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateSiteDto = { name: 'Entrepôt Central', address: '12 rue de la Paix' };

    it('should create a site with the correct tenantId', async () => {
      prisma.site.findFirst.mockResolvedValue(null); // no conflict
      prisma.site.create.mockResolvedValue(makeSite());

      const result = await service.create(dto, TENANT_ID);

      expect(prisma.site.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_ID, name: dto.name }),
        }),
      );
      expect(result.message).toBe('Site created');
    });

    it('should throw ConflictException when a site with the same name exists in the tenant', async () => {
      prisma.site.findFirst.mockResolvedValue(makeSite()); // conflict

      await expect(service.create(dto, TENANT_ID)).rejects.toThrow(ConflictException);
      expect(prisma.site.create).not.toHaveBeenCalled();
    });

    it('should check name uniqueness scoped to the tenant', async () => {
      prisma.site.findFirst.mockResolvedValue(null);
      prisma.site.create.mockResolvedValue(makeSite());

      await service.create(dto, TENANT_ID);

      expect(prisma.site.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: dto.name, tenantId: TENANT_ID } }),
      );
    });
  });

  // ── createZone ──────────────────────────────────────────────────────────────

  describe('createZone', () => {
    const zoneDto: CreateZoneDto = { name: 'Zone Froide' };

    it('should create a zone in the given site', async () => {
      prisma.site.findFirst.mockResolvedValue(makeSite());
      prisma.zone.findFirst.mockResolvedValue(null); // no conflict
      prisma.zone.create.mockResolvedValue(makeZone({ name: 'Zone Froide' }));

      const result = await service.createZone(SITE_ID, zoneDto, TENANT_ID);

      expect(prisma.zone.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: zoneDto.name, siteId: SITE_ID },
        }),
      );
      expect(result.message).toBe('Zone created');
    });

    it('should throw NotFoundException when the site does not exist for the tenant', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await expect(service.createZone('bad-site', zoneDto, TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.zone.create).not.toHaveBeenCalled();
    });

    it('should scope the site lookup to the tenant', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await service.createZone(SITE_ID, zoneDto, TENANT_ID).catch(() => undefined);

      expect(prisma.site.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SITE_ID, tenantId: TENANT_ID } }),
      );
    });

    it('should throw ConflictException when a zone with the same name already exists in the site', async () => {
      prisma.site.findFirst.mockResolvedValue(makeSite());
      prisma.zone.findFirst.mockResolvedValue(makeZone()); // conflict

      await expect(service.createZone(SITE_ID, zoneDto, TENANT_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.zone.create).not.toHaveBeenCalled();
    });

    it('should check zone name uniqueness scoped to the siteId', async () => {
      prisma.site.findFirst.mockResolvedValue(makeSite());
      prisma.zone.findFirst.mockResolvedValue(null);
      prisma.zone.create.mockResolvedValue(makeZone());

      await service.createZone(SITE_ID, zoneDto, TENANT_ID);

      expect(prisma.zone.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: zoneDto.name, siteId: SITE_ID } }),
      );
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete the site and return a success message', async () => {
      prisma.site.findFirst.mockResolvedValue(makeSite());
      prisma.site.delete.mockResolvedValue(makeSite());

      const result = await service.remove(SITE_ID, TENANT_ID);

      expect(prisma.site.delete).toHaveBeenCalledWith({ where: { id: SITE_ID } });
      expect(result.message).toBe('Site deleted');
    });

    it('should throw NotFoundException when the site does not exist for the tenant', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await expect(service.remove('non-existent', TENANT_ID)).rejects.toThrow(NotFoundException);
      expect(prisma.site.delete).not.toHaveBeenCalled();
    });

    it('should scope the existence check to the tenant', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await service.remove(SITE_ID, TENANT_ID).catch(() => undefined);

      expect(prisma.site.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SITE_ID, tenantId: TENANT_ID } }),
      );
    });
  });
});
