import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrintProviderConfigService } from '../print-provider-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptSecret } from '../../crypto/secret-cipher';

describe('PrintProviderConfigService', () => {
  const KEY = 'k'.repeat(48);
  let service: PrintProviderConfigService;
  let prisma: { printProviderConfig: { findUnique: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { printProviderConfig: { findUnique: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrintProviderConfigService,
        { provide: PrismaService, useValue: prisma as unknown as PrismaService },
      ],
    }).compile();
    service = module.get<PrintProviderConfigService>(PrintProviderConfigService);
  });

  afterEach(() => { delete process.env['ENCRYPTION_KEY']; jest.clearAllMocks(); });

  it('getStatus exposes only booleans — never the stored key', async () => {
    prisma.printProviderConfig.findUnique.mockResolvedValue({
      tenantId: 't1', printNodeApiKeyEnc: 'CIPHERTEXT_VALUE', printNodeEnabled: true,
    });
    const result = (await service.getStatus('t1')) as { data: Record<string, unknown> };
    expect(result.data).toEqual({
      printNodeEnabled: true, hasPrintNodeApiKey: true, encryptionConfigured: false,
    });
    expect(JSON.stringify(result.data)).not.toContain('CIPHERTEXT_VALUE');
  });

  it('update rejects setting a key when ENCRYPTION_KEY is not configured', async () => {
    await expect(service.update('t1', { printNodeApiKey: 'pk-123456789' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.printProviderConfig.upsert).not.toHaveBeenCalled();
  });

  it('update stores the key ENCRYPTED (ciphertext ≠ plaintext)', async () => {
    process.env['ENCRYPTION_KEY'] = KEY;
    prisma.printProviderConfig.upsert.mockResolvedValue({});
    prisma.printProviderConfig.findUnique.mockResolvedValue({ printNodeEnabled: true, printNodeApiKeyEnc: 'x' });
    await service.update('t1', { printNodeApiKey: 'pk-live-secret-123', printNodeEnabled: true });
    const arg = prisma.printProviderConfig.upsert.mock.calls[0][0] as {
      create: { printNodeApiKeyEnc: string };
    };
    expect(arg.create.printNodeApiKeyEnc).toBeTruthy();
    expect(arg.create.printNodeApiKeyEnc).not.toContain('pk-live-secret-123');
  });

  it('getPrintNodeApiKey decrypts the stored key when enabled', async () => {
    process.env['ENCRYPTION_KEY'] = KEY;
    const enc = encryptSecret('pk-roundtrip-999');
    prisma.printProviderConfig.findUnique.mockResolvedValue({ printNodeEnabled: true, printNodeApiKeyEnc: enc });
    expect(await service.getPrintNodeApiKey('t1')).toBe('pk-roundtrip-999');
  });

  it('getPrintNodeApiKey returns null when PrintNode is disabled', async () => {
    process.env['ENCRYPTION_KEY'] = KEY;
    const enc = encryptSecret('pk-x');
    prisma.printProviderConfig.findUnique.mockResolvedValue({ printNodeEnabled: false, printNodeApiKeyEnc: enc });
    expect(await service.getPrintNodeApiKey('t1')).toBeNull();
  });
});
