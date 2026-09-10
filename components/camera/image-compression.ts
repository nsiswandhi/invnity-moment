'use client';

export const MAX_COMPRESSED_LONG_EDGE = 2048;
export const TARGET_COMPRESSED_MAX_BYTES = 2 * 1024 * 1024;
export type CompressedImage = { blob: Blob; width: number; height: number; mimeType: 'image/jpeg' };

function canvasFromImage(image: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_UNAVAILABLE');
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function compressedBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('IMAGE_COMPRESSION_FAILED')), 'image/jpeg', quality));
}

export async function compressImage(file: Blob, options: { maxLongEdge?: number; quality?: number; targetBytes?: number; minQuality?: number } = {}): Promise<CompressedImage> {
  const maxLongEdge = Math.max(1, Math.min(options.maxLongEdge ?? MAX_COMPRESSED_LONG_EDGE, MAX_COMPRESSED_LONG_EDGE));
  const quality = Math.max(0.1, Math.min(options.quality ?? 0.82, 1));
  const minQuality = Math.max(0.1, Math.min(options.minQuality ?? 0.4, quality));
  const targetBytes = Math.max(1, options.targetBytes ?? TARGET_COMPRESSED_MAX_BYTES);
  if ('createImageBitmap' in globalThis) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = canvasFromImage(bitmap, width, height);
    bitmap.close();
    let currentQuality = quality;
    let blob = await compressedBlob(canvas, currentQuality);
    while (blob.size > targetBytes && currentQuality > minQuality) {
      currentQuality = Math.max(minQuality, Math.round((currentQuality - 0.12) * 100) / 100);
      blob = await compressedBlob(canvas, currentQuality);
    }
    return { blob, width, height, mimeType: 'image/jpeg' };
  }
  throw new Error('IMAGE_DECODER_UNAVAILABLE');
}
