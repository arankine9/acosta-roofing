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
