import { describe, expect, it, vi } from 'vitest';

const { sendRecoveryEmail } = vi.hoisted(() => ({ sendRecoveryEmail: vi.fn().mockRejectedValue(new Error('SMTP unavailable')) }));
vi.mock('../../lib/email/email-sender', () => ({ sendRecoveryEmail }));

import { issueRecoveryToken } from '../../lib/auth/recovery';
import type { DatabaseClient } from '../../lib/db/client';

describe('recovery delivery queue', () => {
  it('persists only an encrypted delivery payload without awaiting SMTP', async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    const db = { rpc } as DatabaseClient;
    const payloadCipher = { encrypt: vi.fn().mockReturnValue('encrypted-delivery-payload') };

    await expect(issueRecoveryToken('sari@example.test', 'bd928dad-a8c6-40af-a482-30df35ad5e5b', db, new Date('2026-09-10T00:00:00.000Z'), payloadCipher)).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith('create_recovery_token', expect.objectContaining({
      p_email: 'sari@example.test',
      p_event_id: 'bd928dad-a8c6-40af-a482-30df35ad5e5b',
      p_delivery_payload_ciphertext: 'encrypted-delivery-payload',
    }));
    expect(payloadCipher.encrypt).toHaveBeenCalledWith(expect.objectContaining({
      to: 'sari@example.test',
      recoveryUrl: expect.stringContaining('/recovery?token='),
    }));
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_recovery_url');
    expect(sendRecoveryEmail).not.toHaveBeenCalled();
  });
});
