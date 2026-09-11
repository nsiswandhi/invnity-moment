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
