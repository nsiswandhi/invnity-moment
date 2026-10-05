import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

describe('participant photo quota migration', () => {
  it('sets new events to 20 photos and upgrades only the previous standard quota', async () => {
    const database = new PGlite();
    await database.exec(`
      create table events (
        id text primary key,
        max_active_moments_per_participant integer not null default 10,
        updated_at timestamptz not null default now()
      );
      insert into events (id) values ('standard');
      insert into events (id, max_active_moments_per_participant) values ('custom', 15);
    `);

    let migration = '';
    try {
      migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0020_raise_participant_photo_quota.sql'), 'utf8');
    } catch {
      // RED: the migration has not shipped yet.
    }
    if (migration) await database.exec(migration);

    await database.exec("insert into events (id) values ('new-event')");
    const result = await database.query<{ id: string; max_active_moments_per_participant: number }>(
      'select id, max_active_moments_per_participant from events order by id',
    );

    expect(result.rows).toEqual([
      { id: 'custom', max_active_moments_per_participant: 15 },
      { id: 'new-event', max_active_moments_per_participant: 20 },
      { id: 'standard', max_active_moments_per_participant: 20 },
    ]);
  });
});
