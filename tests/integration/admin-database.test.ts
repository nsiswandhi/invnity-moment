import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const eventId = 'bd928dad-a8c6-40af-a482-30df35ad5e5b';
const otherEventId = 'cd928dad-a8c6-40af-a482-30df35ad5e5b';
const participantId = 'e3a7c9f1-30b0-4f8b-9ad4-5adfc8445e5c';
const adminId = '16a8a4d1-226a-4571-9898-4c907d9f10ab';
const momentId = '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219';
const otherMomentId = '2ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219';
const prefix = `events/${eventId}/participants/${participantId}/moments/${momentId}`;
let db: PGlite;

async function rejectSql(sql: string, params: unknown[], message: string) {
  await db.exec('savepoint expected_error');
  await expect(db.query(sql, params)).rejects.toMatchObject({ message });
  await db.exec('rollback to savepoint expected_error');
}

async function moderate(target: string, visibility: 'hidden' | 'published', scope: string | null = eventId) {
  return db.query('select set_admin_moment_visibility(p_admin_user_id => $1, p_event_id => $2, p_moment_id => $3, p_visibility => $4, p_reason => $5)',
    [adminId, scope, target, visibility, visibility === 'hidden' ? 'Privasi peserta.' : null]);
}

describe('Task 7 migrations executed in PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec('create role anon; create role authenticated; create role service_role;');
    const directory = resolve('supabase/migrations');
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(readFileSync(resolve(directory, file), 'utf8'));
    }
    await db.query("insert into events (id, slug, name, event_date, status) values ($1, 'admin-test', 'Admin test', '2026-10-10', 'live'), ($2, 'other-test', 'Other event', '2026-10-10', 'live')", [eventId, otherEventId]);
    await db.query("insert into participants (id, event_id, name, batch, email, consent_version, consented_at) values ($1, $2, 'Andi', '1996', 'andi@example.test', 'test', now())", [participantId, eventId]);
    await db.query("insert into admin_users (id, email, password_hash) values ($1, 'operator@example.test', 'unused')", [adminId]);
    await db.query(`insert into moments (id, event_id, participant_id, status, category, r2_original_key, r2_display_key, r2_thumbnail_key, mime_type, byte_size, width, height, published_at)
      values ($1, $2, $3, 'PUBLISHED', 'REUNI', $4, $5, $6, 'image/jpeg', 100, 10, 10, now()),
             ($7, $8, $3, 'PUBLISHED', 'REUNI', 'other/original', null, null, 'image/jpeg', 100, 10, 10, now())`,
    [momentId, eventId, participantId, `${prefix}/original`, `${prefix}/display.jpg`, `${prefix}/thumbnail.jpg`, otherMomentId, otherEventId]);
  }, 30_000);
  beforeEach(async () => { await db.exec('begin'); });
  afterEach(async () => { await db.exec('rollback'); });
  afterAll(async () => { await db?.close(); });

  it('returns scoped media keys for operator previews, including hidden photos', async () => {
    await db.query("update moments set status = 'HIDDEN' where id = $1", [momentId]);
    const result = await db.query<{ photos: Array<Record<string, unknown>> }>("select list_admin_moments($1, 'hidden', 30) as photos", [eventId]);
    expect(result.rows[0].photos).toEqual([expect.objectContaining({ id: momentId, participantId, r2DisplayKey: `${prefix}/display.jpg`, r2ThumbnailKey: `${prefix}/thumbnail.jpg` })]);
    expect(result.rows[0].photos[0]).not.toHaveProperty('email');
  });

  it('hides and restores a same-event photo with separate audit records and public exclusion', async () => {
    await moderate(momentId, 'hidden');
    expect((await db.query<{ photo: unknown }>('select get_published_moment($1, $2, null) as photo', [eventId, momentId])).rows[0].photo).toBeNull();
    await moderate(momentId, 'published');
    expect((await db.query<{ photo: { id: string } }>('select get_published_moment($1, $2, null) as photo', [eventId, momentId])).rows[0].photo.id).toBe(momentId);
    expect((await db.query('select action, reason from moderation_actions where moment_id = $1 order by created_at', [momentId])).rows).toEqual([
      { action: 'HIDE', reason: 'Privasi peserta.' }, { action: 'UNHIDE', reason: null },
    ]);
  });

  it.each(['hidden', 'published'] as const)('rejects cross-event %s without changing the photo or writing an audit', async (visibility) => {
    const initialStatus = visibility === 'hidden' ? 'PUBLISHED' : 'HIDDEN';
    await db.query('update moments set status = $1 where id = $2', [initialStatus, otherMomentId]);
    await db.exec('savepoint cross_event');
    await expect(moderate(otherMomentId, visibility)).rejects.toMatchObject({ message: 'MOMENT_NOT_AVAILABLE' });
    await db.exec('rollback to savepoint cross_event');
    expect((await db.query('select status from moments where id = $1', [otherMomentId])).rows).toEqual([{ status: initialStatus }]);
    expect((await db.query('select id from moderation_actions')).rows).toHaveLength(0);
  });

  it('rejects a missing event scope', async () => {
    await expect(moderate(momentId, 'hidden', null)).rejects.toMatchObject({ message: 'MOMENT_NOT_AVAILABLE' });
  });

  it('removes the legacy unscoped RPC so it cannot bypass the event boundary', async () => {
    expect((await db.query("select to_regprocedure('set_admin_moment_visibility(uuid,uuid,text,text)') as legacy")).rows).toEqual([{ legacy: null }]);
  });

  it.each(['update', 'delete', 'truncate'])('denies %s of existing moderation audit records', async (operation) => {
    await db.query("insert into moderation_actions (admin_user_id, moment_id, action, reason) values ($1, $2, 'HIDE', 'Original reason')", [adminId, momentId]);
    const sql = operation === 'update' ? "update moderation_actions set reason = 'Tampered'" : `${operation === 'truncate' ? 'truncate' : 'delete from'} moderation_actions`;
    await rejectSql(sql, [], 'MODERATION_AUDIT_IMMUTABLE');
    expect((await db.query('select action, reason from moderation_actions')).rows).toEqual([{ action: 'HIDE', reason: 'Original reason' }]);
  });

  it('limits analytics event and aggregate RPC execution to the service role', async () => {
    const permissions = await db.query<{ anon_record: boolean; anon_funnel: boolean; anon_sponsor: boolean; service_record: boolean; table_read: boolean }>(`
      select
        has_function_privilege('anon', 'record_analytics_event(uuid,uuid,text,jsonb)', 'execute') as anon_record,
        has_function_privilege('anon', 'get_analytics_funnel_summary(uuid)', 'execute') as anon_funnel,
        has_function_privilege('anon', 'get_sponsor_summary(uuid)', 'execute') as anon_sponsor,
        has_function_privilege('service_role', 'record_analytics_event(uuid,uuid,text,jsonb)', 'execute') as service_record,
        has_table_privilege('anon', 'analytics_events', 'select') as table_read
    `);

    expect(permissions.rows).toEqual([{ anon_record: false, anon_funnel: false, anon_sponsor: false, service_record: true, table_read: false }]);
  });

  describe.each(['maintenance', 'archived'])('%s mode', (mode) => {
    beforeEach(async () => { await db.query('select set_admin_event_mode($1, $2)', [eventId, mode]); });

    it('blocks participant category changes', async () => {
      await rejectSql('select update_owned_moment($1, $2, $3)', [participantId, momentId, 'FESTIVAL'], 'EVENT_WRITE_DISABLED');
      expect((await db.query('select category from moments where id = $1', [momentId])).rows).toEqual([{ category: 'REUNI' }]);
    });

    it('blocks participant deletion without losing the photo', async () => {
      await rejectSql('select delete_owned_moment($1, $2)', [participantId, momentId], 'EVENT_WRITE_DISABLED');
      expect((await db.query('select deleted_at from moments where id = $1', [momentId])).rows).toEqual([{ deleted_at: null }]);
    });

    it('continues blocking registration and reservations', async () => {
      await rejectSql("select register_participant_for_event('admin-test', 'New', '2000', 'new@example.test', 'test')", [], 'EVENT_WRITE_DISABLED');
      await rejectSql("select * from reserve_moment_slot($1, $2, gen_random_uuid(), now() + interval '1 hour')", [participantId, eventId], 'EVENT_WRITE_DISABLED');
    });

    it('blocks completion atomically and retains the reservation', async () => {
      await db.query("update events set status = 'live' where id = $1", [eventId]);
      const reservation = (await db.query<{ moment_id: string }>("select * from reserve_moment_slot($1, $2, gen_random_uuid(), now() + interval '1 hour')", [participantId, eventId])).rows[0];
      await db.query('select set_admin_event_mode($1, $2)', [eventId, mode]);
      const metadata = { category: 'REUNI', r2OriginalKey: 'test/original', r2DisplayKey: null, r2ThumbnailKey: null, mimeType: 'image/jpeg', byteSize: 100, width: 10, height: 10 };
      await rejectSql('select complete_moment($1, $2::jsonb)', [reservation.moment_id, JSON.stringify(metadata)], mode === 'archived' ? 'EVENT_ARCHIVED' : 'EVENT_WRITE_DISABLED');
      expect((await db.query('select status from upload_reservations where moment_id = $1', [reservation.moment_id])).rows).toEqual([{ status: 'RESERVED' }]);
    });

    it('preserves public reads and admin moderation', async () => {
      expect((await db.query<{ photo: { id: string } }>('select get_published_moment($1, $2, null) as photo', [eventId, momentId])).rows[0].photo.id).toBe(momentId);
      await moderate(momentId, 'hidden');
      await moderate(momentId, 'published');
    });
  });

  it.each(['live', 'pre_event'])('preserves participant edits and deletes in %s mode', async (mode) => {
    await db.query('update events set status = $1 where id = $2', [mode, eventId]);
    await db.query("select update_owned_moment($1, $2, 'FESTIVAL')", [participantId, momentId]);
    expect((await db.query('select category from moments where id = $1', [momentId])).rows).toEqual([{ category: 'FESTIVAL' }]);
    await db.query('select delete_owned_moment($1, $2)', [participantId, momentId]);
    expect((await db.query<{ deleted: boolean }>('select deleted_at is not null as deleted from moments where id = $1', [momentId])).rows[0].deleted).toBe(true);
  });
});
