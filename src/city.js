/**
 * city.js
 *
 * Turns the OSM-derived scene description into renderable Three.js geometry.
 *
 * Strategy (see the rendering brief): every building footprint is unique, so
 * instancing buys nothing. Instead we bucket footprints into 200 m tiles and
 * merge each tile into a single BufferGeometry, giving roughly 100 draw calls
 * for the whole corridor. Facade variety comes from a shared texture atlas:
 * each building picks one atlas cell and we bake the UVs at build time, so all
 * tiles share one material.
 */

import * as THREE from 'three';
import earcut from 'earcut';
import {
  ATLAS_COLS,
  ATLAS_ROWS,
  CELL,
  ATLAS_GUTTER,
  UTTARA_Z_THRESHOLD,
  UTTARA_START_CELL,
  UTTARA_CELL_COUNT,
  MIRPUR_CELL_COUNT,
} from './facades.js';
import { loadTextureSet } from './textures.js';

export const TILE_SIZE = 200;

// ---------------------------------------------------------------------------
// Metro corridor footprint clip (P0-E4b, supersedes the P0-E4 whole-building
// cull)
//
// Owner feedback (docs/OWNER-FEEDBACK-2026-09-07.md #1): culling whole
// buildings left bare sand lots wherever a footprint merely clipped into the
// carriageway. The real street has a continuous shop wall on the footpath,
// so instead of dropping the building we clip its footprint at the
// carriageway edge (CARRIAGEWAY_HALF from the metro centreline) and keep
// only the part that survives. We bucket the 139 centreline points into
// 100 m buckets along X so distance queries don't scan the whole polyline
// per building.
// ---------------------------------------------------------------------------

export const CARRIAGEWAY_HALF = 12.5; // m, half-width of the clear carriageway from the centreline
const CLIP_CANDIDATE = 20; // m, only test footprints with a vertex at least this close
const MIN_CLIPPED_AREA = 15; // m^2, drop slivers left after clipping

const CORRIDOR_BUCKET = 100; // m, matches the brief's "bucket by 100 m"

let corridorSegBuckets = null; // Map<bucketX, Array<[ax,az,bx,bz]>>

// OSM building and road ways occasionally overlap at a junction or where a
// building survey was drawn over an older road. Collision-only filtering is
// insufficient there: the visible wall still hides the asphalt. Keep a
// small spatial index so a definite centreline-through-footprint can be
// removed during the same footprint pass without scanning all 1,500 ways for
// every building.
const ROAD_OVERLAP_BUCKET = 50;
let roadOverlapScene = null;
let roadOverlapBuckets = null;

function ensureRoadOverlapIndex(scene) {
  if (roadOverlapScene === scene && roadOverlapBuckets) return roadOverlapBuckets;
  roadOverlapScene = scene;
  roadOverlapBuckets = new Map();
  for (const road of scene?.roads || []) {
    if (road.rank < 1 || !road.pts || road.pts.length < 2) continue;
    const halfW = Math.max(2, (road.w || 6) / 2);
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1];
      const b = road.pts[i];
      const seg = [a[0], a[1], b[0], b[1], halfW];
      const margin = halfW + 1.5;
      const x0 = Math.floor((Math.min(a[0], b[0]) - margin) / ROAD_OVERLAP_BUCKET);
      const x1 = Math.floor((Math.max(a[0], b[0]) + margin) / ROAD_OVERLAP_BUCKET);
      const z0 = Math.floor((Math.min(a[1], b[1]) - margin) / ROAD_OVERLAP_BUCKET);
      const z1 = Math.floor((Math.max(a[1], b[1]) + margin) / ROAD_OVERLAP_BUCKET);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const key = cx * 100000 + cz;
          let list = roadOverlapBuckets.get(key);
          if (!list) roadOverlapBuckets.set(key, (list = []));
          list.push(seg);
        }
      }
    }
  }
  return roadOverlapBuckets;
}

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; i += 2) {
    const xi = ring[i];
    const zi = ring[i + 1];
    const xj = ring[j];
    const zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    j = i;
  }
  return inside;
}

function distanceToRing(x, z, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    best = Math.min(best, distToSegment(x, z, ring[i], ring[i + 1], ring[j], ring[j + 1]));
  }
  return best;
}

/** True only when a road centreline is materially inside a building. */
function roadRunsThroughBuilding(scene, b) {
  const ring = b.p;
  if (!scene?.roads || !ring || ring.length < 6) return false;
  const buckets = ensureRoadOverlapIndex(scene);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]);
    maxX = Math.max(maxX, ring[i]);
    minZ = Math.min(minZ, ring[i + 1]);
    maxZ = Math.max(maxZ, ring[i + 1]);
  }
  const cx0 = Math.floor(minX / ROAD_OVERLAP_BUCKET) - 1;
  const cx1 = Math.floor(maxX / ROAD_OVERLAP_BUCKET) + 1;
  const cz0 = Math.floor(minZ / ROAD_OVERLAP_BUCKET) - 1;
  const cz1 = Math.floor(maxZ / ROAD_OVERLAP_BUCKET) + 1;
  const seen = new Set();
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const list = buckets.get(cx * 100000 + cz);
      if (!list) continue;
      for (const [ax, az, bx, bz, halfW] of list) {
        const key = `${ax},${az},${bx},${bz}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (Math.max(ax, bx) < minX - halfW || Math.min(ax, bx) > maxX + halfW || Math.max(az, bz) < minZ - halfW || Math.min(az, bz) > maxZ + halfW) continue;
        const length = Math.hypot(bx - ax, bz - az);
        const samples = Math.min(24, Math.max(3, Math.ceil(length / 8)));
        for (let i = 1; i < samples; i++) {
          const t = i / samples;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          // Requiring the centreline to sit at least a little inside the
          // footprint avoids deleting buildings that merely touch the kerb.
          if (pointInRing(x, z, ring) && distanceToRing(x, z, ring) > halfW + 0.35) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Build (once) a bucketed set of centreline segments from scene.metro.tracks.
 * `scene` may be omitted once the index has already been built (e.g. from
 * buildCollisionGrid, which only receives the buildings array, not the full
 * scene) — main.js always calls buildBuildings(scene, ...) before
 * buildCollisionGrid(scene.buildings), so the cache is warm by then.
 */
function ensureCorridorIndex(scene) {
  if (corridorSegBuckets) return corridorSegBuckets;
  corridorSegBuckets = new Map();
  const tracks = scene?.metro?.tracks;
  if (!tracks) return corridorSegBuckets;

  const addSeg = (ax, az, bx, bz) => {
    const seg = [ax, az, bx, bz];
    const x0 = Math.floor(Math.min(ax, bx) / CORRIDOR_BUCKET);
    const x1 = Math.floor(Math.max(ax, bx) / CORRIDOR_BUCKET);
    for (let bx2 = x0; bx2 <= x1; bx2++) {
      let arr = corridorSegBuckets.get(bx2);
      if (!arr) corridorSegBuckets.set(bx2, (arr = []));
      arr.push(seg);
    }
  };

  for (const track of tracks) {
    const pts = track.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      addSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    }
  }
  return corridorSegBuckets;
}

/** Perpendicular distance from (x,z) to segment (ax,az)-(bx,bz). */
function distToSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-8) return Math.hypot(x - ax, z - az);
  let t = ((x - ax) * dx + (z - az) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx;
  const qz = az + t * dz;
  return Math.hypot(x - qx, z - qz);
}

/** Nearest centreline segment to (x,z), plus the distance to it. */
function nearestCentrelineSegment(scene, x, z) {
  const buckets = ensureCorridorIndex(scene);
  const bx = Math.floor(x / CORRIDOR_BUCKET);
  let best = Infinity;
  let bestSeg = null;
  for (let i = -1; i <= 1; i++) {
    const arr = buckets.get(bx + i);
    if (!arr) continue;
    for (const s of arr) {
      const d = distToSegment(x, z, s[0], s[1], s[2], s[3]);
      if (d < best) {
        best = d;
        bestSeg = s;
      }
    }
  }
  return bestSeg ? { seg: bestSeg, dist: best } : null;
}

/** Shortest distance from a world point to the metro centreline. */
function distToCentreline(scene, x, z) {
  const r = nearestCentrelineSegment(scene, x, z);
  return r ? r.dist : Infinity;
}

/** Signed area (shoelace) of a flat [x0,z0,x1,z1,...] ring. */
function ringArea(ring) {
  let a = 0;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
  }
  return a / 2;
}

/**
 * Sutherland-Hodgman clip of a flat ring against the half-plane
 * { p : distFn(p) >= threshold }. The clip region is a half-plane (convex),
 * so a simple polygon's winding order is preserved.
 */
function clipRingHalfPlane(ring, distFn, threshold) {
  const n = ring.length / 2;
  if (n < 3) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const ax = ring[i * 2];
    const az = ring[i * 2 + 1];
    const j = (i + 1) % n;
    const bx = ring[j * 2];
    const bz = ring[j * 2 + 1];
    const da = distFn(ax, az) - threshold;
    const db = distFn(bx, bz) - threshold;
    const aIn = da >= 0;
    const bIn = db >= 0;
    if (aIn) out.push(ax, az);
    if (aIn !== bIn) {
      // Edge crosses the clip line; interpolate the intersection point.
      const t = da / (da - db);
      out.push(ax + (bx - ax) * t, az + (bz - az) * t);
    }
  }
  return out;
}

/**
 * Clip building `b`'s footprint at the corridor edge (P0-E4b). Instead of
 * dropping whole buildings within the metro corridor (P0-E4), cut off only
 * the part of the footprint that falls inside CARRIAGEWAY_HALF of the
 * centreline, so the shop wall on the footpath stays continuous.
 *
 * Returns:
 *  - { ring: b.p, clipped: false } — the footprint never comes near the
 *    corridor, nothing to do;
 *  - { ring: <new flat ring>, clipped: true } — part of the footprint was
 *    cut away, `ring` is the surviving polygon in the same flat
 *    [x0,z0,x1,z1,...] format, same winding as the input;
 *  - { ring: null, clipped: true, dropped: true } — the building straddles
 *    the centreline itself (a single half-plane clip can't resolve that) or
 *    the remaining area after clipping is below MIN_CLIPPED_AREA.
 *
 * `scene` must carry `scene.metro` the first time this runs (it warms
 * ensureCorridorIndex); once warm, `scene` may be omitted, same as the old
 * isInCorridor.
 */
function clipFootprint(scene, b) {
  const ring = b.p;
  const n = ring.length / 2;

  if (roadRunsThroughBuilding(scene, b)) {
    return { ring: null, clipped: true, dropped: true, roadOverlap: true };
  }

  let cx = 0;
  let cz = 0;
  let nearCorridor = false;
  for (let i = 0; i < n; i++) {
    const x = ring[i * 2];
    const z = ring[i * 2 + 1];
    cx += x;
    cz += z;
    if (distToCentreline(scene, x, z) < CLIP_CANDIDATE) nearCorridor = true;
  }
  if (!nearCorridor) return { ring, clipped: false };
  cx /= n;
  cz /= n;

  const nearest = nearestCentrelineSegment(scene, cx, cz);
  if (!nearest) return { ring, clipped: false };
  const [ax, az, bx, bz] = nearest.seg;
  const tx0 = bx - ax;
  const tz0 = bz - az;
  const tlen = Math.hypot(tx0, tz0);
  if (tlen < 1e-6) return { ring, clipped: false };
  const tx = tx0 / tlen;
  const tz = tz0 / tlen;
  // Normal to the centreline segment (tangent rotated +90 degrees).
  const nx = -tz;
  const nz = tx;

  // Raw (un-sided) perpendicular distance from the infinite line through the
  // nearest centreline segment.
  const rawDist = (x, z) => (x - ax) * nx + (z - az) * nz;

  const side = rawDist(cx, cz) >= 0 ? 1 : -1;

  // If footprint vertices fall on both sides of the centreline line itself,
  // a single half-plane clip can't produce a sane shape - drop it.
  let sawPos = false;
  let sawNeg = false;
  for (let i = 0; i < n; i++) {
    const d = rawDist(ring[i * 2], ring[i * 2 + 1]);
    if (d > 0.01) sawPos = true;
    else if (d < -0.01) sawNeg = true;
  }
  if (sawPos && sawNeg) return { ring: null, clipped: true, dropped: true };

  const distFn = (x, z) => rawDist(x, z) * side;
  const clipped = clipRingHalfPlane(ring, distFn, CARRIAGEWAY_HALF);

  if (clipped.length < 6) return { ring: null, clipped: true, dropped: true };
  if (Math.abs(ringArea(clipped)) < MIN_CLIPPED_AREA) {
    return { ring: null, clipped: true, dropped: true };
  }

  return { ring: clipped, clipped: true };
}

// Per-build cache: building id -> clipFootprint() result. Rebuilt at the top
// of every buildBuildings() call (see there) so buildCollisionGrid (which
// only receives the buildings array, not the full scene - see the note on
// ensureCorridorIndex) can look up the same clipped/dropped ring without
// needing `scene` again.
let footprintClipCache = null;

/** clipFootprint with memoization; scene may be omitted once cache is warm. */
export function getClippedFootprint(scene, b) {
  if (!footprintClipCache) footprintClipCache = new Map();
  let r = footprintClipCache.get(b.id);
  if (!r) {
    r = clipFootprint(scene, b);
    footprintClipCache.set(b.id, r);
  }
  return r;
}

// ---------------------------------------------------------------------------
// P1-B: far-building LOD + distance tile culling
//
// Playable area (docs/DECISION-PLAYABLE-AREA.md) is within 400 m of the
// metro centreline. Buildings farther than that get a cheaper look (no
// rooftop props, no emissive windows, no shadows) and are baked into their
// own tile meshes so the material split costs no extra draw calls beyond
// the tiles that actually straddle the 400 m line. E6 (tools/build-scene.mjs)
// may tag far buildings with `far: 1` in scene.json; we don't depend on it
// landing first - `isFarBuilding` recomputes the same test at runtime from
// the centreline helper above, and treats `b.far === 1` as an equivalent
// shortcut.
// ---------------------------------------------------------------------------

const FAR_DISTANCE = 400; // m from centreline; matches the playable boundary
const LOD_TILE_VISIBLE_RANGE = 750; // m; tiles beyond this are hidden wholesale

// ---------------------------------------------------------------------------
// P2-STREAMING: lazy per-tile building around the player
//
// buildBuildings() now only BUCKETS every building into its 200 m tile
// (cheap - a hash-map insert per building) and clips/tags far exactly as
// before (P0-E4b/P1-B unchanged, and buildCollisionGrid still needs the
// full clip result for every building regardless of streaming). Turning a
// bucket into actual geometry (walls/roof/rooftop props) only happens for
// tiles within BUILD_RADIUS of the player, driven by updateBuildingLOD, so
// startup only pays for opts.initialRadius worth of tiles instead of the
// whole 35k-building map. Tiles the player has left behind get their
// geometry disposed (not their bucket - so they can be rebuilt later
// without re-clipping) once they fall outside DISPOSE_RADIUS.
// ---------------------------------------------------------------------------
//
// BUILD_RADIUS must be at least LOD_TILE_VISIBLE_RANGE + half a tile. Both
// radii are Chebyshev distances to the tile CENTRE, so a tile centre sits up
// to TILE_SIZE/2 farther away than the nearest building it holds: with
// BUILD_RADIUS below that bound, tiles the visibility pass happily marks
// `visible = true` are never eligible to be built, and the nearest-pending
// scan correctly runs out of candidates while the player is still looking at
// empty ground. That is what the "streaming stalls at Uttara South" report in
// docs/MAIN-WIRING.md was seeing: at 700 m the scan legitimately exhausts
// after 36 tiles, leaving 148 of the 813 buildings inside the 750 m visible
// range unbuilt (and 3348 of 10780 at the default scene's origin - it was
// never north-specific, just more obvious there against open ground).
const BUILD_RADIUS = LOD_TILE_VISIBLE_RANGE + TILE_SIZE / 2; // 850 m
const DISPOSE_RADIUS = 1100; // m; built tiles farther than this get their geometry freed
// DISPOSE_RADIUS - BUILD_RADIUS (250 m) stays wider than one tile, so a tile
// can't be built and disposed on alternating calls as the player walks.

// key -> { near, far, cx, cz, group }. `group` is null until the tile's
// geometry has been built; the bucket (near/far lists) survives dispose so
// a tile can be rebuilt without re-running the clip/far tests.
let tileBuckets = new Map();
let rootGroup = null; // the THREE.Group buildBuildings() returned, so updateBuildingLOD can add/remove tile groups
let buildMaterials = null; // { wallMat, roofMat, farWallMat } - shared across every tile, never disposed per-tile

const streamingStats = { built: 0, pending: 0, disposed: 0, lastBuildMs: 0 };

/** { built, pending, disposed, lastBuildMs } - also copied onto buildBuildings()'s returned stats. */
export function getStreamingStats() {
  return { ...streamingStats };
}

/** True if building `b` is outside the 400 m playable corridor. */
function isFarBuilding(scene, b) {
  if (b.far === 1) return true;
  const ring = b.p;
  const n = ring.length / 2;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += ring[i * 2];
    cz += ring[i * 2 + 1];
  }
  cx /= n;
  cz /= n;
  return distToCentreline(scene, cx, cz) > FAR_DISTANCE;
}

// Per-build list of { group, cx, cz } for updateBuildingLOD to walk each
// frame. Rebuilt at the top of every buildBuildings() call.
let tileGroups = [];
let lodWarnTimer = null;
let lodCalled = false;

/**
 * Set each tile's visibility based on distance from the player (Chebyshev on
 * tile centres, per the brief - cheap and good enough for a visibility cut).
 * main.js must call this once per frame; see docs/LOD-PASS.md for the exact
 * line. Cheap: ~100 tiles, a couple of Math.abs each.
 */
// Live copy of LOD_TILE_VISIBLE_RANGE. The perf governor (src/perf-governor.js)
// pulls it in on machines that cannot hold 60 fps even at the resolution floor.
let tileVisibleRange = LOD_TILE_VISIBLE_RANGE;
/** @param {number} scale 0.5..1 */
export function setBuildingLodScale(scale) {
  tileVisibleRange = LOD_TILE_VISIBLE_RANGE * scale;
}

export function updateBuildingLOD(playerX, playerZ) {
  lodCalled = true;
  for (const t of tileGroups) {
    const dx = Math.abs(playerX - t.cx);
    const dz = Math.abs(playerZ - t.cz);
    t.group.visible = Math.max(dx, dz) < tileVisibleRange;
  }

  // P2-STREAMING: build the single nearest still-pending tile within
  // BUILD_RADIUS (one tile per call - see docs/STREAMING.md for measured
  // per-tile build times vs. the ~8ms budget), then dispose any built tile
  // that has fallen behind DISPOSE_RADIUS. Skipped entirely before the
  // first buildBuildings() call, or if buildBuildings() was never called
  // with `opts` (rootGroup/buildMaterials still get set either way, but
  // tileBuckets will simply have nothing left pending).
  if (!rootGroup || !buildMaterials) return;

  let nearestKey = null;
  let nearestDist = Infinity;
  for (const [key, bucket] of tileBuckets) {
    if (bucket.group || bucket.empty) continue; // already built, or known to hold no geometry
    const dx = Math.abs(playerX - bucket.cx);
    const dz = Math.abs(playerZ - bucket.cz);
    const dist = Math.max(dx, dz);
    if (dist < BUILD_RADIUS && dist < nearestDist) {
      nearestDist = dist;
      nearestKey = key;
    }
  }
  if (nearestKey) {
    const bucket = tileBuckets.get(nearestKey);
    const { tileGroup } = buildTileGeometry(nearestKey, bucket);
    if (!bucket.group) {
      // buildTileGeometry() produced no meshes at all (every footprint in the
      // bucket degenerate), so bucket.group stayed null. Without this flag the
      // scan would pick this same bucket as "nearest pending" on every
      // subsequent call and silently block every tile behind it forever. No
      // tile in scene.json or scene-north.json currently does this - the flag
      // (and the warning) exist so it can never fail silently if one ever does.
      bucket.empty = true;
      console.warn(`[stream] tile ${nearestKey} produced no geometry; marking it empty so it stops blocking the scan`);
    } else {
      const dx = Math.abs(playerX - bucket.cx);
      const dz = Math.abs(playerZ - bucket.cz);
      tileGroup.visible = Math.max(dx, dz) < tileVisibleRange;
      tileGroups.push({ group: tileGroup, cx: bucket.cx, cz: bucket.cz, key: nearestKey });
    }
  }

  for (let i = tileGroups.length - 1; i >= 0; i--) {
    const t = tileGroups[i];
    const dx = Math.abs(playerX - t.cx);
    const dz = Math.abs(playerZ - t.cz);
    if (Math.max(dx, dz) > DISPOSE_RADIUS) {
      const bucket = tileBuckets.get(t.key);
      if (bucket) disposeTile(bucket);
      tileGroups.splice(i, 1);
    }
  }

  streamingStats.built = tileGroups.length;
  streamingStats.pending = tileBuckets.size - streamingStats.built;
}

const FLOOR_H = 3.05;
const GROUND_BAND_H = 4.2; // metres of wall covered by the shopfront band
const UPPER_BAND_H = FLOOR_H * 4; // the atlas upper band is four storeys tall
const PANEL_W = 14; // metres of wall per horizontal atlas repeat

const CELL_U = 1 / ATLAS_COLS;
const CELL_V = 1 / ATLAS_ROWS;
const GROUND_FRAC = 0.14; // bottom 14% of each atlas cell is the shopfront

/** Stable per-building pseudo-random, matching the build script's hash. */
function rand(id, salt = 0) {
  let h = (id ^ (salt * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

/**
 * UV sub-rectangle for one atlas cell.
 * The canvas is flipped vertically by Three.js, so row 0 (canvas top) ends up
 * at the top of the UV range. The ground-floor band sits at the cell's bottom.
 */
function cellUV(index) {
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  const insetU = ATLAS_GUTTER / (CELL * ATLAS_COLS);
  const insetV = ATLAS_GUTTER / (CELL * ATLAS_ROWS);
  const u0 = col * CELL_U + insetU;
  const vLow = 1 - (row + 1) * CELL_V + insetV;
  const height = CELL_V - insetV * 2;
  return {
    u0,
    u1: (col + 1) * CELL_U - insetU,
    vGroundLo: vLow,
    vGroundHi: vLow + GROUND_FRAC * height,
    vUpperHi: vLow + height,
  };
}

// ---------------------------------------------------------------------------
// Building extrusion
// ---------------------------------------------------------------------------

/**
 * Append one building's walls to the supplied vertex arrays.
 *
 * Walls are emitted as a grid of quads: horizontally one panel per PANEL_W of
 * wall, vertically one shopfront band plus repeats of the four-storey upper
 * band. That keeps the texture at a consistent real-world scale instead of
 * stretching a single quad over a 20 m facade.
 */
function emitWalls(ring, height, uv, pos, nor, uvs, idx, colors, tint, shopUv, weatherSeed = 0) {
  const n = ring.length / 2;

  for (let i = 0; i < n; i++) {
    const ax = ring[i * 2];
    const az = ring[i * 2 + 1];
    const j = (i + 1) % n;
    const bx = ring[j * 2];
    const bz = ring[j * 2 + 1];

    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;

    // Outward normal. Rings are counter-clockwise in our XZ frame, which with
    // Z pointing south means the outward normal is (dz, -dx) normalised.
    const nx = dz / len;
    const nz = -dx / len;

    const panels = Math.max(1, Math.round(len / PANEL_W));

    // Vertical bands: [0, GROUND_BAND_H] then UPPER_BAND_H repeats.
    const bands = [];
    if (height <= GROUND_BAND_H + 0.6) {
      bands.push({ y0: 0, y1: height, v0: shopUv.vGroundLo, v1: shopUv.vGroundLo + (height / GROUND_BAND_H) * (shopUv.vGroundHi - shopUv.vGroundLo) });
    } else {
      bands.push({ y0: 0, y1: GROUND_BAND_H, v0: shopUv.vGroundLo, v1: shopUv.vGroundHi });
      let y = GROUND_BAND_H;
      while (y < height - 0.05) {
        const top = Math.min(y + UPPER_BAND_H, height);
        const frac = (top - y) / UPPER_BAND_H;
        bands.push({
          y0: y,
          y1: top,
          v0: uv.vGroundHi,
          v1: uv.vGroundHi + frac * (uv.vUpperHi - uv.vGroundHi),
        });
        y = top;
      }
    }

    for (let p = 0; p < panels; p++) {
      const t0 = p / panels;
      const t1 = (p + 1) / panels;
      const x0 = ax + dx * t0;
      const z0 = az + dz * t0;
      const x1 = ax + dx * t1;
      const z1 = az + dz * t1;

      for (let bandIndex = 0; bandIndex < bands.length; bandIndex++) {
        const band = bands[bandIndex];
        const base = pos.length / 3;

        pos.push(x0, band.y0, z0, x1, band.y0, z1, x1, band.y1, z1, x0, band.y1, z0);
        for (let k = 0; k < 4; k++) nor.push(nx, 0, nz);
        const bandUv = band.y0 === 0 ? shopUv : uv;
        uvs.push(bandUv.u0, band.v0, bandUv.u1, band.v0, bandUv.u1, band.v1, bandUv.u0, band.v1);
        // Keep the atlas readable while breaking the perfectly uniform tint
        // that made long street walls repeat. The deterministic variation is
        // per panel and floor band, so it adds age/staining without another
        // material or draw call.
        const grain = Math.sin(weatherSeed * 0.017 + p * 1.73 + bandIndex * 2.41) * 0.5 + 0.5;
        const lowerStain = band.y0 < GROUND_BAND_H ? 0.93 : 1;
        const weather = (0.94 + grain * 0.1) * lowerStain;
        const r = Math.min(1, tint.r * weather);
        const g = Math.min(1, tint.g * weather);
        const b = Math.min(1, tint.b * weather);
        for (let k = 0; k < 4; k++) colors.push(r, g, b);

        // Wound so the face normal points out of the building. The vertex
        // order above runs bottom-left, bottom-right, top-right, top-left,
        // which needs the reversed triangle order to face outward.
        idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
  }
}

/**
 * Append the flat roof cap. Returns the triangle count added.
 *
 * `uvFn(x, z)` maps a world-space vertex to a UV pair; defaults to the
 * roof texture's native "repeat every 8 m" mapping. P1-B2 passes a
 * different `uvFn` for far-building roofs so they can share the facade
 * atlas material with the walls (see `farRoofUV` below) instead of
 * needing their own draw call for a separate roof texture.
 */
function emitRoof(ring, holes, height, pos, nor, uvs, idx, uvFn = (x, z) => [x / 8, z / 8]) {
  const verts = [];
  for (let i = 0; i < ring.length; i += 2) verts.push(ring[i], ring[i + 1]);

  const holeIndices = [];
  if (holes) {
    for (const h of holes) {
      holeIndices.push(verts.length / 2);
      for (let i = 0; i < h.length; i += 2) verts.push(h[i], h[i + 1]);
    }
  }

  let tris;
  try {
    tris = earcut(verts, holeIndices.length ? holeIndices : null, 2);
  } catch {
    return 0;
  }
  if (!tris || tris.length < 3) return 0;

  const base = pos.length / 3;
  for (let i = 0; i < verts.length; i += 2) {
    pos.push(verts[i], height, verts[i + 1]);
    nor.push(0, 1, 0);
    const [u, v] = uvFn(verts[i], verts[i + 1]);
    uvs.push(u, v);
  }
  // earcut returns clockwise winding for our CCW input when viewed from +Y,
  // so reverse each triangle to face upward.
  for (let i = 0; i < tris.length; i += 3) {
    idx.push(base + tris[i], base + tris[i + 2], base + tris[i + 1]);
  }
  return tris.length / 3;
}

// ---------------------------------------------------------------------------
// P1-B2: far roof UV, sharing the facade atlas with far walls
//
// Far buildings (P1-B) are never seen up close (they're always beyond
// 400 m), so the roof doesn't need its own texture or draw call. Instead of
// the separate roofTex material, far roofs sample a single "plain" cell of
// the same facade atlas used for far walls, so wall+roof can be one
// BufferGeometry with one material - the brief's "simplest acceptable"
// option. Cell 0's ground-floor band (the plainest, most uniform strip of
// the atlas) is tiled every 8 m in world space, same repeat rate the old
// dedicated roof texture used.
// (makeFarRoofUV removed: far roofs now use authentic roofMat directly,
// preventing far rooftops from sampling ground floor storefront signboards)

// ---------------------------------------------------------------------------
// Rooftop clutter
//
// Water tanks, rebar stubs and satellite dishes. These are the same shape on
// every roof, so unlike the buildings they are a genuine instancing win.
// ---------------------------------------------------------------------------

/**
 * `entries` is a list of { b, ring } - `ring` is the (possibly P0-E4b
 * clipped) footprint to place props over, `b` is the source building for
 * id/height/level. Buildings dropped entirely by the corridor clip must be
 * excluded by the caller before this runs.
 */
function buildRooftopProps(entries) {
  const tanks = [];
  const stubs = [];
  const dishes = [];

  for (const { b, ring } of entries) {
    if (b.h < 5) continue; // tin sheds get nothing

    const n = ring.length / 2;
    let cx = 0;
    let cz = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      cx += ring[i * 2];
      cz += ring[i * 2 + 1];
      minX = Math.min(minX, ring[i * 2]);
      maxX = Math.max(maxX, ring[i * 2]);
      minZ = Math.min(minZ, ring[i * 2 + 1]);
      maxZ = Math.max(maxZ, ring[i * 2 + 1]);
    }
    cx /= n;
    cz /= n;
    const inset = Math.min(maxX - minX, maxZ - minZ) * 0.25;
    if (inset < 0.8) continue;

    const r = rand(b.id, 21);

    // Black PVC water tank on a steel stand: on nearly every roof here.
    if (r < 0.82) {
      const ox = (rand(b.id, 22) - 0.5) * inset * 1.4;
      const oz = (rand(b.id, 23) - 0.5) * inset * 1.4;
      tanks.push({ x: cx + ox, y: b.h, z: cz + oz, s: 0.85 + rand(b.id, 24) * 0.5 });
      if (rand(b.id, 31) < 0.35) {
        tanks.push({
          x: cx - ox * 0.7,
          y: b.h,
          z: cz - oz * 0.7,
          s: 0.8 + rand(b.id, 32) * 0.4,
        });
      }
    }

    // Rust-orange rebar stubs: the building is waiting for another floor.
    if (b.lv >= 4 && rand(b.id, 25) < 0.34) {
      const count = 4 + Math.floor(rand(b.id, 26) * 6);
      for (let i = 0; i < count; i++) {
        const t = i / count;
        const px = minX + (maxX - minX) * ((rand(b.id, 40 + i) + t) % 1);
        const pz = minZ + (maxZ - minZ) * ((rand(b.id, 60 + i) + t * 0.7) % 1);
        stubs.push({ x: px, y: b.h, z: pz, s: 0.7 + rand(b.id, 80 + i) * 0.8 });
      }
    }

    // Satellite dish.
    if (rand(b.id, 27) < 0.45) {
      dishes.push({
        x: cx + (rand(b.id, 28) - 0.5) * inset * 1.6,
        y: b.h + 0.5,
        z: cz + (rand(b.id, 29) - 0.5) * inset * 1.6,
        rot: rand(b.id, 30) * Math.PI * 2,
      });
    }
  }

  return { tanks, stubs, dishes };
}

function makeRooftopMeshes({ tanks, stubs, dishes }) {
  const group = new THREE.Group();
  group.name = 'rooftop-props';
  const dummy = new THREE.Object3D();

  // Water tanks: black PVC drum sitting on a low steel frame.
  if (tanks.length) {
    const tankGeo = new THREE.CylinderGeometry(0.62, 0.66, 1.25, 10);
    tankGeo.translate(0, 1.25 / 2 + 0.55, 0);
    const tankMat = new THREE.MeshLambertMaterial({ color: 0x24242a });
    const tankMesh = new THREE.InstancedMesh(tankGeo, tankMat, tanks.length);
    tankMesh.castShadow = false;

    const standGeo = new THREE.BoxGeometry(1.2, 0.55, 1.2);
    standGeo.translate(0, 0.275, 0);
    const standMat = new THREE.MeshLambertMaterial({ color: 0x6b6259 });
    const standMesh = new THREE.InstancedMesh(standGeo, standMat, tanks.length);

    tanks.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.scale.setScalar(t.s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      tankMesh.setMatrixAt(i, dummy.matrix);
      standMesh.setMatrixAt(i, dummy.matrix);
    });
    tankMesh.instanceMatrix.needsUpdate = true;
    standMesh.instanceMatrix.needsUpdate = true;
    group.add(tankMesh, standMesh);
  }

  // Rebar stubs poking out of the roof slab.
  if (stubs.length) {
    const geo = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 4);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a5b34 });
    const mesh = new THREE.InstancedMesh(geo, mat, stubs.length);
    stubs.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.set(1, s.s, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // Satellite dishes.
  if (dishes.length) {
    const geo = new THREE.SphereGeometry(0.45, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
    const mat = new THREE.MeshLambertMaterial({ color: 0xd8d4cb, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, dishes.length);
    dishes.forEach((d, i) => {
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(Math.PI * 0.72, d.rot, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Emit one wall+roof mesh pair for near buildings into `tileGroup` - 2 draw
 * calls (wallMat, roofMat), unchanged from P1-B. Near buildings keep their
 * own materials/textures and shadow behaviour since they're the ones the
 * player actually walks past. Returns the triangle count added.
 */
function emitNearTileMeshes(tileGroup, key, list, wallMat, roofMat) {
  if (!list.length) return 0;
  let tris = 0;
  const wPos = [];
  const wNor = [];
  const wUv = [];
  const wIdx = [];
  const wColor = [];
  const rPos = [];
  const rNor = [];
  const rUv = [];
  const rIdx = [];

  for (const { b, ring, wasClipped } of list) {
    const isUttara = (ring && ring.length >= 2 ? ring[1] : 0) < UTTARA_Z_THRESHOLD;
    const cellIndex = isUttara
      ? UTTARA_START_CELL + (Math.floor(rand(b.id, 3) * UTTARA_CELL_COUNT) % UTTARA_CELL_COUNT)
      : Math.floor(rand(b.id, 3) * MIRPUR_CELL_COUNT) % MIRPUR_CELL_COUNT;
    const uv = cellUV(cellIndex);
    const shopUv = cellUV(isUttara
      ? UTTARA_START_CELL + Math.floor(rand(b.id, 17) * UTTARA_CELL_COUNT)
      : Math.floor(rand(b.id, 17) * MIRPUR_CELL_COUNT));
    const tint = new THREE.Color().setHSL(0.06 + rand(b.id, 19) * 0.12, 0.04 + rand(b.id, 21) * 0.12, 0.83 + rand(b.id, 23) * 0.14);
    emitWalls(ring, b.h, uv, wPos, wNor, wUv, wIdx, wColor, tint, shopUv, b.id);
    // Holes are only meaningful against the building's original footprint
    // (they are rare - 3 buildings in the whole scene - and none sit in the
    // corridor); skip them on a clipped ring rather than risk an
    // out-of-bounds hole punching through the new edge.
    if (b.holes && !wasClipped) {
      for (const h of b.holes) emitWalls(h, b.h, uv, wPos, wNor, wUv, wIdx, wColor, tint, shopUv, b.id);
    }
    emitRoof(ring, wasClipped ? null : b.holes, b.h, rPos, rNor, rUv, rIdx);
  }

  if (wIdx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(wNor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(wColor, 3));
    g.setIndex(wIdx.length > 65535 ? new THREE.Uint32BufferAttribute(wIdx, 1) : new THREE.Uint16BufferAttribute(wIdx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, wallMat);
    m.name = `walls:${key}:near`;
    m.castShadow = true;
    m.receiveShadow = true;
    tileGroup.add(m);
    tris += wIdx.length / 3;
  }

  if (rIdx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(rNor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(rUv, 2));
    g.setIndex(rIdx.length > 65535 ? new THREE.Uint32BufferAttribute(rIdx, 1) : new THREE.Uint16BufferAttribute(rIdx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, roofMat);
    m.name = `roofs:${key}:near`;
    m.castShadow = false; // roofs never cast shadows here, near or far
    m.receiveShadow = true;
    tileGroup.add(m);
    tris += rIdx.length / 3;
  }
  return tris;
}

/**
 * Emit far buildings' wall and roof geometry.
 * Far walls sample the facade atlas with `farWallMat` (no emissive).
 * Far roofs use `roofMat` (the authentic procedural concrete roof texture with
 * bitumen patching) rather than sampling the facade atlas ground floor signboards.
 * Returns the triangle count added.
 */
function emitFarTileMesh(tileGroup, key, list, farWallMat, roofMat) {
  if (!list.length) return 0;
  let tris = 0;
  const wPos = [];
  const wNor = [];
  const wUv = [];
  const wIdx = [];
  const wColor = [];
  const rPos = [];
  const rNor = [];
  const rUv = [];
  const rIdx = [];

  for (const { b, ring, wasClipped } of list) {
    const isUttara = (ring && ring.length >= 2 ? ring[1] : 0) < UTTARA_Z_THRESHOLD;
    const cellIndex = isUttara
      ? UTTARA_START_CELL + (Math.floor(rand(b.id, 3) * UTTARA_CELL_COUNT) % UTTARA_CELL_COUNT)
      : Math.floor(rand(b.id, 3) * MIRPUR_CELL_COUNT) % MIRPUR_CELL_COUNT;
    const wallUv = cellUV(cellIndex);
    const shopUv = cellUV(isUttara
      ? UTTARA_START_CELL + Math.floor(rand(b.id, 17) * UTTARA_CELL_COUNT)
      : Math.floor(rand(b.id, 17) * MIRPUR_CELL_COUNT));
    const tint = new THREE.Color().setHSL(0.06 + rand(b.id, 19) * 0.12, 0.04 + rand(b.id, 21) * 0.12, 0.83 + rand(b.id, 23) * 0.14);
    emitWalls(ring, b.h, wallUv, wPos, wNor, wUv, wIdx, wColor, tint, shopUv, b.id);
    if (b.holes && !wasClipped) {
      for (const h of b.holes) emitWalls(h, b.h, wallUv, wPos, wNor, wUv, wIdx, wColor, tint, shopUv, b.id);
    }
    emitRoof(ring, wasClipped ? null : b.holes, b.h, rPos, rNor, rUv, rIdx);
  }

  if (wIdx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(wNor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(wColor, 3));
    g.setIndex(wIdx.length > 65535 ? new THREE.Uint32BufferAttribute(wIdx, 1) : new THREE.Uint16BufferAttribute(wIdx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, farWallMat);
    m.name = `walls:${key}:far`;
    m.castShadow = false;
    m.receiveShadow = false;
    tileGroup.add(m);
    tris += wIdx.length / 3;
  }

  if (rIdx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(rNor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(rUv, 2));
    g.setIndex(rIdx.length > 65535 ? new THREE.Uint32BufferAttribute(rIdx, 1) : new THREE.Uint16BufferAttribute(rIdx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, roofMat);
    m.name = `roofs:${key}:far`;
    m.castShadow = false;
    m.receiveShadow = false;
    tileGroup.add(m);
    tris += rIdx.length / 3;
  }
  return tris;
}

/**
 * P2-STREAMING: turn one pending tile bucket into geometry and add it to
 * `rootGroup`. Builds near+far wall/roof meshes (unchanged from P1-B2) plus
 * that tile's own rooftop-props group (previously one city-wide group; now
 * per tile so it can be disposed along with the rest of the tile). Mutates
 * `bucket.group`. Not split across frames (brief allows "one hitch per
 * tile" as a fallback) - see docs/STREAMING.md for measured per-tile times.
 */
function buildTileGeometry(key, bucket) {
  const bt0 = performance.now();
  const { wallMat, roofMat, farWallMat } = buildMaterials;
  const tileGroup = new THREE.Group();
  tileGroup.name = `tile:${key}`;
  let tris = 0;
  tris += emitNearTileMeshes(tileGroup, key, bucket.near, wallMat, roofMat);
  tris += emitFarTileMesh(tileGroup, key, bucket.far, farWallMat, roofMat);
  // Far buildings get no rooftop props (P1-B item 1, kept).
  if (bucket.near.length) {
    const rooftop = makeRooftopMeshes(buildRooftopProps(bucket.near));
    if (rooftop.children.length) tileGroup.add(rooftop);
  }
  if (tileGroup.children.length) {
    rootGroup.add(tileGroup);
    bucket.group = tileGroup;
  }
  const ms = performance.now() - bt0;
  streamingStats.lastBuildMs = Math.round(ms * 100) / 100;
  return { tileGroup, tris, ms };
}

/**
 * P2-STREAMING: free a built tile's geometry (and its rooftop-props'
 * per-tile materials, which unlike wallMat/roofMat/farWallMat are not
 * shared) and detach it from `rootGroup`. The bucket (near/far lists)
 * itself is kept in `tileBuckets` so the tile can be rebuilt later without
 * re-running the clip/far tests.
 */
function disposeTile(bucket) {
  if (!bucket.group) return;
  const { wallMat, roofMat, farWallMat } = buildMaterials;
  rootGroup.remove(bucket.group);
  bucket.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.material !== wallMat && o.material !== roofMat && o.material !== farWallMat) {
      o.material.dispose();
    }
  });
  bucket.group = null;
  streamingStats.disposed++;
}

/**
 * Build every building in the scene as merged per-tile meshes.
 *
 * P2-STREAMING: bucketing (clip + far-tag + tile assignment) always runs for
 * every building in `scene.buildings` - that part is cheap and
 * buildCollisionGrid needs the full clip result regardless. Turning a
 * bucket into actual geometry is deferred: with `opts` omitted, every tile
 * is built immediately (unchanged behaviour, matches the pre-streaming
 * function exactly). With `opts` given, only tiles within
 * `opts.initialRadius` (default 500 m) of `opts.start` (default: the
 * "Mirpur 10" station, or scene.metro.stations[0], or {0,0}) are built now;
 * the rest stay as pending buckets for updateBuildingLOD() to stream in.
 *
 * @param {object} scene       parsed scene.json
 * @param {THREE.Texture} facadeTex  the facade atlas
 * @param {THREE.Texture} roofTex    the rooftop texture
 * @param {THREE.Texture} [emissiveTex]  night lit-window emissive atlas
 * @param {{ start?: {x:number,z:number}, initialRadius?: number, excludeIds?: Iterable<number>, facadeSurfaces?: {normal: THREE.Texture, roughness: THREE.Texture} }} [opts]
 * @returns {{ group: THREE.Group, stats: object, colliders: object, wallMaterial: THREE.Material }}
 */
export function buildBuildings(scene, facadeTex, roofTex, emissiveTex, opts) {
  const t0 = performance.now();

  // Facade channels share atlas coordinates and material-specific surface response.
  const wallMat = new THREE.MeshStandardMaterial({
    map: facadeTex,
    vertexColors: true,
    roughness: 1,
    metalness: 0.0,
  });
  if (emissiveTex) {
    wallMat.emissiveMap = emissiveTex;
    wallMat.emissive = new THREE.Color(0xffffff);
    wallMat.emissiveIntensity = 0; // day: off. night.js lerps this to ~1.
    wallMat.setNightIntensity = (v) => {
      wallMat.emissiveIntensity = v;
    };
  }
  const roofMat = new THREE.MeshStandardMaterial({
    map: roofTex,
    roughness: 0.88,   // bitumen-patched concrete slab
    metalness: 0.0,
  });

  // Far-building material: same facade atlas, no emissive (P1-B: no lit
  // windows beyond the playable radius), same PBR settings as wallMat.
  const farWallMat = new THREE.MeshStandardMaterial({
    map: facadeTex,
    vertexColors: true,
    roughness: 1,
    metalness: 0.0,
  });

  if (opts?.facadeSurfaces) {
    wallMat.normalMap = opts.facadeSurfaces.normal;
    wallMat.normalScale.set(0.58, 0.58);
    wallMat.roughnessMap = opts.facadeSurfaces.roughness;
    farWallMat.roughnessMap = opts.facadeSurfaces.roughness;
  }

  // Roof normal + roughness from concrete-stained-2 (Concrete044D) —
  // slightly more damaged/patchy, suits the bitumen-waterproofed rooftop.
  loadTextureSet('concrete-stained-2').then((set) => {
    const r = 1 / 4; // 4 m repeat — roofs are smaller surfaces
    if (set.normalMap) {
      set.normalMap.repeat.set(r, r);
      roofMat.normalMap = set.normalMap;
    }
    if (set.roughnessMap) {
      set.roughnessMap.repeat.set(r, r);
      roofMat.roughnessMap = set.roughnessMap;
    }
    roofMat.needsUpdate = true;
  });

  // Bucket buildings into tiles, clipping any footprint that intrudes into
  // the metro carriageway (P0-E4b) instead of dropping the whole building -
  // nothing stands under the viaduct except the road, but the shop wall on
  // the footpath must stay continuous. Buildings that straddle the
  // centreline or are reduced to a sliver are dropped outright.
  //
  // Within each tile, near and far (P1-B, >400 m from the centreline)
  // buildings are kept in separate lists so they can be baked into separate
  // meshes: far buildings need a different material (no emissive) and
  // castShadow/receiveShadow = false, and must not receive rooftop props.
  footprintClipCache = new Map(); // fresh per build; see getClippedFootprint
  let clippedCount = 0;
  let droppedCount = 0;
  let roadOverlapCount = 0;
  let farCount = 0;
  // Buildings hand-modelled elsewhere (e.g. src/sangsad.js for the National
  // Parliament House, OSM relation 18085267) must never also get a
  // procedural box on the same footprint. Filtered by id, not index/find:
  // the scene emits a multi-ring relation like that as several records that
  // share one id. Excluded before bucketing so they produce no geometry,
  // rooftop props, emissive windows, far-LOD box, or stats - an absent/empty
  // set makes this loop's body identical to before this option existed.
  const excludeIds = opts?.excludeIds ? new Set(opts.excludeIds) : null;
  // key -> { near: [...], far: [...] }. This part is NOT deferred - every
  // building's clip/far result is needed by buildCollisionGrid too, and a
  // hash-map insert per building is cheap even at 35k buildings.
  const tiles = new Map();
  for (const b of scene.buildings) {
    if (excludeIds && excludeIds.has(b.id)) continue;
    const r = getClippedFootprint(scene, b);
    if (r.dropped) {
      droppedCount++;
      if (r.roadOverlap) roadOverlapCount++;
      continue;
    }
    if (r.clipped) clippedCount++;
    const far = isFarBuilding(scene, b);
    if (far) farCount++;
    const cx = r.ring[0];
    const cz = r.ring[1];
    const key = `${Math.floor(cx / TILE_SIZE)},${Math.floor(cz / TILE_SIZE)}`;
    let tile = tiles.get(key);
    if (!tile) tiles.set(key, (tile = { near: [], far: [] }));
    (far ? tile.far : tile.near).push({ b, ring: r.ring, wasClipped: r.clipped });
  }
  console.info(
    `[corridor] clipped ${clippedCount} building(s) at the carriageway edge (CARRIAGEWAY_HALF=${CARRIAGEWAY_HALF}m), dropped ${droppedCount} sliver/straddling footprint(s)`
  );
  console.info(`[roads] removed ${roadOverlapCount} building footprint(s) where an OSM road centreline ran through the footprint`);
  console.info(`[lod] ${farCount} of ${scene.buildings.length - droppedCount} building(s) tagged far (> ${FAR_DISTANCE}m from centreline)`);

  rootGroup = new THREE.Group();
  rootGroup.name = 'buildings';
  tileGroups = [];

  buildMaterials = { wallMat, roofMat, farWallMat };

  // key -> { near, far, cx, cz, group }. `group` stays null until
  // buildTileGeometry() runs for that key; see updateBuildingLOD() below.
  tileBuckets = new Map();
  for (const [key, { near, far }] of tiles) {
    const [ti, tj] = key.split(',').map(Number);
    const cx = (ti + 0.5) * TILE_SIZE;
    const cz = (tj + 0.5) * TILE_SIZE;
    tileBuckets.set(key, { near, far, cx, cz, group: null });
  }

  streamingStats.built = 0;
  streamingStats.pending = 0;
  streamingStats.disposed = 0;
  streamingStats.lastBuildMs = 0;

  // No opts => unchanged behaviour: build every tile right now (Infinity
  // radius), same as before this pass. With opts, only build tiles within
  // initialRadius of start; the rest stream in via updateBuildingLOD().
  let start = opts?.start;
  if (!start) {
    const stations = scene?.metro?.stations;
    const st = (stations && stations.find((s) => s.name === 'Mirpur 10')) || stations?.[0];
    start = st ? { x: st.x, z: st.z } : { x: 0, z: 0 };
  }
  const initialRadius = opts ? (opts.initialRadius ?? 500) : Infinity;

  let totalTris = 0;
  for (const [key, bucket] of tileBuckets) {
    const dx = bucket.cx - start.x;
    const dz = bucket.cz - start.z;
    if (Math.max(Math.abs(dx), Math.abs(dz)) > initialRadius) continue; // stays pending
    const { tris } = buildTileGeometry(key, bucket);
    totalTris += tris;
    if (bucket.group) {
      tileGroups.push({ group: bucket.group, cx: bucket.cx, cz: bucket.cz, key });
    }
  }

  streamingStats.built = tileGroups.length;
  streamingStats.pending = tileBuckets.size - streamingStats.built;

  let drawCalls = 0;
  rootGroup.traverse((o) => {
    if (o.isMesh) drawCalls++;
  });

  const stats = {
    tiles: tileBuckets.size,
    drawCalls,
    triangles: Math.round(totalTris),
    ms: Math.round(performance.now() - t0),
    ...getStreamingStats(), // P2-STREAMING: built/pending/disposed/lastBuildMs, also available via getStreamingStats()
  };

  // P1-B item 2: warn once if main.js's frame loop never wires up
  // updateBuildingLOD (see docs/LOD-PASS.md for the exact line to add).
  // updateBuildingLOD is now also the streaming driver (P2-STREAMING), so
  // this warning doubles as "streaming is not running" if opts was passed.
  lodCalled = false;
  if (lodWarnTimer) clearTimeout(lodWarnTimer);
  lodWarnTimer = setTimeout(() => {
    if (!lodCalled) {
      console.warn(
        '[lod] updateBuildingLOD(playerX, playerZ) has not been called ~5s after the scene build finished - ' +
          'distance tile culling AND tile streaming are not running. See docs/LOD-PASS.md / docs/STREAMING.md for the one line main.js needs to add.'
      );
    }
  }, 5000);

  return { group: rootGroup, stats, wallMaterial: wallMat };
}

// ---------------------------------------------------------------------------
// Collision
//
// The player is blocked by building walls. A full mesh collider would be
// wasteful, so we keep the footprint edges in a uniform grid and only test the
// handful of edges in the player's own cell and its neighbours.
// ---------------------------------------------------------------------------

const COLLIDE_CELL = 25;

export function buildCollisionGrid(buildings, roads = null) {
  const grid = new Map();
  // P0-E4b: collide against the same clipped footprints buildBuildings just
  // emitted, not the original ones, so the player can walk onto the newly
  // reclaimed strip of former-carriageway rather than bouncing off a wall
  // that no longer exists.
  let corridorSkipped = 0;
  let roadSkipped = 0;

  // Spatial index of drivable road segments so building wall edges that intrude
  // into road carriageways (OSM extraction errors / building-road overlaps)
  // do not create blockages where cars cannot pass.
  let roadIndex = null;
  if (roads && roads.length) {
    const ROAD_CELL = 30;
    const roadMap = new Map();
    for (const r of roads) {
      if (r.rank < 1) continue; // rank 0 are footpaths
      const halfW = (r.w || 6) / 2;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const p0 = r.pts[i];
        const p1 = r.pts[i + 1];
        const minX = Math.min(p0[0], p1[0]) - halfW;
        const maxX = Math.max(p0[0], p1[0]) + halfW;
        const minZ = Math.min(p0[1], p1[1]) - halfW;
        const maxZ = Math.max(p0[1], p1[1]) + halfW;
        const cx0 = Math.floor(minX / ROAD_CELL);
        const cx1 = Math.floor(maxX / ROAD_CELL);
        const cz0 = Math.floor(minZ / ROAD_CELL);
        const cz1 = Math.floor(maxZ / ROAD_CELL);
        const seg = [p0[0], p0[1], p1[0], p1[1], halfW];
        for (let x = cx0; x <= cx1; x++) {
          for (let z = cz0; z <= cz1; z++) {
            const key = x * 100000 + z;
            let list = roadMap.get(key);
            if (!list) roadMap.set(key, (list = []));
            list.push(seg);
          }
        }
      }
    }
    roadIndex = {
      isInsideRoad(px, pz, margin = 0.4) {
        const cx = Math.floor(px / ROAD_CELL);
        const cz = Math.floor(pz / ROAD_CELL);
        const list = roadMap.get(cx * 100000 + cz);
        if (!list) return false;
        for (const [ax, az, bx, bz, halfW] of list) {
          const clearW = halfW - margin;
          if (clearW <= 0.5) continue;
          const dx = bx - ax;
          const dz = bz - az;
          const l2 = dx * dx + dz * dz;
          if (l2 < 1e-8) {
            if (Math.hypot(px - ax, pz - az) < clearW) return true;
            continue;
          }
          let t = ((px - ax) * dx + (pz - az) * dz) / l2;
          t = Math.max(0, Math.min(1, t));
          const qx = ax + t * dx;
          const qz = az + t * dz;
          if (Math.hypot(px - qx, pz - qz) < clearW) return true;
        }
        return false;
      },
    };
  }

  const addEdge = (ax, az, bx, bz) => {
    if (roadIndex) {
      const midX = (ax + bx) / 2;
      const midZ = (az + bz) / 2;
      if (roadIndex.isInsideRoad(midX, midZ) || roadIndex.isInsideRoad(ax, az, 0.6) || roadIndex.isInsideRoad(bx, bz, 0.6)) {
        roadSkipped++;
        return;
      }
    }
    const seg = [ax, az, bx, bz];
    const cx0 = Math.floor(Math.min(ax, bx) / COLLIDE_CELL);
    const cx1 = Math.floor(Math.max(ax, bx) / COLLIDE_CELL);
    const cz0 = Math.floor(Math.min(az, bz) / COLLIDE_CELL);
    const cz1 = Math.floor(Math.max(az, bz) / COLLIDE_CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx * 100000 + cz;
        let arr = grid.get(k);
        if (!arr) grid.set(k, (arr = []));
        arr.push(seg);
      }
    }
  };

  for (const b of buildings) {
    const r = getClippedFootprint(undefined, b);
    if (r.dropped) {
      corridorSkipped++;
      continue;
    }
    const ring = r.ring;
    const n = ring.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      addEdge(ring[i * 2], ring[i * 2 + 1], ring[j * 2], ring[j * 2 + 1]);
    }
  }
  console.info(`[corridor] collision grid: skipped ${corridorSkipped} dropped building(s), ${roadSkipped} road-blocking edge(s), clipped the rest at the carriageway edge`);

  return {
    cell: COLLIDE_CELL,
    grid,
    /** All wall segments near a world point. */
    near(x, z) {
      const cx = Math.floor(x / COLLIDE_CELL);
      const cz = Math.floor(z / COLLIDE_CELL);
      const out = [];
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const arr = grid.get((cx + i) * 100000 + (cz + j));
          if (arr) out.push(...arr);
        }
      }
      return out;
    },
  };
}

/**
 * Push a proposed position out of any wall it has entered.
 * Returns the corrected [x, z].
 *
 * P7-COLLISION item 2 (docs/PLAN-COLLISION-PHYSICS.md gap #3): `y` is an
 * OPTIONAL 5th argument, the mover's own height (feetY for a walker, the
 * car's y for drive.js). A segment may now carry an optional trailing
 * `[yMin, yMax]` band (segment array length 6 instead of 4 — see
 * `pushBoxFootprint` below and `walkable.js#addSegments`, which passes
 * whatever array it is given straight into the grid unmodified, extra
 * elements included, so no change there was needed).
 *
 * Backwards compatibility, guaranteed two ways at once:
 *  - Every existing caller (player.js:321, drive.js:958) passes exactly 4
 *    arguments, so `y` is `undefined` there. When `y` is undefined this
 *    function skips the band check entirely and behaves exactly as before
 *    this pass, for EVERY segment, banded or not.
 *  - Even a caller that does pass `y`, a segment with no band (length 4,
 *    `s[4] === undefined`) still collides at every height, matching "no
 *    band = solid at all heights" from the brief.
 * Only a segment that HAS a band, tested by a caller that DOES pass y, is
 * ever skipped — so player.js and drive.js, which do not pass y, keep
 * colliding with the piers/columns below exactly as they do with buildings.
 */
export function resolveCollision(collision, x, z, radius, y) {
  const segs = collision.near(x, z);
  let px = x;
  let pz = z;
  const checkBand = y !== undefined;

  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (const s of segs) {
      if (checkBand && s.length >= 6 && (y < s[4] || y > s[5])) continue; // outside this segment's height band: pass under/over it
      const dx = s[2] - s[0];
      const dz = s[3] - s[1];
      const l2 = dx * dx + dz * dz;
      if (l2 < 1e-8) continue;
      let t = ((px - s[0]) * dx + (pz - s[1]) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const qx = s[0] + t * dx;
      const qz = s[1] + t * dz;
      const ox = px - qx;
      const oz = pz - qz;
      const d = Math.hypot(ox, oz);
      if (d < radius && d > 1e-6) {
        const push = (radius - d) / d;
        px += ox * push;
        pz += oz * push;
        moved = true;
      } else if (d <= 1e-6) {
        px += 0.01;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return [px, pz];
}

// ---------------------------------------------------------------------------
// P7-COLLISION item 1 (docs/PLAN-COLLISION-PHYSICS.md gap #1): solid
// obstacles beyond building footprints.
//
// buildCollisionGrid() above only ever sees scene.buildings. The viaduct
// piers, the station portal columns and the streetlight/power poles built by
// metro.js and streets.js were in NO collision set at all — the single most
// prominent obstacle on the map (a pier standing in a kerbed island in the
// MIDDLE of the carriageway, per the owner's photos) was a ghost you could
// drive straight through.
//
// Two different techniques, because the source geometry is built two
// different ways (metro.js and streets.js are read-only this pass):
//  - Piers and poles are THREE.InstancedMesh (metro.js's pierPts shaft/cap/
//    base meshes, streets.js's cobra-streetlight and power-pole meshes).
//    Every instance's own geometry bounding box, transformed by that
//    instance's matrix, gives its real-world footprint and height band
//    directly — walk the scene graph by group name ('metro',
//    'street-furniture'), the same "reach it by object name" technique
//    night.js already uses (src/night.js `findLampWorldPositions`) to find
//    the streetlight heads for the night-lighting pass. No metro.js/
//    streets.js edit needed, and nothing is hard-coded: however many piers
//    or poles actually got built is however many get ingested.
//  - Station portal columns are baked into ONE merged mesh per material per
//    station (metro.js's bake()/buckets, the same merge-by-material pattern
//    interior.js's createBucketer uses) — there is no per-column object or
//    instance to find at runtime. They are instead computed analytically
//    from the ACTUAL station group's world transform (`station:<name>`,
//    read at runtime rather than recomputing heading, so this tracks
//    whatever the metro executor actually placed) plus METRO's exported
//    CONCOURSE_LEN/CONCOURSE_W/CONCOURSE_Y and the placement rule read from
//    metro.js's source (4 columns per side, 15 m spacing, 7.5 m end inset,
//    1.2 m square, standing at the footpath edge CONCOURSE_W/2 off the
//    centreline) — those four numbers are metro.js-private constants with
//    no export, duplicated here with this comment as the paper trail; if
//    metro.js's layout ever changes, ingestSceneColliders's logged count is
//    how that drift would be noticed.
// ---------------------------------------------------------------------------

// Above this height nothing at street level (a car roof, a walking head) can
// touch the object, so an InstancedMesh instance entirely above it is
// excluded — this is what keeps pier caps, parapet streetlights and OCS
// masts (all up on the viaduct deck) OUT of the ground collision set while
// still catching the pier shaft and the street-level pole that share the
// same (x,z).
const REACH_MAX_Y = 2.8;
const REACH_MIN_Y = -0.5; // ground-datum tolerance

/**
 * Push a rectangular footprint (world space) as 4 wall segments through the
 * collision.addSegments() extension point (proven by interior.js, wired in
 * main.js:234). `yMin`/`yMax` are optional — omit for a full-height wall.
 */
function pushBoxFootprint(collision, cx, cz, halfW, halfD, yaw, yMin, yMax) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const local = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];
  const corners = local.map(([lx, lz]) => [cx + lx * c - lz * s, cz + lx * s + lz * c]);
  const segs = [];
  const hasBand = Number.isFinite(yMin) && Number.isFinite(yMax);
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    segs.push(hasBand ? [a[0], a[1], b[0], b[1], yMin, yMax] : [a[0], a[1], b[0], b[1]]);
  }
  collision.addSegments(segs);
}

/**
 * Find every InstancedMesh under the named scene-graph group whose
 * instances have any part between REACH_MIN_Y/REACH_MAX_Y, and turn each
 * into a box footprint sized from that instance's own geometry bounding
 * box (transformed by its instance matrix). Multiple meshes anchored at the
 * same (x,z) — a pier's shaft + base, a streetlight's pole + arm + head —
 * are merged into ONE footprint (widest XZ extent, union of Y ranges) so
 * one physical pole/pier does not become several overlapping colliders.
 * Returns the number of DISTINCT obstacles ingested (not instance count).
 */
function ingestInstancedGroundObstacles(root, groupName, collision) {
  const group = root.getObjectByName(groupName);
  if (!group) return 0;
  group.updateMatrixWorld(true);

  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const euler = new THREE.Euler();
  let count = 0;

  group.traverse((obj) => {
    if (!obj.isInstancedMesh) return;
    const geo = obj.geometry;
    if (!geo) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!isFinite(bb.min.x)) return;
    const corners = [
      [bb.min.x, bb.min.y, bb.min.z], [bb.max.x, bb.min.y, bb.min.z],
      [bb.min.x, bb.min.y, bb.max.z], [bb.max.x, bb.min.y, bb.max.z],
      [bb.min.x, bb.max.y, bb.min.z], [bb.max.x, bb.max.y, bb.min.z],
      [bb.min.x, bb.max.y, bb.max.z], [bb.max.x, bb.max.y, bb.max.z],
    ];
    for (let i = 0; i < obj.count; i++) {
      obj.getMatrixAt(i, m);
      m.premultiply(obj.matrixWorld);
      let minY = Infinity, maxY = -Infinity;
      for (const [lx, ly, lz] of corners) {
        v.set(lx, ly, lz).applyMatrix4(m);
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
      // Reachability filter: parapet lamps, OCS masts and pier caps sit
      // entirely above REACH_MAX_Y — a street-level car/pedestrian cannot
      // reach them, so they are deliberately excluded here.
      if (maxY < REACH_MIN_Y || minY > REACH_MAX_Y) continue;

      m.decompose(pos, quat, scl);
      euler.setFromQuaternion(quat, 'YXZ');

      // Local half-extents (unrotated, scaled by instance scale).
      // Calculating from unrotated local bounds avoids double-rotating
      // bounding boxes, which previously inflated colliders by ~1.5-2x
      // and caused pier bases to intrude into carriageways.
      const halfW = Math.max(((bb.max.x - bb.min.x) / 2) * scl.x, 0.08);
      const halfD = Math.max(((bb.max.z - bb.min.z) / 2) * scl.z, 0.08);

      // Local center offset if geometry is not centered at origin
      const localMidX = ((bb.min.x + bb.max.x) / 2) * scl.x;
      const localMidZ = ((bb.min.z + bb.max.z) / 2) * scl.z;
      const c = Math.cos(euler.y);
      const s = Math.sin(euler.y);
      const cx = pos.x + localMidX * c - localMidZ * s;
      const cz = pos.z + localMidX * s + localMidZ * c;

      pushBoxFootprint(collision, cx, cz, halfW, halfD, euler.y, minY, maxY);
      count++;
    }
  });

  return count;
}

// Mirrors metro.js's private portal-column layout constants (PORTAL_COL_X,
// PORTAL_COL_SIZE and the placement loop in buildStation) — see the block
// comment above for why these can't be found as scene-graph objects and had
// to be read from source instead.
const PORTAL_COL_SPACING = 15;
const PORTAL_COL_EDGE_INSET = 7.5;
const PORTAL_COL_SIZE = 1.2;

function ingestPortalColumns(root, stations, metroConsts, collision) {
  if (!stations || !metroConsts) return 0;
  const { CONCOURSE_LEN, CONCOURSE_W, CONCOURSE_Y } = metroConsts;
  if (!CONCOURSE_LEN || !CONCOURSE_W || !CONCOURSE_Y) return 0;
  const halfL = CONCOURSE_LEN / 2;
  const colX = CONCOURSE_W / 2; // footpath edge — equals metro.js's PORTAL_COL_X by construction (13.5 = 27/2)
  const halfSize = PORTAL_COL_SIZE / 2;
  let count = 0;

  for (const st of stations) {
    // Prefer the ACTUAL built station group's world transform over
    // recomputing heading ourselves — reach it by object name
    // ('station:<name>', set at metro.js:790) so this tracks whatever the
    // metro executor's code really placed, per docs/briefs/P0-COMMON.md.
    let x = st.x;
    let z = st.z;
    let heading = st.heading ?? 0;
    const stationGroup = root.getObjectByName(`station:${st.name}`);
    if (stationGroup) {
      stationGroup.updateMatrixWorld(true);
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      stationGroup.matrixWorld.decompose(p, q, s);
      x = p.x;
      z = p.z;
      heading = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    }
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    for (const sx of [-1, 1]) {
      for (let d = -halfL + PORTAL_COL_EDGE_INSET; d <= halfL - PORTAL_COL_EDGE_INSET + 0.01; d += PORTAL_COL_SPACING) {
        const lx = sx * colX;
        // Same local-to-world rotation metro.js itself uses (metro.js:1010-1011).
        const wx = x + lx * cos + d * sin;
        const wz = z - lx * sin + d * cos;
        pushBoxFootprint(collision, wx, wz, halfSize, halfSize, heading, 0, CONCOURSE_Y);
        count++;
      }
    }
  }
  return count;
}

/**
 * Feed structural obstacles that buildCollisionGrid() never sees — viaduct
 * piers, station portal columns, streetlights and poles — into the shared
 * collision grid via the existing collision.addSegments() extension point.
 * Call AFTER metro.js's and streets.js's groups are in the scene AND after
 * collision.addSegments has been wired (main.js does both before calling
 * this — see main.js's call site for the exact order).
 *
 * @param root THREE.Object3D scene root (scene3 in main.js)
 * @param collision buildCollisionGrid() result, with .addSegments wired
 * @param metroResult the object buildMetro() returned (for .stations)
 * @param metroConsts the METRO export from metro.js (CONCOURSE_LEN etc.)
 */
export function ingestSceneColliders(root, collision, metroResult, metroConsts) {
  if (!root || !collision || typeof collision.addSegments !== 'function') {
    console.warn('[collision] ingestSceneColliders: collision.addSegments is not wired yet — nothing ingested');
    return { piers: 0, poles: 0, portals: 0 };
  }
  const piers = ingestInstancedGroundObstacles(root, 'metro', collision);
  const poles = ingestInstancedGroundObstacles(root, 'street-furniture', collision);
  const portals = ingestPortalColumns(root, metroResult?.stations, metroConsts, collision);
  console.info(
    `[collision] ingested ${piers} pier/pole footprint(s) from 'metro', ${poles} pole/lamp footprint(s) from 'street-furniture', ` +
      `and ${portals} station portal column(s) (analytic) — none of these were previously in any collision set.`
  );
  return { piers, poles, portals };
}
