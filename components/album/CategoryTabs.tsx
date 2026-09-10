'use client';

import { MOMENT_CATEGORIES, type MomentCategory } from '../../lib/db/types';
import { categoryCopy } from '../moments/CategoryCards';

export function CategoryTabs({ selected, onChange }: { selected: MomentCategory | null; onChange: (category: MomentCategory | null) => void }) {
  return <div className="album-tabs" role="tablist" aria-label="Filter kategori album"><button type="button" role="tab" aria-selected={selected === null} className={selected === null ? 'is-selected' : ''} onClick={() => onChange(null)}>Semua foto</button>{MOMENT_CATEGORIES.map((category) => <button key={category} type="button" role="tab" aria-selected={selected === category} className={selected === category ? 'is-selected' : ''} onClick={() => onChange(category)}>{categoryCopy[category].emoji} {categoryCopy[category].label}</button>)}</div>;
}
