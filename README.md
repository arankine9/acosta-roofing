# Acosta Roofing

Marketing site for **Acosta Roofing LLC**, Beaverton, Oregon. Astro 6 +
Tailwind 4, static output.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # -> dist/
```

## Deploys

Cloudflare Pages builds and deploys every push to `main` to
https://acostaroofingpnw.com (project `acosta-roofing` in the owner's
Cloudflare account; Node version from `.node-version`). Other branches get
preview URLs on `acosta-roofing-eb8.pages.dev`.

## Where the content comes from

Every business fact on the site is from the Acosta Roofing brand board: the
wordmark, the three-ink palette, the licensing line, the five services, the
"proudly serving Oregon" line. The phone number, email and CCB number were
supplied by the business.
Anything the board does not state (street address, hours, founding year) is
either empty in `src/data/site.ts` or marked as a placeholder there. Nothing is
inherited from any other contractor's records, and the site makes no rating,
accreditation or years-in-business claim, because there is nothing to back one
with yet.

## Design system

The visual system is a full implementation of `DESIGN.md`, a printed-signage
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

The brand assets come from the supplied vector art: `public/mark.svg` is the
board's stand of fir behind a gable, and the wordmark is inlined in
`src/components/Wordmark.astro`. Both are solid fills with no strokes, so they
survive being cut in vinyl or embroidered. The repeating treeline that marks each
cream/forest seam is `src/components/Treeline.astro`.

## Before this goes live

- [ ] **Street address and ZIP**: not on the brand board. They render only when
      set, so the site currently shows "Beaverton, OR".
- [ ] **Confirm the hours** in `src/data/site.ts`; they are a placeholder.
- [ ] **Job photos**: drop into `public/images/` using the filenames in
      `src/components/Services.astro`. Until then the cards show a shingle
      texture rather than a broken image.
- [ ] **Replace the material pictures.** The three files in
      `public/images/materials/` are Roofscapes NW's icons, in as
      placeholders to judge the look. Drop in Acosta's own under the same
      filenames (`asphalt-shingle.png`, `architectural-shingle.png`,
      `single-ply-membrane.png`) before this ships.
- [ ] **Wire up the contact form.** `src/components/Contact.astro` posts
      nowhere; the note under the submit button says so rather than silently
      dropping enquiries. Point `action` at a handler and delete that note.

## Structure

| Path | Purpose |
| --- | --- |
| `src/data/site.ts` | All business facts. Change them here, not in components. |
| `src/layouts/Base.astro` | Head, fonts, favicon, SEO, `RoofingContractor` JSON-LD. |
| `src/styles/global.css` | Tailwind 4 `@theme` tokens, type roles, components. |
| `DESIGN.md` | The design system this site implements. |
| `public/mark.svg` | Mark (firs + gable) as supplied, for cream surfaces. |
| `public/mark-light.svg` | Same mark inverted to cream, for forest bands (footer). |
| `src/components/Wordmark.astro` | Wordmark as supplied, inlined so `currentColor` drives tone. |
| `scripts/build-service-map.mjs` | Draws the service-area map: Oregon within 75 min drive of the shop. Run by hand; see below. |
| `public/images/materials/` | The three roofing-material pictures. Swap one by replacing the file under the same name. |
| `public/favicon.svg` | Forest tile with a cream gable; the treeline is dropped at 16px. |

## Service area map

The map shows everywhere in Oregon within 75 minutes' off-peak drive of the
Beaverton shop, built from real road-network drive times (OpenStreetMap data,
via the public Valhalla routing server) and cut at the Washington state line.
The result is committed, so the site builds with no network. To rebuild it
(only needed if the shop moves or the drive time changes), run the three
steps in order:

```bash
node scripts/sample-drive-times.mjs   # ~15 min: drive times on a 3 km grid
node scripts/build-drive-area.mjs     # ~5 min: stitch the 75-minute area
node scripts/build-service-map.mjs    # seconds: smooth, clip, draw, check
```

The last step prints which counties and towns fall inside the line; the
county list in `src/data/site.ts` is written from that report.
