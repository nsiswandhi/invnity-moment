import 'server-only';
import { issueRecoveryToken } from '../auth/recovery';
import { processRecoveryDeliveryOutbox } from './outbox-worker';

export const RECOVERY_ACKNOWLEDGEMENT_DELAY_MS = 250;
const RECOVERY_IMMEDIATE_DELIVERY_TIMEOUT_MS = 5_000;

type QueueRecoveryToken = (email: string, eventId: string) => Promise<void>;
type ProcessRecoveryOutbox = (input: { batchSize: number }) => Promise<unknown>;
type AcknowledgementGate = () => Promise<void>;
type QueueRecoveryRequestInput = {
  email: string;
  eventId: string;
  queue?: QueueRecoveryToken;
  process?: ProcessRecoveryOutbox;
  acknowledgementGate?: AcknowledgementGate;
};

function acknowledgementGate(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, RECOVERY_ACKNOWLEDGEMENT_DELAY_MS));
}

export async function queueRecoveryRequest({
  email,
  eventId,
  queue = issueRecoveryToken,
  process = processRecoveryDeliveryOutbox,
  acknowledgementGate: waitForAcknowledgement = acknowledgementGate,
}: QueueRecoveryRequestInput): Promise<void> {
  const acknowledgement = waitForAcknowledgement();
  let queued = false;
  const queueAttempt = queue(email, eventId).then(() => { queued = true; }).catch(() => undefined);
  await Promise.all([acknowledgement, queueAttempt]);
  if (queued) {
    await Promise.race([
      process({ batchSize: 1 }).catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, RECOVERY_IMMEDIATE_DELIVERY_TIMEOUT_MS)),
    ]);
  }
}
