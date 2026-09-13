create or replace function cleanup_expired_sessions(p_now timestamptz, p_limit integer, p_dry_run boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_ids uuid[];
  v_moment_ids uuid[];
  v_sessions_removed integer;
  v_reservations_expired integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'cleanup limit must be between 1 and 1000';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::integer
    into v_session_ids, v_sessions_removed
    from (select id from access_sessions where (expires_at <= p_now or revoked_at is not null) order by expires_at, id limit p_limit) candidates;

  select coalesce(array_agg(moment_id), '{}'::uuid[]), count(*)::integer
    into v_moment_ids, v_reservations_expired
    from (select moment_id from upload_reservations where status = 'RESERVED' and expires_at <= p_now order by expires_at, moment_id limit p_limit) candidates;

  if not p_dry_run then
    delete from access_sessions where id = any(v_session_ids);
    update upload_reservations
      set status = 'EXPIRED', completed_at = coalesce(completed_at, p_now)
      where moment_id = any(v_moment_ids) and status = 'RESERVED' and expires_at <= p_now;
    update moments
      set status = 'REJECTED', processing_error = 'RESERVATION_EXPIRED'
      where id = any(v_moment_ids) and status in ('RESERVED', 'UPLOADING', 'PROCESSING');
  end if;

  return jsonb_build_object('sessionsRemoved', v_sessions_removed, 'reservationsExpired', v_reservations_expired);
end;
$$;

create or replace function list_expected_r2_objects(p_event_id uuid, p_cursor text, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with keys as (
    select m.r2_original_key as key from moments m where m.event_id = p_event_id and m.r2_original_key is not null
    union
    select m.r2_display_key from moments m where m.event_id = p_event_id and m.r2_display_key is not null
    union
    select m.r2_thumbnail_key from moments m where m.event_id = p_event_id and m.r2_thumbnail_key is not null
  ),
  page as (
    select key from keys where key > coalesce(p_cursor, '') order by key limit least(greatest(p_limit, 1), 1000) + 1
  ),
  returned as (
    select key from page order by key limit least(greatest(p_limit, 1), 1000)
  )
  select jsonb_build_object(
    'data', coalesce((select jsonb_agg(jsonb_build_object('key', key) order by key) from returned), '[]'::jsonb),
    'nextCursor', (select key from page order by key offset least(greatest(p_limit, 1), 1000) limit 1)
  );
$$;

revoke all on function cleanup_expired_sessions(timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function cleanup_expired_sessions(timestamptz, integer, boolean) to service_role;
revoke all on function list_expected_r2_objects(uuid, text, integer) from public, anon, authenticated;
grant execute on function list_expected_r2_objects(uuid, text, integer) to service_role;
