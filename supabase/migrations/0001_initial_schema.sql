create extension if not exists pgcrypto;

create table events (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null, event_date date not null,
  status text not null check (status in ('pre_event','live','archived','maintenance')), max_participants integer not null default 500 check (max_participants > 0),
  max_active_moments_per_participant integer not null default 10 check (max_active_moments_per_participant > 0), sponsor_cta_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table participants (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id), name text not null, batch text not null, email text not null,
  created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), consent_version text not null, consented_at timestamptz not null,
  status text not null default 'active' check (status in ('active','disabled')), unique (id, event_id)
);
create table access_sessions (
  id uuid primary key default gen_random_uuid(), participant_id uuid not null references participants(id), session_token_hash text not null unique,
  created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz,
  user_agent_hash text, ip_hash text
);
create table moments (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id), participant_id uuid not null references participants(id),
  category text check (category in ('REUNI','PANGGUNG','FESTIVAL','BAZAAR','KOMUNITAS','ZERO_WASTE','NOSTALGIA','MOMEN_KITA')),
  status text not null check (status in ('RESERVED','UPLOADING','PROCESSING','PUBLISHED','HIDDEN','REJECTED')), r2_original_key text, r2_display_key text, r2_thumbnail_key text,
  upload_token_id uuid, mime_type text, byte_size bigint, width integer, height integer, created_at timestamptz not null default now(), published_at timestamptz,
  deleted_at timestamptz, hidden_at timestamptz, hidden_reason text, processing_error text,
  check (status <> 'PUBLISHED' or (
    category is not null and length(btrim(r2_original_key)) > 0 and (r2_display_key is null or length(btrim(r2_display_key)) > 0)
    and (r2_thumbnail_key is null or length(btrim(r2_thumbnail_key)) > 0) and mime_type ~* '^image/[a-z0-9.+-]+$'
    and byte_size > 0 and width > 0 and height > 0 and published_at is not null
  ))
);
create table upload_reservations (
  id uuid not null, participant_id uuid not null, event_id uuid not null references events(id), moment_id uuid not null unique references moments(id), expires_at timestamptz not null,
  status text not null default 'RESERVED' check (status in ('RESERVED','COMPLETED','CANCELLED','EXPIRED')), created_at timestamptz not null default now(), completed_at timestamptz,
  primary key (participant_id, event_id, id), foreign key (participant_id, event_id) references participants(id, event_id)
);
create table likes (id uuid primary key default gen_random_uuid(), moment_id uuid not null references moments(id), anonymous_user_key_hash text not null, created_at timestamptz not null default now(), revoked_at timestamptz);
create table admin_users (id uuid primary key default gen_random_uuid(), email text not null unique, password_hash text not null, status text not null default 'active', created_at timestamptz not null default now(), last_seen_at timestamptz);
create table moderation_actions (id uuid primary key default gen_random_uuid(), admin_user_id uuid not null references admin_users(id), moment_id uuid not null references moments(id), action text not null, reason text, created_at timestamptz not null default now());
create table analytics_events (id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id), participant_id uuid references participants(id), name text not null, properties jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table system_health_snapshots (id uuid primary key default gen_random_uuid(), event_id uuid references events(id), component text not null, status text not null, details jsonb not null default '{}'::jsonb, observed_at timestamptz not null default now());

create or replace function normalize_email() returns trigger language plpgsql as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end; $$;
create trigger participants_normalize_email before insert or update of email on participants for each row execute function normalize_email();
create trigger admin_users_normalize_email before insert or update of email on admin_users for each row execute function normalize_email();
create unique index participants_event_lower_email_unique_idx on participants (event_id, lower(email));

create or replace function moment_record_json(p_moment moments) returns jsonb language sql stable as $$
  select jsonb_build_object('id', p_moment.id, 'participantId', p_moment.participant_id, 'eventId', p_moment.event_id, 'status', p_moment.status,
    'category', p_moment.category, 'r2OriginalKey', p_moment.r2_original_key, 'r2DisplayKey', p_moment.r2_display_key,
    'r2ThumbnailKey', p_moment.r2_thumbnail_key, 'mimeType', p_moment.mime_type, 'byteSize', p_moment.byte_size,
    'width', p_moment.width, 'height', p_moment.height, 'createdAt', p_moment.created_at, 'publishedAt', p_moment.published_at, 'deletedAt', p_moment.deleted_at)
$$;

create or replace function reserve_moment_slot(p_participant_id uuid, p_event_id uuid, p_reservation_id uuid, p_expires_at timestamptz)
returns table(moment_id uuid, reservation_id uuid) language plpgsql as $$
declare v_limit integer; v_used integer; v_moment_id uuid;
begin
  select e.max_active_moments_per_participant into v_limit from participants p join events e on e.id = p.event_id where p.id = p_participant_id and p.event_id = p_event_id for update of p;
  if v_limit is null then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  if p_expires_at <= clock_timestamp() then raise exception 'RESERVATION_EXPIRED' using errcode = 'P0001'; end if;
  select ur.moment_id into v_moment_id from upload_reservations ur where ur.id = p_reservation_id and ur.participant_id = p_participant_id and ur.event_id = p_event_id;
  if found then return query select v_moment_id, p_reservation_id; return; end if;
  select count(*) into v_used from moments m where m.participant_id = p_participant_id and m.deleted_at is null and m.status not in ('REJECTED','RESERVED');
  select v_used + count(*) into v_used from upload_reservations ur where ur.participant_id = p_participant_id and ur.event_id = p_event_id and ur.status = 'RESERVED' and ur.expires_at > clock_timestamp();
  if v_used >= v_limit then raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001'; end if;
  insert into moments (event_id, participant_id, status) values (p_event_id, p_participant_id, 'RESERVED') returning id into v_moment_id;
  insert into upload_reservations (id, participant_id, event_id, moment_id, expires_at) values (p_reservation_id, p_participant_id, p_event_id, v_moment_id, p_expires_at);
  return query select v_moment_id, p_reservation_id;
end; $$;

create or replace function complete_moment(p_moment_id uuid, p_metadata jsonb) returns jsonb language plpgsql as $$
declare v_moment moments%rowtype; v_reservation upload_reservations%rowtype;
begin
  select * into v_moment from moments where id = p_moment_id for update;
  if not found then raise exception 'MOMENT_NOT_FOUND'; end if;
  if v_moment.status = 'PUBLISHED' then return moment_record_json(v_moment); end if;
  if v_moment.status <> 'RESERVED' or v_moment.deleted_at is not null then raise exception 'RESERVATION_NOT_ACTIVE' using errcode = 'P0001'; end if;
  select * into v_reservation from upload_reservations where moment_id = p_moment_id for update;
  if not found or v_reservation.status <> 'RESERVED' or v_reservation.expires_at <= clock_timestamp() then raise exception 'RESERVATION_NOT_ACTIVE' using errcode = 'P0001'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object'
    or coalesce(p_metadata->>'category' = any(array['REUNI','PANGGUNG','FESTIVAL','BAZAAR','KOMUNITAS','ZERO_WASTE','NOSTALGIA','MOMEN_KITA']), false) = false
    or coalesce(jsonb_typeof(p_metadata->'r2OriginalKey') = 'string' and length(btrim(p_metadata->>'r2OriginalKey')) > 0, false) = false
    or coalesce(jsonb_typeof(p_metadata->'r2DisplayKey') = 'null' or (jsonb_typeof(p_metadata->'r2DisplayKey') = 'string' and length(btrim(p_metadata->>'r2DisplayKey')) > 0), false) = false
    or coalesce(jsonb_typeof(p_metadata->'r2ThumbnailKey') = 'null' or (jsonb_typeof(p_metadata->'r2ThumbnailKey') = 'string' and length(btrim(p_metadata->>'r2ThumbnailKey')) > 0), false) = false
    or coalesce(jsonb_typeof(p_metadata->'mimeType') = 'string' and p_metadata->>'mimeType' ~* '^image/[a-z0-9.+-]+$', false) = false
    or coalesce(jsonb_typeof(p_metadata->'byteSize') = 'number' and p_metadata->>'byteSize' ~ '^[1-9][0-9]*$', false) = false
    or coalesce(jsonb_typeof(p_metadata->'width') = 'number' and p_metadata->>'width' ~ '^[1-9][0-9]*$', false) = false
    or coalesce(jsonb_typeof(p_metadata->'height') = 'number' and p_metadata->>'height' ~ '^[1-9][0-9]*$', false) = false
  then raise exception 'INVALID_MOMENT_METADATA' using errcode = 'P0001'; end if;
  update upload_reservations set status = 'COMPLETED', completed_at = clock_timestamp()
    where moment_id = p_moment_id and status = 'RESERVED' and expires_at > clock_timestamp() returning * into v_reservation;
  if not found then raise exception 'RESERVATION_NOT_ACTIVE' using errcode = 'P0001'; end if;
  update moments set category = p_metadata->>'category', r2_original_key = p_metadata->>'r2OriginalKey', r2_display_key = p_metadata->>'r2DisplayKey', r2_thumbnail_key = p_metadata->>'r2ThumbnailKey', mime_type = p_metadata->>'mimeType', byte_size = (p_metadata->>'byteSize')::bigint, width = (p_metadata->>'width')::integer, height = (p_metadata->>'height')::integer, status = 'PUBLISHED', published_at = clock_timestamp()
    where id = p_moment_id and status = 'RESERVED' and deleted_at is null returning * into v_moment;
  if not found then raise exception 'RESERVATION_NOT_ACTIVE' using errcode = 'P0001'; end if;
  return moment_record_json(v_moment);
end; $$;

create or replace function delete_owned_moment(p_participant_id uuid, p_moment_id uuid) returns void language plpgsql as $$
begin
  update moments set deleted_at = coalesce(deleted_at, clock_timestamp()) where id = p_moment_id and participant_id = p_participant_id;
  if not found then raise exception 'MOMENT_NOT_FOUND'; end if;
  update upload_reservations set status = 'CANCELLED' where moment_id = p_moment_id and status = 'RESERVED';
end; $$;
create or replace function list_owned_moments(p_participant_id uuid, p_cursor text, p_limit integer) returns jsonb language sql stable as $$
  with cursor_row as (select created_at, id from moments where id::text = p_cursor), page as (
    select id, participant_id as "participantId", event_id as "eventId", status, category, r2_original_key as "r2OriginalKey", r2_display_key as "r2DisplayKey", r2_thumbnail_key as "r2ThumbnailKey", mime_type as "mimeType", byte_size as "byteSize", width, height, created_at as "createdAt", published_at as "publishedAt", deleted_at as "deletedAt"
    from moments where participant_id = p_participant_id and deleted_at is null and (p_cursor is null or (created_at, id) < (select created_at, id from cursor_row)) order by created_at desc, id desc limit least(greatest(p_limit, 1), 100) + 1
  ), returned as (select * from page limit least(greatest(p_limit, 1), 100))
  select jsonb_build_object('data', coalesce((select jsonb_agg(row_to_json(returned)) from returned), '[]'::jsonb), 'nextCursor', case when (select count(*) from page) > least(greatest(p_limit, 1), 100) then (select id::text from returned order by "createdAt" asc, id asc limit 1) else null end)
$$;
create or replace function get_participant_for_event(p_participant_id uuid, p_event_id uuid) returns jsonb language sql stable as $$ select jsonb_build_object('id', id, 'eventId', event_id, 'name', name, 'batch', batch, 'email', email, 'status', status) from participants where id = p_participant_id and event_id = p_event_id $$;
create or replace function seed_local_event(p_slug text, p_name text, p_event_date date) returns void language plpgsql as $$
begin insert into events (slug, name, event_date, status) values (p_slug, p_name, p_event_date, 'pre_event') on conflict (slug) do update set name = excluded.name, event_date = excluded.event_date, updated_at = now(); end; $$;
