import { Test, TestingModule } from '@nestjs/testing';

import { DeviceService } from './device.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrismaMock() {
  return {
    pushDevice: {
      upsert:     jest.fn(),
      deleteMany: jest.fn(),
      findMany:   jest.fn(),
    },
  };
}

const TENANT = 'tenant-1';

describe('DeviceService', () => {
  let service: DeviceService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeviceService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DeviceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('register upserts keyed on the push token with tenant/user/role from the JWT', async () => {
    prisma.pushDevice.upsert.mockResolvedValue({ id: 'd1' });

    await service.register(TENANT, 'user-1', 'MANAGER', { expoPushToken: 'ExponentPushToken[abc]', platform: 'ios' });

    expect(prisma.pushDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { expoPushToken: 'ExponentPushToken[abc]' },
        create: expect.objectContaining({ tenantId: TENANT, userId: 'user-1', role: 'MANAGER', platform: 'ios' }),
        update: expect.objectContaining({ tenantId: TENANT, userId: 'user-1', role: 'MANAGER', platform: 'ios' }),
      }),
    );
  });

  it('unregister deletes scoped to the tenant + token and reports the count', async () => {
    prisma.pushDevice.deleteMany.mockResolvedValue({ count: 1 });

    const res = await service.unregister(TENANT, 'ExponentPushToken[abc]');

    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, expoPushToken: 'ExponentPushToken[abc]' },
    });
    expect(res).toEqual({ removed: 1 });
  });

  it('tokensForUser returns the token strings scoped to tenant + user', async () => {
    prisma.pushDevice.findMany.mockResolvedValue([{ expoPushToken: 't1' }, { expoPushToken: 't2' }]);

    const tokens = await service.tokensForUser(TENANT, 'user-1');

    expect(prisma.pushDevice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, userId: 'user-1' } }),
    );
    expect(tokens).toEqual(['t1', 't2']);
  });

  it('tokensForRoles filters by tenant + role IN list', async () => {
    prisma.pushDevice.findMany.mockResolvedValue([{ expoPushToken: 't1' }]);

    const tokens = await service.tokensForRoles(TENANT, ['ADMIN', 'MANAGER']);

    expect(prisma.pushDevice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, role: { in: ['ADMIN', 'MANAGER'] } } }),
    );
    expect(tokens).toEqual(['t1']);
  });

  it('purgeTokens is a no-op for an empty list', async () => {
    await service.purgeTokens([]);
    expect(prisma.pushDevice.deleteMany).not.toHaveBeenCalled();
  });

  it('purgeTokens deletes the given tokens', async () => {
    prisma.pushDevice.deleteMany.mockResolvedValue({ count: 2 });
    await service.purgeTokens(['t1', 't2']);
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { expoPushToken: { in: ['t1', 't2'] } } });
  });
});
