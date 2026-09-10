# InVnity Moments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the InVnity Moments mobile-first event web app for up to 500 participants and 5,000 active moments, with browser camera capture, direct Cloudflare R2 upload, public album, reactive moderation, analytics, and event-day operations.

**Architecture:** A Next.js/TypeScript application runs on Cloudways as the web/API boundary. Supabase PostgreSQL stores event, participant, session, moment, like, audit, and analytics metadata; Cloudflare R2 stores private image derivatives, with Cloudflare providing DNS/TLS and cache delivery. The browser owns camera capture, compression, pending-upload state, and retry UX.

**Tech Stack:** Node.js 22.x, Next.js App Router, TypeScript, React, Supabase PostgreSQL, `@supabase/supabase-js` for database access, AWS S3 SDK for R2-compatible signed URLs, `sharp` for bounded derivative generation, Zod, Vitest, React Testing Library, Playwright, and k6.

**Spec:** `docs/superpowers/specs/2026-09-09-inv-nity-moments-design.md`

## Global Constraints

- Target event date: 10 October 2026.
- Capacity target: approximately 500 registered participants and a hard ceiling of 5,000 active moments.
- Each participant has 10 active moments; the limit is transactional and server-authoritative.
- Delete releases a slot; retake never consumes a slot.
- Public album publishes immediately after validation and derivative availability; moderation is reactive.
- Photo binaries upload directly from the browser to private Cloudflare R2; Cloudways handles authorization and metadata.
- Cloudways remains a lightweight application/API host; image processing must be bounded and pass the load gate.
- No passwords, OTP, mandatory email verification, native apps, camera filters, comments, messaging, followers, or social feed.
- All participant-facing copy is event-oriented Indonesian; visual system uses cream, InVnity Green `#0D5F3A`, yellow `#F7E600`, hand-drawn outlines, doodle storytelling, Bebas Neue, Montserrat, and restrained Bangers accents.
- Lima Circle is a subordinate sponsor bridge measured by module views and outbound clicks; the product must not claim confirmed installs.
- Every state-changing cookie-authenticated request requires CSRF/origin protection, rate limiting, auditability where applicable, and friendly error responses.

---

## File map

The repository is currently empty apart from project reference material. The implementation should create this focused structure:

```text
app/
  (public)/page.tsx
  (public)/register/page.tsx
  (public)/moments/page.tsx
  (public)/album/page.tsx
  (public)/album/[momentId]/page.tsx
  (public)/recovery/page.tsx
  admin/page.tsx
  api/v1/...
components/
  brand/
  camera/
  moments/
  album/
  sponsor/
  admin/
lib/
  auth/
  db/
  media/
  rate-limit/
  analytics/
  validation/
  errors/
supabase/migrations/...
public/brand/...
tests/unit/...
tests/e2e/...
tests/load/...
scripts/...
```

Each route should remain a thin composition layer. Domain behavior belongs in `lib/`; UI components should not contain database or storage credentials.

## Task 1: Bootstrap the application and testing foundation

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`
- Create: `app/layout.tsx`, `app/globals.css`, `lib/config.ts`, `lib/errors/http-error.ts`
- Create: `tests/unit/config.test.ts`
- Create: `README.md` with local setup, environment variables, and test commands

**Interfaces:**
- `lib/config.ts` exports `getServerConfig()` returning validated server-only configuration and `getPublicConfig()` returning only safe browser configuration.
- `lib/errors/http-error.ts` exports `HttpError` with `status`, `code`, and `publicMessage`.
- Test scripts are `npm run test:unit`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`, and `npm run test:load`.

- [ ] **Step 1: Write the failing configuration tests**

```ts
it('rejects production configuration without R2 and session secrets', () => {
  expect(() => getServerConfig({ NODE_ENV: 'production' })).toThrow('R2');
});

it('does not expose private keys through public configuration', () => {
  expect(Object.keys(getPublicConfig({ NEXT_PUBLIC_EVENT_SLUG: 'reuni-2026' })))
    .toEqual(['eventSlug']);
});
```

- [ ] **Step 2: Run `npm run test:unit -- tests/unit/config.test.ts` and verify it fails because the foundation does not exist.**
- [ ] **Step 3: Create the Next.js shell, strict TypeScript configuration, Zod-backed environment parser, error type, and test scripts.**
- [ ] **Step 4: Add the Indonesian default document metadata and baseline CSS tokens for cream, green, yellow, charcoal, spacing, radius, focus rings, and reduced-motion behavior.**
- [ ] **Step 5: Run `npm run test:unit`, `npm run typecheck`, and `npm run lint`; all must pass.**
- [ ] **Step 6: Commit with `git add package.json tsconfig.json next.config.ts vitest.config.ts playwright.config.ts .env.example .gitignore app lib tests README.md && git commit -m "chore: bootstrap InVnity Moments app"`.**

## Task 2: Create the Supabase schema and transactional quota model

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`, `supabase/migrations/0002_security_indexes.sql`
- Create: `lib/db/types.ts`, `lib/db/client.ts`, `lib/db/repositories/participants.ts`, `lib/db/repositories/moments.ts`
- Create: `tests/unit/quota.test.ts`, `tests/integration/quota.integration.test.ts`
- Create: `scripts/seed-local-event.ts`

**Interfaces:**
- `reserveMomentSlot(participantId, eventId, reservationId, expiresAt): Promise<{ momentId: string; reservationId: string }>`
- `completeMoment(momentId, objectMetadata): Promise<MomentRecord>`
- `deleteOwnedMoment(participantId, momentId): Promise<void>`
- `listOwnedMoments(participantId, cursor, limit): Promise<CursorPage<MomentRecord>>`

- [ ] **Step 1: Write unit tests for 0/10, 9/10, 10/10, delete-at-10, expired reservation, and two concurrent reservations at 9/10.**
- [ ] **Step 2: Run `npm run test:unit -- tests/unit/quota.test.ts`; verify the tests fail because the repository functions are absent.**
- [ ] **Step 3: Add migrations for `events`, `participants`, `access_sessions`, `moments`, `upload_reservations`, `likes`, `admin_users`, `moderation_actions`, `analytics_events`, and `system_health_snapshots`.**
- [ ] **Step 4: Add indexes for event/participant lookup, published album cursor ordering, category filtering, session expiry, reservation expiry, and the unique active-like constraint.**
- [ ] **Step 5: Implement a PostgreSQL transaction/function that locks the participant quota scope, counts non-deleted/non-rejected moments plus unexpired reservations, rejects counts at 10, and inserts exactly one reservation.**
- [ ] **Step 6: Implement soft delete so a deleted moment releases a slot without deleting audit history; make completion idempotent by moment ID.**
- [ ] **Step 7: Run the integration suite against a local Supabase/PostgreSQL instance and verify concurrent reservations never exceed ten.**
- [ ] **Step 8: Commit with `git add supabase lib/db tests scripts/seed-local-event.ts && git commit -m "feat: add database schema and transactional moment quota"`.**

## Task 3: Implement participant identity, sessions, and recovery

**Files:**
- Create: `lib/auth/session.ts`, `lib/auth/recovery.ts`, `lib/auth/csrf.ts`, `lib/auth/rate-limits.ts`
- Create: `lib/validation/participant.ts`
- Create: `app/api/v1/events/[event]/participants/route.ts`, `app/api/v1/me/route.ts`, `app/api/v1/access-recovery/route.ts`, `app/api/v1/access-recovery/consume/route.ts`, `app/api/v1/session/revoke/route.ts`
- Create: `lib/email/email-sender.ts`, `lib/email/smtp-email-sender.ts`, `tests/unit/session.test.ts`, `tests/integration/auth-routes.test.ts`

**Interfaces:**
- `createParticipantSession(input): Promise<ParticipantSessionSummary>`
- `requireParticipant(request): Promise<AuthenticatedParticipant>`
- `issueRecoveryToken(email, eventId): Promise<void>`
- `consumeRecoveryToken(token): Promise<AuthenticatedParticipant>`
- `sendRecoveryEmail: (message: RecoveryEmail) => Promise<void>`

- [ ] **Step 1: Write tests for registration validation, idempotent normalized email behavior, HttpOnly cookie attributes, non-enumerating recovery responses, one-time token consumption, expiry, and revocation.**
- [ ] **Step 2: Run `npm run test:unit -- tests/unit/session.test.ts`; verify failure.**
- [ ] **Step 3: Implement normalized name/batch/email validation, random hashed session tokens, Secure/HttpOnly/SameSite cookies, and event-scoped participant lookup.**
- [ ] **Step 4: Implement recovery tokens as hashed, one-use, short-lived records; send through an SMTP adapter whose credentials are server-only.**
- [ ] **Step 5: Add CSRF token issuance and origin checks to all cookie-authenticated mutation routes.**
- [ ] **Step 6: Implement the five API routes and the stable `{ error: { code, message }, request_id }` response shape.**
- [ ] **Step 7: Run unit and integration tests, including `429` responses for registration and recovery bursts.**
- [ ] **Step 8: Commit with `git add lib/auth lib/validation lib/email app/api/v1 tests && git commit -m "feat: add event identity and recovery"`.**

## Task 4: Build direct R2 upload, derivatives, and retry-safe completion

**Files:**
- Create: `lib/media/r2-client.ts`, `lib/media/object-keys.ts`, `lib/media/validate-image.ts`, `lib/media/process-derivatives.ts`, `lib/media/upload-service.ts`
- Create: `app/api/v1/moments/reserve/route.ts`, `app/api/v1/moments/[momentId]/complete/route.ts`, `app/api/v1/moments/[momentId]/download/route.ts`
- Create: `components/camera/image-compression.ts`, `components/camera/pending-upload-queue.ts`
- Create: `tests/unit/media-validation.test.ts`, `tests/unit/object-keys.test.ts`, `tests/integration/upload-flow.test.ts`

**Interfaces:**
- `createUploadAuthorization(input): Promise<{ momentId: string; uploadUrl: string; expiresAt: string }>`
- `validateUploadedObject(objectKey): Promise<ValidatedImageMetadata>`
- `processDerivatives(objectKey, metadata): Promise<DerivativeKeys>`
- `completeUpload(momentId): Promise<MomentRecord>`
- `PendingUploadQueue.enqueue(item): Promise<void>`, `.retry(id): Promise<void>`, `.remove(id): Promise<void>`

- [ ] **Step 1: Write tests for MIME/magic-byte/size/dimension rejection, deterministic event/participant/moment object keys, expired authorization, duplicate completion, and orphan cleanup eligibility.**
- [ ] **Step 2: Run `npm run test:unit -- tests/unit/media-validation.test.ts tests/unit/object-keys.test.ts`; verify failure.**
- [ ] **Step 3: Implement private R2 client construction, scoped presigned PUT URLs, signed download URLs, and object-key isolation by event and moment ID.**
- [ ] **Step 4: Implement image validation and bounded derivatives: display plus 400 px thumbnail; reject corrupt or unsupported objects.**
- [ ] **Step 5: Implement reserve → browser PUT → complete reconciliation; make complete idempotent and release reservation on failure/expiry.**
- [ ] **Step 6: Implement browser compression to max 2048 px long edge and a bounded local pending queue that retains the image until server confirmation.**
- [ ] **Step 7: Run integration tests with an R2-compatible local mock and verify no photo bytes pass through the API route.**
- [ ] **Step 8: Commit with `git add lib/media app/api/v1/moments components/camera tests && git commit -m "feat: add direct R2 upload and resilient media pipeline"`.**

## Task 5: Implement participant capture and personal album UX

**Files:**
- Create: `app/(public)/page.tsx`, `app/(public)/register/page.tsx`, `app/(public)/moments/page.tsx`, `app/(public)/recovery/page.tsx`
- Create: `components/brand/Welcome.tsx`, `components/brand/SponsorBridge.tsx`, `components/camera/CameraCapture.tsx`, `components/camera/PhotoPreview.tsx`, `components/moments/CategoryCards.tsx`, `components/moments/MyMomentsGrid.tsx`, `components/moments/DeleteMomentDialog.tsx`
- Create: `lib/analytics/client-events.ts`, `tests/e2e/participant-capture.spec.ts`, `tests/unit/category-cards.test.tsx`
- Add: `public/brand/invinity-mark.svg`, `public/brand/doodles.svg`, and approved font assets or font configuration

**Interfaces:**
- `CameraCapture.onCapture(blob: Blob): void`, `onPermissionState(state): void`
- `CategoryCards.onSelect(category: MomentCategory): void`
- `MyMomentsGrid` consumes `CursorPage<MomentRecord>` and exposes `onDelete` and `onCategoryChange` callbacks.
- Client analytics uses `trackClientEvent(name, properties)` and never sends email or session tokens.

- [ ] **Step 1: Write component tests for eight category cards, selected state, disabled state at 10/10, and accessible labels.**
- [ ] **Step 2: Run `npm run test:unit -- tests/unit/category-cards.test.tsx`; verify failure.**
- [ ] **Step 3: Build Welcome and Registration with one-screen form, event copy, sponsor module, and responsive visual tokens.**
- [ ] **Step 4: Implement camera permission, rear/front switch, capture, retake, preview, local compression, and category selection without filters or overlays.**
- [ ] **Step 5: Connect reserve/upload/complete states to the pending queue and render ready/uploading/retrying/saved/failed states.**
- [ ] **Step 6: Build My Moments grid, category edit, delete confirmation, slot-return messaging, and recovery entry.**
- [ ] **Step 7: Run the Playwright flow from QR landing through registration, capture mock, category, upload mock, personal album, delete, and re-upload.**
- [ ] **Step 8: Verify keyboard focus, reduced motion, contrast, safe-area insets, and mobile viewport behavior.**
- [ ] **Step 9: Commit with `git add app components lib/analytics public tests && git commit -m "feat: add participant capture and personal album"`.**

## Task 6: Build the public album, likes, downloads, and archive state

**Files:**
- Create: `app/(public)/album/page.tsx`, `app/(public)/album/[momentId]/page.tsx`
- Create: `components/album/AlbumHeader.tsx`, `components/album/AlbumGrid.tsx`, `components/album/MomentCard.tsx`, `components/album/MomentDetail.tsx`, `components/album/CategoryTabs.tsx`
- Create: `app/api/v1/moments/route.ts`, `app/api/v1/moments/[momentId]/route.ts`, `app/api/v1/moments/[momentId]/like/route.ts`
- Create: `lib/db/repositories/public-album.ts`, `tests/e2e/public-album.spec.ts`, `tests/integration/likes-and-downloads.test.ts`

**Interfaces:**
- `listPublishedMoments({ eventId, category, cursor, limit }): Promise<CursorPage<PublicMoment>>`
- `toggleLike({ momentId, anonymousUserKey }): Promise<{ liked: boolean; likeCount: number }>`
- Public media objects expose only `thumbnailUrl`, `displayUrl`, category, like count, and timestamps; no email or session identifiers.

- [ ] **Step 1: Write tests for cursor pagination, category selection, hidden/deleted exclusion, unique like/unlike, rate limiting, and signed download authorization.**
- [ ] **Step 2: Run `npm run test:unit -- tests/integration/likes-and-downloads.test.ts`; verify failure.**
- [ ] **Step 3: Implement cursor ordering by `published_at` plus opaque ID tie-breaker, default limit 30, and category validation.**
- [ ] **Step 4: Implement anonymous like identity, unique active constraint handling, and like throttling.**
- [ ] **Step 5: Build album grid/detail with thumbnails, progressive loading, like button, and signed download action.**
- [ ] **Step 6: Add post-event archive copy and disable new uploads/registration when the event state is `archived`.**
- [ ] **Step 7: Run Playwright on narrow mobile and desktop widths, including hundreds of mocked cards without loading all images at once.**
- [ ] **Step 8: Commit with `git add app components/album app/api/v1/moments lib/db/repositories/public-album.ts tests && git commit -m "feat: add public album likes and downloads"`.**

## Task 7: Add admin, moderation, health, and maintenance mode

**Files:**
- Create: `lib/auth/admin.ts`, `lib/db/repositories/admin.ts`, `lib/health/checks.ts`
- Create: `app/admin/page.tsx`, `app/admin/moments/page.tsx`, `app/admin/participants/page.tsx`
- Create: `components/admin/MetricCards.tsx`, `components/admin/LiveActivity.tsx`, `components/admin/MomentModerationGrid.tsx`, `components/admin/HealthStatus.tsx`, `components/admin/MaintenanceSwitch.tsx`
- Create: `app/api/v1/admin/summary/route.ts`, `app/api/v1/admin/moments/route.ts`, `app/api/v1/admin/moments/[momentId]/visibility/route.ts`, `app/api/v1/admin/health/route.ts`, `app/api/v1/admin/event-mode/route.ts`
- Create: `tests/integration/admin-security.test.ts`, `tests/e2e/admin-operations.spec.ts`

**Interfaces:**
- `requireAdmin(request): Promise<AdminUser>`
- `hideMoment(adminId, momentId, reason): Promise<void>` and `unhideMoment(adminId, momentId): Promise<void>`
- `getSystemHealth(): Promise<SystemHealthSnapshot>` with application, database, R2, upload, CDN, and error-rate checks.
- `setEventMode(mode: 'live' | 'maintenance' | 'archived'): Promise<EventRecord>`

- [ ] **Step 1: Write tests proving participant cookies cannot access admin routes, admin actions create audit records, hidden moments disappear publicly, and maintenance mode blocks new registration/upload.**
- [ ] **Step 2: Run `npm run test:unit -- tests/integration/admin-security.test.ts`; verify failure.**
- [ ] **Step 3: Implement separate admin authentication, route guards, audit records, and safe operator error messages.**
- [ ] **Step 4: Implement summary metrics, live activity, participant search/filter, recent/hidden moment views, hide/unhide, and reason capture.**
- [ ] **Step 5: Implement health checks with timeout budgets and a maintenance/event-mode switch that preserves public reads when safe.**
- [ ] **Step 6: Run the admin Playwright flow with an operator fixture and verify no raw stack traces or secrets render.**
- [ ] **Step 7: Commit with `git add lib/auth/admin.ts lib/db/repositories/admin.ts lib/health app/admin components/admin app/api/v1/admin tests && git commit -m "feat: add admin moderation and event operations"`.**

## Task 8: Add analytics, sponsor attribution, security hardening, and observability

**Files:**
- Create: `lib/analytics/server-events.ts`, `lib/analytics/event-schema.ts`, `lib/analytics/aggregates.ts`
- Create: `app/api/v1/analytics/route.ts`, `app/api/v1/admin/analytics/route.ts`
- Create: `lib/security/headers.ts`, `lib/security/request-id.ts`, `lib/security/redaction.ts`
- Create: `components/analytics/FunnelSummary.tsx`, `components/admin/SponsorMetrics.tsx`
- Create: `tests/unit/analytics-schema.test.ts`, `tests/integration/security-hardening.test.ts`

**Interfaces:**
- `trackServerEvent(event: AnalyticsEvent): Promise<void>`
- `trackClientEvent(name, properties): void`
- `getFunnelSummary(eventId): Promise<FunnelSummary>`
- `getSponsorSummary(eventId): Promise<{ views: number; clicks: number; ctr: number }>`

- [ ] **Step 1: Write tests for every approved event name, property redaction, sponsor view/click aggregation, and division-safe CTR calculation.**
- [ ] **Step 2: Run `npm run test:unit -- tests/unit/analytics-schema.test.ts`; verify failure.**
- [ ] **Step 3: Implement schema-validated events for QR landing, registration, camera, capture, upload, publication, gallery, likes, downloads, recovery, and sponsor actions.**
- [ ] **Step 4: Add request IDs, structured JSON logs, secret/token redaction, security headers, CSP, safe image headers, and rate-limit telemetry.**
- [ ] **Step 5: Add funnel and sponsor metrics to the admin dashboard; label sponsor results as outbound clicks/CTR, never installs.**
- [ ] **Step 6: Run security integration tests for CSRF, origin, cookie flags, route authorization, public payload redaction, and `429` behavior.**
- [ ] **Step 7: Commit with `git add lib/analytics lib/security app/api/v1/analytics app/api/v1/admin/analytics components/analytics components/admin/SponsorMetrics.tsx tests && git commit -m "feat: add analytics sponsor attribution and security hardening"`.**

## Task 9: Complete visual QA and real-device acceptance

**Files:**
- Modify: `app/globals.css`, all files under `components/brand`, `components/camera`, `components/moments`, and `components/album` as needed for QA findings
- Create: `tests/e2e/accessibility.spec.ts`, `tests/e2e/device-matrix.md`, `docs/superpowers/qa/inv-nity-moments-device-results.md`

**Interfaces:**
- All participant screens must render at 320 px, 375 px, 390 px, 412 px, and desktop widths without horizontal overflow.
- Camera, upload, and retry UI must expose visible state text and accessible labels.

- [ ] **Step 1: Write Playwright accessibility assertions for landmarks, heading order, focus visibility, labels, and keyboard-operable primary actions.**
- [ ] **Step 2: Run `npx playwright test tests/e2e/accessibility.spec.ts`; verify any missing semantics.**
- [ ] **Step 3: Validate the visual system against the approved creative direction: cream canvas, green/yellow hierarchy, hand-drawn treatment, readable typography, and sponsor subordination.**
- [ ] **Step 4: Test camera permission, front/back switch, capture, interrupted upload, browser reload, and recovery on real iPhone Safari/Chrome and Android Chrome/Samsung Internet devices.**
- [ ] **Step 5: Record device/browser/network results with pass/fail evidence and fix only issues within the approved MVP scope.**
- [ ] **Step 6: Commit with `git add app components tests/e2e docs/superpowers/qa && git commit -m "test: complete accessibility and real-device acceptance"`.**

## Task 10: Add deployment, cleanup jobs, backup, and event-day runbook

**Files:**
- Create: `scripts/cleanup-expired-sessions.ts`, `scripts/reconcile-r2-objects.ts`, `scripts/aggregate-analytics.ts`
- Create: `scripts/smoke-production.ts`, `scripts/seed-production-event.ts`
- Create: `.github/workflows/ci.yml`, `deploy/cloudways.md`, `deploy/cloudflare.md`, `deploy/supabase.md`, `docs/operations/event-day-runbook.md`
- Modify: `README.md`

**Interfaces:**
- `cleanupExpiredSessions(): Promise<CleanupReport>`
- `reconcileR2Objects({ dryRun: boolean }): Promise<ReconciliationReport>`
- `runProductionSmokeTest(baseUrl): Promise<SmokeReport>`

- [ ] **Step 1: Write tests for expired session cleanup, expired reservation cleanup, orphan R2 detection, dry-run safety, and production smoke report formatting.**
- [ ] **Step 2: Run `npm run test:unit -- scripts`; verify failure.**
- [ ] **Step 3: Implement scheduled cleanup and reconciliation jobs with bounded batches, idempotency, and dry-run mode.**
- [ ] **Step 4: Add CI gates for typecheck, lint, unit tests, integration tests, Playwright smoke tests, and migration validation.**
- [ ] **Step 5: Document Cloudways environment variables/process, Supabase migration order/backups, R2 bucket policy/CORS, Cloudflare DNS/TLS/cache, and secret rotation.**
- [ ] **Step 6: Write the event-day runbook covering pre-open smoke test, health cards, test upload/hide, operator support flow, upload incident response, maintenance mode, post-close drain, analytics export, and archive switch.**
- [ ] **Step 7: Run the smoke script against staging and verify all health checks, signed URLs, registration, upload, publish, hide, like, download, sponsor click, and archive behaviors.**
- [ ] **Step 8: Commit with `git add scripts .github deploy docs/operations README.md && git commit -m "ops: add deployment automation and event-day runbook"`.**

## Task 11: Run load tests and production readiness gate

**Files:**
- Create: `tests/load/registration.js`, `tests/load/upload-authorize.js`, `tests/load/gallery.js`, `tests/load/likes.js`, `tests/load/quota-boundary.js`
- Create: `docs/superpowers/qa/inv-nity-moments-load-results.md`
- Modify: `docs/operations/event-day-runbook.md`

**Interfaces:**
- k6 scenarios accept `BASE_URL`, `EVENT_SLUG`, and test-only credentials through environment variables; no production participant data is used.
- Each scenario emits thresholds for error rate, API latency, and successful completion.

- [ ] **Step 1: Write k6 scenarios for 100 concurrent registrations, 100 upload authorizations/direct uploads, hundreds of paginated gallery readers, burst likes, and concurrent quota reservations at 9/10.**
- [ ] **Step 2: Run each scenario against staging and confirm the expected failure thresholds are meaningful before judging production readiness.**
- [ ] **Step 3: Run the complete suite, capture Cloudways memory/CPU, Supabase query latency, R2 response time, CDN cache behavior, upload failures, and database conflicts.**
- [ ] **Step 4: If image processing exceeds Cloudways memory or latency limits, move it to the separate bounded worker/queue path defined in Task 4 and rerun the suite.**
- [ ] **Step 5: Verify no scenario exceeds 5,000 active moments, no duplicate active likes are created, no public response leaks participant email, and no captured image is silently lost in the retry flow.**
- [ ] **Step 6: Record pass/fail results, remaining risks, and the explicit go/no-go decision in `docs/superpowers/qa/inv-nity-moments-load-results.md`.**
- [ ] **Step 7: Commit with `git add tests/load docs/superpowers/qa docs/operations/event-day-runbook.md && git commit -m "test: validate event-scale load and readiness"`.**

## Plan self-review

### Spec coverage

- Goal/scope and non-goals: Tasks 1, 5, 6, and 11.
- Cloudways + Supabase + R2 + Cloudflare topology: Tasks 1, 2, 4, and 10.
- Complete user journey and visual system: Tasks 5 and 6.
- Data model and API contract: Tasks 2–4 and 6–8.
- Camera/upload reliability: Tasks 4, 5, 9, and 11.
- Lima Circle sponsor bridge: Tasks 5 and 8.
- Admin/operations/security/analytics: Tasks 7, 8, and 10.
- Testing/load testing/deployment/post-event: Tasks 9–11.

### Placeholder scan

The plan contains no unresolved placeholders, deferred implementation steps, or vague validation instructions. Required interfaces, paths, commands, and test outcomes are specified in each task.

### Type and boundary consistency

`MomentRecord`, `PublicMoment`, `CursorPage`, `AuthenticatedParticipant`, `AdminUser`, `SystemHealthSnapshot`, `AnalyticsEvent`, and `DerivativeKeys` are introduced at the boundary where they are first needed and are shared through `lib/db/types.ts` or their domain module. R2 is accessed only through `lib/media`; database access is isolated in repositories; route handlers remain authorization and serialization boundaries.
