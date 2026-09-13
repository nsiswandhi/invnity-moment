-- Task 8: event-scoped analytics persistence and reporting aggregates.
create index if not exists analytics_events_event_name_created_idx on analytics_events (event_id, name, created_at desc);

create or replace function record_analytics_event(
  p_event_id uuid,
  p_participant_id uuid,
  p_name text,
  p_properties jsonb
) returns void language plpgsql as $$
begin
  if p_name not in (
    'qr_landing', 'registration_started', 'registration_completed', 'camera_opened', 'permission_result',
    'capture', 'retake', 'category_selected', 'upload_started', 'upload_succeeded', 'upload_failed',
    'upload_retried', 'moment_published', 'moment_deleted', 'gallery_view', 'moment_detail_view',
    'moment_liked', 'moment_downloaded', 'recovery_requested', 'recovery_completed',
    'sponsor_module_view', 'sponsor_cta_click'
  ) then raise exception 'ANALYTICS_EVENT_INVALID' using errcode = 'P0001'; end if;
  if p_properties is null or jsonb_typeof(p_properties) <> 'object' then raise exception 'ANALYTICS_EVENT_INVALID' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_object_keys(p_properties) as key_name where key_name ~* '(email|token|secret|password|authorization|cookie|signature|url|api.?key)')
    or p_properties::text ~* '(https?://|x-amz-|bearer[[:space:]]+|token=|secret=|password=)'
  then raise exception 'ANALYTICS_PROPERTIES_UNSAFE' using errcode = 'P0001'; end if;
  if not exists (select 1 from events where id = p_event_id) then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_participant_id is not null and not exists (select 1 from participants where id = p_participant_id and event_id = p_event_id) then
    raise exception 'PARTICIPANT_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into analytics_events (event_id, participant_id, name, properties) values (p_event_id, p_participant_id, p_name, p_properties);
end; $$;

create or replace function get_analytics_funnel_summary(p_event_id uuid)
returns jsonb language sql stable as $$
  with counts as (
    select
      (count(*) filter (where name = 'qr_landing'))::integer as qr_landing,
      (count(*) filter (where name = 'registration_started'))::integer as registration_started,
      (count(*) filter (where name = 'registration_completed'))::integer as registration_completed,
      (count(*) filter (where name = 'camera_opened'))::integer as camera_opened,
      (count(*) filter (where name = 'capture'))::integer as captures,
      (count(*) filter (where name = 'upload_started'))::integer as upload_started,
      (count(*) filter (where name = 'upload_succeeded'))::integer as upload_succeeded,
      (count(*) filter (where name = 'moment_published'))::integer as published,
      (count(*) filter (where name = 'gallery_view'))::integer as gallery_views,
      (count(*) filter (where name = 'moment_detail_view'))::integer as moment_detail_views,
      (count(*) filter (where name = 'moment_liked'))::integer as likes,
      (count(*) filter (where name = 'moment_downloaded'))::integer as downloads,
      (count(*) filter (where name = 'recovery_requested'))::integer as recovery_requested,
      (count(*) filter (where name = 'recovery_completed'))::integer as recovery_completed
    from analytics_events where event_id = p_event_id
  ) select jsonb_build_object(
    'qrLanding', qr_landing, 'registrationStarted', registration_started, 'registrationCompleted', registration_completed,
    'cameraOpened', camera_opened, 'captures', captures, 'uploadStarted', upload_started,
    'uploadSucceeded', upload_succeeded, 'published', published, 'galleryViews', gallery_views,
    'momentDetailViews', moment_detail_views, 'likes', likes, 'downloads', downloads,
    'recoveryRequested', recovery_requested, 'recoveryCompleted', recovery_completed
  ) from counts
$$;

create or replace function get_sponsor_summary(p_event_id uuid)
returns jsonb language sql stable as $$
  with counts as (
    select
      (count(*) filter (where name = 'sponsor_module_view'))::integer as views,
      (count(*) filter (where name = 'sponsor_cta_click'))::integer as clicks
    from analytics_events where event_id = p_event_id
  ) select jsonb_build_object(
    'views', views,
    'clicks', clicks,
    'ctr', case when views = 0 then 0 else round((clicks::numeric * 100) / views, 2) end
  ) from counts
$$;
