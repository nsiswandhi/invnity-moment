-- Make the server-only access model explicit to the security advisor.
-- These policies do not grant browser access; they deny it for both client roles.

create policy deny_client_access_events on public.events for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_participants on public.participants for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_access_sessions on public.access_sessions for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_moments on public.moments for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_upload_reservations on public.upload_reservations for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_likes on public.likes for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_admin_users on public.admin_users for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_moderation_actions on public.moderation_actions for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_analytics_events on public.analytics_events for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_system_health_snapshots on public.system_health_snapshots for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_recovery_tokens on public.recovery_tokens for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_recovery_delivery_outbox on public.recovery_delivery_outbox for all to anon, authenticated using (false) with check (false);
create policy deny_client_access_rate_limit_buckets on public.rate_limit_buckets for all to anon, authenticated using (false) with check (false);
