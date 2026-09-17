'use client';

import React, { useEffect } from 'react';
import { trackClientEvent } from '../../lib/analytics/client-events';

export function SponsorBridge({ playUrl }: { playUrl?: string }) {
  useEffect(() => { trackClientEvent('sponsor_module_view', { destination: 'google_play' }); }, []);
  return (
    <aside className="sponsor-bridge" aria-label="Dukungan Lima Circle">
      <div className="sponsor-copy">
        <span className="sponsor-kicker">Lima Circle</span>
        <strong>Rumah Digital Alumni SMAN 5 Bandung</strong>
      </div>
      <img className="sponsor-logo" src="/brand/lima-circle-logo.png" alt="Lima Circle" />
      <div className="sponsor-download">
        <p>Yuk, unduh aplikasinya!</p>
        {playUrl ? (
          <a className="sponsor-link" href={playUrl} target="_blank" rel="noreferrer" onClick={() => trackClientEvent('sponsor_cta_click', { destination: 'google_play' })}>
            <img src="/brand/google-play-badge.webp" alt="Unduh Lima Circle di Google Play" />
          </a>
        ) : <img src="/brand/google-play-badge.webp" alt="Unduh Lima Circle di Google Play" />}
      </div>
    </aside>
  );
}
