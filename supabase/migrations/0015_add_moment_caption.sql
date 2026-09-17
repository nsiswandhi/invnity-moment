-- Persist a displayable caption for every moment while retaining compatibility with existing rows.
alter table moments add column caption text;

update moments
  set caption = 'Momen berharga bersama teman-teman reuni.'
  where caption is null or btrim(caption) = '';

alter table moments
  alter column caption set default 'Momen berharga bersama teman-teman reuni.';

alter table moments
  alter column caption set not null;

alter table moments
  add constraint moments_caption_max_length_check check (char_length(caption) <= 200);

create or replace function moment_record_json(p_moment moments) returns jsonb language sql stable as $$
  select jsonb_build_object('id', p_moment.id, 'participantId', p_moment.participant_id, 'eventId', p_moment.event_id, 'status', p_moment.status,
    'category', p_moment.category, 'caption', p_moment.caption, 'r2OriginalKey', p_moment.r2_original_key, 'r2DisplayKey', p_moment.r2_display_key,
    'r2ThumbnailKey', p_moment.r2_thumbnail_key, 'mimeType', p_moment.mime_type, 'byteSize', p_moment.byte_size,
    'width', p_moment.width, 'height', p_moment.height, 'createdAt', p_moment.created_at, 'publishedAt', p_moment.published_at, 'deletedAt', p_moment.deleted_at)
$$;

create or replace function get_moment_for_participant(p_moment_id uuid, p_participant_id uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'participantId', m.participant_id, 'eventId', m.event_id, 'status', m.status, 'category', m.category, 'caption', m.caption,
    'r2OriginalKey', m.r2_original_key, 'r2DisplayKey', m.r2_display_key, 'r2ThumbnailKey', m.r2_thumbnail_key,
    'mimeType', m.mime_type, 'byteSize', m.byte_size, 'width', m.width, 'height', m.height, 'createdAt', m.created_at,
    'publishedAt', m.published_at, 'deletedAt', m.deleted_at,
    'reservationExpiresAt', ur.expires_at, 'reservationStatus', ur.status
  )
  from moments m left join upload_reservations ur on ur.moment_id = m.id
  where m.id = p_moment_id and m.participant_id = p_participant_id
$$;

create or replace function list_owned_moments(p_participant_id uuid, p_cursor text, p_limit integer) returns jsonb language sql stable as $$
  with cursor_row as (select created_at, id from moments where id::text = p_cursor), page as (
    select id, participant_id as "participantId", event_id as "eventId", status, category, caption, r2_original_key as "r2OriginalKey", r2_display_key as "r2DisplayKey", r2_thumbnail_key as "r2ThumbnailKey", mime_type as "mimeType", byte_size as "byteSize", width, height, created_at as "createdAt", published_at as "publishedAt", deleted_at as "deletedAt"
    from moments where participant_id = p_participant_id and deleted_at is null and (p_cursor is null or (created_at, id) < (select created_at, id from cursor_row)) order by created_at desc, id desc limit least(greatest(p_limit, 1), 100) + 1
  ), returned as (select * from page limit least(greatest(p_limit, 1), 100))
  select jsonb_build_object('data', coalesce((select jsonb_agg(row_to_json(returned)) from returned), '[]'::jsonb), 'nextCursor', (select id::text from page offset least(greatest(p_limit, 1), 100) limit 1))
$$;

drop function if exists list_published_moments(uuid, text, text, integer);
create or replace function list_published_moments(p_event_id uuid, p_category text, p_cursor text, p_limit integer, p_anonymous_user_key_hash text)
returns jsonb language plpgsql stable as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50); v_cursor jsonb := decode_public_album_cursor(p_cursor);
begin
  if p_category is not null and p_category not in ('REUNI','PANGGUNG','FESTIVAL','BAZAAR','KOMUNITAS','ZERO_WASTE','NOSTALGIA','MOMEN_KITA') then raise exception 'INVALID_MOMENT_CATEGORY' using errcode = 'P0001'; end if;
  if p_anonymous_user_key_hash is not null and p_anonymous_user_key_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_LIKE_IDENTITY' using errcode = 'P0001'; end if;
  return (with page as (
    select m.id, m.category, m.caption, m.created_at as "createdAt", m.published_at as "publishedAt", m.r2_display_key as "r2DisplayKey", m.r2_thumbnail_key as "r2ThumbnailKey", m.r2_original_key as "r2OriginalKey", count(l.id)::integer as "likeCount", exists(select 1 from likes active_like where active_like.moment_id = m.id and active_like.anonymous_user_key_hash = p_anonymous_user_key_hash and active_like.revoked_at is null) as liked
    from moments m left join likes l on l.moment_id = m.id and l.revoked_at is null
    where m.event_id = p_event_id and m.status = 'PUBLISHED' and m.deleted_at is null and (p_category is null or m.category = p_category) and (v_cursor is null or (m.published_at, m.id) < ((v_cursor->>'publishedAt')::timestamptz, (v_cursor->>'id')::uuid))
    group by m.id order by m.published_at desc, m.id desc limit v_limit + 1
  ), returned as (select * from page order by "publishedAt" desc, id desc limit v_limit)
  select jsonb_build_object('data', coalesce((select jsonb_agg(row_to_json(returned)) from returned), '[]'::jsonb), 'nextCursor', case when (select count(*) from page) > v_limit then (select replace(replace(replace(encode(convert_to(jsonb_build_object('publishedAt', "publishedAt", 'id', id)::text, 'UTF8'), 'base64'), '=', ''), '+', '-'), '/', '_') from returned order by "publishedAt" asc, id asc limit 1) else null end));
end; $$;

drop function if exists get_published_moment(uuid);
create or replace function get_published_moment(p_event_id uuid, p_moment_id uuid, p_anonymous_user_key_hash text)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'category', m.category, 'caption', m.caption, 'createdAt', m.created_at, 'publishedAt', m.published_at, 'r2DisplayKey', m.r2_display_key, 'r2ThumbnailKey', m.r2_thumbnail_key, 'r2OriginalKey', m.r2_original_key, 'likeCount', (select count(*)::integer from likes l where l.moment_id = m.id and l.revoked_at is null), 'liked', exists(select 1 from likes active_like where active_like.moment_id = m.id and active_like.anonymous_user_key_hash = p_anonymous_user_key_hash and active_like.revoked_at is null))
  from moments m where m.event_id = p_event_id and m.id = p_moment_id and m.status = 'PUBLISHED' and m.deleted_at is null
$$;

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
    or coalesce(not (p_metadata ? 'caption') or (jsonb_typeof(p_metadata->'caption') = 'string' and char_length(p_metadata->>'caption') <= 200), false) = false
    or coalesce(jsonb_typeof(p_metadata->'r2OriginalKey') = 'string' and length(btrim(p_metadata->>'r2OriginalKey')) > 0, false) = false
    or coalesce(jsonb_typeof(p_metadata->'r2DisplayKey') = 'null' or (jsonb_typeof(p_metadata->'r2DisplayKey') = 'string' and length(btrim(p_metadata->>'r2DisplayKey')) > 0), false) = false
    or coalesce(jsonb_typeof(p_metadata->'r2ThumbnailKey') = 'null' or (jsonb_typeof(p_metadata->'r2ThumbnailKey') = 'string' and length(btrim(p_metadata->>'r2ThumbnailKey')) > 0), false) = false
    or coalesce(jsonb_typeof(p_metadata->'mimeType') = 'string' and p_metadata->>'mimeType' ~* '^image/[a-z0-9.+-]+$', false) = false
    or coalesce(jsonb_typeof(p_metadata->'byteSize') = 'number' and p_metadata->>'byteSize' ~ '^[1-9][0-9]*$', false) = false
    or coalesce(jsonb_typeof(p_metadata->'width') = 'number' and p_metadata->>'width' ~ '^[1-9][0-9]*$', false) = false
    or coalesce(jsonb_typeof(p_metadata->'height') = 'number' and p_metadata->>'height' ~ '^[1-9][0-9]*$', false) = false
  then raise exception 'INVALID_MOMENT_METADATA' using errcode = 'P0001'; end if;
  update upload_reservations set status = 'COMPLETED', completed_at = clock_timestamp() where moment_id = p_moment_id and status = 'RESERVED' and expires_at > clock_timestamp() returning * into v_reservation;
  if not found then raise exception 'RESERVATION_NOT_ACTIVE' using errcode = 'P0001'; end if;
  update moments set category = p_metadata->>'category', caption = coalesce(nullif(btrim(p_metadata->>'caption'), ''), 'Momen berharga bersama teman-teman reuni.'), r2_original_key = p_metadata->>'r2OriginalKey', r2_display_key = p_metadata->>'r2DisplayKey', r2_thumbnail_key = p_metadata->>'r2ThumbnailKey', mime_type = p_metadata->>'mimeType', byte_size = (p_metadata->>'byteSize')::bigint, width = (p_metadata->>'width')::integer, height = (p_metadata->>'height')::integer, status = 'PUBLISHED', published_at = clock_timestamp() where id = p_moment_id and status = 'RESERVED' and deleted_at is null returning * into v_moment;
  if not found then raise exception 'RESERVATION_NOT_ACTIVE' using errcode = 'P0001'; end if;
  return moment_record_json(v_moment);
end; $$;
