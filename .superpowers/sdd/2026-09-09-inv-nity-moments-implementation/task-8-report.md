# Task 8 — Analytics, Sponsor Attribution, Security Hardening

## Delivered

- Added a single validated analytics schema for browser and server events. Only approved event names and compact, allowlisted properties are accepted. Email addresses, tokens, signed URLs, secrets, and similar values are dropped before transmission.
- Added the public `POST /api/v1/analytics` endpoint. It records only against the configured event, applies the existing rate-limit pattern, returns `202`, and cannot receive an arbitrary event ID or participant identity from the client.
- Added admin-only `GET /api/v1/admin/analytics`, guarded by the existing admin session and rate limiter. It returns funnel counts and Lima Circle views, clicks, and CTR only.
- Added event-scoped analytics persistence and aggregate RPCs in `0010_task8_analytics_security.sql`.
- Added lightweight funnel and Lima Circle metric panels to the existing admin dashboard. The main admin dashboard remains usable if analytics data is temporarily unavailable, for example before the migration is applied.
- Added request IDs, safe structured error/rate-limit logs, redaction, CSP, safe image policy, standard defensive headers, and an Edge-safe middleware request ID generator. The middleware uses `globalThis.crypto.randomUUID()` and does not import Node-only crypto.

## Data and boundary notes

- Analytics properties never include raw email, credentials, cookies, signed URLs, or media object keys.
- Analytics events always use `NEXT_PUBLIC_EVENT_ID` on the server; a client-supplied event ID is ignored.
- Sponsor reporting intentionally stops at outbound module views, CTA clicks, and CTR. It does not report installations or downstream store activity.
- The new admin analytics route keeps the existing `requireAdmin` authentication boundary. Participant/public access cannot retrieve aggregates.

## Migration

Apply the new migration before relying on production analytics aggregates:

```powershell
npx supabase db push
```

This applies `0010_task8_analytics_security.sql`, creating the analytics index and RPCs used by the new routes.

## Verification

| Check | Result |
| --- | --- |
| Focused Task 8 tests | 13 passed |
| Typecheck | passed |
| Lint | passed |
| Full unit/integration suite | 257 passed, 1 skipped |
| Production build | passed, exit code 0 |
| `git diff --check` | passed |

The single skipped test is the existing Supabase-dependent quota integration test; it requires separately configured local Supabase integration services.

## Review follow-up — 2026-09-13

### Security corrections

- Added `0011_task8_analytics_rpc_permissions.sql`. It enables RLS on `analytics_events`, removes direct table access for `public`, `anon`, and `authenticated`, revokes default `PUBLIC` execute rights from all three analytics RPCs, and grants the required access only to `service_role`.
- Added a PostgreSQL regression test that verifies anonymous callers have no execution or table-read privilege while `service_role` retains the server-side event writer permission.
- `apiError` now logs the stable `UNEXPECTED` category instead of arbitrary `Error.message` text. Structured redaction now also recurses through nested data and treats credential-bearing phrases and `Error` instances as sensitive.
- Updated every existing API route that generated a fresh request ID to derive it from the incoming request. The legacy admin summary route also sets that same ID on its own direct success response; middleware continues setting the request ID and defensive headers for all requests.

### Verification

| Check | Result |
| --- | --- |
| New analytics permission regression | passed |
| New log-redaction regression | passed |
| New request-ID propagation regression | passed |
| Full unit/integration suite | 260 passed, 1 skipped |
| Typecheck | passed |
| Lint | passed |
| Production build | passed |
| `git diff --check` | passed |

Apply the new migration after deployment preparation:

```powershell
npx supabase db push
```
