import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('branding contract', () => {
  it('uses the supplied local InVnity, Lima Circle, and Google Play assets', () => {
    const invnityLogo = resolve(root, 'public/brand/invnity-logo.png');
    const limaCircleLogo = resolve(root, 'public/brand/lima-circle-logo.png');
    const playBadge = resolve(root, 'public/brand/google-play-badge.webp');

    expect(existsSync(invnityLogo), invnityLogo).toBe(true);
    expect(existsSync(limaCircleLogo), limaCircleLogo).toBe(true);
    expect(existsSync(playBadge), playBadge).toBe(true);
  });

  it('renders the InVnity logo and the Lima Circle download bridge', () => {
    const welcome = read('components/brand/Welcome.tsx');
    const sponsorBridge = read('components/brand/SponsorBridge.tsx');

    expect(welcome).toContain('src="/brand/invnity-logo.png"');
    expect(welcome).toContain('alt="InVnity"');
    expect(sponsorBridge).toContain('src="/brand/lima-circle-logo.png"');
    expect(sponsorBridge).toContain('alt="Lima Circle"');
    expect(sponsorBridge).toContain('Lima Circle');
    expect(sponsorBridge).toContain('Rumah Digital Alumni SMAN 5 Bandung');
    expect(sponsorBridge).toContain('Yuk, unduh aplikasinya!');
    expect(sponsorBridge).toContain('className="sponsor-badge"');
    expect(sponsorBridge).toContain("const badgeLabel = 'Unduh Lima Circle di Google Play'");
  });

  it('renders the supplied InVnity logo in the album header', () => {
    const albumHeader = read('components/album/AlbumHeader.tsx');
    const eventHeader = read('components/brand/EventHeader.tsx');

    expect(albumHeader).toContain('<EventHeader activePage="album" />');
    expect(eventHeader).toContain('src="/brand/invnity-logo.png"');
    expect(eventHeader).toContain('alt="InVnity"');
  });

  it('keeps the sponsor bridge yellow and responsive', () => {
    const css = read('app/globals.css');

    expect(css).toMatch(/\.sponsor-bridge\s*\{[^}]*background:\s*var\(--yellow\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*620px\)\s*\{[\s\S]*?\.sponsor-bridge\s*\{[^}]*grid-template-columns:/);
  });
});
