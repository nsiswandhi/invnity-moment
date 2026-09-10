import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRecoveryDeliveryPayloadCipher } from '../../lib/recovery/delivery-payload';

describe('recovery delivery payload cipher', () => {
  it('round-trips delivery data without retaining the raw email or recovery URL in ciphertext', () => {
    const cipher = createRecoveryDeliveryPayloadCipher(randomBytes(32).toString('base64'));
    const payload = {
      to: 'sari@example.test',
      recoveryUrl: 'https://moments.example.test/recovery?token=opaque-recovery-token-that-must-not-be-stored',
    };

    const ciphertext = cipher.encrypt(payload);

    expect(ciphertext).not.toContain(payload.to);
    expect(ciphertext).not.toContain(payload.recoveryUrl);
    expect(cipher.decrypt(ciphertext)).toEqual(payload);
  });

  it('rejects an incorrectly sized encryption key', () => {
    expect(() => createRecoveryDeliveryPayloadCipher('not-a-32-byte-key')).toThrow('RECOVERY_OUTBOX_ENCRYPTION_KEY');
  });
});
