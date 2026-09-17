import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const route = read('app/api/v1/moments/[momentId]/complete/route.ts');
const uploadService = read('lib/media/upload-service.ts');
const types = read('lib/db/types.ts');
const migration = read('supabase/migrations/0015_add_moment_caption.sql');

const DEFAULT_CAPTION = 'Momen berharga bersama teman-teman reuni.';

describe('moment caption contract', () => {
  it('accepts an optional caption, defaults blank input, and rejects the 201-character boundary', () => {
    expect(route).toMatch(/caption:\s*z\.string\(\)\.max\(200\)\.optional\(\)/);
    expect(route).toContain(DEFAULT_CAPTION);
    expect(route).toMatch(/input\.caption\?\.trim\(\)\s*\|\|\s*DEFAULT_MOMENT_CAPTION/);
    expect(route).toMatch(/completeUpload\(\{[\s\S]*?(?:caption:\s*caption|,\s*caption\s*\})/);
  });

  it('includes caption in completion metadata and shared moment records', () => {
    expect(uploadService).toMatch(/completeUpload\(input:\s*\{[\s\S]*?caption:\s*string/);
    expect(uploadService).toMatch(/caption:\s*input\.caption/);
    expect(types).toMatch(/export type MomentObjectMetadata\s*=\s*\{[\s\S]*?caption:\s*string;/);
  });

  it('adds, backfills, constrains, and serializes persisted captions', () => {
    expect(migration).toMatch(/add column caption text/i);
    expect(migration).toContain(DEFAULT_CAPTION);
    expect(migration).toMatch(/update moments\s+set caption\s*=\s*'Momen berharga bersama teman-teman reuni\.'\s+where caption is null or btrim\(caption\) = ''/i);
    expect(migration).toMatch(/alter table moments\s+alter column caption set default 'Momen berharga bersama teman-teman reuni\.'/i);
    expect(migration).toMatch(/alter table moments\s+alter column caption set not null/i);
    expect(migration).toMatch(/check\s*\(char_length\(caption\)\s*<=\s*200\)/i);
    expect(migration).toMatch(/'caption',\s*(?:m\.)?caption/i);
    expect(migration).toMatch(/list_owned_moments[\s\S]*caption/i);
    expect(migration).toMatch(/list_published_moments[\s\S]*caption/i);
    expect(migration).toMatch(/get_published_moment[\s\S]*caption/i);
  });
});
