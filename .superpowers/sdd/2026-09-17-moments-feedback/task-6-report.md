# Task 6: Align mobile sponsor badge contract

## Change

Changed only the `.sponsor-badge` width inside `@media (max-width: 619px)` from `9.5rem` to `6rem`. The desktop `9.5rem` declaration and existing non-image badge behavior are unchanged.

## TDD evidence

- Red: `npm run test:unit -- tests/unit/event-navigation-contract.test.ts` failed at `tests/unit/event-navigation-contract.test.ts:28`, where the mobile rule did not contain `width: 6rem`.
- Green: the same focused command passed with 5/5 tests after the one-value CSS change.

## Additional verification

- `npm run typecheck` passed.
- `npm run lint` passed with 0 errors and 3 existing `@next/next/no-img-element` warnings in `EventHeader.tsx`, `SponsorBridge.tsx`, and `Welcome.tsx`.
