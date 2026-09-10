# InVnity Moments — Master Technical Specification

**Status:** Design specification for review
**Event target:** Reuni Akbar IA 5 Bandung, 10 October 2026
**Product promise:** *Satu Reuni. Ribuan Cerita.*

## 1. Goal and scope

InVnity Moments is a mobile-first web experience entered through QR codes at the event. A participant registers once, captures up to ten active moments with the device camera, assigns a category, uploads the image, and sees it in a personal album and the public event album. Other visitors can view, like, and download published photos.

The product is intentionally an event memory layer, not a permanent social network. The experience must be fast enough for people standing, walking, or using a congested mobile network, while remaining simple for the committee to operate during the event.

### Goals

- Reach a first photo in approximately 30–45 seconds from QR scan for a first-time participant.
- Support approximately 500 registered participants and a hard ceiling of 5,000 active moments.
- Enforce a server-authoritative limit of 10 active moments per participant; deleting a moment returns one slot.
- Publish acceptable photos quickly so the album feels alive during the event.
- Keep original/display images outside the application server and make gallery browsing lightweight.
- Give the committee a small, understandable operating surface: health, activity, participants, moderation, quota, and sponsor clicks.
- Preserve access to the event album after the event without turning the product into an ongoing alumni platform.

### In scope for the event MVP

QR entry, welcome, registration, browser camera, capture/retake, client-side compression, category selection, direct upload, retry queue, personal moments, delete/re-categorize, public album, category browsing, likes, downloads, email-based access recovery, reactive moderation, admin dashboard, health monitoring, event analytics, and Lima Circle sponsor bridge.

## 2. Architecture

### 2.1 Chosen topology

```text
Participant browser
        │ HTTPS
        ▼
Cloudways — web application and lightweight API
        │                         │
        │ metadata/session        │ signed upload/download authorization
        ▼                         ▼
Supabase PostgreSQL          Cloudflare R2
                              originals + display + thumbnails
                                      │
                                      ▼
                              Cloudflare CDN/cache
```

Cloudways is the public application host and API boundary. Supabase is the managed PostgreSQL system of record. R2 stores photo binaries; the bucket is private and is accessed through short-lived signed URLs or an application/CDN delivery path. Cloudflare provides DNS, TLS, edge protection, and caching. No photo binary is routed through Cloudways during a normal upload.

The application is a mobile-first web app/PWA-capable site. Installation as an app is optional and is not part of the user promise. There is no native iOS or Android application for this event.

### 2.2 Responsibility boundaries

| Area | Responsibility |
|---|---|
| Browser | Camera permission, capture, resize/compress, local pending queue, upload progress, retry UX |
| Cloudways | HTML/app delivery, session endpoints, quota transaction, upload authorization, metadata API, download authorization, admin UI/API, rate limiting, operational health aggregation |
| Supabase | Participants, sessions, moments, likes, events, audit records, analytics event records, transactional constraints |
| R2 | Private image objects and derivatives |
| Cloudflare | DNS/TLS, edge caching for safe public derivatives, basic WAF/rate controls where configured |

Image processing is asynchronous and bounded. It may be colocated with the lightweight Cloudways runtime only if the load gate passes with acceptable memory and latency; otherwise a separate worker/queue is required before go-live. In either case, image processing must never block the upload request or consume unbounded Cloudways resources.

### 2.3 Runtime states

An uploaded moment follows:

```text
RESERVED → UPLOADING → PROCESSING → PUBLISHED
                              └──────→ HIDDEN / REJECTED
```

`RESERVED` is short-lived and is released by expiry or explicit cancellation. `PUBLISHED` is immediately visible after basic validation and successful derivative availability. `HIDDEN` is removed from the public album but retained for admin review and audit. `REJECTED` is used when validation or policy checks fail. A failed upload must never silently consume a permanent slot.

## 3. Complete user journey

### 3.1 Entry and registration

1. A participant scans a QR placed at entrance, registration, stage, bazaar, community areas, photobooth, exit, table tents, or screens.
2. The landing page opens with the InVnity Moments promise and the primary CTA `MULAI ABADIKAN MOMEN`.
3. The first-time participant enters name, batch/angkatan, and email on one screen. No password, OTP, activation, or email verification is required during first use.
4. The server creates a participant record and a secure browser session. The interface uses event language such as “Abadikan momenmu”, not “create an account”.
5. Returning visitors using the same browser are recognized automatically after scanning the same QR. They go to the moments home without repeating registration.
6. If the browser/device session is gone, `Sudah pernah daftar?` accepts the email and sends a one-time, short-lived recovery link. Email is a lookup input, never a credential.

### 3.2 Capture and save

1. The home screen shows `MOMENMU 0 / 10` and `+ AMBIL MOMEN`.
2. The browser requests camera permission only when the participant chooses to capture.
3. Camera view is intentionally familiar and minimal: capture, front/back switch, active quota counter, and close. No camera filters, face effects, or forced overlays are part of the MVP.
4. Capture creates a local pending image. Retake discards it without consuming quota.
5. Preview offers `ULANGI` and `SIMPAN`.
6. Save opens large tappable category cards: Reuni, Panggung, Festival, Bazaar, Komunitas, Zero Waste, Nostalgia, and Momen Kita.
7. The client resizes/compresses toward a maximum 2048 px long edge and approximately 1–2 MB before upload. The client retains the pending image until the server confirms completion.
8. The API reserves a slot transactionally, returns a short-lived R2 upload authorization, and the browser uploads directly to R2.
9. Completion changes the moment to processing/published. The user sees progress, success, the new count, and `AMBIL MOMEN LAGI` / `LIHAT MOMEN SAYA`.
10. If the network fails, the image remains in the pending queue with `COBA LAGI`; retry is explicit or resumes when connectivity returns. The product does not promise full offline operation.

### 3.3 Personal album

`MOMEN SAYA` shows the participant name, batch, count, pending uploads, and a grid of their moments. A moment detail allows category change and delete. Delete requires confirmation and explains that one slot becomes available again. Visual photo editing, crop, filters, comments, and sharing controls are out of scope.

### 3.4 Public event album

The second primary destination is `ALBUM REUNI`. It displays the event title, date, total published moments, an all-photos feed, and the eight stable category views. Results use cursor pagination/infinite scroll, with a default page size of 30. Gallery tiles use thumbnails; detail uses a display derivative. Each detail has only like and download actions. Comments are not implemented.

### 3.5 Post-event lifecycle

The same QR and URL remain valid. The landing state becomes `REUNION MEMORIES — Reuni Akbar IA 5 Bandung — 10.10.2026`, with a direct album CTA. Existing browser sessions continue to work; recovery remains available. The album is archived and read-mostly after the event while admin access and retention policy govern future cleanup.

## 4. Data model

All timestamps are UTC in storage and rendered in Asia/Jakarta. Public identifiers are opaque UUIDs or non-sequential IDs; email is never exposed as a public identifier.

### 4.1 Core tables

#### `events`

`id`, `slug`, `name`, `event_date`, `status` (`pre_event`, `live`, `archived`, `maintenance`), `max_participants`, `max_active_moments_per_participant`, `sponsor_cta_url`, `created_at`, `updated_at`.

#### `participants`

`id`, `event_id`, `name`, `batch`, normalized `email`, `created_at`, `last_seen_at`, `consent_version`, `consented_at`, `status`.

Unique identity is scoped to the event by normalized email, subject to the recovery/security trade-off accepted for this event. Admin views may show email; public responses must not.

#### `access_sessions`

`id`, `participant_id`, hashed `session_token`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at`, `user_agent_hash`, `ip_hash`.

Session tokens are random, rotated on recovery, stored only as hashes server-side, and delivered in Secure, HttpOnly, SameSite cookies.

#### `moments`

`id`, `event_id`, `participant_id`, `category`, `status`, `r2_original_key`, `r2_display_key`, `r2_thumbnail_key`, `upload_token_id`, `mime_type`, `byte_size`, `width`, `height`, `created_at`, `published_at`, `deleted_at`, `hidden_at`, `hidden_reason`, `processing_error`.

The active quota query is the source of truth: moments for the participant where `deleted_at IS NULL` and status is not `REJECTED`. A unique/transactional reservation mechanism prevents concurrent requests from exceeding ten.

#### `likes`

`id`, `moment_id`, `anonymous_user_key_hash`, `created_at`, `revoked_at`.

There is a unique active constraint on `(moment_id, anonymous_user_key_hash)`. The key is derived from a privacy-conscious first-party cookie plus server-side throttling; it is not a user account.

#### `upload_reservations`

`id`, `participant_id`, `moment_id`, `expires_at`, `status`, `created_at`, `completed_at`.

Expired reservations are reclaimed and do not count as active moments.

#### `admin_users`, `moderation_actions`, `analytics_events`, and `system_health_snapshots`

These provide separate admin authentication, immutable moderation/audit history, product funnel events, and periodic component health observations. Analytics payloads exclude raw email and unnecessary personal data.

### 4.2 Image derivatives

For each accepted upload, produce:

- original-ish: the validated, client-compressed source retained for download where policy permits;
- display: a bounded display-resolution derivative;
- thumbnail: approximately 400 px long edge for gallery tiles.

Exact format may be JPEG/WebP based on device and processing results, but the public API exposes stable media metadata rather than storage implementation details.

## 5. API contract

All API responses are JSON, use HTTPS, include a request ID, and return a stable error shape:

```json
{
  "error": { "code": "QUOTA_EXCEEDED", "message": "Tidak ada slot momen tersisa." },
  "request_id": "opaque-request-id"
}
```

### 5.1 Participant/session endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/events/{event}/participants` | Create or resume event identity from name, batch, email; sets session cookie |
| `GET` | `/api/v1/me` | Return current participant summary and active quota |
| `POST` | `/api/v1/access-recovery` | Request a short-lived recovery email; response is intentionally non-enumerating |
| `POST` | `/api/v1/access-recovery/consume` | Consume one-time token and rotate session |
| `POST` | `/api/v1/session/revoke` | Revoke current session |

Registration validates required fields, normalizes email, applies rate limits, records consent version, and never returns another participant's record.

### 5.2 Moment endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/moments/reserve` | Transactionally reserve one active slot and return upload authorization |
| `POST` | `/api/v1/moments/{id}/complete` | Confirm object exists, enqueue/process derivatives, and publish when valid |
| `GET` | `/api/v1/me/moments` | Return participant-owned moments and upload states |
| `PATCH` | `/api/v1/me/moments/{id}` | Change category for an owned moment |
| `DELETE` | `/api/v1/me/moments/{id}` | Soft-delete owned moment and release slot |
| `GET` | `/api/v1/moments` | Public cursor-paginated album; accepts category and cursor |
| `GET` | `/api/v1/moments/{id}` | Public detail for a published moment |
| `POST` | `/api/v1/moments/{id}/like` | Idempotently add like |
| `DELETE` | `/api/v1/moments/{id}/like` | Remove current anonymous like |
| `POST` | `/api/v1/moments/{id}/download` | Authorize a short-lived display/original download URL |

`reserve` rejects when the participant has ten active moments, when the event is not accepting uploads, or when an unexpired reservation already exceeds the concurrency policy. `complete` is idempotent for a moment ID. Public list endpoints return only `PUBLISHED` moments and safe derivative URLs.

### 5.3 Admin endpoints

Admin APIs are on a separate authenticated route group and are never public. They cover dashboard summary, participant search/filter, recent moments, hidden moments, hide/unhide with reason, maintenance/event mode, health, storage usage, analytics aggregates, and sponsor CTA counts. Admin actions are audited.

### 5.4 Operational response codes

`400` invalid input, `401` missing/expired session, `403` forbidden, `404` unavailable resource, `409` quota/reservation conflict, `413` file too large, `415` unsupported media, `422` failed image validation, `429` rate limited, `500/502/503` recoverable service/storage failure. User copy must be friendly and actionable; raw stack traces never reach participants or operators.

## 6. Camera and upload reliability

The camera uses the browser media API over HTTPS and requests the rear camera by default, with a visible front/back switch. If permission is denied, the screen explains how to enable it and directs the participant to retry in a supported browser. A generic file-upload fallback is not part of the event MVP. The tested baseline is iPhone Safari/Chrome, Android Chrome, and Samsung Internet where relevant.

Reliability rules:

- capture is local before upload;
- client compression bounds payload size;
- upload state is explicit: ready, uploading, retrying, saved, failed;
- pending images survive transient navigation using a browser-managed local queue, with a bounded retention period and clear discard action;
- retries use fresh signed URLs when the previous authorization expires;
- completion is idempotent and reconciles object existence with database state;
- orphaned R2 objects and expired reservations are cleaned by scheduled maintenance;
- direct-to-R2 upload bypasses application-server bandwidth;
- no claim of full offline capture is made until real-device testing proves it.

Engineering targets, not universal SLAs: registration under 10 seconds on a healthy connection, camera view under 3 seconds after permission, normal upload under 5–10 seconds for a compressed image, gallery first content under 3 seconds from cacheable conditions, zero silently lost captured photos, 100% server-side quota enforcement, and zero duplicate active likes.

## 7. UI/UX and visual system

The experience must feel like entering a joyful Bandung alumni festival, not an administration dashboard or generic photo gallery.

### 7.1 Creative direction

- warm cream/off-white canvas;
- InVnity Green `#0D5F3A` as anchor;
- Yellow `#F7E600` for primary CTA and moments of emphasis;
- white and dark charcoal for contrast;
- restrained tertiary accents including teal, mint, lime, aqua, and coral;
- organic rounded shapes, bold hand-drawn outlines, doodles, sparkles, bunting, leaves, cameras, and reunion/festival cues;
- whitespace and clear hierarchy around the main action;
- doodles are storytelling and navigation cues, not decoration that competes with the camera or gallery.

Typography follows the creative guideline: Bebas Neue for major headlines, Montserrat SemiBold for buttons/subheads, Montserrat Regular for body text, Montserrat Light for captions, and Bangers only for occasional expressive accents. All text remains readable at mobile sizes and meets contrast requirements.

### 7.2 Screen principles

Primary screens are Welcome, Registration, My Moments, Camera, Preview, Category, Upload/Success, Event Album, Photo Detail, and Recovery. The primary navigation is `MOMEN SAYA | ALBUM REUNI`. There is no profile page, feed complexity, follower system, comments, challenge system, or social messaging.

Primary CTA: `MULAI ABADIKAN MOMEN` / `AMBIL MOMEN`.
Secondary actions: `LIHAT MOMEN SAYA`, `ALBUM REUNI`, `COBA LAGI`, `HAPUS FOTO`, `DOWNLOAD`.

The camera screen is intentionally plain. The visual system belongs around the experience—entry, transitions, category cards, success states, and album framing—not over the participant's real-life moment.

### 7.3 Lima Circle sponsor bridge

Lima Circle is presented as a supporting community layer, not a competing primary product. The preferred placement is a compact module on Welcome and the post-event/archive state:

> **Didukung oleh Lima Circle**
> Platform digital alumni IA Lima
> **Temukan IA Lima di aplikasi Lima Circle**
> `BUKA DI GOOGLE PLAY`

The official Google Play destination supplied by the sponsor before release is stored as event configuration and used for the CTA; the product must not guess or fabricate a store URL. Android visitors may receive the direct Play CTA. On iPhone, the module must remain informative and must not imply iOS availability; a future App Store destination can be configured separately.

The sponsor module is visually subordinate to InVnity Moments and never blocks capture. Track `sponsor_module_view`, `sponsor_cta_click`, and outbound destination. Report click-through rate, not confirmed installation; the website cannot reliably claim a Play Store install without a separate attribution integration.

## 8. Admin and event-day operations

### 8.1 Operator dashboard

The landing dashboard shows participant count, total moments, published/hidden counts, live activity, upload failures, system status, storage usage, and sponsor CTA clicks. The committee should not need to understand database or storage internals.

Participant management supports search by name, batch, or email, plus filters for moment count and registration time. The MVP does not provide arbitrary participant data editing.

Moment moderation is grid-first and reactive. Operators can inspect a photo, see category/participant/batch/time, hide it with a reason, and unhide it if appropriate. Immediate publish is the default; manual approval of every photo is explicitly rejected as incompatible with event volume.

### 8.2 Health and emergency controls

Health cards cover application, database, photo storage, upload authorization, R2/CDN delivery, and error rate. A maintenance/event-mode switch replaces broken flows with a friendly message while preserving already stored photos. Alerts are phrased operationally, such as “Upload failures meningkat”, while engineers retain technical logs and request IDs.

Event support instructions are short: close browser, scan QR again, retry camera, try another browser, or use email recovery. Operators receive a one-page escalation flow and do not troubleshoot stack traces on the floor.

## 9. Security, privacy, and abuse controls

- HTTPS everywhere; HSTS and secure cookie flags in production.
- Session cookies are Secure, HttpOnly, SameSite, opaque, expiring, revocable, and server-side hashed.
- Recovery tokens are one-time, short-lived, non-enumerating, and rate-limited.
- Email is never a public ID or direct access credential.
- R2 bucket is private; upload and download authorizations are scoped, short-lived, content-bound where supported, and never expose storage secrets.
- Validate MIME type, magic bytes, file size, dimensions, decoded image integrity, and derivative generation before publication.
- Apply rate limits to registration, recovery, upload authorization, completion, likes, downloads, and admin authentication.
- Use CSRF protection for cookie-authenticated state changes and validate origin where applicable.
- Use a restrictive content security policy, output encoding, safe image headers, and admin route separation.
- Record consent wording/version for public display. Provide a practical hide/removal path for inappropriate or privacy-sensitive content.
- Minimize analytics data, hash operational identifiers where possible, and avoid storing raw IP/user-agent beyond the retention needed for abuse control.
- Log admin actions and security events without logging session tokens or signed URLs.

The event accepts the practical trade-off that email-based recovery is not a high-assurance identity proof. That is acceptable because the product stores no sensitive account data and recovery links are protected, but the limitation must be understood by the owner.

## 10. Analytics and observability

Core product events are: QR landing, registration started/completed, camera opened, permission result, capture, retake, category selected, upload started/succeeded/failed/retried, moment published/hidden/deleted, gallery view, detail view, like/unlike, download requested/completed, recovery requested/completed, sponsor module view, and sponsor CTA click.

The funnel is:

```text
QR LANDINGS → REGISTRATIONS → CAMERA OPENED → CAPTURES → UPLOADS → PUBLISHED MOMENTS
```

Analytics answer operational questions: where users stop, which devices fail, whether upload bursts are healthy, and how the sponsor bridge performs. It is not a full BI platform and it must not promise confirmed app installs.

Engineering observability includes structured logs, request IDs, error categories (`CameraError`, `UploadTimeout`, `R2UploadError`, `DatabaseError`, `SessionError`), latency/error dashboards, storage/quota monitoring, and synthetic health checks.

## 11. Testing and load testing

### 11.1 Functional and end-to-end coverage

- QR to registration to first photo within the target flow.
- Returning browser session and email recovery after cookie loss.
- Camera permission granted, denied, revoked, front/back switch, portrait and landscape.
- Retake does not consume quota; save does.
- 0/10, 9/10, 10/10, delete at 10/10, then upload again.
- Concurrent reservations cannot exceed ten active moments.
- Interrupted upload, expired signed URL, retry, duplicate completion, and orphan cleanup.
- Category assignment, personal album, public pagination, like uniqueness, download authorization, hide/unhide, maintenance mode.
- Sponsor CTA view/click attribution without blocking the primary event CTA.

### 11.2 Device and network matrix

Test real devices: recent and older iPhones with Safari and Chrome, Android mid-range and flagship devices with Chrome, and Samsung Internet where the audience warrants it. Test 5G, 4G, slow 4G, intermittent connection, denied camera permission, backgrounding, low battery/resource pressure, and browser reload during upload.

### 11.3 Load gates before production

The release is not event-ready until it passes at least:

- 100 concurrent registrations;
- 100 concurrent upload authorizations and direct uploads;
- burst gallery browsing with hundreds of concurrent clients;
- burst like traffic with duplicate-like attempts;
- quota boundary tests at 0/10, 9/10, 10/10, delete-at-limit, and concurrent upload-at-9/10;
- recovery/session tests across QR scan, close/reopen, and token expiry;
- R2/CDN delivery and cache behavior under representative photo volume.

Record pass/fail evidence, observed bottlenecks, and the decision to scale or simplify before go-live.

## 12. Deployment and event-day operations

### 12.1 Environments and release discipline

Use separate development/staging/production configuration and storage prefixes. Secrets are injected through the hosting secret store, never committed. Production migrations are backward-compatible and rehearsed against a representative dataset. The production release is frozen before the event except for approved emergency fixes.

### 12.2 Pre-event readiness gate

One week before the event, verify Cloudways, Supabase, R2, Cloudflare DNS/TLS/CDN, domain, signed URLs, backups, admin accounts, rate limits, analytics, monitoring, recovery email, storage allowance, QR destinations, sponsor Play destination, and real-device test results. Print and test QR codes from multiple phones. Train operators on moderation, maintenance mode, and support flow.

### 12.3 Event-day runbook

Before opening: run a smoke test, verify health cards, confirm current storage/quota, confirm operator access, and capture a known test moment that is hidden afterward. During the event: watch registration/upload error rate, R2 and database health, pending queues, storage usage, and live activity; use reactive hide, not manual approval. If upload errors spike, communicate the short retry/browser flow, activate maintenance mode only when necessary, and preserve all pending/local photos. After closing: confirm processing has drained, export analytics, preserve audit logs, and switch the product to archive mode after the agreed cutoff.

## 13. Post-event lifecycle

Immediately after the event, retain the public album, participant access, recovery, likes, downloads, and moderation controls. Change copy from live-event action to memory archive. Disable new registration and new uploads at the configured cutoff while keeping existing moments readable. Keep originals/display derivatives for the agreed retention period, then delete or cold-archive according to the owner-approved retention decision. Remove expired sessions, recovery tokens, orphaned objects, and unnecessary operational logs on a scheduled basis. Sponsor reporting covers views and outbound clicks; it does not infer installs.

## 14. Constraints and non-goals

### Constraints

- Target event date is 10 October 2026.
- Approximately 500 registered participants; maximum 5,000 active moments.
- Existing Cloudways server is limited and must remain a lightweight app/API host.
- Mobile network and camera/browser behavior are the dominant reliability risks.
- Creative direction must follow the InVnity hand-drawn festival/alumni visual system.
- The committee needs operational clarity, not a complex CMS.
- The official Lima Circle Play Store link is an owner-provided release configuration, not a value to infer.

### Non-goals

- Native iOS/Android apps.
- Password accounts, OTP, mandatory email verification, or permanent social identities.
- Full offline-first application behavior.
- Camera filters, face filters, AR, or visual photo editing in the event MVP.
- Comments, messaging, followers, reactions beyond one like, social feed, or challenge/gamification system.
- Manual approval of every uploaded photo.
- A general-purpose alumni CRM, BI platform, or long-lived community network.
- Claiming confirmed Lima Circle installs from website click data alone.
- Storing public photos on Cloudways or exposing a public writable object bucket.

## 15. Decisions to preserve during implementation

1. Browser session is the primary return mechanism; email recovery is secondary.
2. Ten means ten active moments, enforced transactionally on the server.
3. Delete releases a slot; retake never consumes one.
4. Categories are stable, selected per photo, and represented as large tappable cards.
5. Public album is immediate after validation; moderation is reactive.
6. Direct browser-to-R2 upload is the normal path; Cloudways handles authorization and metadata.
7. Gallery favors thumbnails and pagination; download uses a signed display/original asset.
8. Lima Circle is a relevant supporting bridge with measurable outbound clicks, not an intrusive advertisement.
9. The product is an event memory layer that remains useful after the event but does not become a social platform.
