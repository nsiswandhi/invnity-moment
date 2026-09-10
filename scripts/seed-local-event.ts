import { createDatabaseClient } from '../lib/db/client';

async function seedLocalEvent() {
  const client = createDatabaseClient();
  await client.rpc('seed_local_event', { p_slug: 'reuni-akbar-ia5-2026', p_name: 'Reuni Akbar IA 5 Bandung', p_event_date: '2026-10-10' });
  console.log('Local event seed requested.');
}

seedLocalEvent().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
