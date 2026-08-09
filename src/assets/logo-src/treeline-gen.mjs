// Generates public/treeline.svg + treeline-light.svg, the fir stand used to
// draw the seams between chapters. Run with `node src/assets/logo-src/treeline-gen.mjs`.
//
// The firs are not redrawn: they are windowed straight out of the mark's left
// stand, so the seams and the logo are literally the same trees. Because those
// firs overlap in the mark, the windows can't be eyeballed: a rectangle that
// clips a branch mid-span leaves a fir sheared flat down one side, which is
// glaring once the tree is mirrored. So the silhouette is measured: `skyline()`
// walks the filled path and reports the topmost ink at any x, the valleys
// between the peaks give each window its left and right edge, and the window
// bottom sits BURY below the shallower of the two valley floors. That puts
// every vertical cut inside the ground band, where it is buried.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, "../../../public");
const FIR = /class="cls-1" d="([^"]+)"/.exec(readFileSync(`${pub}/mark.svg`, "utf8"))[1];

/* ---- silhouette measurement ---------------------------------------- */

function flatten(d) {
  const t = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  const polys = [];
  let cur = null, x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0, cmd = "", i = 0;
  const num = () => parseFloat(t[i++]);
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    for (let k = 1; k <= 16; k++) {
      const s = k / 16, u = 1 - s;
      cur.push([u*u*u*x + 3*u*u*s*x1 + 3*u*s*s*x2 + s*s*s*x3,
                u*u*u*y + 3*u*u*s*y1 + 3*u*s*s*y2 + s*s*s*y3]);
    }
    px = x2; py = y2; x = x3; y = y3;
  };
  while (i < t.length) {
    if (/[a-zA-Z]/.test(t[i])) cmd = t[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    if (C === "M") {
      const a = num(), b = num();
      x = rel ? x + a : a; y = rel ? y + b : b;
      cur = [[x, y]]; polys.push(cur); sx = x; sy = y; px = x; py = y;
      cmd = rel ? "l" : "L";
    } else if (C === "L") {
      const a = num(), b = num();
      x = rel ? x + a : a; y = rel ? y + b : b; cur.push([x, y]); px = x; py = y;
    } else if (C === "H") { const a = num(); x = rel ? x + a : a; cur.push([x, y]); px = x; py = y; }
    else if (C === "V") { const a = num(); y = rel ? y + a : a; cur.push([x, y]); px = x; py = y; }
    else if (C === "C") {
      const a = num(), b = num(), c = num(), e = num(), f = num(), g = num();
      cubic(rel ? x+a : a, rel ? y+b : b, rel ? x+c : c, rel ? y+e : e, rel ? x+f : f, rel ? y+g : g);
    } else if (C === "S") {
      const c = num(), e = num(), f = num(), g = num();
      cubic(2*x - px, 2*y - py, rel ? x+c : c, rel ? y+e : e, rel ? x+f : f, rel ? y+g : g);
    } else if (C === "Z") { cur.push([sx, sy]); x = sx; y = sy; }
    else num();
  }
  return polys;
}

const edges = [];
for (const p of flatten(FIR))
  for (let k = 0; k + 1 < p.length; k++)
    if (p[k][0] !== p[k + 1][0]) edges.push([p[k][0], p[k][1], p[k + 1][0], p[k + 1][1]]);

/** y of the topmost ink at x, or Infinity where the stand has no ink. */
export function skyline(X) {
  const hits = [];
  for (const [x1, y1, x2, y2] of edges) {
    if (X < Math.min(x1, x2) || X >= Math.max(x1, x2)) continue;
    hits.push([y1 + ((X - x1) / (x2 - x1)) * (y2 - y1), x2 > x1 ? 1 : -1]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  let w = 0, top = Infinity;
  for (const [yy, dir] of hits) { if (w === 0) { top = yy; break; } w += dir; }
  return top;
}

const extreme = (a, b, cmp) => {
  let best = null, bx = 0;
  for (let X = a; X <= b; X += 0.1) {
    const y = skyline(X);
    if (y !== Infinity && (best === null || cmp(y, best))) { best = y; bx = X; }
  }
  return [bx, best];
};
const valley = (a, b) => extreme(a, b, (y, best) => y > best);
const peak = (a, b) => extreme(a, b, (y, best) => y < best);

/* ---- the stand ------------------------------------------------------ */

const H = 72, GROUND = 58, BURY = 8, MARGIN = 12, TARGET = 640;
const FLOOR = GROUND + BURY;

// Peaks and the valleys that separate them, searched in the neighbourhood of
// each fir. Everything below is derived, so re-running after an edit to the
// mark re-cuts the windows rather than silently keeping stale ones.
const SEARCH = [
  { key: "a", peak: [6, 13], left: null, right: [12, 17], max: 2.9 },
  { key: "b", peak: [20, 30], left: [12, 17], right: [32, 37], max: 1.45 },
  { key: "c", peak: [38, 45], left: [32, 37], right: [44, 48], max: 2.4 },
  { key: "d", peak: [55, 65], left: [44, 48], right: [68, 76], max: 1.22 },
  { key: "e", peak: [76, 84], left: [68, 76], right: null, max: 1.75 },
];
const EDGE = [1.0, 89.0]; // where the stand's ink starts and stops

const FIRS = {};
for (const s of SEARCH) {
  const [, top] = peak(...s.peak);
  const [lx, lf] = s.left ? valley(...s.left) : [EDGE[0], skyline(EDGE[0])];
  const [rx, rf] = s.right ? valley(...s.right) : [EDGE[1], skyline(EDGE[1])];
  const bottom = Math.min(lf, rf) + BURY;
  FIRS[s.key] = {
    x: +lx.toFixed(2), y: +(top - 1).toFixed(2),
    w: +(rx - lx).toFixed(2), h: +(bottom - top + 1).toFixed(2),
    max: s.max,
  };
}

// Cycles of co-prime length. Nothing lines up again inside one tile, so the
// stand reads as irregular rather than as a pattern with a period.
const KIND = ["d", "a", "b", "e", "c", "b", "d", "c", "e"];
// Firs are sized by how far they STAND above the ground line, not by an
// arbitrary scale factor: the rise is the thing you actually see, and sizing
// by scale kept leaving them squat. RISE is the range each kind may stand, in
// tile units above GROUND; the ceiling of 57 puts the tip at y=1. The scale
// needed to hit a given rise is derived, since a fir's window already carries
// the BURY units that sit under the band.
const RISE = { a: [14, 26], c: [20, 32], e: [28, 42], b: [34, 50], d: [44, 57] };
const TALL = [1.0, 0.35, 0.8, 0.15, 0.6, 0.95, 0.25, 0.5, 0.85, 0.4];
// Roughly one fir per 40 units: at a 64px band that is a tree every ~36px,
// the openness the seam had before these were the logo's firs. Packed tighter
// they stop reading as trees and the whole seam turns into a serrated fringe.
const GAP = [22, 14, 34, 18, 28, 11, 40, 20, 30, 16, 25];
const FLIP = [false, true, false, true, true];
// A touch of extra sink so the bases do not all land on one dead-straight
// line. Kept small: sinking a fir is the same as shortening it, and short is
// the failure mode here.
const SINK = [0, 2, 0, 3, 1, 0, 2, 1, 0];

// A few small firs tucked between the big ones, sunk until only their crowns
// clear the band, so the ground line never runs dead straight for long. Kept
// sparse on purpose: packed close they stop reading as trees. `rise` is how
// far a crown clears the ground line, capped so the scrub fir's own window
// edges stay buried.
const FRONT_KIND = ["a", "c", "a", "e", "c", "a", "b"];
const FRONT_SCALE = [0.75, 0.6, 0.9, 0.55, 0.8];
const FRONT_GAP = [58, 84, 47, 96, 66, 39, 74];
const FRONT_RISE = [8, 5, 12, 6, 10];

const stand = [];
for (let i = 0, x = MARGIN / 2; ; i++) {
  const k = KIND[i % KIND.length], f = FIRS[k];
  const [lo, hi] = RISE[k];
  const rise = lo + TALL[i % TALL.length] * (hi - lo);
  const s = Math.min((BURY + rise) / f.h, f.max);
  if (x + f.w * s > TARGET - MARGIN) break;
  stand.push([k, x, s, FLIP[i % FLIP.length], FLOOR - f.h * s + SINK[i % SINK.length]]);
  x += f.w * s + GAP[i % GAP.length];
}
const last = stand.at(-1);
const W = Math.round(last[1] + FIRS[last[0]].w * last[2] + MARGIN);

const front = [];
for (let i = 0, x = -6; ; i++) {
  const k = FRONT_KIND[i % FRONT_KIND.length], f = FIRS[k];
  const s = Math.min(FRONT_SCALE[i % FRONT_SCALE.length], f.max);
  // cap the rise so the window's bottom BURY units (the only part where a
  // vertical edge can cross foliage) stay under the ground line
  const rise = Math.min(FRONT_RISE[i % FRONT_RISE.length], f.h * s - BURY);
  if (x > W - 4) break;
  if (rise > 1) front.push([k, x, s, i % 3 === 1, GROUND - rise]);
  x += FRONT_GAP[i % FRONT_GAP.length];
}

const n = (v) => String(Math.round(v * 100) / 100);

function tile(ink, note) {
  const defs = `<path id="fir" d="${FIR}"/>` + Object.entries(FIRS).map(([k, f]) =>
    `<clipPath id="w-${k}"><rect x="${n(f.x)}" y="${n(f.y)}" width="${n(f.w)}" height="${n(f.h)}"/></clipPath>` +
    `<g id="${k}" clip-path="url(#w-${k})" transform="translate(${n(-f.x)},${n(-f.y)})"><use href="#fir"/></g>`
  ).join("");
  const plant = ([k, x, s, flip, top]) => {
    const f = FIRS[k];
    return `<use href="#${k}" transform="${flip
      ? `translate(${n(x + f.w * s)},${n(top)}) scale(${n(-s)},${n(s)})`
      : `translate(${n(x)},${n(top)}) scale(${n(s)})`}"/>`;
  };
  const body = stand.map(plant).join("") + front.map(plant).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- ${note}
       A stand of firs cut from mark.svg and re-planted on a flat ground band,
       so the section seams are drawn with the logo's own trees. GENERATED:
       run src/assets/logo-src/treeline-gen.mjs, do not hand-edit. -->
  <defs>${defs}</defs>
  <g fill="${ink}">${body}<rect y="${GROUND}" width="${W}" height="${H - GROUND}"/></g>
</svg>
`;
}

writeFileSync(`${pub}/treeline.svg`, tile("#1b3d2e", "Forest treeline, for the seam above a forest band."));
writeFileSync(`${pub}/treeline-light.svg`, tile("#f2efe6", "Cream cut of treeline.svg, for the seam inside a forest band."));
console.log(`treeline ${W}x${H}, ${stand.length} firs + ${front.length} front`);
for (const [k, f] of Object.entries(FIRS)) console.log(`  ${k}  x${f.x} y${f.y} ${f.w}x${f.h}`);
