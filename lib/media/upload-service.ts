import { randomUUID } from 'node:crypto';
import { HttpError } from '../errors/http-error';
import { completeMoment, deleteOwnedMoment, getMomentForParticipant, reserveMomentSlotWithState } from '../db/repositories/moments';
import { buildMomentObjectKeys, isManagedMomentObjectKey } from './object-keys';
import { createR2Client, type R2Client } from './r2-client';
import { processDerivatives, type DerivativeKeys } from './process-derivatives';
import { normalizeApprovedImageMimeType, validateUploadedObject, type ValidatedImageMetadata } from './validate-image';
import type { MomentCategory, MomentRecord } from '../db/types';

export const UPLOAD_AUTHORIZATION_TTL_SECONDS = 10 * 60;
export type UploadAuthorization = { momentId: string; reservationId: string; objectKey: string; uploadUrl: string; expiresAt: string; headers: { 'content-type': string } };
export type UploadMomentContext = Partial<MomentRecord> & { id: string; eventId?: string; participantId?: string; reservationExpiresAt?: string | null; reservationStatus?: string | null };
export type UploadServiceDependencies = {
  reserve?: (input: { eventId: string; participantId: string; reservationId: string; expiresAt: string }) => Promise<{ momentId: string; reservationId: string; expiresAt?: string; reservationStatus?: string }>;
  presignPut?: (key: string, input: { contentType: string; expiresInSeconds: number }) => Promise<string>;
  presignGet?: (key: string, input: { expiresInSeconds: number; download?: boolean }) => Promise<string>;
  getMoment?: (momentId: string, participantId: string) => Promise<UploadMomentContext>;
  readObject?: (key: string) => Promise<{ body: Buffer; contentType: string; contentLength?: number | null }>;
  process?: (key: string, body: Buffer, metadata: ValidatedImageMetadata, client: R2Client) => Promise<DerivativeKeys>;
  complete?: (momentId: string, participantId: string, metadata: Record<string, unknown>) => Promise<MomentRecord | UploadMomentContext>;
  cancel?: (momentId: string, participantId: string) => Promise<void>;
  r2?: R2Client;
}

function expiresAtFrom(now: Date): string { return new Date(now.getTime() + UPLOAD_AUTHORIZATION_TTL_SECONDS * 1000).toISOString(); }
function defaultR2(dependencies: UploadServiceDependencies): R2Client { return dependencies.r2 ?? createR2Client(); }
function defaultDependencies(dependencies: UploadServiceDependencies): Required<Pick<UploadServiceDependencies, 'reserve' | 'presignPut' | 'getMoment' | 'readObject' | 'process' | 'complete' | 'cancel'>> {
  return {
    reserve: dependencies.reserve ?? (async (input) => reserveMomentSlotWithState(input.participantId, input.eventId, input.reservationId, input.expiresAt)),
    presignPut: dependencies.presignPut ?? (async (key, input) => createR2Client().presignPut(key, input)),
    getMoment: dependencies.getMoment ?? (async (momentId, participantId) => {
      const context = await getMomentForParticipant(momentId, participantId);
      if (!context) throw new HttpError(404, 'MOMENT_NOT_FOUND', 'Momen tidak ditemukan.');
      return context;
    }),
    readObject: dependencies.readObject ?? (async (key) => { const r2 = createR2Client(); const object = await validateUploadedObject(key, r2); return { body: object.body, contentType: object.mimeType, contentLength: object.byteSize }; }),
    process: dependencies.process ?? ((key, body, metadata, client) => processDerivatives(key, body, metadata, client)),
    complete: dependencies.complete ?? ((momentId, _participantId, metadata) => completeMoment(momentId, metadata as never)),
    cancel: dependencies.cancel ?? (async (momentId, participantId) => { await deleteOwnedMoment(participantId, momentId); }),
  };
}

export function isUploadAuthorizationExpired(expiresAt: string, now = new Date()): boolean { return !Number.isFinite(Date.parse(expiresAt)) || new Date(expiresAt).getTime() <= now.getTime(); }

function uploadAuthorizationLifetime(expiresAt: string, now: Date): number {
  return Math.max(1, Math.min(UPLOAD_AUTHORIZATION_TTL_SECONDS, Math.floor((Date.parse(expiresAt) - now.getTime()) / 1_000)));
}

export async function createUploadAuthorization(input: { eventId: string; participantId: string; contentType: string; reservationId?: string; now?: Date }, dependencies: UploadServiceDependencies = {}): Promise<UploadAuthorization> {
  const contentType = normalizeApprovedImageMimeType(input.contentType);
  const now = input.now ?? new Date();
  const expiresAt = expiresAtFrom(now);
  if (isUploadAuthorizationExpired(expiresAt, now)) throw new HttpError(409, 'UPLOAD_AUTHORIZATION_EXPIRED', 'Otorisasi unggahan sudah kedaluwarsa.');
  const configured = defaultDependencies(dependencies);
  const reservation = await configured.reserve({ eventId: input.eventId, participantId: input.participantId, reservationId: input.reservationId ?? randomUUID(), expiresAt });
  const reservationExpiresAt = reservation.expiresAt ?? expiresAt;
  if (reservation.reservationStatus && reservation.reservationStatus !== 'RESERVED') {
    throw new HttpError(409, 'RESERVATION_NOT_ACTIVE', 'Otorisasi unggahan tidak lagi aktif. Silakan coba lagi.');
  }
  if (isUploadAuthorizationExpired(reservationExpiresAt, now)) {
    await configured.cancel(reservation.momentId, input.participantId).catch(() => undefined);
    throw new HttpError(409, 'UPLOAD_AUTHORIZATION_EXPIRED', 'Otorisasi unggahan sudah kedaluwarsa.');
  }
  try {
    const keys = buildMomentObjectKeys({ eventId: input.eventId, participantId: input.participantId, momentId: reservation.momentId });
    const uploadUrl = await configured.presignPut(keys.original, { contentType, expiresInSeconds: uploadAuthorizationLifetime(reservationExpiresAt, now) });
    return { momentId: reservation.momentId, reservationId: reservation.reservationId, objectKey: keys.original, uploadUrl, expiresAt: reservationExpiresAt, headers: { 'content-type': contentType } };
  } catch (error) {
    await configured.cancel(reservation.momentId, input.participantId).catch(() => undefined);
    throw error;
  }
}

export async function completeUpload(input: { momentId: string; participantId: string; category: MomentCategory; now?: Date }, dependencies: UploadServiceDependencies = {}): Promise<MomentRecord | UploadMomentContext> {
  const configured = defaultDependencies(dependencies);
  const context = await configured.getMoment!(input.momentId, input.participantId);
  if (!context.participantId || context.participantId !== input.participantId) throw new HttpError(403, 'MOMENT_FORBIDDEN', 'Momen ini bukan milikmu.');
  if (context.status === 'PUBLISHED') return context;
  if (context.reservationStatus && context.reservationStatus !== 'RESERVED') {
    await configured.cancel!(input.momentId, input.participantId).catch(() => undefined);
    throw new HttpError(409, 'RESERVATION_NOT_ACTIVE', 'Otorisasi unggahan tidak lagi aktif. Silakan coba lagi.');
  }
  if (context.status && context.status !== 'RESERVED') {
    await configured.cancel!(input.momentId, input.participantId).catch(() => undefined);
    throw new HttpError(409, 'RESERVATION_NOT_ACTIVE', 'Otorisasi unggahan tidak lagi aktif. Silakan coba lagi.');
  }
  const expiresAt = context.reservationExpiresAt;
  if (expiresAt && isUploadAuthorizationExpired(expiresAt, input.now ?? new Date())) {
    await configured.cancel!(input.momentId, input.participantId).catch(() => undefined);
    throw new HttpError(409, 'UPLOAD_AUTHORIZATION_EXPIRED', 'Otorisasi unggahan sudah kedaluwarsa. Silakan coba lagi.');
  }
  const r2 = defaultR2(dependencies);
  const expectedOriginalKey = buildMomentObjectKeys({ eventId: context.eventId!, participantId: input.participantId, momentId: input.momentId }).original;
  const objectKey = context.r2OriginalKey ?? expectedOriginalKey;
  if (!isManagedMomentObjectKey(objectKey) || objectKey !== expectedOriginalKey) throw new HttpError(422, 'INVALID_OBJECT_KEY_SCOPE', 'Objek unggahan tidak valid.');
  let derivatives: DerivativeKeys | undefined;
  try {
    const object = await configured.readObject!(objectKey);
    const metadata = await validateUploadedObject(objectKey, { ...r2, headObject: async () => ({ contentType: object.contentType, contentLength: object.contentLength ?? object.body.byteLength, etag: null }), getObject: async () => ({ body: object.body, contentType: object.contentType, contentLength: object.body.byteLength, etag: null }) });
    derivatives = await configured.process!(objectKey, metadata.body, metadata, r2);
    return await configured.complete!(input.momentId, input.participantId, { category: input.category, r2OriginalKey: objectKey, r2DisplayKey: derivatives.display, r2ThumbnailKey: derivatives.thumbnail, mimeType: metadata.mimeType, byteSize: metadata.byteSize, width: metadata.width, height: metadata.height });
  } catch (error) {
    await configured.cancel!(input.momentId, input.participantId).catch(() => undefined);
    if (derivatives) await Promise.allSettled([r2.deleteObject(derivatives.display), r2.deleteObject(derivatives.thumbnail)]);
    throw error;
  }
}

export async function createDownloadAuthorization(input: { momentId: string; participantId: string; variant?: 'display' | 'original'; now?: Date }, dependencies: UploadServiceDependencies = {}): Promise<{ downloadUrl: string; expiresAt: string }> {
  const configured = defaultDependencies(dependencies);
  const context = await configured.getMoment!(input.momentId, input.participantId);
  if (!context.participantId || context.participantId !== input.participantId) throw new HttpError(403, 'MOMENT_FORBIDDEN', 'Momen ini bukan milikmu.');
  if (context.status !== 'PUBLISHED' && context.status !== 'HIDDEN') throw new HttpError(404, 'MOMENT_NOT_AVAILABLE', 'Momen belum tersedia untuk diunduh.');
  const keys = buildMomentObjectKeys({ eventId: context.eventId!, participantId: input.participantId, momentId: input.momentId });
  const key = input.variant === 'original' ? context.r2OriginalKey : (context.r2DisplayKey ?? context.r2OriginalKey);
  if (!key) throw new HttpError(404, 'MOMENT_NOT_AVAILABLE', 'Foto belum tersedia.');
  const expectedKey = input.variant === 'original' ? keys.original : keys.display;
  if (!isManagedMomentObjectKey(key) || key !== expectedKey) throw new HttpError(422, 'INVALID_OBJECT_KEY_SCOPE', 'Objek unggahan tidak valid.');
  const r2 = defaultR2(dependencies);
  const presignGet = dependencies.presignGet ?? r2.presignGet.bind(r2);
  const expiresAt = new Date((input.now ?? new Date()).getTime() + 60_000).toISOString();
  return { downloadUrl: await presignGet(key, { expiresInSeconds: 60, download: true }), expiresAt };
}

export function isOrphanCleanupEligible(object: { key: string; createdAt: string; referenced: boolean }, now = new Date(), gracePeriodMs = 60 * 60 * 1000): boolean {
  const createdAt = Date.parse(object.createdAt);
  return isManagedMomentObjectKey(object.key) && !object.referenced && Number.isFinite(createdAt) && now.getTime() - createdAt >= gracePeriodMs;
}
