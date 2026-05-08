import { Test, TestingModule } from '@nestjs/testing';

import { NotificationService } from './notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';
import { EmailService } from './email.service';
import type { CreateNotificationDto, MarkReadDto, NotificationQuery } from './dto/notification.dto';

// ─── Mock types ───────────────────────────────────────────────────────────────

type MockPrismaService = {
  notification: {
    create:     jest.Mock;
    findMany:   jest.Mock;
    count:      jest.Mock;
    findFirst:  jest.Mock;
    updateMany: jest.Mock;
  };
};

type MockNotificationGateway = {
  emitToUser: jest.Mock;
};

type MockEmailService = {
  buildNcCreatedEmail:      jest.Mock;
  buildReportValidatedEmail: jest.Mock;
  sendMail:                 jest.Mock;
};

const buildPrismaMock = (): MockPrismaService => ({
  notification: {
    create:     jest.fn(),
    findMany:   jest.fn(),
    count:      jest.fn(),
    findFirst:  jest.fn(),
    updateMany: jest.fn(),
  },
});

const buildGatewayMock = (): MockNotificationGateway => ({
  emitToUser: jest.fn(),
});

const buildEmailMock = (): MockEmailService => ({
  buildNcCreatedEmail:       jest.fn().mockReturnValue('<html>nc</html>'),
  buildReportValidatedEmail: jest.fn().mockReturnValue('<html>report</html>'),
  sendMail:                  jest.fn().mockResolvedValue(undefined),
});

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const TENANT_A = 'tenant-aaa';
const TENANT_B = 'tenant-bbb';
const USER_ID  = 'user-001';

const baseNotification = {
  id:        'notif-001',
  userId:    USER_ID,
  tenantId:  TENANT_A,
  type:      'INFO',
  title:     'Test notification',
  body:      'Something happened',
  isRead:    false,
  link:      '/dashboard',
  createdAt: new Date('2024-06-01T10:00:00Z'),
};

const defaultQuery: NotificationQuery = { page: 1, limit: 10, isRead: undefined };

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma:  MockPrismaService;
  let gateway: MockNotificationGateway;
  let emailService: MockEmailService;

  beforeEach(async () => {
    prisma       = buildPrismaMock();
    gateway      = buildGatewayMock();
    emailService = buildEmailMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService,       useValue: prisma },
        { provide: NotificationGateway, useValue: gateway },
        { provide: EmailService,        useValue: emailService },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('persists the notification and returns ApiResponse on success', async () => {
      const dto: CreateNotificationDto = {
        userId: USER_ID,
        type:   'INFO',
        title:  'Hello',
        body:   'World',
        link:   '/somewhere',
      };

      prisma.notification.create.mockResolvedValue({ ...baseNotification, ...dto });

      const result = await service.create(dto, TENANT_A);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { ...dto, tenantId: TENANT_A },
      });
      expect(result.data).toMatchObject({ userId: USER_ID });
      expect(result.message).toBe('Notification sent');
    });

    it('pushes a real-time event to the target user via the gateway', async () => {
      const dto: CreateNotificationDto = {
        userId: USER_ID,
        type:   'INFO',
        title:  'Real-time test',
        body:   'Should emit',
        link:   '/',
      };

      prisma.notification.create.mockResolvedValue(baseNotification);

      await service.create(dto, TENANT_A);

      expect(gateway.emitToUser).toHaveBeenCalledWith(
        USER_ID,
        'notification:new',
        expect.objectContaining({ id: 'notif-001' }),
      );
    });

    it('sends an email for NC_CREATED notification type', async () => {
      const dto: CreateNotificationDto = {
        userId: USER_ID,
        type:   'NC_CREATED',
        title:  'New NC raised',
        body:   'Non-conformity detected',
        link:   '/nc/123',
        // Cast allows passing extra fields that the email helper reads
        ...({ email: 'manager@acme.com', meta: { recipientName: 'Manager', ncId: '123', severity: 'HIGH', category: 'HYGIENE' } } as Record<string, unknown>),
      } as CreateNotificationDto;

      prisma.notification.create.mockResolvedValue({ ...baseNotification, type: 'NC_CREATED' });
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.create(dto, TENANT_A);

      // Email is fire-and-forget; give micro-task queue a tick
      await Promise.resolve();

      expect(emailService.buildNcCreatedEmail).toHaveBeenCalled();
      expect(emailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'manager@acme.com', subject: 'New NC raised' }),
      );
    });

    it('does NOT send an email for non-trigger notification types', async () => {
      const dto: CreateNotificationDto = {
        userId: USER_ID,
        type:   'INFO',
        title:  'FYI',
        body:   'Just letting you know',
        link:   '/',
      };

      prisma.notification.create.mockResolvedValue(baseNotification);

      await service.create(dto, TENANT_A);
      await Promise.resolve();

      expect(emailService.sendMail).not.toHaveBeenCalled();
    });

    it('attaches tenantId from the parameter — never from the DTO', async () => {
      const dto: CreateNotificationDto = {
        userId: USER_ID,
        type:   'INFO',
        title:  'Isolation test',
        body:   'body',
        link:   '/',
      };

      prisma.notification.create.mockResolvedValue(baseNotification);

      await service.create(dto, TENANT_B);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: TENANT_B }),
      });
    });
  });

  // ─── findForUser ────────────────────────────────────────────────────────────

  describe('findForUser', () => {
    it('returns paginated notifications for the correct user and tenant', async () => {
      prisma.notification.findMany.mockResolvedValue([baseNotification]);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.findForUser(USER_ID, TENANT_A, defaultQuery);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID, tenantId: TENANT_A }),
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta?.total).toBe(1);
    });

    it('filters by isRead when the query param is provided', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.findForUser(USER_ID, TENANT_A, { ...defaultQuery, isRead: 'false' });

      const where = prisma.notification.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where['isRead']).toBe(false);
    });

    it('scopes query to tenantId — tenant isolation enforced', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.findForUser(USER_ID, TENANT_B, defaultQuery);

      const where = prisma.notification.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where['tenantId']).toBe(TENANT_B);
    });
  });

  // ─── markRead ───────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('calls updateMany with the given ids scoped to the tenant', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 2 });

      const dto: MarkReadDto = { ids: ['notif-001', 'notif-002'] };
      const result = await service.markRead(dto, TENANT_A);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: { in: dto.ids }, tenantId: TENANT_A },
        data:  { isRead: true },
      });
      expect(result.message).toBe('Marked as read');
    });

    it('does not update notifications belonging to a different tenant', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const dto: MarkReadDto = { ids: ['notif-001'] };
      await service.markRead(dto, TENANT_B);

      const calledWhere = prisma.notification.updateMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(calledWhere['tenantId']).toBe(TENANT_B);
    });
  });

  // ─── countUnread ────────────────────────────────────────────────────────────

  describe('countUnread', () => {
    it('returns the unread count for the user within the tenant', async () => {
      prisma.notification.count.mockResolvedValue(7);

      const result = await service.countUnread(USER_ID, TENANT_A);

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: USER_ID, tenantId: TENANT_A, isRead: false },
      });
      expect(result.data).toEqual({ count: 7 });
    });

    it('returns zero when there are no unread notifications', async () => {
      prisma.notification.count.mockResolvedValue(0);

      const result = await service.countUnread(USER_ID, TENANT_A);

      expect(result.data).toEqual({ count: 0 });
    });

    it('enforces tenant isolation — count query always includes tenantId', async () => {
      prisma.notification.count.mockResolvedValue(3);

      await service.countUnread(USER_ID, TENANT_B);

      const calledWhere = prisma.notification.count.mock.calls[0][0].where as Record<string, unknown>;
      expect(calledWhere['tenantId']).toBe(TENANT_B);
    });
  });
});
