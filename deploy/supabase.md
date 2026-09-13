# Supabase deployment

Supabase stores event, participant, session, moment, reservation, like, recovery, and analytics metadata. The Next.js server uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the service-role key is never sent to a browser.

## Migration order

Run the SQL files in `supabase/migrations/` in filename order using the approved Supabase migration workflow. Confirm the migration history and database health before switching application traffic. Task 10 adds bounded service-role-only cleanup and expected-object listing functions in `0012_task10_operations.sql`.

## Backups and restore

Enable the Supabase plan's automated backups and retain a recovery point that covers the event. Before an event, record the last successful backup time and test that the team can locate the restore procedure. A restore is an operator decision: confirm the affected event and recovery point, pause writes, restore through Supabase, re-run the application smoke test against a reachable target, and record the result.

## Security and rotation

Restrict database functions used by operational jobs to the service role. Rotate the service-role key through the deployment secret store, deploy it, verify health, then revoke the old key. Never place credentials in this document, CI logs, client bundles, or migration files.

## CORS and URL settings

Configure Supabase Auth/API allowed origins to the exact HTTPS application origin where applicable. Keep the application URL, event UUID, and event slug aligned with the event row and deployment environment; use `NEXT_PUBLIC_*` only for values safe to expose publicly.
