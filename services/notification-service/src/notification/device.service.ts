import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDeviceDto } from './dto/device.dto';

// Roles that should receive non-conformity push alerts.
export const NC_ALERT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'QUALITY_OFFICER'];

@Injectable()
export class DeviceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert the caller's device token. Keyed on the (globally unique) push token
   * so re-registering the same device (e.g. after a role change or reinstall)
   * updates ownership rather than creating duplicates.
   */
  async register(tenantId: string, userId: string, role: string, dto: RegisterDeviceDto) {
    return this.prisma.pushDevice.upsert({
      where:  { expoPushToken: dto.expoPushToken },
      create: {
        tenantId,
        userId,
        role,
        expoPushToken: dto.expoPushToken,
        platform: dto.platform,
      },
      update: { tenantId, userId, role, platform: dto.platform },
    });
  }

  /** Remove a device token (logout). Scoped to the tenant for isolation. */
  async unregister(tenantId: string, expoPushToken: string): Promise<{ removed: number }> {
    const { count } = await this.prisma.pushDevice.deleteMany({
      where: { tenantId, expoPushToken },
    });
    return { removed: count };
  }

  /** Tokens for a single user within a tenant (assignee-targeted push). */
  async tokensForUser(tenantId: string, userId: string): Promise<string[]> {
    const rows = await this.prisma.pushDevice.findMany({
      where: { tenantId, userId },
      select: { expoPushToken: true },
    });
    return rows.map((r) => r.expoPushToken);
  }

  /** Tokens for every user with one of the given roles in a tenant (role-targeted push). */
  async tokensForRoles(tenantId: string, roles: string[]): Promise<string[]> {
    const rows = await this.prisma.pushDevice.findMany({
      where: { tenantId, role: { in: roles } },
      select: { expoPushToken: true },
    });
    return rows.map((r) => r.expoPushToken);
  }

  /** Purge tokens Expo reported as unregistered (uninstalled / disabled). */
  async purgeTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.prisma.pushDevice.deleteMany({ where: { expoPushToken: { in: tokens } } });
  }
}
