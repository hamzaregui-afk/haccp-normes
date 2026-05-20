/**
 * AuthService unit tests
 *
 * Strategy:
 *  - Mock PrismaService so no DB is needed.
 *  - Mock JwtService so no real crypto is exercised (signing is slow + env-dependent).
 *  - Mock bcrypt to control compare() / hash() return values.
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
  hash:    jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedError } from '@haccp/shared-errors';

// ── Typed bcrypt mocks ────────────────────────────────────────────────────────
const mockBcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;
const mockBcryptHash    = bcrypt.hash    as jest.MockedFunction<typeof bcrypt.hash>;

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  refreshToken: {
    create:      jest.fn(),
    findMany:    jest.fn(),
    delete:      jest.fn(),
    deleteMany:  jest.fn(),
  },
};

// ── JwtService mock ───────────────────────────────────────────────────────────
const mockJwt = {
  signAsync:   jest.fn(),
  verifyAsync: jest.fn(),
  // decode() is used in login() to read the refresh token's exp claim
  decode:      jest.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 }),
};

// ── Fixtures ──────────────────────────────────────────────────────────────────
const USER_ID   = 'cuser0001testidabc12345';
const TENANT_ID = 'ctenant001testidabc1234';
const TOKEN_ID  = 'ctoken001testidabc12345';

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
    sub:              USER_ID,
    email:            'admin@haccp.com',
    tenantId:         TENANT_ID,
    role:             'ADMIN' as const,
    allowedModules:   [] as string[],
    subscriptionPlan: 'standard',
    tenantStatus:     'ACTIVE',
  };
}

function makeStoredToken(tokenHash = '$2b$06$stored_token_hash') {
  return {
    id:        TOKEN_ID,
    userId:    USER_ID,
    token:     tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
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

    // Reset decode mock (cleared by clearAllMocks above)
    mockJwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 });

    // Default hash mock — login() always hashes the refresh token
    mockBcryptHash.mockResolvedValue('$2b$06$hashed_refresh_token' as never);

    // Default refreshToken.create mock — no-op
    mockPrisma.refreshToken.create.mockResolvedValue(makeStoredToken());
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

    it('stores a hashed copy of the refresh token in the DB', async () => {
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      mockBcryptHash.mockResolvedValue('$2b$06$hashed' as never);

      await service.login(makeJwtPayload());

      expect(mockBcryptHash).toHaveBeenCalledWith('refresh-token', 6);
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            token:  '$2b$06$hashed',
          }),
        }),
      );
    });
  });

  // ── refresh ─────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    function setupValidRefresh() {
      mockJwt.verifyAsync.mockResolvedValue(makeJwtPayload());
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockPrisma.refreshToken.findMany.mockResolvedValue([makeStoredToken()]);
      mockBcryptCompare.mockResolvedValue(true as never);
      mockPrisma.refreshToken.delete.mockResolvedValue(makeStoredToken());
      mockJwt.signAsync.mockResolvedValue('new-token');
    }

    it('returns a new TokenPair for a valid refresh token', async () => {
      setupValidRefresh();

      const result = await service.refresh('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('verifies the token using JWT_REFRESH_SECRET', async () => {
      setupValidRefresh();

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

    it('throws UnauthorizedError when no matching stored token found (revoked)', async () => {
      mockJwt.verifyAsync.mockResolvedValue(makeJwtPayload());
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockPrisma.refreshToken.findMany.mockResolvedValue([makeStoredToken()]);
      // bcrypt.compare returns false → token was revoked / not matching
      mockBcryptCompare.mockResolvedValue(false as never);

      await expect(service.refresh('revoked-token')).rejects.toThrow(UnauthorizedError);
    });

    it('deletes all user tokens when a revoked token is presented (replay attack)', async () => {
      mockJwt.verifyAsync.mockResolvedValue(makeJwtPayload());
      mockPrisma.user.findUnique.mockResolvedValue(makeDbUser());
      mockPrisma.refreshToken.findMany.mockResolvedValue([makeStoredToken()]);
      mockBcryptCompare.mockResolvedValue(false as never);

      await expect(service.refresh('stolen-token')).rejects.toThrow();

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
    });

    it('deletes the used refresh token after a successful refresh (rotation)', async () => {
      setupValidRefresh();

      await service.refresh('valid-refresh-token');

      expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: TOKEN_ID },
      });
    });

    it('re-issues tokens containing the same payload sub/tenantId/role', async () => {
      setupValidRefresh();
      const payload = makeJwtPayload();

      await service.refresh('valid-refresh-token');

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

  // ── logout ──────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('deletes all refresh tokens for the user', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      await service.logout(USER_ID);

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
    });

    it('does not throw if the user has no stored tokens', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.logout(USER_ID)).resolves.toBeUndefined();
    });
  });
});
