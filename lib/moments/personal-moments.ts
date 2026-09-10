import type { CursorPage, MomentCategory, MomentRecord } from '../db/types';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ApiErrorPayload = { error?: { message?: string } };

function errorMessage(payload: ApiErrorPayload, fallback: string): string {
  return payload.error?.message || fallback;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

export async function loadOwnedMoments(fetcher: Fetcher, cursor: string | null, limit = 20): Promise<CursorPage<MomentRecord>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const response = await fetcher(`/api/v1/me/moments?${params.toString()}`, { credentials: 'same-origin' });
  const payload = await readJson(response) as { data?: CursorPage<MomentRecord> } & ApiErrorPayload;
  if (!response.ok || !payload.data) throw new Error(errorMessage(payload, 'Momen belum dapat dimuat.'));
  return payload.data;
}

export function mergeOwnedMoments(server: CursorPage<MomentRecord>, local: MomentRecord[]): CursorPage<MomentRecord> {
  const merged = new Map<string, MomentRecord>();
  for (const moment of server.data) merged.set(moment.id, moment);
  for (const moment of local) if (!merged.has(moment.id)) merged.set(moment.id, moment);
  return { data: [...merged.values()], nextCursor: server.nextCursor };
}

export async function updateOwnedMomentRequest(fetcher: Fetcher, momentId: string, category: MomentCategory, csrf: string): Promise<MomentRecord> {
  const response = await fetcher(`/api/v1/me/moments/${momentId}`, {
    method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ category }),
  });
  const payload = await readJson(response) as { data?: { moment?: MomentRecord } } & ApiErrorPayload;
  if (!response.ok || !payload.data?.moment) throw new Error(errorMessage(payload, 'Kategori belum dapat disimpan.'));
  return payload.data.moment;
}

export async function deleteOwnedMomentRequest(fetcher: Fetcher, momentId: string, csrf: string): Promise<void> {
  const response = await fetcher(`/api/v1/me/moments/${momentId}`, { method: 'DELETE', credentials: 'same-origin', headers: { 'x-csrf-token': csrf } });
  const payload = await readJson(response) as ApiErrorPayload;
  if (!response.ok) throw new Error(errorMessage(payload, 'Foto belum dapat dihapus.'));
}
