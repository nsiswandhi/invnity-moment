import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  validateImageBuffer,
} from '../../lib/media/validate-image';

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('uploaded image validation', () => {
  it('accepts a valid PNG when MIME, magic bytes, dimensions, and size agree', async () => {
    await expect(validateImageBuffer(ONE_BY_ONE_PNG, 'image/png')).resolves.toMatchObject({
      mimeType: 'image/png',
      byteSize: ONE_BY_ONE_PNG.byteLength,
      width: 1,
      height: 1,
    });
  });

  it('rejects a MIME type that is not approved', async () => {
    await expect(validateImageBuffer(ONE_BY_ONE_PNG, 'image/gif')).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE_TYPE', status: 415 });
  });

  it('rejects bytes whose magic does not match the declared MIME type', async () => {
    await expect(validateImageBuffer(ONE_BY_ONE_PNG, 'image/jpeg')).rejects.toMatchObject({ code: 'IMAGE_MAGIC_BYTES_INVALID', status: 422 });
  });

  it('rejects an image over the upload byte limit before decoding it', async () => {
    const oversized = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    await expect(validateImageBuffer(oversized, 'image/png')).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE', status: 413 });
  });

  it('rejects corrupt image data after the header checks pass', async () => {
    const corruptPng = ONE_BY_ONE_PNG.subarray(0, -5);
    await expect(validateImageBuffer(corruptPng, 'image/png')).rejects.toMatchObject({ code: 'IMAGE_CORRUPT', status: 422 });
  });

  it('rejects a decodable image whose dimensions exceed the maximum edge', async () => {
    const oversizedDimensions = await sharp({
      create: { width: MAX_IMAGE_DIMENSION + 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();

    await expect(validateImageBuffer(oversizedDimensions, 'image/png')).rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS_INVALID', status: 422 });
  });
});
