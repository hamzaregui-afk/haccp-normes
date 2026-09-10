import { BadRequestException, Injectable } from '@nestjs/common';
import { toApiResponse } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, decryptSecret, isEncryptionConfigured } from '../crypto/secret-cipher';
import { getProvider, describeProviders } from '../print-job/providers';
import type { UpdatePrintProviderConfigDto } from './dto/print-provider-config.dto';

/**
 * Per-tenant print-provider configuration (currently PrintNode).
 *
 * SECURITY: the PrintNode API key is stored AES-256-GCM-encrypted and is NEVER
 * returned by any controller — getStatus() exposes only booleans. The plaintext
 * key is produced only by getPrintNodeApiKey(), which is called server-side at
 * dispatch time and never wired to an HTTP response.
 */
@Injectable()
export class PrintProviderConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public status — booleans only, the key is never exposed. */
  async getStatus(tenantId: string) {
    const cfg = await this.prisma.printProviderConfig.findUnique({ where: { tenantId } });
    return toApiResponse({
      printNodeEnabled:     cfg?.printNodeEnabled ?? false,
      hasPrintNodeApiKey:   Boolean(cfg?.printNodeApiKeyEnc),
      encryptionConfigured: isEncryptionConfigured(),
    });
  }

  async update(tenantId: string, dto: UpdatePrintProviderConfigDto) {
    if (dto.printNodeApiKey !== undefined && !isEncryptionConfigured()) {
      throw new BadRequestException(
        "Le chiffrement (ENCRYPTION_KEY) n'est pas configuré côté serveur — impossible de stocker une clé PrintNode.",
      );
    }

    const data: { printNodeApiKeyEnc?: string; printNodeEnabled?: boolean } = {};
    if (dto.printNodeApiKey !== undefined) data.printNodeApiKeyEnc = encryptSecret(dto.printNodeApiKey);
    if (dto.printNodeEnabled !== undefined) data.printNodeEnabled = dto.printNodeEnabled;

    await this.prisma.printProviderConfig.upsert({
      where:  { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return this.getStatus(tenantId);
  }

  async clearPrintNodeKey(tenantId: string) {
    await this.prisma.printProviderConfig.updateMany({
      where: { tenantId },
      data:  { printNodeApiKeyEnc: null, printNodeEnabled: false },
    });
    return this.getStatus(tenantId);
  }

  /**
   * INTERNAL — decrypt the tenant's PrintNode key for dispatch. Returns null when
   * PrintNode is not enabled/keyed, or encryption is unavailable, or the stored
   * ciphertext cannot be decrypted (e.g. a rotated ENCRYPTION_KEY). NEVER exposed
   * through a controller.
   */
  async getPrintNodeApiKey(tenantId: string): Promise<string | null> {
    const cfg = await this.prisma.printProviderConfig.findUnique({ where: { tenantId } });
    if (!cfg?.printNodeEnabled || !cfg.printNodeApiKeyEnc || !isEncryptionConfigured()) return null;
    try {
      return decryptSecret(cfg.printNodeApiKeyEnc);
    } catch {
      return null;
    }
  }

  // ── Provider catalog + PrintNode enumeration (add-printer flow) ────────────────

  /** Provider catalog (data) that drives the dynamic add-printer UI. */
  providers() {
    return toApiResponse(describeProviders());
  }

  /**
   * Decrypt the tenant's stored PrintNode key REGARDLESS of the enabled flag —
   * used during setup (test/enumerate) before the config is switched on.
   */
  private async getStoredPrintNodeKey(tenantId: string): Promise<string | null> {
    const cfg = await this.prisma.printProviderConfig.findUnique({ where: { tenantId } });
    if (!cfg?.printNodeApiKeyEnc || !isEncryptionConfigured()) return null;
    try { return decryptSecret(cfg.printNodeApiKeyEnc); } catch { return null; }
  }

  /** A caller-supplied key (setup, not yet saved) wins; else the stored key. */
  private async resolveKey(tenantId: string, supplied?: string): Promise<string | null> {
    return supplied ?? (await this.getStoredPrintNodeKey(tenantId));
  }

  async printNodeTest(tenantId: string, suppliedKey?: string) {
    const provider = getProvider('PRINTNODE');
    if (!provider?.testConnection) throw new BadRequestException('Fournisseur PrintNode indisponible');
    const key = await this.resolveKey(tenantId, suppliedKey);
    if (!key) return toApiResponse({ ok: false, message: 'Aucune clé PrintNode configurée' });
    return toApiResponse(await provider.testConnection(key));
  }

  async printNodeComputers(tenantId: string, suppliedKey?: string) {
    const provider = getProvider('PRINTNODE');
    if (!provider?.listComputers) throw new BadRequestException('Fournisseur PrintNode indisponible');
    const key = await this.resolveKey(tenantId, suppliedKey);
    if (!key) throw new BadRequestException('Aucune clé PrintNode configurée');
    return toApiResponse(await provider.listComputers(key));
  }

  async printNodePrinters(tenantId: string, suppliedKey?: string, computerId?: number) {
    const provider = getProvider('PRINTNODE');
    if (!provider?.listPrinters) throw new BadRequestException('Fournisseur PrintNode indisponible');
    const key = await this.resolveKey(tenantId, suppliedKey);
    if (!key) throw new BadRequestException('Aucune clé PrintNode configurée');
    return toApiResponse(await provider.listPrinters(key, computerId));
  }
}
