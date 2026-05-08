/**
 * group.service.spec.ts
 *
 * Unit tests for GroupService (user-service).
 *
 * Covers:
 *  - findAll — tenant isolation, pagination meta
 *  - findOne — happy path + NotFoundException for missing / wrong-tenant group
 *  - create  — success + ConflictException for duplicate name
 *  - addMember — upsert path + NotFoundException for missing group or user
 *  - removeMember — calls groupMember.delete
 *  - remove — calls group.delete + NotFoundException guard
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { GroupService } from './group.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateGroupDto, AddMemberDto } from './dto/create-group.dto';

// ─── Prisma mock factory ──────────────────────────────────────────────────────

function makePrismaMock() {
  return {
    group: {
      findMany:  jest.fn(),
      count:     jest.fn(),
      findFirst: jest.fn(),
      create:    jest.fn(),
      delete:    jest.fn(),
    },
    groupMember: {
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-abc-001';
const GROUP_ID  = 'group-xyz-001';
const USER_ID   = 'user-def-001';

function makeGroup(overrides: Partial<{ id: string; name: string; tenantId: string }> = {}) {
  return {
    id:        overrides.id       ?? GROUP_ID,
    name:      overrides.name     ?? 'Équipe Qualité',
    tenantId:  overrides.tenantId ?? TENANT_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    _count:    { members: 3 },
  };
}

function makeUser() {
  return { id: USER_ID, name: 'Alice Martin', email: 'alice@example.com', role: 'OPERATOR', tenantId: TENANT_ID };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('GroupService', () => {
  let service: GroupService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<GroupService>(GroupService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should scope the query to the provided tenantId', async () => {
      prisma.group.findMany.mockResolvedValue([makeGroup()]);
      prisma.group.count.mockResolvedValue(1);

      await service.findAll(TENANT_ID);

      expect(prisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_ID } }),
      );
    });

    it('should return correct pagination meta', async () => {
      prisma.group.findMany.mockResolvedValue([makeGroup()]);
      prisma.group.count.mockResolvedValue(42);

      const result = await service.findAll(TENANT_ID, 3, 10);

      expect(result.meta).toMatchObject({ total: 42, page: 3, limit: 10 });
    });

    it('should compute the correct skip value from page and limit', async () => {
      prisma.group.findMany.mockResolvedValue([]);
      prisma.group.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, 3, 10);

      expect(prisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('should include member count (_count) in the query', async () => {
      prisma.group.findMany.mockResolvedValue([]);
      prisma.group.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID);

      expect(prisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ _count: expect.anything() }),
        }),
      );
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return the group when found for the tenant', async () => {
      const group = makeGroup();
      prisma.group.findFirst.mockResolvedValue({ ...group, members: [] });

      const result = await service.findOne(GROUP_ID, TENANT_ID);

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: GROUP_ID, tenantId: TENANT_ID } }),
      );
      expect(result.data.id).toBe(GROUP_ID);
    });

    it('should throw NotFoundException when group does not exist for the tenant', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent', TENANT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateGroupDto = { name: 'Équipe Qualité' };

    it('should create a group with the given name and tenantId', async () => {
      prisma.group.findFirst.mockResolvedValue(null); // no conflict
      const created = makeGroup();
      prisma.group.create.mockResolvedValue(created);

      const result = await service.create(dto, TENANT_ID);

      expect(prisma.group.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: dto.name, tenantId: TENANT_ID },
        }),
      );
      expect(result.message).toBe('Group created');
    });

    it('should throw ConflictException when a group with the same name already exists', async () => {
      prisma.group.findFirst.mockResolvedValue(makeGroup()); // conflict

      await expect(service.create(dto, TENANT_ID)).rejects.toThrow(ConflictException);
      expect(prisma.group.create).not.toHaveBeenCalled();
    });

    it('should check name uniqueness scoped to the tenant', async () => {
      prisma.group.findFirst.mockResolvedValue(null);
      prisma.group.create.mockResolvedValue(makeGroup());

      await service.create(dto, TENANT_ID);

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: dto.name, tenantId: TENANT_ID } }),
      );
    });
  });

  // ── addMember ────────────────────────────────────────────────────────────────

  describe('addMember', () => {
    const dto: AddMemberDto = { userId: USER_ID };

    it('should upsert the group member when both group and user exist', async () => {
      // findOne (group) call: findFirst returns group
      prisma.group.findFirst.mockResolvedValue({ ...makeGroup(), members: [] });
      prisma.user.findFirst.mockResolvedValue(makeUser());
      prisma.groupMember.upsert.mockResolvedValue({});

      const result = await service.addMember(GROUP_ID, dto, TENANT_ID);

      expect(prisma.groupMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_groupId: { userId: USER_ID, groupId: GROUP_ID } },
          create: { userId: USER_ID, groupId: GROUP_ID },
        }),
      );
      expect(result.message).toBe('Member added');
    });

    it('should throw NotFoundException when the group does not exist', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.addMember('bad-group', dto, TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.groupMember.upsert).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the user does not belong to the tenant', async () => {
      prisma.group.findFirst.mockResolvedValue({ ...makeGroup(), members: [] });
      prisma.user.findFirst.mockResolvedValue(null); // user not found

      await expect(service.addMember(GROUP_ID, dto, TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.groupMember.upsert).not.toHaveBeenCalled();
    });

    it('should scope the user lookup to the tenant', async () => {
      prisma.group.findFirst.mockResolvedValue({ ...makeGroup(), members: [] });
      prisma.user.findFirst.mockResolvedValue(makeUser());
      prisma.groupMember.upsert.mockResolvedValue({});

      await service.addMember(GROUP_ID, dto, TENANT_ID);

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER_ID, tenantId: TENANT_ID } }),
      );
    });
  });

  // ── removeMember ─────────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('should delete the group member record', async () => {
      prisma.group.findFirst.mockResolvedValue({ ...makeGroup(), members: [] });
      prisma.groupMember.delete.mockResolvedValue({});

      const result = await service.removeMember(GROUP_ID, USER_ID, TENANT_ID);

      expect(prisma.groupMember.delete).toHaveBeenCalledWith({
        where: { userId_groupId: { userId: USER_ID, groupId: GROUP_ID } },
      });
      expect(result.message).toBe('Member removed');
    });

    it('should throw NotFoundException when the group does not exist', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.removeMember('bad-group', USER_ID, TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.groupMember.delete).not.toHaveBeenCalled();
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete the group and return a success message', async () => {
      prisma.group.findFirst.mockResolvedValue({ ...makeGroup(), members: [] });
      prisma.group.delete.mockResolvedValue(makeGroup());

      const result = await service.remove(GROUP_ID, TENANT_ID);

      expect(prisma.group.delete).toHaveBeenCalledWith({ where: { id: GROUP_ID } });
      expect(result.message).toBe('Group deleted');
    });

    it('should throw NotFoundException when the group does not exist', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.remove('non-existent', TENANT_ID)).rejects.toThrow(NotFoundException);
      expect(prisma.group.delete).not.toHaveBeenCalled();
    });
  });
});
