-- Forward-only fixes for Task 7 installations that have already applied 0008.
begin;

-- Remove the old overload: leaving it callable would bypass event scoping.
drop function if exists set_admin_moment_visibility(uuid, uuid, text, text);
create or replace function set_admin_moment_visibility(p_event_id uuid, p_admin_user_id uuid, p_moment_id uuid, p_visibility text, p_reason text)
returns void language plpgsql as $$
declare v_moment moments%rowtype;
begin
  if not exists (select 1 from admin_users where id = p_admin_user_id and status = 'active') then raise exception 'ADMIN_NOT_ACTIVE' using errcode = 'P0001'; end if;
  if p_visibility is null or p_visibility not in ('hidden', 'published') then raise exception 'INVALID_MOMENT_VISIBILITY' using errcode = 'P0001'; end if;
  if p_visibility = 'hidden' and (p_reason is null or length(btrim(p_reason)) = 0 or length(btrim(p_reason)) > 500) then raise exception 'MODERATION_REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into v_moment from moments where id = p_moment_id and event_id = p_event_id and deleted_at is null for update;
  if not found then raise exception 'MOMENT_NOT_AVAILABLE' using errcode = 'P0001'; end if;
  if p_visibility = 'hidden' then
    if v_moment.status not in ('PUBLISHED', 'HIDDEN') then raise exception 'MOMENT_NOT_MODERATABLE' using errcode = 'P0001'; end if;
    update moments set status = 'HIDDEN', hidden_at = coalesce(hidden_at, clock_timestamp()), hidden_reason = btrim(p_reason) where id = v_moment.id and event_id = p_event_id;
    insert into moderation_actions (admin_user_id, moment_id, action, reason) values (p_admin_user_id, v_moment.id, 'HIDE', btrim(p_reason));
  else
    if v_moment.status <> 'HIDDEN' then raise exception 'MOMENT_NOT_MODERATABLE' using errcode = 'P0001'; end if;
    update moments set status = 'PUBLISHED', hidden_at = null, hidden_reason = null where id = v_moment.id and event_id = p_event_id;
    insert into moderation_actions (admin_user_id, moment_id, action, reason) values (p_admin_user_id, v_moment.id, 'UNHIDE', null);
  end if;
end; $$;

-- Audit history is append-only even for database clients that bypass RLS.
create or replace function deny_moderation_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'MODERATION_AUDIT_IMMUTABLE' using errcode = '42501';
end; $$;

create trigger moderation_actions_deny_update_delete
before update or delete on moderation_actions
for each row execute function deny_moderation_audit_mutation();
create trigger moderation_actions_deny_truncate
before truncate on moderation_actions
for each statement execute function deny_moderation_audit_mutation();
alter table moderation_actions enable always trigger moderation_actions_deny_update_delete;
alter table moderation_actions enable always trigger moderation_actions_deny_truncate;

create or replace function update_owned_moment(p_participant_id uuid, p_moment_id uuid, p_category text)
returns jsonb language plpgsql as $$
declare v_moment moments%rowtype; v_event_status text;
begin
  if p_category not in ('REUNI','PANGGUNG','FESTIVAL','BAZAAR','KOMUNITAS','ZERO_WASTE','NOSTALGIA','MOMEN_KITA') then
    raise exception 'INVALID_MOMENT_CATEGORY' using errcode = 'P0001';
  end if;
  -- Hold a share lock through the mutation so a mode switch cannot race it.
  select e.status into v_event_status from events e join moments m on m.event_id = e.id
    where m.id = p_moment_id and m.participant_id = p_participant_id and m.deleted_at is null for share of e;
  if not found then raise exception 'MOMENT_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_event_status in ('maintenance', 'archived') then raise exception 'EVENT_WRITE_DISABLED' using errcode = 'P0001'; end if;
  update moments set category = p_category
    where id = p_moment_id and participant_id = p_participant_id and deleted_at is null
    returning * into v_moment;
  if not found then raise exception 'MOMENT_NOT_FOUND' using errcode = 'P0001'; end if;
  return moment_record_json(v_moment);
end; $$;

create or replace function delete_owned_moment(p_participant_id uuid, p_moment_id uuid)
returns void language plpgsql as $$
declare v_event_status text;
begin
  select e.status into v_event_status from events e join moments m on m.event_id = e.id
    where m.id = p_moment_id and m.participant_id = p_participant_id and m.deleted_at is null for share of e;
  if not found then raise exception 'MOMENT_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_event_status in ('maintenance', 'archived') then raise exception 'EVENT_WRITE_DISABLED' using errcode = 'P0001'; end if;
  update moments set deleted_at = clock_timestamp()
    where id = p_moment_id and participant_id = p_participant_id and deleted_at is null;
  if not found then raise exception 'MOMENT_NOT_FOUND' using errcode = 'P0001'; end if;
  update upload_reservations set status = 'CANCELLED' where moment_id = p_moment_id and status = 'RESERVED';
end; $$;

create or replace function list_admin_moments(p_event_id uuid, p_visibility text, p_limit integer)
returns jsonb language plpgsql stable as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if p_visibility not in ('recent', 'hidden') then raise exception 'INVALID_ADMIN_MOMENT_FILTER' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', m.id, 'category', m.category, 'status', m.status, 'createdAt', m.created_at, 'publishedAt', m.published_at,
    'hiddenAt', m.hidden_at, 'hiddenReason', m.hidden_reason, 'participantName', p.name, 'participantBatch', p.batch,
    'participantId', p.id, 'r2OriginalKey', m.r2_original_key, 'r2DisplayKey', m.r2_display_key, 'r2ThumbnailKey', m.r2_thumbnail_key
  ) order by m.created_at desc) from moments m join participants p on p.id = m.participant_id
  where m.event_id = p_event_id and m.deleted_at is null and ((p_visibility = 'recent' and m.status in ('PUBLISHED', 'HIDDEN')) or (p_visibility = 'hidden' and m.status = 'HIDDEN'))
  limit v_limit), '[]'::jsonb);
end; $$;

commit;
