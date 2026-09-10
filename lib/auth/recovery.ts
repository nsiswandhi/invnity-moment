import { randomBytes } from 'node:crypto';
import { getPublicConfig } from '../config';
import { createDatabaseClient, type DatabaseClient } from '../db/client';
import { HttpError } from '../errors/http-error';
import { createRecoveryDeliveryPayloadCipherFromEnvironment, type RecoveryDeliveryPayloadCipher } from '../recovery/delivery-payload';
import { normalizeEmail } from '../validation/participant';
import { hashOpaqueToken, type AuthenticatedParticipant } from './session';

export const RECOVERY_TTL_MS = 1000 * 60 * 15;

export async function issueRecoveryToken(
  email: string,
  eventId: string,
  db: DatabaseClient = createDatabaseClient(),
  now = new Date(),
  payloadCipher: Pick<RecoveryDeliveryPayloadCipher, 'encrypt'> = createRecoveryDeliveryPayloadCipherFromEnvironment(),
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const url = new URL('/recovery', getPublicConfig().appUrl);
  url.searchParams.set('token', token);
  const normalizedEmail = normalizeEmail(email);
  await db.rpc<void>('create_recovery_token', {
    p_email: normalizedEmail, p_event_id: eventId, p_token_hash: hashOpaqueToken(token), p_expires_at: new Date(now.getTime() + RECOVERY_TTL_MS).toISOString(),
    p_delivery_payload_ciphertext: payloadCipher.encrypt({ to: normalizedEmail, recoveryUrl: url.toString() }),
  });
}

export async function consumeRecoveryToken(token: string, db: DatabaseClient = createDatabaseClient(), now = new Date()): Promise<AuthenticatedParticipant> {
  const participant = await db.rpc<AuthenticatedParticipant | null>('consume_recovery_token', { p_token_hash: hashOpaqueToken(token), p_now: now.toISOString() });
  if (!participant) throw new HttpError(401, 'RECOVERY_TOKEN_INVALID', 'Tautan pemulihan tidak valid atau sudah kedaluwarsa.');
  return participant;
}
