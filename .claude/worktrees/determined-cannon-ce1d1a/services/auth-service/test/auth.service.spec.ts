import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';

import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockDeep<PrismaClient>() },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('mock.token') } },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma  = module.get(PrismaService);
  });

  describe('validateUser', () => {
    it('should throw if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.validateUser('x@x.com', 'pass')).rejects.toThrow();
    });

    it('should throw if user is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: '1', tenantId: 't1', email: 'x@x.com', name: 'X',
        passwordHash: 'hash', role: 'OPERATOR', status: 'INACTIVE',
        createdAt: new Date(), updatedAt: new Date(),
      });
      await expect(service.validateUser('x@x.com', 'pass')).rejects.toThrow();
    });
  });

  describe('login', () => {
    it('should return accessToken and refreshToken', async () => {
      const payload = { sub: 'user-1', email: 'a@b.com', tenantId: 'tenant-1', role: 'ADMIN' as const };
      const result = await service.login(payload);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });
  });
});
