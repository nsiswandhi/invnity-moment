import { HttpError } from './http-error';

type DatabaseErrorShape = { code?: unknown; message?: unknown };

const expectedDatabaseErrors: Record<string, () => HttpError> = {
  PARTICIPANT_EXISTS: () => new HttpError(409, 'RECOVERY_REQUIRED', 'Identitas ini tidak dapat digunakan untuk membuat sesi baru. Gunakan pemulihan akses.'),
  EVENT_NOT_FOUND: () => new HttpError(404, 'EVENT_NOT_FOUND', 'Acara tidak tersedia.'),
  PARTICIPANT_DISABLED: () => new HttpError(403, 'PARTICIPANT_DISABLED', 'Akses peserta tidak tersedia.'),
  SESSION_EXPIRED: () => new HttpError(401, 'UNAUTHENTICATED', 'Sesi kamu sudah berakhir. Silakan masuk kembali.'),
  '23505': () => new HttpError(409, 'CONFLICT', 'Permintaan bertentangan dengan data yang sudah ada.'),
  '23503': () => new HttpError(409, 'CONFLICT', 'Permintaan merujuk data yang tidak tersedia.'),
  '42501': () => new HttpError(403, 'DATABASE_FORBIDDEN', 'Permintaan tidak diizinkan.'),
  EVENT_ARCHIVED: () => new HttpError(409, 'EVENT_ARCHIVED', 'Acara sudah diarsipkan. Pendaftaran dan unggahan baru sudah ditutup.'),
  MOMENT_NOT_AVAILABLE: () => new HttpError(404, 'MOMENT_NOT_AVAILABLE', 'Momen tidak tersedia.'),
  INVALID_MOMENT_CATEGORY: () => new HttpError(400, 'INVALID_MOMENT_CATEGORY', 'Kategori momen tidak valid.'),
  INVALID_LIKE_IDENTITY: () => new HttpError(400, 'INVALID_LIKE_IDENTITY', 'Identitas like tidak valid.'),
};

export function toExpectedDatabaseHttpError(error: unknown): HttpError | null {
  if (error instanceof HttpError) return error;
  if (!error || typeof error !== 'object') return null;
  const { code, message } = error as DatabaseErrorShape;
  const identifier = typeof code === 'string' ? code : typeof message === 'string' ? message : '';
  return expectedDatabaseErrors[identifier]?.() ?? null;
}
