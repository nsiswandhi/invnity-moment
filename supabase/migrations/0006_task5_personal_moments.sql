create or replace function update_owned_moment(p_participant_id uuid, p_moment_id uuid, p_category text) returns jsonb language plpgsql as $$
declare v_moment moments%rowtype;
begin
  if p_category not in ('REUNI','PANGGUNG','FESTIVAL','BAZAAR','KOMUNITAS','ZERO_WASTE','NOSTALGIA','MOMEN_KITA') then
    raise exception 'INVALID_MOMENT_CATEGORY' using errcode = 'P0001';
  end if;
  update moments set category = p_category
    where id = p_moment_id and participant_id = p_participant_id and deleted_at is null
    returning * into v_moment;
  if not found then raise exception 'MOMENT_NOT_FOUND' using errcode = 'P0001'; end if;
  return moment_record_json(v_moment);
end; $$;

create or replace function delete_owned_moment(p_participant_id uuid, p_moment_id uuid) returns void language plpgsql as $$
begin
  update moments set deleted_at = clock_timestamp()
    where id = p_moment_id and participant_id = p_participant_id and deleted_at is null;
  if not found then raise exception 'MOMENT_NOT_FOUND'; end if;
  update upload_reservations set status = 'CANCELLED' where moment_id = p_moment_id and status = 'RESERVED';
end; $$;
