-- Task 7: operator-only moderation and event-day controls.
create index if not exists moderation_actions_moment_created_idx on moderation_actions (moment_id, created_at desc);
create index if not exists moments_event_status_created_idx on moments (event_id, status, created_at desc);
create index if not exists participants_event_batch_created_idx on participants (event_id, batch, created_at desc);

create or replace function get_active_admin_user(p_admin_user_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', id, 'email', email)
  from admin_users where id = p_admin_user_id and status = 'active'
$$;

create or replace function get_active_admin_user_by_email(p_email text)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', id, 'email', email)
  from admin_users where lower(email) = lower(btrim(p_email)) and status = 'active'
$$;

create or replace function set_admin_moment_visibility(p_admin_user_id uuid, p_moment_id uuid, p_visibility text, p_reason text)
returns void language plpgsql as $$
declare v_moment moments%rowtype;
begin
  if not exists (select 1 from admin_users where id = p_admin_user_id and status = 'active') then raise exception 'ADMIN_NOT_ACTIVE' using errcode = 'P0001'; end if;
  if p_visibility not in ('hidden', 'published') then raise exception 'INVALID_MOMENT_VISIBILITY' using errcode = 'P0001'; end if;
  if p_visibility = 'hidden' and (p_reason is null or length(btrim(p_reason)) = 0 or length(btrim(p_reason)) > 500) then raise exception 'MODERATION_REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into v_moment from moments where id = p_moment_id and deleted_at is null for update;
  if not found then raise exception 'MOMENT_NOT_AVAILABLE' using errcode = 'P0001'; end if;
  if p_visibility = 'hidden' then
    if v_moment.status not in ('PUBLISHED', 'HIDDEN') then raise exception 'MOMENT_NOT_MODERATABLE' using errcode = 'P0001'; end if;
    update moments set status = 'HIDDEN', hidden_at = coalesce(hidden_at, clock_timestamp()), hidden_reason = btrim(p_reason) where id = p_moment_id;
    insert into moderation_actions (admin_user_id, moment_id, action, reason) values (p_admin_user_id, p_moment_id, 'HIDE', btrim(p_reason));
  else
    if v_moment.status <> 'HIDDEN' then raise exception 'MOMENT_NOT_MODERATABLE' using errcode = 'P0001'; end if;
    update moments set status = 'PUBLISHED', hidden_at = null, hidden_reason = null where id = p_moment_id;
    insert into moderation_actions (admin_user_id, moment_id, action, reason) values (p_admin_user_id, p_moment_id, 'UNHIDE', null);
  end if;
end; $$;

create or replace function get_admin_dashboard_summary(p_event_id uuid)
returns jsonb language sql stable as $$
  with event_row as (
    select id, slug, name, event_date, status from events where id = p_event_id
  ), metrics as (
    select
      (select count(*)::integer from participants where event_id = p_event_id and status = 'active') as participants,
      (select count(*)::integer from moments where event_id = p_event_id and deleted_at is null) as moments,
      (select count(*)::integer from moments where event_id = p_event_id and status = 'PUBLISHED' and deleted_at is null) as published,
      (select count(*)::integer from moments where event_id = p_event_id and status = 'HIDDEN' and deleted_at is null) as hidden
  ), activity as (
    select m.id::text as id, m.created_at as at, ('Momen ' || coalesce(m.category, 'baru') || ' — upload') as label, 'upload'::text as kind
    from moments m where m.event_id = p_event_id and m.deleted_at is null
    union all
    select ma.id::text as id, ma.created_at as at, ('Foto dimoderasi — ' || lower(ma.action)) as label, 'moderation'::text as kind
    from moderation_actions ma join moments m on m.id = ma.moment_id where m.event_id = p_event_id
  )
  select case when exists (select 1 from event_row) then jsonb_build_object(
    'event', (select jsonb_build_object('id', id, 'slug', slug, 'name', name, 'eventDate', event_date, 'status', status) from event_row),
    'metrics', (select jsonb_build_object('participants', participants, 'moments', moments, 'published', published, 'hidden', hidden) from metrics),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'at', at, 'label', label, 'kind', kind) order by at desc) from (select * from activity order by at desc limit 20) latest), '[]'::jsonb)
  ) else null end
$$;

create or replace function list_admin_moments(p_event_id uuid, p_visibility text, p_limit integer)
returns jsonb language plpgsql stable as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if p_visibility not in ('recent', 'hidden') then raise exception 'INVALID_ADMIN_MOMENT_FILTER' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'category', category, 'status', status, 'createdAt', created_at, 'publishedAt', published_at,
      'hiddenAt', hidden_at, 'hiddenReason', hidden_reason, 'participantName', name, 'participantBatch', batch
    ) order by created_at desc)
    from (
      select m.*, p.name, p.batch from moments m join participants p on p.id = m.participant_id
      where m.event_id = p_event_id and m.deleted_at is null
        and ((p_visibility = 'recent' and m.status in ('PUBLISHED', 'HIDDEN')) or (p_visibility = 'hidden' and m.status = 'HIDDEN'))
      order by m.created_at desc limit v_limit
    ) rows
  ), '[]'::jsonb);
end; $$;

create or replace function list_admin_participants(p_event_id uuid, p_query text, p_batch text, p_limit integer)
returns jsonb language plpgsql stable as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'batch', batch, 'momentCount', moment_count, 'registeredAt', created_at) order by created_at desc)
    from (
      select p.id, p.name, p.batch, p.created_at, count(m.id)::integer as moment_count
      from participants p left join moments m on m.participant_id = p.id and m.deleted_at is null
      where p.event_id = p_event_id and p.status = 'active'
        and (p_query is null or p.name ilike '%' || btrim(p_query) || '%' or p.batch ilike '%' || btrim(p_query) || '%')
        and (p_batch is null or p.batch = p_batch)
      group by p.id order by p.created_at desc limit v_limit
    ) rows
  ), '[]'::jsonb);
end; $$;

create or replace function set_admin_event_mode(p_event_id uuid, p_mode text)
returns jsonb language plpgsql as $$
declare v_event events%rowtype;
begin
  if p_mode not in ('live', 'maintenance', 'archived') then raise exception 'INVALID_EVENT_MODE' using errcode = 'P0001'; end if;
  update events set status = p_mode, updated_at = clock_timestamp() where id = p_event_id returning * into v_event;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001'; end if;
  return jsonb_build_object('id', v_event.id, 'slug', v_event.slug, 'name', v_event.name, 'eventDate', v_event.event_date, 'status', v_event.status);
end; $$;

create or replace function admin_database_health_check()
returns void language plpgsql stable as $$ begin perform 1; end; $$;

create or replace function get_admin_error_rate(p_event_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object('errorRate', null, 'sampleSize', 0)
$$;

create or replace function block_moment_completion_when_event_write_disabled()
returns trigger language plpgsql as $$
begin
  if old.status = 'RESERVED' and new.status = 'PUBLISHED' and exists (select 1 from events where id = new.event_id and status in ('maintenance', 'archived')) then
    raise exception 'EVENT_WRITE_DISABLED' using errcode = 'P0001';
  end if;
  return new;
end; $$;

drop trigger if exists moments_block_disabled_event_completion on moments;
create trigger moments_block_disabled_event_completion
before update of status on moments
for each row execute function block_moment_completion_when_event_write_disabled();

create or replace function register_participant_for_event(p_event_slug text, p_name text, p_batch text, p_email text, p_consent_version text)
returns jsonb language plpgsql as $$
declare v_event events%rowtype; v_participant participants%rowtype;
begin
  select * into v_event from events where slug = p_event_slug for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.status in ('maintenance', 'archived') then raise exception 'EVENT_WRITE_DISABLED' using errcode = 'P0001'; end if;
  select * into v_participant from participants where event_id = v_event.id and lower(email) = lower(btrim(p_email)) for update;
  if found then raise exception 'PARTICIPANT_EXISTS'; end if;
  begin
    insert into participants (event_id, name, batch, email, consent_version, consented_at)
    values (v_event.id, btrim(p_name), btrim(p_batch), lower(btrim(p_email)), p_consent_version, clock_timestamp()) returning * into v_participant;
  exception when unique_violation then raise exception 'PARTICIPANT_EXISTS';
  end;
  if v_participant.status <> 'active' then raise exception 'PARTICIPANT_DISABLED'; end if;
  return jsonb_build_object('id', v_participant.id, 'eventId', v_participant.event_id, 'name', v_participant.name, 'batch', v_participant.batch, 'status', v_participant.status);
end; $$;

drop function if exists reserve_moment_slot(uuid, uuid, uuid, timestamptz);
create or replace function reserve_moment_slot(p_participant_id uuid, p_event_id uuid, p_reservation_id uuid, p_expires_at timestamptz)
returns table(moment_id uuid, reservation_id uuid, expires_at timestamptz, reservation_status text) language plpgsql as $$
declare v_limit integer; v_used integer; v_moment_id uuid; v_event_status text; v_reservation upload_reservations%rowtype;
begin
  select e.max_active_moments_per_participant, e.status into v_limit, v_event_status from participants p join events e on e.id = p.event_id where p.id = p_participant_id and p.event_id = p_event_id for update of p;
  if v_limit is null then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  if v_event_status in ('maintenance', 'archived') then raise exception 'EVENT_WRITE_DISABLED' using errcode = 'P0001'; end if;
  if p_expires_at <= clock_timestamp() then raise exception 'RESERVATION_EXPIRED' using errcode = 'P0001'; end if;
  select * into v_reservation from upload_reservations ur where ur.id = p_reservation_id and ur.participant_id = p_participant_id and ur.event_id = p_event_id;
  if found then
    if v_reservation.status <> 'RESERVED' or v_reservation.expires_at <= clock_timestamp() then
      update upload_reservations set status = 'EXPIRED' where participant_id = p_participant_id and event_id = p_event_id and id = p_reservation_id and status = 'RESERVED' and expires_at <= clock_timestamp();
      raise exception 'RESERVATION_NOT_ACTIVE' using errcode = 'P0001';
    end if;
    return query select v_reservation.moment_id, v_reservation.id, v_reservation.expires_at, v_reservation.status; return;
  end if;
  select count(*) into v_used from moments m where m.participant_id = p_participant_id and m.deleted_at is null and m.status not in ('REJECTED','RESERVED');
  select v_used + count(*) into v_used from upload_reservations ur where ur.participant_id = p_participant_id and ur.event_id = p_event_id and ur.status = 'RESERVED' and ur.expires_at > clock_timestamp();
  if v_used >= v_limit then raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001'; end if;
  insert into moments (event_id, participant_id, status) values (p_event_id, p_participant_id, 'RESERVED') returning id into v_moment_id;
  insert into upload_reservations (id, participant_id, event_id, moment_id, expires_at) values (p_reservation_id, p_participant_id, p_event_id, v_moment_id, p_expires_at);
  return query select v_moment_id, p_reservation_id, p_expires_at, 'RESERVED'::text;
end; $$;
