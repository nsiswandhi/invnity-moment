import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const registerPage = read('app/(public)/register/page.tsx');
const momentsPage = read('app/(public)/moments/page.tsx');
const cameraCapture = read('components/camera/CameraCapture.tsx');
const styles = read('app/globals.css');

describe('participant session UI contract', () => {
  it('separates the registration note from the submit action', () => {
    expect(registerPage).toMatch(/className="form-note registration-note"/);
    expect(styles).toMatch(/\.registration-note\s*\{[^}]*margin-top:\s*1\.25rem;/);
  });

  it('offers explicit actions when the participant session has expired', () => {
    expect(momentsPage).toContain('Buat Sesi Baru via Email');
    expect(momentsPage).toContain('Belum Daftar? Daftar di sini');
  });

  it('renders the camera switch control with green text without changing its base button class', () => {
    expect(cameraCapture).toMatch(/className="secondary-button camera-switch-button"/);
    expect(styles).toMatch(/\.camera-switch-button\s*\{[^}]*color:\s*var\(--green\);/);
  });
});
