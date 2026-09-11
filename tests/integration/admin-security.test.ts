import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../lib/errors/http-error';
import { createAdminRepository, hideMoment, unhideMoment } from '../../lib/db/repositories/admin';
import { requireAdmin } from '../../lib/auth/admin';

const adminId = '16a8a4d1-226a-4571-9898-4c907d9f10ab';
const momentId = '26a8a4d1-226a-4571-9898-4c907d9f10ab';
const eventId = 'bd928dad-a8c6-40af-a482-30df35ad5e5b';

describe('admin security boundary', () => {
  it('does not treat a participant cookie as an admin session', async () => {
    const request = new Request('https://moments.example.test/api/v1/admin/summary', {
      headers: { cookie: 'invnity_session=participant-session' },
    });

    await expect(requireAdmin(request)).rejects.toMatchObject({ status: 401, code: 'ADMIN_UNAUTHENTICATED' });
  });

  it('passes the configured event to the atomic hide and audit RPC', async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    const repository = createAdminRepository({ rpc });

    await repository.hideMoment(eventId, adminId, momentId, 'Konten tidak sesuai acara.');

    expect(rpc).toHaveBeenCalledWith('set_admin_moment_visibility', {
      p_admin_user_id: adminId,
      p_event_id: eventId,
      p_moment_id: momentId,
      p_visibility: 'hidden',
      p_reason: 'Konten tidak sesuai acara.',
    });
  });

  it('passes the configured event to the atomic restore and audit RPC', async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    const repository = createAdminRepository({ rpc });

    await repository.unhideMoment(eventId, adminId, momentId);

    expect(rpc).toHaveBeenCalledWith('set_admin_moment_visibility', {
      p_admin_user_id: adminId,
      p_event_id: eventId,
      p_moment_id: momentId,
      p_visibility: 'published',
      p_reason: null,
    });
  });

  it('requires an operator-provided reason before hiding a moment', async () => {
    await expect(hideMoment(eventId, adminId, momentId, '   ')).rejects.toMatchObject({
      status: 400,
      code: 'MODERATION_REASON_REQUIRED',
    } satisfies Partial<HttpError>);
  });

  it('keeps public reads hidden-only by requiring PUBLISHED status in the database migration', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0007_task6_public_album.sql'), 'utf8');

    expect(migration).toMatch(/get_published_moment[\s\S]*m\.status = 'PUBLISHED' and m\.deleted_at is null/i);
    expect(migration).toMatch(/list_published_moments[\s\S]*m\.status = 'PUBLISHED' and m\.deleted_at is null/i);
  });

  it('blocks registration and upload reservations while maintenance is active', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0008_task7_admin_operations.sql'), 'utf8');

    expect(migration).toMatch(/register_participant_for_event[\s\S]*v_event\.status in \('maintenance', 'archived'\)[\s\S]*EVENT_WRITE_DISABLED/i);
    expect(migration).toMatch(/reserve_moment_slot[\s\S]*v_event_status in \('maintenance', 'archived'\)[\s\S]*EVENT_WRITE_DISABLED/i);
  });
});
