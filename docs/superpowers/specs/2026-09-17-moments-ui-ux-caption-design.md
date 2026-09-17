# InVnity Moments UI/UX and Caption Design

## Goal

Improve the participant, personal moments, album, and moment-detail experiences while adding a persisted photo caption field and applying the supplied InVnity/Lima Circle brand assets.

## Scope

### Shared branding

- Replace text-rendered InVnity marks with the supplied InVnity logo asset in public-facing headers and brand placements.
- Add a yellow Lima Circle sponsor footer using the supplied Lima Circle logo and Google Play badge.
- Use the supplied `bgheader.jpg` as the personal-moments hero background, with a readable green overlay treatment if needed.
- Keep external drive letters out of runtime paths; assets must be copied into `public/` and referenced with web-relative paths.

### Registration and session states

- Add whitespace between the registration submit button and its explanatory note.
- When the personal-moments session has expired, make `Buat Sesi Baru via Email` the primary action and `Belum Daftar? Daftar di sini` the secondary action.
- In the camera view, make the `Ganti kamera` button text green for contrast.

### Personal moments

- Use the real InVnity logo in the header.
- Replace the header's `Akses kembali` link with `Momen Saya` and `Album Reuni`.
- Remove the redundant bottom navigation from this page.
- Change the category screen heading to `Pilih Kategori Foto.`.
- Add an optional caption textarea with a 200-character limit and visible character count.
- Empty captions persist as `Momen berharga bersama teman-teman reuni.`.

### Caption data contract

- Add a nullable-compatible `caption` text column to `moments`, backfill existing rows with the standard caption, and enforce a maximum of 200 characters at the API/database boundary.
- Extend the upload-completion request, repository serializers, personal-moment responses, public-album responses, and detail data with `caption`.
- Return participant name and batch for public album cards and detail views.
- Preserve the existing category, moderation, likes, download, and authorization behavior.

### Public album and detail

- Rename the all-category filter to `All`.
- Show all nine filter options without horizontal scrolling.
- Desktop/tablet: two rows and five columns; `All` occupies the first column across both rows, with the eight categories in the remaining cells.
- Mobile: `All` spans the first row; categories use four columns across the next two rows.
- On album cards, put the category badge over the image at top-left; below the image show caption, bold `Momen by Nama — Angkatan`, then date and like count aligned on the date row.
- On detail, show the caption as normal text, followed by bold `Momen by Nama — Angkatan`, then the date.

## Default and error behavior

- Blank captions are normalized to the standard caption before persistence, so every important display location has usable text.
- Captions over 200 characters are rejected with the existing API error handling pattern.
- Existing moments without a caption remain readable after migration because they are backfilled.
- Existing session, recovery, upload, like, and download errors remain unchanged unless layout copy is explicitly listed above.

## Verification

- Unit/contract tests cover caption validation, migration shape, serialization, and the revised session/caption UI contracts.
- Existing unit, typecheck, build, and E2E suites must remain passing.
- Manually inspect registration, expired session, camera, category/caption, personal moments, album at desktop/mobile widths, and detail flows after deployment.

