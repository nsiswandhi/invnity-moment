# InVnity Moments QA results

Date: 2026-09-13

## Automated checks

- Accessibility and responsive viewport smoke tests: run with `npm run test:e2e -- tests/e2e/accessibility.spec.ts`.
- Covered widths: 320, 375, 390, 412, and 1280 px.
- Assertions: main landmark, heading, keyboard focus, keyboard navigation, form label, and horizontal overflow.

## Physical devices

No physical iPhone or Android device was available in this environment. Camera permission, front/back switching, interrupted uploads, reload recovery, and Samsung Internet behavior are therefore **pending manual acceptance**.
