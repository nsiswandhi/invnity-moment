# InVnity Moments

Fondasi aplikasi Next.js App Router untuk menyimpan dan merayakan momen berharga.

## Menjalankan lokal

Gunakan Node.js 22.x, salin `.env.example` menjadi `.env.local`, lalu isi variabel R2, `SESSION_SECRET`, dan `ADMIN_ACCESS_TOKEN` (masing-masing minimal 32 karakter). `ADMIN_ACCESS_TOKEN` dipakai operator untuk masuk ke `/admin`; jangan pernah memasukkannya ke kode frontend.

```bash
npm install
npm run dev
```

## Perintah pengujian

`npm run test:unit` · `npm run test:e2e` · `npm run lint` · `npm run typecheck` · `npm run test:load`

## Production operations

Deployments and runtime topology are documented in [`deploy/`](deploy/). Apply Supabase migrations in filename order before serving traffic. Keep server-only values in the deployment secret store; the application expects `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `SESSION_SECRET`. Public configuration uses `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_EVENT_ID`, and `NEXT_PUBLIC_EVENT_SLUG`.

Operational jobs are bounded and safe to preview:

```bash
node scripts/cleanup-expired-sessions.ts
node scripts/reconcile-r2-objects.ts
node scripts/reconcile-r2-objects.ts --apply
node scripts/aggregate-analytics.ts
node scripts/smoke-production.ts
node scripts/seed-production-event.ts --dry-run
```

`smoke-production.ts` requires `SMOKE_BASE_URL`. It reports failure when the target cannot be reached and never reports a successful smoke run without HTTP responses from the target. See the [event-day runbook](docs/operations/event-day-runbook.md) for sequencing, rollback, backups, and secret rotation.
