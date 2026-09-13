-- Restrict analytics storage and reporting to the server-side service role.
-- The public browser records events through /api/v1/analytics, whose server
-- database client uses this role after schema validation and rate limiting.
alter table public.analytics_events enable row level security;

revoke all on table public.analytics_events from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert on table public.analytics_events to service_role;
grant select on table public.events, public.participants to service_role;

revoke all on function public.record_analytics_event(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_analytics_funnel_summary(uuid) from public, anon, authenticated;
revoke all on function public.get_sponsor_summary(uuid) from public, anon, authenticated;

grant execute on function public.record_analytics_event(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.get_analytics_funnel_summary(uuid) to service_role;
grant execute on function public.get_sponsor_summary(uuid) to service_role;
