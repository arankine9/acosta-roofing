# Acosta Roofing

Marketing site for **Acosta Roofing LLC** — Beaverton, Oregon. Astro 6 +
Tailwind 4, static output.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # -> dist/
```

## Where the content comes from

Every business fact on the site is from the Acosta Roofing brand board: the
wordmark, the three-ink palette, the licensing line, the five services, the
"proudly serving Oregon" line, and the placeholder phone number and CCB blank.
Anything the board does not state — street address, hours, founding year — is
either empty in `src/data/site.ts` or marked as a placeholder there. Nothing is
inherited from any other contractor's records, and the site makes no rating,
accreditation or years-in-business claim, because there is nothing to back one
with yet.

## Design system

The visual system is a full implementation of `DESIGN.md` — a printed-signage
system in three inks: forest green (`#1b3d2e`), cream (`#f2efe6`) and charcoal
(`#2b2b2b`), with cream body chapters alternating against solid forest bands, a
condensed uppercase display cut carrying every title, and hairline rules
instead of shadows. Nothing is rounded past 2px and nothing is elevated,
because every surface is modelled on something the sign shop could actually
make: the hero panel is the yard sign, the contact block is the business card,
the estimate form is a plate with a routed label bar.

`src/styles/global.css` is the token layer; its custom-property names match the
token names in `DESIGN.md` so the two stay auditable against each other. Type
roles are classes (`.t-display-xl`, `.t-spaced`, …) mapping 1:1 to the
hierarchy table in that document.

Two deliberate deviations, both documented in comments where they occur:

- The footer's legal fine-print uses `on-forest-mute` rather than `mute`; the
  specified color lands at 2.6:1 on the deep forest panel.
- The footer runs four link columns, not six. There aren't six columns of real
  pages, and inventing them to satisfy the grid would be worse than the grid.

The brand assets are drawn, not sourced: `public/icon.svg` is the board's stand
of fir behind a gable, built from solid fills at a single ink so it survives
being cut in vinyl or embroidered. The repeating treeline that marks each
cream/forest seam is `src/components/Treeline.astro`.

## Before this goes live

- [ ] **Phone number** — `(503) 123-4567` is the placeholder printed on the
      brand board, not a working line. Set `phone` and `phoneHref` in
      `src/data/site.ts`; they drive the nav, hero sign, CTA band, footer and
      the JSON-LD.
- [ ] **CCB licence number** — set `ccb` in `src/data/site.ts`. Oregon requires
      it in contractor advertising. The hero sign and footer render the printed
      blank until it is set.
- [ ] **Street address and ZIP** — not on the brand board. They render only when
      set, so the site currently shows "Beaverton, OR".
- [ ] **Confirm the hours** in `src/data/site.ts` — they are a placeholder.
- [ ] **Job photos** — drop into `public/images/` using the filenames in
      `src/components/Services.astro`. Until then the cards show a shingle
      texture rather than a broken image.
- [ ] **Wire up the contact form.** `src/components/Contact.astro` posts
      nowhere; the note under the submit button says so rather than silently
      dropping enquiries. Point `action` at a handler and delete that note.
- [ ] **Domain** — `acostaroofing.com` is set in `astro.config.mjs` and printed
      on the business card; confirm it is registered.

## Structure

| Path | Purpose |
| --- | --- |
| `src/data/site.ts` | All business facts. Change them here, not in components. |
| `src/layouts/Base.astro` | Head, fonts, favicon, SEO, `RoofingContractor` JSON-LD. |
| `src/styles/global.css` | Tailwind 4 `@theme` tokens, type roles, components. |
| `DESIGN.md` | The design system this site implements. |
| `public/icon.svg` | Mark in forest, for cream surfaces. |
| `public/icon-light.svg` | Mark in cream, for forest bands (footer, hero). |
| `public/favicon.svg` | Forest tile with a cream gable; the treeline is dropped at 16px. |
