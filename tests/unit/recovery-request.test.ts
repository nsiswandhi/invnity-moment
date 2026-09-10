import { describe, expect, it, vi } from 'vitest';
import { queueRecoveryRequest } from '../../lib/recovery/recovery-request';

describe('recovery acknowledgement', () => {
  it.each(['sari@example.test', 'unknown@example.test'])('uses the same acknowledgement gate for %s without measuring wall-clock time', async (email) => {
    let releaseAcknowledgement: (() => void) | undefined;
    const acknowledgementGate = vi.fn(() => new Promise<void>((resolve) => { releaseAcknowledgement = resolve; }));
    const queue = vi.fn().mockResolvedValue(undefined);
    let settled = false;

    const acknowledgement = queueRecoveryRequest({
      email,
      eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b',
      queue,
      acknowledgementGate,
    }).then(() => { settled = true; });

    await Promise.resolve();
    expect(queue).toHaveBeenCalledWith(email, 'bd928dad-a8c6-40af-a482-30df35ad5e5b');
    expect(acknowledgementGate).toHaveBeenCalledOnce();
    expect(settled).toBe(false);

    releaseAcknowledgement?.();
    await acknowledgement;
    expect(settled).toBe(true);
  });

  it('keeps the public acknowledgement gate after a queue failure', async () => {
    let releaseAcknowledgement: (() => void) | undefined;
    const acknowledgementGate = vi.fn(() => new Promise<void>((resolve) => { releaseAcknowledgement = resolve; }));
    const queue = vi.fn().mockRejectedValue(new Error('database unavailable'));
    let settled = false;

    const acknowledgement = queueRecoveryRequest({
      email: 'sari@example.test',
      eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b',
      queue,
      acknowledgementGate,
    }).then(() => { settled = true; });

    await Promise.resolve();
    expect(settled).toBe(false);
    releaseAcknowledgement?.();
    await acknowledgement;
    expect(settled).toBe(true);
  });
});
