# Task 2 implementation report — InVnity and Lima Circle branding

## Scope completed

- Added the supplied local InVnity, Lima Circle, and Google Play assets under `public/brand`.
- Replaced the text-only InVnity mark on the public welcome screen with the local InVnity logo.
- Rebuilt the sponsor bridge with the Lima Circle logo, Google Play badge, approved sponsor copy, and exact CTA phrase: `Yuk, unduh aplikasinya!`.
- Updated the shared sponsor styling to use a yellow surface, stack on narrow viewports, and use a three-column horizontal layout at 620px and wider.
- Kept the existing optional Google Play URL and click analytics behavior: when a URL is present, the badge remains the outbound tracked link.

## Changed files

- `public/brand/invnity-logo.png` — supplied InVnity logo.
- `public/brand/lima-circle-logo.png` — supplied Lima Circle logo.
- `public/brand/google-play-badge.webp` — supplied Google Play badge.
- `components/brand/Welcome.tsx` — local InVnity logo rendering and meaningful alt text.
- `components/brand/SponsorBridge.tsx` — Lima Circle sponsor content, logo, and download badge.
- `app/globals.css` — responsive yellow sponsor bridge and image sizing rules that preserve intrinsic aspect ratios.
- `tests/unit/branding-contract.test.ts` — focused asset, markup/copy, and responsive-style contract coverage.

## TDD evidence

1. Added `tests/unit/branding-contract.test.ts` before production changes.
2. Ran `npm run test:unit -- tests/unit/branding-contract.test.ts` and observed all three contract checks fail for the intended missing assets, text-only welcome mark, old sponsor content, and previous mint/non-responsive bridge.
3. Implemented the minimal asset, component, and style changes.
4. Re-ran the focused contract test successfully.

## Verification

| Command | Result |
| --- | --- |
| `npm run test:unit -- tests/unit/branding-contract.test.ts` | Passed: 1 test file, 3 tests. |
| `npm run typecheck` | Passed: `tsc --noEmit` exited 0. |
| `git diff --check` | Passed: no whitespace errors. |

## Concerns

- No functional concerns identified. The worktree emits existing Git warnings about an unreadable global ignore file and CRLF conversion on modified text files; neither affects the focused test or typecheck results.
