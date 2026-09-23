-- Protect every application table from direct browser access.
-- The application uses the service_role server boundary and intentionally
-- exposes only validated RPC projections and mutations.

alter table public.events enable row level security;
revoke all on table public.events from public, anon, authenticated;

alter table public.participants enable row level security;
revoke all on table public.participants from public, anon, authenticated;

alter table public.access_sessions enable row level security;
revoke all on table public.access_sessions from public, anon, authenticated;

alter table public.moments enable row level security;
revoke all on table public.moments from public, anon, authenticated;

alter table public.upload_reservations enable row level security;
revoke all on table public.upload_reservations from public, anon, authenticated;

alter table public.likes enable row level security;
revoke all on table public.likes from public, anon, authenticated;

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from public, anon, authenticated;

alter table public.moderation_actions enable row level security;
revoke all on table public.moderation_actions from public, anon, authenticated;

alter table public.analytics_events enable row level security;
revoke all on table public.analytics_events from public, anon, authenticated;

alter table public.system_health_snapshots enable row level security;
revoke all on table public.system_health_snapshots from public, anon, authenticated;

alter table public.recovery_tokens enable row level security;
revoke all on table public.recovery_tokens from public, anon, authenticated;

alter table public.recovery_delivery_outbox enable row level security;
revoke all on table public.recovery_delivery_outbox from public, anon, authenticated;

alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from public, anon, authenticated;
