import { describe, expect, it } from 'vitest';
import { prepareImageForUpload } from '../../lib/moments/upload-preparation';

describe('upload image preparation', () => {
  it('stops before upload and exposes compression failure instead of substituting the original image', async () => {
    const original = new Blob(['original'], { type: 'image/jpeg' });
    await expect(prepareImageForUpload(original, async () => { throw new Error('IMAGE_DECODER_UNAVAILABLE'); })).rejects.toThrow('Foto tidak dapat dikompres');
  });
});
