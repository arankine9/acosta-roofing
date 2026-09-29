/*
  Builds scripts/data/drive-area.json: everywhere within DRIVE_MINUTES'
  drive of the Beaverton shop, as a lon/lat MultiPolygon. The service-area
  map (scripts/build-service-map.mjs) cuts it to Oregon and draws it.

  Runs BY HAND and rarely, after scripts/sample-drive-times.mjs; it queries a
  public routing server for a few minutes, so its output is committed:

      node scripts/build-drive-area.mjs

  Why it is built in pieces. The public Valhalla server caps an isochrone at
  60 minutes, and its matrix endpoint stops returning times past roughly
  100 km of road, which is exactly where the 75-minute line falls (Albany,
  Hood River, the coast road). So the area is assembled from isochrones that
  each stay inside those limits:

    - the 60-minute isochrone round the shop itself, and
    - for every relay point -- a sampled grid point RELAY_BAND minutes out
      from the shop, from scripts/data/drive-times.json -- the isochrone of
      whatever time is left, DRIVE_MINUTES minus its own drive time.

  Any drive of more than an hour passes through the relay band, and the
  relays sit on a ~3 km grid, so the union covers the 75-minute area. Every
  piece is a real drive through a real point, so the union can only
  understate the reach a little, never overstate it, which is the right way
  round for a service area.

  Isochrones are cached as they arrive (scripts/data/isochrones.partial.json)
  so an interrupted run picks up where it left off.
*/
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import polygonClipping from "polygon-clipping";

const ENDPOINT = "https://valhalla1.openstreetmap.de/isochrone";
const DRIVE_MINUTES = 75;
const SHOP_MINUTES = 60; // the server's isochrone ceiling
const RELAY_BAND = [50, 60];
const PAUSE_MS = 700;

const times = JSON.parse(readFileSync(new URL("./data/drive-times.json", import.meta.url), "utf8"));
const { grid, minutes, shop } = times;

const relays = [];
minutes.forEach((m, k) => {
  if (m == null || m < RELAY_BAND[0] || m >= RELAY_BAND[1]) return;
  const i = k % grid.nx;
  const j = Math.floor(k / grid.nx);
  relays.push({ lon: grid.west + i * grid.dLon, lat: grid.north - j * grid.dLat, left: DRIVE_MINUTES - m });
});

const jobs = [{ lon: shop.lon, lat: shop.lat, left: SHOP_MINUTES }, ...relays];
console.log(`${jobs.length} isochrones: the shop at ${SHOP_MINUTES} min, then ${relays.length} relays`);

const PARTIAL = new URL("./data/isochrones.partial.json", import.meta.url);
const cache = existsSync(PARTIAL) ? JSON.parse(readFileSync(PARTIAL, "utf8")) : {};
const keyOf = (j) => `${j.lon.toFixed(4)},${j.lat.toFixed(4)},${j.left.toFixed(1)}`;

async function isochrone({ lon, lat, left }) {
  const q = {
    locations: [{ lat, lon }],
    costing: "auto",
    contours: [{ time: Math.round(left * 10) / 10 }],
    polygons: true,
    denoise: 0.3,
    generalize: 120,
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${ENDPOINT}?json=${encodeURIComponent(JSON.stringify(q))}`);
    const json = await res.json().catch(() => ({}));
    await new Promise((r) => setTimeout(r, PAUSE_MS));
    const geometry = json.features?.[0]?.geometry;
    if (geometry) return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    // A relay the router can't start from contributes nothing; skip it.
    if (res.status === 400 && json.error_code) return [];
    if (attempt === 6) throw new Error(`HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    console.log(`  retrying after HTTP ${res.status} ${json.error ?? ""}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}

let done = 0;
for (const job of jobs) {
  const key = keyOf(job);
  if (!(key in cache)) {
    cache[key] = await isochrone(job);
    writeFileSync(PARTIAL, JSON.stringify(cache));
  }
  if (++done % 25 === 0 || done === jobs.length) console.log(`${done}/${jobs.length}`);
}

// Union in rounds of pairs rather than one long fold, which keeps each
// operation small and the whole thing quick.
let pieces = jobs.map((j) => cache[keyOf(j)]).filter((p) => p.length);
while (pieces.length > 1) {
  const next = [];
  for (let k = 0; k < pieces.length; k += 2) {
    next.push(k + 1 < pieces.length ? polygonClipping.union(pieces[k], pieces[k + 1]) : pieces[k]);
  }
  pieces = next;
}

writeFileSync(
  new URL("./data/drive-area.json", import.meta.url),
  JSON.stringify({
    source: "Valhalla isochrones (valhalla1.openstreetmap.de), costing auto, OpenStreetMap data",
    built: new Date().toISOString().slice(0, 10),
    shop,
    minutes: DRIVE_MINUTES,
    relays: relays.length,
    // lon/lat MultiPolygon, not yet cut to Oregon. Four decimal places is
    // about 10 m, far finer than the map draws.
    coordinates: pieces[0].map((polygon) =>
      polygon.map((ring) => ring.map(([lon, lat]) => [+lon.toFixed(4), +lat.toFixed(4)])),
    ),
  }),
);
rmSync(PARTIAL);
console.log(`wrote scripts/data/drive-area.json: ${pieces[0].length} polygon(s)`);
