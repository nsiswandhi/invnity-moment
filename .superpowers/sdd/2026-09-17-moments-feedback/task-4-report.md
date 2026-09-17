# Task 4 report — Keep the Google Play sponsor badge visible

## Outcome

The Google Play sponsor badge no longer renders as an `<img>`. It is now a dedicated `.sponsor-badge` element that displays the supplied `public/brand/google-play-badge.webp` asset with a CSS background. This prevents an externally injected runtime rule that hides images with `display: none !important` from removing the badge after desktop hydration.

## Root cause

`SponsorBridge` rendered the Google Play asset as an `<img>`. Repository CSS already set that image to `display: block`, and the reported browser behavior showed the badge initially then disappearing only after runtime changes. The supplied evidence identified a later external/generated selector applying `display: none !important` to the image, so local CSS specificity would not be a durable solution. The Lima Circle logo remains an image because it is not the affected badge.

## Implementation

- Replaced the Google Play `<img>` in `components/brand/SponsorBridge.tsx` with a `.sponsor-badge` span.
- Added a background image sourced from `/brand/google-play-badge.webp`, using the asset's 960:285 aspect ratio, `contain` sizing, and the previous 9.5rem desktop / 6rem mobile dimensions.
- Preserved the optional `playUrl` behavior, outbound target/rel attributes, and `sponsor_cta_click` tracking handler.
- Kept the linked badge accessible by labelling the link and hiding its decorative child from assistive technology. Without `playUrl`, the badge remains exposed as an image-role element with the same accessible label.
- Left sponsor copy, logo, grid layout, and unrelated behavior unchanged.

## TDD evidence

1. Added `tests/unit/sponsor-bridge.test.tsx` before production changes.
2. Confirmed RED with the existing component: `SponsorBridge` rendered `<img src="/brand/google-play-badge.webp">` and did not render `class="sponsor-badge"`.
3. Implemented the smallest component/CSS change.
4. Confirmed GREEN: the focused regression test passes and verifies the non-image badge, accessible label, preserved link URL, absence of a Google Play image element, and the local background asset.

## Verification

- `npm run test:unit -- tests/unit/sponsor-bridge.test.tsx tests/unit/branding-contract.test.ts tests/unit/event-navigation-contract.test.ts`
  - Passed: 3 files, 10 tests.
- `npm run typecheck`
  - Passed.
- `npm run lint`
  - Passed with 0 errors. It retains three existing `@next/next/no-img-element` warnings for the Lima Circle/EventHeader/Welcome logo images; none applies to the fixed Google Play badge.
