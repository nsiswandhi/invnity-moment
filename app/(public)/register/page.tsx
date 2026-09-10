'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trackClientEvent } from '../../../lib/analytics/client-events';
import { getPublicEventConfig } from '../../../lib/event-config';

const eventSlug = (() => { try { return getPublicEventConfig().eventSlug; } catch { return ''; } })();

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true); trackClientEvent('registration_started');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (!eventSlug) throw new Error('Pendaftaran belum dikonfigurasi untuk event ini.');
      const response = await fetch(`/api/v1/events/${eventSlug}/participants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
      const payload = await response.json() as { data?: { participant?: { id: string; eventId: string; name: string; batch: string } }; error?: { message?: string } };
      if (!response.ok || !payload.data?.participant) throw new Error(payload.error?.message || 'Pendaftaran belum berhasil.');
      sessionStorage.setItem('invnity-participant', JSON.stringify(payload.data.participant)); trackClientEvent('registration_completed'); router.push('/moments');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pendaftaran belum berhasil. Silakan coba lagi.'); } finally { setBusy(false); }
  };
  return <main className="site-shell form-shell"><Link className="back-link" href="/">← Kembali</Link><section className="form-card" aria-labelledby="register-title"><p className="eyebrow">Langkah pertama</p><h1 id="register-title">Kenalan dulu, yuk.</h1><p className="intro-copy">Isi sekali saja. Setelah itu, kamu bisa langsung mengabadikan momen.</p><form onSubmit={submit}>
    <label>Nama lengkap<input name="name" required minLength={2} autoComplete="name" /></label><label>Angkatan / batch<input name="batch" required autoComplete="off" placeholder="Contoh: IA 5" /></label><label>Email untuk akses kembali<input name="email" type="email" required autoComplete="email" /></label>
    {error && <p className="error-message" role="alert">{error}</p>}<button className="primary-button full-button" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Lanjutkan ke momen →'}</button>
  </form><p className="form-note">Email hanya digunakan untuk pemulihan akses dan tidak ditampilkan di album.</p></section></main>;
}
