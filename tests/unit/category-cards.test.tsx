import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CategoryCards } from '../../components/moments/CategoryCards';

describe('CategoryCards', () => {
  it('renders all eight categories with accessible labels', () => {
    const markup = renderToStaticMarkup(<CategoryCards activeCount={0} onSelect={() => undefined} />);

    expect(markup.match(/data-testid="category-card-/g)).toHaveLength(8);
    expect(markup).toContain('aria-label="Pilih kategori Reuni"');
    expect(markup).toContain('aria-label="Pilih kategori Momen Kita"');
  });

  it('marks the selected category and disables every card at the quota', () => {
    const selectedMarkup = renderToStaticMarkup(<CategoryCards activeCount={2} selectedCategory="FESTIVAL" onSelect={() => undefined} />);
    const quotaMarkup = renderToStaticMarkup(<CategoryCards activeCount={10} onSelect={() => undefined} />);

    expect(selectedMarkup).toContain('aria-pressed="true"');
    expect(selectedMarkup).toContain('data-selected="true"');
    expect(quotaMarkup.match(/disabled=""/g)).toHaveLength(8);
    expect(quotaMarkup).toContain('Semua slot momen sudah terpakai (10/10).');
  });
});
