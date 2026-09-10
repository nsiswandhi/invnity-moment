/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PublicMoment } from '../../lib/db/types';
import { categoryCopy } from '../moments/CategoryCards';

const csrfToken = () => typeof document === 'undefined' ? '' : decodeURIComponent(document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith('invnity_csrf='))?.split('=').slice(1).join('=') || '');

export function MomentCard({ moment }: { moment: PublicMoment }) {
  const [likeCount, setLikeCount] = useState(moment.likeCount);
  const [liked, setLiked] = useState(moment.liked ?? false);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/moments/${moment.id}/like`, { method: liked ? 'DELETE' : 'POST', headers: { 'x-csrf-token': csrfToken() } });
      const payload = await response.json() as { data?: { liked: boolean; likeCount: number } };
      if (!response.ok || !payload.data) throw new Error('like failed');
      setLiked(payload.data.liked); setLikeCount(payload.data.likeCount);
    } catch { /* Likes are optional and must not interrupt album browsing. */ } finally { setBusy(false); }
  };
  return <article className="public-moment-card"><Link className="public-moment-link" href={`/album/${moment.id}`}><div className="public-moment-image"><img src={moment.thumbnailUrl} alt={`Momen ${categoryCopy[moment.category].label}`} loading="lazy" /></div><div className="public-moment-meta"><span>{categoryCopy[moment.category].label}</span><time dateTime={moment.publishedAt}>{new Date(moment.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</time></div></Link><button className={`like-button${liked ? ' is-liked' : ''}`} type="button" onClick={() => void toggle()} disabled={busy} aria-pressed={liked} aria-label={`${liked ? 'Batal suka' : 'Suka'} momen, ${likeCount} suka`}>♥ <span>{likeCount}</span></button></article>;
}
