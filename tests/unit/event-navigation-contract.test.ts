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
    expect(sponsorBridge).toContain('className="sponsor-badge"');
    expect(styles).toMatch(/\.sponsor-badge\s*\{[^}]*background-image:\s*url\(['"]?\/brand\/google-play-badge\.webp['"]?\)/);
    expect(sponsorBridge).not.toContain('<img src="/brand/google-play-badge.webp"');
  });

  it('stacks and centers the sponsor logo, copy, and download badge below 620px', () => {
    const styles = read('app/globals.css');

    const mobileStyles = styles.match(/@media\s*\(max-width:\s*619px\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/)?.[1];

    expect(mobileStyles).toMatch(/\.sponsor-bridge\s*\{[^}]*grid-template-columns:\s*1fr[^}]*text-align:\s*center/);
    expect(mobileStyles).toMatch(/\.sponsor-copy\s*\{[^}]*justify-items:\s*center[^}]*text-align:\s*center/);
    expect(mobileStyles).toMatch(/\.sponsor-download\s*\{[^}]*justify-items:\s*center/);
    expect(mobileStyles).toMatch(/\.sponsor-badge\s*\{[^}]*width:\s*6rem/);
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
    expect(eventHeader).toMatch(/href="\/moments"[\s\S]*?aria-current=\{activePage === 'moments' \? 'page' : undefined\}/);
    expect(eventHeader).toMatch(/href="\/album"[\s\S]*?aria-current=\{activePage === 'album' \? 'page' : undefined\}/);
    expect(momentsPage).toContain('<EventHeader activePage="moments" />');
    expect(albumHeader).toContain('<EventHeader activePage="album" />');
  });

  it('keeps branding and navigation on separate usable rows below 620px without wrapping the title or date', () => {
    const styles = read('app/globals.css');

    expect(styles).toMatch(/@media\s*\(max-width:\s*619px\)\s*\{[\s\S]*?\.page-header\s*\{[^}]*flex-direction:\s*column/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*619px\)\s*\{[\s\S]*?\.event-header-logo\s*\{[^}]*width:\s*3\.5rem/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*619px\)\s*\{[\s\S]*?\.event-details\s+strong,\s*\.event-details\s+span\s*\{[^}]*white-space:\s*nowrap/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*619px\)\s*\{[\s\S]*?\.header-links\s*\{[^}]*justify-content:\s*space-between[^}]*width:\s*100%/);
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
