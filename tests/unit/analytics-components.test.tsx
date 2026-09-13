import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FunnelSummary } from '../../components/analytics/FunnelSummary';
import { SponsorMetrics } from '../../components/admin/SponsorMetrics';

describe('analytics summary components', () => {
  it('shows funnel counts and sponsor CTR without install claims', () => {
    const funnel = renderToStaticMarkup(<FunnelSummary summary={{ qrLanding: 12, registrationStarted: 8, registrationCompleted: 6, cameraOpened: 5, captures: 5, uploadStarted: 5, uploadSucceeded: 4, published: 4, galleryViews: 8, momentDetailViews: 3, likes: 2, downloads: 1, recoveryRequested: 1, recoveryCompleted: 1 }} />);
    const sponsor = renderToStaticMarkup(<SponsorMetrics summary={{ views: 12, clicks: 3, ctr: 25 }} />);
    expect(funnel).toContain('Registrasi selesai');
    expect(sponsor).toContain('CTR');
    expect(sponsor.toLowerCase()).not.toContain('install');
  });
});
