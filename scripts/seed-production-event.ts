import { createDatabaseClient, type DatabaseClient } from '../lib/db/client';

export type SeedReport = { dryRun: boolean; seeded: boolean; slug: string; name: string; eventDate: string; status: 'pre_event' };
export type SeedOptions = { db?: DatabaseClient; slug: string; name: string; eventDate: string; dryRun?: boolean };

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validate(input: Pick<SeedOptions, 'slug' | 'name' | 'eventDate'>): void {
  if (!slugPattern.test(input.slug) || input.slug.length > 120) throw new Error('PRODUCTION_EVENT_SLUG_INVALID');
  if (!input.name.trim() || input.name.length > 200) throw new Error('PRODUCTION_EVENT_NAME_INVALID');
  if (!datePattern.test(input.eventDate) || Number.isNaN(Date.parse(`${input.eventDate}T00:00:00Z`))) throw new Error('PRODUCTION_EVENT_DATE_INVALID');
}

export async function seedProductionEvent({ db = createDatabaseClient(), slug, name, eventDate, dryRun = false }: SeedOptions): Promise<SeedReport> {
  validate({ slug, name, eventDate });
  if (!dryRun) await db.rpc('seed_local_event', { p_slug: slug, p_name: name.trim(), p_event_date: eventDate });
  return { dryRun, seeded: !dryRun, slug, name: name.trim(), eventDate, status: 'pre_event' };
}

async function main(): Promise<void> {
  const slug = process.env.PRODUCTION_EVENT_SLUG;
  const name = process.env.PRODUCTION_EVENT_NAME;
  const eventDate = process.env.PRODUCTION_EVENT_DATE;
  if (!slug || !name || !eventDate) throw new Error('PRODUCTION_EVENT_CONFIGURATION_REQUIRED');
  const result = await seedProductionEvent({ slug, name, eventDate, dryRun: process.argv.includes('--dry-run') });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]?.endsWith('seed-production-event.ts')) main().catch(() => { process.stderr.write('Production event seed failed.\n'); process.exitCode = 1; });
