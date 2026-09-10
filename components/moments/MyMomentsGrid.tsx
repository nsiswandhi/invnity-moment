/* eslint-disable @next/next/no-img-element */
'use client';

import React from 'react';
import type { CursorPage, MomentCategory, MomentRecord } from '../../lib/db/types';
import { categoryCopy } from './CategoryCards';

export type DisplayMoment = MomentRecord & { thumbnailUrl?: string; displayUrl?: string };
export function MyMomentsGrid({ page, onDelete, onCategoryChange, onLoadMore }: { page: CursorPage<DisplayMoment>; onDelete: (moment: MomentRecord) => void; onCategoryChange: (moment: MomentRecord, category: MomentCategory) => void; onLoadMore?: () => void }) {
  return <section className="moments-grid-section" aria-labelledby="grid-title"><div className="section-heading"><h2 id="grid-title">Momen tersimpan</h2><span className="muted-copy">{page.data.length} foto</span></div>
    {page.data.length === 0 ? <div className="empty-state"><span aria-hidden="true">✦</span><p>Belum ada momen tersimpan.</p><p className="muted-copy">Ayo ambil foto pertama kamu!</p></div> : <div className="moments-grid">{page.data.map((moment) => <article className="moment-tile" key={moment.id}>
      <div className="moment-image">{moment.thumbnailUrl || moment.displayUrl ? <img src={moment.thumbnailUrl || moment.displayUrl} alt={`Momen kategori ${categoryCopy[moment.category].label}`} /> : <span aria-label="Foto sedang diproses">⌛</span>}<span className={`status-pill status-${moment.status.toLowerCase()}`}>{moment.status === 'PUBLISHED' ? 'Tersimpan' : moment.status === 'PROCESSING' ? 'Memproses' : moment.status}</span></div>
      <label className="category-edit">Kategori<select value={moment.category} onChange={(event) => onCategoryChange(moment, event.target.value as MomentCategory)} aria-label={`Ubah kategori ${categoryCopy[moment.category].label}`}><option value="REUNI">Reuni</option><option value="PANGGUNG">Panggung</option><option value="FESTIVAL">Festival</option><option value="BAZAAR">Bazaar</option><option value="KOMUNITAS">Komunitas</option><option value="ZERO_WASTE">Zero Waste</option><option value="NOSTALGIA">Nostalgia</option><option value="MOMEN_KITA">Momen Kita</option></select></label>
      <button className="delete-link" type="button" onClick={() => onDelete(moment)}>Hapus foto</button>
    </article>)}</div>}
    {page.nextCursor && <button className="secondary-button load-more" type="button" onClick={onLoadMore}>Muat momen berikutnya</button>}
  </section>;
}
