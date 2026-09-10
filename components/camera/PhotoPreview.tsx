/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useEffect, useState } from 'react';
import { trackClientEvent } from '../../lib/analytics/client-events';

export function PhotoPreview({ blob, onRetake, onSave }: { blob: Blob; onRetake: () => void; onSave: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [blob]);
  return (
    <section className="preview-panel" aria-labelledby="preview-title">
      <p className="eyebrow">Momenmu sudah siap</p><h1 id="preview-title">Bagus! Mau simpan?</h1>
      <div className="preview-frame">{url && <img src={url} alt="Pratinjau foto yang baru diambil" />}</div>
      <div className="action-row"><button className="secondary-button" type="button" onClick={() => { trackClientEvent('retake'); onRetake(); }}>Ulangi</button><button className="primary-button" type="button" onClick={onSave}>Simpan foto →</button></div>
    </section>
  );
}
