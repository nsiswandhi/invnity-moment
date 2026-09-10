# Task 2 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Task 2 quota, reservation, metadata, uniqueness, and integration-test review findings without changing the public repository API.

**Architecture:** Keep quota authority in PostgreSQL RPC functions. Make the reservation row the single consumable capability for completion, using the participant row lock already held by reservation creation. Repository code remains a typed RPC adapter; unit tests characterize consumer-visible contracts, while the integration suite exercises the actual migration/RPC path when local Supabase is available.

**Tech Stack:** PostgreSQL/Supabase migrations, TypeScript, Vitest, Zod.

**Spec:** `docs/superpowers/specs/2026-09-09-inv-nity-moments-design.md`

## Global Constraints

- Work directly in the shared workspace; do not alter `sources/`, dispatch subagents, or retry Git commits.
- Active moment quota is ten; deleted and rejected moments do not consume quota.
- A RESERVED slot expires or is explicitly cancelled; no expired slot may be completed.
- Completion is idempotent and published object metadata is immutable after the first completion.
- Participant emails are normalized to lowercase and unique per event.

---

### Task 1: Reservation ownership, expiry, deletion, and replay scope

**Files:**
- Modify: `tests/unit/quota.test.ts`
- Modify: `supabase/migrations/0001_initial_schema.sql`

**Interfaces:**
- Consumes: `reserve_moment_slot(participant_id, event_id, reservation_id, expires_at)`.
- Produces: reservation rows uniquely identified by `(participant_id, event_id, id)` and only active, unexpired rows eligible to complete.

- [ ] **Step 1: Write failing tests** for a reused post-expiry slot rejecting the old completion, deleting a reserved slot releasing quota and rejecting completion, and identical reservation IDs for two participants creating distinct reservations.
- [ ] **Step 2: Run the focused unit test** and confirm each new behavior fails because the in-memory model permits it.
- [ ] **Step 3: Implement the minimal in-memory contract changes**: replay lookup includes participant/event; deletion cancels active reservation; completion requires an unexpired reservation.
- [ ] **Step 4: Run focused unit tests** and confirm they pass.
- [ ] **Step 5: Update SQL**: scope reservation identity by participant/event, lock and transition the active reservation during completion, expire/cancel reservations on delete, and exclude non-active/deleted rows from quota.

### Task 2: Completion metadata and personal-list visibility

**Files:**
- Modify: `tests/unit/quota.test.ts`
- Modify: `supabase/migrations/0001_initial_schema.sql`

**Interfaces:**
- Consumes: `complete_moment(moment_id, metadata)` where metadata follows `MomentObjectMetadata`.
- Produces: `MomentRecord` only after complete required object metadata has been validated and persisted.

- [ ] **Step 1: Write failing tests** for replay preserving initial metadata, invalid completion metadata rejecting, and soft-deleted rows absent from owned lists.
- [ ] **Step 2: Run focused unit tests** and confirm the new assertions fail against current behavior.
- [ ] **Step 3: Implement the minimal in-memory contract changes** to validate required metadata, write it on the initial completion only, and hide deleted rows from lists.
- [ ] **Step 4: Run focused unit tests** and confirm they pass.
- [ ] **Step 5: Update SQL**: validate category, keys, image MIME type, positive finite size/dimensions; require populated fields before PUBLISHED; avoid updates on replay; filter deleted rows in the owned-list query.

### Task 3: Database integration coverage and verification

**Files:**
- Modify: `tests/integration/quota.integration.test.ts`
- Modify: `.superpowers/sdd/2026-09-09-inv-nity-moments-implementation/task-2-report.md`

**Interfaces:**
- Consumes: `SUPABASE_URL` and a local migrated Supabase/PostgreSQL service.
- Produces: a migration/RPC integration test that invokes concurrent reservations through independent database connections, or an explicit skip when that local service is unavailable.

- [ ] **Step 1: Write integration test setup** that reads the migration and invokes the RPC through the configured Supabase URL.
- [ ] **Step 2: Run it**; confirm clear skip only when no local service is configured, otherwise run migration/RPC concurrency assertions.
- [ ] **Step 3: Run typecheck, lint, targeted unit/integration tests**, capture exact outcomes, and append the fix report including environmental blockers.
