import { afterEach, describe, expect, it, vi } from 'vitest';
import { createR2Client } from '../../lib/media/r2-client';

const environment = {
  NODE_ENV: 'test',
  R2_ACCOUNT_ID: 'account-id',
  R2_ACCESS_KEY_ID: 'access-key',
  R2_SECRET_ACCESS_KEY: 'secret-key',
  R2_BUCKET_NAME: 'private-moments',
} satisfies NodeJS.ProcessEnv;

describe('R2-compatible client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('performs an S3-compatible object read with the signed R2 request', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '3', etag: 'etag-1' } }));
    vi.stubGlobal('fetch', fetch);
    const client = createR2Client(environment);

    await expect(client.getObject('events/one/participants/two/moments/three/original')).resolves.toMatchObject({ body: Buffer.from([1, 2, 3]), contentType: 'image/jpeg', contentLength: 3, etag: 'etag-1' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('https://account-id.r2.cloudflarestorage.com/private-moments/events/one/participants/two/moments/three/original?'), { method: 'GET', headers: undefined, body: undefined });
  });
});
