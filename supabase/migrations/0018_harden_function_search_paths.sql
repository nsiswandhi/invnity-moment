-- Pin function name resolution to trusted schemas.
-- pg_temp remains available for safe per-session temporary objects.

alter function public.normalize_email() set search_path = public, pg_temp;
alter function public.moment_record_json(public.moments) set search_path = public, pg_temp;
alter function public.reserve_moment_slot(uuid, uuid, uuid, timestamptz) set search_path = public, pg_temp;
alter function public.complete_moment(uuid, jsonb) set search_path = public, pg_temp;
alter function public.delete_owned_moment(uuid, uuid) set search_path = public, pg_temp;
alter function public.list_owned_moments(uuid, text, integer) set search_path = public, pg_temp;
alter function public.get_participant_for_event(uuid, uuid) set search_path = public, pg_temp;
alter function public.seed_local_event(text, text, date) set search_path = public, pg_temp;

alter function public.create_recovery_token(text, uuid, text, timestamptz, text) set search_path = public, pg_temp;
alter function public.claim_recovery_delivery_outbox(integer, integer, timestamptz) set search_path = public, pg_temp;
alter function public.complete_recovery_delivery(uuid, uuid, timestamptz) set search_path = public, pg_temp;
alter function public.fail_recovery_delivery(uuid, uuid, integer, timestamptz, timestamptz) set search_path = public, pg_temp;

alter function public.consume_rate_limit_bucket(text, text, integer, integer) set search_path = public, pg_temp;
alter function public.register_participant_for_event(text, text, text, text, text) set search_path = public, pg_temp;
alter function public.resume_participant_for_event(text, uuid, text) set search_path = public, pg_temp;
alter function public.create_access_session(uuid, text, timestamptz) set search_path = public, pg_temp;
alter function public.get_authenticated_participant_for_session(text) set search_path = public, pg_temp;
alter function public.revoke_access_session(text) set search_path = public, pg_temp;
alter function public.consume_recovery_token(text, timestamptz) set search_path = public, pg_temp;
alter function public.get_participant_quota_summary(uuid) set search_path = public, pg_temp;

alter function public.update_owned_moment(uuid, uuid, text) set search_path = public, pg_temp;
alter function public.set_admin_moment_visibility(uuid, uuid, uuid, text, text) set search_path = public, pg_temp;
alter function public.deny_moderation_audit_mutation() set search_path = public, pg_temp;
alter function public.list_admin_moments(uuid, text, integer) set search_path = public, pg_temp;
alter function public.get_moment_for_participant(uuid, uuid) set search_path = public, pg_temp;
alter function public.get_active_admin_user(uuid) set search_path = public, pg_temp;
alter function public.get_active_admin_user_by_email(text) set search_path = public, pg_temp;
alter function public.get_admin_dashboard_summary(uuid) set search_path = public, pg_temp;
alter function public.list_admin_participants(uuid, text, text, integer) set search_path = public, pg_temp;
alter function public.set_admin_event_mode(uuid, text) set search_path = public, pg_temp;
alter function public.admin_database_health_check() set search_path = public, pg_temp;
alter function public.get_admin_error_rate(uuid) set search_path = public, pg_temp;
alter function public.block_moment_completion_when_event_write_disabled() set search_path = public, pg_temp;

alter function public.record_analytics_event(uuid, uuid, text, jsonb) set search_path = public, pg_temp;
alter function public.get_analytics_funnel_summary(uuid) set search_path = public, pg_temp;
alter function public.get_sponsor_summary(uuid) set search_path = public, pg_temp;

alter function public.cleanup_expired_sessions(timestamptz, integer, boolean) set search_path = public, pg_temp;
alter function public.list_expected_r2_objects(uuid, text, integer) set search_path = public, pg_temp;

alter function public.decode_public_album_cursor(text) set search_path = public, pg_temp;
alter function public.list_published_moments(uuid, text, text, integer, text) set search_path = public, pg_temp;
alter function public.get_published_moment(uuid, uuid, text) set search_path = public, pg_temp;
alter function public.set_public_moment_like(uuid, uuid, text, boolean) set search_path = public, pg_temp;
alter function public.get_public_event_state(uuid) set search_path = public, pg_temp;
