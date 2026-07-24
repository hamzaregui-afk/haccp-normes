import { Body, Controller, Get, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { z } from 'zod';

import type { JwtPayload } from '@haccp/shared-types';
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

  // ARCH-DECISION: Humane login rate-limit. 5/min was too strict — a legitimate
  // operator fumbling a complex password would exhaust it in a few tries and then
  // get 429 even on the CORRECT password (the throttler runs before auth and can't
  // tell right from wrong credentials), locking themselves out in a retry loop.
  // 20/min + 100/15min still gives zero room for brute force: passwords are bcrypt
  // hashed, so ~20 online guesses/min against a strong secret is infeasible. We
  // override BOTH named throttlers here (the global 'medium' 50/15min would
  // otherwise be the real binding constraint across a long fumbling session).
  @Throttle({ short: { ttl: 60_000, limit: 20 }, medium: { ttl: 900_000, limit: 100 } })
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
    }).catch(() => { /* fire-and-forget: audit failure must never surface */ });

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

  /** POST /api/auth/logout — Invalidates the server-side refresh token.
   *  The client is responsible for clearing its own token storage. */
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(204)
  async logout(@Request() req: { user: JwtPayload }) {
    await this.authService.logout(req.user.sub);

    void emitAuditEvent({
      userId:     req.user.sub,
      action:     'LOGOUT',
      resource:   'users',
      resourceId: req.user.sub,
      tenantId:   req.user.tenantId,
      payload:    {},
    }).catch(() => { /* fire-and-forget: audit failure must never surface */ });
  }

  @SkipThrottle() // JWT-protected endpoints don't need throttling — JWT is the protection
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: { user: JwtPayload }) {
    return req.user;
  }

  /**
   * POST /api/v1/auth/change-password — self-service password change.
   * Also the endpoint the forced change-on-next-login interstitial calls.
   * Requires the current password; throttled to blunt current-password guessing.
   */
  @Throttle({ short: { ttl: 60_000, limit: 10 } })
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@Request() req: { user: JwtPayload }, @Body() body: unknown) {
    const { currentPassword, newPassword } = z
      .object({
        currentPassword: z.string().min(1),
        newPassword:     z.string().min(8).max(128),
      })
      .parse(body);

    await this.authService.changeOwnPassword(req.user.sub, currentPassword, newPassword);

    void emitAuditEvent({
      userId:     req.user.sub,
      action:     'UPDATE',
      resource:   'users',
      resourceId: req.user.sub,
      tenantId:   req.user.tenantId,
      payload:    { selfPasswordChange: true },
    }).catch(() => { /* fire-and-forget: audit failure must never surface */ });

    return { ok: true };
  }
}
