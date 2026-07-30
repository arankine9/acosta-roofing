---
version: alpha
name: heritage-signage-design-system
description: |
  A printed-signage marketing system for a rural Pacific Northwest trade
  business: three inks (forest green, cream, charcoal), a condensed uppercase
  display cut set with heavy tracking, and page chapters that alternate cream
  paper against solid forest bands. Every surface behaves like something that
  gets manufactured — a yard sign, a truck door, a business card, an
  embroidered cap — so corners are square, separation is a hairline rule
  rather than a shadow, and the only ornament in the system is a repeating fir
  treeline marking the seam between chapters. There is no gradient, no
  elevation, no second accent, and no color used to signal hierarchy.

colors:
  forest: "#1b3d2e"
  forest-deep: "#14301f"
  forest-mid: "#2f5a44"
  cream: "#f2efe6"
  cream-deep: "#e7e2d3"
  board: "#fbfaf6"
  charcoal: "#2b2b2b"
  canvas: "#f2efe6"
  hairline: "rgba(43,43,43,0.22)"
  hairline-strong: "rgba(43,43,43,0.45)"
  hairline-dark: "rgba(242,239,230,0.28)"
  ink: "#2b2b2b"
  body: "#3d3d3d"
  mute: "#6b6a63"
  on-forest: "#f2efe6"
  on-forest-mute: "rgba(242,239,230,0.72)"
  error: "#8c2f22"

typography:
  wordmark:
    fontFamily: Oswald
    fontWeight: 700
    letterSpacing: 0.16em
    lineHeight: 0.92
    case: upper
  display-xl:
    fontFamily: Oswald
    fontSize: 68px
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: 0.015em
    case: upper
  display-lg:
    fontFamily: Oswald
    fontSize: 44px
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: 0.02em
    case: upper
  heading-xl:
    fontFamily: Oswald
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: 0.03em
    case: upper
  heading-md:
    fontFamily: Oswald
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: 0.045em
    case: upper
  heading-sm:
    fontFamily: Oswald
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.06em
    case: upper
  spaced:
    fontFamily: Oswald
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.24em
    case: upper
  spaced-sm:
    fontFamily: Oswald
    fontSize: 11.5px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.26em
    case: upper
  eyebrow:
    fontFamily: Oswald
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.3em
    case: upper
  lead:
    fontFamily: Barlow
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.55
  body-md:
    fontFamily: Barlow
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.6
  body-strong:
    fontFamily: Barlow
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.6
  body-sm:
    fontFamily: Barlow
    fontSize: 15.5px
    fontWeight: 400
    lineHeight: 1.62
  caption:
    fontFamily: Barlow
    fontSize: 13.5px
    fontWeight: 400
    lineHeight: 1.45
  button:
    fontFamily: Oswald
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.12em
    case: upper

rounded:
  none: 0px
  sm: 2px

spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 88px

components:
  panel: Flat board on `{colors.board}` with a 1px `{colors.hairline}` border and square corners.
  panel-keyline: A second 1px rule inset 6px inside the panel edge — the routed groove on a printed sign.
  plate-label: Solid `{colors.forest}` strip with `{typography.spaced}` cream caps, used to title a plate.
  ruled-label: Section eyebrow flanked by 1px rules that fill the remaining width.
  dot-list: Middot-separated trust line — "Licensed · Bonded · Insured".
  badge-tag: Square outline tag in `{typography.spaced-sm}`, hairline-strong border.
  treeline: Repeating fir silhouette marking the seam between a cream chapter and a forest one.
  yard-sign: Cream panel + keyline + stacked lockup + licence blank, on two forest stakes.
  btn-primary: Forest fill, cream label, 48px, 2px radius.
  btn-outline: Transparent with a 2px forest border; inverts to forest fill on hover.
  btn-cream / btn-outline-cream: The same two buttons inverted for use on a forest band.
---

## Overview

The system is a brand board rendered as a website. Every component is
something the business could hand a sign shop: a yard sign, a truck door
decal, a two-sided business card, a hat patch. That framing decides the rules —
square corners, flat fills, hairline rules, no elevation, and no gradient,
because none of those survive being cut in vinyl or embroidered.

Pages are a stack of chapters that alternate between cream paper
(`{colors.canvas}`, `{colors.cream-deep}`) and solid forest bands
(`{colors.forest}`). The seam between the two is the one piece of ornament in
the system: a repeating fir treeline, always upright, always standing on the
forest band. Cream firs sit inside a band's bottom edge; forest firs sit on top
of its upper edge. The treeline is never mirrored — upside-down conifers read
as a rendering bug.

Hierarchy comes from the type cut and from tracking, never from color. There is
no link blue, no semantic palette in the marketing surface, and no tinted
heading: text takes the ink of whatever surface it sits on.

### Signature moves
- Three inks only. Forest, cream, charcoal — plus rules made by thinning one of them.
- Two type cuts with one job each: condensed uppercase for anything titled, a normal-width grotesque for anything read in sentences.
- Tracking as an instrument. `{typography.spaced}` at 0.24em and `{typography.eyebrow}` at 0.3em carry the signage feel; tightening them collapses the identity.
- Chapters, not sections. The page alternates paper and band; there are no decorative dividers between blocks on the same surface.
- Objects, not cards. The estimate form is a plate with a forest label bar; the hero panel is a staked yard sign; the contact block is a business card.
- Reference data is documentation. Service areas are a ruled table with a forest header row, not a grid of tiles.

## Colors

### Brand
- **Forest** (`{colors.forest}` — `#1b3d2e`): the brand. Every band, every primary button, every pictogram, the mark itself.
- **Forest Deep** (`{colors.forest-deep}` — `#14301f`): pressed state, sign stakes, and the footer fine-print band.
- **Forest Mid** (`{colors.forest-mid}` — `#2f5a44`): the numeral of a ruled step list, where full forest would out-shout the step title. It is the lightest green in the system that still clears AA on `{colors.cream-deep}`.

### Surface
- **Cream / Canvas** (`{colors.cream}` — `#f2efe6`): the page. Also the ink of all text on a forest band.
- **Cream Deep** (`{colors.cream-deep}` — `#e7e2d3`): alternating body chapters, so two paper sections in a row still separate.
- **Board** (`{colors.board}` — `#fbfaf6`): the panel fill — a half-step brighter than the page, the way a fresh sign blank is brighter than kraft.
- **Charcoal** (`{colors.charcoal}` — `#2b2b2b`): text ink. It is never used as a surface; a black band would read as a different brand.

### Rules
- **Hairline** (`{colors.hairline}`): 1px panel border, table rule, list divider on cream.
- **Hairline Strong** (`{colors.hairline-strong}`): input borders and badge outlines, where a 22% rule disappears against a filled field.
- **Hairline Dark** (`{colors.hairline-dark}`): the same rules on a forest band. A charcoal rule on forest is invisible — always switch.

### Text
- **Ink** (`{colors.ink}`) headlines on cream · **Body** (`{colors.body}`) paragraphs · **Mute** (`{colors.mute}`) captions and licence blanks.
- **On Forest** (`{colors.on-forest}`) and **On Forest Mute** (`{colors.on-forest-mute}`) are the only two text colors permitted on a band.

## Typography

**Oswald** is the open-source stand-in for the wordmark's condensed cut, at
weights 500/600/700, and it is used **uppercase only** — it has no sentence-case
role anywhere in the system. **Barlow** (400/500/600/700) carries every
sentence. Fallbacks are Arial Narrow → Arial for the display cut and Arial for
body, so the page still reads as signage if the webfont never arrives.

The scale is deliberately short: five display steps, three spaced-caps steps,
four body steps. Anything that needs to feel manufactured is set in the display
cut with tracking; anything that needs to be read at length is set in Barlow at
1.6 line-height.

## Layout

- Container: 1240px max, 24px gutters, 48px at ≥1440px.
- Section rhythm: 88px block padding, 64px ≤900px, 44px ≤560px.
- Chapters alternate `canvas → cream-deep → forest → canvas`; a forest band is
  always preceded by a treeline seam.
- Grids are 3-up at desktop, 2-up at ≥640px, 1-up below. Long-form runs
  60/40 with the rail dropping under the body below 1024px.

## Accessibility

- Cream on forest is 10.4:1; charcoal on cream is 12.3:1; body on cream is 9.5:1. All clear AA at every size in the scale.
- `on-forest-mute` (72% cream) is the floor for secondary text on a band at 6.2:1 — do not thin it further.
- `mute` (4.7:1 on cream) is cream-surface only. On `{colors.forest-deep}` it lands at 2.6:1; the footer fine print uses `on-forest-mute` for exactly this reason.
- Focus is a 2px outline at 3px offset — forest on cream, cream on forest via `.on-forest`.
- Buttons and inputs are 48px tall; the letterspaced label never reduces the target.
