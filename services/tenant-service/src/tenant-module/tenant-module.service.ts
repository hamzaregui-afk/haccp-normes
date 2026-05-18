import { Injectable, NotFoundException } from '@nestjs/common';
import { toApiResponse } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_MODULE_KEYS,
  PLAN_DEFAULT_MODULES,
  type SetTenantModulesDto,
  type TenantModuleKey,
} from './tenant-module.dto';

@Injectable()
export class TenantModuleService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Read all 17 modules for a tenant ─────────────────────────────────────────
  // Always returns all 17 module keys — disabled ones have enabled=false.
  async getModules(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const saved = await this.prisma.tenantModule.findMany({ where: { tenantId } });
    const savedMap = new Map(saved.map((m) => [m.moduleKey as TenantModuleKey, m.enabled]));

    // Fill in defaults for modules not yet in DB (e.g., newly added enum values)
    const plan       = tenant.plan ?? 'standard';
    const defaults   = new Set<TenantModuleKey>(PLAN_DEFAULT_MODULES[plan] ?? PLAN_DEFAULT_MODULES.standard);

    const full = ALL_MODULE_KEYS.map((key) => ({
      moduleKey: key,
      enabled:   savedMap.has(key) ? (savedMap.get(key) ?? false) : defaults.has(key),
    }));

    return toApiResponse(full);
  }

  // ── Bulk upsert modules ───────────────────────────────────────────────────────
  async setModules(tenantId: string, dto: SetTenantModulesDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    await Promise.all(
      dto.modules.map((m) =>
        this.prisma.tenantModule.upsert({
          where:  { tenantId_moduleKey: { tenantId, moduleKey: m.moduleKey } },
          update: { enabled: m.enabled },
          create: { tenantId, moduleKey: m.moduleKey, enabled: m.enabled },
        }),
      ),
    );

    return this.getModules(tenantId);
  }

  // ── Initialize modules for a new tenant based on its plan ────────────────────
  // Called automatically when a tenant is created. Idempotent — safe to call
  // multiple times (upsert semantics).
  async initForPlan(tenantId: string, plan: string) {
    const enabledKeys = new Set<TenantModuleKey>(PLAN_DEFAULT_MODULES[plan] ?? PLAN_DEFAULT_MODULES.standard);

    await Promise.all(
      ALL_MODULE_KEYS.map((key) =>
        this.prisma.tenantModule.upsert({
          where:  { tenantId_moduleKey: { tenantId, moduleKey: key } },
          update: {},
          create: { tenantId, moduleKey: key, enabled: enabledKeys.has(key) },
        }),
      ),
    );
  }

  // ── List only enabled module keys (for JWT injection future use) ──────────────
  async getEnabledKeys(tenantId: string): Promise<TenantModuleKey[]> {
    const modules = await this.prisma.tenantModule.findMany({
      where: { tenantId, enabled: true },
      select: { moduleKey: true },
    });
    return modules.map((m) => m.moduleKey as TenantModuleKey);
  }
}
