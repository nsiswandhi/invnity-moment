'use client';

import React, { useEffect } from 'react';
import { trackClientEvent } from '../../lib/analytics/client-events';

export function SponsorBridge({ playUrl }: { playUrl?: string }) {
  useEffect(() => { trackClientEvent('sponsor_module_view', { destination: 'google_play' }); }, []);
  return (
    <aside className="sponsor-bridge" aria-label="Dukungan Lima Circle">
      <span className="sponsor-kicker">Didukung oleh Lima Circle</span>
      <strong>Platform digital alumni IA Lima</strong>
      <p>Temukan IA Lima di aplikasi Lima Circle</p>
      {playUrl ? (
        <a className="sponsor-link" href={playUrl} target="_blank" rel="noreferrer" onClick={() => trackClientEvent('sponsor_cta_click', { destination: 'google_play' })}>Buka di Google Play ↗</a>
      ) : <span className="sponsor-unavailable">Tautan aplikasi akan tersedia segera.</span>}
    </aside>
  );
}
