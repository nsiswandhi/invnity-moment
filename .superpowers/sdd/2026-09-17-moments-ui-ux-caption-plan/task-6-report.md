# Task 6 report — moment detail caption and final verification

## Implemented

- Replaced the public moment detail's hard-coded `Momen kita.` title with the persisted caption as body text.
- Added the bold identity line `Momen by {{Nama}} - {{Angkatan}}` between caption and publication date.
- Preserved the existing like and signed-download actions unchanged.
- Added Playwright coverage for:
  - entering a caption, showing its character counter, and submitting that exact caption with the completion request;
  - caption, identity, and Indonesian publication date in the moment detail view while retaining like and download assertions.

## Verification results

| Command | Result |
| --- | --- |
| `npm run test:unit` | Passed: 53 files passed, 1 skipped; 298 tests passed, 1 skipped. The known numeric batch fixture expectation did not regress. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed with 0 errors and 5 existing `@next/next/no-img-element` warnings in `app/(public)/moments/page.tsx`, `components/brand/SponsorBridge.tsx`, and `components/brand/Welcome.tsx`. |
| `npm run build` | Passed. Next.js compiled successfully and completed type validation. |
| `npm run test:e2e` | The requested full command was run, but this execution environment ended its output stream after the runner started and Next logged `ECONNRESET`/`aborted` messages, without a final Playwright summary or failure artifact. |
| `npx playwright test --workers=1 --reporter=list` | The serial full-suite retry reached 6 passing accessibility/navigation tests before the same environment stream limitation stopped the final summary. |
| `npx playwright test tests/e2e/accessibility.spec.ts --workers=1 --reporter=list` | Passed: 6 tests (mobile widths 320/375/390/412, desktop 1280, and keyboard navigation). |
| `npx playwright test tests/e2e/admin-operations.spec.ts --workers=1 --reporter=list` | Passed: 1 test. |
| `npx playwright test tests/e2e/participant-capture.spec.ts --workers=1 --reporter=list` | Passed: 1 test, including caption entry and exact completion payload. |
| `npx playwright test tests/e2e/public-album.spec.ts --workers=1 --reporter=list` | Passed: 1 test, including detail caption, identity, date, like, and download behavior. |

## Environment limitations

- The linked worktree causes Next.js to warn that it inferred the parent project as the workspace root because both directories contain `package-lock.json`. This warning did not fail build or tests.
- The initial parallel and serial full Playwright invocations produced intermittent Next development-server `ECONNRESET`/`aborted` logs and the command-output bridge ended before Playwright printed its final summary. There were no failed-test artifacts and no server left listening on port 3000 afterward.
- To obtain complete evidence, every E2E spec was rerun serially and passed individually: 9 of 9 tests total.

## Follow-up review fix

- Replaced the text-based InVnity mark in `components/album/AlbumHeader.tsx` with the supplied local `/brand/invnity-logo.png` asset and meaningful `alt="InVnity"` text.
- Added a focused branding contract assertion for the album header. It was first run red against the text mark, then passed after the image change: 4/4 focused branding tests passed.
- `npm run typecheck` passed after the follow-up.
- The detail identity remains exactly `Momen by {{Nama}} - {{Angkatan}}`, using a hyphen rather than an em dash.
- Migration idempotence was reviewed but no migration was changed: migration `0015` is historical schema rollout work and should not be retroactively rewritten; migration `0016` already uses `create or replace` for its public projections. This UI-only correction needs no schema change.
