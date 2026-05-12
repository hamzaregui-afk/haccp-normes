/**
 * auth-internal.controller.ts
 *
 * Internal service-to-service endpoint for creating user credentials.
 *
 * ARCH-DECISION: Called by user-service after it creates a user profile, so that
 * auth-service has the credential record needed for login. Uses X-Internal-Secret
 * instead of JWT to avoid a circular dependency (the very user being created
 * doesn't have a JWT yet). The api-gateway does NOT forward /internal/** paths.
 *
 * The operation is idempotent (upsert) so retries are safe.
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
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
});

@SkipThrottle() // internal calls are not user-facing — no rate-limit needed
@Controller('internal/users')
export class AuthInternalController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /internal/users
   *
   * Creates (or updates) a user credential record in auth-service's DB.
   * Called by user-service immediately after creating the user profile.
   * Requires the X-Internal-Secret header.
   */
  @Post()
  @HttpCode(201)
  async create(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: unknown,
  ) {
    if (secret !== env.INTERNAL_SERVICE_SECRET) {
      throw new ForbiddenException('Invalid internal service secret');
    }

    const dto = CreateInternalUserSchema.parse(body);

    // Upsert: idempotent if user-service retries after a transient failure
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
      },
      update: {
        passwordHash: dto.passwordHash,
        role:         dto.role as Parameters<typeof this.prisma.user.update>[0]['data']['role'],
        status:       dto.status as Parameters<typeof this.prisma.user.update>[0]['data']['status'],
        name:         dto.name,
      },
      select: { id: true },
    });

    return { id: user.id };
  }
}
