-- Task 6: public album reads, anonymous likes, and archive-safe writes.
create or replace function decode_public_album_cursor(p_cursor text)
returns jsonb language plpgsql immutable as $$
declare v_cursor jsonb;
begin
  if p_cursor is null then return null; end if;
  begin
    v_cursor := convert_from(decode(replace(replace(p_cursor, '-', '+'), '_', '/') || repeat('=', (4 - length(p_cursor) % 4) % 4), 'base64'), 'UTF8')::jsonb;
  exception when others then
    raise exception 'INVALID_CURSOR' using errcode = 'P0001';
  end;
  if jsonb_typeof(v_cursor) <> 'object' or v_cursor->>'publishedAt' is null or v_cursor->>'id' is null then raise exception 'INVALID_CURSOR' using errcode = 'P0001'; end if;
  return v_cursor;
end; $$;

drop function if exists list_published_moments(uuid, text, text, integer);
create or replace function list_published_moments(p_event_id uuid, p_category text, p_cursor text, p_limit integer, p_anonymous_user_key_hash text)
returns jsonb language plpgsql stable as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50); v_cursor jsonb := decode_public_album_cursor(p_cursor);
begin
  if p_category is not null and p_category not in ('REUNI','PANGGUNG','FESTIVAL','BAZAAR','KOMUNITAS','ZERO_WASTE','NOSTALGIA','MOMEN_KITA') then
    raise exception 'INVALID_MOMENT_CATEGORY' using errcode = 'P0001';
  end if;
  if p_anonymous_user_key_hash is not null and p_anonymous_user_key_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_LIKE_IDENTITY' using errcode = 'P0001'; end if;
  return (
    with page as (
      select m.id, m.category, m.created_at as "createdAt", m.published_at as "publishedAt",
        m.r2_display_key as "r2DisplayKey", m.r2_thumbnail_key as "r2ThumbnailKey", m.r2_original_key as "r2OriginalKey",
        count(l.id)::integer as "likeCount",
        exists(select 1 from likes active_like where active_like.moment_id = m.id and active_like.anonymous_user_key_hash = p_anonymous_user_key_hash and active_like.revoked_at is null) as liked
      from moments m
      left join likes l on l.moment_id = m.id and l.revoked_at is null
      where m.event_id = p_event_id and m.status = 'PUBLISHED' and m.deleted_at is null
        and (p_category is null or m.category = p_category)
        and (v_cursor is null or (m.published_at, m.id) < ((v_cursor->>'publishedAt')::timestamptz, (v_cursor->>'id')::uuid))
      group by m.id
      order by m.published_at desc, m.id desc
      limit v_limit + 1
    ),
    returned as (select * from page order by "publishedAt" desc, id desc limit v_limit)
    select jsonb_build_object(
      'data', coalesce((select jsonb_agg(row_to_json(returned)) from returned), '[]'::jsonb),
      'nextCursor', case when (select count(*) from page) > v_limit then (
        select replace(replace(replace(encode(convert_to(jsonb_build_object('publishedAt', "publishedAt", 'id', id)::text, 'UTF8'), 'base64'), '=', ''), '+', '-'), '/', '_')
        from returned order by "publishedAt" asc, id asc limit 1
      ) else null end
    )
  );
end; $$;

drop function if exists get_published_moment(uuid);
create or replace function get_published_moment(p_event_id uuid, p_moment_id uuid, p_anonymous_user_key_hash text)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'category', m.category, 'createdAt', m.created_at, 'publishedAt', m.published_at,
    'r2DisplayKey', m.r2_display_key, 'r2ThumbnailKey', m.r2_thumbnail_key, 'r2OriginalKey', m.r2_original_key,
    'likeCount', (select count(*)::integer from likes l where l.moment_id = m.id and l.revoked_at is null),
    'liked', exists(select 1 from likes active_like where active_like.moment_id = m.id and active_like.anonymous_user_key_hash = p_anonymous_user_key_hash and active_like.revoked_at is null)
  )
  from moments m
  where m.event_id = p_event_id and m.id = p_moment_id and m.status = 'PUBLISHED' and m.deleted_at is null
$$;

drop function if exists set_public_moment_like(uuid, text, boolean);
create or replace function set_public_moment_like(p_event_id uuid, p_moment_id uuid, p_anonymous_user_key_hash text, p_liked boolean)
returns jsonb language plpgsql as $$
declare v_liked boolean := false; v_count integer;
begin
  if p_anonymous_user_key_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_LIKE_IDENTITY' using errcode = 'P0001'; end if;
  if not exists (select 1 from moments where event_id = p_event_id and id = p_moment_id and status = 'PUBLISHED' and deleted_at is null) then
    raise exception 'MOMENT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if p_liked then
    update likes set revoked_at = null, created_at = clock_timestamp()
      where moment_id = p_moment_id and anonymous_user_key_hash = p_anonymous_user_key_hash and revoked_at is not null;
    insert into likes (moment_id, anonymous_user_key_hash)
      values (p_moment_id, p_anonymous_user_key_hash)
      on conflict (moment_id, anonymous_user_key_hash) where revoked_at is null do nothing;
    v_liked := true;
  else
    update likes set revoked_at = coalesce(revoked_at, clock_timestamp())
      where moment_id = p_moment_id and anonymous_user_key_hash = p_anonymous_user_key_hash and revoked_at is null;
  end if;
  select count(*)::integer into v_count from likes where moment_id = p_moment_id and revoked_at is null;
  return jsonb_build_object('liked', v_liked, 'likeCount', v_count);
end; $$;

create or replace function get_public_event_state(p_event_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object('eventId', id, 'name', name, 'eventDate', event_date, 'status', status)
  from events where id = p_event_id
$$;

create or replace function register_participant_for_event(p_event_slug text, p_name text, p_batch text, p_email text, p_consent_version text)
returns jsonb language plpgsql as $$
declare v_event events%rowtype; v_participant participants%rowtype;
begin
  select * into v_event from events where slug = p_event_slug for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.status = 'archived' then raise exception 'EVENT_ARCHIVED' using errcode = 'P0001'; end if;
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

drop function if exists reserve_moment_slot(uuid, uuid, uuid, timestamptz);
create or replace function reserve_moment_slot(p_participant_id uuid, p_event_id uuid, p_reservation_id uuid, p_expires_at timestamptz)
returns table(moment_id uuid, reservation_id uuid, expires_at timestamptz, reservation_status text) language plpgsql as $$
declare v_limit integer; v_used integer; v_moment_id uuid; v_event_status text; v_reservation upload_reservations%rowtype;
begin
  select e.max_active_moments_per_participant, e.status into v_limit, v_event_status
    from participants p join events e on e.id = p.event_id where p.id = p_participant_id and p.event_id = p_event_id for update of p;
  if v_limit is null then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  if v_event_status = 'archived' then raise exception 'EVENT_ARCHIVED' using errcode = 'P0001'; end if;
  if p_expires_at <= clock_timestamp() then raise exception 'RESERVATION_EXPIRED' using errcode = 'P0001'; end if;
  select * into v_reservation from upload_reservations ur where ur.id = p_reservation_id and ur.participant_id = p_participant_id and ur.event_id = p_event_id;
  if found then
    if v_reservation.status <> 'RESERVED' or v_reservation.expires_at <= clock_timestamp() then
      update upload_reservations set status = 'EXPIRED' where participant_id = p_participant_id and event_id = p_event_id and id = p_reservation_id and status = 'RESERVED' and expires_at <= clock_timestamp();
      raise exception 'RESERVATION_NOT_ACTIVE' using errcode = 'P0001';
    end if;
    return query select v_reservation.moment_id, v_reservation.id, v_reservation.expires_at, v_reservation.status;
    return;
  end if;
  select count(*) into v_used from moments m where m.participant_id = p_participant_id and m.deleted_at is null and m.status not in ('REJECTED','RESERVED');
  select v_used + count(*) into v_used from upload_reservations ur where ur.participant_id = p_participant_id and ur.event_id = p_event_id and ur.status = 'RESERVED' and ur.expires_at > clock_timestamp();
  if v_used >= v_limit then raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001'; end if;
  insert into moments (event_id, participant_id, status) values (p_event_id, p_participant_id, 'RESERVED') returning id into v_moment_id;
  insert into upload_reservations (id, participant_id, event_id, moment_id, expires_at) values (p_reservation_id, p_participant_id, p_event_id, v_moment_id, p_expires_at);
  return query select v_moment_id, p_reservation_id, p_expires_at, 'RESERVED'::text;
end; $$;

create or replace function complete_moment(p_moment_id uuid, p_metadata jsonb) returns jsonb language plpgsql as $$
declare v_moment moments%rowtype; v_reservation upload_reservations%rowtype; v_event events%rowtype; v_event_status text;
begin
  select * into v_moment from moments where id = p_moment_id for update;
  if not found then raise exception 'MOMENT_NOT_FOUND'; end if;
  if v_moment.status = 'PUBLISHED' then return moment_record_json(v_moment); end if;
  select * into v_event from events where id = v_moment.event_id for update;
  v_event_status := v_event.status;
  if v_event_status = 'archived' then raise exception 'EVENT_ARCHIVED' using errcode = 'P0001'; end if;
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
