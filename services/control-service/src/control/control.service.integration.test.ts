/**
 * Integration tests for ControlService against a real PostgreSQL database.
 *
 * Requires Docker to be running — Testcontainers spins up a postgres:15-alpine
 * container, runs Prisma migrations, then tears everything down in afterAll.
 *
 * Run: pnpm --filter @haccp/control-service test:integration
 */

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient, ControlType, TaskStatus } from '@prisma/client';
import { execSync } from 'child_process';
import * as path from 'path';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Minimal checklist JSON that satisfies the schema's Json field */
const CHECKLIST_JSON = [{ id: '1', label: 'Check temperature', required: true }];

const TENANT_A = 'tenant-a-id';
const TENANT_B = 'tenant-b-id';
const ZONE_ID  = 'zone-001';
const USER_ID  = 'user-001';

/** Returns a Date at today midnight + offsetMs */
function todayAt(offsetMs = 0): Date {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return new Date(startOfDay.getTime() + offsetMs);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ControlService (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  // ── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('haccp_controls_test')
      .withUsername('postgres')
      .withPassword('testpass')
      .start();

    const databaseUrl = container.getConnectionUri();
    process.env['DATABASE_URL'] = databaseUrl;

    // Run migrations against the test container
    execSync('pnpm exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      // cwd must be the service root so Prisma finds ./prisma/schema.prisma
      cwd: path.resolve(__dirname, '../../'),
      stdio: 'pipe',
    });

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  /** Truncate all public tables between tests to guarantee isolation */
  afterEach(async () => {
    // Tasks reference templates — truncate tasks first, then templates
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "control_tasks" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "control_templates" CASCADE');
  });

  // ── Template Tests ─────────────────────────────────────────────────────────

  describe('Templates', () => {
    it('1. creates a template scoped to a tenantId', async () => {
      const template = await prisma.controlTemplate.create({
        data: {
          name:          'Réception viande',
          type:          ControlType.RECEPTION,
          checklistJson: CHECKLIST_JSON,
          frequency:     'ON_RECEIPT',
          tenantId:      TENANT_A,
        },
      });

      expect(template.id).toBeDefined();
      expect(template.name).toBe('Réception viande');
      expect(template.type).toBe(ControlType.RECEPTION);
      expect(template.tenantId).toBe(TENANT_A);
    });

    it('2. creates a system template with tenantId = null', async () => {
      const template = await prisma.controlTemplate.create({
        data: {
          name:          'Contrôle températures (système)',
          type:          ControlType.TEMPERATURE_STOCK,
          checklistJson: CHECKLIST_JSON,
          tenantId:      null,
        },
      });

      expect(template.tenantId).toBeNull();
    });

    it('3. OR clause returns both tenant-specific AND null-tenantId templates', async () => {
      // System-level template (visible to everyone)
      await prisma.controlTemplate.create({
        data: {
          name: 'Système global', type: ControlType.SANITARY,
          checklistJson: CHECKLIST_JSON, tenantId: null,
        },
      });
      // Tenant A's own template
      await prisma.controlTemplate.create({
        data: {
          name: 'Tenant A propre', type: ControlType.EQUIPMENT,
          checklistJson: CHECKLIST_JSON, tenantId: TENANT_A,
        },
      });

      const results = await prisma.controlTemplate.findMany({
        where: { OR: [{ tenantId: TENANT_A }, { tenantId: null }] },
      });

      expect(results).toHaveLength(2);
      const names = results.map((t) => t.name);
      expect(names).toContain('Système global');
      expect(names).toContain('Tenant A propre');
    });

    it('4. cross-tenant isolation — Tenant B cannot see Tenant A templates', async () => {
      await prisma.controlTemplate.create({
        data: {
          name: 'Secret A', type: ControlType.DAILY_PRODUCTION,
          checklistJson: CHECKLIST_JSON, tenantId: TENANT_A,
        },
      });

      // Tenant B query (no system templates seeded, so result should be empty)
      const results = await prisma.controlTemplate.findMany({
        where: { OR: [{ tenantId: TENANT_B }, { tenantId: null }] },
      });

      // The TENANT_A template must not appear for TENANT_B
      const tenantATemplates = results.filter((t) => t.tenantId === TENANT_A);
      expect(tenantATemplates).toHaveLength(0);
    });

    it('5. filters templates by type', async () => {
      await prisma.controlTemplate.create({
        data: { name: 'Réception 1', type: ControlType.RECEPTION, checklistJson: CHECKLIST_JSON, tenantId: TENANT_A },
      });
      await prisma.controlTemplate.create({
        data: { name: 'Température stock', type: ControlType.TEMPERATURE_STOCK, checklistJson: CHECKLIST_JSON, tenantId: TENANT_A },
      });

      const results = await prisma.controlTemplate.findMany({
        where: {
          OR: [{ tenantId: TENANT_A }, { tenantId: null }],
          type: ControlType.RECEPTION,
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe(ControlType.RECEPTION);
    });

    it('6. updates a template name', async () => {
      const created = await prisma.controlTemplate.create({
        data: {
          name: 'Ancien nom', type: ControlType.EQUIPMENT,
          checklistJson: CHECKLIST_JSON, tenantId: TENANT_A,
        },
      });

      const updated = await prisma.controlTemplate.update({
        where: { id: created.id },
        data:  { name: 'Nouveau nom' },
      });

      expect(updated.name).toBe('Nouveau nom');
      expect(updated.id).toBe(created.id);
    });

    it('7. deleting a template cascades and removes its tasks', async () => {
      const template = await prisma.controlTemplate.create({
        data: {
          name: 'À supprimer', type: ControlType.SANITARY,
          checklistJson: CHECKLIST_JSON, tenantId: TENANT_A,
        },
      });

      // Create a task linked to that template
      await prisma.controlTask.create({
        data: {
          templateId:  template.id,
          zoneId:      ZONE_ID,
          assigneeId:  USER_ID,
          tenantId:    TENANT_A,
          scheduledAt: todayAt(3_600_000),
          status:      TaskStatus.PLANNED,
        },
      });

      // Deleting the template should cascade-delete the task (FK ON DELETE CASCADE)
      await prisma.controlTemplate.delete({ where: { id: template.id } });

      const remainingTasks = await prisma.controlTask.findMany({
        where: { templateId: template.id },
      });
      expect(remainingTasks).toHaveLength(0);
    });
  });

  // ── Task Tests ─────────────────────────────────────────────────────────────

  describe('Tasks', () => {
    /** Seed a template so tasks have a valid templateId FK */
    async function seedTemplate(tenantId: string | null = TENANT_A) {
      return prisma.controlTemplate.create({
        data: {
          name: 'Template de test', type: ControlType.TEMPERATURE_DISPLAY,
          checklistJson: CHECKLIST_JSON, tenantId,
        },
      });
    }

    it('8. creates a task linked to a template', async () => {
      const template = await seedTemplate();

      const task = await prisma.controlTask.create({
        data: {
          templateId:  template.id,
          zoneId:      ZONE_ID,
          assigneeId:  USER_ID,
          tenantId:    TENANT_A,
          scheduledAt: todayAt(3_600_000),
          status:      TaskStatus.PLANNED,
        },
        include: { template: { select: { id: true, name: true, type: true } } },
      });

      expect(task.id).toBeDefined();
      expect(task.templateId).toBe(template.id);
      expect(task.template.name).toBe('Template de test');
    });

    it('9. task status defaults to PLANNED', async () => {
      const template = await seedTemplate();

      // Create without providing a status — Prisma schema has @default(PLANNED)
      const task = await prisma.controlTask.create({
        data: {
          templateId:  template.id,
          zoneId:      ZONE_ID,
          assigneeId:  USER_ID,
          tenantId:    TENANT_A,
          scheduledAt: todayAt(7_200_000),
        },
      });

      expect(task.status).toBe(TaskStatus.PLANNED);
    });

    it('10. updates task status to COMPLETED', async () => {
      const template = await seedTemplate();
      const task = await prisma.controlTask.create({
        data: {
          templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID,
          tenantId: TENANT_A, scheduledAt: todayAt(1_800_000), status: TaskStatus.PLANNED,
        },
      });

      const updated = await prisma.controlTask.update({
        where: { id: task.id },
        data:  { status: TaskStatus.COMPLETED, completedAt: new Date() },
      });

      expect(updated.status).toBe(TaskStatus.COMPLETED);
      expect(updated.completedAt).not.toBeNull();
    });

    it('11. filters tasks by tenantId (cross-tenant isolation)', async () => {
      const templateA = await seedTemplate(TENANT_A);
      const templateB = await seedTemplate(TENANT_B);

      await prisma.controlTask.create({
        data: {
          templateId: templateA.id, zoneId: ZONE_ID, assigneeId: USER_ID,
          tenantId: TENANT_A, scheduledAt: todayAt(), status: TaskStatus.PLANNED,
        },
      });
      await prisma.controlTask.create({
        data: {
          templateId: templateB.id, zoneId: ZONE_ID, assigneeId: USER_ID,
          tenantId: TENANT_B, scheduledAt: todayAt(), status: TaskStatus.PLANNED,
        },
      });

      const tenantATasks = await prisma.controlTask.findMany({ where: { tenantId: TENANT_A } });
      const tenantBTasks = await prisma.controlTask.findMany({ where: { tenantId: TENANT_B } });

      expect(tenantATasks).toHaveLength(1);
      expect(tenantBTasks).toHaveLength(1);
      expect(tenantATasks[0]!.tenantId).toBe(TENANT_A);
      expect(tenantBTasks[0]!.tenantId).toBe(TENANT_B);
    });

    it('12. filters tasks by status', async () => {
      const template = await seedTemplate();

      await prisma.controlTask.createMany({
        data: [
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(), status: TaskStatus.PLANNED },
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(), status: TaskStatus.COMPLETED },
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(), status: TaskStatus.OVERDUE },
        ],
      });

      const planned = await prisma.controlTask.findMany({
        where: { tenantId: TENANT_A, status: TaskStatus.PLANNED },
      });
      expect(planned).toHaveLength(1);
      expect(planned[0]!.status).toBe(TaskStatus.PLANNED);
    });

    it('13. filters tasks by assigneeId', async () => {
      const template = await seedTemplate();
      const OTHER_USER = 'user-002';

      await prisma.controlTask.createMany({
        data: [
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID,    tenantId: TENANT_A, scheduledAt: todayAt(), status: TaskStatus.PLANNED },
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: OTHER_USER, tenantId: TENANT_A, scheduledAt: todayAt(), status: TaskStatus.PLANNED },
        ],
      });

      const myTasks = await prisma.controlTask.findMany({
        where: { tenantId: TENANT_A, assigneeId: USER_ID },
      });

      expect(myTasks).toHaveLength(1);
      expect(myTasks[0]!.assigneeId).toBe(USER_ID);
    });

    it('14. date range filter: scheduledAt between from and to', async () => {
      const template = await seedTemplate();

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      await prisma.controlTask.createMany({
        data: [
          // Within range
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(3_600_000), status: TaskStatus.PLANNED },
          // Before range
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: yesterday, status: TaskStatus.PLANNED },
          // After range
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: nextWeek, status: TaskStatus.PLANNED },
        ],
      });

      const results = await prisma.controlTask.findMany({
        where: {
          tenantId: TENANT_A,
          scheduledAt: { gte: todayAt(), lte: tomorrow },
        },
      });

      expect(results).toHaveLength(1);
    });

    it('15. counts tasks for stats (todayTotal, todayCompleted pattern)', async () => {
      const template = await seedTemplate();

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      await prisma.controlTask.createMany({
        data: [
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(3_600_000),  status: TaskStatus.PLANNED },
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(7_200_000),  status: TaskStatus.COMPLETED },
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(10_800_000), status: TaskStatus.COMPLETED },
        ],
      });

      const todayWhere = {
        tenantId: TENANT_A,
        scheduledAt: { gte: startOfDay, lte: endOfDay },
      };

      const todayTotal     = await prisma.controlTask.count({ where: todayWhere });
      const todayCompleted = await prisma.controlTask.count({ where: { ...todayWhere, status: TaskStatus.COMPLETED } });

      expect(todayTotal).toBe(3);
      expect(todayCompleted).toBe(2);
    });
  });

  // ── Stats / complianceRate Tests ───────────────────────────────────────────

  describe('Stats — complianceRate', () => {
    /** Replicates the getStats logic from ControlService */
    async function getComplianceRate(tenantId: string): Promise<number> {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const todayWhere = { tenantId, scheduledAt: { gte: startOfDay, lte: endOfDay } };

      const [todayTotal, todayCompleted] = await Promise.all([
        prisma.controlTask.count({ where: todayWhere }),
        prisma.controlTask.count({ where: { ...todayWhere, status: TaskStatus.COMPLETED } }),
      ]);

      return todayTotal === 0
        ? 100
        : Math.round((todayCompleted / todayTotal) * 100);
    }

    it('16. complianceRate = 100 when todayTotal = 0 (no tasks scheduled today)', async () => {
      // No tasks seeded — todayTotal will be 0
      const rate = await getComplianceRate(TENANT_A);
      expect(rate).toBe(100);
    });

    it('17. complianceRate = Math.round((completed/total)*100) for non-zero totals', async () => {
      const template = await prisma.controlTemplate.create({
        data: {
          name: 'Stats template', type: ControlType.TEMPERATURE_OIL,
          checklistJson: CHECKLIST_JSON, tenantId: TENANT_A,
        },
      });

      // 2 out of 3 tasks completed → 66.67 → rounds to 67
      await prisma.controlTask.createMany({
        data: [
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(1_000_000), status: TaskStatus.COMPLETED },
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(2_000_000), status: TaskStatus.COMPLETED },
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(3_000_000), status: TaskStatus.PLANNED },
        ],
      });

      const rate = await getComplianceRate(TENANT_A);
      expect(rate).toBe(Math.round((2 / 3) * 100)); // 67
    });

    it('17b. complianceRate = 100 when all tasks are completed', async () => {
      const template = await prisma.controlTemplate.create({
        data: {
          name: 'Full compliance template', type: ControlType.SANITARY,
          checklistJson: CHECKLIST_JSON, tenantId: TENANT_A,
        },
      });

      await prisma.controlTask.createMany({
        data: [
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(1_000_000), status: TaskStatus.COMPLETED },
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(2_000_000), status: TaskStatus.COMPLETED },
        ],
      });

      const rate = await getComplianceRate(TENANT_A);
      expect(rate).toBe(100);
    });

    it('17c. complianceRate = 0 when no tasks are completed', async () => {
      const template = await prisma.controlTemplate.create({
        data: {
          name: 'Zero compliance template', type: ControlType.TEMPERATURE_DISPLAY,
          checklistJson: CHECKLIST_JSON, tenantId: TENANT_A,
        },
      });

      await prisma.controlTask.createMany({
        data: [
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(1_000_000), status: TaskStatus.PLANNED },
          { templateId: template.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(2_000_000), status: TaskStatus.OVERDUE },
        ],
      });

      const rate = await getComplianceRate(TENANT_A);
      expect(rate).toBe(0);
    });

    it('complianceRate is scoped per tenant (no cross-tenant bleed)', async () => {
      const templateA = await prisma.controlTemplate.create({
        data: { name: 'TA', type: ControlType.EQUIPMENT, checklistJson: CHECKLIST_JSON, tenantId: TENANT_A },
      });
      const templateB = await prisma.controlTemplate.create({
        data: { name: 'TB', type: ControlType.EQUIPMENT, checklistJson: CHECKLIST_JSON, tenantId: TENANT_B },
      });

      // Tenant A — all planned (0% compliance)
      await prisma.controlTask.createMany({
        data: [
          { templateId: templateA.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(1_000_000), status: TaskStatus.PLANNED },
          { templateId: templateA.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: todayAt(2_000_000), status: TaskStatus.PLANNED },
        ],
      });

      // Tenant B — all completed (100% compliance)
      await prisma.controlTask.createMany({
        data: [
          { templateId: templateB.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_B, scheduledAt: todayAt(1_000_000), status: TaskStatus.COMPLETED },
          { templateId: templateB.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_B, scheduledAt: todayAt(2_000_000), status: TaskStatus.COMPLETED },
        ],
      });

      const rateA = await getComplianceRate(TENANT_A);
      const rateB = await getComplianceRate(TENANT_B);

      expect(rateA).toBe(0);
      expect(rateB).toBe(100);
    });
  });

  // ── openOverdue test ───────────────────────────────────────────────────────

  describe('openOverdue count', () => {
    it('counts only OVERDUE tasks for the correct tenant', async () => {
      const templateA = await prisma.controlTemplate.create({
        data: { name: 'Overdue TA', type: ControlType.SANITARY, checklistJson: CHECKLIST_JSON, tenantId: TENANT_A },
      });
      const templateB = await prisma.controlTemplate.create({
        data: { name: 'Overdue TB', type: ControlType.SANITARY, checklistJson: CHECKLIST_JSON, tenantId: TENANT_B },
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await prisma.controlTask.createMany({
        data: [
          // Tenant A — 2 overdue
          { templateId: templateA.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: yesterday, status: TaskStatus.OVERDUE },
          { templateId: templateA.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: yesterday, status: TaskStatus.OVERDUE },
          { templateId: templateA.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_A, scheduledAt: yesterday, status: TaskStatus.COMPLETED },
          // Tenant B — 1 overdue (must not bleed into Tenant A count)
          { templateId: templateB.id, zoneId: ZONE_ID, assigneeId: USER_ID, tenantId: TENANT_B, scheduledAt: yesterday, status: TaskStatus.OVERDUE },
        ],
      });

      const openOverdue = await prisma.controlTask.count({
        where: { tenantId: TENANT_A, status: TaskStatus.OVERDUE },
      });

      expect(openOverdue).toBe(2);
    });
  });
});
