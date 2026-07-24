/**
 * auth-internal.controller.ts
 *
 * Internal service-to-service endpoints for managing user credentials.
 *
 * ARCH-DECISION: Called by user-service (the orchestrator). auth-service is the
 * SOLE owner of credentials + password lifecycle state, so every write to
 * password_hash / mustChangePassword / lockedAt / reset-history happens here.
 * Uses X-Internal-Secret instead of JWT to avoid a circular dependency and is
 * never forwarded by the api-gateway. All operations are idempotent-friendly.
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { z } from 'zod';

import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const CreateInternalUserSchema = z.object({
  id:           z.string().min(1),
  email:        z.string().email(),
  name:         z.string().min(1).max(200),
  role:         z.string().min(1),
  status:       z.string().min(1),
  tenantId:     z.string().min(1),
  passwordHash: z.string().min(1),
  // Optional lifecycle flag: a self-service password change clears it (false);
  // omit to leave the current value untouched on update.
  mustChangePassword: z.boolean().optional(),
});

const ResetPasswordSchema = z.object({
  passwordHash:      z.string().min(1),
  performedByUserId: z.string().min(1),
  tenantId:          z.string().min(1),
  method:            z.enum(['ADMIN_RESET', 'TEMP_GENERATED', 'SELF_CHANGE']).default('ADMIN_RESET'),
  emailSent:         z.boolean().optional().default(false),
});

const LockSchema = z.object({
  performedByUserId: z.string().min(1),
  tenantId:          z.string().min(1),
  reason:            z.string().max(500).optional(),
});

const UnlockSchema = z.object({
  performedByUserId: z.string().min(1),
  tenantId:          z.string().min(1),
});

const StatusSchema = z.object({
  status:            z.enum(['ACTIVE', 'INACTIVE']),
  performedByUserId: z.string().min(1).optional(),
});

@SkipThrottle() // internal calls are not user-facing — no rate-limit needed
@Controller('internal/users')
export class AuthInternalController {
  constructor(private readonly prisma: PrismaService) {}

  private assertSecret(secret: string | undefined): void {
    if (secret !== env.INTERNAL_SERVICE_SECRET) {
      throw new ForbiddenException('Invalid internal service secret');
    }
  }

  /**
   * POST /internal/users — create or update a credential record (idempotent upsert).
   * Called by user-service after creating a profile, and on self-service password change.
   */
  @Post()
  @HttpCode(201)
  async create(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertSecret(secret);
    const dto = CreateInternalUserSchema.parse(body);

    const user = await this.prisma.user.upsert({
      where: { email: dto.email },
      create: {
        id:           dto.id,
        email:        dto.email,
        name:         dto.name,
        role:         dto.role as Parameters<typeof this.prisma.user.create>[0]['data']['role'],
        status:       dto.status as Parameters<typeof this.prisma.user.create>[0]['data']['status'],
        tenantId:     dto.tenantId,
        passwordHash: dto.passwordHash,
        mustChangePassword: dto.mustChangePassword ?? false,
      },
      update: {
        passwordHash: dto.passwordHash,
        role:         dto.role as Parameters<typeof this.prisma.user.update>[0]['data']['role'],
        status:       dto.status as Parameters<typeof this.prisma.user.update>[0]['data']['status'],
        name:         dto.name,
        // Only touch the flag when explicitly provided (self-change clears it).
        ...(dto.mustChangePassword !== undefined
          ? { mustChangePassword: dto.mustChangePassword, passwordChangedAt: new Date() }
          : {}),
      },
      select: { id: true },
    });

    return { id: user.id };
  }

  /**
   * POST /internal/users/:id/reset-password — admin-driven reset.
   * Sets a fresh hash, forces change-on-next-login, REVOKES all sessions, logs history.
   */
  @Post(':id/reset-password')
  @HttpCode(200)
  async resetPassword(
    @Headers('x-internal-secret') secret: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.assertSecret(secret);
    const dto = ResetPasswordSchema.parse(body);

    const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          passwordHash:       dto.passwordHash,
          mustChangePassword: true,
          passwordChangedAt:  new Date(),
        },
      }),
      // Revoke every existing session — a reset must invalidate old tokens.
      this.prisma.refreshToken.deleteMany({ where: { userId: id } }),
      this.prisma.passwordResetEvent.create({
        data: {
          userId:            id,
          tenantId:          dto.tenantId,
          performedByUserId: dto.performedByUserId,
          method:            dto.method,
          emailSent:         dto.emailSent,
        },
      }),
    ]);

    return { ok: true };
  }

  /** POST /internal/users/:id/lock — lock an account and kill its sessions. */
  @Post(':id/lock')
  @HttpCode(200)
  async lock(
    @Headers('x-internal-secret') secret: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.assertSecret(secret);
    const dto = LockSchema.parse(body);

    const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { lockedAt: new Date(), lockedBy: dto.performedByUserId, lockReason: dto.reason ?? null },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: id } }),
      this.prisma.passwordResetEvent.create({
        data: { userId: id, tenantId: dto.tenantId, performedByUserId: dto.performedByUserId, method: 'LOCK' },
      }),
    ]);

    return { ok: true };
  }

  /** POST /internal/users/:id/unlock — clear the lock. */
  @Post(':id/unlock')
  @HttpCode(200)
  async unlock(
    @Headers('x-internal-secret') secret: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.assertSecret(secret);
    const dto = UnlockSchema.parse(body);

    const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { lockedAt: null, lockedBy: null, lockReason: null },
      }),
      this.prisma.passwordResetEvent.create({
        data: { userId: id, tenantId: dto.tenantId, performedByUserId: dto.performedByUserId, method: 'UNLOCK' },
      }),
    ]);

    return { ok: true };
  }

  /**
   * POST /internal/users/:id/status — propagate deactivation/reactivation.
   * ARCH-DECISION: Closes the auth-bypass gap where user-service deactivated a
   * profile but the credential stayed ACTIVE, so a disabled user kept logging in.
   * Deactivation also revokes live sessions.
   */
  @Post(':id/status')
  @HttpCode(200)
  async setStatus(
    @Headers('x-internal-secret') secret: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.assertSecret(secret);
    const dto = StatusSchema.parse(body);

    const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    const status = dto.status as Parameters<typeof this.prisma.user.update>[0]['data']['status'];
    if (dto.status === 'INACTIVE') {
      // Deactivation also revokes live sessions so the disabled user is logged out.
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id }, data: { status } }),
        this.prisma.refreshToken.deleteMany({ where: { userId: id } }),
      ]);
    } else {
      await this.prisma.user.update({ where: { id }, data: { status } });
    }

    return { ok: true };
  }

  /**
   * DELETE-equivalent — POST /internal/users/:id/delete.
   * ARCH-DECISION: Closes the CRITICAL auth-bypass where deleting the user-service
   * profile left the auth credential alive, so the "deleted" user kept authenticating.
   * Uses POST (not HTTP DELETE) to keep a request body for the secret-guard symmetry.
   */
  @Post(':id/delete')
  @HttpCode(200)
  async remove(
    @Headers('x-internal-secret') secret: string | undefined,
    @Param('id') id: string,
  ) {
    this.assertSecret(secret);
    // Idempotent: deleting an already-absent credential is a no-op success.
    await this.prisma.user.deleteMany({ where: { id } });
    return { ok: true };
  }

  /** GET /internal/users/:id/reset-history — append-only reset/lock history. */
  @Get(':id/reset-history')
  async resetHistory(
    @Headers('x-internal-secret') secret: string | undefined,
    @Param('id') id: string,
  ) {
    this.assertSecret(secret);
    const events = await this.prisma.passwordResetEvent.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { data: events };
  }
}
