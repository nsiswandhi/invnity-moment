import { beforeEach, describe, expect, it, vi } from 'vitest';

const processRecoveryDeliveryOutbox = vi.fn();
vi.mock('../../lib/recovery/outbox-worker', () => ({ processRecoveryDeliveryOutbox }));

describe('recovery outbox scheduler route', () => {
  beforeEach(() => {
    vi.resetModules();
    processRecoveryDeliveryOutbox.mockReset();
    processRecoveryDeliveryOutbox.mockResolvedValue({ claimed: 1, sent: 1, retried: 0, failed: 0 });
    vi.stubEnv('CRON_SECRET', 'cron-secret-for-tests');
  });

  it('rejects requests without the configured scheduler secret', async () => {
    const { GET } = await import('../../app/api/internal/recovery-outbox/route');
    const response = await GET(new Request('https://moments.example.test/api/internal/recovery-outbox'));

    expect(response.status).toBe(401);
    expect(processRecoveryDeliveryOutbox).not.toHaveBeenCalled();
  });

  it('processes the outbox for requests with the configured scheduler secret', async () => {
    const { GET } = await import('../../app/api/internal/recovery-outbox/route');
    const response = await GET(new Request('https://moments.example.test/api/internal/recovery-outbox', { headers: { authorization: 'Bearer cron-secret-for-tests' } }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { claimed: 1, sent: 1, retried: 0, failed: 0 } });
    expect(processRecoveryDeliveryOutbox).toHaveBeenCalledOnce();
  });
});
