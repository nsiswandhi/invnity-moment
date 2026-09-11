import type { CursorPage, MomentRecord } from '../db/types';
import { buildMomentObjectKeys, isManagedMomentObjectKey } from '../media/object-keys';
import { createR2Client } from '../media/r2-client';

export const OWNED_MOMENT_URL_TTL_SECONDS = 300;
export type OwnedMoment = Omit<MomentRecord, 'r2OriginalKey' | 'r2DisplayKey' | 'r2ThumbnailKey'> & { thumbnailUrl?: string; displayUrl?: string };
export type OwnedMomentPresigner = { presignGet(key: string, input: { expiresInSeconds: number }): Promise<string> };

function createSigner(presigner?: OwnedMomentPresigner): OwnedMomentPresigner {
  if (presigner) return presigner;
  const r2 = createR2Client();
  return { presignGet: r2.presignGet.bind(r2) };
}

function safeDerivativeKey(moment: MomentRecord, variant: 'display' | 'thumbnail'): string | null {
  const candidate = variant === 'display' ? moment.r2DisplayKey : moment.r2ThumbnailKey;
  if (!candidate) return null;
  try {
    const expected = buildMomentObjectKeys({ eventId: moment.eventId, participantId: moment.participantId, momentId: moment.id })[variant];
    return isManagedMomentObjectKey(candidate) && candidate === expected ? candidate : null;
  } catch {
    return null;
  }
}

export async function serializeOwnedMoment(moment: MomentRecord, presigner?: OwnedMomentPresigner): Promise<OwnedMoment> {
  const signer = createSigner(presigner);
  const displayKey = safeDerivativeKey(moment, 'display');
  const thumbnailKey = safeDerivativeKey(moment, 'thumbnail');
  const [displayUrl, thumbnailUrl] = await Promise.all([
    displayKey ? signer.presignGet(displayKey, { expiresInSeconds: OWNED_MOMENT_URL_TTL_SECONDS }) : Promise.resolve(undefined),
    thumbnailKey ? signer.presignGet(thumbnailKey, { expiresInSeconds: OWNED_MOMENT_URL_TTL_SECONDS }) : Promise.resolve(undefined),
  ]);
  const { r2OriginalKey: _originalKey, r2DisplayKey: _displayKey, r2ThumbnailKey: _thumbnailKey, ...safeMoment } = moment;
  return { ...safeMoment, ...(displayUrl ? { displayUrl } : {}), ...(thumbnailUrl ? { thumbnailUrl } : {}) };
}

export async function serializeOwnedMoments(page: CursorPage<MomentRecord>, presigner?: OwnedMomentPresigner): Promise<CursorPage<OwnedMoment>> {
  const signer = createSigner(presigner);
  return { data: await Promise.all(page.data.map((moment) => serializeOwnedMoment(moment, signer))), nextCursor: page.nextCursor };
}
