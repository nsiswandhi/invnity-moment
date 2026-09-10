'use client';

import type { CursorPage, PublicMoment } from '../../lib/db/types';
import { MomentCard } from './MomentCard';

export function AlbumGrid({ page, loading, onLoadMore }: { page: CursorPage<PublicMoment>; loading: boolean; onLoadMore: () => void }) {
  if (!loading && page.data.length === 0) return <div className="empty-state"><span aria-hidden="true">✦</span><p>Belum ada momen di kategori ini.</p><p className="muted-copy">Coba lihat kategori lainnya.</p></div>;
  return <section aria-labelledby="public-grid-title"><div className="section-heading"><h2 id="public-grid-title">Momen terbaru</h2><span className="muted-copy">{page.data.length} foto</span></div><div className="public-album-grid">{page.data.map((moment) => <MomentCard key={moment.id} moment={moment} />)}</div>{loading && <p className="muted-copy album-loading" role="status">Memuat momen…</p>}{page.nextCursor && !loading && <button className="secondary-button load-more" type="button" onClick={onLoadMore}>Muat momen berikutnya</button>}</section>;
}
