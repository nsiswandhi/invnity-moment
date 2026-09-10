import type { CompressedImage } from '../../components/camera/image-compression';

export async function prepareImageForUpload(image: Blob, compress: (source: Blob) => Promise<CompressedImage>): Promise<CompressedImage> {
  try {
    return await compress(image);
  } catch {
    throw new Error('Foto tidak dapat dikompres. Ambil ulang foto sebelum mengunggah.');
  }
}
