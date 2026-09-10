import sharp from 'sharp';
import { HttpError } from '../errors/http-error';
import type { R2Client } from './r2-client';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 20_000;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const APPROVED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ApprovedImageMimeType = (typeof APPROVED_IMAGE_MIME_TYPES)[number];
export type ValidatedImageMetadata = { mimeType: ApprovedImageMimeType; byteSize: number; width: number; height: number };

export function normalizeApprovedImageMimeType(value: string): ApprovedImageMimeType {
  const normalized = value.trim().toLowerCase();
  if (!APPROVED_IMAGE_MIME_TYPES.includes(normalized as ApprovedImageMimeType)) throw new HttpError(415, 'UNSUPPORTED_IMAGE_TYPE', 'Format foto belum didukung. Gunakan JPG, PNG, atau WebP.');
  return normalized as ApprovedImageMimeType;
}

function magicMime(buffer: Buffer): ApprovedImageMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function hasCompleteContainer(buffer: Buffer, mimeType: ApprovedImageMimeType): boolean {
  if (mimeType === 'image/png') return buffer.length >= 12 && buffer.subarray(-8, -4).equals(Buffer.from('IEND'));
  if (mimeType === 'image/jpeg') return buffer.length >= 2 && buffer.subarray(-2).equals(Buffer.from([0xff, 0xd9]));
  if (buffer.length < 12) return false;
  return buffer.readUInt32LE(4) === buffer.length - 8;
}

export async function validateImageBuffer(input: Uint8Array, declaredMimeType: string): Promise<ValidatedImageMetadata> {
  const buffer = Buffer.from(input);
  const mimeType = normalizeApprovedImageMimeType(declaredMimeType);
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, 'IMAGE_TOO_LARGE', 'Ukuran foto terlalu besar. Coba kompres lalu ulangi.');
  if (magicMime(buffer) !== mimeType) throw new HttpError(422, 'IMAGE_MAGIC_BYTES_INVALID', 'Isi foto tidak sesuai dengan formatnya.');
  if (!hasCompleteContainer(buffer, mimeType)) throw new HttpError(422, 'IMAGE_CORRUPT', 'Foto tidak dapat dibaca. Coba pilih foto lain.');
  try {
    const image = sharp(buffer, { failOn: 'error' });
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) throw new HttpError(422, 'IMAGE_DIMENSIONS_INVALID', 'Dimensi foto tidak didukung.');
    await image.stats();
    return { mimeType, byteSize: buffer.byteLength, width, height };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'IMAGE_CORRUPT', 'Foto tidak dapat dibaca. Coba pilih foto lain.');
  }
}

export async function validateUploadedObject(objectKey: string, client: R2Client): Promise<ValidatedImageMetadata & { body: Buffer }> {
  const head = await client.headObject(objectKey);
  if (!head.contentType || head.contentLength === null || !Number.isSafeInteger(head.contentLength)) throw new HttpError(422, 'IMAGE_METADATA_MISSING', 'Metadata foto tidak lengkap.');
  if (head.contentLength > MAX_IMAGE_BYTES) throw new HttpError(413, 'IMAGE_TOO_LARGE', 'Ukuran foto terlalu besar. Coba kompres lalu ulangi.');
  const object = await client.getObject(objectKey);
  if (object.body.byteLength !== head.contentLength) throw new HttpError(422, 'IMAGE_OBJECT_CHANGED', 'Foto berubah saat diunggah. Coba ulangi.');
  if (object.contentType && object.contentType.trim().toLowerCase() !== head.contentType.trim().toLowerCase()) throw new HttpError(422, 'IMAGE_OBJECT_CHANGED', 'Foto berubah saat diunggah. Coba ulangi.');
  return { ...(await validateImageBuffer(object.body, head.contentType)), body: object.body };
}
