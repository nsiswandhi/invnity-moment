# Event-day runbook

This runbook is an operator checklist. It does not replace provider backup, incident, or access-control procedures.

## Before opening

- Confirm the approved event UUID/slug and that the event row is in the intended status.
- Confirm the last Supabase backup/recovery point and that R2 retention/backups are active.
- Verify deployment secrets are present without printing their values: Supabase URL/service-role key, R2 credentials/bucket, session secret, and public app/event configuration.
- Apply migrations in order and record the migration history.
- Run the production smoke script with `SMOKE_BASE_URL` set. Treat an unreachable target or any failed HTTP check as a release blocker; do not report success from a local command alone.
- Verify HTTPS, DNS, CSP, R2 CORS, upload, public album, moment detail, like, download, and recovery completion paths from the reachable environment.

## During the event

- Monitor application health, upload failure rate, recovery outbox backlog, database latency, R2 errors, and analytics ingestion.
- Run expired-session cleanup with its bounded default. Keep one scheduler instance and retain the JSON output.
- Do not run R2 reconciliation with `--apply` during active uploads. A dry-run report may be reviewed, but any deletion requires an operator decision and a confirmed event prefix.
- Keep an incident log with timestamps, affected event, operator, observed symptom, and action. Never log tokens, email addresses, raw IPs, or secret values.

## If uploads or reads degrade

1. Check health and provider status, then capture request IDs and bounded error reports.
2. Pause promotion or new uploads if needed; do not delete objects or reservations as a first response.
3. If the issue is an application release, switch Cloudways to the previous release while leaving additive migrations in place.
4. If the issue is provider-side, follow Cloudways, Cloudflare, or Supabase incident procedures and communicate the user-visible impact.
5. Re-run smoke checks only against a reachable target and record whether every check passed.

## Closing and post-event

- Confirm final analytics aggregation and export only approved aggregate data.
- Run R2 reconciliation in dry-run mode, review expected/orphaned keys, and apply only after a backup and explicit approval.
- Keep the event available for read-only access according to the retention policy; archive only after confirming recovery and export requirements.
- Rotate credentials if exposure is suspected or scheduled rotation is due. Record secret names and timestamps, never values.
- Attach smoke, cleanup, reconciliation, backup, and incident reports to the change record.
