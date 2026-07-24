import { ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import type { JwtPayload } from '@haccp/shared-types';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PaginationQuerySchema } from '@haccp/shared-validators';
import { generateTempPassword } from '@haccp/shared-utils';

import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  // ARCH-DECISION: tenantId guard at service entry — defense-in-depth against
  // JWT mis-configuration where tenantId is undefined. Prisma treats
  // `where: { tenantId: undefined }` as "no filter" → returns ALL rows.
  private assertTenantId(tenantId: string | undefined): asserts tenantId is string {
    if (!tenantId) throw new UnauthorizedException('Missing tenantId in request context');
  }

  async findAll(tenantId: string, query: Record<string, unknown>) {
    this.assertTenantId(tenantId);
    const { page, limit, search } = PaginationQuerySchema.parse(query);

    const where = {
      tenantId,
      // ARCH-DECISION: Always exclude SUPER_ADMIN accounts from tenant user lists.
      // SUPER_ADMIN users belong to the 'platform' pseudo-tenant and are platform
      // infrastructure — they must never appear in a regular tenant's user directory.
      // This prevents cross-tenant data leaks when a SUPER_ADMIN accidentally creates
      // a user from the Users page (which would inherit tenantId='platform').
      role: { not: 'SUPER_ADMIN' as const },
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
    this.assertTenantId(tenantId);
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
    this.assertTenantId(actor.tenantId);

    // ARCH-DECISION: Block SUPER_ADMIN from creating users via the tenant Users page.
    // SUPER_ADMIN's tenantId is 'platform' — any user created here would inherit that
    // tenantId and appear invisible to real tenants while polluting the platform pseudo-tenant.
    // SUPER_ADMIN must create tenant users from ClientDetailPage (cross-tenant endpoint).
    if (actor.role === 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'SUPER_ADMIN cannot create users from this endpoint. Use the Clients backoffice to manage tenant users.',
      );
    }

    // ARCH-DECISION: Check email uniqueness within this tenant only.
    // Cross-tenant email collision is caught by the DB unique constraint and
    // surfaced as a generic 409 — we do not expose which tenant owns the email.
    const exists = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId: actor.tenantId },
    });
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

  /**
   * SUPER_ADMIN cross-tenant user creation — creates a user in any tenant.
   *
   * ARCH-DECISION: Separate method from create() so tenantId comes from the
   * URL parameter (the target tenant), NOT from the actor's JWT tenantId
   * (which is 'platform'). This is the ONLY path by which a new TENANT_ADMIN
   * is bootstrapped. Regular create() blocks SUPER_ADMIN to prevent pollution
   * of the platform pseudo-tenant.
   *
   * Access control: enforced at controller level (@Roles('SUPER_ADMIN')).
   * This method trusts that the caller has already been verified as SUPER_ADMIN.
   */
  async createForTenant(targetTenantId: string, dto: CreateUserDto, actor: JwtPayload) {
    // Defence-in-depth: re-check role even though controller guard already ensures this
    if (actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN may create users in a specific tenant.');
    }

    // Email uniqueness scoped to the target tenant only
    const exists = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId: targetTenantId },
    });
    if (exists) throw new ConflictException(`Email ${dto.email} already in use in this tenant`);

    const passwordHash = await bcrypt.hash(
      dto.password ?? crypto.randomUUID(),
      12,
    );
    const status = dto.password ? 'ACTIVE' : 'INVITED';

    // ── Step 1: create profile scoped to the TARGET tenant (never 'platform') ──
    const user = await this.prisma.user.create({
      data: {
        email:    dto.email,
        name:     dto.name,
        role:     dto.role,
        status:   status as 'ACTIVE' | 'INVITED',
        tenantId: targetTenantId,          // ← target tenant, NOT actor.tenantId
      },
      select: {
        id: true, email: true, name: true,
        role: true, status: true, tenantId: true, createdAt: true, updatedAt: true,
      },
    });

    // ── Step 2: sync credential to auth-service (same atomic pattern as create()) ──
    try {
      const authUrl  = `${env.AUTH_SERVICE_URL}/internal/users`;
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
        await this.prisma.user.delete({ where: { id: user.id } });
        throw new InternalServerErrorException('Failed to create user credentials in auth-service');
      }
    } catch (err: unknown) {
      if (err instanceof InternalServerErrorException) throw err;
      await this.prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      throw new InternalServerErrorException('auth-service unreachable — user creation rolled back');
    }

    return toApiResponse(
      user,
      undefined,
      status === 'INVITED' ? 'Invitation sent' : 'Admin created in tenant',
    );
  }

  async update(id: string, dto: UpdateUserDto, tenantId: string) {
    await this.findOne(id, tenantId); // throws 404 if not found or wrong tenant

    const user = await this.prisma.user.update({
      // ARCH-DECISION: Double-scoped where for defense-in-depth — findOne already
      // validates tenantId, but an explicit tenantId here ensures the UPDATE itself
      // cannot touch a row in another tenant if the Prisma client is ever misused.
      where: { id, tenantId },
      data: dto,
      select: {
        id: true, email: true, name: true,
        role: true, status: true, tenantId: true, createdAt: true, updatedAt: true,
      },
    });

    // ARCH-DECISION: Propagate an activation/deactivation to auth-service (the
    // credential owner). Without this a deactivated profile kept a live, ACTIVE
    // credential and the user could still log in and refresh — an auth-bypass.
    // Deactivation also revokes existing sessions on the auth side.
    if (dto.status === 'ACTIVE' || dto.status === 'INACTIVE') {
      const res = await this.authFetch(`/internal/users/${id}/status`, 'POST', { status: dto.status })
        .catch(() => undefined);
      if (!res || !res.ok) {
        throw new InternalServerErrorException('auth-service unreachable — status change not applied');
      }
    }

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

    // Sync new credential to auth-service (same pattern as create()).
    // mustChangePassword:false — setting a concrete password clears any prior
    // "force change on next login" flag so a completed change ends the requirement.
    try {
      const authUrl = `${env.AUTH_SERVICE_URL}/internal/users`;
      const response = await fetch(authUrl, {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET,
        },
        body:   JSON.stringify({ ...existing, passwordHash, mustChangePassword: false }),
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

    // ARCH-DECISION: Delete the CREDENTIAL first (the security-relevant record) so a
    // partial failure can never leave a login-capable orphan in auth-service. This
    // closes the CRITICAL auth-bypass where deleting the profile left the credential
    // alive and the "deleted" user kept authenticating. Then remove the profile.
    const res = await this.authFetch(`/internal/users/${id}/delete`, 'POST', {}).catch(() => undefined);
    if (!res || !res.ok) {
      throw new InternalServerErrorException('auth-service unreachable — user deletion aborted');
    }

    await this.prisma.user.delete({ where: { id, tenantId } });
    return toApiResponse(null, undefined, 'User deleted');
  }

  // ─── Password lifecycle orchestration ─────────────────────────────────────────
  // ARCH-DECISION: user-service orchestrates but auth-service OWNS credentials, so
  // every write below goes over the secret-guarded internal HTTP boundary. Tenant
  // scoping is enforced here: an ADMIN can only act within actor.tenantId; a
  // SUPER_ADMIN (JWT tenantId='platform', which never matches a real user row) must
  // use the explicit for-tenant variants.

  private async authFetch(path: string, method: 'POST' | 'GET', body?: unknown): Promise<Response> {
    return fetch(`${env.AUTH_SERVICE_URL}${path}`, {
      method,
      headers: {
        'Content-Type':      'application/json',
        'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(5_000),
    });
  }

  private async loadScopedUser(id: string, tenantId: string) {
    this.assertTenantId(tenantId);
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, role: { not: 'SUPER_ADMIN' as const } },
      select: { id: true, tenantId: true },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  private async loadForTenant(targetTenantId: string, id: string, actor: JwtPayload) {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN may manage users across tenants.');
    }
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: targetTenantId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException(`User ${id} not found in tenant`);
    return user;
  }

  /** ADMIN resets a user in their own tenant. Returns the temp password ONCE. */
  async resetPassword(id: string, actor: JwtPayload) {
    if (id === actor.sub) throw new ConflictException('Use the change-password screen for your own account');
    const user = await this.loadScopedUser(id, actor.tenantId);
    return this.performReset(user.id, user.tenantId, actor.sub);
  }

  /** SUPER_ADMIN resets a user (typically a tenant ADMIN) in a specific tenant. */
  async resetPasswordForTenant(targetTenantId: string, id: string, actor: JwtPayload) {
    await this.loadForTenant(targetTenantId, id, actor);
    return this.performReset(id, targetTenantId, actor.sub);
  }

  private async performReset(userId: string, tenantId: string, performedByUserId: string) {
    const temporaryPassword = generateTempPassword(12);
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const res = await this.authFetch(`/internal/users/${userId}/reset-password`, 'POST', {
      passwordHash, performedByUserId, tenantId, method: 'TEMP_GENERATED', emailSent: false,
    }).catch(() => undefined);
    if (!res || !res.ok) {
      throw new InternalServerErrorException('auth-service unreachable — password reset failed');
    }
    // ARCH-DECISION: return the plaintext ONCE for the admin to display / send. It is
    // never stored in plaintext — only its bcrypt hash ever reaches auth-service.
    return toApiResponse({ temporaryPassword }, undefined, 'Mot de passe temporaire généré');
  }

  /** ADMIN locks/unlocks a user in their own tenant. */
  async setLock(id: string, actor: JwtPayload, locked: boolean, reason?: string) {
    if (id === actor.sub) throw new ConflictException('You cannot lock your own account');
    const user = await this.loadScopedUser(id, actor.tenantId);
    return this.performLock(user.id, user.tenantId, actor.sub, locked, reason);
  }

  async setLockForTenant(targetTenantId: string, id: string, actor: JwtPayload, locked: boolean, reason?: string) {
    await this.loadForTenant(targetTenantId, id, actor);
    return this.performLock(id, targetTenantId, actor.sub, locked, reason);
  }

  private async performLock(
    userId: string, tenantId: string, performedByUserId: string, locked: boolean, reason?: string,
  ) {
    const path = locked ? `/internal/users/${userId}/lock` : `/internal/users/${userId}/unlock`;
    const res = await this.authFetch(path, 'POST', {
      performedByUserId, tenantId, ...(reason ? { reason } : {}),
    }).catch(() => undefined);
    if (!res || !res.ok) {
      throw new InternalServerErrorException('auth-service unreachable — lock/unlock failed');
    }
    return toApiResponse(null, undefined, locked ? 'Compte verrouillé' : 'Compte déverrouillé');
  }

  /** Reset/lock history for a user (own tenant). */
  async getPasswordHistory(id: string, tenantId: string) {
    this.assertTenantId(tenantId);
    const user = await this.prisma.user.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.loadHistory(id);
  }

  async getPasswordHistoryForTenant(targetTenantId: string, id: string, actor: JwtPayload) {
    await this.loadForTenant(targetTenantId, id, actor);
    return this.loadHistory(id);
  }

  private async loadHistory(userId: string) {
    const res = await this.authFetch(`/internal/users/${userId}/reset-history`, 'GET').catch(() => undefined);
    if (!res || !res.ok) {
      throw new InternalServerErrorException('auth-service unreachable — history unavailable');
    }
    const json = (await res.json()) as { data: unknown[] };
    return toApiResponse(json.data);
  }
}
