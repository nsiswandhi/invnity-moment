import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressImage, MAX_COMPRESSED_LONG_EDGE } from '../../components/camera/image-compression';

describe('browser image compression', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lowers quality through a bounded loop until the JPEG is near the size target', async () => {
    const qualities: number[] = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: (value: Blob | null) => void, _type: string, quality: number) => {
        qualities.push(quality);
        callback(new Blob([new Uint8Array(quality > 0.7 ? 3 * 1024 * 1024 : 1500 * 1024)], { type: 'image/jpeg' }));
      },
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal('createImageBitmap', async () => ({ width: 4096, height: 2048, close: vi.fn() }));

    const result = await compressImage(new Blob(['image']), { quality: 0.82 });

    expect(result.width).toBe(MAX_COMPRESSED_LONG_EDGE);
    expect(result.height).toBe(1024);
    expect(result.blob.size).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(qualities).toEqual([0.82, 0.7]);
  });

  it('rejects compression failure instead of returning the original image with fake dimensions', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ drawImage: vi.fn() }), toBlob: () => undefined }) });
    vi.stubGlobal('createImageBitmap', async () => { throw new Error('IMAGE_DECODER_UNAVAILABLE'); });

    await expect(compressImage(new Blob(['original'], { type: 'image/jpeg' }))).rejects.toThrow('IMAGE_DECODER_UNAVAILABLE');
  });
});
