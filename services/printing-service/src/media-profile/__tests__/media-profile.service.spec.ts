import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MediaProfileService } from '../media-profile.service';
import { PrismaService } from '../../prisma/prisma.service';

const TENANT = 'cltenant00000000000000000001';

const mockProfile = {
  id:            'clmp0000000000000000000001',
  tenantId:      TENANT,
  name:          '50 x 29 mm GAP',
  widthMm:       50,
  heightMm:      29,
  mediaType:     'GAP',
  gapMm:         2,
  blackMarkMm:   null,
  dpi:           203,
  speed:         null,
  density:       null,
  autoCalibrate: true,
  isDefault:     false,
  isActive:      true,
  createdAt:     new Date('2026-06-01'),
  updatedAt:     new Date('2026-06-01'),
};

const prismaMock = {
  mediaProfile: {
    findMany:   jest.fn(),
    findFirst:  jest.fn(),
    count:      jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    updateMany: jest.fn(),
    delete:     jest.fn(),
  },
};

describe('MediaProfileService', () => {
  let service: MediaProfileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaProfileService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get<MediaProfileService>(MediaProfileService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a media profile wrapped in ApiResponse', async () => {
      prismaMock.mediaProfile.create.mockResolvedValue(mockProfile);

      const result = await service.create(
        {
          name: '50 x 29 mm GAP', widthMm: 50, heightMm: 29, mediaType: 'GAP',
          gapMm: 2, dpi: 203, autoCalibrate: true, isDefault: false,
        },
        TENANT,
      );

      expect(prismaMock.mediaProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT, name: '50 x 29 mm GAP' }) }),
      );
      expect(result.data).toEqual(mockProfile);
    });

    it('demotes other defaults when isDefault=true', async () => {
      prismaMock.mediaProfile.create.mockResolvedValue({ ...mockProfile, isDefault: true });
      prismaMock.mediaProfile.updateMany.mockResolvedValue({ count: 1 });

      await service.create(
        { name: 'X', widthMm: 50, heightMm: 100, mediaType: 'GAP', dpi: 203, autoCalibrate: true, isDefault: true },
        TENANT,
      );

      expect(prismaMock.mediaProfile.updateMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, isDefault: true },
        data:  { isDefault: false },
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the profile does not exist for the tenant', async () => {
      prismaMock.mediaProfile.findFirst.mockResolvedValue(null);
      await expect(service.findOne('missing', TENANT)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('scopes the lookup by id AND tenantId', async () => {
      prismaMock.mediaProfile.findFirst.mockResolvedValue(mockProfile);
      await service.findOne(mockProfile.id, TENANT);
      expect(prismaMock.mediaProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockProfile.id, tenantId: TENANT } }),
      );
    });
  });

  describe('findDefault', () => {
    it('queries the active default profile for the tenant', async () => {
      prismaMock.mediaProfile.findFirst.mockResolvedValue(mockProfile);
      await service.findDefault(TENANT);
      expect(prismaMock.mediaProfile.findFirst).toHaveBeenCalledWith({
        where: { tenantId: TENANT, isDefault: true, isActive: true },
      });
    });
  });
});
