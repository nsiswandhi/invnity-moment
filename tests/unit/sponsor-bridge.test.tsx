import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SponsorBridge } from '../../components/brand/SponsorBridge';

const root = process.cwd();

describe('SponsorBridge', () => {
  it('renders the Google Play asset as a non-image badge so runtime image rules cannot hide it', () => {
    const markup = renderToStaticMarkup(<SponsorBridge playUrl="https://play.google.com/store/apps/details?id=com.example.limacircle" />);
    const styles = readFileSync(resolve(root, 'app/globals.css'), 'utf8');

    expect(markup).toContain('class="sponsor-badge"');
    expect(markup).toContain('aria-label="Unduh Lima Circle di Google Play"');
    expect(markup).toContain('href="https://play.google.com/store/apps/details?id=com.example.limacircle"');
    expect(markup).not.toContain('<img src="/brand/google-play-badge.webp"');
    expect(styles).toMatch(/\.sponsor-badge\s*\{[^}]*background-image:\s*url\(['"]?\/brand\/google-play-badge\.webp['"]?\)/);
  });
  it('stacks and centers the logo, copy, and non-image badge on mobile while retaining the desktop three-column layout', () => {
    const markup = renderToStaticMarkup(<SponsorBridge />);
    const styles = readFileSync(resolve(root, 'app/globals.css'), 'utf8');

    expect(markup).toMatch(/sponsor-logo[\s\S]*sponsor-copy[\s\S]*sponsor-download/);
    expect(styles).toMatch(/@media \(max-width: 619px\)\s*\{[\s\S]*?\.sponsor-bridge\s*\{[^}]*grid-template-columns:\s*1fr[^}]*text-align:\s*center[^}]*\}/);
    expect(styles).toMatch(/@media \(max-width: 619px\)\s*\{[\s\S]*?\.sponsor-copy\s*\{[^}]*justify-items:\s*center[^}]*text-align:\s*center[^}]*\}/);
    expect(styles).toMatch(/@media \(max-width: 619px\)\s*\{[\s\S]*?\.sponsor-download\s*\{[^}]*justify-items:\s*center[^}]*\}/);
    expect(styles).toMatch(/@media \(min-width: 620px\)\s*\{[\s\S]*?\.sponsor-bridge\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto[^}]*\}/);
  });

  it('provides the Lima Circle logo as the local App Router favicon asset', () => {
    expect(() => readFileSync(resolve(root, 'app/icon.png'))).not.toThrow();
  });
});
