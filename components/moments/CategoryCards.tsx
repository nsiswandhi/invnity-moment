'use client';

import React from 'react';
import { MOMENT_CATEGORIES, type MomentCategory } from '../../lib/db/types';

const categoryCopy: Record<MomentCategory, { label: string; emoji: string }> = {
  REUNI: { label: 'Reuni', emoji: '🤝' },
  PANGGUNG: { label: 'Panggung', emoji: '🎤' },
  FESTIVAL: { label: 'Festival', emoji: '🎉' },
  BAZAAR: { label: 'Bazaar', emoji: '🛍️' },
  KOMUNITAS: { label: 'Komunitas', emoji: '🫶' },
  ZERO_WASTE: { label: 'Zero Waste', emoji: '🌱' },
  NOSTALGIA: { label: 'Nostalgia', emoji: '📻' },
  MOMEN_KITA: { label: 'Momen Kita', emoji: '✨' },
};

export type CategoryCardsProps = {
  activeCount: number;
  selectedCategory?: MomentCategory;
  maxActiveMoments?: number;
  onSelect: (category: MomentCategory) => void;
};

export function CategoryCards({ activeCount, selectedCategory, maxActiveMoments = 10, onSelect }: CategoryCardsProps) {
  const quotaReached = activeCount >= maxActiveMoments;
  return (
    <fieldset className="category-section" aria-describedby="category-quota">
      <legend className="section-title">Pilih suasana momennya</legend>
      <p id="category-quota" className="muted-copy">
        {quotaReached ? `Semua slot momen sudah terpakai (${maxActiveMoments}/${maxActiveMoments}).` : `${activeCount}/${maxActiveMoments} momen tersimpan`}
      </p>
      <div className="category-grid">
        {MOMENT_CATEGORIES.map((category) => {
          const copy = categoryCopy[category];
          const selected = selectedCategory === category;
          return (
            <button
              key={category}
              type="button"
              className={`category-card${selected ? ' is-selected' : ''}`}
              data-testid={`category-card-${category}`}
              data-selected={selected ? 'true' : 'false'}
              aria-label={`Pilih kategori ${copy.label}`}
              aria-pressed={selected}
              disabled={quotaReached}
              onClick={() => onSelect(category)}
            >
              <span className="category-emoji" aria-hidden="true">{copy.emoji}</span>
              <span>{copy.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export { categoryCopy };
