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

## Approved follow-up fixes — 2026-09-13

- Instrumented landing, public album, moment detail, successful likes, successful downloads, and recovery completion events using the existing client/server analytics paths. View events use keyed client deduplication; action events are emitted only after successful server operations. No email, token, signed URL, or other unnecessary personal data is added.
- Hardened `POST /api/v1/analytics` to require exact `application/json` content type and reject bodies over 8 KiB before JSON parsing.
- Replaced CSP `unsafe-inline` directives with per-request nonce sources. Middleware forwards the nonce to Next.js through `x-nonce` and applies the matching policy to the response.
- Added regression coverage for telemetry emission, deduplication, request content type/body limits, and nonce-based CSP.

### Verification

| Check | Result |
| --- | --- |
| TDD focused red phase | 7 expected regressions failed before implementation |
| TDD focused green phase | 37 passed |
| Full unit/integration suite | 263 passed, 1 skipped |
| Typecheck | passed |
| Lint | passed |
| Production build | passed |
| `git diff --check` | passed |
| End-to-end suite | blocked: 3 tests fail because `playwright.config.ts` has no `use.baseURL`, so relative `page.goto()` calls are invalid |

Playwright Chromium was installed to remove the missing-browser environment blocker. The remaining E2E failure is an existing test configuration issue and was not changed because it is outside this follow-up scope.

## Remaining review fixes — 2026-09-13

- Corrected Next 15 CSP nonce propagation by forwarding the exact nonce-bearing CSP policy and nonce on the middleware request, alongside the matching response policy.
- Sanitization now drops email-shaped values even when they use an allowlisted analytics property name.
- `trackClientEventOnce` now releases its key when the beacon/fetch transport is unavailable or unsuccessful, allowing a later retry.
- Added regression tests for request/response CSP parity, email-shaped values, and retryable client telemetry.

### Verification

| Check | Result |
| --- | --- |
| TDD focused red phase | 3 expected regressions failed before implementation |
| TDD focused green phase | 13 passed |
| Typecheck | passed |
| Lint | passed |
| Production build | passed, exit code 0 |
| `git diff --check` | passed |
