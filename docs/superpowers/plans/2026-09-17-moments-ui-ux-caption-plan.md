# InVnity Moments UI/UX and Caption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted optional photo captions and deliver the approved branding, navigation, responsive album, session-state, and photo-detail improvements.

**Architecture:** Keep the existing Next.js route/repository boundaries. Add caption normalization at the upload-completion boundary, expose it through the existing moment serializers/RPCs, and keep UI changes isolated to existing page/components plus shared CSS. Add supplied brand assets under `public/brand` and use web-relative paths.

**Tech Stack:** Next.js 15, React 19, TypeScript, PostgreSQL/Supabase migrations, Vitest, Playwright, CSS in `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-09-17-moments-ui-ux-caption-design.md`

## Global Constraints

- Captions are optional and blank values persist as `Momen berharga bersama teman-teman reuni.`.
- Caption maximum is 200 characters at both API and database boundaries.
- `All` is the public-album label for the unfiltered category.
- Desktop/tablet category layout is two rows by five columns with `All` spanning two rows; mobile uses a full-width `All` row followed by four columns.
- The camera `Ganti kamera` text must be green, not white.
- Do not reference external `E:` or `D:` paths at runtime.
- Preserve existing authorization, moderation, like, download, recovery, and upload behavior.

---

### Task 1: Add caption schema, validation, and upload API contract

**Files:**
- Create: `supabase/migrations/0015_add_moment_caption.sql`
- Modify: `app/api/v1/moments/[momentId]/complete/route.ts`
- Modify: `lib/media/upload-service.ts`
- Modify: `lib/db/types.ts`
- Test: `tests/unit/moment-caption-contract.test.ts`

**Interfaces:**
- The completion request accepts `{ category: MomentCategory, caption?: string }`.
- The normalized caption is a string no longer than 200 characters.
- `completeUpload` receives `caption` and includes it in the metadata passed to the database completion RPC.

- [ ] **Step 1: Write the failing contract tests**

Assert that the completion schema contains an optional caption, the migration adds/backfills/checks `caption`, and the shared moment metadata includes caption.

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `npm run test:unit -- tests/unit/moment-caption-contract.test.ts`

Expected: FAIL because the new migration, schema field, and request property do not exist.

- [ ] **Step 3: Add the migration**

Create `0015_add_moment_caption.sql` with an idempotent `alter table moments add column caption text`, backfill null/blank rows with the standard caption, add a check for `length(caption) <= 200`, and update the relevant completion/list RPC JSON projections to return `caption`.

- [ ] **Step 4: Wire request validation and upload metadata**

Use `z.string().max(200).optional().default('Momen berharga bersama teman-teman reuni.')`, normalize whitespace-only input to the default, extend `MomentObjectMetadata`, and pass `caption` through `completeUpload` into the existing completion RPC metadata.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm run test:unit -- tests/unit/moment-caption-contract.test.ts` and `npm run typecheck`.

Expected: PASS.

- [ ] **Step 6: Commit**

```text
git add supabase/migrations/0015_add_moment_caption.sql app/api/v1/moments/[momentId]/complete/route.ts lib/media/upload-service.ts lib/db/types.ts tests/unit/moment-caption-contract.test.ts
git commit -m "feat: add persisted moment captions"
```

### Task 2: Install local brand assets and sponsor footer

**Files:**
- Create: `public/brand/invnity-logo.png`
- Create: `public/brand/lima-circle-logo.png`
- Create: `public/brand/google-play-badge.webp`
- Modify: `components/brand/SponsorBridge.tsx`
- Modify: `components/brand/Welcome.tsx`
- Modify: `app/globals.css`
- Test: `tests/unit/branding-contract.test.ts`

**Interfaces:**
- `SponsorBridge` renders the sponsor copy, Lima Circle logo, and Google Play badge.
- Public logo usage references `/brand/invnity-logo.png`.

- [ ] **Step 1: Add failing branding contract tests**

Assert that the sponsor copy contains `Lima Circle`, `Rumah Digital Alumni SMAN 5 Bandung`, and `Yuk, unduh aplikasinya!`, and that components reference local `/brand/` assets.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm run test:unit -- tests/unit/branding-contract.test.ts`

- [ ] **Step 3: Copy the supplied image assets into `public/brand`**

Use the supplied InVnity logo, Lima Circle logo, and Google Play badge as local web assets. Preserve aspect ratios and use `alt` text.

- [ ] **Step 4: Implement footer and logo styling**

Make the sponsor bridge yellow, responsive, horizontally arranged on wide screens, stacked on narrow screens, and visually close to the supplied reference.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm run test:unit -- tests/unit/branding-contract.test.ts` and `npm run typecheck`.

- [ ] **Step 6: Commit**

```text
git add public/brand components/brand app/globals.css tests/unit/branding-contract.test.ts
git commit -m "feat: apply InVnity and Lima Circle branding"
```

### Task 3: Update registration, expired-session, and camera UI

**Files:**
- Modify: `app/(public)/register/page.tsx`
- Modify: `app/(public)/moments/page.tsx`
- Modify: `components/camera/CameraCapture.tsx`
- Modify: `app/globals.css`
- Test: `tests/unit/session-ui-contract.test.ts`

**Interfaces:**
- Expired-session primary link text is `Buat Sesi Baru via Email`.
- Secondary link text is `Belum Daftar? Daftar di sini`.

- [ ] **Step 1: Add failing UI contract assertions**

Assert the revised Indonesian copy, registration spacing class, and green camera-switch text class.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm run test:unit -- tests/unit/session-ui-contract.test.ts`

- [ ] **Step 3: Implement the copy and spacing changes**

Change the expired-session actions and add a dedicated margin/spacing rule between the registration button and note.

- [ ] **Step 4: Fix camera switch contrast**

Apply a class to the `Ganti kamera` control and set its text color to `var(--green)` without changing the button background.

- [ ] **Step 5: Run tests and typecheck**

Run the targeted test and `npm run typecheck`.

- [ ] **Step 6: Commit**

```text
git add app/(public)/register/page.tsx app/(public)/moments/page.tsx components/camera/CameraCapture.tsx app/globals.css tests/unit/session-ui-contract.test.ts
git commit -m "fix: clarify participant session actions"
```

### Task 4: Implement personal-moments caption form, hero, and navigation

**Files:**
- Modify: `app/(public)/moments/page.tsx`
- Modify: `components/moments/MyMomentsGrid.tsx`
- Modify: `components/moments/CategoryCards.tsx`
- Modify: `lib/moments/personal-moments.ts`
- Modify: `app/globals.css`
- Test: `tests/unit/personal-moments-ui-contract.test.ts`

**Interfaces:**
- `saveUpload` sends `{ category, caption }` to the completion endpoint.
- The personal page header links to `/moments` and `/album`; bottom navigation is absent.

- [ ] **Step 1: Add failing caption/navigation contract tests**

Assert the new heading, textarea label, `maxlength="200"`, character counter, header links, absent recovery link, and absent bottom navigation.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm run test:unit -- tests/unit/personal-moments-ui-contract.test.ts`

- [ ] **Step 3: Add caption state and upload payload**

Track caption state only on the category screen, trim it before submission, use the default text when blank, and send it with category to the completion route. Reset caption after save/retake.

- [ ] **Step 4: Update the personal hero and header**

Use the local logo image, apply `bgheader.jpg` as a local background asset, add a readable overlay, replace header links, and remove the bottom nav.

- [ ] **Step 5: Render caption in personal moment tiles**

Show the stored caption below each image while keeping category editing and delete actions intact.

- [ ] **Step 6: Run tests and typecheck**

Run targeted tests and `npm run typecheck`.

- [ ] **Step 7: Commit**

```text
git add app/(public)/moments/page.tsx components/moments lib/moments/personal-moments.ts app/globals.css tests/unit/personal-moments-ui-contract.test.ts
git commit -m "feat: add captions to personal moments"
```

### Task 5: Extend public album data and responsive category layout

**Files:**
- Modify: `components/album/CategoryTabs.tsx`
- Modify: `components/album/PublicAlbum.tsx`
- Modify: `components/album/MomentCard.tsx`
- Modify: `lib/db/repositories/public-album.ts`
- Modify: `lib/db/types.ts`
- Modify: `app/globals.css`
- Test: `tests/unit/public-album-contract.test.ts`

**Interfaces:**
- Public moment records include `caption`, `participantName`, and `participantBatch`.
- `CategoryTabs` keeps `null` for All and renders every category without a scroll container.

- [ ] **Step 1: Add failing album contract tests**

Assert `All`, participant fields, caption output, and the desktop/mobile category layout classes.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm run test:unit -- tests/unit/public-album-contract.test.ts`

- [ ] **Step 3: Extend the public album RPC and serializer**

Update the migration/RPC projection that lists published moments to join participants and return name, batch, and caption; map those values in `public-album.ts`.

- [ ] **Step 4: Implement the category grid**

Render All plus eight categories in a CSS grid with `All` spanning two rows on desktop/tablet and spanning the full first row on mobile. Remove overflow scrolling.

- [ ] **Step 5: Implement card content hierarchy**

Overlay category badge on the image, show caption, bold `Momen by Nama — Angkatan`, date, and right-aligned like control.

- [ ] **Step 6: Run tests and typecheck**

Run targeted tests and `npm run typecheck`.

- [ ] **Step 7: Commit**

```text
git add components/album lib/db app/globals.css tests/unit/public-album-contract.test.ts supabase/migrations
git commit -m "feat: improve public album metadata and filters"
```

### Task 6: Update moment detail and complete verification

**Files:**
- Modify: `components/album/MomentDetail.tsx`
- Modify: `app/(public)/album/[momentId]/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/e2e/participant-capture.spec.ts`
- Modify: `tests/e2e/public-album.spec.ts`

**Interfaces:**
- Detail view renders caption as normal text, then bold participant identity, then date.

- [ ] **Step 1: Add failing detail/E2E assertions**

Assert caption, participant identity, category badge placement, and the new caption input flow.

- [ ] **Step 2: Run targeted tests and verify failure**

Run: `npm run test:unit -- tests/unit/public-album-contract.test.ts` and `npm run test:e2e -- tests/e2e/participant-capture.spec.ts tests/e2e/public-album.spec.ts`.

- [ ] **Step 3: Update detail layout**

Replace the hard-coded title with caption, add `Momen by {participantName} — {participantBatch}`, retain date/actions, and preserve download/like behavior.

- [ ] **Step 4: Run the full verification suite**

Run:

```text
npm run test:unit
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Expected: all commands pass.

- [ ] **Step 5: Manually inspect responsive flows**

Check registration, expired session, camera switch, caption entry, personal moments, album at desktop/tablet/mobile widths, detail, like, and download.

- [ ] **Step 6: Commit final integration**

```text
git add .
git commit -m "feat: complete moments UI UX refresh"
```

