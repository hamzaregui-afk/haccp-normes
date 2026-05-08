import { Body, Controller, Get, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { z } from 'zod';

import type { JwtPayload } from '@haccp/shared-types';
import { LoginSchema } from '@haccp/shared-validators';
import { emitAuditEvent } from '@haccp/shared-utils';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** GET /api/auth/health — Rule 7: every service needs a health endpoint */
  @Get('health')
  health() {
    return { status: 'ok', uptime: process.uptime(), version: '0.1.0' };
  }

  @Throttle({ short: { ttl: 60_000, limit: 5 } }) // max 5 login attempts per minute
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Request() req: { user: JwtPayload }) {
    const tokens = await this.authService.login(req.user);

    // ARCH-DECISION: Fire-and-forget — audit failure must never block the login response.
    void emitAuditEvent({
      userId:     req.user.sub,
      action:     'LOGIN',
      resource:   'users',
      resourceId: req.user.sub,
      tenantId:   req.user.tenantId,
      payload:    { email: req.user.email },
    });

    // ARCH-DECISION: Include `user` (JwtPayload) in the login response so clients
    // can store the decoded user object without a second /me call or local JWT
    // decode. Both web LoginPage (reads data.user) and mobile LoginScreen
    // (reads res.data.user) depend on this field being present.
    return { ...tokens, user: req.user };
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    // ARCH-DECISION: refreshToken is a JWT string, not an email — we validate
    // it as a non-empty string only. The authService does the real validation
    // (DB lookup + expiry check).
    const { refreshToken } = z
      .object({ refreshToken: z.string().min(1) })
      .parse(body);

    return this.authService.refresh(refreshToken);
  }

  @SkipThrottle() // JWT-protected endpoints don't need throttling — JWT is the protection
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: { user: JwtPayload }) {
    return req.user;
  }
}
