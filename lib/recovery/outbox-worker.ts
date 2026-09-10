import 'server-only';
import { createDatabaseClient, type DatabaseClient } from '../db/client';
import { sendRecoveryEmail } from '../email/email-sender';
import { createRecoveryDeliveryPayloadCipherFromEnvironment, type RecoveryDeliveryPayloadCipher } from './delivery-payload';

export const RECOVERY_OUTBOX_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 30_000;
const RETRY_MAX_DELAY_MS = 5 * 60_000;

type ClaimedRecoveryDelivery = {
  id: string;
  claimToken: string;
  deliveryPayloadCiphertext: string;
  attempts: number;
};

type ProcessRecoveryDeliveryOutboxInput = {
  db?: DatabaseClient;
  cipher?: Pick<RecoveryDeliveryPayloadCipher, 'decrypt'>;
  now?: Date;
  batchSize?: number;
};

export type RecoveryOutboxResult = { claimed: number; sent: number; retried: number; failed: number };

function retryAt(now: Date, attempts: number): string {
  const delay = Math.min(RETRY_BASE_DELAY_MS * (2 ** Math.max(attempts - 1, 0)), RETRY_MAX_DELAY_MS);
  return new Date(now.getTime() + delay).toISOString();
}

export async function processRecoveryDeliveryOutbox({
  db = createDatabaseClient(),
  cipher = createRecoveryDeliveryPayloadCipherFromEnvironment(),
  now = new Date(),
  batchSize = 10,
}: ProcessRecoveryDeliveryOutboxInput = {}): Promise<RecoveryOutboxResult> {
  const deliveries = await db.rpc<ClaimedRecoveryDelivery[]>('claim_recovery_delivery_outbox', {
    p_limit: batchSize,
    p_max_attempts: RECOVERY_OUTBOX_MAX_ATTEMPTS,
    p_now: now.toISOString(),
  });
  const result: RecoveryOutboxResult = { claimed: deliveries.length, sent: 0, retried: 0, failed: 0 };

  for (const delivery of deliveries) {
    try {
      await sendRecoveryEmail(cipher.decrypt(delivery.deliveryPayloadCiphertext));
      const completed = await db.rpc<boolean>('complete_recovery_delivery', {
        p_delivery_id: delivery.id,
        p_claim_token: delivery.claimToken,
        p_now: now.toISOString(),
      });
      if (completed) result.sent += 1;
      else result.failed += 1;
    } catch {
      const status = await db.rpc<'PENDING' | 'FAILED'>('fail_recovery_delivery', {
        p_delivery_id: delivery.id,
        p_claim_token: delivery.claimToken,
        p_max_attempts: RECOVERY_OUTBOX_MAX_ATTEMPTS,
        p_next_attempt_at: retryAt(now, delivery.attempts),
        p_now: now.toISOString(),
      });
      if (status === 'PENDING') result.retried += 1;
      else result.failed += 1;
    }
  }
  return result;
}
