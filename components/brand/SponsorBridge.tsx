'use client';

import React, { useEffect } from 'react';
import { trackClientEvent } from '../../lib/analytics/client-events';

export function SponsorBridge({ playUrl }: { playUrl?: string }) {
  useEffect(() => { trackClientEvent('sponsor_module_view', { destination: 'google_play' }); }, []);
  const badgeLabel = 'Unduh Lima Circle di Google Play';
  return (
    <aside className="sponsor-bridge" aria-label="Dukungan Lima Circle">
      <img className="sponsor-logo" src="/brand/lima-circle-logo.png" alt="Lima Circle" />
      <div className="sponsor-copy">
        <span className="sponsor-kicker">Support by Lima Circle</span>
        <strong>Rumah Digital Alumni SMAN 5 Bandung</strong>
        <p>Yuk, unduh aplikasinya!</p>
      </div>
      <div className="sponsor-download">
        {playUrl ? (
          <a className="sponsor-link" href={playUrl} target="_blank" rel="noreferrer" aria-label={badgeLabel} onClick={() => trackClientEvent('sponsor_cta_click', { destination: 'google_play' })}>
            <span className="sponsor-badge" aria-hidden="true" />
          </a>
        ) : <span className="sponsor-badge" role="img" aria-label={badgeLabel} />}
      </div>
    </aside>
  );
}
