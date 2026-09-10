import sharp from 'sharp';
import { derivativeKey } from './object-keys';
import type { R2Client } from './r2-client';
import type { ValidatedImageMetadata } from './validate-image';

export type DerivativeKeys = { display: string; thumbnail: string };
export type DerivativeProcessor = (objectKey: string, body: Buffer, metadata: ValidatedImageMetadata, client: R2Client) => Promise<DerivativeKeys>;

async function jpegDerivative(body: Buffer, longEdge: number, quality: number): Promise<Buffer> {
  return sharp(body, { failOn: 'error' }).rotate().resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
}

export async function processDerivatives(objectKey: string, body: Buffer, metadata: ValidatedImageMetadata, client: R2Client): Promise<DerivativeKeys> {
  const keys = { display: derivativeKey(objectKey, 'display'), thumbnail: derivativeKey(objectKey, 'thumbnail') };
  const [display, thumbnail] = await Promise.all([jpegDerivative(body, 2048, 82), jpegDerivative(body, 400, 78)]);
  void metadata;
  const written: string[] = [];
  try {
    await client.putObject(keys.display, display, 'image/jpeg');
    written.push(keys.display);
    await client.putObject(keys.thumbnail, thumbnail, 'image/jpeg');
    written.push(keys.thumbnail);
    return keys;
  } catch (error) {
    await Promise.allSettled(written.map((key) => client.deleteObject(key)));
    throw error;
  }
}
