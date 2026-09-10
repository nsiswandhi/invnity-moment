import { hashOpaqueToken } from '../../auth/session';
import { createDatabaseClient, type DatabaseClient } from '../client';
import type { CursorPage, MomentCategory, PublicMoment } from '../types';
import { createR2Client } from '../../media/r2-client';
import { isManagedMomentObjectKey } from '../../media/object-keys';

export type PublicMomentRow = {
  id: string;
  category: MomentCategory;
  likeCount: number;
  createdAt: string;
  publishedAt: string;
  r2DisplayKey: string | null;
  r2ThumbnailKey: string | null;
  r2OriginalKey: string;
};

export type PublicLikeResult = { liked: boolean; likeCount: number };
export type PublicAlbumPresigner = { presignGet(key: string, input: { expiresInSeconds: number; download?: boolean }): Promise<string> };
export type PublicAlbumDatabase = {
  listPublishedMoments(input: { eventId: string; category: MomentCategory | null; cursor: string | null; limit: number }): Promise<CursorPage<PublicMoment>>;
  getPublishedMoment(momentId: string): Promise<PublicMoment | null>;
  toggleLike(input: { momentId: string; anonymousUserKey: string; liked: boolean }): Promise<PublicLikeResult>;
  authorizeDownload(input: { momentId: string; variant: 'display' | 'original' }): Promise<{ downloadUrl: string; expiresAt: string }>;
};

let configuredDatabase: PublicAlbumDatabase | undefined;

function assertPublicKey(key: string | null): string {
  if (!key || !isManagedMomentObjectKey(key)) throw new Error('INVALID_PUBLIC_MEDIA_KEY');
  return key;
}

function createSigner(presigner?: PublicAlbumPresigner): PublicAlbumPresigner {
  if (presigner) return presigner;
  const r2 = createR2Client();
  return { presignGet: r2.presignGet.bind(r2) };
}

export function createSupabasePublicAlbumDatabase(client: DatabaseClient, presigner?: PublicAlbumPresigner): PublicAlbumDatabase {
  const signer = createSigner(presigner);
  const toPublicMoment = async (row: PublicMomentRow): Promise<PublicMoment> => {
    const displayKey = assertPublicKey(row.r2DisplayKey ?? row.r2OriginalKey);
    const thumbnailKey = assertPublicKey(row.r2ThumbnailKey ?? row.r2DisplayKey ?? row.r2OriginalKey);
    const [displayUrl, thumbnailUrl] = await Promise.all([
      signer.presignGet(displayKey, { expiresInSeconds: 300 }),
      signer.presignGet(thumbnailKey, { expiresInSeconds: 300 }),
    ]);
    return { id: row.id, category: row.category, likeCount: row.likeCount, createdAt: row.createdAt, publishedAt: row.publishedAt, thumbnailUrl, displayUrl };
  };

  return {
    async listPublishedMoments(input) {
      const page = await client.rpc<CursorPage<PublicMomentRow>>('list_published_moments', {
        p_event_id: input.eventId, p_category: input.category, p_cursor: input.cursor, p_limit: input.limit,
      });
      return { data: await Promise.all(page.data.map(toPublicMoment)), nextCursor: page.nextCursor };
    },
    async getPublishedMoment(momentId) {
      const row = await client.rpc<PublicMomentRow | null>('get_published_moment', { p_moment_id: momentId });
      return row ? toPublicMoment(row) : null;
    },
    toggleLike(input) {
      return client.rpc<PublicLikeResult>('set_public_moment_like', {
        p_moment_id: input.momentId,
        p_anonymous_user_key_hash: hashOpaqueToken(input.anonymousUserKey),
        p_liked: input.liked,
      });
    },
    async authorizeDownload(input) {
      const row = await client.rpc<PublicMomentRow | null>('get_published_moment', { p_moment_id: input.momentId });
      if (!row) return Promise.reject(new Error('MOMENT_NOT_AVAILABLE'));
      const key = input.variant === 'original' ? assertPublicKey(row.r2OriginalKey) : assertPublicKey(row.r2DisplayKey ?? row.r2OriginalKey);
      const now = new Date();
      return { downloadUrl: await signer.presignGet(key, { expiresInSeconds: 60, download: true }), expiresAt: new Date(now.getTime() + 60_000).toISOString() };
    },
  };
}

function database(): PublicAlbumDatabase {
  if (!configuredDatabase) configuredDatabase = createSupabasePublicAlbumDatabase(createDatabaseClient());
  return configuredDatabase;
}

export function configurePublicAlbumRepository(repository: PublicAlbumDatabase | undefined): void { configuredDatabase = repository; }
export function listPublishedMoments(input: { eventId: string; category: MomentCategory | null; cursor: string | null; limit: number }): Promise<CursorPage<PublicMoment>> { return database().listPublishedMoments(input); }
export function getPublishedMoment(momentId: string): Promise<PublicMoment | null> { return database().getPublishedMoment(momentId); }
export function toggleLike(input: { momentId: string; anonymousUserKey: string; liked: boolean }): Promise<PublicLikeResult> { return database().toggleLike(input); }
export function authorizePublicDownload(input: { momentId: string; variant: 'display' | 'original' }): Promise<{ downloadUrl: string; expiresAt: string }> { return database().authorizeDownload(input); }
