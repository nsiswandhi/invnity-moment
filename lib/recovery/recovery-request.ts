import 'server-only';
import { issueRecoveryToken } from '../auth/recovery';

export const RECOVERY_ACKNOWLEDGEMENT_DELAY_MS = 250;

type QueueRecoveryToken = (email: string, eventId: string) => Promise<void>;
type AcknowledgementGate = () => Promise<void>;
type QueueRecoveryRequestInput = {
  email: string;
  eventId: string;
  queue?: QueueRecoveryToken;
  acknowledgementGate?: AcknowledgementGate;
};

function acknowledgementGate(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, RECOVERY_ACKNOWLEDGEMENT_DELAY_MS));
}

export async function queueRecoveryRequest({
  email,
  eventId,
  queue = issueRecoveryToken,
  acknowledgementGate: waitForAcknowledgement = acknowledgementGate,
}: QueueRecoveryRequestInput): Promise<void> {
  const acknowledgement = waitForAcknowledgement();
  await Promise.all([acknowledgement, queue(email, eventId).catch(() => undefined)]);
}
