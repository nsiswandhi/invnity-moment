import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const momentsPage = read('app/(public)/moments/page.tsx');
const momentsGrid = read('components/moments/MyMomentsGrid.tsx');
const eventHeader = read('components/brand/EventHeader.tsx');
const styles = read('app/globals.css');

const DEFAULT_CAPTION = 'Momen berharga bersama teman-teman reuni.';

describe('personal moments caption UI contract', () => {
  it('offers the approved category heading and an optional 200-character caption field with a visible counter', () => {
    expect(momentsPage).toContain('Pilih Kategori Foto.');
    expect(momentsPage).toMatch(/<textarea[\s\S]*?maxLength=\{200\}[\s\S]*?>/);
    expect(momentsPage).toMatch(/caption\.length\}\s*\/\s*200/);
  });

  it('trims the selected caption and sends the approved default when it is blank', () => {
    expect(momentsPage).toContain(DEFAULT_CAPTION);
    expect(momentsPage).toMatch(/caption\.trim\(\)\s*\|\|\s*DEFAULT_MOMENT_CAPTION/);
    expect(momentsPage).toMatch(/JSON\.stringify\(\{\s*category,\s*caption:\s*resolvedCaption\s*}\)/);
  });

  it('renders captions beneath personal moment images without removing category editing or deletion', () => {
    expect(momentsGrid).toMatch(/className="moment-caption"[^>]*>\{moment\.caption\}/);
    expect(momentsGrid).toContain('className="category-edit"');
    expect(momentsGrid).toContain('Hapus foto');
  });

  it('uses the branded personal header and hero while omitting recovery and bottom navigation', () => {
    expect(momentsPage).toContain('<EventHeader activePage="moments" />');
    expect(eventHeader).toMatch(/src="\/brand\/invnity-logo\.png"/);
    expect(eventHeader).toMatch(/href="\/moments"/);
    expect(eventHeader).toMatch(/href="\/album"/);
    expect(momentsPage).not.toContain('Akses kembali');
    expect(momentsPage).not.toContain('bottom-nav');
    expect(styles).toMatch(/\.moments-hero\s*\{[^}]*bgheader\.jpg/);
  });

  it('forwards the authoritative active-moment quota summary into the camera capture view', () => {
    expect(momentsPage).toMatch(/<CameraCapture\s+activeMoments=\{activeMoments\}\s+maxActiveMoments=\{quota\}/);
  });

  it('refreshes the authoritative quota summary after deletion instead of decrementing from the visible page', () => {
    expect(momentsPage).toMatch(/const refreshQuota = async \(\) => \{[\s\S]*?fetch\('\/api\/v1\/me'\)[\s\S]*?setActiveMoments\(payload\.data\.quota\?\.activeMoments \?\? 0\)[\s\S]*?setQuota\(payload\.data\.quota\?\.maxActiveMoments \?\? 10\)/);
    expect(momentsPage).toMatch(/await deleteOwnedMomentRequest\([\s\S]*?setPage\([\s\S]*?await refreshQuota\(\)\.catch\(\(\) => undefined\)/);
    expect(momentsPage).not.toContain('setActiveMoments((count) => Math.max(0, count - 1))');
  });
});
