# Cloudways deployment

Cloudways runs the Next.js application as a Node.js process behind its managed web server. Build artifacts stay on the application host; uploads go directly to Cloudflare R2 and metadata stays in Supabase.

## Release procedure

1. Configure Node.js 22.x and the repository checkout in the application settings.
2. Add the server-only variables from `README.md` to the Cloudways environment/secret store. Add `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_EVENT_ID`, and `NEXT_PUBLIC_EVENT_SLUG` as build-time public configuration. Do not copy secret values into source control or shell history.
3. Install and build with `npm ci` and `npm run build`.
4. Start with `npm run start` and configure the process manager to restart the service on failure.
5. Apply Supabase migrations before enabling the new application release. Run the smoke script only with `SMOKE_BASE_URL` set to a reachable staging or production URL.

## Scheduled jobs

Schedule `cleanup-expired-sessions.ts` at a modest interval with a single instance. Run R2 reconciliation in its default dry-run mode first; `--apply` is an explicit operator action and must not run concurrently with another reconciliation. Analytics aggregation is read-only and may be run after the event.

Cloudways cron and process-manager configuration should reference the absolute checkout path and the Node 22 runtime selected by Cloudways. Keep logs, exit codes, and the JSON reports available to the operator.

## Rollback and operations

Rollback means switching the process to the previously built release and keeping the database migration applied; migrations in this project are additive. Restore R2/Supabase data only through the provider backup procedures after confirming the event, object prefix, and recovery point. Rotate `SESSION_SECRET`, R2 keys, Supabase service-role keys, and admin credentials through the secret store, then restart the process.
