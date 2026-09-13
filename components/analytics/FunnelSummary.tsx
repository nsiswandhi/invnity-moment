import React from 'react';
import type { FunnelSummary as FunnelSummaryData } from '../../lib/analytics/aggregates';

const steps: Array<[keyof FunnelSummaryData, string]> = [
  ['qrLanding', 'QR dibuka'], ['registrationStarted', 'Registrasi dimulai'], ['registrationCompleted', 'Registrasi selesai'],
  ['cameraOpened', 'Kamera dibuka'], ['captures', 'Foto diambil'], ['uploadSucceeded', 'Upload berhasil'],
  ['published', 'Momen terbit'], ['galleryViews', 'Album dibuka'], ['momentDetailViews', 'Detail momen'],
  ['likes', 'Like'], ['downloads', 'Unduhan'], ['recoveryCompleted', 'Akses dipulihkan'],
];

export function FunnelSummary({ summary }: { summary: FunnelSummaryData }) {
  return <section className="admin-panel funnel-summary"><h2>Alur partisipasi</h2><div className="funnel-list">{steps.map(([key, label]) => <div key={key}><span>{label}</span><strong>{summary[key]}</strong></div>)}</div></section>;
}
