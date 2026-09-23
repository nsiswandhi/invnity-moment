import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const recoveryPage = readFileSync(resolve(process.cwd(), 'app/(public)/recovery/page.tsx'), 'utf8');

describe('recovery page token flow contract', () => {
  it('consumes an email token and redirects to the participant moments page', () => {
    expect(recoveryPage).toMatch(/\/api\/v1\/access-recovery\/consume/);
    expect(recoveryPage).toMatch(/URLSearchParams[\s\S]*\.get\(['"]token['"]\)/);
    expect(recoveryPage).toMatch(/router\.replace\(['"]\/moments['"]\)/);
  });

  it('sends the CSRF token when requesting recovery while a session cookie exists', () => {
    expect(recoveryPage).toMatch(/fetch\('\/api\/v1\/access-recovery'[\s\S]*x-csrf-token/);
  });
});
