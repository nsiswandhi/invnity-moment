# Task 3 Typecheck Recovery Contract Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and, only if still failing, minimally repair the Task 3 recovery outbox worker import contract and recovery test helper plumbing, then record exact verification results.

**Architecture:** The worker claims bounded recovery outbox rows through the typed `DatabaseClient.rpc` boundary, decrypts the delivery payload immediately before `sendRecoveryEmail`, and completes or retries using claim-token-protected RPCs defined by the hardening migration. The recovery token test injects an encryption dependency through the existing optional fifth argument, preserving production defaults and validation.

**Tech Stack:** TypeScript, Vitest, ESLint, npm scripts, Supabase/PostgREST RPC contract.

**Spec:** `.superpowers/sdd/2026-09-09-inv-nity-moments-implementation/task-3-brief.md` and the approved recovery outbox contract in `supabase/migrations/0004_recovery_outbox_hardening.sql`.

## Global Constraints

- Do not edit, rename, move, or delete anything under `sources/`.
- Fix current typecheck failures only; do not weaken production validation or broaden the worker contract.
- Run `npm run typecheck`, `npm run lint`, and the complete focused Task 3 suite.
- Append the exact command status to `.superpowers/sdd/2026-09-09-inv-nity-moments-implementation/task-3-report.md`.

---

### Task 1: Verify the recovery worker and test plumbing

**Files:**
- Inspect: `lib/recovery/outbox-worker.ts`, `lib/auth/recovery.ts`, `tests/unit/recovery-outbox-worker.test.ts`, `tests/unit/recovery.test.ts`, `supabase/migrations/0004_recovery_outbox_hardening.sql`

**Interfaces:**
- Consumes: `DatabaseClient.rpc<T>`, the migration’s claim/complete/fail RPCs, and the injected payload cipher.
- Produces: a compilable `processRecoveryDeliveryOutbox` contract and a test call that supplies the optional payload cipher without changing production validation.

- [x] **Step 1: Reproduce current failures and inspect data flow**

Run `npm run typecheck` and the focused Task 3 suite; compare worker RPC parameter names and delivery payload fields with the migration and test fixtures.

- [x] **Step 2: Apply only the minimal contract/plumbing fix if a failure remains**

Keep the worker bounded by `RECOVERY_OUTBOX_MAX_ATTEMPTS`, use claim tokens for completion/failure, and retain the production default cipher and `issueRecoveryToken` validation path.

- [x] **Step 3: Verify the complete requested command set**

Run:

```text
npm run typecheck
npm run lint
npm run test:unit -- tests/unit/database-client.test.ts tests/unit/rate-limits.test.ts tests/unit/recovery.test.ts tests/unit/recovery-delivery-payload.test.ts tests/unit/recovery-request.test.ts tests/unit/recovery-outbox-worker.test.ts tests/unit/smtp-email-sender.test.ts tests/unit/session.test.ts tests/unit/migration-contract.test.ts tests/integration/auth-routes.test.ts
```

- [x] **Step 4: Append exact status**

Append the commands, exit statuses, test-file count, test count, and any environmental limitation to the Task 3 report without modifying `sources/`.
