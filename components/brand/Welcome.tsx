import React from 'react';
import Link from 'next/link';
import { SponsorBridge } from './SponsorBridge';
import { ClientEventTracker } from '../analytics/ClientEventTracker';

export function Welcome({ eventName = 'Reuni Akbar IA 5 Bandung', eventDate = '10 Oktober 2026', playUrl }: { eventName?: string; eventDate?: string; playUrl?: string }) {
  return (
    <main className="site-shell welcome-shell">
      <ClientEventTracker eventKey="qr-landing" name="qr_landing" />
      <div className="doodle doodle-star" aria-hidden="true">✦</div>
      <section className="welcome-card" aria-labelledby="welcome-title">
        <div className="brand-mark" aria-label="InVnity Moments">InV<span>n</span>ity</div>
        <p className="eyebrow">{eventName} · {eventDate}</p>
        <h1 id="welcome-title">Satu Reuni.<br /><span>Ribuan Cerita.</span></h1>
        <p className="intro-copy">Abadikan momenmu bersama teman-teman IA 5. Foto kamu akan tersimpan di album reuni.</p>
        <Link className="primary-button" href="/register">Mulai abadikan momen <span aria-hidden="true">→</span></Link>
        <Link className="text-link" href="/moments">Sudah pernah daftar? Lihat momen saya</Link>
      </section>
      <SponsorBridge playUrl={playUrl} />
    </main>
  );
}
