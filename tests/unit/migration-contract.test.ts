import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0001_initial_schema.sql'), 'utf8');
const participantAuthMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0003_participant_auth.sql'), 'utf8');
const recoveryOutboxMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0004_recovery_outbox_hardening.sql'), 'utf8');
const publicAlbumMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0007_task6_public_album.sql'), 'utf8');
let task4FixMigration = '';
try { task4FixMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0005_task4_review_fixes.sql'), 'utf8'); } catch { /* RED: migration is not shipped yet. */ }

describe('initial schema reservation contract', () => {
  it('normalizes participant emails before enforcing event-local uniqueness', () => {
    expect(migration).toMatch(/new\.email\s*:=\s*lower\(btrim\(new\.email\)\)/i);
    expect(migration).toMatch(/create trigger participants_normalize_email\s+before insert or update of email on participants/i);
  });

  it('enforces event-local participant email uniqueness case-insensitively', () => {
    expect(migration).toMatch(/create unique index participants_event_lower_email_unique_idx\s+on participants\s*\(event_id,\s*lower\(email\)\)/i);
  });

  it('scopes reservation replay identity to its participant and event', () => {
    expect(migration).toMatch(/event_id uuid not null references events\(id\)/i);
    expect(migration).toMatch(/primary key\s*\(participant_id,\s*event_id,\s*id\)/i);
    expect(migration).toMatch(/ur\.id\s*=\s*p_reservation_id\s+and ur\.participant_id\s*=\s*p_participant_id\s+and ur\.event_id\s*=\s*p_event_id/i);
  });

  it('publishes only by consuming a locked unexpired active reservation', () => {
    expect(migration).toMatch(/select \* into v_reservation from upload_reservations[\s\S]*where moment_id = p_moment_id[\s\S]*for update/i);
    expect(migration).toMatch(/v_reservation\.status\s*<>\s*'RESERVED'[\s\S]*v_reservation\.expires_at\s*<=\s*clock_timestamp\(\)/i);
    expect(migration).toMatch(/update upload_reservations set status = 'COMPLETED'[\s\S]*where moment_id = p_moment_id and status = 'RESERVED' and expires_at > clock_timestamp\(\)/i);
  });

  it('keeps completed metadata immutable and requires valid metadata before publication', () => {
    expect(migration).toMatch(/if v_moment\.status = 'PUBLISHED' then[\s\S]*return[\s\S]*end if;/i);
    expect(migration).toMatch(/if p_metadata is null\s+or jsonb_typeof\(p_metadata\)\s*<>\s*'object'/i);
    expect(migration).toMatch(/raise exception 'INVALID_MOMENT_METADATA'/i);
    expect(migration).toMatch(/check\s*\(status\s*<>\s*'PUBLISHED'\s+or/i);
  });

  it('cancels deleted reservations and omits deleted rows from owned lists', () => {
    expect(migration).toMatch(/update upload_reservations set status = 'CANCELLED'[\s\S]*where moment_id = p_moment_id and status = 'RESERVED'/i);
    expect(migration).toMatch(/from moments where participant_id = p_participant_id and deleted_at is null/i);
  });
});

describe('public album migration contract', () => {
  it('orders public pages by published time and ID, bounds the default page, and excludes hidden/deleted rows', () => {
    expect(publicAlbumMigration).toMatch(/create or replace function list_published_moments/i);
    expect(publicAlbumMigration).toMatch(/least\(greatest\(coalesce\(p_limit,\s*30\),\s*1\),\s*50\)/i);
    expect(publicAlbumMigration).toMatch(/status = 'PUBLISHED' and m\.deleted_at is null/i);
    expect(publicAlbumMigration).toMatch(/order by m\.published_at desc, m\.id desc/i);
    expect(publicAlbumMigration).toMatch(/p_anonymous_user_key_hash text/i);
    expect(publicAlbumMigration).toMatch(/jsonb_build_object\('publishedAt'/i);
  });

  it('enforces active anonymous like uniqueness and validates categories', () => {
    expect(publicAlbumMigration).toMatch(/create or replace function set_public_moment_like/i);
    expect(publicAlbumMigration).toMatch(/on conflict \(moment_id, anonymous_user_key_hash\) where revoked_at is null do nothing/i);
    expect(publicAlbumMigration).toMatch(/p_category is not null and p_category not in/i);
    expect(publicAlbumMigration).toMatch(/p_event_id uuid/i);
  });

  it('blocks registration and reservations after the event is archived', () => {
    expect(publicAlbumMigration).toMatch(/register_participant_for_event[\s\S]*v_event\.status = 'archived'[\s\S]*EVENT_ARCHIVED/i);
    expect(publicAlbumMigration).toMatch(/reserve_moment_slot[\s\S]*v_event_status = 'archived'[\s\S]*EVENT_ARCHIVED/i);
    expect(publicAlbumMigration).toMatch(/complete_moment[\s\S]*v_event_status = 'archived'[\s\S]*EVENT_ARCHIVED/i);
    expect(publicAlbumMigration).toMatch(/select \* into v_event from events where id = v_moment\.event_id for update/i);
  });
});

describe('participant registration migration contract', () => {
  it('rejects a duplicate identity instead of returning it to an unauthenticated registration', () => {
    expect(participantAuthMigration).toMatch(/select \* into v_participant from participants[\s\S]*if found then raise exception 'PARTICIPANT_EXISTS'; end if;[\s\S]*insert into participants/i);
  });

  it('permits only a matching active session to resume a participant identity', () => {
    expect(participantAuthMigration).toMatch(/create or replace function resume_participant_for_event[\s\S]*p_participant_id uuid[\s\S]*p_session_token_hash text/i);
    expect(participantAuthMigration).toMatch(/and s\.participant_id = p_participant_id[\s\S]*s\.session_token_hash = p_session_token_hash[\s\S]*s\.revoked_at is null[\s\S]*s\.expires_at > clock_timestamp\(\)/i);
  });
});

describe('recovery outbox migration contract', () => {
  it('removes legacy raw recovery URLs and replaces them with encrypted delivery payloads', () => {
    expect(recoveryOutboxMigration).toMatch(/delete from recovery_delivery_outbox;/i);
    expect(recoveryOutboxMigration).toMatch(/alter table recovery_delivery_outbox\s+drop column recovery_url;/i);
    expect(recoveryOutboxMigration).toMatch(/add column delivery_payload_ciphertext text/i);
    expect(recoveryOutboxMigration).toMatch(/create or replace function create_recovery_token[\s\S]*p_delivery_payload_ciphertext text/i);
    expect(recoveryOutboxMigration).toMatch(/insert into recovery_delivery_outbox[\s\S]*delivery_payload_ciphertext/i);
  });

  it('rejects non-ciphertext recovery delivery payloads at the database boundary', () => {
    expect(recoveryOutboxMigration).toMatch(/p_delivery_payload_ciphertext\s*!~\s*'\^v1/i);
  });

  it('drops the legacy recovery-token signature before replacing its renamed payload parameter', () => {
    const legacySignature = /drop function if exists create_recovery_token\s*\(\s*text\s*,\s*uuid\s*,\s*text\s*,\s*timestamptz\s*,\s*text\s*\)\s*;/i;
    const dropMatch = recoveryOutboxMigration.match(legacySignature);
    const replaceIndex = recoveryOutboxMigration.search(/create or replace function create_recovery_token/i);

    expect(dropMatch).not.toBeNull();
    expect(dropMatch?.index ?? Number.POSITIVE_INFINITY).toBeLessThan(replaceIndex);
  });

  it('persists a generic no-op delivery record for unknown recovery identities', () => {
    expect(recoveryOutboxMigration).toMatch(/if not found then[\s\S]*insert into recovery_delivery_outbox[\s\S]*'NOOP'[\s\S]*return jsonb_build_object\('queued', false\)/i);
  });

  it('claims recovery deliveries atomically with a lease and claim token', () => {
    expect(recoveryOutboxMigration).toMatch(/create or replace function claim_recovery_delivery_outbox/i);
    expect(recoveryOutboxMigration).toMatch(/for update of o skip locked/i);
    expect(recoveryOutboxMigration).toMatch(/claim_token = gen_random_uuid\(\)/i);
    expect(recoveryOutboxMigration).toMatch(/attempts = o\.attempts \+ 1/i);
  });

  it('purges terminal or expired delivery records and bounds retries', () => {
    expect(recoveryOutboxMigration).toMatch(/delete from recovery_delivery_outbox o[\s\S]*recovery_tokens t[\s\S]*t\.expires_at <= p_now/i);
    expect(recoveryOutboxMigration).toMatch(/status = 'SENT'[\s\S]*sent_at < p_now - interval '1 day'/i);
    expect(recoveryOutboxMigration).toMatch(/status = case when attempts >= p_max_attempts then 'FAILED' else 'PENDING' end/i);
    expect(recoveryOutboxMigration).toMatch(/update recovery_delivery_outbox[\s\S]*status = 'FAILED'[\s\S]*attempts >= p_max_attempts/i);
  });
});

describe('Task 4 review-fix migration contract', () => {
  it('ships the default participant-scoped moment lookup RPC with reservation state', () => {
    expect(task4FixMigration).toMatch(/create or replace function get_moment_for_participant\s*\(p_moment_id uuid, p_participant_id uuid\)[\s\S]*upload_reservations/i);
    expect(task4FixMigration).toMatch(/reservationExpiresAt/i);
    expect(task4FixMigration).toMatch(/reservationStatus/i);
    expect(task4FixMigration).toMatch(/where m\.id = p_moment_id and m\.participant_id = p_participant_id/i);
  });

  it('makes reservation replay reject inactive IDs and return the persisted active expiry', () => {
    expect(task4FixMigration).toMatch(/drop function if exists reserve_moment_slot\s*\(uuid, uuid, uuid, timestamptz\)/i);
    expect(task4FixMigration).toMatch(/if v_reservation\.status <> 'RESERVED' or v_reservation\.expires_at <= clock_timestamp\(\)[\s\S]*raise exception 'RESERVATION_NOT_ACTIVE'/i);
    expect(task4FixMigration).toMatch(/return query select v_reservation\.moment_id, v_reservation\.id, v_reservation\.expires_at/i);
    expect(task4FixMigration).toMatch(/returns table\s*\(moment_id uuid, reservation_id uuid, expires_at timestamptz, reservation_status text\)/i);
  });
});
