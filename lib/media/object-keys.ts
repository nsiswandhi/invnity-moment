import { HttpError } from '../errors/http-error';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MomentObjectKeyScope = { eventId: string; participantId: string; momentId: string };
export type MomentObjectKeys = { original: string; display: string; thumbnail: string };

function safeUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new HttpError(400, 'INVALID_OBJECT_KEY_SCOPE', 'Objek unggahan tidak valid.');
  return value.toLowerCase();
}

export function buildMomentObjectKeys(scope: MomentObjectKeyScope): MomentObjectKeys {
  const eventId = safeUuid(scope.eventId);
  const participantId = safeUuid(scope.participantId);
  const momentId = safeUuid(scope.momentId);
  const prefix = `events/${eventId}/participants/${participantId}/moments/${momentId}`;
  return { original: `${prefix}/original`, display: `${prefix}/display.jpg`, thumbnail: `${prefix}/thumbnail.jpg` };
}

export function isManagedMomentObjectKey(key: string): boolean {
  const match = /^events\/([^/]+)\/participants\/([^/]+)\/moments\/([^/]+)\/(original|display\.jpg|thumbnail\.jpg)$/i.exec(key);
  if (!match) return false;
  try {
    safeUuid(match[1]);
    safeUuid(match[2]);
    safeUuid(match[3]);
    return true;
  } catch {
    return false;
  }
}

export function derivativeKey(originalKey: string, variant: 'display' | 'thumbnail'): string {
  if (!isManagedMomentObjectKey(originalKey) || !originalKey.endsWith('/original')) {
    throw new HttpError(400, 'INVALID_OBJECT_KEY_SCOPE', 'Objek unggahan tidak valid.');
  }
  return `${originalKey.slice(0, -'/original'.length)}/${variant}.jpg`;
}
