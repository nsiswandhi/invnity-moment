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
});
