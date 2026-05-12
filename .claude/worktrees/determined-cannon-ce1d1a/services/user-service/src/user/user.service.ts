import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import type { JwtPayload } from '@haccp/shared-types';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PaginationQuerySchema } from '@haccp/shared-validators';

import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: Record<string, unknown>) {
    const { page, limit, search } = PaginationQuerySchema.parse(query);

    const where = {
      tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, email: true, name: true,
          role: true, status: true, tenantId: true,
          createdAt: true, updatedAt: true,
          // passwordHash intentionally excluded
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return toApiResponse(users, toPaginationMeta(total, { page, limit }));
  }

  async findOne(id: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: {
        id: true, email: true, name: true,
        role: true, status: true, tenantId: true,
        createdAt: true, updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return toApiResponse(user);
  }

  async create(dto: CreateUserDto, actor: JwtPayload) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException(`Email ${dto.email} already in use`);

    // Hash the password here; the hash is passed to auth-service (never stored in user-service DB).
    // If no password is given, generate a random placeholder — the user must reset via invitation link.
    const passwordHash = await bcrypt.hash(
      dto.password ?? crypto.randomUUID(),
      12,
    );
    const status = dto.password ? 'ACTIVE' : 'INVITED';

    // ── Step 1: create profile in user-service DB (no passwordHash column here) ──
    const user = await this.prisma.user.create({
      data: {
        email:    dto.email,
        name:     dto.name,
        role:     dto.role,
        status:   status as 'ACTIVE' | 'INVITED',
        tenantId: actor.tenantId,
      },
      select: {
        id: true, email: true, name: true,
        role: true, status: true, tenantId: true, createdAt: true, updatedAt: true,
      },
    });

    // ── Step 2: sync credential to auth-service via internal HTTP call ────────
    // ARCH-DECISION: We call auth-service synchronously (not via RabbitMQ) because
    // user creation must be atomic — a user without credentials can never log in,
    // so the profile creation should roll back if auth-service is unreachable.
    try {
      const authUrl = `${env.AUTH_SERVICE_URL}/internal/users`;
      const response = await fetch(authUrl, {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET,
        },
        body:   JSON.stringify({ ...user, passwordHash }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        // Rollback: auth-service rejected the request — remove the profile we just created
        await this.prisma.user.delete({ where: { id: user.id } });
        throw new InternalServerErrorException(
          'Failed to create user credentials in auth-service',
        );
      }
    } catch (err: unknown) {
      if (err instanceof InternalServerErrorException) throw err;
      // Network error / timeout — rollback profile
      await this.prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      throw new InternalServerErrorException(
        'auth-service unreachable — user creation rolled back',
      );
    }

    return toApiResponse(user, undefined, status === 'INVITED' ? 'Invitation sent' : 'User created');
  }

  async update(id: string, dto: UpdateUserDto, tenantId: string) {
    await this.findOne(id, tenantId); // throws 404 if not found or wrong tenant

    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true, email: true, name: true,
        role: true, status: true, tenantId: true, createdAt: true, updatedAt: true,
      },
    });
    return toApiResponse(user);
  }

  async changePassword(id: string, dto: ChangePasswordDto, tenantId: string) {
    // Find user scoped to tenant — throws 404 if not found
    const existing = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: {
        id: true, email: true, name: true,
        role: true, status: true, tenantId: true, createdAt: true, updatedAt: true,
      },
    });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Sync new credential to auth-service (same pattern as create())
    try {
      const authUrl = `${env.AUTH_SERVICE_URL}/internal/users`;
      const response = await fetch(authUrl, {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET,
        },
        body:   JSON.stringify({ ...existing, passwordHash }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        throw new InternalServerErrorException(
          'Failed to update password in auth-service',
        );
      }
    } catch (err: unknown) {
      if (err instanceof InternalServerErrorException) throw err;
      throw new InternalServerErrorException(
        'auth-service unreachable — password change failed',
      );
    }

    return toApiResponse(null, undefined, 'Mot de passe mis à jour');
  }

  async remove(id: string, tenantId: string, actor: JwtPayload) {
    await this.findOne(id, tenantId);
    if (id === actor.sub) throw new ConflictException('You cannot delete your own account');

    await this.prisma.user.delete({ where: { id } });
    return toApiResponse(null, undefined, 'User deleted');
  }
}
