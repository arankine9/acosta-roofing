/*
  Generates src/data/service-map.ts: the projected SVG geometry behind the
  "Where we work" map.

  The service area is a drive time, not a set of counties: everywhere in
  Oregon within 75 minutes of the Beaverton shop. The drive-time area itself
  is built from road-network isochrones by scripts/sample-drive-times.mjs and
  scripts/build-drive-area.mjs (committed in scripts/data/drive-area.json);
  this script cuts it to Oregon's own boundary, because the business is
  licensed in Oregon only and the reach would otherwise run north across the
  Columbia into Washington.

  This runs BY HAND, not as part of `npm run build`; the output is committed
  and the site builds with no geo dependency and no network. Re-run it if
  the drive time, the reference towns or the map framing change:

      node scripts/build-service-map.mjs

  Boundaries are the U.S. Census Bureau's cartographic boundary files,
  repackaged as TopoJSON by us-atlas. Everything is projected here, at
  authoring time, into the Oregon Statewide Lambert grid -- the same
  projection the state's own GIS uses -- so the shapes on the page are a
  real map rather than a traced drawing.
*/
import { readFileSync, writeFileSync } from "node:fs";
import { geoConicConformal } from "d3-geo";
import { contours } from "d3-contour";
import polygonClipping from "polygon-clipping";
import { feature } from "topojson-client";
// The county list beside the map is checked against the drive-time area on
// every run, so the list cannot quietly drift away from the map.
// Node strips the types on import (22.18+); no build step involved.
import { counties as LISTED_COUNTIES } from "../src/data/site.ts";

const SRC = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";
const DRIVE_AREA = JSON.parse(readFileSync(new URL("./data/drive-area.json", import.meta.url), "utf8"));

// The service area: this many minutes' drive from the shop, off-peak.
const DRIVE_MINUTES = DRIVE_AREA.minutes;

// Oregon Statewide Lambert (Oregon Coordinate Reference System): standard
// parallels 43°N / 45°30'N, central meridian 120°30'W, origin 41°45'N.
const projection = () =>
  geoConicConformal().parallels([43, 45.5]).rotate([120.5, 0]).center([0, 41.75]);

const OREGON_FIPS = "41";

// Shop. The one point marked with a crosshair.
const BASE = { name: "Beaverton", lon: DRIVE_AREA.shop.lon, lat: DRIVE_AREA.shop.lat };
const EARTH_MILES = 3958.7613;

/* The frame is the drive-time area's own extent, opened up by this much on
   each side, so the shape reads as a region inside Oregon: the coast to the
   west and the Columbia to the north need room to show. The north-south
   slack is also what sets the map's height, and the county plate beside it
   on the page stretches to that height, so it is kept generous enough that
   the map is always the taller of the two (ServiceArea.astro). */
const CONTEXT = { lon: 0.08, lat: 0.11 };
const FRAME_WIDTH = 760;

/* Generalization. A drive-time area follows every road out to its limit, so
   its raw edge is a fringe of one-road spikes with narrow notches between
   them, which reads as noise at map scale. The area is rasterised on a fine
   grid and closed by CLOSE_KM (grown by it, then shrunk back by it): notches
   narrower than twice that fill in solid, while tips and corridors keep
   their full reach -- Hood River sits right at the end of the I-84
   corridor, two minutes inside the line, and a blur alone rounds it away.
   A light blur of SMOOTH_KM then takes the grid's stair-steps off the edge. */
const RASTER_KM = 0.5;
const CLOSE_KM = 2.5;
const SMOOTH_KM = 0.7;

/* Pieces of the area smaller than this after the cut to Oregon are dropped:
   slivers along the river and the odd isolated sample read as dirt on the
   map, not as places. */
const MIN_PIECE_KM2 = 25;

/* Reference towns, in the order they get a label. Only towns inside the
   drive-time area are marked, and one that cannot be placed clear of the
   others is left off rather than crowded in, so the order is the priority:
   the anchors first, then towns that show how far the reach runs in each
   direction. The same list, all of it, is checked against the area on every
   run and the result printed, which is what the county list in site.ts is
   written from. Coordinates are town centres. */
const TOWNS = [
  // county, name, lon, lat
  ["Multnomah", "Portland", -122.6784, 45.5152],
  ["Marion", "Salem", -123.0351, 44.9429],
  // Below its dot: to either side the name would sit on the thin I-84
  // corridor, with the area's outline running through the letters.
  ["Hood River", "Hood River", -121.5215, 45.7054, "below"],
  ["Linn", "Albany", -123.1059, 44.6365],
  ["Yamhill", "McMinnville", -123.1987, 45.2101],
  ["Columbia", "St. Helens", -122.8065, 45.864],
  ["Clackamas", "Sandy", -122.2612, 45.3973],
  ["Marion", "Silverton", -122.7834, 45.0051],
  ["Polk", "Dallas", -123.317, 44.9193],
  ["Columbia", "Vernonia", -123.1926, 45.8587],
  ["Clackamas", "Estacada", -122.3337, 45.2896],
  ["Tillamook", "Tillamook", -123.844, 45.4562],
  ["Clatsop", "Seaside", -123.9226, 45.9932],
  ["Clackamas", "Government Camp", -121.7589, 45.304],
  ["Marion", "Stayton", -122.794, 44.8007],
  ["Linn", "Lebanon", -122.907, 44.5365],
  ["Benton", "Corvallis", -123.262, 44.5646],
  // Checked and reported, but never labelled on the sheet: too close to the
  // shop or to another town to carry a name at this scale.
  ["Washington", "Hillsboro", -122.9898, 45.5229, "list"],
  ["Washington", "Tigard", -122.7715, 45.4312, "list"],
  ["Washington", "Tualatin", -122.764, 45.384, "list"],
  ["Washington", "Sherwood", -122.8401, 45.3565, "list"],
  ["Washington", "Forest Grove", -123.1107, 45.5198, "list"],
  ["Washington", "Banks", -123.1143, 45.6187, "list"],
  ["Washington", "Gaston", -123.139, 45.4362, "list"],
  ["Multnomah", "Gresham", -122.431, 45.4983, "list"],
  ["Multnomah", "Troutdale", -122.3871, 45.5393, "list"],
  ["Multnomah", "Corbett", -122.2932, 45.5304, "list"],
  ["Clackamas", "Lake Oswego", -122.6706, 45.4207, "list"],
  ["Clackamas", "Oregon City", -122.6068, 45.3573, "list"],
  ["Clackamas", "West Linn", -122.6123, 45.3657, "list"],
  ["Clackamas", "Wilsonville", -122.7737, 45.2998, "list"],
  ["Clackamas", "Canby", -122.6926, 45.2629, "list"],
  ["Clackamas", "Molalla", -122.5768, 45.1476, "list"],
  ["Clackamas", "Welches", -121.9637, 45.3417, "list"],
  ["Columbia", "Scappoose", -122.8776, 45.7543, "list"],
  ["Columbia", "Rainier", -122.9357, 46.089, "list"],
  ["Columbia", "Clatskanie", -123.2068, 46.1015, "list"],
  ["Yamhill", "Newberg", -122.9732, 45.3001, "list"],
  ["Yamhill", "Dundee", -123.0101, 45.2782, "list"],
  ["Yamhill", "Carlton", -123.1765, 45.2943, "list"],
  ["Yamhill", "Sheridan", -123.3948, 45.0993, "list"],
  ["Yamhill", "Willamina", -123.4854, 45.0787, "list"],
  ["Polk", "Independence", -123.1868, 44.8512, "list"],
  ["Polk", "Monmouth", -123.234, 44.8485, "list"],
  ["Polk", "Falls City", -123.4368, 44.8665, "list"],
  ["Marion", "Keizer", -123.0262, 44.9901, "list"],
  ["Marion", "Woodburn", -122.8554, 45.1437, "list"],
  ["Marion", "Mt. Angel", -122.8001, 45.0679, "list"],
  ["Marion", "Aumsville", -122.8718, 44.841, "list"],
  ["Marion", "Mill City", -122.4787, 44.754, "list"],
  ["Marion", "Detroit", -122.1503, 44.734, "list"],
  ["Linn", "Jefferson", -123.0048, 44.719, "list"],
  ["Linn", "Scio", -122.849, 44.7065, "list"],
  ["Linn", "Sweet Home", -122.7359, 44.3976, "list"],
  ["Benton", "Philomath", -123.3676, 44.5401, "list"],
  ["Hood River", "Cascade Locks", -121.8906, 45.6698, "list"],
  ["Hood River", "Odell", -121.5431, 45.6273, "list"],
  ["Hood River", "Parkdale", -121.5953, 45.5207, "list"],
  ["Wasco", "The Dalles", -121.1787, 45.5946, "list"],
  ["Wasco", "Mosier", -121.3973, 45.684, "list"],
  ["Clatsop", "Astoria", -123.8313, 46.1879, "list"],
  ["Clatsop", "Cannon Beach", -123.9615, 45.8918, "list"],
  ["Tillamook", "Manzanita", -123.9351, 45.7187, "list"],
  ["Tillamook", "Pacific City", -123.9624, 45.2023, "list"],
  ["Lincoln", "Lincoln City", -124.0184, 44.9582, "list"],
].map(([county, name, lon, lat, option]) => ({
  county,
  name,
  lon,
  lat,
  label: option !== "list",
  // A side of the dot to try first, where the default order would put the
  // name somewhere worse.
  prefer: option === "list" ? undefined : option,
}));

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

/* ---------- drive-time area ---------- */

// Area of a lon/lat ring in km², on a local equirectangular plane. Plenty
// accurate for sorting pieces and measuring county coverage at this size.
function ringKm2(ring) {
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
  const kx = 111.32 * Math.cos(lat0);
  const ky = 110.57;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * kx * ring[i][1] * ky - ring[i][0] * kx * ring[j][1] * ky;
  }
  return Math.abs(a / 2);
}
const polygonKm2 = (polygon) => polygon.reduce((s, ring, k) => s + (k ? -1 : 1) * ringKm2(ring), 0);
const multiKm2 = (multi) => multi.reduce((s, p) => s + polygonKm2(p), 0);
const asMulti = (geometry) => (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates);

/*
  The drive-time area, generalised (see SMOOTH_KM) and cut to Oregon.

  Holes are filled. A hole inside the area is a pocket the road network
  doesn't reach -- a ridge of state forest, a stretch of the Gorge wall --
  which has nothing on it to roof, and punching it out would make the map
  say the shop won't drive somewhere it drives straight past.
*/
function driveTimeArea(oregon) {
  const outers = DRIVE_AREA.coordinates.map((polygon) => polygon[0]);

  // Raster over the area's extent plus room for the blur to spread.
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const ring of outers) {
    for (const [lon, lat] of ring) {
      west = Math.min(west, lon); east = Math.max(east, lon);
      south = Math.min(south, lat); north = Math.max(north, lat);
    }
  }
  const midLat = ((south + north) / 2) * (Math.PI / 180);
  const dLat = RASTER_KM / 110.57;
  const dLon = RASTER_KM / (111.32 * Math.cos(midLat));
  const pad = 2 * CLOSE_KM + 4 * SMOOTH_KM;
  west -= pad / (111.32 * Math.cos(midLat)); east += pad / (111.32 * Math.cos(midLat));
  south -= pad / 110.57; north += pad / 110.57;
  const nx = Math.ceil((east - west) / dLon);
  const ny = Math.ceil((north - south) / dLat);

  // Scanline fill: for each row, where the rings' edges cross its centre
  // line, sorted, gives the inside spans (even-odd).
  const mask = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const lat = north - (j + 0.5) * dLat;
    const xs = [];
    for (const ring of outers) {
      for (let k = 0, m = ring.length - 1; k < ring.length; m = k++) {
        const [x1, y1] = ring[m];
        const [x2, y2] = ring[k];
        if (y1 > lat !== y2 > lat) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - west) / dLon - 0.5));
      const i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - west) / dLon - 0.5));
      for (let i = i0; i <= i1; i++) mask[j * nx + i] = 1;
    }
  }

  // Closing: grow by CLOSE_KM, then shrink back by CLOSE_KM. Distances come
  // from a two-pass chamfer transform (3-4 weights, a close stand-in for
  // Euclidean distance at this scale), in cells.
  const distanceTo = (grid, target) => {
    const INF = 1e9;
    const d = new Float32Array(nx * ny);
    for (let k = 0; k < d.length; k++) d[k] = grid[k] === target ? 0 : INF;
    const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? INF : d[j * nx + i]);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        d[k] = Math.min(d[k], at(i - 1, j) + 3, at(i, j - 1) + 3, at(i - 1, j - 1) + 4, at(i + 1, j - 1) + 4);
      }
    }
    for (let j = ny - 1; j >= 0; j--) {
      for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i;
        d[k] = Math.min(d[k], at(i + 1, j) + 3, at(i, j + 1) + 3, at(i + 1, j + 1) + 4, at(i - 1, j + 1) + 4);
      }
    }
    for (let k = 0; k < d.length; k++) d[k] /= 3;
    return d;
  };
  const reach = CLOSE_KM / RASTER_KM;
  const toInside = distanceTo(mask, 1);
  const grown = new Float32Array(nx * ny);
  for (let k = 0; k < grown.length; k++) grown[k] = toInside[k] <= reach ? 1 : 0;
  const toOutside = distanceTo(grown, 0);
  const closed = new Float32Array(nx * ny);
  for (let k = 0; k < closed.length; k++) closed[k] = toOutside[k] > reach ? 1 : 0;
  // Nothing the raw area reached may be lost to the shrink step.
  for (let k = 0; k < closed.length; k++) if (mask[k]) closed[k] = 1;

  // Separable Gaussian blur, radius three sigma.
  const sigma = SMOOTH_KM / RASTER_KM;
  const radius = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, k) => Math.exp(-((k - radius) ** 2) / (2 * sigma * sigma)));
  const sum = kernel.reduce((p, q) => p + q, 0);
  const blur = (src, horizontal) => {
    const out = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let v = 0;
        for (let k = -radius; k <= radius; k++) {
          const ii = horizontal ? i + k : i;
          const jj = horizontal ? j : j + k;
          if (ii >= 0 && ii < nx && jj >= 0 && jj < ny) v += src[jj * nx + ii] * kernel[k + radius];
        }
        out[j * nx + i] = v / sum;
      }
    }
    return out;
  };
  const smooth = blur(blur(closed, true), false);

  // Re-trace at the halfway level; cell (i, j) is centred on (i + 0.5, j + 0.5).
  const [traced] = contours().size([nx, ny]).thresholds([0.5])(Array.from(smooth));
  const toLonLat = ([x, y]) => [west + (x - 0.5) * dLon, north - (y - 0.5) * dLat];
  const filled = traced.coordinates.map((polygon) => [polygon[0].map(toLonLat)]);

  const clipped = polygonClipping.intersection(filled, asMulti(oregon.geometry));
  return clipped
    .map((polygon) => [polygon[0]])
    .filter((polygon) => polygonKm2(polygon) >= MIN_PIECE_KM2)
    .sort((a, b) => polygonKm2(b) - polygonKm2(a));
}

function lonLatInside([lon, lat], multi) {
  return multi.some((polygon) => {
    const ring = polygon[0];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

/* ---------- town labels ---------- */

/*
  Each labelled town gets a dot and its name beside it. Names are placed one
  at a time in priority order, each trying the four sides of its dot and
  taking the first that is clear of the sheet edge, the furniture, every
  dot and every name already down. A town with no clear side is left off:
  the map is an illustration of the reach, and the list beside it is the
  record, so a missing name costs nothing and a collision costs legibility.
*/

// Oswald 500 uppercase, as drawn on the map: mean advance plus the tracking
// the CSS applies. Measured off the rendered map rather than derived -- it
// only has to be close enough to keep two names from touching.
const EM_PER_CHAR = 0.62;

const textBox = (x, y, text, fontSize, anchor) => {
  const w = text.length * fontSize * EM_PER_CHAR;
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  // `y` is the SVG text baseline, not the box centre.
  return [x0, y - fontSize * 0.78, x0 + w, y + fontSize * 0.25];
};

const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

function placeTowns(towns, project, { fontSize, frame, reserved }) {
  const GAP = 7;
  const dots = towns.map((t) => {
    const [x, y] = project([t.lon, t.lat]);
    return { ...t, x, y, dot: [x - 5, y - 5, x + 5, y + 5] };
  });
  const taken = [...reserved, ...dots.map((d) => d.dot)];
  const placed = [];
  for (const town of dots) {
    const sides = [
      { side: "right", anchor: "start", x: town.x + GAP, y: town.y + fontSize * 0.34 },
      { side: "left", anchor: "end", x: town.x - GAP, y: town.y + fontSize * 0.34 },
      { side: "above", anchor: "middle", x: town.x, y: town.y - GAP - 2 },
      { side: "below", anchor: "middle", x: town.x, y: town.y + GAP + fontSize * 0.8 },
    ].sort((a, b) => (b.side === town.prefer) - (a.side === town.prefer));
    const side = sides.find((s) => {
      const box = textBox(s.x, s.y, town.name, fontSize, s.anchor);
      const onSheet = box[0] > 6 && box[1] > 6 && box[2] < frame[0] - 6 && box[3] < frame[1] - 6;
      return onSheet && !taken.some((other) => other !== town.dot && overlaps(box, other));
    });
    if (!side) continue;
    taken.push(textBox(side.x, side.y, town.name, fontSize, side.anchor));
    placed.push({
      name: town.name,
      dot: [round(town.x), round(town.y)],
      label: { x: round(side.x), y: round(side.y), anchor: side.anchor },
    });
  }
  return placed;
}

/* ---------- build ---------- */

const topology = await fetch(SRC).then((r) => {
  if (!r.ok) throw new Error(`${SRC} -> HTTP ${r.status}`);
  return r.json();
});

const counties = feature(topology, topology.objects.counties).features.filter((f) =>
  String(f.id).startsWith(OREGON_FIPS),
);
const states = feature(topology, topology.objects.states).features;
const oregon = states.find((f) => f.id === OREGON_FIPS);
const neighbours = states.filter((f) => ["53", "16", "32", "06"].includes(String(f.id)));

if (counties.length !== 36) throw new Error(`expected 36 OR counties, got ${counties.length}`);

const area = driveTimeArea(oregon);
const areaGeometry = { type: "MultiPolygon", coordinates: area };
if (!lonLatInside([BASE.lon, BASE.lat], area)) throw new Error("the shop is outside its own service area");

// Framing: the area's own lon/lat extent, opened up by CONTEXT.
const extent = (() => {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const polygon of area) {
    for (const [lon, lat] of polygon[0]) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
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
// the fit binds on both axes.
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

// Cull box: the frame plus 8% slack, so a stroke centred on the frame edge
// still has geometry behind it.
const SLACK = FRAME_WIDTH * 0.08;
const VIEW = [-SLACK, -SLACK, FRAME_WIDTH + SLACK, FRAME_HEIGHT + SLACK];

/* Miles per unit on this sheet, measured off the projection at the shop:
   a conic projection's scale drifts with latitude. */
const PX_PER_MILE = (() => {
  const [x1, y1] = detail([BASE.lon, BASE.lat]);
  const [x2, y2] = detail(destination(BASE.lon, BASE.lat, 90, 10));
  return Math.round((Math.hypot(x2 - x1, y2 - y1) / 10) * 1000) / 1000;
})();

/* Sizes in map units, echoed into the data so the component's CSS can be
   compared against what the placement assumed. */
const TYPE = { town: 13, base: 15, furniture: 13 };
const SCALE_STEP_MILES = 10;

/* Map furniture. Laid out here because the town names route around it. The
   locator inset takes whichever bottom corner the area leaves emptier, and
   the scale bar takes the other. */
const baseXY = detail([BASE.lon, BASE.lat]).map(round);
const furniture = (() => {
  const insetBox = (x) => [x, FRAME_HEIGHT - INSET.height - 24, x + INSET.width, FRAME_HEIGHT - 24];
  const covered = (b) => {
    // Share of sample points in the box that land inside the area.
    let hits = 0, n = 0;
    for (let x = b[0]; x <= b[2]; x += 10) {
      for (let y = b[1]; y <= b[3]; y += 10) {
        n++;
        if (lonLatInside(detailProjection.invert([x, y]), area)) hits++;
      }
    }
    return hits / n;
  };
  const left = insetBox(24);
  const right = insetBox(FRAME_WIDTH - INSET.width - 24);
  const insetLeft = covered(left) < covered(right);
  const step = round(PX_PER_MILE * SCALE_STEP_MILES);
  return {
    type: TYPE,
    north: { x: FRAME_WIDTH - 52, y: 46 },
    scale: {
      x: insetLeft ? FRAME_WIDTH - 34 - step * 2 : 34,
      y: FRAME_HEIGHT - 44,
      stepMiles: SCALE_STEP_MILES,
      step,
    },
    locator: { x: (insetLeft ? left : right)[0], y: left[1] },
    // The shop's name hangs below its crosshair.
    baseLabelDy: 30,
  };
})();

const reserved = [
  // Shop crosshair plus its name.
  textBox(baseXY[0], baseXY[1] + furniture.baseLabelDy, BASE.name, TYPE.base, "middle"),
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

const townsInside = TOWNS.filter((t) => lonLatInside([t.lon, t.lat], area));
const towns = placeTowns(
  townsInside.filter((t) => t.label),
  detail,
  { fontSize: TYPE.town, frame: [FRAME_WIDTH, FRAME_HEIGHT], reserved },
);

const data = {
  drive: {
    minutes: DRIVE_MINUTES,
    source: DRIVE_AREA.source,
    built: DRIVE_AREA.built,
    areaSqMi: Math.round(multiKm2(area) / 2.58999),
  },
  base: { ...BASE, xy: baseXY },
  furniture,
  detail: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    // Neighbouring states carry the Columbia River: the north edge of the
    // area IS the Oregon/Washington line, and drawing Washington behind it
    // is what makes that edge read as a river instead of a crop.
    neighbours: neighbours
      .map((f) => toPath(f.geometry, detail, { tolerance: 0.6, minArea: 12, view: VIEW }))
      .filter(Boolean)
      .join(""),
    state: toPath(oregon.geometry, detail, { tolerance: 0.4, minArea: 12, view: VIEW }),
    // County lines are background hairlines now, context for the area
    // rather than the answer, so they are thinned harder.
    counties: counties
      .map((f) => toPath(f.geometry, detail, { tolerance: 0.9, minArea: 6, view: VIEW }))
      .filter(Boolean),
    // The union of isochrones carries road-by-road notches far finer than a
    // pixel at this size; thinning to about a unit keeps the outline true
    // and the file a fraction of the size.
    area: toPath(areaGeometry, detail, { tolerance: 1.1, minArea: 6 }),
    towns,
  },
  inset: {
    ...INSET,
    state: toPath(oregon.geometry, inset, { tolerance: 0.35, minArea: 3 }),
    area: toPath(areaGeometry, inset, { tolerance: 0.6, minArea: 0.5 }),
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
// Service area: Oregon within ${DRIVE_MINUTES} minutes' drive of the shop, from
// scripts/data/drive-area.json. Boundaries: U.S. Census Bureau via
// us-atlas, projected into Oregon Statewide Lambert. Re-run the script to
// change it; see that file for why it is not part of the build.
`;

writeFileSync(
  new URL("../src/data/service-map.ts", import.meta.url),
  `${banner}export const serviceMap = ${JSON.stringify(data, null, 2)} as const;\n`,
);

console.log(
  `wrote src/data/service-map.ts (${(JSON.stringify(data).length / 1024).toFixed(1)} KB), ` +
    `frame ${FRAME_WIDTH}x${FRAME_HEIGHT}, area ${data.drive.areaSqMi} sq mi in ${area.length} piece(s)`,
);
console.log(`labelled: ${towns.map((t) => t.name).join(", ")}`);
const skipped = townsInside.filter((t) => t.label && !towns.some((p) => p.name === t.name));
if (skipped.length) console.log(`no room to label: ${skipped.map((t) => t.name).join(", ")}`);

/* The report the county list in site.ts is written from: how much of each
   county the area covers, and which reference towns fall inside it. A listed
   county with no town inside, and a county with a town inside that the list
   leaves out, are flagged. */
console.log("\ncounty coverage (share of the county within the drive time):");
const listed = new Set(LISTED_COUNTIES.map((c) => c.name));
const coverage = counties
  .map((f) => {
    const inside = polygonClipping.intersection(asMulti(f.geometry), area);
    return { name: f.properties.name, share: multiKm2(inside) / multiKm2(asMulti(f.geometry)) };
  })
  .filter((c) => c.share > 0.005)
  .sort((a, b) => b.share - a.share);
for (const c of coverage) {
  const inTowns = townsInside.filter((t) => t.county === c.name).map((t) => t.name);
  // A county belongs on the list when a town in it is inside the line; how
  // much of its land is covered doesn't matter (Hood River is 3% by area and
  // still has two towns in reach).
  const flag = listed.has(c.name)
    ? inTowns.length ? "" : "  <- listed, but no town inside"
    : inTowns.length ? "  <- NOT LISTED" : "";
  console.log(`  ${c.name.padEnd(11)} ${(c.share * 100).toFixed(0).padStart(3)}%  ${inTowns.join(", ")}${flag}`);
}
const outside = TOWNS.filter((t) => !lonLatInside([t.lon, t.lat], area)).map((t) => t.name);
console.log(`\noutside the area: ${outside.join(", ")}`);
