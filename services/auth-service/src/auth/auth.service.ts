import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import type { JwtPayload, TokenPair } from '@haccp/shared-types';
import { UnauthorizedError } from '@haccp/shared-errors';

import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

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
      tenantId: user.tenantId,
      role:     user.role as JwtPayload['role'],
    };
  }

  async login(payload: JwtPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: env.JWT_SECRET,
        expiresIn: env.JWT_EXPIRES_IN,
      }),
      this.jwt.signAsync(payload, {
        secret: env.JWT_REFRESH_SECRET,
        expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: env.JWT_REFRESH_SECRET,
      });

      // Re-verify user is still active
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (user?.status !== 'ACTIVE') throw new UnauthorizedException();

      return this.login({ sub: payload.sub, email: payload.email, tenantId: payload.tenantId, role: payload.role });
    } catch {
      throw new UnauthorizedError('AUTH_002');
    }
  }
}
