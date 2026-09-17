import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('event branding and navigation contract', () => {
  it('lays out the Lima Circle sponsor footer from logo to copy to a visible Google Play badge', () => {
    const sponsorBridge = read('components/brand/SponsorBridge.tsx');
    const styles = read('app/globals.css');

    expect(sponsorBridge.indexOf('className="sponsor-logo"')).toBeLessThan(sponsorBridge.indexOf('className="sponsor-copy"'));
    expect(sponsorBridge.indexOf('className="sponsor-copy"')).toBeLessThan(sponsorBridge.indexOf('className="sponsor-download"'));
    expect(sponsorBridge).toContain('Support by Lima Circle');
    expect(sponsorBridge).toContain('Rumah Digital Alumni SMAN 5 Bandung');
    expect(sponsorBridge).toContain('Yuk, unduh aplikasinya!');
    expect(sponsorBridge).toContain('src="/brand/google-play-badge.webp"');
    expect(styles).toMatch(/\.sponsor-download\s*>\s*img[^}]*display:\s*block/);
    expect(styles).not.toMatch(/\.sponsor-download\s*>\s*img[^}]*display:\s*none/);
  });

  it('keeps the sponsor logo, copy, and download badge in a compact non-overflowing row below 620px', () => {
    const styles = read('app/globals.css');

    expect(styles).toMatch(/@media\s*\(max-width:\s*619px\)\s*\{[\s\S]*?\.sponsor-bridge\s*\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*619px\)\s*\{[\s\S]*?\.sponsor-copy\s*\{[^}]*min-width:\s*0/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*619px\)\s*\{[\s\S]*?\.sponsor-download\s*>\s*img[^}]*max-width:\s*6rem/);
  });

  it('uses one shared event header with the active top navigation on both moments pages', () => {
    const eventHeader = read('components/brand/EventHeader.tsx');
    const momentsPage = read('app/(public)/moments/page.tsx');
    const albumHeader = read('components/album/AlbumHeader.tsx');

    expect(existsSync(resolve(root, 'public/brand/invnity-logo.png'))).toBe(true);
    expect(eventHeader).toContain('Reuni Akbar IA 5 Bandung');
    expect(eventHeader).toContain('10 Oktober 2026');
    expect(eventHeader).toMatch(/href="\/moments"[\s\S]*?className=\{activePage === 'moments' \? 'active' : undefined\}/);
    expect(eventHeader).toMatch(/href="\/album"[\s\S]*?className=\{activePage === 'album' \? 'active' : undefined\}/);
    expect(momentsPage).toContain('<EventHeader activePage="moments" />');
    expect(albumHeader).toContain('<EventHeader activePage="album" />');
  });

  it('preserves the dedicated event logo sizing and removes the duplicate album bottom navigation', () => {
    const styles = read('app/globals.css');
    const publicAlbum = read('components/album/PublicAlbum.tsx');

    expect(styles).toMatch(/\.brand-mark\s+img\s*\{[^}]*max-width:\s*6rem/);
    expect(styles).toMatch(/\.event-header-logo\s*\{[^}]*width:\s*19%/);
    expect(styles).toMatch(/\.event-branding\s*\{[^}]*gap:\s*15px/);
    expect(styles).toMatch(/\.header-links\s+a\.active\s*\{[^}]*text-decoration:\s*underline/);
    expect(publicAlbum).not.toContain('bottom-nav');
  });
});
