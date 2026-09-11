// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadSignedFile } from '../../components/album/MomentDetail';

describe('signed file downloads', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (URL as unknown as { createObjectURL?: typeof URL.createObjectURL }).createObjectURL;
    delete (URL as unknown as { revokeObjectURL?: typeof URL.revokeObjectURL }).revokeObjectURL;
  });

  it('fetches the signed URL and downloads a temporary same-origin object URL', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('image-bytes', { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const createObjectURL = vi.fn().mockReturnValue('blob:download');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('fetch', fetch);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('momen-123.jpg');
      expect(this.href).toBe('blob:download');
    });

    await downloadSignedFile('https://downloads.test/signed.jpg', 'momen-123.jpg');

    expect(fetch).toHaveBeenCalledWith('https://downloads.test/signed.jpg');
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ size: 11, type: 'image/jpeg' }));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
    expect(document.body.querySelector('a')).toBeNull();
  });

  it('rejects failed signed URL fetches without creating an object URL', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    const createObjectURL = vi.fn();
    vi.stubGlobal('fetch', fetch);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });

    await expect(downloadSignedFile('https://downloads.test/expired.jpg', 'momen-123.jpg')).rejects.toThrow('Download belum dapat dimulai.');
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
