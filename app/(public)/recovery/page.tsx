'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trackClientEvent } from '../../../lib/analytics/client-events';
import { getPublicEventConfig } from '../../../lib/event-config';

const eventId = (() => { try { return getPublicEventConfig().eventId; } catch { return ''; } })();
const csrfToken = () => typeof document === 'undefined' ? '' : decodeURIComponent(document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith('invnity_csrf='))?.split('=').slice(1).join('=') || '');
export default function RecoveryPage() {
  const router = useRouter();
  const [sent, setSent] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [token, setToken] = useState(''); const [tokenChecked, setTokenChecked] = useState(false); const [consuming, setConsuming] = useState(false);
  useEffect(() => {
    const recoveryToken = new URLSearchParams(window.location.search).get('token') || '';
    setToken(recoveryToken); setTokenChecked(true);
    if (!recoveryToken) return;
    let active = true;
    const consume = async () => {
      setConsuming(true);
      try {
        const csrf = csrfToken();
        const response = await fetch('/api/v1/access-recovery/consume', { method: 'POST', headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) }, body: JSON.stringify({ token: recoveryToken }) });
        const payload = await response.json() as { error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message || 'Tautan pemulihan tidak valid atau sudah kedaluwarsa.');
        router.replace('/moments');
      } catch (reason) { if (active) { setError(reason instanceof Error ? reason.message : 'Tautan pemulihan tidak dapat digunakan.'); setConsuming(false); } }
    };
    void consume(); return () => { active = false; };
  }, [router]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true); trackClientEvent('recovery_requested');
    if (!eventId) { setError('Pemulihan akses belum dikonfigurasi untuk event ini.'); setBusy(false); return; }
    const email = String(new FormData(event.currentTarget).get('email') || '');
    try { const csrf = csrfToken(); const response = await fetch('/api/v1/access-recovery', { method: 'POST', headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) }, body: JSON.stringify({ event: eventId, email }) }); if (!response.ok) throw new Error('Permintaan belum bisa dikirim. Coba lagi.'); setSent(true); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Permintaan belum bisa dikirim.'); } finally { setBusy(false); }
  };
  if (!tokenChecked || (token && consuming)) return <main className="site-shell form-shell"><section className="form-card" aria-labelledby="recovery-title"><p className="eyebrow">Akses kembali</p><h1 id="recovery-title">Memulihkan akses…</h1><p className="intro-copy">Tunggu sebentar, kami sedang menyiapkan momenmu.</p></section></main>;
  if (token && error) return <main className="site-shell form-shell"><Link className="back-link" href="/">← Kembali</Link><section className="form-card" aria-labelledby="recovery-title"><p className="eyebrow">Akses kembali</p><h1 id="recovery-title">Tautan tidak dapat digunakan.</h1><p className="error-message" role="alert">{error}</p><Link className="primary-button full-button" href="/recovery">Minta tautan baru</Link></section></main>;
  return <main className="site-shell form-shell"><Link className="back-link" href="/">← Kembali</Link><section className="form-card" aria-labelledby="recovery-title"><p className="eyebrow">Akses kembali</p><h1 id="recovery-title">Temukan momenmu lagi.</h1>{sent ? <div className="success-message" role="status"><strong>Cek inbox kamu.</strong><p>Kalau email terdaftar, kami akan mengirim tautan pemulihan.</p></div> : <><p className="intro-copy">Masukkan email yang kamu gunakan saat daftar. Kami akan mengirim tautan sekali pakai.</p><form onSubmit={submit}><label>Email<input name="email" type="email" required autoComplete="email" /></label>{error && <p className="error-message" role="alert">{error}</p>}<button className="primary-button full-button" type="submit" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim tautan akses'}</button></form></>}</section></main>;
}
