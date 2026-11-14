# Clinic Management System user guide

`Linae-Clinic-User-Guide.pdf` is the staff guide to every screen of the app: 19 chapters, 327 pages and 308 screenshots. The screenshots show a demonstration clinic with made-up data.

## Rebuild the guide

The guide is generated. Each chapter in `scripts/guide/chapters/` holds its text and the recipe for each of its screenshots.

1. Start PostgreSQL on this machine.
2. Boot the demonstration stack and leave it running:

   ```bash
   STACK_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node scripts/guide/serve.cjs
   ```

3. In a second terminal, fill it with demonstration data:

   ```bash
   node scripts/guide/seed.cjs
   ```

4. Take every screenshot. This takes about 40 minutes.

   ```bash
   node scripts/guide/capture.cjs
   ```

5. Build the PDF:

   ```bash
   node scripts/guide/build.cjs
   ```

Run the capture once on a freshly seeded stack. Several chapters create bills, visits and stock documents, so a second run on the same data shows different screens.

To change a chapter, edit its file, then run steps 4 and 5 with `--only <chapter number>`. `scripts/guide/AUTHORING.md` has the rules for writing a chapter.
