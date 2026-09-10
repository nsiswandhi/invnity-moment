import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendRecoveryEmail } = vi.hoisted(() => ({ sendRecoveryEmail: vi.fn() }));
vi.mock('../../lib/email/email-sender', () => ({ sendRecoveryEmail }));

import { processRecoveryDeliveryOutbox } from '../../lib/recovery/outbox-worker';
import type { DatabaseClient } from '../../lib/db/client';

const now = new Date('2026-09-10T00:00:00.000Z');
const claimedDelivery = {
  id: 'e5a05a0f-8bca-4b80-9ac9-d34da83ef71a',
  claimToken: 'bd928dad-a8c6-40af-a482-30df35ad5e5b',
  deliveryPayloadCiphertext: 'encrypted-delivery-payload',
  attempts: 1,
};
const cipher = { decrypt: vi.fn().mockReturnValue({ to: 'sari@example.test', recoveryUrl: 'https://moments.example.test/recovery?token=opaque-token' }) };

describe('recovery delivery outbox worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends an atomically claimed delivery and records success with its claim token', async () => {
    const rpc = vi.fn(async <T>(functionName: string): Promise<T> => {
      if (functionName === 'claim_recovery_delivery_outbox') return [claimedDelivery] as T;
      if (functionName === 'complete_recovery_delivery') return true as T;
      throw new Error(`unexpected RPC: ${functionName}`);
    });
    sendRecoveryEmail.mockResolvedValue(undefined);

    const result = await processRecoveryDeliveryOutbox({ db: { rpc } as DatabaseClient, cipher, now });

    expect(result).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0 });
    expect(sendRecoveryEmail).toHaveBeenCalledWith({ to: 'sari@example.test', recoveryUrl: 'https://moments.example.test/recovery?token=opaque-token' });
    expect(rpc).toHaveBeenCalledWith('complete_recovery_delivery', {
      p_delivery_id: claimedDelivery.id,
      p_claim_token: claimedDelivery.claimToken,
      p_now: now.toISOString(),
    });
  });

  it('does not report a stale claim-token completion as sent', async () => {
    const rpc = vi.fn(async <T>(functionName: string): Promise<T> => {
      if (functionName === 'claim_recovery_delivery_outbox') return [claimedDelivery] as T;
      if (functionName === 'complete_recovery_delivery') return false as T;
      throw new Error(`unexpected RPC: ${functionName}`);
    });
    sendRecoveryEmail.mockResolvedValue(undefined);

    const result = await processRecoveryDeliveryOutbox({ db: { rpc } as DatabaseClient, cipher, now });

    expect(result).toEqual({ claimed: 1, sent: 0, retried: 0, failed: 1 });
  });

  it('records a bounded retry when delivery fails before the attempt cap', async () => {
    const rpc = vi.fn(async <T>(functionName: string): Promise<T> => {
      if (functionName === 'claim_recovery_delivery_outbox') return [claimedDelivery] as T;
      if (functionName === 'fail_recovery_delivery') return 'PENDING' as T;
      throw new Error(`unexpected RPC: ${functionName}`);
    });
    sendRecoveryEmail.mockRejectedValue(new Error('SMTP unavailable'));

    const result = await processRecoveryDeliveryOutbox({ db: { rpc } as DatabaseClient, cipher, now });

    expect(result).toEqual({ claimed: 1, sent: 0, retried: 1, failed: 0 });
    expect(rpc).toHaveBeenCalledWith('fail_recovery_delivery', expect.objectContaining({
      p_delivery_id: claimedDelivery.id,
      p_claim_token: claimedDelivery.claimToken,
      p_max_attempts: 3,
      p_next_attempt_at: '2026-09-10T00:00:30.000Z',
    }));
  });

  it('records a terminal failure at the bounded attempt cap', async () => {
    const rpc = vi.fn(async <T>(functionName: string): Promise<T> => {
      if (functionName === 'claim_recovery_delivery_outbox') return [{ ...claimedDelivery, attempts: 3 }] as T;
      if (functionName === 'fail_recovery_delivery') return 'FAILED' as T;
      throw new Error(`unexpected RPC: ${functionName}`);
    });
    sendRecoveryEmail.mockRejectedValue(new Error('SMTP unavailable'));

    const result = await processRecoveryDeliveryOutbox({ db: { rpc } as DatabaseClient, cipher, now });

    expect(result).toEqual({ claimed: 1, sent: 0, retried: 0, failed: 1 });
  });
});
