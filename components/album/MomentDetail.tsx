/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PublicMoment } from '../../lib/db/types';
import { categoryCopy } from '../moments/CategoryCards';
import { trackClientEventOnce } from '../../lib/analytics/client-events';

const csrfToken = () => typeof document === 'undefined' ? '' : decodeURIComponent(document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith('invnity_csrf='))?.split('=').slice(1).join('=') || '');

export async function downloadSignedFile(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download belum dapat dimulai.');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    try {
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(objectUrl);
    }
  } catch (reason) {
    if (reason instanceof Error && reason.message === 'Download belum dapat dimulai.') throw reason;
    throw new Error('Download belum dapat dimulai.');
  }
}

export function MomentDetail({ momentId }: { momentId: string }) {
  const [moment, setMoment] = useState<PublicMoment | null>(null); const [error, setError] = useState(''); const [liked, setLiked] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch(`/api/v1/moments/${momentId}`).then(async (response) => { const payload = await response.json() as { data?: { moment: PublicMoment }; error?: { message?: string } }; if (!response.ok || !payload.data) throw new Error(payload.error?.message || 'Momen tidak ditemukan.'); setMoment(payload.data.moment); setLiked(payload.data.moment.liked ?? false); trackClientEventOnce(`moment-detail-${momentId}`, 'moment_detail_view'); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Momen tidak dapat dimuat.')); }, [momentId]);
  const like = async () => { if (!moment || busy) return; setBusy(true); try { const response = await fetch(`/api/v1/moments/${moment.id}/like`, { method: liked ? 'DELETE' : 'POST', headers: { 'x-csrf-token': csrfToken() } }); const payload = await response.json() as { data?: { liked: boolean; likeCount: number } }; if (!response.ok || !payload.data) throw new Error('Like belum dapat disimpan.'); setLiked(payload.data.liked); setMoment({ ...moment, likeCount: payload.data.likeCount }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Like belum dapat disimpan.'); } finally { setBusy(false); } };
  const download = async () => { if (!moment) return; try { const response = await fetch(`/api/v1/moments/${moment.id}/download`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() }, body: JSON.stringify({ variant: 'display' }) }); const payload = await response.json() as { data?: { downloadUrl: string }; error?: { message?: string } }; if (!response.ok || !payload.data) throw new Error(payload.error?.message || 'Download belum dapat dimulai.'); await downloadSignedFile(payload.data.downloadUrl, `momen-${moment.id}.jpg`); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Download belum dapat dimulai.'); } };
  if (error && !moment) return <main className="site-shell form-shell"><p className="error-message" role="alert">{error}</p><Link className="secondary-button" href="/album">Kembali ke album</Link></main>;
  if (!moment) return <main className="site-shell loading-shell"><p>Menyiapkan momen…</p></main>;
  return <main className="site-shell detail-shell"><Link className="back-link" href="/album">← Kembali ke album</Link><article className="detail-card"><img className="detail-image" src={moment.displayUrl} alt={`Momen ${categoryCopy[moment.category].label}`} /><p className="eyebrow">{categoryCopy[moment.category].emoji} {categoryCopy[moment.category].label}</p><h1>Momen kita.</h1><time className="muted-copy" dateTime={moment.publishedAt}>{new Date(moment.publishedAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}</time><div className="action-row detail-actions"><button className={`secondary-button${liked ? ' is-liked' : ''}`} type="button" onClick={() => void like()} disabled={busy}>♥ {moment.likeCount} suka</button><button className="primary-button" type="button" onClick={() => void download()}>Download foto ↓</button></div>{error && <p className="error-message" role="alert">{error}</p>}</article></main>;
}
