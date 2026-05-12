/**
 * Unit tests for asset-service: ProductService, SupplierService, EquipmentService.
 * Each service is tested in its own describe block with a dedicated Prisma mock.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { ProductService } from '../product/product.service';
import { SupplierService } from '../supplier/supplier.service';
import { EquipmentService } from '../equipment/equipment.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-aaa';
const TENANT_B = 'tenant-bbb';

function makePrismaMock() {
  return {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    supplier: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    equipment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// ProductService
// ---------------------------------------------------------------------------

describe('ProductService', () => {
  let service: ProductService;
  let prisma: ReturnType<typeof makePrismaMock>;

  const baseProduct = {
    id: 'prod-1',
    code: 'PROD-001',
    name: 'Poulet fermier',
    category: 'Viande',
    packaging: null,
    dlcDays: 5,
    tempStorage: 4,
    supplierId: null,
    tenantId: TENANT_A,
    isActive: true,
    createdAt: new Date(),
    supplier: null,
  };

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('findAll — scopes query to the caller tenantId', async () => {
    prisma.product.findMany.mockResolvedValue([baseProduct]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_A, { page: 1, limit: 20 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
    expect(result.data).toHaveLength(1);
  });

  it('findAll — does NOT return products from a different tenant', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    const result = await service.findAll(TENANT_B, { page: 1, limit: 20 });

    const where = prisma.product.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT_B);
    expect(where.tenantId).not.toBe(TENANT_A);
    expect(result.data).toHaveLength(0);
  });

  it('findAll — returns pagination meta', async () => {
    prisma.product.findMany.mockResolvedValue([baseProduct]);
    prisma.product.count.mockResolvedValue(42);

    const result = await service.findAll(TENANT_A, { page: 2, limit: 10 });

    expect(result.meta).toMatchObject({ total: 42, page: 2, limit: 10 });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  it('findOne — returns the product when it belongs to the tenant', async () => {
    prisma.product.findFirst.mockResolvedValue(baseProduct);

    const result = await service.findOne('prod-1', TENANT_A);

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prod-1', tenantId: TENANT_A } }),
    );
    expect(result.data).toMatchObject({ id: 'prod-1' });
  });

  it('findOne — throws NotFoundException when product does not exist in tenant', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.findOne('ghost-id', TENANT_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  it('create — persists the product with the caller tenantId', async () => {
    prisma.product.findFirst.mockResolvedValue(null); // no duplicate
    prisma.product.create.mockResolvedValue(baseProduct);

    const dto = { code: 'PROD-001', name: 'Poulet fermier', category: 'Viande' };
    const result = await service.create(dto, TENANT_A);

    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT_A }),
      }),
    );
    expect(result.message).toBe('Produit créé');
  });

  it('create — throws ConflictException when code already exists for tenant', async () => {
    prisma.product.findFirst.mockResolvedValue(baseProduct); // duplicate found

    const dto = { code: 'PROD-001', name: 'Doublon', category: 'Viande' };
    await expect(service.create(dto, TENANT_A)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  // ─── update ───────────────────────────────────────────────────────────────

  it('update — patches only the provided fields', async () => {
    prisma.product.findFirst.mockResolvedValue(baseProduct); // findOne check
    const updated = { ...baseProduct, name: 'Poulet Label Rouge' };
    prisma.product.update.mockResolvedValue(updated);

    const result = await service.update('prod-1', { name: 'Poulet Label Rouge' }, TENANT_A);

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prod-1' }, data: { name: 'Poulet Label Rouge' } }),
    );
    expect(result.data).toMatchObject({ name: 'Poulet Label Rouge' });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  it('remove — soft-deletes by setting isActive=false', async () => {
    prisma.product.findFirst.mockResolvedValue(baseProduct);
    prisma.product.update.mockResolvedValue({ ...baseProduct, isActive: false });

    const result = await service.remove('prod-1', TENANT_A);

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { isActive: false },
    });
    expect(result.message).toBe('Produit désactivé');
  });

  it('remove — throws NotFoundException if product not found', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.remove('ghost-id', TENANT_A)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  // ─── findCategories ───────────────────────────────────────────────────────

  it('findCategories — returns distinct category strings scoped to tenant', async () => {
    prisma.product.findMany.mockResolvedValue([
      { category: 'Viande' },
      { category: 'Légumes' },
    ]);

    const categories = await service.findCategories(TENANT_A);

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_A, isActive: true } }),
    );
    expect(categories).toEqual(['Viande', 'Légumes']);
  });
});

// ---------------------------------------------------------------------------
// SupplierService
// ---------------------------------------------------------------------------

describe('SupplierService', () => {
  let service: SupplierService;
  let prisma: ReturnType<typeof makePrismaMock>;

  const baseSupplier = {
    id: 'sup-1',
    code: 'SUP-001',
    name: 'Fermier du Sud',
    vat: null,
    phone: null,
    email: 'contact@fermier.fr',
    address: null,
    tenantId: TENANT_A,
    isActive: true,
    createdAt: new Date(),
    products: [],
    _count: { products: 0 },
  };

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SupplierService>(SupplierService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('findAll — scopes query to the caller tenantId', async () => {
    prisma.supplier.findMany.mockResolvedValue([baseSupplier]);
    prisma.supplier.count.mockResolvedValue(1);

    await service.findAll(TENANT_A, { page: 1, limit: 20 });

    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  it('findAll — does NOT mix results across tenants', async () => {
    prisma.supplier.findMany.mockResolvedValue([]);
    prisma.supplier.count.mockResolvedValue(0);

    await service.findAll(TENANT_B, { page: 1, limit: 20 });

    const where = prisma.supplier.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT_B);
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  it('findOne — returns supplier with active products list', async () => {
    prisma.supplier.findFirst.mockResolvedValue(baseSupplier);

    const result = await service.findOne('sup-1', TENANT_A);

    expect(result.data).toMatchObject({ id: 'sup-1', tenantId: TENANT_A });
  });

  it('findOne — throws NotFoundException for unknown id', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);

    await expect(service.findOne('ghost', TENANT_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  it('create — attaches tenantId to the new supplier', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    prisma.supplier.create.mockResolvedValue(baseSupplier);

    const dto = { code: 'SUP-001', name: 'Fermier du Sud' };
    const result = await service.create(dto, TENANT_A);

    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
    expect(result.message).toBe('Fournisseur créé');
  });

  it('create — throws ConflictException on duplicate code within same tenant', async () => {
    prisma.supplier.findFirst.mockResolvedValue(baseSupplier);

    await expect(service.create({ code: 'SUP-001', name: 'Autre' }, TENANT_A))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.supplier.create).not.toHaveBeenCalled();
  });

  // ─── update ───────────────────────────────────────────────────────────────

  it('update — verifies ownership before patching', async () => {
    prisma.supplier.findFirst.mockResolvedValue(baseSupplier);
    prisma.supplier.update.mockResolvedValue({ ...baseSupplier, phone: '0600000000' });

    const result = await service.update('sup-1', { phone: '0600000000' }, TENANT_A);

    expect(prisma.supplier.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sup-1', tenantId: TENANT_A } }),
    );
    expect(result.data).toMatchObject({ phone: '0600000000' });
  });

  // ─── remove — hard delete when no linked products ─────────────────────────

  it('remove — hard-deletes when no active products are linked', async () => {
    prisma.supplier.findFirst.mockResolvedValue(baseSupplier);
    prisma.product.count.mockResolvedValue(0); // no linked products
    prisma.supplier.delete.mockResolvedValue(baseSupplier);

    const result = await service.remove('sup-1', TENANT_A);

    expect(prisma.supplier.delete).toHaveBeenCalledWith({ where: { id: 'sup-1' } });
    expect(result.message).toBe('Fournisseur supprimé');
  });

  it('remove — soft-deletes when active products are linked', async () => {
    prisma.supplier.findFirst.mockResolvedValue(baseSupplier);
    prisma.product.count.mockResolvedValue(3); // linked products exist
    prisma.supplier.update.mockResolvedValue({ ...baseSupplier, isActive: false });

    const result = await service.remove('sup-1', TENANT_A);

    expect(prisma.supplier.update).toHaveBeenCalledWith({
      where: { id: 'sup-1' },
      data: { isActive: false },
    });
    expect(prisma.supplier.delete).not.toHaveBeenCalled();
    expect(result.message).toContain('désactivé');
  });

  it('remove — throws NotFoundException if supplier not found', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);

    await expect(service.remove('ghost', TENANT_A)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// EquipmentService
// ---------------------------------------------------------------------------

describe('EquipmentService', () => {
  let service: EquipmentService;
  let prisma: ReturnType<typeof makePrismaMock>;

  const baseEquipment = {
    id: 'equip-1',
    code: 'FRIDGE-01',
    name: 'Chambre froide A',
    type: 'refrigeration',
    serialNumber: 'SN-XYZ',
    brand: 'Carrier',
    siteId: 'site-1',
    tempMin: 0,
    tempMax: 4,
    tenantId: TENANT_A,
    isActive: true,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EquipmentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<EquipmentService>(EquipmentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('findAll — scopes query to the caller tenantId', async () => {
    prisma.equipment.findMany.mockResolvedValue([baseEquipment]);
    prisma.equipment.count.mockResolvedValue(1);

    await service.findAll(TENANT_A, { page: 1, limit: 20 });

    expect(prisma.equipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  it('findAll — returns correct pagination meta', async () => {
    prisma.equipment.findMany.mockResolvedValue([baseEquipment]);
    prisma.equipment.count.mockResolvedValue(55);

    const result = await service.findAll(TENANT_A, { page: 3, limit: 10 });

    expect(result.meta).toMatchObject({ total: 55, page: 3, limit: 10 });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  it('findOne — returns equipment matching id+tenantId', async () => {
    prisma.equipment.findFirst.mockResolvedValue(baseEquipment);

    const result = await service.findOne('equip-1', TENANT_A);

    expect(prisma.equipment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'equip-1', tenantId: TENANT_A } }),
    );
    expect(result.data).toMatchObject({ id: 'equip-1' });
  });

  it('findOne — throws NotFoundException for cross-tenant access attempt', async () => {
    // Simulates tenant B trying to fetch tenant A's equipment
    prisma.equipment.findFirst.mockResolvedValue(null); // isolation: returns null

    await expect(service.findOne('equip-1', TENANT_B)).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  it('create — attaches tenantId to the new equipment record', async () => {
    prisma.equipment.findFirst.mockResolvedValue(null); // no duplicate
    prisma.equipment.create.mockResolvedValue(baseEquipment);

    const dto = { code: 'FRIDGE-01', name: 'Chambre froide A', type: 'refrigeration' };
    const result = await service.create(dto, TENANT_A);

    expect(prisma.equipment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
    expect(result.message).toBe('Équipement créé');
  });

  it('create — throws ConflictException on duplicate code within tenant', async () => {
    prisma.equipment.findFirst.mockResolvedValue(baseEquipment);

    await expect(
      service.create({ code: 'FRIDGE-01', name: 'Duplicate' }, TENANT_A),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.equipment.create).not.toHaveBeenCalled();
  });

  // ─── update ───────────────────────────────────────────────────────────────

  it('update — verifies ownership before patching', async () => {
    prisma.equipment.findFirst.mockResolvedValue(baseEquipment);
    prisma.equipment.update.mockResolvedValue({ ...baseEquipment, tempMax: 6 });

    const result = await service.update('equip-1', { tempMax: 6 }, TENANT_A);

    expect(prisma.equipment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'equip-1' }, data: { tempMax: 6 } }),
    );
    expect(result.data).toMatchObject({ tempMax: 6 });
  });

  it('update — throws NotFoundException if equipment not found in tenant', async () => {
    prisma.equipment.findFirst.mockResolvedValue(null);

    await expect(service.update('ghost', { tempMax: 6 }, TENANT_A))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.equipment.update).not.toHaveBeenCalled();
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  it('remove — soft-deletes by setting isActive=false', async () => {
    prisma.equipment.findFirst.mockResolvedValue(baseEquipment);
    prisma.equipment.update.mockResolvedValue({ ...baseEquipment, isActive: false });

    const result = await service.remove('equip-1', TENANT_A);

    expect(prisma.equipment.update).toHaveBeenCalledWith({
      where: { id: 'equip-1' },
      data: { isActive: false },
    });
    expect(result.message).toBe('Équipement désactivé');
  });

  it('remove — throws NotFoundException if equipment not found', async () => {
    prisma.equipment.findFirst.mockResolvedValue(null);

    await expect(service.remove('ghost', TENANT_A)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.equipment.update).not.toHaveBeenCalled();
  });
});
