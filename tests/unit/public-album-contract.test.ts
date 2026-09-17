import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSupabasePublicAlbumDatabase, type PublicMomentRow } from '../../lib/db/repositories/public-album';
import type { DatabaseClient } from '../../lib/db/client';

const DEFAULT_CAPTION = 'Momen berharga bersama teman-teman reuni.';
const root = process.cwd();
let migration = '';
try { migration = readFileSync(resolve(root, 'supabase/migrations/0016_public_album_metadata.sql'), 'utf8'); } catch { /* RED: Task 5 migration is not shipped yet. */ }
const styles = readFileSync(resolve(root, 'app/globals.css'), 'utf8');
const categoryTabs = readFileSync(resolve(root, 'components/album/CategoryTabs.tsx'), 'utf8');
const momentCard = readFileSync(resolve(root, 'components/album/MomentCard.tsx'), 'utf8');

const row = {
  id: '1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219',
  category: 'REUNI',
  caption: null,
  participantName: 'Sari Wijaya',
  participantBatch: 'IA 5',
  likeCount: 4,
  createdAt: '2026-09-10T00:00:00.000Z',
  publishedAt: '2026-09-10T00:00:00.000Z',
  r2DisplayKey: 'events/bd928dad-a8c6-40af-a482-30df35ad5e5b/participants/e3a7c9f1-30b0-4f8b-9ad4-5adfc8445e5c/moments/1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219/display.jpg',
  r2ThumbnailKey: 'events/bd928dad-a8c6-40af-a482-30df35ad5e5b/participants/e3a7c9f1-30b0-4f8b-9ad4-5adfc8445e5c/moments/1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219/thumbnail.jpg',
  r2OriginalKey: 'events/bd928dad-a8c6-40af-a482-30df35ad5e5c/participants/e3a7c9f1-30b0-4f8b-9ad4-5adfc8445e5c/moments/1ef1d9e5-2d09-4c1e-84dd-9e7c6bb0c219/original',
} as unknown as PublicMomentRow;

describe('public album contract', () => {
  it('maps participant identity and a non-null caption fallback from public RPC rows', async () => {
    const database = createSupabasePublicAlbumDatabase(
      { rpc: vi.fn().mockResolvedValue({ data: [row], nextCursor: null }) } as unknown as DatabaseClient,
      { presignGet: vi.fn(async (key: string) => `https://cdn.example.test/${key}`) },
    );

    await expect(database.listPublishedMoments({ eventId: 'bd928dad-a8c6-40af-a482-30df35ad5e5b', category: null, cursor: null, limit: 30, anonymousUserKey: null }))
      .resolves.toMatchObject({ data: [{ caption: DEFAULT_CAPTION, participantName: 'Sari Wijaya', participantBatch: 'IA 5' }] });
  });

  it('returns an All filter and every category without a scrolling tab strip', () => {
    expect(categoryTabs).toContain('>All</button>');
    expect(categoryTabs).toContain('MOMENT_CATEGORIES.map');
    expect(styles).toMatch(/\.album-tabs\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)[^}]*overflow:\s*visible/);
    expect(styles).toMatch(/\.album-tabs\s*>\s*button:first-child\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
    expect(styles).toMatch(/@media\s*\(min-width:\s*620px\)\s*\{[\s\S]*?\.album-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)[^}]*\}[\s\S]*?\.album-tabs\s*>\s*button:first-child\s*\{[^}]*grid-row:\s*span\s*2/);
  });

  it('renders the public card hierarchy with the category badge over the image', () => {
    expect(momentCard).toMatch(/public-moment-image[\s\S]*public-moment-category-badge/);
    expect(momentCard).toContain('{moment.caption}');
    expect(momentCard).toContain('Momen by {moment.participantName} - {moment.participantBatch}');
    expect(momentCard).toMatch(/public-moment-footer[\s\S]*<time[\s\S]*like-button/);
  });

  it('adds participant fields and legacy-safe caption values to both public RPC projections', () => {
    expect(migration).toMatch(/create or replace function list_published_moments[\s\S]*?join participants p on p\.id = m\.participant_id/i);
    expect(migration).toMatch(/create or replace function get_published_moment[\s\S]*?join participants p on p\.id = m\.participant_id/i);
    expect(migration).toMatch(/'caption',\s*coalesce\(nullif\(btrim\(m\.caption\),\s*''\),\s*'Momen berharga bersama teman-teman reuni\.'/i);
    expect(migration).toMatch(/'participantName',\s*p\.name/i);
    expect(migration).toMatch(/'participantBatch',\s*p\.batch/i);
  });
});
