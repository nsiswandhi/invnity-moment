// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MomentModerationGrid, type AdminModerationMoment } from '../../components/admin/MomentModerationGrid';

const photo = { id: 'photo-1', category: 'REUNI', status: 'HIDDEN', participantName: 'Andi', participantBatch: '1996', hiddenReason: 'Privasi', thumbnailUrl: 'https://storage.example.test/thumb?signature=test', displayUrl: 'https://storage.example.test/display?signature=test' };
function render(moment: AdminModerationMoment = photo) {
  vi.stubGlobal('React', React);
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<MomentModerationGrid moments={[moment]} onVisibility={async () => undefined} />);
  return host;
}

describe('operator photo inspection', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('renders the signed thumbnail and offers the display image for inspection', () => {
    const host = render();
    expect(host.querySelector('img')?.getAttribute('src')).toBe(photo.thumbnailUrl);
    expect(host.querySelector('img')?.getAttribute('alt')).toContain('Andi');
    expect(host.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    expect(host.querySelector('a')?.getAttribute('href')).toBe(photo.displayUrl);
    expect(host.textContent).not.toContain('signature=test');
  });

  it('shows an explicit unavailable message when no preview can be signed', () => {
    const host = render({ ...photo, thumbnailUrl: null, displayUrl: null });
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toMatch(/pratinjau.*tidak tersedia/i);
  });
});
