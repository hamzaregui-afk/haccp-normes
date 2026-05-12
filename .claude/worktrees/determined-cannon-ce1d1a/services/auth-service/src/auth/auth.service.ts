import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import type { JwtPayload, TokenPair } from '@haccp/shared-types';
import { UnauthorizedError } from '@haccp/shared-errors';

import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Purge expired refresh tokens once at startup, then every 6 hours. */
  onModuleInit() {
    const purge = async () => {
      try {
        const { count } = await this.prisma.refreshToken.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        if (count > 0) this.logger.log(`Purged ${count} expired refresh token(s)`);
      } catch (err) {
        this.logger.warn('Refresh-token purge failed', err);
      }
    };

    void purge();
    // ARCH-DECISION: Use setInterval instead of @nestjs/schedule to avoid adding
    // a dependency for a single periodic task. 6-hour interval keeps the table
    // small without hammering the DB. The interval ref is intentionally not
    // stored — it runs for the lifetime of the process.
    setInterval(() => void purge(), 6 * 60 * 60 * 1_000);
  }

  async validateUser(email: string, password: string): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // ARCH-DECISION: compare against the status enum, not a synthetic isActive field.
    // The Prisma schema stores status: UserStatus (ACTIVE | INACTIVE | INVITED).
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('AUTH_001');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('AUTH_001');
    }

    return {
      sub:      user.id,
      email:    user.email,
      name:     user.name,
      tenantId: user.tenantId,
      role:     user.role as JwtPayload['role'],
    };
  }

  async login(payload: JwtPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret:    env.JWT_SECRET,
        expiresIn: env.JWT_EXPIRES_IN,
      }),
      this.jwt.signAsync(payload, {
        secret:    env.JWT_REFRESH_SECRET,
        expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      }),
    ]);

    // ARCH-DECISION: Store a hashed copy of the refresh token so that:
    //   a) logout can invalidate it server-side (stateless JWTs cannot be
    //      revoked otherwise — the refresh_tokens table IS the revocation list).
    //   b) even if the DB is compromised, the raw token is not exposed.
    // We use bcrypt cost 6 here (not 10) because this runs on every login and
    // the token itself is already a 256-bit cryptographically random string.
    const tokenHash = await bcrypt.hash(refreshToken, 6);

    // Parse the refresh token to read its expiry (so we can store it)
    const decoded = this.jwt.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // fallback: 7 days

    await this.prisma.refreshToken.create({
      data: {
        userId:    payload.sub,
        token:     tokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<TokenPair & { user: JwtPayload }> {
    try {
      // Step 1: Verify JWT signature (catches expired / tampered tokens fast)
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: env.JWT_REFRESH_SECRET,
      });

      // Step 2: Re-verify user is still active
      const dbUser = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (dbUser?.status !== 'ACTIVE') throw new UnauthorizedException();

      // Step 3: Verify the token exists in the DB (revocation check).
      // We must compare against every stored hash for this user because bcrypt
      // comparison is O(n) per record — users rarely have more than 1-2 sessions.
      const storedTokens = await this.prisma.refreshToken.findMany({
        where: {
          userId: payload.sub,
          expiresAt: { gt: new Date() },
        },
      });

      let matchedTokenId: string | null = null;
      for (const stored of storedTokens) {
        const matches = await bcrypt.compare(refreshToken, stored.token);
        if (matches) {
          matchedTokenId = stored.id;
          break;
        }
      }

      if (!matchedTokenId) {
        // Token was revoked or never issued — possible token replay attack.
        // Revoke ALL tokens for this user as a safety measure.
        await this.prisma.refreshToken.deleteMany({ where: { userId: payload.sub } });
        throw new UnauthorizedException();
      }

      // Step 4: Delete the used token (rotation — one-time use)
      await this.prisma.refreshToken.delete({ where: { id: matchedTokenId } });

      // Re-fetch name from DB so it reflects any profile updates since last login
      const user: JwtPayload = {
        sub:      payload.sub,
        email:    payload.email,
        name:     dbUser.name,
        tenantId: payload.tenantId,
        role:     payload.role,
      };

      // ARCH-DECISION: Return user alongside tokens so the web auth.store
      // can update the stored JwtPayload on refresh (role/tenantId may change).
      // login() creates the new refresh token in the DB.
      const tokens = await this.login(user);
      return { ...tokens, user };
    } catch {
      throw new UnauthorizedError('AUTH_002');
    }
  }

  /** Invalidate all refresh tokens for a user (called on logout). */
  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }
}
