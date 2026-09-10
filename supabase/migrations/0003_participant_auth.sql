create table recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index recovery_tokens_active_expiry_idx on recovery_tokens (expires_at) where consumed_at is null;

create table recovery_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  recovery_token_id uuid not null unique references recovery_tokens(id) on delete cascade,
  recipient_email text not null,
  recovery_url text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recovery_delivery_outbox_pending_idx on recovery_delivery_outbox (available_at, created_at) where status = 'PENDING';

create table rate_limit_buckets (
  scope text not null check (scope ~ '^[a-z][a-z0-9_-]{0,79}$'),
  bucket_key text not null check (length(bucket_key) between 1 and 256),
  count integer not null check (count > 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, bucket_key)
);
create index rate_limit_buckets_expiry_idx on rate_limit_buckets (expires_at);

create or replace function consume_rate_limit_bucket(p_scope text, p_bucket_key text, p_limit integer, p_window_seconds integer)
returns jsonb language plpgsql as $$
declare v_now timestamptz := clock_timestamp(); v_window_seconds integer; v_count integer; v_expires_at timestamptz;
begin
  if p_scope !~ '^[a-z][a-z0-9_-]{0,79}$' or length(p_bucket_key) not between 1 and 256 or p_limit < 1 or p_window_seconds not between 1 and 3600 then
    raise exception 'INVALID_RATE_LIMIT_BUCKET';
  end if;
  delete from rate_limit_buckets where ctid in (
    select ctid from rate_limit_buckets where expires_at <= v_now order by expires_at limit 100
  );
  v_window_seconds := p_window_seconds;
  insert into rate_limit_buckets as bucket (scope, bucket_key, count, expires_at, updated_at)
  values (p_scope, p_bucket_key, 1, v_now + make_interval(secs => v_window_seconds), v_now)
  on conflict (scope, bucket_key) do update set
    count = case when bucket.expires_at <= v_now then 1 else bucket.count + 1 end,
    expires_at = case when bucket.expires_at <= v_now then v_now + make_interval(secs => v_window_seconds) else bucket.expires_at end,
    updated_at = v_now
  returning count, expires_at into v_count, v_expires_at;
  return jsonb_build_object('count', v_count, 'resetAt', v_expires_at);
end; $$;

create or replace function register_participant_for_event(p_event_slug text, p_name text, p_batch text, p_email text, p_consent_version text)
returns jsonb language plpgsql as $$
declare v_event events%rowtype; v_participant participants%rowtype;
begin
  select * into v_event from events where slug = p_event_slug for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  select * into v_participant from participants where event_id = v_event.id and lower(email) = lower(btrim(p_email)) for update;
  if found then raise exception 'PARTICIPANT_EXISTS'; end if;
  begin
    insert into participants (event_id, name, batch, email, consent_version, consented_at)
    values (v_event.id, btrim(p_name), btrim(p_batch), lower(btrim(p_email)), p_consent_version, clock_timestamp()) returning * into v_participant;
  exception when unique_violation then
    raise exception 'PARTICIPANT_EXISTS';
  end;
  if v_participant.status <> 'active' then raise exception 'PARTICIPANT_DISABLED'; end if;
  return jsonb_build_object('id', v_participant.id, 'eventId', v_participant.event_id, 'name', v_participant.name, 'batch', v_participant.batch, 'status', v_participant.status);
end; $$;

create or replace function resume_participant_for_event(p_event_slug text, p_participant_id uuid, p_session_token_hash text)
returns jsonb language plpgsql as $$
declare v_participant participants%rowtype;
begin
  select p.* into v_participant
  from participants p
  join events e on e.id = p.event_id
  join access_sessions s on s.participant_id = p.id
  where e.slug = p_event_slug
    and s.participant_id = p_participant_id
    and s.session_token_hash = p_session_token_hash
    and s.revoked_at is null
    and s.expires_at > clock_timestamp()
    and p.status = 'active'
  for update of p;
  if not found then raise exception 'SESSION_EXPIRED'; end if;
  update participants set last_seen_at = clock_timestamp() where id = v_participant.id returning * into v_participant;
  return jsonb_build_object('id', v_participant.id, 'eventId', v_participant.event_id, 'name', v_participant.name, 'batch', v_participant.batch, 'status', v_participant.status);
end; $$;

create or replace function create_access_session(p_participant_id uuid, p_session_token_hash text, p_expires_at timestamptz)
returns void language plpgsql as $$
begin
  if p_expires_at <= clock_timestamp() then raise exception 'SESSION_EXPIRED'; end if;
  insert into access_sessions (participant_id, session_token_hash, expires_at) values (p_participant_id, p_session_token_hash, p_expires_at);
end; $$;

create or replace function get_authenticated_participant_for_session(p_session_token_hash text)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', p.id, 'eventId', p.event_id, 'name', p.name, 'batch', p.batch, 'status', p.status, 'expiresAt', s.expires_at, 'revokedAt', s.revoked_at)
  from access_sessions s join participants p on p.id = s.participant_id
  where s.session_token_hash = p_session_token_hash and s.revoked_at is null and s.expires_at > clock_timestamp()
$$;

create or replace function revoke_access_session(p_session_token_hash text)
returns void language plpgsql as $$
begin update access_sessions set revoked_at = coalesce(revoked_at, clock_timestamp()) where session_token_hash = p_session_token_hash; end; $$;

drop function if exists create_recovery_token(text, uuid, text, timestamptz);
create or replace function create_recovery_token(p_email text, p_event_id uuid, p_token_hash text, p_expires_at timestamptz, p_recovery_url text)
returns jsonb language plpgsql as $$
declare v_participant participants%rowtype; v_token recovery_tokens%rowtype;
begin
  select * into v_participant from participants where event_id = p_event_id and lower(email) = lower(btrim(p_email)) and status = 'active';
  if not found then return null; end if;
  if p_expires_at <= clock_timestamp() or length(btrim(p_recovery_url)) = 0 then raise exception 'RECOVERY_TOKEN_INVALID'; end if;
  update recovery_tokens set consumed_at = clock_timestamp() where participant_id = v_participant.id and consumed_at is null;
  insert into recovery_tokens (participant_id, token_hash, expires_at) values (v_participant.id, p_token_hash, p_expires_at) returning * into v_token;
  insert into recovery_delivery_outbox (recovery_token_id, recipient_email, recovery_url) values (v_token.id, v_participant.email, p_recovery_url);
  return jsonb_build_object('queued', true);
end; $$;

create or replace function consume_recovery_token(p_token_hash text, p_now timestamptz)
returns jsonb language plpgsql as $$
declare v_token recovery_tokens%rowtype; v_participant participants%rowtype;
begin
  update recovery_tokens set consumed_at = p_now where token_hash = p_token_hash and consumed_at is null and expires_at > p_now returning * into v_token;
  if not found then return null; end if;
  select * into v_participant from participants where id = v_token.participant_id and status = 'active';
  if not found then return null; end if;
  update access_sessions set revoked_at = p_now where participant_id = v_participant.id and revoked_at is null;
  return jsonb_build_object('id', v_participant.id, 'eventId', v_participant.event_id, 'name', v_participant.name, 'batch', v_participant.batch, 'status', v_participant.status);
end; $$;

create or replace function get_participant_quota_summary(p_participant_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object('activeMoments', count(m.id), 'maxActiveMoments', e.max_active_moments_per_participant)
  from participants p join events e on e.id = p.event_id left join moments m on m.participant_id = p.id and m.deleted_at is null and m.status not in ('REJECTED', 'RESERVED')
  where p.id = p_participant_id group by e.max_active_moments_per_participant
$$;
