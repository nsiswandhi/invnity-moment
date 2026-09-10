'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CursorPage, MomentCategory, PublicMoment } from '../../lib/db/types';
import { AlbumGrid } from './AlbumGrid';
import { AlbumHeader } from './AlbumHeader';
import { CategoryTabs } from './CategoryTabs';

const emptyPage: CursorPage<PublicMoment> = { data: [], nextCursor: null };

export function PublicAlbum() {
  const [category, setCategory] = useState<MomentCategory | null>(null);
  const [page, setPage] = useState(emptyPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async (nextCategory: MomentCategory | null, cursor: string | null = null) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: '30' }); if (nextCategory) params.set('category', nextCategory); if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/v1/moments?${params}`); const payload = await response.json() as { data?: CursorPage<PublicMoment>; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || 'Album belum dapat dimuat.');
      setPage((current) => cursor ? { data: [...current.data, ...payload.data!.data], nextCursor: payload.data!.nextCursor } : payload.data!);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Album belum dapat dimuat.'); } finally { setLoading(false); }
  };
  useEffect(() => { void load(null); }, []);
  const selectCategory = (next: MomentCategory | null) => { setCategory(next); setPage(emptyPage); void load(next); };
  return <main className="site-shell album-shell"><AlbumHeader /><CategoryTabs selected={category} onChange={selectCategory} />{error && <p className="error-message" role="alert">{error}</p>}<AlbumGrid page={page} loading={loading} onLoadMore={() => { if (page.nextCursor) void load(category, page.nextCursor); }} /><nav className="bottom-nav" aria-label="Navigasi utama"><Link href="/moments">Momen saya</Link><Link className="active" href="/album">Album reuni</Link></nav></main>;
}
