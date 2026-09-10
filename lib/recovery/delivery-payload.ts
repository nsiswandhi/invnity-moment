import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { RecoveryEmail } from '../email/email-sender';

const KEY_NAME = 'RECOVERY_OUTBOX_ENCRYPTION_KEY';
const VERSION = 'v1';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export type RecoveryDeliveryPayload = RecoveryEmail;
export type RecoveryDeliveryPayloadCipher = {
  encrypt(payload: RecoveryDeliveryPayload): string;
  decrypt(ciphertext: string): RecoveryDeliveryPayload;
};

function parseKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw new Error(`${KEY_NAME} must be a base64-encoded 32-byte key`);
  return key;
}

function validatePayload(value: unknown): RecoveryDeliveryPayload {
  if (!value || typeof value !== 'object') throw new Error('Invalid recovery delivery payload');
  const payload = value as Record<string, unknown>;
  if (typeof payload.to !== 'string' || typeof payload.recoveryUrl !== 'string') throw new Error('Invalid recovery delivery payload');
  return { to: payload.to, recoveryUrl: payload.recoveryUrl };
}

export function createRecoveryDeliveryPayloadCipher(encodedKey: string): RecoveryDeliveryPayloadCipher {
  const key = parseKey(encodedKey);
  return {
    encrypt(payload) {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const plaintext = Buffer.from(JSON.stringify(validatePayload(payload)), 'utf8');
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')}`;
    },
    decrypt(ciphertext) {
      try {
        const [version, encoded] = ciphertext.split('.', 2);
        if (version !== VERSION || !encoded) throw new Error('Invalid recovery delivery payload');
        const value = Buffer.from(encoded, 'base64url');
        if (value.length <= IV_LENGTH + TAG_LENGTH) throw new Error('Invalid recovery delivery payload');
        const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, IV_LENGTH));
        decipher.setAuthTag(value.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
        const plaintext = Buffer.concat([decipher.update(value.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString('utf8');
        return validatePayload(JSON.parse(plaintext) as unknown);
      } catch {
        throw new Error('Invalid recovery delivery payload');
      }
    },
  };
}

export function createRecoveryDeliveryPayloadCipherFromEnvironment(environment: NodeJS.ProcessEnv = process.env): RecoveryDeliveryPayloadCipher {
  const encodedKey = environment[KEY_NAME];
  if (!encodedKey) throw new Error(`${KEY_NAME} is required to send recovery email`);
  return createRecoveryDeliveryPayloadCipher(encodedKey);
}
