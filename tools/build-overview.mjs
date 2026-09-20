#!/usr/bin/env node
/**
 * tools/build-overview.mjs
 *
 * P13-B: builds public/map-overview.json, a SMALL cross-district summary
 * that lets the expanded map show the whole MRT Line 6 corridor -- Uttara
 * South through Bijoy Sarani -- not just whichever district is currently
 * loaded.
 *
 * Reads every district scene file (public/scene-north.json,
 * public/scene-bijoy.json -- see src/districts.js) and emits:
 *   - stations: every modelled station, tagged with its district
 *   - track: ONE continuous, decimated centreline for the whole corridor,
 *     assembled from the per-file MRT Line 6 track geometry (see "Why one
 *     spine" below), plus a `gap` sub-range marking the Kazipara/
 *     Shewrapara stretch that no district models
 *   - gapStations: Kazipara/Shewrapara, interpolated along that gap (see
 *     below -- their positions are NOT surveyed)
 *   - roads: decimated arterial-only (rank >= 4, i.e. primary/trunk+)
 *     chains, for shape/context, not turn-by-turn
 *   - water: named/large water area polygons + waterway lines, decimated
 *   - places: a SCORED pool of named areas + curated landmark POIs (see
 *     "Curation rule" below). minimap.js decides at DRAW time, by zoom,
 *     how many of these actually get a label -- this file intentionally
 *     ships more candidates than should ever be drawn at once.
 *
 * Why one spine, not "all four track polylines per file"
 * --------------------------------------------------------
 * Each scene file's `metro.tracks` carries the FULL, un-clipped OSM rail
 * geometry for however much of Line 6 happens to intersect that file's
 * bounding box, as twin near-duplicate rails (inbound/outbound) --
 * confirmed by inspection: scene-north.json and scene-bijoy.json literally
 * share two track ids (1125709174/1125709175) with identical points. So:
 * dedupe tracks by id across ALL files first, then cluster the survivors
 * by bounding box (the twin-rail pairs), keep the higher-resolution rail
 * from each cluster, sort clusters by their southernmost (max Z) extent,
 * and concatenate. The result is one continuous, gapless centreline from
 * north of Uttara South to south of Farmgate -- because the real rail
 * geometry never actually breaks at a district boundary, only the
 * buildings/roads/POIs around it do.
 *
 * Curation rule (job 4 -- read this before changing the thresholds below)
 * -------------------------------------------------------------------------
 * The scene files carry ~4,000 POIs and ~250 named areas between them.
 * Drawing all of them is worse than drawing none (brief: "a map with 3,000
 * labels is worse than one with 30"). So:
 *   1. High-volume, low-distinctiveness kinds are DROPPED ENTIRELY from the
 *      overview: shop, pharmacy, restaurant, fast_food, cafe, atm, bank,
 *      dentist, clinic, marketplace, fuel, money_transfer. These are the
 *      95% of POIs that make Mirpur feel alive in the 3D scene but are
 *      not "places" anyone would look for on a map.
 *   2. Named areas (park/water/wood/cemetery/pitch) are kept, scored by
 *      kind + polygon area (bigger = more important) -- a 40 sqm pocket
 *      park does not outrank Chandrima Uddan.
 *   3. A short allow-list of POI kinds survives: university, college,
 *      hospital, bus_station, library, post_office, and a filtered
 *      slice of police and place_of_worship (see below) -- categories a
 *      player would plausibly navigate towards. Each gets a fixed
 *      per-kind score.
 *   4. Generic/noise names are filtered per kind: hospital drops personal
 *      "Dr X Chamber" listings (those are shops, not hospitals); police
 *      drops bare "Police Box" duplicates (there is no way to tell them
 *      apart, so a label would lie); place_of_worship is cut from ~170
 *      mosques down to the ones whose OSM name signals they are the
 *      neighbourhood's principal mosque (contains "Jame Masjid",
 *      "Central", "National", "Baitul" or "Shahi") or that carry an
 *      English name (a proxy for being notable enough that someone
 *      bothered to tag one).
 *   5. Nothing here is a hard "top N" cut -- every survivor gets a score
 *      and minimap.js reveals labels top-score-first as you zoom in, with
 *      on-screen collision avoidance dropping the rest. This file is a
 *      ranked POOL, the actual curation-to-"30 labels" happens at draw
 *      time against the CURRENT view, which this build step cannot know.
 *
 * P13-F addendum -- buildings as a label source, and a `tier` field
 * --------------------------------------------------------------------
 * P13-B's places pool only ever drew from `areas` (named leisure/water/etc
 * polygons) and `pois` (points) -- it never looked at `scene.buildings` at
 * all, so the single most important label on the whole map (the National
 * Parliament House, a BUILDING footprint, not an area or POI) never made
 * it into map-overview.json in the first place. Fixed by adding a third
 * source: named buildings with a footprint big enough to be a real
 * landmark (`LANDMARK_MIN_AREA`), skipping ones whose name is a metro
 * station building shell (those are already carried in `stations`).
 *
 * Every place (building/area/POI) now also carries a `tier`:
 *   1 = landmarks/major civic buildings (this new buildings source).
 *   2 = named areas/lakes/universities/hospitals (arterial roads carry
 *       their own `tier: 2` separately, see the roads section below).
 *   3 = everything else that survived curation at all.
 * `src/minimap.js` uses `tier` to decide the zoom at which a label even
 * becomes ELIGIBLE (low tiers need a closer zoom), and to order the
 * collision pass so a higher tier always wins a fight over screen space,
 * per the brief's "when two collide, the higher tier wins".
 *
 * The National Parliament House gets one more thing on top of tier 1:
 * `landmark: true` and a hand-supplied `bn` (Bengali name). The OSM
 * building record in scene-bijoy.json carries only "National Parliament
 * House" as `name` -- no `name:en`/`name:bn` split survived into the
 * scene file (confirmed by grepping scene-bijoy.json for the Bengali
 * string; it is not present), so the Bengali form here is supplied by
 * hand rather than claimed as sourced from the scene. `landmark: true` is
 * what src/minimap.js keys off to force this ONE label to always draw, at
 * larger type, never zoom-gated and never dropped by the collision pass --
 * the brief's acceptance criterion that it be "the most prominent label
 * on the bijoy map".
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'map-overview.json');

const SOURCES = [
  { key: 'north', file: 'scene-north.json', label: 'Mirpur' },
  { key: 'bijoy', file: 'scene-bijoy.json', label: 'Bijoy Sarani' },
];

// ----------------------------------------------------------------------
// Douglas-Peucker polyline simplification (world metres in, world metres
// out). Keeps the shape recognisable at map scale while cutting the point
// count that has to ship in map-overview.json.
function simplify(pts, tolerance) {
  if (pts.length < 3) return pts.slice();
  const sqTol = tolerance * tolerance;

  function sqSegDist(p, a, b) {
    let [x, y] = a;
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  }

  function simplifyRange(lo, hi, out) {
    let maxDist = 0;
    let idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = sqSegDist(pts[i], pts[lo], pts[hi]);
      if (d > maxDist) { maxDist = d; idx = i; }
    }
    if (maxDist > sqTol && idx !== -1) {
      simplifyRange(lo, idx, out);
      out.push(pts[idx]);
      simplifyRange(idx, hi, out);
    }
  }

  const out = [pts[0]];
  simplifyRange(0, pts.length - 1, out);
  out.push(pts[pts.length - 1]);
  return out;
}

const round1 = (n) => Math.round(n * 10) / 10;
const pt = (p) => [round1(p[0]), round1(p[1])];

function polygonArea(flatPts) {
  // Shoelace formula on a flat [x0,z0,x1,z1,...] ring.
  let area = 0;
  const n = flatPts.length / 2;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = [flatPts[i * 2], flatPts[i * 2 + 1]];
    const j = (i + 1) % n;
    const [x2, y2] = [flatPts[j * 2], flatPts[j * 2 + 1]];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

// ----------------------------------------------------------------------
// Load every source scene once.
const scenes = SOURCES.map((src) => ({
  ...src,
  data: JSON.parse(readFileSync(path.join(ROOT, 'public', src.file), 'utf8')),
}));

// ----------------------------------------------------------------------
// 1. Stations, tagged by district.
const stations = [];
for (const s of scenes) {
  for (const st of s.data.metro.stations) {
    if (stations.some((x) => x.name === st.name)) continue; // shared edge station
    stations.push({ name: st.name, bn: st.bn, x: round1(st.x), z: round1(st.z), district: s.key });
  }
}

// ----------------------------------------------------------------------
// 2. One continuous track spine -- see module comment "Why one spine".
const seenTrackIds = new Set();
const rawTracks = [];
for (const s of scenes) {
  for (const t of s.data.metro.tracks) {
    if (seenTrackIds.has(t.id)) continue;
    seenTrackIds.add(t.id);
    const xs = t.pts.map((p) => p[0]);
    const zs = t.pts.map((p) => p[1]);
    rawTracks.push({
      id: t.id,
      pts: t.pts,
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minZ: Math.min(...zs), maxZ: Math.max(...zs),
    });
  }
}
// Cluster near-duplicate (twin-rail) tracks by bounding-box proximity,
// keep the higher point-count rail from each cluster.
const clusters = [];
for (const t of rawTracks) {
  let cluster = clusters.find((c) =>
    Math.abs(c.minX - t.minX) < 60 && Math.abs(c.maxX - t.maxX) < 60 &&
    Math.abs(c.minZ - t.minZ) < 60 && Math.abs(c.maxZ - t.maxZ) < 60);
  if (!cluster) { cluster = { tracks: [] }; clusters.push(cluster); }
  cluster.tracks.push(t);
}
const spineSegments = clusters
  .map((c) => c.tracks.sort((a, b) => b.pts.length - a.pts.length)[0])
  .sort((a, b) => a.minZ - b.minZ);

// Concatenate, dropping a duplicated boundary point where consecutive
// segments touch (they share an endpoint at a district seam).
let spine = [];
for (const seg of spineSegments) {
  let pts = seg.pts;
  // Orient each segment so it runs low-Z -> high-Z, matching the overall
  // south-running concatenation order.
  if (pts[0][1] > pts[pts.length - 1][1]) pts = pts.slice().reverse();
  if (spine.length) {
    const last = spine[spine.length - 1];
    const first = pts[0];
    if (Math.hypot(last[0] - first[0], last[1] - first[1]) < 15) pts = pts.slice(1);
  }
  spine = spine.concat(pts);
}

// Arc-length lookup along the spine, used to place the gap markers and to
// record the gap's [startIndex, endIndex] into the (pre-simplification)
// spine.
function nearestIndex(pts, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - x, pts[i][1] - z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
const mirpur10 = stations.find((s) => s.name === 'Mirpur 10');
const agargaon = stations.find((s) => s.name === 'Agargaon');
let gap = null;
let gapStations = [];
if (mirpur10 && agargaon) {
  const iA = nearestIndex(spine, mirpur10.x, mirpur10.z);
  const iB = nearestIndex(spine, agargaon.x, agargaon.z);
  const lo = Math.min(iA, iB);
  const hi = Math.max(iA, iB);
  // Arc length + interpolated points at 1/3 and 2/3 along the gap for the
  // Kazipara/Shewrapara labels. NOT surveyed positions -- the real Line 6
  // stations there were never modelled (see src/districts.js), so this is
  // "somewhere along the real track geometry, in the right order", drawn
  // dashed and muted specifically so it doesn't read as a built station.
  const seg = spine.slice(lo, hi + 1);
  const cum = [0];
  for (let i = 1; i < seg.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  function alongSeg(frac) {
    const target = total * frac;
    let i = 1;
    while (i < cum.length && cum[i] < target) i++;
    i = Math.min(i, cum.length - 1);
    const t = cum[i] === cum[i - 1] ? 0 : (target - cum[i - 1]) / (cum[i] - cum[i - 1]);
    const a = seg[i - 1];
    const b = seg[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  const [kx, kz] = alongSeg(1 / 3);
  const [sx, sz] = alongSeg(2 / 3);
  gapStations = [
    { name: 'Kazipara', bn: 'কাজীপাড়া', x: round1(kx), z: round1(kz), builtIn: false },
    { name: 'Shewrapara', bn: 'শেওড়াপাড়া', x: round1(sx), z: round1(sz), builtIn: false },
  ];
  gap = { fromStation: 'Mirpur 10', toStation: 'Agargaon', startIndex: lo, endIndex: hi };
}

const simplifiedSpine = simplify(spine, 3).map(pt);
// Recompute the gap index range against the SIMPLIFIED spine so the
// renderer doesn't have to carry the raw one too.
if (gap) {
  const gx = spine[gap.startIndex];
  const gy = spine[gap.endIndex];
  gap.startIndex = nearestIndex(simplifiedSpine, gx[0], gx[1]);
  gap.endIndex = nearestIndex(simplifiedSpine, gy[0], gy[1]);
}

// ----------------------------------------------------------------------
// 3. Arterial roads (rank >= 4: primary/trunk+), decimated, for context
// shape only -- not meant to be walked or routed along.
const roads = [];
for (const s of scenes) {
  for (const r of s.data.roads) {
    if (r.rank < 4) continue;
    const simp = simplify(r.pts, 4).map(pt);
    if (simp.length < 2) continue;
    // tier 2 -- "arterial roads" in the brief's own tier-2 bucket
    // (neighbourhood/area names, lakes, universities, hospitals, arterial
    // roads). Only rank >= 4 (primary/trunk+) chains are shipped here at
    // all, so every entry qualifies.
    roads.push({ name: r.name || null, rank: r.rank, district: s.key, pts: simp, tier: 2 });
  }
}

// ----------------------------------------------------------------------
// 4. Water: named/large water area polygons + waterway lines.
const water = { areas: [], ways: [] };
for (const s of scenes) {
  for (const a of s.data.areas) {
    if (a.k !== 'water') continue;
    const area = polygonArea(a.p);
    if (area < 1500 && !a.name) continue; // tiny + unnamed = noise
    const flat = [];
    const ring = [];
    for (let i = 0; i < a.p.length; i += 2) ring.push([a.p[i], a.p[i + 1]]);
    const simp = simplify(ring, 3);
    for (const p of simp) flat.push(round1(p[0]), round1(p[1]));
    water.areas.push({ name: a.name || null, district: s.key, p: flat, area: Math.round(area) });
  }
  for (const w of s.data.waterways || []) {
    const simp = simplify(w.pts, 4).map(pt);
    if (simp.length < 2) continue;
    water.ways.push({ k: w.k, district: s.key, pts: simp });
  }
}

// ----------------------------------------------------------------------
// 5. Places: scored pool of named areas + curated landmark POIs.
// See the module-level "Curation rule" comment for the reasoning.
const AREA_KIND_SCORE = { water: 40, park: 45, wood: 25, cemetery: 20, pitch: 35 };
const POI_KIND_SCORE = {
  university: 90,
  college: 65,
  hospital: 55,
  bus_station: 50,
  library: 30,
  post_office: 30,
  police: 25,
  place_of_worship: 45,
};

function cleanName(name) {
  if (!name) return null;
  const n = name.trim();
  if (!n) return null;
  return n;
}

function poiAllowed(p) {
  const name = cleanName(p.nameEn) || cleanName(p.name);
  if (!name) return null;
  switch (p.k) {
    case 'hospital':
      if (/chamber|^dr[\s.]/i.test(name)) return null;
      return name;
    case 'police':
      if (/^police box$/i.test(name)) return null;
      return name;
    case 'place_of_worship': {
      const notable = /jame masjid|central|national|baitul|shahi/i.test(name) || !!cleanName(p.nameEn);
      return notable ? name : null;
    }
    case 'university':
    case 'college':
    case 'bus_station':
    case 'library':
    case 'post_office':
      return name;
    default:
      return null;
  }
}

// Areas kept as "lakes"/"significant parks" (tier 2) vs. every other named
// pocket park/pond (tier 3, brief's "playgrounds, ponds, small POIs").
// Everything in AREA_KIND_SCORE still gets a score/label -- this only
// changes at what ZOOM it's allowed to appear (see minimap.js's
// TIER_MAX_ZOOM_T), which is what actually fixes "the label budget is
// spent on the wrong things" (brief item 4): a 40 sqm "Mess B Pond" no
// longer competes for screen space at the same zoom as Zia Uddan.
const AREA_TIER2_MIN_AREA = { water: 8000, park: 5000 };
function areaTier(kind, area) {
  const min = AREA_TIER2_MIN_AREA[kind];
  return min != null && area >= min ? 2 : 3;
}
// university/college/hospital are the tier-2 POI kinds the brief calls out
// by name; the rest of the allow-list (bus_station/library/post_office/
// police/place_of_worship) are tier 3 -- present, but only worth a label
// once zoomed in.
const POI_TIER2 = new Set(['university', 'college', 'hospital']);

// P13-F job 1 -- named BUILDINGS as a label source (previously missing
// entirely: `minimap._overview.places` held only areas/POIs, so the
// largest, most obviously map-worthy footprints in the scene -- civic
// buildings, hospitals, the Parliament itself -- never got a chance at a
// label). Only buildings above a real "landmark" footprint qualify, and
// metro-station building shells are skipped since those stations already
// have their own entry in `stations` above (skipping them here is also
// what keeps "Mirpur 10 Metro Station" from duplicating the "Mirpur 10"
// station label -- brief item 3).
const LANDMARK_MIN_AREA = 3000; // m^2
const METRO_SHELL_RE = /\bmetro station\b/i;
const PARLIAMENT_NAME = 'National Parliament House';
const PARLIAMENT_BN = 'জাতীয় সংসদ ভবন'; // hand-supplied -- see module comment above

function buildingCentroid(p) {
  let cx = 0, cz = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) { cx += p[i * 2]; cz += p[i * 2 + 1]; }
  return [cx / n, cz / n];
}

const places = [];
for (const s of scenes) {
  for (const bld of s.data.buildings) {
    const name = cleanName(bld.name);
    if (!name) continue;
    if (bld.a < LANDMARK_MIN_AREA) continue;
    if (METRO_SHELL_RE.test(name)) continue; // already a `stations` entry
    const isParliament = name === PARLIAMENT_NAME;
    const score = isParliament ? 999 : 60 + Math.min(35, Math.log10(bld.a + 1) * 8);
    const [cx, cz] = buildingCentroid(bld.p);
    places.push({
      name,
      kind: 'landmark',
      district: s.key,
      x: round1(cx),
      z: round1(cz),
      score: Math.round(score),
      tier: 1,
      ...(isParliament ? { landmark: true, bn: PARLIAMENT_BN } : {}),
    });
  }
  for (const a of s.data.areas) {
    const name = cleanName(a.name);
    if (!name) continue;
    const baseScore = AREA_KIND_SCORE[a.k];
    if (baseScore == null) continue;
    const area = polygonArea(a.p);
    if (area < 800) continue; // named but tiny -- skip
    const score = baseScore + Math.min(30, Math.log10(area + 1) * 6);
    // Label anchor: centroid of the ring (good enough for these convex-ish
    // OSM leisure/water/wood polygons).
    let cx = 0, cz = 0;
    const n = a.p.length / 2;
    for (let i = 0; i < n; i++) { cx += a.p[i * 2]; cz += a.p[i * 2 + 1]; }
    cx /= n; cz /= n;
    places.push({ name, kind: a.k, district: s.key, x: round1(cx), z: round1(cz), score: Math.round(score), tier: areaTier(a.k, area) });
  }
  for (const p of s.data.pois) {
    const name = poiAllowed(p);
    if (!name) continue;
    const score = POI_KIND_SCORE[p.k];
    places.push({ name, kind: p.k, district: s.key, x: round1(p.x), z: round1(p.z), score, tier: POI_TIER2.has(p.k) ? 2 : 3 });
  }
}

// Global de-dupe by name (brief item 3: "POIs are sometimes mapped twice,
// node + area" -- and now also two buildings on the same named campus, or
// a building shell that duplicates an area/POI already carrying the same
// name). Case/whitespace-insensitive; keeps whichever record scored
// highest. This is a BUILD-TIME dedupe of the candidate pool; the
// draw-time per-frame name dedupe in minimap.js (P13-F item 3) is what
// catches the OSM-road-split and cross-district cases this can't know
// about statically.
const byKey = new Map();
for (const place of places) {
  const key = place.name.trim().toLowerCase();
  const prev = byKey.get(key);
  if (!prev || place.score > prev.score) byKey.set(key, place);
}
const dedupedPlaces = [...byKey.values()];

// Tier-major, score-minor -- tier 1 (landmarks) always sorts before tier 2
// before tier 3, so the MAX_PLACES cap below can never crowd a landmark
// out to make room for a pond.
dedupedPlaces.sort((a, b) => a.tier - b.tier || b.score - a.score);
// Bound the pool (not the on-screen curation, which is zoom/collision
// driven in minimap.js) so a future data change can't silently balloon
// this file back towards "3,000 labels".
const MAX_PLACES = 260;
const curatedPlaces = dedupedPlaces.slice(0, MAX_PLACES);

// ----------------------------------------------------------------------
const out = {
  meta: {
    generated: new Date().toISOString(),
    note: 'Small cross-district map summary for src/minimap.js -- see tools/build-overview.mjs for how this was built and curated.',
    districts: SOURCES.map((s) => ({ key: s.key, label: s.label })),
  },
  stations,
  gapStations,
  track: simplifiedSpine,
  gap,
  roads,
  water,
  places: curatedPlaces,
};

writeFileSync(OUT, JSON.stringify(out));
const kb = (statSync(OUT).size / 1024).toFixed(1);
console.log(`[build-overview] wrote ${OUT} (${kb} KB)`);
console.log(`  stations: ${stations.length}, gapStations: ${gapStations.length}`);
console.log(`  track points: ${simplifiedSpine.length} (raw ${spine.length})`);
console.log(`  roads: ${roads.length}`);
console.log(`  water areas: ${water.areas.length}, waterways: ${water.ways.length}`);
const tierCounts = curatedPlaces.reduce((acc, p) => { acc[p.tier] = (acc[p.tier] || 0) + 1; return acc; }, {});
console.log(`  places: ${curatedPlaces.length} (pool ${dedupedPlaces.length}, pre-dedupe ${places.length}) tier1: ${tierCounts[1] || 0}, tier2: ${tierCounts[2] || 0}, tier3: ${tierCounts[3] || 0}`);
console.log(`  top5: ${curatedPlaces.slice(0, 5).map((p) => `${p.name} (t${p.tier}, ${p.score})`).join(', ')}`);
const parliament = curatedPlaces.find((p) => p.landmark);
console.log(`  parliament landmark: ${parliament ? `${parliament.name} / ${parliament.bn} @ (${parliament.x}, ${parliament.z})` : 'MISSING'}`);
