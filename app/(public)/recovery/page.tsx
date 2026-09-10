'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { trackClientEvent } from '../../../lib/analytics/client-events';
import { getPublicEventConfig } from '../../../lib/event-config';

const eventId = (() => { try { return getPublicEventConfig().eventId; } catch { return ''; } })();
export default function RecoveryPage() {
  const [sent, setSent] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true); trackClientEvent('recovery_requested');
    if (!eventId) { setError('Pemulihan akses belum dikonfigurasi untuk event ini.'); setBusy(false); return; }
    const email = String(new FormData(event.currentTarget).get('email') || '');
    try { const response = await fetch('/api/v1/access-recovery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: eventId, email }) }); if (!response.ok) throw new Error('Permintaan belum bisa dikirim. Coba lagi.'); setSent(true); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Permintaan belum bisa dikirim.'); } finally { setBusy(false); }
  };
  return <main className="site-shell form-shell"><Link className="back-link" href="/">← Kembali</Link><section className="form-card" aria-labelledby="recovery-title"><p className="eyebrow">Akses kembali</p><h1 id="recovery-title">Temukan momenmu lagi.</h1>{sent ? <div className="success-message" role="status"><strong>Cek inbox kamu.</strong><p>Kalau email terdaftar, kami akan mengirim tautan pemulihan.</p></div> : <><p className="intro-copy">Masukkan email yang kamu gunakan saat daftar. Kami akan mengirim tautan sekali pakai.</p><form onSubmit={submit}><label>Email<input name="email" type="email" required autoComplete="email" /></label>{error && <p className="error-message" role="alert">{error}</p>}<button className="primary-button full-button" type="submit" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim tautan akses'}</button></form></>}</section></main>;
}
