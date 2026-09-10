import {
  encryptSecret,
  decryptSecret,
  isEncryptionConfigured,
  EncryptionNotConfiguredError,
} from '../secret-cipher';

describe('secret-cipher (AES-256-GCM)', () => {
  const KEY = 'k'.repeat(48); // ≥ 32 chars

  describe('with ENCRYPTION_KEY configured', () => {
    beforeEach(() => { process.env['ENCRYPTION_KEY'] = KEY; });
    afterEach(() => { delete process.env['ENCRYPTION_KEY']; });

    it('round-trips a secret exactly', () => {
      const secret = 'pk-live-printnode-8f3a2b';
      expect(decryptSecret(encryptSecret(secret))).toBe(secret);
    });

    it('produces different ciphertext each time (random salt + iv)', () => {
      expect(encryptSecret('same-input')).not.toBe(encryptSecret('same-input'));
    });

    it('never embeds the plaintext in the token', () => {
      const token = encryptSecret('SENSITIVE_API_KEY');
      expect(token.includes('SENSITIVE_API_KEY')).toBe(false);
    });

    it('fails authentication on a tampered token', () => {
      const token = encryptSecret('secret');
      const raw = Buffer.from(token, 'base64');
      raw[raw.length - 1] ^= 0xff; // flip a ciphertext bit
      expect(() => decryptSecret(raw.toString('base64'))).toThrow();
    });

    it('reports configured', () => {
      expect(isEncryptionConfigured()).toBe(true);
    });
  });

  describe('without ENCRYPTION_KEY', () => {
    beforeEach(() => { delete process.env['ENCRYPTION_KEY']; });

    it('reports not configured', () => {
      expect(isEncryptionConfigured()).toBe(false);
    });

    it('throws EncryptionNotConfiguredError on encrypt', () => {
      expect(() => encryptSecret('x')).toThrow(EncryptionNotConfiguredError);
    });

    it('treats a too-short key as not configured', () => {
      process.env['ENCRYPTION_KEY'] = 'short';
      expect(isEncryptionConfigured()).toBe(false);
      delete process.env['ENCRYPTION_KEY'];
    });
  });
});
