/**
 * build-scene.mjs
 *
 * Converts the raw Overpass API dump of the Mirpur 10 -> Mirpur 11 corridor
 * into a compact scene description the browser can load in one fetch.
 *
 * Input:  data/mirpur.osm.json   (Overpass JSON, ~10 MB)
 * Output: public/scene.json      (compact, ~2-3 MB)
 *
 * Everything is projected from WGS84 into a local metric plane centred on the
 * midpoint between the two stations, so 1 unit == 1 metre in the game world.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
// --in <file>              input Overpass JSON dump (default data/mirpur.osm.json)
// --out <file>             output scene JSON (default public/scene.json)
// --origin auto            no-op, accepted for documentation only: the origin
//                           always stays LAT0/LON0 below (see P2-E8-NORTH-DATA
//                           brief: "do NOT recentre" so existing station
//                           coordinates baked into src/ stay valid).
// --radius <metres>        distance from the playable corridor considered
//                           playable (walk/drive). Default 400 m per
//                           docs/DECISION-PLAYABLE-AREA.md. Anything beyond
//                           RADIUS + 600 m of fog range (KEEP_RADIUS) is
//                           dropped entirely; buildings between RADIUS and
//                           KEEP_RADIUS are kept but tagged far:1 so the
//                           runtime can skip rooftop props, emissive windows
//                           and shadows on them.
// --metro-start <name>     station name (English) that starts the metro clip
//                           (default "Mirpur 10")
// --metro-end <name>       station name that ends the metro clip
//                           (default "Mirpur 11")
// --stations <a,b,c,...>   whitelist of station names to keep in the output
//                           and to use for the metro clip range. Omit to keep
//                           legacy behaviour (every railway=station/stop node
//                           found in the extract, which for the small
//                           mirpur.osm.json extract is only the two corridor
//                           stations anyway).
// --extra-corridors <a,b>  extra named arterial-road corridors (besides the
//                           metro) to fold into the playable-radius cull, by
//                           key into CORRIDOR_WAY_IDS below. Omit for legacy
//                           single-corridor (metro-only) behaviour.
const cliArgs = process.argv.slice(2);
function flag(name, def) {
  const i = cliArgs.indexOf(name);
  return i >= 0 && cliArgs[i + 1] !== undefined ? cliArgs[i + 1] : def;
}

const IN = resolve(ROOT, flag('--in', 'data/mirpur.osm.json'));
const OUT = resolve(ROOT, flag('--out', 'public/scene.json'));

// --heights <file>   optional side-table of real, satellite-measured heights
//                     produced by tools/fetch-heights.mjs (Google Open
//                     Buildings 2.5D Temporal). Absent -> today's behaviour
//                     exactly, so the repo still builds with no network
//                     access. See buildingHeight() below for where this
//                     slots into the source priority order.
const HEIGHTS_FILE = flag('--heights', null);
const RASTER_HEIGHTS = HEIGHTS_FILE
  ? JSON.parse(readFileSync(resolve(ROOT, HEIGHTS_FILE), 'utf8')).heights
  : null;
if (RASTER_HEIGHTS) {
  console.log(`Loaded ${Object.keys(RASTER_HEIGHTS).length} raster heights from ${HEIGHTS_FILE}`);
}

const METRO_START = flag('--metro-start', 'Mirpur 10');
const METRO_END = flag('--metro-end', 'Mirpur 11');
const STATION_WHITELIST = (() => {
  const v = flag('--stations', null);
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null;
})();
const EXTRA_CORRIDOR_KEYS = (() => {
  const v = flag('--extra-corridors', null);
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
})();

let RADIUS = 400;
{
  const v = parseFloat(flag('--radius', '400'));
  if (Number.isFinite(v) && v > 0) RADIUS = v;
}
const KEEP_RADIUS = RADIUS + 600;
const ROAD_KEEP_DIST = RADIUS + 50; // roads: drop only if EVERY point is beyond this

// --road-front <metres>    road-frontage cull (Pass 6b): drop buildings whose
//                           whole footprint sits farther than this from every
//                           kept road centreline -- deep-block infill the
//                           player can never see from the street. 0 disables.
// --road-front-tall <m>    height exemption: buildings at or above this stay
//                           even when they fail the frontage test, so the
//                           skyline behind the front row survives. 0 disables.
let ROAD_FRONT = 30;
{
  const v = parseFloat(flag('--road-front', '30'));
  if (Number.isFinite(v) && v >= 0) ROAD_FRONT = v;
}
let ROAD_FRONT_TALL = 25;
{
  const v = parseFloat(flag('--road-front-tall', '25'));
  if (Number.isFinite(v) && v >= 0) ROAD_FRONT_TALL = v;
}

// ---------------------------------------------------------------------------
// Extra arterial-road corridors (P2-E8, north extension)
// ---------------------------------------------------------------------------
// Way ids for the two arterial chains identified by inspecting
// data/north.osm.json (see docs/NORTH-DATA.md for how these were found and
// verified against the raw way names/coordinates). Each chain runs from the
// Mirpur 10 circle outward; ordering within the array does not matter since
// every way just contributes its own segments to the shared corridor grid.
const CORRIDOR_WAY_IDS = {
  // West arm: Mirpur 10 -> Mirpur 2 -> Mirpur 1 (Gol Chattar).
  // "Main Road" (x2, dual carriageway near the Mirpur 10 circle) ->
  // "Mirpur 10 Road" (x5) -> "Mirpur 1 Gol Chattar" spur, plus the short
  // "Mirpur 2 Road" spur off the same junction.
  west: [
    155988492, 349875111, // Main Road (Mirpur 10 circle -> Mirpur 2 junction)
    344960257, 349875112, 700096555, 344960258, 349876983, // Mirpur 10 Road
    24402401, // Mirpur 2 Road (spur)
    1300893956, // Mirpur 1 Gol Chattar
  ],
  // East arm: Mirpur 10 -> Mirpur 13 -> Mirpur 14 -> Kachukhet.
  // "Mirpur Road -13" / "মিরপুর রোড-১৩" -> "মিরপুর রোড-১৪" / "Mirpur road-14"
  // -> "Mirpur Road No.14" (x3, near-duplicate segments) plus the long
  // parallel carriageway "মিরপুর ১৪" covering the same route.
  east: [
    677364481, 19978190, // Mirpur Road -13 / মিরপুর রোড-১৩
    344957948, 344958165, // মিরপুর রোড-১৪ / Mirpur road-14
    700081596, 450729242, 19977903, 1219669566, // Mirpur Road No.14
    677364030, // মিরপুর ১৪ (long parallel carriageway, same route)
  ],
  // --- Bijoy Sarani district (P12, the metro-teleport map) -------------------
  // The Sangsad Bhaban complex sits ~460 m west of the MRT alignment on
  // Rokeya Sarani, i.e. just OUTSIDE the 400 m metro-only playable radius.
  // Without these three chains the National Parliament House — the entire
  // reason this district exists — would be culled as off-corridor data.
  // Way ids read out of data/bijoy.osm.json; see docs/BIJOY-DATA.md.
  //
  // Manik Mia Avenue: the south frontage of Sangsad Bhaban, and the angle
  // every photograph of the building is taken from.
  manikmia: [
    167533249, 506695204, 1104366809,
    1148288326, 1148288327, 1148288328,
    1341259197, 1341259199, 1341259200, 1341259201,
  ],
  // Lake Road: the north side of the complex, along Crescent Lake.
  lakeroad: [15491652],
  // Bijoy Sarani (the road): east from the station to the Old Airport Road.
  bijoysarani: [15491645, 1126771717, 1126771718, 1126771719],
  // Syed Mahbub Morshed Avenue + Agargaon Link Road: the west-east pair that
  // ties Agargaon station into the same playable band.
  agargaon: [
    337959100, 566490697, 1070305234, 1136215453, // Syed Mahbub Morshed Avenue
    141821926, 141821930, // Agargaon Link Road
  ],
};

// ---------------------------------------------------------------------------
// Station name corrections
// ---------------------------------------------------------------------------
// OSM's `name:en` is authoritative for everything else in this pipeline, but
// a handful of MRT Line 6 nodes carry transliteration typos upstream. The
// game's station names are baked into src/ (signs, ride gates, district
// registry), so they are normalised here — at the one place that reads the
// tag — rather than being worked around in each consumer.
const STATION_RENAME = {
  'Bijoy Sarawni': 'Bijoy Sarani', // OSM node 10294553601, typo in name:en
};

// ---------------------------------------------------------------------------
// Local metric projection (equirectangular, sub-metre accurate over ~2 km)
// ---------------------------------------------------------------------------

// Midpoint of Mirpur 10 (23.80836, 90.36826) and Mirpur 11 (23.81910, 90.36528).
const LAT0 = 23.8137;
const LON0 = 90.3668;

const M_PER_DEG_LAT = 111320.0;
const M_PER_DEG_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180); // ~101853 m/deg

/** lat/lon -> [x, z] in metres. +X is east, -Z is north (Three.js convention). */
function project(lat, lon) {
  return [(lon - LON0) * M_PER_DEG_LON, -(lat - LAT0) * M_PER_DEG_LAT];
}

// ---------------------------------------------------------------------------
// Deterministic per-feature randomness
// ---------------------------------------------------------------------------

/** Hash an OSM id into a stable float in [0,1) so the city looks the same every load. */
function rand(id, salt = 0) {
  let h = (id ^ (salt * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Shoelace area of a closed ring of [x,z] points, in m^2. */
function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a) / 2;
}

/** Signed area; positive means counter-clockwise in our XZ frame. */
function signedArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return a / 2;
}

/** Drop the duplicated closing vertex and any zero-length edges (earcut hates both). */
function cleanRing(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) continue;
    out.push(p);
  }
  while (
    out.length > 1 &&
    Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-6 &&
    Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-6
  ) {
    out.pop();
  }
  return out;
}

/** Centroid of a ring. */
function centroid(pts) {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}

// ---------------------------------------------------------------------------
// Building height model
//
// Only 506 of 14,738 buildings in this extract carry building:levels, and just
// 2 carry an explicit height. Everything else has to be inferred. The rules
// below are tuned for Mirpur specifically: a dense mix of 5-8 storey RCC
// residential blocks along the main roads, 2-4 storey brick housing in the
// interior lanes, and single-storey tin-roof structures in the bastee pockets.
// ---------------------------------------------------------------------------

const FLOOR_H = 3.05; // metres per storey, typical Dhaka RCC construction
const PARAPET = 1.1; // roof parapet wall, near universal here

/** Explicit levels by building tag, where the tag is meaningful. */
const LEVELS_BY_TYPE = {
  hut: 1,
  shed: 1,
  garage: 1,
  garages: 1,
  roof: 1,
  carport: 1,
  kiosk: 1,
  toilets: 1,
  service: 1,
  greenhouse: 1,
  industrial: 1,
  warehouse: 1,
  farm_auxiliary: 1,
  house: 2,
  detached: 2,
  bungalow: 1,
  retail: 3,
  commercial: 5,
  office: 6,
  apartments: 6,
  residential: 5,
  dormitory: 5,
  hotel: 6,
  school: 3,
  college: 4,
  university: 5,
  hospital: 6,
  civic: 3,
  government: 4,
  public: 3,
  train_station: 2,
  mosque: 1,
  religious: 1,
  temple: 1,
  church: 1,
  construction: 4,
  stadium: 2,
};

/** Parse OSM height strings like "24", "24 m", "24m". */
function parseHeight(v) {
  if (!v) return null;
  const m = String(v).match(/^\s*([\d.]+)\s*m?\s*$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 1 && n < 200 ? n : null;
}

/**
 * Decide a building's height in metres.
 * Returns { height, levels, source } where source is
 * 'tag' | 'levels' | 'raster' | 'inferred'.
 */
function buildingHeight(tags, area, id, nearMainRoad) {
  const explicit = parseHeight(tags.height);
  if (explicit) return { height: explicit, levels: Math.max(1, Math.round(explicit / FLOOR_H)), source: 'tag' };

  const lv = parseInt(tags['building:levels'], 10);
  if (Number.isFinite(lv) && lv >= 1 && lv <= 60) {
    return { height: lv * FLOOR_H + PARAPET, levels: lv, source: 'levels' };
  }

  // Real, satellite-measured height from Google Open Buildings 2.5D Temporal
  // (see tools/fetch-heights.mjs), when available. This replaces guesswork
  // for ~96-97% of this extract's buildings, so it sits ahead of the
  // footprint-area heuristic below. Snap to whole storeys so the rest of the
  // engine's floor/window/facade logic (which assumes FLOOR_H-spaced
  // storeys) stays consistent -- the raw raster metres are otherwise
  // off-grid. Deliberately skip the nearMainRoad commercial-frontage bump
  // and the deterministic jitter applied to 'inferred' below: those exist
  // only to fake variety into a guess, and this is no longer a guess.
  //
  // Estimator choice (tools/calibrate-heights.mjs, fitted 2026-09-07 against
  // 1823 pooled building:levels ground-truth labels across both extracts,
  // 5-fold cross-validated):
  //
  //   The naive choice -- p75 of in-footprint pixels, this file's original
  //   wiring -- systematically compresses tall buildings toward the mean
  //   (CV MAE 1.84 storeys, -2.3 storey bias in the 7-9 floor band, -1.7 in
  //   10+). A linear or two-term (percentile + log footprint area) OLS
  //   calibration lowers overall MAE further (to ~1.61-1.66) but makes the
  //   *tall-building* compression WORSE, not better (10+ band bias -3.0 to
  //   -4.8 storeys): least-squares fitting pulls coefficients toward the
  //   bulk of the label set (673/1823 labels are 5-6 storey mid-rise), which
  //   is regression-to-the-mean reproducing exactly the flattening this
  //   estimator exists to fix, just with a better-looking average.
  //
  //   The raw, UNCALIBRATED max-height-in-footprint statistic has the best
  //   tall-building fidelity of every candidate tested (7-9 band bias -1.18
  //   storeys, 10+ band bias -0.14 -- both comfortably the smallest), zero
  //   overall bias, and a CV MAE of 1.766 storeys -- only ~0.15 worse than
  //   the best (but skyline-flattening) fitted model, and clearly ahead of
  //   the p75 default it replaces and the old area heuristic (MAE 1.99,
  //   pooled). No fitted parameters means nothing here to overfit, either.
  //   See tools/calibrate-heights.mjs's own comments for the full candidate
  //   table and the tall-band-bias selection rule.
  //
  // Caveat carried over honestly from that analysis: buildings with a
  // building:levels tag are the training/validation labels AND keep
  // priority over the raster right here, so this validation set is not a
  // random sample of the untagged population this estimator actually
  // predicts for -- it over-represents mid-rise buildings. Checked against
  // just the small-footprint (below-median-area) half of the label set,
  // which looks more like the untagged population: MAE is close to a wash
  // with the old heuristic (1.70 vs 1.68) but bias is far better controlled
  // (-0.09 vs +0.51 storeys) -- see the calibration tool's "small-footprint
  // check" output.
  const RASTER_SANITY_MIN = 2.5; // metres; below this, a raster reading is noise, not a building
  const RASTER_SANITY_MAX = 100; // metres; the dataset's own stated height cap
  if (RASTER_HEIGHTS) {
    const rec = RASTER_HEIGHTS[String(id)];
    if (rec !== undefined) {
      const raw = Math.max(RASTER_SANITY_MIN, Math.min(RASTER_SANITY_MAX, rec.max));
      let levels = Math.max(1, Math.min(60, Math.round((raw - PARAPET) / FLOOR_H)));
      if (levels === 1) return { height: 2.9 + rand(id, 11) * 0.9, levels: 1, source: 'raster' };
      return { height: levels * FLOOR_H + PARAPET, levels, source: 'raster' };
    }
  }

  const type = tags.building;
  let levels = LEVELS_BY_TYPE[type];

  if (levels === undefined) {
    // building=yes and friends: infer from footprint size.
    if (area < 35) levels = 1; // tin shed / bastee structure
    else if (area < 70) levels = 3;
    else if (area < 130) levels = 5;
    else if (area < 260) levels = 6;
    else if (area < 600) levels = 7;
    else levels = 8;
  }

  // Frontage on an arterial pushes buildings taller: commercial pressure.
  if (nearMainRoad && levels >= 3) levels += 1;

  // Deterministic jitter so the skyline is jagged rather than terraced.
  const r = rand(id, 7);
  if (levels >= 4) levels += r < 0.22 ? -1 : r > 0.8 ? 2 : r > 0.55 ? 1 : 0;
  else if (levels >= 2) levels += r > 0.7 ? 1 : 0;

  levels = Math.max(1, Math.min(22, levels));

  // Single-storey tin structures are short and have no parapet.
  if (levels === 1) return { height: 2.9 + rand(id, 11) * 0.9, levels: 1, source: 'inferred' };

  return { height: levels * FLOOR_H + PARAPET, levels, source: 'inferred' };
}

// ---------------------------------------------------------------------------
// Road model
// ---------------------------------------------------------------------------

const ROAD_WIDTH = {
  motorway: 16,
  trunk: 15,
  primary: 24,
  primary_link: 8,
  secondary: 11,
  secondary_link: 7,
  tertiary: 9,
  tertiary_link: 6,
  unclassified: 6,
  residential: 5.5,
  living_street: 4.5,
  service: 3.6,
  pedestrian: 5,
  footway: 2.2,
  path: 1.8,
  steps: 1.8,
  track: 3,
};

// Per-class floor on the *derived* width (from a `width` or `lanes` tag),
// metres. This is not "what the class usually looks like" -- ROAD_WIDTH
// above already covers that as the untagged fallback. It exists only so a
// 1-lane primary/secondary/tertiary way doesn't collapse to something the
// game car can't turn around in, and so a real hairline access lane
// (residential/service) still reads as a driveable street rather than a
// footpath. Deliberately below the ROAD_WIDTH fallback for every class:
// the fallback is tuned for the *typical* untagged way, the floor is just
// the "don't go below this" backstop for the atypical tagged outlier.
const ROAD_WIDTH_FLOOR = {
  motorway: 9,
  trunk: 8,
  primary: 8,
  primary_link: 5,
  secondary: 7,
  secondary_link: 4.5,
  tertiary: 6,
  tertiary_link: 4.5,
  unclassified: 4.5,
  residential: 4.5,
  living_street: 3.6,
  service: 3,
  // pedestrian/footway/path/steps/track: no lanes tag ever applies here in
  // practice, so no floor beyond the class constant itself is needed.
};

// Per-class ceiling on the *derived* width. Found necessary empirically:
// way 374514945 ("Line 12", highway=residential) carries width="25" --
// wider than a 6-7 lane highway, on a street tagged lane_markings=no. That
// is a bad tag (typo, or a value copied from the wrong field), not a real
// 25 m residential street, and treating a `width` tag as unconditionally
// authoritative made this one case paint MORE road over buildings than the
// old flat 5.5 m constant did. `lanes` is a small integer and much harder
// to fat-finger into nonsense, but it gets the same ceiling for safety and
// consistency. Set per class at roughly what the widest *genuine* example
// of that class should plausibly be in this corridor (comfortably above
// ROAD_WIDTH's own fallback, so real tagged data is never clipped -- see
// the roadWidth() comment for why fallback values themselves are exempt).
const ROAD_WIDTH_CEIL = {
  motorway: 24,
  trunk: 22,
  primary: 30,
  primary_link: 12,
  secondary: 16,
  secondary_link: 10,
  tertiary: 13,
  tertiary_link: 9,
  unclassified: 9,
  residential: 9,
  living_street: 7,
  service: 6,
  pedestrian: 8,
  footway: 4,
  path: 3,
  steps: 3,
  track: 5,
};

// Lane width for a lanes-tag-derived road width. Dhaka arterials run
// noticeably narrower lanes than the ~3.65 m US highway-lane standard --
// 3.0-3.2 m is realistic for local traffic, so split the difference.
const LANE_WIDTH = 3.1;

// Added on top of lanes * LANE_WIDTH: kerb, painted shoulder, informal
// parking/hawker encroachment -- present even on a "just the carriageway"
// lanes count, and larger on the classes that carry more of that traffic.
const LANE_MARGIN = {
  motorway: 2.5,
  trunk: 2.5,
  primary: 2.5,
  primary_link: 1.5,
  secondary: 2,
  secondary_link: 1.5,
  tertiary: 1.5,
  tertiary_link: 1,
  unclassified: 1,
  residential: 1,
  living_street: 0.5,
  service: 0.5,
};

/** Parse an OSM `width` tag: "12", "12 m", "12m" -- same shape as parseHeight. */
function parseWidth(v) {
  if (!v) return null;
  const m = String(v).match(/^\s*([\d.]+)\s*m?\s*$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 1 && n < 60 ? n : null;
}

/**
 * Derive a road's paved width in metres, in priority order:
 *   1. an explicit `width` tag (rare, but authoritative when present),
 *   2. `lanes` (or lanes:forward + lanes:backward) times a Dhaka-scale
 *      lane width plus a class margin,
 *   3. the flat per-class ROAD_WIDTH fallback used when OSM has neither.
 * A per-class floor keeps (1) and (2) from ever producing something the
 * car can't drive or turn around on, no matter how thin the tag is; a
 * per-class ceiling keeps a mistagged outlier from doing the opposite.
 * `lanes` is the OSM convention of *total* lanes across both directions
 * for a bidirectional way, so it is used as-is, not doubled.
 * The flat ROAD_WIDTH fallback (3) is untouched by either bound -- it is
 * hand-tuned already and this function only reasons about tag-derived
 * numbers, which is where the untrustworthy data lives.
 *
 * `lanes` is trustworthy on arterials and misleading on residential streets
 * in this city, so (2) is skipped for `residential`/`living_street`.
 * Measured on Mirpur 1: applying lanes-derivation there took the flat 5.5 m
 * class constant to 7.2 m for `lanes=2` and manufactured 29 new >2 m
 * building/road intrusions that didn't exist before (the untouched 5.5 m
 * fallback still accounts for 57 separate, pre-existing intrusions -- a
 * different problem, genuine OSM footprint/centreline disagreement, not
 * something width-tuning fixes). A Dhaka residential lane tagged `lanes=2`
 * is typically a narrow street where the two "lanes" are nominal -- cars
 * pass with care, not 3.1 m of dedicated width each -- so the hand-tuned
 * class constant models it better than the lane count does. Arterials are
 * the opposite: lane counts there track real carriageway width, which is
 * why lanes-derivation stays enabled for primary/secondary/tertiary/trunk/
 * unclassified/service. A `width` tag remains authoritative (and clamped
 * by the ceiling below) for residential/living_street either way -- that
 * clamp is what catches a bad tag like the `width=25` case above.
 */
function roadWidth(cls, tags, fallback) {
  const floor = ROAD_WIDTH_FLOOR[cls] ?? 0;
  const ceil = ROAD_WIDTH_CEIL[cls] ?? Infinity;
  const clamp = (v) => Math.min(ceil, Math.max(floor, v));

  const tagged = parseWidth(tags.width);
  if (tagged) return clamp(tagged);

  if (cls === 'residential' || cls === 'living_street') return fallback;

  let lanes = parseInt(tags.lanes, 10);
  if (!(Number.isFinite(lanes) && lanes > 0)) {
    const fwd = parseInt(tags['lanes:forward'], 10);
    const back = parseInt(tags['lanes:backward'], 10);
    const sum = (Number.isFinite(fwd) ? fwd : 0) + (Number.isFinite(back) ? back : 0);
    if (sum > 0) lanes = sum;
  }
  if (Number.isFinite(lanes) && lanes > 0) {
    const margin = LANE_MARGIN[cls] ?? 1;
    return clamp(lanes * LANE_WIDTH + margin);
  }

  return fallback;
}

/** Rank drives draw order, sidewalk generation and streetlight placement. */
const ROAD_RANK = {
  motorway: 5, trunk: 5, primary: 4, primary_link: 4,
  secondary: 3, secondary_link: 3, tertiary: 3, tertiary_link: 3,
  unclassified: 2, residential: 2, living_street: 2, service: 1,
  pedestrian: 1, footway: 0, path: 0, steps: 0, track: 1,
};

// ---------------------------------------------------------------------------
// Load and index
// ---------------------------------------------------------------------------

console.log('Reading', IN);
const raw = JSON.parse(readFileSync(IN, 'utf8'));
const elements = raw.elements;

const nodes = new Map();
const ways = new Map();
const relations = [];

for (const el of elements) {
  if (el.type === 'node') nodes.set(el.id, el);
  else if (el.type === 'way') ways.set(el.id, el);
  else if (el.type === 'relation') relations.push(el);
}

console.log(`  ${nodes.size} nodes, ${ways.size} ways, ${relations.length} relations`);

/** Way id -> array of projected [x,z]. Returns null if any node is missing. */
function wayPoints(way) {
  const pts = [];
  for (const nid of way.nodes) {
    const n = nodes.get(nid);
    if (!n) return null;
    pts.push(project(n.lat, n.lon));
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Pass 1: roads (needed before buildings, to test arterial frontage)
// ---------------------------------------------------------------------------

const roads = [];
const arterialSegments = []; // [x1,z1,x2,z2] of rank >= 3 roads

for (const way of ways.values()) {
  const t = way.tags;
  if (!t || !t.highway) continue;
  const cls = t.highway;
  const width = ROAD_WIDTH[cls];
  if (width === undefined) continue;

  const pts = wayPoints(way);
  if (!pts || pts.length < 2) continue;

  const rank = ROAD_RANK[cls] ?? 1;
  const w = roadWidth(cls, t, width);

  roads.push({
    id: way.id,
    cls,
    rank,
    w: +w.toFixed(2),
    name: t['name:en'] || t.name || null,
    bridge: t.bridge ? 1 : 0,
    oneway: t.oneway === 'yes' ? 1 : 0,
    pts: pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
  });

  if (rank >= 3) {
    for (let i = 1; i < pts.length; i++) {
      arterialSegments.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
    }
  }
}

console.log(`  roads: ${roads.length} (${arterialSegments.length} arterial segments)`);

/** Coarse spatial hash over arterial segments so the frontage test stays cheap. */
const ART_CELL = 60;
const artGrid = new Map();
for (const seg of arterialSegments) {
  const cx0 = Math.floor(Math.min(seg[0], seg[2]) / ART_CELL);
  const cx1 = Math.floor(Math.max(seg[0], seg[2]) / ART_CELL);
  const cz0 = Math.floor(Math.min(seg[1], seg[3]) / ART_CELL);
  const cz1 = Math.floor(Math.max(seg[1], seg[3]) / ART_CELL);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const k = `${cx},${cz}`;
      let arr = artGrid.get(k);
      if (!arr) artGrid.set(k, (arr = []));
      arr.push(seg);
    }
  }
}

function distToSeg(px, pz, s) {
  const dx = s[2] - s[0];
  const dz = s[3] - s[1];
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return Math.hypot(px - s[0], pz - s[1]);
  let t = ((px - s[0]) * dx + (pz - s[1]) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s[0] + t * dx), pz - (s[1] + t * dz));
}

/** True if the point is within `maxDist` metres of any arterial road centreline. */
function nearArterial(px, pz, maxDist = 28) {
  const cx = Math.floor(px / ART_CELL);
  const cz = Math.floor(pz / ART_CELL);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const arr = artGrid.get(`${cx + i},${cz + j}`);
      if (!arr) continue;
      for (const s of arr) if (distToSeg(px, pz, s) < maxDist) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pass 2: buildings
// ---------------------------------------------------------------------------

/** Ways consumed as members of a building multipolygon, so we don't emit twice. */
const consumedByRelation = new Set();

const buildings = [];
let skipped = 0;
const heightSources = { tag: 0, levels: 0, raster: 0, inferred: 0 };

function pushBuilding(id, tags, outer, holes) {
  const ring = cleanRing(outer);
  if (ring.length < 3) {
    skipped++;
    return;
  }
  const area = ringArea(ring);
  if (area < 6 || area > 90000) {
    skipped++;
    return;
  }

  const c = centroid(ring);
  const { height, levels, source } = buildingHeight(tags, area, id, nearArterial(c[0], c[1]));
  heightSources[source]++;

  // earcut wants the outer ring counter-clockwise and holes clockwise.
  const outCCW = signedArea(ring) > 0 ? ring : ring.slice().reverse();

  const b = {
    id,
    h: +height.toFixed(2),
    lv: levels,
    a: Math.round(area),
    // Flat [x,z,x,z,...] to keep the JSON small.
    p: outCCW.flatMap(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
  };

  if (holes && holes.length) {
    b.holes = [];
    for (const hole of holes) {
      const hr = cleanRing(hole);
      if (hr.length < 3) continue;
      const hCW = signedArea(hr) < 0 ? hr : hr.slice().reverse();
      b.holes.push(hCW.flatMap(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]));
    }
    if (!b.holes.length) delete b.holes;
  }

  const name = tags['name:en'] || tags.name;
  if (name) b.name = name;

  const type = tags.building;
  if (type && type !== 'yes') b.t = type;
  if (tags.amenity) b.am = tags.amenity;
  if (tags.shop) b.shop = tags.shop;

  buildings.push(b);
}

// Building multipolygon relations first (courtyard blocks).
for (const rel of relations) {
  const t = rel.tags || {};
  if (!t.building && !t['building:part']) continue;

  const outers = [];
  const inners = [];
  for (const m of rel.members) {
    if (m.type !== 'way') continue;
    const w = ways.get(m.ref);
    if (!w) continue;
    const pts = wayPoints(w);
    if (!pts || pts.length < 3) continue;
    consumedByRelation.add(m.ref);
    if (m.role === 'inner') inners.push(pts);
    else outers.push(pts);
  }
  for (const o of outers) pushBuilding(rel.id, t, o, inners);
}

for (const way of ways.values()) {
  const t = way.tags;
  if (!t || !t.building) continue;
  if (consumedByRelation.has(way.id)) continue;
  const pts = wayPoints(way);
  if (!pts) {
    skipped++;
    continue;
  }
  pushBuilding(way.id, t, pts, null);
}

console.log(
  `  buildings: ${buildings.length} (skipped ${skipped}) ` +
    `heights: ${heightSources.tag} tagged, ${heightSources.levels} from levels, ${heightSources.raster} from raster, ${heightSources.inferred} inferred`
);

// ---------------------------------------------------------------------------
// Pass 3: the metro (MRT Line 6 viaduct) and its stations
// ---------------------------------------------------------------------------

const metroTracks = [];
for (const way of ways.values()) {
  const t = way.tags;
  if (!t || t.railway !== 'subway') continue;
  const pts = wayPoints(way);
  if (!pts || pts.length < 2) continue;
  metroTracks.push({
    id: way.id,
    layer: parseInt(t.layer, 10) || 2,
    name: t['name:en'] || t.name || 'MRT Line 6',
    pts: pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
  });
}

const allStations = [];
const seenStations = new Set();
for (const n of nodes.values()) {
  const t = n.tags;
  if (!t) continue;
  if (t.railway !== 'station' && t.railway !== 'stop') continue;
  const rawName = t['name:en'] || t.name;
  const name = STATION_RENAME[rawName] || rawName;
  if (!name || seenStations.has(name)) continue;
  seenStations.add(name);
  const [x, z] = project(n.lat, n.lon);
  allStations.push({ name, bn: t.name || name, x: +x.toFixed(2), z: +z.toFixed(2) });
}

// STATION_WHITELIST (--stations) restricts both the emitted metro.stations
// list and the metro clip range to named stations on THIS corridor. Without
// it (legacy / default mirpur.osm.json build) every railway=station/stop
// node found in the extract is used, which for that small extract is only
// the two corridor stations anyway -- unaffected. For a larger extract
// (north.osm.json) the raw list also contains heavy-rail stations (Dhaka
// Cantonment, Airport, Banani) and other MRT stations south of Mirpur 10
// (Kazipara, Shewrapara) that are explicitly out of scope
// (docs/DECISION-PLAYABLE-AREA.md, owner 17:55) and must not pull the metro
// clip range south past Mirpur 10 or list irrelevant station markers.
const stations = STATION_WHITELIST
  ? allStations.filter((s) => STATION_WHITELIST.includes(s.name))
  : allStations;

console.log(`  metro: ${metroTracks.length} viaduct tracks, ${stations.length} stations`);
if (STATION_WHITELIST) {
  const missing = STATION_WHITELIST.filter((n) => !stations.some((s) => s.name === n));
  if (missing.length) console.log(`  WARNING: stations not found in extract: ${missing.join(', ')}`);
}

// ---------------------------------------------------------------------------
// distToCorridor: distance in metres from a point to the nearest point on
// ANY playable-corridor centreline (the metro clip, plus any --extra-
// corridors arterial road chains), via a coarse spatial hash (same pattern
// as the arterial-frontage grid above) so the playable-radius cull stays
// cheap. Generalises the original single-corridor "distToMetro": the metro
// track contributes segments the same way an extra arterial way does, they
// just share one combined grid.
// ---------------------------------------------------------------------------

// The raw `railway=subway` ways are the whole MRT Line 6 through Dhaka (the
// Overpass extract does not clip way geometry to the download bbox), running
// far past this corridor's own stations. Using the unclipped line would make
// "distance to centreline" meaningless (nearly every point in Dhaka along
// that line's general bearing reads as "close"), so first clip each track to
// the span between --metro-start and --metro-end (by cumulative arc length +
// nearest-vertex-to-station lookup, using the now-whitelisted `stations`
// list so a north-of-Uttara-South or south-of-Mirpur-10 station never
// extends the clip). A point beyond either endpoint still measures correctly
// against the clipped segment's endpoint (distToSeg clamps t to [0,1]), so
// the clip buffer only needs to cover polyline-vertex granularity near each
// station, not the full KEEP_RADIUS -- a large buffer just re-extends the
// line past the stations and defeats the cull (see docs/DATA-CULL.md for the
// first attempt that reproduced this bug).
const CORRIDOR_CLIP_BUFFER = 50;
function clipTrackToCorridor(pts) {
  const clipStations = stations.filter((s) => s.name === METRO_START || s.name === METRO_END);
  if (clipStations.length < 2) return pts; // fall back: can't find both endpoints, don't clip
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const stationCum = clipStations.map((s) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - s.x, pts[i][1] - s.z);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return cum[bi];
  });
  const sMin = Math.min(...stationCum) - CORRIDOR_CLIP_BUFFER;
  const sMax = Math.max(...stationCum) + CORRIDOR_CLIP_BUFFER;
  return pts.filter((_, i) => cum[i] >= sMin && cum[i] <= sMax);
}

const corridorSegments = [];
for (const trk of metroTracks) {
  const clipped = clipTrackToCorridor(trk.pts);
  for (let i = 1; i < clipped.length; i++) {
    corridorSegments.push([clipped[i - 1][0], clipped[i - 1][1], clipped[i][0], clipped[i][1]]);
  }
}

const extraCorridorWayIds = { used: [] }; // for the console summary / docs
for (const key of EXTRA_CORRIDOR_KEYS) {
  const ids = CORRIDOR_WAY_IDS[key];
  if (!ids) {
    console.log(`  WARNING: unknown --extra-corridors key "${key}", skipping`);
    continue;
  }
  for (const id of ids) {
    const way = ways.get(id);
    if (!way) {
      console.log(`  WARNING: extra-corridor way ${id} (${key}) not found in extract`);
      continue;
    }
    const pts = wayPoints(way);
    if (!pts || pts.length < 2) continue;
    extraCorridorWayIds.used.push(id);
    for (let i = 1; i < pts.length; i++) {
      corridorSegments.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
    }
  }
}
if (EXTRA_CORRIDOR_KEYS.length) {
  console.log(`  extra corridors: ${EXTRA_CORRIDOR_KEYS.join(', ')} (${extraCorridorWayIds.used.length} ways, ids: ${extraCorridorWayIds.used.join(',')})`);
}

const METRO_CELL = 100;
const corridorGrid = new Map();
for (const seg of corridorSegments) {
  const cx0 = Math.floor(Math.min(seg[0], seg[2]) / METRO_CELL);
  const cx1 = Math.floor(Math.max(seg[0], seg[2]) / METRO_CELL);
  const cz0 = Math.floor(Math.min(seg[1], seg[3]) / METRO_CELL);
  const cz1 = Math.floor(Math.max(seg[1], seg[3]) / METRO_CELL);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const k = `${cx},${cz}`;
      let arr = corridorGrid.get(k);
      if (!arr) corridorGrid.set(k, (arr = []));
      arr.push(seg);
    }
  }
}

/** Distance from (px,pz) to the nearest playable-corridor centreline segment, metres. */
function distToCorridor(px, pz) {
  if (!corridorSegments.length) return Infinity;
  let best = Infinity;
  const cx = Math.floor(px / METRO_CELL);
  const cz = Math.floor(pz / METRO_CELL);
  for (let ring = 0; ring <= 60; ring++) {
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue; // only the new shell
        const arr = corridorGrid.get(`${cx + i},${cz + j}`);
        if (!arr) continue;
        for (const s of arr) {
          const d = distToSeg(px, pz, s);
          if (d < best) best = d;
        }
      }
    }
    // Once the best candidate is closer than the ring's own boundary, no
    // farther ring can improve on it.
    if (best <= ring * METRO_CELL) break;
  }
  return best;
}
// Back-compat alias: rest of the file (and DATA-CULL.md) refers to this as
// distToMetro; keep both names pointing at the same generalised function.
const distToMetro = distToCorridor;

// ---------------------------------------------------------------------------
// Pass 4: green space, water, and other ground cover
// ---------------------------------------------------------------------------

const GROUND_KINDS = {
  park: 'park', garden: 'park', grass: 'park', grassland: 'park', meadow: 'park',
  village_green: 'park', recreation_ground: 'park', wood: 'wood', forest: 'wood',
  scrub: 'wood', pitch: 'pitch', playground: 'pitch', stadium: 'pitch',
  sports_centre: 'pitch', track: 'pitch', water: 'water', swimming_pool: 'water',
  reservoir: 'water', basin: 'water', wetland: 'water', cemetery: 'cemetery',
  grave_yard: 'cemetery', school: 'institutional', parking: 'parking',
  construction: 'bare', brownfield: 'bare', industrial: 'bare', military: 'bare',
};

const areas = [];
for (const way of ways.values()) {
  const t = way.tags;
  if (!t || t.building) continue;
  const key = t.leisure || t.natural || t.landuse || (t.amenity === 'parking' ? 'parking' : null);
  const kind = key ? GROUND_KINDS[key] : null;
  if (!kind) continue;
  const pts = wayPoints(way);
  if (!pts || pts.length < 3) continue;
  const ring = cleanRing(pts);
  if (ring.length < 3) continue;
  const a = ringArea(ring);
  if (a < 50) continue;
  areas.push({
    id: way.id,
    k: kind,
    name: t['name:en'] || t.name || null,
    p: ring.flatMap(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
  });
}

const waterways = [];
for (const way of ways.values()) {
  const t = way.tags;
  if (!t || !t.waterway) continue;
  if (!['river', 'stream', 'canal', 'drain', 'ditch'].includes(t.waterway)) continue;
  const pts = wayPoints(way);
  if (!pts || pts.length < 2) continue;
  waterways.push({
    id: way.id,
    k: t.waterway,
    w: t.waterway === 'river' ? 14 : t.waterway === 'canal' ? 8 : 3.5,
    pts: pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
  });
}

console.log(`  ground: ${areas.length} areas, ${waterways.length} waterways`);

// ---------------------------------------------------------------------------
// Pass 5: point features worth labelling or decorating
// ---------------------------------------------------------------------------

const POI_KEEP = new Set([
  'place_of_worship', 'hospital', 'clinic', 'pharmacy', 'school', 'college',
  'university', 'bank', 'atm', 'restaurant', 'cafe', 'fast_food', 'marketplace',
  'fuel', 'police', 'fire_station', 'bus_station', 'post_office', 'library',
  // Added for real shop signage (P11-shop-names): 126 money_transfer
  // (bKash/Nagad agent points) and 86 dentist nodes in the north extract
  // were previously dropped entirely because they weren't in this set --
  // the survey has real business names for them ("Grameen Phone Customer
  // Care" etc) that the shop-sign pass now wants to render.
  'money_transfer', 'dentist',
]);

const pois = [];
for (const n of nodes.values()) {
  const t = n.tags;
  if (!t) continue;
  const kind = POI_KEEP.has(t.amenity) ? t.amenity : t.shop ? 'shop' : null;
  if (!kind) continue;
  const [x, z] = project(n.lat, n.lon);
  pois.push({
    k: kind,
    // Emit BOTH name tags instead of collapsing them with `||`: OSM here
    // carries `name` (often Bangla, e.g. আড়ং) and sometimes a separate
    // `name:en`. The old `t['name:en'] || t.name` line threw away whichever
    // one existed alongside the other. `name` keeps whatever script the
    // surveyor entered; `nameEn` is present only when a Latin transliteration
    // was separately tagged. The renderer (src/signs.js) sniffs the Bangla
    // Unicode range to decide which line is which at render time.
    name: t.name || null,
    nameEn: t['name:en'] || null,
    sub: t.shop || null,
    x: +x.toFixed(2),
    z: +z.toFixed(2),
  });
}

const signals = [];
for (const n of nodes.values()) {
  if (n.tags?.highway !== 'traffic_signals') continue;
  const [x, z] = project(n.lat, n.lon);
  signals.push([+x.toFixed(2), +z.toFixed(2)]);
}

console.log(`  pois: ${pois.length}, traffic signals: ${signals.length}`);

// ---------------------------------------------------------------------------
// Pass 6: cull to the playable radius
//
// KEEP_RADIUS = RADIUS + 600 (fog range). Buildings beyond KEEP_RADIUS are
// dropped outright; buildings between RADIUS and KEEP_RADIUS are kept but
// tagged far:1. Roads are dropped only if every point on the way is beyond
// ROAD_KEEP_DIST, so the drivable network stays complete inside RADIUS and a
// road crossing the boundary is kept whole. Areas/waterways/pois/signals use
// the KEEP_RADIUS rule by centroid.
// ---------------------------------------------------------------------------

function polyCentroid(flat) {
  let x = 0;
  let z = 0;
  const n = flat.length / 2;
  for (let i = 0; i < flat.length; i += 2) {
    x += flat[i];
    z += flat[i + 1];
  }
  return [x / n, z / n];
}

/** Filters `arr` in place with `keepFn`, returns { before, after }. */
function cullInPlace(arr, keepFn) {
  const before = arr.length;
  const kept = arr.filter(keepFn);
  arr.length = 0;
  arr.push(...kept);
  return { before, after: arr.length };
}

console.log(`\nCulling to playable radius ${RADIUS} m (keep radius ${KEEP_RADIUS} m)...`);

let farTagged = 0;
const buildingsCull = cullInPlace(buildings, (b) => {
  const [cx, cz] = polyCentroid(b.p);
  const d = distToMetro(cx, cz);
  if (d > KEEP_RADIUS) return false;
  if (d > RADIUS) {
    b.far = 1;
    farTagged++;
  }
  return true;
});

const roadsCull = cullInPlace(roads, (r) => {
  for (let i = 0; i < r.pts.length; i++) {
    if (distToMetro(r.pts[i][0], r.pts[i][1]) <= ROAD_KEEP_DIST) return true;
  }
  return false;
});

const areasCull = cullInPlace(areas, (a) => {
  const [cx, cz] = polyCentroid(a.p);
  return distToMetro(cx, cz) <= KEEP_RADIUS;
});

const waterwaysCull = cullInPlace(waterways, (w) => {
  const [cx, cz] = polyCentroid(w.pts.flat());
  return distToMetro(cx, cz) <= KEEP_RADIUS;
});

const poisCull = cullInPlace(pois, (p) => distToMetro(p.x, p.z) <= KEEP_RADIUS);

const signalsCull = cullInPlace(signals, ([x, z]) => distToMetro(x, z) <= KEEP_RADIUS);

console.log(
  `  buildings: ${buildingsCull.before} -> ${buildingsCull.after} (${farTagged} tagged far:1)`
);
console.log(`  roads:     ${roadsCull.before} -> ${roadsCull.after}`);
console.log(`  areas:     ${areasCull.before} -> ${areasCull.after}`);
console.log(`  waterways: ${waterwaysCull.before} -> ${waterwaysCull.after}`);
console.log(`  pois:      ${poisCull.before} -> ${poisCull.after}`);
console.log(`  signals:   ${signalsCull.before} -> ${signalsCull.after}`);

// ---------------------------------------------------------------------------
// Pass 6b: road-frontage cull
//
// Half of this extract's footprints are deep-block infill: sheds and rooftops
// buried behind the front row, with no mapped road, alley or footpath anywhere
// near them. The player only ever moves along the road network, so those walls
// are never seen and only cost draw calls.
//
// Keep a building if EITHER
//   - any footprint vertex is within ROAD_FRONT metres of any kept road
//     centreline (vertex, not centroid, so a long block fronting a road at one
//     end stays whole), OR
//   - it is at least ROAD_FRONT_TALL metres tall, so anything that would show
//     over the front row from the street still stands.
//
// Runs AFTER Pass 6 so it measures against the roads that actually survive
// into the scene, not ones the radius cull already dropped.
// ---------------------------------------------------------------------------

if (ROAD_FRONT > 0) {
  const FRONT_CELL = 60;
  const frontGrid = new Map();
  let frontSegs = 0;
  for (const r of roads) {
    for (let i = 1; i < r.pts.length; i++) {
      const seg = [r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1]];
      frontSegs++;
      const cx0 = Math.floor(Math.min(seg[0], seg[2]) / FRONT_CELL);
      const cx1 = Math.floor(Math.max(seg[0], seg[2]) / FRONT_CELL);
      const cz0 = Math.floor(Math.min(seg[1], seg[3]) / FRONT_CELL);
      const cz1 = Math.floor(Math.max(seg[1], seg[3]) / FRONT_CELL);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const k = `${cx},${cz}`;
          let arr = frontGrid.get(k);
          if (!arr) frontGrid.set(k, (arr = []));
          arr.push(seg);
        }
      }
    }
  }

  // Only the cells the point could reach within ROAD_FRONT need checking, so
  // this is a fixed small neighbourhood rather than the expanding-ring search
  // distToCorridor needs (that one wants a true nearest distance; here a
  // threshold test is enough).
  const reach = Math.ceil(ROAD_FRONT / FRONT_CELL);
  function nearRoad(px, pz) {
    const cx = Math.floor(px / FRONT_CELL);
    const cz = Math.floor(pz / FRONT_CELL);
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        const arr = frontGrid.get(`${cx + i},${cz + j}`);
        if (!arr) continue;
        for (const s of arr) if (distToSeg(px, pz, s) <= ROAD_FRONT) return true;
      }
    }
    return false;
  }

  console.log(
    `\nRoad-frontage cull: keeping buildings within ${ROAD_FRONT} m of a road` +
      (ROAD_FRONT_TALL > 0 ? ` (or >= ${ROAD_FRONT_TALL} m tall)` : '') +
      `, ${frontSegs} road segments...`
  );

  let keptTall = 0;
  const frontCull = cullInPlace(buildings, (b) => {
    for (let i = 0; i < b.p.length; i += 2) {
      if (nearRoad(b.p[i], b.p[i + 1])) return true;
    }
    if (ROAD_FRONT_TALL > 0 && b.h >= ROAD_FRONT_TALL) {
      keptTall++;
      return true;
    }
    return false;
  });

  console.log(
    `  buildings: ${frontCull.before} -> ${frontCull.after} ` +
      `(${frontCull.before - frontCull.after} dropped, ${keptTall} kept by the height exemption)`
  );
}

// ---------------------------------------------------------------------------
// Bounds and emit
// ---------------------------------------------------------------------------

let minX = Infinity;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (const b of buildings) {
  for (let i = 0; i < b.p.length; i += 2) {
    if (b.p[i] < minX) minX = b.p[i];
    if (b.p[i] > maxX) maxX = b.p[i];
    if (b.p[i + 1] < minZ) minZ = b.p[i + 1];
    if (b.p[i + 1] > maxZ) maxZ = b.p[i + 1];
  }
}

const scene = {
  meta: {
    name: `${METRO_START} to ${METRO_END}, Dhaka`,
    source: 'OpenStreetMap contributors, ODbL',
    generated: new Date().toISOString(),
    origin: { lat: LAT0, lon: LON0 },
    mPerDegLat: M_PER_DEG_LAT,
    mPerDegLon: +M_PER_DEG_LON.toFixed(3),
    bounds: {
      minX: +minX.toFixed(1), maxX: +maxX.toFixed(1),
      minZ: +minZ.toFixed(1), maxZ: +maxZ.toFixed(1),
    },
    counts: {
      buildings: buildings.length,
      roads: roads.length,
      areas: areas.length,
      pois: pois.length,
    },
    playable: {
      radius: RADIUS,
      keepRadius: KEEP_RADIUS,
      roadFront: ROAD_FRONT,
      roadFrontTall: ROAD_FRONT_TALL,
      metroStart: METRO_START,
      metroEnd: METRO_END,
      extraCorridors: EXTRA_CORRIDOR_KEYS,
      extraCorridorWayIds: extraCorridorWayIds.used,
    },
  },
  buildings,
  roads,
  metro: { tracks: metroTracks, stations },
  areas,
  waterways,
  pois,
  signals,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(scene));

const bytes = JSON.stringify(scene).length;
console.log(`\nWrote ${OUT}`);
console.log(`  ${(bytes / 1e6).toFixed(2)} MB`);
console.log(
  `  extent ${(maxX - minX).toFixed(0)} m east-west x ${(maxZ - minZ).toFixed(0)} m north-south`
);
for (const s of stations) console.log(`  station: ${s.name} at (${s.x}, ${s.z})`);
