drop function if exists reserve_moment_slot(uuid, uuid, uuid, timestamptz);

create or replace function reserve_moment_slot(p_participant_id uuid, p_event_id uuid, p_reservation_id uuid, p_expires_at timestamptz)
returns table(moment_id uuid, reservation_id uuid, expires_at timestamptz, reservation_status text) language plpgsql as $$
declare v_limit integer; v_used integer; v_moment_id uuid; v_reservation upload_reservations%rowtype;
begin
  select e.max_active_moments_per_participant into v_limit
    from participants p join events e on e.id = p.event_id
    where p.id = p_participant_id and p.event_id = p_event_id for update of p;
  if v_limit is null then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  if p_expires_at <= clock_timestamp() then raise exception 'RESERVATION_EXPIRED' using errcode = 'P0001'; end if;

  select * into v_reservation from upload_reservations ur
    where ur.id = p_reservation_id and ur.participant_id = p_participant_id and ur.event_id = p_event_id;
  if found then
    if v_reservation.status <> 'RESERVED' or v_reservation.expires_at <= clock_timestamp() then
      update upload_reservations set status = 'EXPIRED'
        where participant_id = p_participant_id and event_id = p_event_id and id = p_reservation_id and status = 'RESERVED' and expires_at <= clock_timestamp();
      raise exception 'RESERVATION_NOT_ACTIVE' using errcode = 'P0001';
    end if;
    return query select v_reservation.moment_id, v_reservation.id, v_reservation.expires_at, v_reservation.status;
    return;
  end if;

  select count(*) into v_used from moments m
    where m.participant_id = p_participant_id and m.deleted_at is null and m.status not in ('REJECTED','RESERVED');
  select v_used + count(*) into v_used from upload_reservations ur
    where ur.participant_id = p_participant_id and ur.event_id = p_event_id and ur.status = 'RESERVED' and ur.expires_at > clock_timestamp();
  if v_used >= v_limit then raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001'; end if;

  insert into moments (event_id, participant_id, status) values (p_event_id, p_participant_id, 'RESERVED') returning id into v_moment_id;
  insert into upload_reservations (id, participant_id, event_id, moment_id, expires_at) values (p_reservation_id, p_participant_id, p_event_id, v_moment_id, p_expires_at);
  return query select v_moment_id, p_reservation_id, p_expires_at, 'RESERVED'::text;
end; $$;

create or replace function get_moment_for_participant(p_moment_id uuid, p_participant_id uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'participantId', m.participant_id, 'eventId', m.event_id, 'status', m.status, 'category', m.category,
    'r2OriginalKey', m.r2_original_key, 'r2DisplayKey', m.r2_display_key, 'r2ThumbnailKey', m.r2_thumbnail_key,
    'mimeType', m.mime_type, 'byteSize', m.byte_size, 'width', m.width, 'height', m.height, 'createdAt', m.created_at,
    'publishedAt', m.published_at, 'deletedAt', m.deleted_at, 'reservationExpiresAt', ur.expires_at, 'reservationStatus', ur.status
  )
  from moments m left join upload_reservations ur on ur.moment_id = m.id
  where m.id = p_moment_id and m.participant_id = p_participant_id;
$$;
