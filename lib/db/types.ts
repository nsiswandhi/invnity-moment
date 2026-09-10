export const MOMENT_CATEGORIES = ['REUNI', 'PANGGUNG', 'FESTIVAL', 'BAZAAR', 'KOMUNITAS', 'ZERO_WASTE', 'NOSTALGIA', 'MOMEN_KITA'] as const;
export type MomentCategory = (typeof MOMENT_CATEGORIES)[number];
export type MomentStatus = 'RESERVED' | 'UPLOADING' | 'PROCESSING' | 'PUBLISHED' | 'HIDDEN' | 'REJECTED';

export type MomentObjectMetadata = {
  category: MomentCategory;
  r2OriginalKey: string;
  r2DisplayKey: string | null;
  r2ThumbnailKey: string | null;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
};

export function assertCompleteMomentMetadata(value: unknown): asserts value is MomentObjectMetadata {
  if (!value || typeof value !== 'object') throw new Error('INVALID_MOMENT_METADATA');
  const metadata = value as Record<string, unknown>;
  const optionalKeyIsValid = (key: 'r2DisplayKey' | 'r2ThumbnailKey') => metadata[key] === null || (typeof metadata[key] === 'string' && metadata[key].trim().length > 0);
  const positiveSafeInteger = (candidate: unknown) => typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate > 0;
  if (
    typeof metadata.category !== 'string' || !MOMENT_CATEGORIES.includes(metadata.category as MomentCategory)
    || typeof metadata.r2OriginalKey !== 'string' || metadata.r2OriginalKey.trim().length === 0
    || !optionalKeyIsValid('r2DisplayKey') || !optionalKeyIsValid('r2ThumbnailKey')
    || typeof metadata.mimeType !== 'string' || !/^image\/[a-z0-9.+-]+$/i.test(metadata.mimeType)
    || !positiveSafeInteger(metadata.byteSize)
    || !positiveSafeInteger(metadata.width)
    || !positiveSafeInteger(metadata.height)
  ) throw new Error('INVALID_MOMENT_METADATA');
}

export type MomentRecord = MomentObjectMetadata & {
  id: string;
  participantId: string;
  eventId: string;
  status: MomentStatus;
  createdAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
};

export type CursorPage<T> = { data: T[]; nextCursor: string | null };

export type PublicMoment = {
  id: string;
  category: MomentCategory;
  likeCount: number;
  createdAt: string;
  publishedAt: string;
  thumbnailUrl: string;
  displayUrl: string;
};
