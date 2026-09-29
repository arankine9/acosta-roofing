/*
  Samples driving time from the Beaverton shop to a grid of points across
  northwest Oregon, and writes them to scripts/data/drive-times.json.
  scripts/build-drive-area.mjs uses the points 50-60 minutes out as relays
  to build the 75-minute area; see that file for why.

  Runs BY HAND and rarely: it takes a few minutes and queries a public
  routing server, so its output is committed and the map script works from
  that file with no network. Re-run it only if the shop moves or the grid
  needs to change:

      node scripts/sample-drive-times.mjs

  The public matrix endpoint stops returning times past roughly 100 km of
  road, so points far out come back empty; only the inner times, up to about
  an hour, are complete, and those are the ones used.

  Why Valhalla (OpenStreetMap roads, FOSSGIS public server): checked against
  typical off-peak drive times to known towns before being trusted. From
  Beaverton it gives Salem 49 min, Albany 70, Hood River 73, Tillamook 83,
  Seaside 81, in line with everyday experience. The OSRM demo server read
  15-25% slow on the same trips. Times are off-peak: rush hour on I-5 or
  US-26 shrinks the real reach, which is the right way round for a service
  area.

  A grid point with no road within SEARCH_CUTOFF metres comes back with no
  time, so remote forest does not borrow the drive time of the nearest
  logging road.
*/
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

const ENDPOINT = "https://valhalla1.openstreetmap.de/sources_to_targets";
const SHOP = { name: "Beaverton", lon: -122.8037, lat: 45.4871 };

// About 3 km per cell at this latitude, in both directions.
const GRID = { west: -124.3, east: -121.0, south: 44.15, north: 46.45, dLon: 0.038, dLat: 0.027 };

// Nothing further than this in a straight line is within 75 minutes: the
// fastest run out of Beaverton (I-84 to Hood River) covers ~100 km of
// straight-line distance in that time.
const MAX_STRAIGHT_KM = 150;
const SEARCH_CUTOFF = 2000;
// The public server takes 100 locations per request: one source plus 99.
const BATCH = 99;
const PAUSE_MS = 700;

const km = (a, b) => {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

const nx = Math.round((GRID.east - GRID.west) / GRID.dLon) + 1;
const ny = Math.round((GRID.north - GRID.south) / GRID.dLat) + 1;

// Only points in Oregon or just outside it are sampled: the ocean and the
// far side of the Columbia can't be in the service area, and every point
// there is a wasted request. The margin keeps a ring of samples across the
// state line so the traced boundary runs past it and the cut to Oregon in
// the map script lands exactly on the line, not a cell short of it.
const atlas = await fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json").then((r) => r.json());
const oregon = feature(atlas, atlas.objects.states).features.find((f) => f.id === "41");
const MARGIN = 0.06; // degrees, ~5-7 km
const nearOregon = ({ lon, lat }) =>
  [-MARGIN, 0, MARGIN].some((dx) => [-MARGIN, 0, MARGIN].some((dy) => geoContains(oregon, [lon + dx, lat + dy])));

// Row-major from the north-west corner, which is the order d3-contour reads.
const points = [];
for (let j = 0; j < ny; j++) {
  for (let i = 0; i < nx; i++) {
    const p = { i, j, lon: GRID.west + i * GRID.dLon, lat: GRID.north - j * GRID.dLat };
    if (km(SHOP, p) <= MAX_STRAIGHT_KM && nearOregon(p)) points.push(p);
  }
}

// Progress is saved after every batch and picked up again on the next run,
// so a dropped connection partway through doesn't cost the whole sample.
mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
const PARTIAL = new URL("./data/drive-times.partial.json", import.meta.url);
const resumed = existsSync(PARTIAL) ? JSON.parse(readFileSync(PARTIAL, "utf8")) : null;
const minutes = resumed?.minutes ?? new Array(nx * ny).fill(null);
const doneBatches = resumed?.doneBatches ?? 0;
const batches = Math.ceil(points.length / BATCH);
console.log(`grid ${nx}x${ny}, sampling ${points.length} points in ${batches} batches` + (doneBatches ? `, resuming at ${doneBatches + 1}` : ""));

// One request for a set of targets. The server rejects a whole request if
// any single target is unroutable (no road within the cutoff, an island of
// road not connected to the shop, and so on), so on any routing error the
// set is split in half and retried until the offending points are isolated
// and marked null. Rate limits and server errors are retried as they are.
let requests = 0;
async function timesFor(chunk) {
  const body = {
    sources: [{ lat: SHOP.lat, lon: SHOP.lon }],
    targets: chunk.map(({ lat, lon }) => ({ lat, lon, search_cutoff: SEARCH_CUTOFF })),
    costing: "auto",
  };
  for (let attempt = 1; ; attempt++) {
    requests++;
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    await new Promise((r) => setTimeout(r, PAUSE_MS));
    const row = json.sources_to_targets?.[0];
    if (row) return row.map((cell) => (cell.time == null ? null : cell.time / 60));
    const transient = res.status === 429 || res.status >= 500 || !json.error_code;
    if (!transient) {
      if (chunk.length === 1) return [null];
      const half = Math.ceil(chunk.length / 2);
      return [...(await timesFor(chunk.slice(0, half))), ...(await timesFor(chunk.slice(half)))];
    }
    if (attempt === 6) throw new Error(`HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    console.log(`\n  retrying after HTTP ${res.status} ${json.error ?? ""}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}

for (let b = doneBatches; b < batches; b++) {
  const chunk = points.slice(b * BATCH, (b + 1) * BATCH);
  const times = await timesFor(chunk);
  times.forEach((t, k) => {
    const { i, j } = chunk[k];
    minutes[j * nx + i] = t == null ? null : Math.round(t * 10) / 10;
  });
  writeFileSync(PARTIAL, JSON.stringify({ doneBatches: b + 1, minutes }));
  console.log(`${b + 1}/${batches} (${requests} requests)`);
}

writeFileSync(
  new URL("./data/drive-times.json", import.meta.url),
  JSON.stringify({
    source: "Valhalla sources_to_targets (valhalla1.openstreetmap.de), costing auto, OpenStreetMap data",
    sampled: new Date().toISOString().slice(0, 10),
    shop: SHOP,
    grid: { ...GRID, nx, ny },
    searchCutoffMetres: SEARCH_CUTOFF,
    // Minutes from the shop, row-major from the north-west corner; null where
    // the point was not sampled or has no road within the search cutoff.
    minutes,
  }),
);
rmSync(PARTIAL);
const got = minutes.filter((m) => m != null);
console.log(`\nwrote scripts/data/drive-times.json: ${got.length} timed points, ${got.filter((m) => m <= 75).length} within 75 min`);
