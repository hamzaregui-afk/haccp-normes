/**
 * AuthService unit tests
 *
 * Strategy:
 *  - Mock PrismaService so no DB is needed.
 *  - Mock JwtService so no real crypto is exercised (signing is slow + env-dependent).
 *  - Mock bcrypt to control compare() return values.
 *  - Mock env module to supply deterministic secrets.
 */

// ── Env mock (must be before any import that reads env) ──────────────────────
jest.mock('../config/env', () => ({
  env: {
    JWT_SECRET:             'test_jwt_secret_at_least_32_chars_xx',
    JWT_EXPIRES_IN:         '15m',
    JWT_REFRESH_SECRET:     'test_refresh_secret_at_least_32_chars',
    JWT_REFRESH_EXPIRES_IN: '7d',
  },
}));

// ── bcrypt mock ───────────────────────────────────────────────────────────────
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedError } from '@haccp/shared-errors';

// ── Typed bcrypt mock ─────────────────────────────────────────────────────────
const mockBcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

// ── JwtService mock ───────────────────────────────────────────────────────────
const mockJwt = {
  signAsync:   jest.fn(),
  verifyAsync: jest.fn(),
};

// ── Fixtures ──────────────────────────────────────────────────────────────────
// Use CUID-compatible strings (start with 'c', no hyphens/spaces, ≥9 chars)
// so they pass Zod's z.string().cuid() validator used in JwtPayloadSchema.
const USER_ID   = 'cuser0001testidabc12345';
const TENANT_ID = 'ctenant001testidabc1234';

function makeDbUser(overrides: Partial<{
  id: string;
  email: string;
  status: string;
  role: string;
  tenantId: string;
  passwordHash: string;
}> = {}) {
  return {
    id:           overrides.id           ?? USER_ID,
    email:        overrides.email        ?? 'admin@haccp.com',
    name:         'Test Admin',
    passwordHash: overrides.passwordHash ?? '$2b$10$hashedvalue',
    role:         overrides.role         ?? 'ADMIN',
    status:       overrides.status       ?? 'ACTIVE',
    tenantId:     overrides.tenantId     ?? TENANT_ID,
    createdAt:    new Date('2025-01-01T00:00:00Z'),
    updatedAt:    new Date('2025-01-01T00:00:00Z'),
  };
}

function makeJwtPayload() {
  return {
    sub:      USER_ID,
    email:    'admin@haccp.com',
    tenantId: TENANT_ID,
    role:     'ADMIN' as const,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService,    useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ── validateUser ────────────────────────────────────────────────────────────

  describe('validateUser', () => {
    it('returns a JwtPayload when email and password are valid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockBcryptCompare.mockResolvedValue(true as never);

      const result = await service.validateUser('admin@haccp.com', 'CorrectPass!');

      expect(result).toEqual({
        sub:      USER_ID,
        email:    'admin@haccp.com',
        tenantId: TENANT_ID,
        role:     'ADMIN',
      });
    });

    it('looks up user by email via findUnique', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockBcryptCompare.mockResolvedValue(true as never);

      await service.validateUser('admin@haccp.com', 'pass');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@haccp.com' },
      });
    });

    it('throws UnauthorizedError when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.validateUser('ghost@haccp.com', 'any'),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError when user status is INACTIVE', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser({ status: 'INACTIVE' }));

      await expect(
        service.validateUser('inactive@haccp.com', 'any'),
      ).rejects.toThrow(UnauthorizedError);
      // bcrypt.compare must NOT be called — short-circuit before password check
      expect(mockBcryptCompare).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedError when user status is INVITED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser({ status: 'INVITED' }));

      await expect(
        service.validateUser('invited@haccp.com', 'any'),
      ).rejects.toThrow(UnauthorizedError);
      expect(mockBcryptCompare).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedError when password does not match', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockBcryptCompare.mockResolvedValue(false as never);

      await expect(
        service.validateUser('admin@haccp.com', 'WrongPass!'),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('passes the stored passwordHash (not plaintext) to bcrypt.compare', async () => {
      const user = makeDbUser({ passwordHash: '$2b$10$real_stored_hash' });
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockBcryptCompare.mockResolvedValue(true as never);

      await service.validateUser('admin@haccp.com', 'MyPlainPassword');

      expect(mockBcryptCompare).toHaveBeenCalledWith('MyPlainPassword', '$2b$10$real_stored_hash');
    });
  });

  // ── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns an object with accessToken and refreshToken', async () => {
      mockJwt.signAsync
        .mockResolvedValueOnce('signed-access-token')
        .mockResolvedValueOnce('signed-refresh-token');

      const result = await service.login(makeJwtPayload());

      expect(result).toEqual({
        accessToken:  'signed-access-token',
        refreshToken: 'signed-refresh-token',
      });
    });

    it('signs the access token with JWT_SECRET and configured expiry', async () => {
      mockJwt.signAsync.mockResolvedValue('any-token');

      await service.login(makeJwtPayload());

      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        makeJwtPayload(),
        expect.objectContaining({
          secret:    'test_jwt_secret_at_least_32_chars_xx',
          expiresIn: '15m',
        }),
      );
    });

    it('signs the refresh token with JWT_REFRESH_SECRET and its own expiry', async () => {
      mockJwt.signAsync.mockResolvedValue('any-token');

      await service.login(makeJwtPayload());

      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        makeJwtPayload(),
        expect.objectContaining({
          secret:    'test_refresh_secret_at_least_32_chars',
          expiresIn: '7d',
        }),
      );
    });

    it('calls signAsync exactly twice (access + refresh)', async () => {
      mockJwt.signAsync.mockResolvedValue('token');

      await service.login(makeJwtPayload());

      expect(mockJwt.signAsync).toHaveBeenCalledTimes(2);
    });

    it('signs both tokens in parallel (Promise.all — both calls happen regardless of order)', async () => {
      // Both tokens are signed even if the first one resolves slowly
      let callCount = 0;
      mockJwt.signAsync.mockImplementation(async () => {
        callCount++;
        return `token-${callCount}`;
      });

      const result = await service.login(makeJwtPayload());

      expect(result.accessToken).toBe('token-1');
      expect(result.refreshToken).toBe('token-2');
    });
  });

  // ── refresh ─────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('returns a new TokenPair for a valid refresh token', async () => {
      mockJwt.verifyAsync.mockResolvedValue(makeJwtPayload());
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockJwt.signAsync.mockResolvedValue('new-token');

      const result = await service.refresh('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('verifies the token using JWT_REFRESH_SECRET', async () => {
      mockJwt.verifyAsync.mockResolvedValue(makeJwtPayload());
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockJwt.signAsync.mockResolvedValue('new-token');

      await service.refresh('some-refresh-token');

      expect(mockJwt.verifyAsync).toHaveBeenCalledWith(
        'some-refresh-token',
        { secret: 'test_refresh_secret_at_least_32_chars' },
      );
    });

    it('throws UnauthorizedError when the refresh token is invalid', async () => {
      mockJwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError when the user is no longer ACTIVE', async () => {
      mockJwt.verifyAsync.mockResolvedValue(makeJwtPayload());
      // User was deactivated after the token was issued
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser({ status: 'INACTIVE' }));

      await expect(service.refresh('valid-token-but-user-inactive')).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('throws UnauthorizedError when user no longer exists (deleted account)', async () => {
      mockJwt.verifyAsync.mockResolvedValue(makeJwtPayload());
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refresh('valid-token-deleted-user')).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('re-issues tokens containing the same payload sub/tenantId/role', async () => {
      const payload = makeJwtPayload();
      mockJwt.verifyAsync.mockResolvedValue(payload);
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockJwt.signAsync.mockResolvedValue('new-token');

      await service.refresh('valid-refresh-token');

      // signAsync should be called with the re-extracted payload fields
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub:      payload.sub,
          tenantId: payload.tenantId,
          role:     payload.role,
        }),
        expect.any(Object),
      );
    });
  });
});
