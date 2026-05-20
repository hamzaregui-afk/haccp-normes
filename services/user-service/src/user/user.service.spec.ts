import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '@haccp/shared-types';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

// ─── Prisma mock factory ──────────────────────────────────────────────────────
// Each method is typed as jest.Mock so TypeScript is happy without `any`.

type MockPrismaService = {
  user: {
    findMany:   jest.Mock;
    count:      jest.Mock;
    findFirst:  jest.Mock;
    findUnique: jest.Mock;
    create:     jest.Mock;
    update:     jest.Mock;
    delete:     jest.Mock;
  };
};

const buildPrismaMock = (): MockPrismaService => ({
  user: {
    findMany:   jest.fn(),
    count:      jest.fn(),
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    delete:     jest.fn(),
  },
});

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const TENANT_A = 'tenant-aaa';
const TENANT_B = 'tenant-bbb';

const baseUser = {
  id:        'user-001',
  email:     'alice@acme.com',
  name:      'Alice',
  role:      'ADMIN' as const,
  status:    'ACTIVE' as const,
  tenantId:  TENANT_A,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

const actorA: JwtPayload = {
  sub:              'actor-001',
  email:            'admin@acme.com',
  role:             'ADMIN',
  tenantId:         TENANT_A,
  allowedModules:   [],
  subscriptionPlan: 'standard',
  tenantStatus:     'ACTIVE',
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('UserService', () => {
  let service: UserService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = buildPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns a paginated list of users for the correct tenant', async () => {
      prisma.user.findMany.mockResolvedValue([baseUser]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_A, { page: '1', limit: '10' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta?.total).toBe(1);
    });

    it('scopes query to tenantId — tenant isolation enforced', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll(TENANT_B, {});

      const calledWhere = prisma.user.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(calledWhere['tenantId']).toBe(TENANT_B);
    });

    it('applies search filter when search param is provided', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll(TENANT_A, { search: 'alice' });

      const calledWhere = prisma.user.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(calledWhere).toHaveProperty('OR');
    });

    it('never includes passwordHash in the select projection', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll(TENANT_A, {});

      const calledSelect = prisma.user.findMany.mock.calls[0][0].select as Record<string, unknown>;
      expect(calledSelect).not.toHaveProperty('passwordHash');
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the user wrapped in ApiResponse when found', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);

      const result = await service.findOne('user-001', TENANT_A);

      expect(result.data).toMatchObject({ id: 'user-001', email: 'alice@acme.com' });
    });

    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.findOne('ghost-id', TENANT_A)).rejects.toThrow(NotFoundException);
    });

    it('enforces tenant isolation — does not return users from other tenants', async () => {
      // Simulate DB returning null because tenantId does not match
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-001', TENANT_B)).rejects.toThrow(NotFoundException);

      // Confirm the query included tenantId: TENANT_B, not TENANT_A
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-001', tenantId: TENANT_B } }),
      );
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto: CreateUserDto = {
      email:    'bob@acme.com',
      name:     'Bob',
      role:     'OPERATOR',
      password: 'secret-password-123',
    };

    it('creates a user with ACTIVE status when a password is provided', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // no existing user
      const created = { ...baseUser, id: 'user-002', email: createDto.email, status: 'ACTIVE' };
      prisma.user.create.mockResolvedValue(created);

      const result = await service.create(createDto, actorA);

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(result.data).toMatchObject({ email: 'bob@acme.com', status: 'ACTIVE' });
    });

    it('creates a user with INVITED status when no password is supplied', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const invited = { ...baseUser, id: 'user-003', status: 'INVITED' };
      prisma.user.create.mockResolvedValue(invited);

      const result = await service.create({ email: 'carol@acme.com', name: 'Carol', role: 'VIEWER' }, actorA);

      expect(result.message).toBe('Invitation sent');
    });

    it('assigns tenantId from actor JWT — never from the DTO', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...baseUser, tenantId: TENANT_A });

      await service.create(createDto, actorA);

      const createData = prisma.user.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(createData['tenantId']).toBe(TENANT_A);
    });

    it('throws ConflictException when email is already in use', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser); // already exists

      await expect(service.create(createDto, actorA)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('hashes the password before persisting', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...baseUser });

      const hashSpy = jest.spyOn(bcrypt, 'hash');

      await service.create(createDto, actorA);

      expect(hashSpy).toHaveBeenCalledWith(createDto.password, 12);
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    const updateDto: UpdateUserDto = { name: 'Alice Updated' };

    it('updates and returns the user on success', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser); // findOne inside update
      const updated = { ...baseUser, name: 'Alice Updated' };
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.update('user-001', updateDto, TENANT_A);

      expect(result.data).toMatchObject({ name: 'Alice Updated' });
    });

    it('throws NotFoundException when the target user is not in the tenant', async () => {
      prisma.user.findFirst.mockResolvedValue(null); // findOne returns null

      await expect(service.update('user-001', updateDto, TENANT_B)).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes the user and returns a success message', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      prisma.user.delete.mockResolvedValue(baseUser);

      const differentActor: JwtPayload = { ...actorA, sub: 'actor-999' };
      const result = await service.remove('user-001', TENANT_A, differentActor);

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-001' } });
      expect(result.message).toBe('User deleted');
    });

    it('throws ConflictException when actor tries to delete their own account', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...baseUser, id: actorA.sub });

      await expect(service.remove(actorA.sub, TENANT_A, actorA)).rejects.toThrow(ConflictException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not belong to the tenant', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.remove('user-001', TENANT_B, actorA)).rejects.toThrow(NotFoundException);
    });
  });
});
