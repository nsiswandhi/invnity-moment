import { describe, expect, it } from 'vitest';
import { PendingUploadQueue, createLocalStoragePendingUploadPersistence, type PendingUploadPersistence } from '../../components/camera/pending-upload-queue';

const blob = (size = 4) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });

describe('pending upload queue persistence', () => {
  it('permits a bounded retry only from a failed state', async () => {
    const queue = new PendingUploadQueue({ maxRetries: 1 });
    await queue.enqueue({ id: 'retry-me', blob: blob() });
    await queue.markFailed('retry-me', 'offline');

    expect(queue.canRetry('retry-me')).toBe(true);
    await queue.retry('retry-me');
    expect(queue.get('retry-me')).toMatchObject({ state: 'retrying', retries: 1 });
    expect(queue.canRetry('retry-me')).toBe(false);
    await expect(queue.retry('retry-me')).rejects.toThrow('PENDING_ITEM_NOT_RETRYABLE');
  });

  it('moves a failed item to failed after the retry budget is exhausted', async () => {
    const queue = new PendingUploadQueue({ maxRetries: 1 });
    await queue.enqueue({ id: 'exhaust-me', blob: blob() });
    await queue.markRetrying('exhaust-me', 'first failure');
    expect(queue.get('exhaust-me')).toMatchObject({ state: 'retrying', retries: 1 });
    await queue.markRetrying('exhaust-me', 'second failure');
    expect(queue.get('exhaust-me')).toMatchObject({ state: 'failed', retries: 1, error: 'second failure' });
  });

  it('restores only bounded, retryable pending work after a reload', async () => {
    const persisted: Array<{ id: string; blob: Blob; state: 'ready' | 'uploading' | 'retrying' | 'saved' | 'failed'; retries: number; createdAt: number }> = [];
    const persistence: PendingUploadPersistence = {
      load: async () => persisted.map((item) => ({ ...item })),
      save: async (items) => { persisted.splice(0, persisted.length, ...items.map((item) => ({ ...item }))); },
    };
    const first = new PendingUploadQueue({ persistence, now: () => 1_000, maxItems: 2, maxTotalBytes: 10, maxAgeMs: 100, maxRetries: 2 });
    await first.ready();
    await first.enqueue({ id: 'kept', blob: blob(4) });
    await first.enqueue({ id: 'also-kept', blob: blob(4) });

    const reloaded = new PendingUploadQueue({ persistence, now: () => 1_050, maxItems: 2, maxTotalBytes: 10, maxAgeMs: 100, maxRetries: 2 });
    await reloaded.ready();

    expect(reloaded.list().map((item) => item.id)).toEqual(['kept', 'also-kept']);
  });

  it('drops expired, exhausted, and over-byte persisted work before it is restored', async () => {
    const persistence: PendingUploadPersistence = {
      load: async () => [
        { id: 'expired', blob: blob(2), state: 'ready', retries: 0, createdAt: 0 },
        { id: 'exhausted', blob: blob(2), state: 'retrying', retries: 3, createdAt: 990 },
        { id: 'too-large', blob: blob(9), state: 'ready', retries: 0, createdAt: 995 },
        { id: 'kept', blob: blob(4), state: 'ready', retries: 0, createdAt: 999 },
      ],
      save: async () => undefined,
    };
    const queue = new PendingUploadQueue({ persistence, now: () => 1_000, maxItems: 2, maxTotalBytes: 8, maxAgeMs: 100, maxRetries: 3 });
    await queue.ready();

    expect(queue.list().map((item) => item.id)).toEqual(['kept']);
  });

  it('serializes Blob payloads through a browser-safe local-storage adapter', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const persistence = createLocalStoragePendingUploadPersistence(storage, 'pending-test');

    await persistence.save([{ id: 'one', blob: new Blob(['photo'], { type: 'image/jpeg' }), state: 'ready', retries: 0, createdAt: 1 }]);
    const restored = await persistence.load();

    expect(restored).toHaveLength(1);
    expect(await restored[0].blob.text()).toBe('photo');
    expect(restored[0]).toMatchObject({ id: 'one', state: 'ready', retries: 0, createdAt: 1 });
  });
});
