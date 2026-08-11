/*
  Generates src/data/service-map.ts: the projected SVG geometry behind the
  "Where we work" map.

  This runs BY HAND, not as part of `npm run build` -- county lines do not
  move, so the output is committed and the site builds with no geo
  dependency and no network. Re-run it if the served counties or the map
  framing change:

      node scripts/build-service-map.mjs

  Source geometry is the U.S. Census Bureau's cartographic boundary files,
  repackaged as TopoJSON by us-atlas. Everything is projected here, at
  authoring time, into the Oregon Statewide Lambert grid -- the same
  projection the state's own GIS uses -- so the shapes on the page are a
  real map rather than a traced drawing.
*/
import { writeFileSync } from "node:fs";
import { geoConicConformal } from "d3-geo";
import { feature } from "topojson-client";
// The served counties come from the site's own list, not a copy of it, so
// the map cannot drift from the footer, the hero figure and the JSON-LD.
// Node strips the types on import (22.18+); no build step involved.
import { counties as SERVED_COUNTIES } from "../src/data/site.ts";

const SRC = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";

// Oregon Statewide Lambert (Oregon Coordinate Reference System): standard
// parallels 43°N / 45°30'N, central meridian 120°30'W, origin 41°45'N.
const projection = () =>
  geoConicConformal().parallels([43, 45.5]).rotate([120.5, 0]).center([0, 41.75]);

const OREGON_FIPS = "41";

// Shop. The one point marked on the map.
const BASE = { name: "Beaverton", lon: -122.8037, lat: 45.4871 };
const EARTH_MILES = 3958.7613;

/* The frame is the served counties' own extent, opened up by this much on
   each side. The slack is what makes the block read as a region inside
   Oregon rather than as a shape floating on its own: it is the room the
   neighbouring counties, the coastline and the Columbia need in order to
   show up at all.

   Wider than it is tall, and deliberately so. The served block runs
   north-south, so padding it evenly gives a portrait sheet that stands a
   full column taller than the county list beside it. Spending the slack
   sideways instead squares the page up and buys the two things actually
   worth showing out there: the coast to the west, the Cascades to the
   east. */
const CONTEXT = { lon: 0.3, lat: 0.1 };
const FRAME_WIDTH = 760;

/* ---------- geometry helpers ---------- */

// Douglas-Peucker, run AFTER projection so the tolerance is in screen pixels
// and the shapes stay accurate to the size they are actually drawn at.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const t2 = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let index = -1;
    let far = t2;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      let d;
      if (len === 0) {
        d = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        let u = ((px - ax) * dx + (py - ay) * dy) / len;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        d = (px - ax - u * dx) ** 2 + (py - ay - u * dy) ** 2;
      }
      if (d > far) {
        far = d;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const ringArea = (points) => {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return Math.abs(a / 2);
};

// Great-circle destination: [lon, lat] a given bearing and distance from a
// start point. Used for the scale bar, so it is measured on the sphere and
// only then projected.
function destination(lon, lat, bearingDeg, miles) {
  const rad = Math.PI / 180;
  const d = miles / EARTH_MILES;
  const b = bearingDeg * rad;
  const p1 = lat * rad;
  const l1 = lon * rad;
  const p2 = Math.asin(
    Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b),
  );
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2),
    );
  return [l2 / rad, p2 / rad];
}

const round = (n) => Math.round(n * 10) / 10;

/* Polygon | MultiPolygon -> "M...Z" in one path.

   Three passes trim this to what the page actually paints, because the raw
   10m geometry is tens of KB of coordinates and most of it is invisible:
     - `view` culls whole rings that fall outside the frame. Half of Oregon
       is off the east edge of the map; a ring nobody can see costs the same
       to download as one they can.
     - `tolerance` thins the survivors in screen pixels.
     - `minArea` drops offshore rocks and river islands, which otherwise
       render as dirt on the page. */
function toPath(geometry, project, { tolerance = 0.4, minArea = 4, view } = {}) {
  return rings(geometry, project)
    .filter((ring) => !view || intersects(ring, view))
    .map((ring) => simplify(ring, tolerance))
    .filter((ring) => ring.length >= 4 && ringArea(ring) >= minArea)
    .map(
      (ring) =>
        ring.map(([x, y], i) => `${i ? "L" : "M"}${round(x)} ${round(y)}`).join("") + "Z",
    )
    .join("");
}

// Every ring of a Polygon | MultiPolygon, projected, holes included.
function rings(geometry, project) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const out = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const projected = [];
      for (const coord of ring) {
        const p = project(coord);
        if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) projected.push(p);
      }
      if (projected.length >= 4) out.push(projected);
    }
  }
  return out;
}

// Bounding-box overlap against the frame. Conservative on purpose: a ring
// whose box straddles the frame is kept whole and the viewBox clips it, so
// culling can never eat a shape that is genuinely on screen.
function intersects(points, [x0, y0, x1, y1]) {
  const b = bbox(points);
  return b[2] >= x0 && b[0] <= x1 && b[3] >= y0 && b[1] <= y1;
}

function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function pointInRing([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToRing([px, py], ring) {
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    let u = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const d = Math.hypot(px - ax - u * dx, py - ay - u * dy);
    if (d < min) min = d;
  }
  return min;
}

/* ---------- label placement ---------- */

/*
  Where the county names go.

  The obvious answer, a centroid, is wrong here: Multnomah is a long
  east-west sliver and Clackamas trails a narrow arm into the Cascades, so
  their centroids sit near or outside their own borders and a name there
  crosses the boundary it is supposed to be naming. The better answer per
  county is the pole of inaccessibility -- the interior point furthest from
  any edge.

  That is still not enough on its own, because the counties are adjacent and
  the names are wider than some of the counties. Washington's pole and
  Multnomah's are 100 units apart with 240 units of type between them, so
  best-point-per-county lands "WASHINGTON" on top of "MULTNOMAH". So each
  county offers up many candidate points and they are placed one at a time,
  most-constrained county first, each name taking the roomiest spot still
  clear of the names and the furniture already down.

  This is why the placement lives in the generator and not in the component:
  it depends on the projected geometry and on how wide the type actually
  runs, and both are known here. The component just draws what it is given.
*/

// Oswald 600 uppercase, as drawn on the map: mean advance (~0.48em) plus the
// tracking the CSS applies. Measured off the rendered map rather than
// derived -- it only has to be close enough to keep two names from touching.
const EM_PER_CHAR = 0.6;

const labelBox = (x, y, text, fontSize) => {
  const w = text.length * fontSize * EM_PER_CHAR;
  // `y` is the SVG text baseline, not the box centre.
  return [x - w / 2, y - fontSize * 0.78, x + w / 2, y + fontSize * 0.25];
};

const boxesOverlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

const overlapArea = (a, b) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

// Interior points of one county, scored by distance to the nearest edge.
// Holes count as edges: a name must not sit in one.
function candidates(geometry, project, gridSteps = 46) {
  const all = rings(geometry, project);
  const outer = all.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
  const [x0, y0, x1, y1] = bbox(outer);
  const step = Math.max((x1 - x0) / gridSteps, (y1 - y0) / gridSteps, 0.5);
  const out = [];
  for (let x = x0; x <= x1; x += step) {
    for (let y = y0; y <= y1; y += step) {
      if (!pointInRing([x, y], outer)) continue;
      const d = Math.min(...all.map((ring) => distanceToRing([x, y], ring)));
      out.push({ x, y, clearance: d });
    }
  }
  return out.sort((a, b) => b.clearance - a.clearance);
}

/*
  `reserved` are the boxes the map furniture already owns -- the shop
  marker, the north arrow, the scale bar, the locator inset. County names
  route around them for the same reason they route around each other, and
  keeping them in one list means moving a piece of furniture in the
  component only means updating its box here.
*/
function placeLabels(features, project, { fontSize, frame, reserved }) {
  const pool = features.map((f) => ({
    name: f.properties.name,
    points: candidates(f.geometry, project),
  }));

  // Most-constrained county first: the one with the least interior room has
  // the fewest workable spots, so it should choose before the roomy ones
  // have taken anything.
  pool.sort((a, b) => (a.points[0]?.clearance ?? 0) - (b.points[0]?.clearance ?? 0));

  const placed = [...reserved];
  const result = new Map();

  for (const county of pool) {
    let best = null;
    for (const point of county.points) {
      const box = labelBox(point.x, point.y, county.name, fontSize);
      // Never let a name run off the sheet.
      if (box[0] < 4 || box[1] < 4 || box[2] > frame[0] - 4 || box[3] > frame[1] - 4) continue;
      const collision = placed.reduce((sum, other) => sum + overlapArea(box, other), 0);
      // Clear spot: take the first, which is the roomiest by sort order.
      if (collision === 0) {
        best = { ...point, box };
        break;
      }
      // Otherwise remember the least-bad, in case nothing is clear. Trading
      // clearance for overlap keeps a name from fleeing into a corner of its
      // own county just to dodge a few square units.
      const score = collision - point.clearance * 4;
      if (!best || score < best.score) best = { ...point, box, score, collision };
    }
    // Nothing fitted inside the sheet at all. Failing here is the point:
    // returning nothing would emit a county with no label, and the page
    // would crash on it at build time with no clue why.
    if (!best) {
      throw new Error(
        `no room on the sheet for "${county.name}" -- widen the frame, ` +
          `shrink TYPE.county, or move a piece of furniture`,
      );
    }
    placed.push(best.box);
    result.set(county.name, {
      x: round(best.x),
      y: round(best.y),
      clearance: round(best.clearance),
      crowded: Boolean(best.collision),
    });
  }
  return result;
}

/* ---------- build ---------- */

const topology = await fetch(SRC).then((r) => {
  if (!r.ok) throw new Error(`${SRC} -> HTTP ${r.status}`);
  return r.json();
});

const counties = feature(topology, topology.objects.counties).features.filter(
  (f) => String(f.id).startsWith(OREGON_FIPS),
);
const states = feature(topology, topology.objects.states).features;
const oregon = states.find((f) => f.id === OREGON_FIPS);
const neighbours = states.filter((f) => ["53", "16", "32", "06"].includes(String(f.id)));

if (counties.length !== 36) throw new Error(`expected 36 OR counties, got ${counties.length}`);

const byName = new Map(counties.map((f) => [f.properties.name, f]));
const served = SERVED_COUNTIES.map(({ name }) => {
  const f = byName.get(name);
  // A typo in site.ts would otherwise fail silently, as a county quietly
  // missing from the map while it still appears in every list on the page.
  if (!f) throw new Error(`site.ts names "${name}", which is not an Oregon county`);
  return f;
});
const isServed = new Set(served.map((f) => String(f.id)));

// Framing: the served counties' own lon/lat extent, opened up by CONTEXT.
const extent = (() => {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const f of served) {
    const polygons =
      f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const polygon of polygons) {
      for (const [lon, lat] of polygon[0]) {
        if (lon < west) west = lon;
        if (lon > east) east = lon;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
    }
  }
  const padLon = (east - west) * CONTEXT.lon;
  const padLat = (north - south) * CONTEXT.lat;
  return [west - padLon, south - padLat, east + padLon, north + padLat];
})();

/* The frame box, as sampled points along its edges rather than as a
   Polygon. Two reasons, both of which bite silently:
     - d3-geo reads GeoJSON polygons on the sphere, so a ring wound the
       wrong way is not the box but everything except the box, and the fit
       collapses to a point with no error.
     - A lon/lat rectangle projects to a curved quadrilateral under a conic.
       Its four corners under-cover the shape; the bulge in the middle of
       each edge is real, and fitting to the corners alone crops it. */
const box = {
  type: "MultiPoint",
  coordinates: (() => {
    const [west, south, east, north] = extent;
    const points = [];
    const STEPS = 24;
    for (let i = 0; i <= STEPS; i++) {
      const u = i / STEPS;
      const lon = west + (east - west) * u;
      const lat = south + (north - south) * u;
      points.push([lon, south], [lon, north], [west, lat], [east, lat]);
    }
    return points;
  })(),
};

// Measure the box's projected aspect, then size the frame to match it, so
// the fit binds on both axes. Fitting a frame chosen up front would centre
// the map inside slack on whichever axis did not bind.
const FRAME_HEIGHT = (() => {
  const probe = projection().fitWidth(1000, box);
  const [, y0, , y1] = bbox(box.coordinates.map((c) => probe(c)));
  return Math.round((FRAME_WIDTH * (y1 - y0)) / 1000);
})();

const detailProjection = projection().fitExtent(
  [
    [0, 0],
    [FRAME_WIDTH, FRAME_HEIGHT],
  ],
  box,
);
const detail = (coord) => detailProjection(coord);

/* Locator inset: the whole state, so a visitor can see which corner of
   Oregon the main map is a close-up of. `labelStrip` keeps the state off the
   bottom of the card, where its own name goes. */
const INSET = { width: 190, height: 145, pad: 7, labelStrip: 20 };
const insetProjection = projection().fitExtent(
  [
    [INSET.pad, INSET.pad],
    [INSET.width - INSET.pad, INSET.height - INSET.pad - INSET.labelStrip],
  ],
  oregon,
);
const inset = (coord) => insetProjection(coord);

// Cull box: the frame plus 8% slack. The slack is only there so a stroke
// centred on the frame edge still has geometry behind it -- culling is by
// bounding box, so anything genuinely on screen is kept whole regardless.
const SLACK = FRAME_WIDTH * 0.08;
const VIEW = [-SLACK, -SLACK, FRAME_WIDTH + SLACK, FRAME_HEIGHT + SLACK];

/* Map furniture. Laid out here rather than in the component because the
   county names have to route around it, and the placement pass needs real
   numbers to do that. The component reads these positions back out, so
   there is exactly one place that decides where the scale bar sits. */
/* Miles per unit on this sheet, measured off the projection rather than
   assumed: a conic projection's scale drifts with latitude, so this is the
   true figure at the shop, which is the middle of the served block. It ends
   up in the emitted data as the scale bar's step length. */
const PX_PER_MILE = (() => {
  const [x1, y1] = detail([BASE.lon, BASE.lat]);
  const [x2, y2] = detail(destination(BASE.lon, BASE.lat, 90, 10));
  return Math.round((Math.hypot(x2 - x1, y2 - y1) / 10) * 1000) / 1000;
})();

/* Sizes in map units. Smaller than they look: at 16 units, "WASHINGTON"
   runs about 96 units against roughly 84 units of clearance in Washington
   County, so the names now sit essentially inside the counties they name
   instead of sprawling a full word-width past the borders. That is what
   lets the labels drop their halo. */
const TYPE = { county: 16, base: 15, furniture: 13 };
const SCALE_STEP_MILES = 10;

const baseXY = detail([BASE.lon, BASE.lat]).map(round);
const furniture = {
  type: TYPE,
  north: { x: FRAME_WIDTH - 52, y: 46 },
  scale: {
    x: 34,
    y: FRAME_HEIGHT - 44,
    stepMiles: SCALE_STEP_MILES,
    step: round(PX_PER_MILE * SCALE_STEP_MILES),
  },
  locator: {
    x: FRAME_WIDTH - INSET.width - 24,
    y: FRAME_HEIGHT - INSET.height - 24,
  },
  // The shop's name hangs below its crosshair.
  baseLabelDy: 30,
};

/* What the county names must keep out of. Each is the furniture's drawn
   extent with a little air, in map units. */
const reserved = [
  // Shop crosshair plus its name.
  labelBox(baseXY[0], baseXY[1] + furniture.baseLabelDy, BASE.name, TYPE.base),
  [baseXY[0] - 18, baseXY[1] - 18, baseXY[0] + 18, baseXY[1] + 18],
  // North arrow and its "N".
  [furniture.north.x - 14, furniture.north.y - 24, furniture.north.x + 14, furniture.north.y + 34],
  // Scale bar, its end labels and the "20 MI" that overhangs the right end.
  [
    furniture.scale.x - 14,
    furniture.scale.y - 26,
    furniture.scale.x + furniture.scale.step * 2 + 34,
    furniture.scale.y + 12,
  ],
  // Locator inset, pasted over the map.
  [
    furniture.locator.x - 6,
    furniture.locator.y - 6,
    furniture.locator.x + INSET.width + 6,
    furniture.locator.y + INSET.height + 6,
  ],
];

const labels = placeLabels(served, detail, {
  fontSize: TYPE.county,
  frame: [FRAME_WIDTH, FRAME_HEIGHT],
  reserved,
});

const data = {
  base: { ...BASE, xy: baseXY },
  furniture,
  detail: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    // Neighbouring states carry the Columbia River: the north edge of the
    // map IS the Oregon/Washington line, and drawing Washington behind it
    // is what makes that edge read as a river instead of a crop.
    neighbours: neighbours
      .map((f) => toPath(f.geometry, detail, { tolerance: 0.6, minArea: 12, view: VIEW }))
      .filter(Boolean)
      .join(""),
    state: toPath(oregon.geometry, detail, { tolerance: 0.4, minArea: 12, view: VIEW }),
    // Unserved counties are background hairlines, so they are thinned twice
    // as hard as the ones that carry the answer.
    counties: counties
      .map((f) => {
        const id = String(f.id);
        const served = isServed.has(id);
        return {
          id,
          name: f.properties.name,
          served,
          d: toPath(f.geometry, detail, {
            tolerance: served ? 0.4 : 1.2,
            minArea: 6,
            view: VIEW,
          }),
          ...(served ? { label: labels.get(f.properties.name) } : {}),
        };
      })
      .filter((c) => c.d),
  },
  inset: {
    ...INSET,
    state: toPath(oregon.geometry, inset, { tolerance: 0.35, minArea: 3 }),
    served: served
      .map((f) => toPath(f.geometry, inset, { tolerance: 0.3, minArea: 0.5 }))
      .join(""),
    // The main map's frame, drawn on the state silhouette as a locator box.
    frame: (() => {
      const corners = [
        [0, 0],
        [FRAME_WIDTH, 0],
        [FRAME_WIDTH, FRAME_HEIGHT],
        [0, FRAME_HEIGHT],
      ].map(([x, y]) => inset(detailProjection.invert([x, y])).map(round));
      return corners.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("") + "Z";
    })(),
  },
};

const banner = `// GENERATED by scripts/build-service-map.mjs -- do not edit by hand.
// Source: U.S. Census Bureau cartographic boundaries via us-atlas, projected
// into Oregon Statewide Lambert. Re-run the script to change the served
// counties or the framing; see that file for why it is not part of the build.
`;

writeFileSync(
  new URL("../src/data/service-map.ts", import.meta.url),
  `${banner}export const serviceMap = ${JSON.stringify(data, null, 2)} as const;\n`,
);

console.log(
  `wrote src/data/service-map.ts (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`,
);
console.log(`frame ${FRAME_WIDTH}x${FRAME_HEIGHT}, ${data.detail.counties.length} counties drawn`);
for (const c of data.detail.counties.filter((c) => c.served)) {
  console.log(
    `  ${c.name.padEnd(11)} label ${String(c.label.x).padStart(6)},${String(c.label.y).padStart(6)}` +
      `  clearance ${String(c.label.clearance).padStart(5)}${c.label.crowded ? "  CROWDED" : ""}`,
  );
}
