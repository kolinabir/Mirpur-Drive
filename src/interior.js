/**
 * interior.js
 *
 * Walkable station interiors: entrance cores, concourse (ticketing + AFC gate
 * line), and platforms, per reference/metro/interior/SPEC-INTERIOR.md. Built
 * lazily the first time the player comes within 120 m of a station (see
 * `update`), then kept for the rest of the session.
 *
 * Coordinates below are STATION-LOCAL (X = across the spine, Z = along it),
 * matching the convention `src/metro.js` uses for its own baked geometry
 * (box(width, height, depth) placed at [localX, y, localZ] inside a group
 * rotated by `heading`). `localToWorld` converts a local point to world
 * space with that same rotation so the walkable registry and the collision
 * segments this file registers land exactly under the visible station.
 * `worldToLocal` is the inverse, used to place entrance cores at
 * `station.entrances[]`'s real world coordinates (P1-E3c).
 *
 * This module only READS `METRO` / `metro.stations` (owned by src/metro.js)
 * and only WRITES into the `walkable` registry and `collision` object handed
 * to it — it never edits src/metro.js, src/signs.js or src/streets.js
 * (P11-I item 2 imports sign FACTORIES from signs.js, read-only, same as
 * this file already imports METRO from metro.js).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { METRO } from './metro.js';
import { getPlatformRoute } from './metro-routes.js';
import { chooseLiftFloor } from './lift-menu.js';
import { loadTextureSet } from './textures.js';
import {
  LINE_STOPS,
  makeLineStripMap,
  makeDirectionBoard,
  makePlatformNumberSign,
  makeExitSign,
  makeNextTrainDisplay,
} from './signs.js';

// E2 is still adding these to METRO; fall back to the values in
// reference/metro/interior/SPEC-INTERIOR.md / the P0-E3 brief until then.
const PLATFORM_W = METRO.PLATFORM_W ?? 5;
const PLATFORM_INNER_X = METRO.PLATFORM_INNER_X ?? 3.48;
const CANOPY_SPAN = METRO.CANOPY_SPAN ?? 22;
const TRACK_CENTRES = METRO.TRACK_CENTRES ?? 3.9;
const CONCOURSE_W = METRO.CONCOURSE_W ?? 20;
const CONCOURSE_LEN = METRO.CONCOURSE_LEN ?? 60;

const BUILD_RADIUS = 120;
const RUN_ENTRANCE = 7; // halfD of the street<->concourse ramp (14 m run)
const RUN_PLATFORM = METRO.PLATFORM_CORE_HALF_D ?? 6.5; // halfD of the concourse<->platform ramp (13 m run, 7.48/13 = 29.9 deg gradient)
const PLATFORM_CORE_X = METRO.PLATFORM_CORE_X ?? 6.8;
const PLATFORM_CORE_HALF_W = METRO.PLATFORM_CORE_HALF_W ?? 1.8;
const PLATFORM_CORE_Z = METRO.PLATFORM_CORE_Z ?? 12;
const PLATFORM_CORE_HALF_D = RUN_PLATFORM;

// Flat (untextured) fallback colours — used for small flavour elements that
// P1-E3c-INTERIOR-FINISH.md doesn't assign a sourced texture to.
const PALETTE = {
  tvm: 0xe4e4de,
  tactile: 0xf4c430, // yellow tactile guide strip (photos P8-P12, Q1-Q5)
  gateOpen: 0x2fa84f,
  gateClosed: 0xd6362b,
  rubber: 0x1e2022,
};

const flatMaterials = {};
function mat(name) {
  if (!flatMaterials[name]) flatMaterials[name] = new THREE.MeshStandardMaterial({ color: PALETTE[name], roughness: 0.85 });
  return flatMaterials[name];
}

// -- Sourced textures (docs/TEXTURES-METRO.md) --------------------------
// slug/tint/repeat per the P1-E3c brief; loadTextureSet is async (returns a
// cached Promise per slug) so materials are created immediately with a flat
// tint and the map/normal/roughness textures are swapped in once loaded —
// the concourse/platform must not block on network for the first frame.
//
// P11-H (advisor brief): the P11-A pre-division above (`newTint = intended *
// 255 / mapMean`) fixed a real black-box bug but overshoots — it clips per
// channel, which is what turned brick-adjacent surfaces salmon/washed-out,
// and even unclipped it isn't the intended colour because the division was
// done in sRGB against a mean that multiplies in linear space after tone
// mapping. The concourse ended up the brightest thing in frame instead of
// reading as cream panels over dark granite.
//
// Fix at the source instead: `loadTextureSet(slug, { normalise: true })`
// (textures.js) returns a colour map whose mean has been scaled toward
// white with a single luminance factor (hue-preserving), so it supplies
// photographic variation, not overall level. That lets every tint below go
// back to being exactly the owner's documented intended colour — no
// arithmetic, nothing to keep in sync with a measured map mean. Do not
// pre-divide these again; if a surface still looks wrong once normalised,
// report it rather than hand-tuning a hex back out of spec.
const TEXTURE_SPECS = {
  concourseFloor: { slug: 'tiles-light-stone', tint: 0xedeae4, repeat: 0.8, roughness: 0.78 },
  wall: { slug: 'panel-cream', tint: 0xedeae4, repeat: 0.8, roughness: 0.82 },
  ceiling: { slug: 'aluminium-brushed', tint: 0xe4e6e6, repeat: 1.0, roughness: 0.5, metalness: 0.4 },
  // dark polished granite — P11-A's metalness/roughness numbers on `steel`
  // (below) are correct and out of scope; kept as-is.
  platformFloor: { slug: 'granite-dark-polished', tint: 0x4f5250, repeat: 0.6, roughness: 0.35 },
  stairTread: { slug: 'granite-dark-polished', tint: 0x4f5250, repeat: 0.6, roughness: 0.4 },
  // P11-A item 1 (kept, not in question this pass): metalness 0.9 -> 0.25,
  // roughness 0.35 -> 0.45 — with no scene.environment a near-metalness-1
  // MeshStandardMaterial has nothing to reflect and renders near-black
  // under ACES regardless of tint.
  steel: { slug: 'steel-brushed', tint: 0xc9cdce, repeat: 1.0, roughness: 0.45, metalness: 0.25 },
};

const texMaterials = {};
function texMat(key) {
  if (texMaterials[key]) return texMaterials[key];
  const spec = TEXTURE_SPECS[key];
  const m = new THREE.MeshStandardMaterial({
    color: spec.tint,
    roughness: spec.roughness ?? 0.8,
    metalness: spec.metalness ?? 0,
  });
  texMaterials[key] = m;
  // { normalise: true } — P11-H: colour map mean scaled toward white so
  // `spec.tint` sets the level and the photo supplies variation on top.
  loadTextureSet(spec.slug, { normalise: true }).then((set) => {
    if (set.map) m.map = set.map;
    if (set.normalMap) m.normalMap = set.normalMap;
    if (set.roughnessMap) m.roughnessMap = set.roughnessMap;
    if (set.aoMap) m.aoMap = set.aoMap;
    m.needsUpdate = true;
  });
  return m;
}

function localToWorld(station, lx, lz) {
  const c = Math.cos(station.heading);
  const s = Math.sin(station.heading);
  return { x: station.x + lx * c + lz * s, z: station.z - lx * s + lz * c };
}

/** Inverse of localToWorld: world (x,z) -> station-local (lx,lz). */
function worldToLocal(station, wx, wz) {
  const c = Math.cos(station.heading);
  const s = Math.sin(station.heading);
  const dx = wx - station.x;
  const dz = wz - station.z;
  return { lx: c * dx - s * dz, lz: s * dx + c * dz };
}

/**
 * P11-Q: resolve an entrance's station-local Z and stair direction from a
 * `station.entrances[]` entry. `lx` still comes from worldToLocal (nothing
 * else publishes it), but `lz` and `dir` are read straight from the entry
 * when metro.js provides them (`en.lz`, `en.dir`) rather than re-derived.
 * This matters because at 2-entrance stations (Mirpur 11, Pallabi, Uttara
 * South) the entrance's true local lz is exactly 0, and recovering it via
 * worldToLocal()'s trig round-trip instead yields 0 plus floating-point
 * noise — whose SIGN is what `lz < 0 ? -1 : 1` used to key off, silently
 * picking a direction that disagreed with metro.js's own shell (built from
 * a `zc` that is exactly, not approximately, 0). See
 * docs/briefs/P11-Q-TWO-ENTRANCE-STATION-STAIR-DIRECTION.md. The `lz < 0`
 * fallback is kept only for entrances predating this field (en.dir/en.lz
 * absent) — never applied to a value that is legitimately zero once en.dir
 * is present.
 */
function entranceLocal(station, en) {
  const { lx, lz: lzComputed } = worldToLocal(station, en.x, en.z);
  const lz = en.lz ?? lzComputed;
  const dir = en.dir ?? (lz < 0 ? -1 : 1);
  return { lx, lz, dir };
}

/** Register a station-local axis-aligned rectangle as a walkable slab. */
function slabLocal(walkable, station, y, lx, lz, halfW, halfD, opts) {
  const { x, z } = localToWorld(station, lx, lz);
  return walkable.slab(y, x, z, halfW, halfD, -station.heading, opts);
}

/** Register a station-local ramp; y0 is the height at local -Z, y1 at +Z. */
function rampLocal(walkable, station, y0, y1, lx, lz, halfW, halfD, opts) {
  const { x, z } = localToWorld(station, lx, lz);
  return walkable.ramp(y0, y1, x, z, halfW, halfD, -station.heading, opts);
}

/**
 * Register a station-local wall segment (for resolveCollision).
 *
 * `yMin`/`yMax` are the height band the wall actually occupies. This matters
 * a great deal: the concourse box straddles the road on portal columns, and
 * WITHOUT a band its perimeter walls are infinitely tall, so they block the
 * carriageway at street level and you cannot drive under the station —
 * exactly what the owner reported on 2026-09-07 ("we cannot drive under the
 * road of the metro station"). city.js's resolveCollision skips any segment
 * whose band excludes the mover's y, so a banded wall stops you on the
 * concourse and lets the car through underneath.
 *
 * Omitting the band still yields a full-height wall, which is correct for
 * the entrance stair cores that really do run from the footpath up.
 */
function wallLocal(collision, walkable, station, ax, az, bx, bz, yMin, yMax) {
  const A = localToWorld(station, ax, az);
  const B = localToWorld(station, bx, bz);
  const banded = Number.isFinite(yMin) && Number.isFinite(yMax);
  walkable.addSegments(collision, [
    banded ? [A.x, A.z, B.x, B.z, yMin, yMax] : [A.x, A.z, B.x, B.z],
  ]);
}

/** Head-height clearance used for every banded interior wall. */
const WALL_BAND_H = 2.6;

/**
 * Per-station material bucketer: accumulates baked (translated) BoxGeometry
 * instances per material key and merges each key into a single Mesh on
 * `flush()`, the same one-draw-call-per-material-bucket approach metro.js
 * uses (`mergeBucket`/`mergeGeometries`). Keeps the interior's draw-call
 * count independent of how many individual fixtures are placed.
 */
function createBucketer() {
  const buckets = new Map(); // key -> { mat, geoms: [] }
  function push(key, material, geometry, x, y, z) {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: material, geoms: [] }));
    const baked = geometry;
    baked.translate(x, y, z);
    b.geoms.push(baked);
  }
  function flush(group, prefix) {
    let count = 0;
    for (const [key, b] of buckets) {
      if (!b.geoms.length) continue;
      const merged = mergeGeometries(b.geoms, false);
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.name = `${prefix}:${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      count++;
    }
    return count;
  }
  return { push, flush };
}

/**
 * Build a BoxGeometry and, if `repeatMetres` is given, scale its UVs by
 * world-size / repeatMetres so the texture repeat is metric (per the brief:
 * "Geometry from BoxGeometry has UVs; scale UVs by world size ... set uv *
 * (size / repeatMetres)"). `uvDims` picks which two box dimensions map to
 * (u,v) — for a floor/ceiling slab that's (w,d) (the default); for a thin
 * wall panel running along Z it's (d,h) since the visible face is length x
 * height, not thickness x length.
 */
function pushBox(bucket, key, material, w, h, d, x, y, z, repeatMetres, uvDims) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (repeatMetres) {
    const [uDim, vDim] = uvDims || [w, d];
    const su = uDim / repeatMetres;
    const sv = vDim / repeatMetres;
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    uv.needsUpdate = true;
  }
  bucket.push(key, material, geo, x, y, z);
}

/**
 * Rail (collision-block) three edges of a landing, leaving open the edge
 * that faces the station centre (X=0) — the concourse main floor for
 * entrance-core landings, and (per the P1-E3d brief) also the platform for
 * the paid-side platform-access cores' upper (DECK_Y) landing, since that
 * core's `coreX` (+-6) is always closer to X=0 than the platform's own
 * centreline, so "toward X=0" reaches the platform too.
 *
 * `landingZ`/`centerZ` place the near (ramp-facing) edge relative to the
 * far (open-air) edge; `gapLo`/`gapHi` (station-local X) leave a gap in the
 * near edge's rail matching the stair+escalator column so the rail doesn't
 * wall off the ramp itself.
 */
function railLanding(collision, walkable, station, coreX, landingZ, centerZ, halfW, halfD, gapLo, gapHi, openAxis, levelY) {
  // Rails belong to the deck they stand on, not to every height at once.
  const yLo = Number.isFinite(levelY) ? levelY : undefined;
  const yHi = Number.isFinite(levelY) ? levelY + WALL_BAND_H : undefined;
  const towardRamp = landingZ < centerZ ? 1 : -1; // add to landingZ to move toward the ramp
  const nearZ = landingZ + towardRamp * halfD; // edge adjoining the ramp — gapped, not solid
  const farZ = landingZ - towardRamp * halfD; // edge open to nothing (in 'x' mode) — railed
  const dirOut = coreX >= 0 ? 1 : -1;
  const innerX = coreX - dirOut * halfW; // faces the station centre
  const outerX = coreX + dirOut * halfW; // faces away from the centre — always railed
  // Order-independent bounds: for coreX < 0 (entrances A/B, west side)
  // innerX > outerX numerically (both are negative, innerX closer to 0),
  // so every span below is built from min/max, not assumed ordering.
  const xLo = Math.min(innerX, outerX);
  const xHi = Math.max(innerX, outerX);

  if (openAxis === 'z') {
    // Paid-side DECK_Y landing: the platform is reached by walking STRAIGHT
    // on past the top of the ramp (Z direction), not sideways — its
    // landingHalfW (>=6) already fully contains the platform's own halfW
    // (2.5) at the same X, so the far-Z edge is the one that "touches the
    // platform" here and must stay open; inner-X does not lead anywhere
    // (verified live: railing outer-X only and leaving inner-X open let the
    // player walk straight through the far-Z edge into a false wall across
    // the open platform floor — see docs/INTERIOR-PASS.md).
    wallLocal(collision, walkable, station, innerX, landingZ - halfD, innerX, landingZ + halfD, yLo, yHi);
    wallLocal(collision, walkable, station, outerX, landingZ - halfD, outerX, landingZ + halfD, yLo, yHi);
  } else {
    // Entrance-core CONCOURSE_Y landing: the concourse is reached sideways
    // (X direction), through the perimeter-wall door gap — the far-Z edge
    // (continuing past the landing) leads nowhere and must be railed.
    wallLocal(collision, walkable, station, xLo, farZ, xHi, farZ, yLo, yHi);
    wallLocal(collision, walkable, station, outerX, landingZ - halfD, outerX, landingZ + halfD, yLo, yHi);
  }
  // Near edge (ramp side): solid except a gap over the stair+escalator column.
  const gLo = Math.max(xLo, Math.min(gapLo, gapHi));
  const gHi = Math.min(xHi, Math.max(gapLo, gapHi));
  if (gLo > xLo) wallLocal(collision, walkable, station, xLo, nearZ, gLo, nearZ, yLo, yHi);
  if (gHi < xHi) wallLocal(collision, walkable, station, gHi, nearZ, xHi, nearZ, yLo, yHi);
}

/**
 * Build a slope-following steel guardrail: an optional low solid kick panel
 * (~1.1 m, raked to match the stair/escalator pitch) plus two handrail
 * tubes (~0.9 m and ~1.0 m above the ramp line). This replaces the old
 * opaque full-height flanking "screen panel" (P11-A brief item 3): that
 * panel was 0.15 x (hiY-loY+2.2) x (halfD*2+2) m of solid steel standing the
 * whole run of every stair core, which from the street or concourse reads
 * as a black wall — the treads and handrails behind it are never visible
 * ("there are no stairs" in the owner's report). Everything above the kick
 * line is left open so the stair is actually visible.
 *
 * The rake is computed with a quaternion (setFromUnitVectors) rather than
 * hand-derived trig, deliberately: this file can't be visually verified
 * this pass (browser pane is off-limits per the brief), so the rotation
 * needs to be correct by construction rather than by eyeballing a sign.
 * `setFromUnitVectors` finds the rotation from a canonical axis to the
 * along-slope direction `(0, rise, run)` however that direction is signed,
 * so it is robust to sign(rise) for both climbing and descending cores.
 *
 * `withKick`: false for the centre divider between the stair and the
 * escalator, which guards nothing (both sides are ramps at the same
 * height) — the brief only asks for a handrail there, not a kick panel.
 *
 * P11-T: re-verified this rake by hand for both entrance `dir` values
 * (not just re-asserted) because the brief flagged it as a suspected cause
 * of the owner's "escalator deck projecting through a brick wall"
 * screenshot. Checked with an actual `three` Quaternion computation (not
 * eyeballed): `run` here is always `halfD*2`, a magnitude, so `dir`'s
 * Z-component is always positive — it is never anti-parallel to the
 * source axis `(0,0,1)`, which is the one condition that makes
 * `setFromUnitVectors` genuinely ambiguous (near-zero cross product). For
 * both `rise > 0` (sign < 0, ascending toward +Z) and `rise < 0` (sign >
 * 0, ascending toward -Z) the transformed geometry's local +Z endpoint
 * lands at world-Y offset `+rise/2` and its local -Z endpoint at
 * `-rise/2`, with the width axis (local X) undisturbed (no roll) in both
 * cases — i.e. whichever physical end the ramp climbs toward is correctly
 * the high end, for both directions, with byte-for-byte the same formula.
 * Concretely (rise=8, run=14): `+Zend -> y=+4, x=0` for rise=+8, and
 * `+Zend -> y=-4, x=0` for rise=-8 — mirrored in Y exactly as the
 * ascent direction requires, never rolled. See
 * `buildCore`'s `y0`/`y1` assignment (keyed off `sign`, which is
 * `en.dir`/`stairSign` from metro.js by the time this is called for an
 * entrance) for where that sign actually originates. Conclusion: this
 * rake was already correct for both `dir` values before this pass; the
 * owner's screenshot was the OLD stepped entrance shell in metro.js
 * (fixed in this same pass, see docs/METRO-REVIEW.md's P11-T section),
 * not this quaternion. No functional change made here.
 */
function buildGuardrail(bucket, x, y0, y1, centerZ, halfD, withKick) {
  const rise = y1 - y0;
  const run = halfD * 2;
  const L = Math.hypot(run, rise);
  const dir = new THREE.Vector3(0, rise, run).normalize();
  const midY = (y0 + y1) / 2; // ramp height exactly at centerZ (linear ramp)

  if (withKick) {
    const kickH = 1.1;
    const kickGeo = new THREE.BoxGeometry(0.06, kickH, L);
    kickGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
    bucket.push('steel', texMat('steel'), kickGeo, x, midY + kickH / 2, centerZ);
  }
  for (const railH of [0.9, 1.0]) {
    const railGeo = new THREE.CylinderGeometry(0.035, 0.035, L, 8);
    railGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    bucket.push('steel', texMat('steel'), railGeo, x, midY + railH, centerZ);
  }

  // Vertical stanchions anchoring the handrail to each step/landing
  const nPosts = Math.max(4, Math.round(run / 1.6));
  for (let i = 0; i <= nPosts; i++) {
    const t = i / nPosts;
    const pz = centerZ - halfD + t * run;
    const py = y0 + (y1 - y0) * t;
    pushBox(bucket, 'steel', texMat('steel'), 0.05, 1.05, 0.05, x, py + 0.525, pz);
  }
}

/**
 * Detailed metro escalator: structural steel truss, stainless skirt panels,
 * glass balustrades, moving black rubber handrails with curved return newels,
 * and comb-plate landing decks with yellow demarcation warning borders.
 */
function buildEscalatorDeck(bucket, x, y0, y1, centerZ, halfD) {
  const rise = y1 - y0;
  const run = halfD * 2;
  const L = Math.hypot(run, rise);
  const dir = new THREE.Vector3(0, rise, run).normalize();
  const midY = (y0 + y1) / 2;
  const rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

  // 1. Structural steel truss casing underneath the escalator
  const trussGeo = new THREE.BoxGeometry(1.15, 0.55, L);
  trussGeo.applyQuaternion(rot);
  bucket.push('steel', texMat('steel'), trussGeo, x, midY - 0.32, centerZ);

  // 2. Skirt panels alongside the steps
  const skirtH = 0.22;
  for (const sx of [-0.52, 0.52]) {
    const skirtGeo = new THREE.BoxGeometry(0.04, skirtH, L);
    skirtGeo.applyQuaternion(rot);
    bucket.push('steel', texMat('steel'), skirtGeo, x + sx, midY + skirtH / 2, centerZ);
  }

  // 3. Safety glass balustrades along both sides
  const glass = liftGlassMat();
  const glassH = 0.72;
  for (const sx of [-0.52, 0.52]) {
    const glassGeo = new THREE.BoxGeometry(0.025, glassH, L);
    glassGeo.applyQuaternion(rot);
    bucket.push('liftGlass', glass, glassGeo, x + sx, midY + skirtH + glassH / 2, centerZ);
  }

  // 4. Moving rubber handrail belt along the top of each balustrade
  for (const sx of [-0.52, 0.52]) {
    const beltGeo = new THREE.BoxGeometry(0.08, 0.05, L);
    beltGeo.applyQuaternion(rot);
    bucket.push('steel', mat('rubber'), beltGeo, x + sx, midY + 0.98, centerZ);
  }

  // 5. Grooved step treads and yellow demarcation safety edges
  const stepPitch = 0.38;
  const nRidges = Math.max(6, Math.round(run / stepPitch));
  for (let i = 0; i <= nRidges; i++) {
    const t = i / nRidges;
    const rz = centerZ - halfD + t * run;
    const ry = y0 + (y1 - y0) * t;
    pushBox(bucket, 'stairTread', texMat('stairTread'), 0.96, 0.04, 0.28, x, ry + 0.02, rz);
    pushBox(bucket, 'tactile', mat('tactile'), 0.96, 0.015, 0.04, x, ry + 0.04, rz + (y1 > y0 ? 0.12 : -0.12));
    pushBox(bucket, 'tactile', mat('tactile'), 0.04, 0.015, 0.28, x - 0.46, ry + 0.04, rz);
    pushBox(bucket, 'tactile', mat('tactile'), 0.04, 0.015, 0.28, x + 0.46, ry + 0.04, rz);
  }

  // 6. Horizontal comb-plate transitions and newel return posts at both landings
  // Bottom landing (y0)
  pushBox(bucket, 'steel', texMat('steel'), 1.15, 0.08, 0.8, x, y0 - 0.04, centerZ - halfD - 0.4);
  pushBox(bucket, 'tactile', mat('tactile'), 1.15, 0.02, 0.08, x, y0 + 0.01, centerZ - halfD - 0.04);
  for (const sx of [-0.52, 0.52]) {
    pushBox(bucket, 'steel', mat('rubber'), 0.08, 0.05, 0.6, x + sx, y0 + 0.98, centerZ - halfD - 0.3);
    pushBox(bucket, 'steel', texMat('steel'), 0.08, 0.95, 0.08, x + sx, y0 + 0.475, centerZ - halfD - 0.6);
  }

  // Top landing (y1)
  pushBox(bucket, 'steel', texMat('steel'), 1.15, 0.08, 0.8, x, y1 - 0.04, centerZ + halfD + 0.4);
  pushBox(bucket, 'tactile', mat('tactile'), 1.15, 0.02, 0.08, x, y1 + 0.01, centerZ + halfD + 0.04);
  for (const sx of [-0.52, 0.52]) {
    pushBox(bucket, 'steel', mat('rubber'), 0.08, 0.05, 0.6, x + sx, y1 + 0.98, centerZ + halfD + 0.3);
    pushBox(bucket, 'steel', texMat('steel'), 0.08, 0.95, 0.08, x + sx, y1 + 0.475, centerZ + halfD + 0.6);
  }
}

/**
 * A vertical stair+escalator core between two levels. `sign` selects which
 * end (local -Z or +Z) is the lower one: -1 means the lower level sits at
 * local -Z (used for the south/outer leg), +1 means it sits at +Z.
 *
 * `opts.railConcourseLanding`: when true, the landing at CONCOURSE_Y height
 * gets edge railings too (entrance cores, where that landing sits outside
 * the main concourse slab). Left false for the paid-side platform-access
 * cores, whose CONCOURSE_Y landing sits embedded inside the main concourse
 * floor slab (same height, fully overlapped) and needs none. The landing at
 * DECK_Y height (only ever the paid-side cores' upper landing) is always
 * railed, per the brief.
 */
function buildCore(bucket, collision, walkable, station, interactables, opts) {
  const { coreX, centerZ, halfD, loY, hiY, sign, label, railConcourseLanding } = opts;
  const y0 = sign < 0 ? loY : hiY;
  const y1 = sign < 0 ? hiY : loY;
  const escDir = sign < 0 ? 1 : -1; // world-local +Z/-Z that climbs toward hiY

  // Stair (2.4 m, walkable ramp) beside a 1.0 m escalator (moving ramp).
  //
  // P11-A item 4 fix: the stair's halfW was 1.1 (edge at coreX-0.05) and the
  // escalator's centre was coreX+0.55 with halfW 0.5 (edge at coreX+0.05) —
  // a 0.1 m sliver between coreX-0.05 and coreX+0.05 where supportHeightAt
  // returns null, so a player walking exactly up the core centreline falls.
  // Widening the stair to halfW 1.2 (edge -> coreX+0.05) and pulling the
  // escalator's centre in to coreX+0.5 (edge -> coreX+0.0) now OVERLAPS by
  // 0.05 m instead of gapping by 0.1 m — no null-support seam anywhere
  // between them, with a small margin so float rounding can't reopen it.
  const stairHalfW = opts.stairHalfW ?? 1.2;
  const escHalfW = opts.escHalfW ?? 0.5;
  const stairX = opts.stairX ?? (coreX - 1.15);
  const escX = opts.escX ?? (coreX + 0.5);
  const coreHalfW = opts.coreHalfW ?? 2.4;
  rampLocal(walkable, station, y0, y1, stairX, centerZ, stairHalfW, halfD);
  rampLocal(walkable, station, y0, y1, escX, centerZ, escHalfW, halfD, { moving: true, dir: escDir, speed: 0.75 });

  // Flanking collision walls matching the guardrails below: without these
  // the player can step sideways off the narrow stair/escalator ramp
  // (halfW 1.2/0.5) while still within its Z-run and fall through the
  // untracked void beside it (the "null-support hole" P1-E3d item 3 — see
  // docs/INTERIOR-PASS.md's 19:40 advisor note, ~world (165.7, 604.7)/local
  // (13.9, 14.6) at Mirpur 10 entrance D, which sits exactly in this gap:
  // within the ramp's Z-span but outside both the ramp's own X-span and the
  // concourse/landing footprints).
  const coreYMin = Math.min(loY, hiY);
  const coreYMax = Math.max(loY, hiY) + WALL_BAND_H;
  wallLocal(collision, walkable, station, coreX - coreHalfW, centerZ - (halfD + 1), coreX - coreHalfW, centerZ + (halfD + 1), coreYMin, coreYMax);
  wallLocal(collision, walkable, station, coreX + coreHalfW, centerZ - (halfD + 1), coreX + coreHalfW, centerZ + (halfD + 1), coreYMin, coreYMax);

  // Visible stair treads (granite, per the brief): real stepped geometry
  // along the (physically smooth) stair ramp — WALKABLE-INTERIOR-DESIGN.md's
  // "treated as a smooth ramp; the visible geometry still has real steps".
  // Player support comes from the ramp registered above, not these treads.
  const riseTotal = Math.abs(hiY - loY);
  const stepRise = 0.18;
  const steps = Math.max(6, Math.min(40, Math.round(riseTotal / stepRise)));
  const stepDepth = (halfD * 2) / steps;
  // P11-S item 2 (owner: daylight/road/shopfronts visible through the
  // treads, "reads as a rendering fault rather than a staircase"): each
  // tread used to be an independent floating slab — 4% Z gap to its
  // neighbours, nothing behind or under it — so the run had no riser faces
  // and no closed stringer at all; every gap was a sightline straight
  // through the whole shell. Player support comes from `rampLocal` above,
  // not these treads, so this is visual-only (brief: "low-risk geometry
  // only"). Fixed with a vertical riser box per step, added to the SAME
  // 'stairTread' bucket key (so it costs zero extra draw calls — every push
  // under one key merges into a single mesh at flush time, see
  // `createBucketer`) rather than a separate continuous soffit, which would
  // have needed extra margin at every discrete tread boundary to guarantee
  // no gap reopened by the stepped (not perfectly linear) tread heights.
  // Each riser spans from the lower of the two treads it joins (bottom
  // face) to the higher one (top face) — using min/max rather than
  // signed order because `sign` can put y1 on either side of y0 — so it
  // fully closes the step without leaving a sliver at either end.
  let prevStepY = y0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const stepY = y0 + (y1 - y0) * t;
    const stepZ = centerZ - halfD + (i + 0.5) * stepDepth;
    pushBox(bucket, 'stairTread', texMat('stairTread'), stairHalfW * 2, 0.06, stepDepth * 0.96, stairX, stepY + 0.03, stepZ, TEXTURE_SPECS.stairTread.repeat, [stairHalfW * 2, stepDepth]);

    const riserZ = centerZ - halfD + i * stepDepth; // the boundary this riser closes
    const riserLoY = Math.min(prevStepY, stepY);
    const riserHiY = Math.max(prevStepY, stepY) + 0.06; // up to the higher tread's top face
    const riserH = riserHiY - riserLoY;
    pushBox(bucket, 'stairTread', texMat('stairTread'), stairHalfW * 2, riserH, 0.06,
      stairX, (riserLoY + riserHiY) / 2, riserZ, TEXTURE_SPECS.stairTread.repeat, [stairHalfW * 2, riserH]);
    prevStepY = stepY;
  }

  // Landings at both ends so the player has a flat step onto/off the ramp.
  // Match the ramp's own convention (rampLocal: y0 at local -Z, y1 at local
  // +Z) instead of loY/hiY directly (see docs/INTERIOR-PASS.md for the
  // history of the Z-offset bug this avoids).
  //
  // halfW: dynamic, not a flat 6, because P1-E3c moves entrance cores out to
  // the REAL station.entrances[] coordinates, which sit much further
  // outboard (|coreX| ~16.5 m) than the old synthetic fallback's coreX=14.
  // A fixed 6 m half-width's inner edge (coreX-6=10.5) would land OUTSIDE
  // the concourse slab's own edge (CONCOURSE_W/2=10) for those, recreating
  // the exact gap E3b found and fixed for the fallback's coreX=14 case.
  // This keeps a >=2 m overlap into the concourse/platform slab for any
  // coreX, including the small ones (paid-side platform-access cores,
  const isPlatformCore = (hiY === METRO.PLATFORM_Y);
  const landingHalfD = isPlatformCore ? 1.2 : 1.5;
  const landingHalfW = Math.max(6, Math.abs(coreX) - CONCOURSE_W / 2 + 2);
  const y0Z = centerZ - (halfD + 1);
  const y1Z = centerZ + (halfD + 1);
  slabLocal(walkable, station, y0, coreX, y0Z, landingHalfW, landingHalfD);
  slabLocal(walkable, station, y1, coreX, y1Z, landingHalfW, landingHalfD);

  // Landing railings (P1-E3d item 2): collision segments on the three edges
  // of each landing that sits at an elevated (non-street, non-embedded)
  // height, leaving the concourse/platform-facing edge open. Without these
  // a player who keeps walking straight past the landing, instead of
  // turning toward the concourse gap, falls straight through to street
  // level (docs/INTERIOR-PASS.md's 19:40 advisor FAIL 1).
  const gapLo = Math.min(stairX - stairHalfW, escX - escHalfW) - 0.3;
  const gapHi = Math.max(stairX + stairHalfW, escX + escHalfW) + 0.3;
  const needsRail = (h) => h === METRO.PLATFORM_Y || (h === METRO.CONCOURSE_Y && railConcourseLanding);
  const openAxis = (h) => (h === METRO.PLATFORM_Y ? 'z' : 'x');
  if (!isPlatformCore) {
    if (needsRail(y0)) railLanding(collision, walkable, station, coreX, y0Z, centerZ, landingHalfW, landingHalfD, gapLo, gapHi, openAxis(y0), y0);
    if (needsRail(y1)) railLanding(collision, walkable, station, coreX, y1Z, centerZ, landingHalfW, landingHalfD, gapLo, gapHi, openAxis(y1), y1);
  }

  // Structural soffit & stringers under the flight
  const runTotal = halfD * 2;
  const slopeL = Math.hypot(runTotal, riseTotal);
  const slopeDir = new THREE.Vector3(0, y1 - y0, runTotal).normalize();
  const slopeRot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), slopeDir);
  const slopeMidY = (y0 + y1) / 2;

  // Guardrails: For entrance cores (G->L1), use outer kick panels + rails and
  // center divider. For platform cores (L1->L2), the platform perimeter is guarded
  // by buildPlatformStairBalustrade on the platform deck, while the stair flight
  // has smooth handrails with stanchions.
  if (isPlatformCore) {
    // 1. Concrete soffit slab supporting the underside of the stairs and escalator
    const soffitGeo = new THREE.BoxGeometry(coreHalfW * 2, 0.22, slopeL);
    soffitGeo.applyQuaternion(slopeRot);
    bucket.push('concourseFloor', texMat('concourseFloor'), soffitGeo, coreX, slopeMidY - 0.22, centerZ);

    // 2. Outer and inner flank stringer beams
    const stringerGeo = new THREE.BoxGeometry(0.12, 0.55, slopeL);
    stringerGeo.applyQuaternion(slopeRot);
    bucket.push('steel', texMat('steel'), stringerGeo, coreX - coreHalfW, slopeMidY + 0.12, centerZ);
    const stringerGeo2 = new THREE.BoxGeometry(0.12, 0.55, slopeL);
    stringerGeo2.applyQuaternion(slopeRot);
    bucket.push('steel', texMat('steel'), stringerGeo2, coreX + coreHalfW, slopeMidY + 0.12, centerZ);

    // Handrails on stair flight (escalator deck provides its own glass balustrades & rubber handrails)
    const dividerX = (stairX + escX) / 2;
    buildGuardrail(bucket, dividerX, y0, y1, centerZ, halfD, false);
    const stairOuterX = stairX < escX ? (stairX - stairHalfW) : (stairX + stairHalfW);
    buildGuardrail(bucket, stairOuterX, y0, y1, centerZ, halfD, false);
  } else {
    buildGuardrail(bucket, coreX - coreHalfW, y0, y1, centerZ, halfD, true);
    buildGuardrail(bucket, coreX + coreHalfW, y0, y1, centerZ, halfD, true);
    buildGuardrail(bucket, coreX, y0, y1, centerZ, halfD, false);
  }

  // Escalator deck + comb/step ridges (P11-A item 3): the escalator was a
  // moving walkable surface with no mesh at all.
  buildEscalatorDeck(bucket, escX, y0, y1, centerZ, halfD);

  const corePos = localToWorld(station, coreX, centerZ);
  interactables.push({
    position: new THREE.Vector3(corePos.x, (loY + hiY) / 2, corePos.z),
    label,
    range: 6,
    passive: true, // informational only, no E action
  });

  return { landingHalfW };
}

function buildTicketGate(bucket, group, collision, walkable, station, interactables, state, gateZ) {
  const lanes = 6;
  const span = CONCOURSE_W - 4;
  const laneW = span / lanes;
  const startX = -span / 2 + laneW / 2;


  // P11-P item 3: the barrier arm alone (below) reads as an ambiguous steel
  // post — nothing about it says "this is a gate, and here's whether it's
  // open". One small instanced light per lane, red/green, driven every
  // frame by updateGates() off the same openUntil each lane already uses
  // for collision — visual and collision can't disagree. Instanced (not
  // bucketed, since colour must change per-frame) so this is 1 draw call
  // total for all 6 lanes, not 6.
  const lightGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.4 });
  const lights = new THREE.InstancedMesh(lightGeo, lightMat, lanes);
  lights.name = `gate-lights:${station.name}`;
  lights.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(lanes * 3), 3);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < lanes; i++) {
    const laneX = startX + i * laneW;
    const closed = [0, 0, 0, 0, METRO.CONCOURSE_Y, METRO.CONCOURSE_Y + 1.2];
    const A = localToWorld(station, laneX - laneW / 2 + 0.08, gateZ);
    const B = localToWorld(station, laneX + laneW / 2 - 0.08, gateZ);
    closed[0] = A.x;
    closed[1] = A.z;
    closed[2] = B.x;
    closed[3] = B.z;
    const seg = [...closed];
    walkable.addSegments(collision, [seg]);
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(laneW - 0.2, 1, 0.08), texMat('steel'));
    barrier.position.set(laneX, METRO.CONCOURSE_Y + 0.5, gateZ);
    group.add(barrier);

    dummy.position.set(laneX, METRO.CONCOURSE_Y + 1.15, gateZ);
    dummy.updateMatrix();
    lights.setMatrixAt(i, dummy.matrix);
    lights.setColorAt(i, GATE_CLOSED_COLOR);

    const gate = { seg, closed, laneX, barrier, lights, lightIndex: i, openUntil: 0 };
    state.gates.push(gate);
    interactables.push({
      position: new THREE.Vector3(A.x, METRO.CONCOURSE_Y, A.z + (B.z - A.z) / 2),
      label: 'E: open ticket gate',
      range: 2.5,
      action: (player) => tapIn(state, gate, worldToLocal(station, player.position.x, player.position.z).lz > gateZ),
    });
  }
  lights.instanceMatrix.needsUpdate = true;
  lights.instanceColor.needsUpdate = true;
  group.add(lights);
  state.gateLights = lights;
}

/**
 * Ticket-gate interaction: ~50 lines total including buildTicketGate above.
 *
 * P11-P item 3 (advisor): the old comment here ("no-ticket escape hatch:
 * hint, never a hard block") was simply wrong — `return` with the gate
 * segment left solid IS a hard block, and that mismatch is how this file
 * shipped a real "no way up" bug disguised as a hint. The advisor's call:
 * keep the gate meaningful (a ticket is still required, the block stays),
 * but stop the failure from feeling silent/unfair — the hint now says
 * *where* to fix it and stays up long enough to actually read, and the
 * concourse ceiling sign + gate lane lights (buildTicketGate below) mean a
 * player hitting this should already have seen the TVM signposted before
 * they ever reach the gate.
 */
function tapIn(state, gate, exiting) {
  if (!state.hasTicket && !exiting) {
    state.hint = 'No ticket - buy one at the TVM (follow the TICKETS sign) before tapping in';
    state.hintUntil = performance.now() + 4000;
    return; // hard block, on purpose: the gate segment stays closed until hasTicket
  }
  gate.openUntil = performance.now() + 4000; // was 2000 — wide lanes + walking speed made a slow crossing re-close mid-lane
}

const GATE_OPEN_COLOR = new THREE.Color(PALETTE.gateOpen);
const GATE_CLOSED_COLOR = new THREE.Color(PALETTE.gateClosed);

function updateGates(state) {
  const now = performance.now();
  for (let i = 0; i < (state.gates || []).length; i++) {
    const g = state.gates[i];
    const open = now < g.openUntil;
    g.barrier.scale.x = open ? 0.05 : 1;
    if (open) {
      g.seg[0] = g.seg[2];
      g.seg[1] = g.seg[3]; // degenerate segment: resolveCollision skips it
    } else {
      g.seg[0] = g.closed[0];
      g.seg[1] = g.closed[1];
    }
    // P11-P item 3: the gate line used to be a row of identical steel posts
    // with no indication any of it was a barrier, let alone which lanes
    // were passable. One instanced light per lane, red/green off the same
    // openUntil state resolveCollision already uses above, so the visual
    // and the collision can never disagree.
    g.lights.setColorAt(g.lightIndex, open ? GATE_OPEN_COLOR : GATE_CLOSED_COLOR);
    g.lights.instanceColor.needsUpdate = true;
  }
  if (state.gateLights) state.gateLights.instanceColor.needsUpdate = true;
}

/**
 * Build the solid (always-blocking) PSD wall segments between door bays,
 * plus one dedicated, individually-degenerate collision segment PER BAY
 * (the existing AFC-gate trick — collapse a segment to a point and
 * `resolveCollision` skips it). Bay Z-centres come from metro.js's
 * `platformDoorBays()` so the gaps line up exactly with the sliding glass
 * leaves it builds; `BAY_HALF` must match metro.js's own constant of the
 * same name (P11-I item 1) or the collision gap and the visible gap drift
 * apart. Returns the per-bay gate list so `setPsdOpen` can flip them.
 */
function buildPsdBarrier(collision, walkable, station, psdX, bayZs, bayHalf, yMin, yMax) {
  const runFrom = -METRO.PLATFORM_LEN / 2;
  const runTo = METRO.PLATFORM_LEN / 2;
  const sorted = bayZs.slice().sort((a, b) => a - b);

  // Fixed wall between bays: always solid, never toggled.
  let cursor = runFrom;
  for (const bz of sorted) {
    const gLo = Math.max(cursor, bz - bayHalf);
    const gHi = Math.min(runTo, bz + bayHalf);
    if (gLo > cursor) wallLocal(collision, walkable, station, psdX, cursor, psdX, gLo, yMin, yMax);
    cursor = Math.max(cursor, gHi);
  }
  if (cursor < runTo) wallLocal(collision, walkable, station, psdX, cursor, psdX, runTo, yMin, yMax);

  // Per-bay gate: starts CLOSED (a real barrier spanning the bay) so the
  // platform is fully sealed until setPsdOpen() is called.
  const gates = [];
  for (const bz of sorted) {
    const A = localToWorld(station, psdX, bz - bayHalf);
    const B = localToWorld(station, psdX, bz + bayHalf);
    const closed = [A.x, A.z, B.x, B.z, yMin, yMax];
    const seg = closed.slice();
    walkable.addSegments(collision, [seg]);
    gates.push({ seg, closed });
  }
  return gates;
}

function buildPlatformStairBalustrade(bucket, collision, walkable, station, side, z0, z1, xInner, xOuter, levelY) {
  const railH = 1.05;
  const kickH = 0.10;
  const glassH = 0.85;
  const glassY = levelY + kickH + glassH / 2;
  const glass = liftGlassMat();

  // Order bounds in X
  const xLo = Math.min(xInner, xOuter);
  const xHi = Math.max(xInner, xOuter);

  // Collision walls on the 3 closed sides (South back edge, inner walkway edge, outer walkway edge)
  wallLocal(collision, walkable, station, xLo, z0, xHi, z0, levelY, levelY + 1.2);
  wallLocal(collision, walkable, station, xInner, z0, xInner, z1, levelY, levelY + 1.2);
  wallLocal(collision, walkable, station, xOuter, z0, xOuter, z1, levelY, levelY + 1.2);

  const buildRun = (ax, az, bx, bz) => {
    const isX = Math.abs(bx - ax) >= Math.abs(bz - az);
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;
    const L = Math.hypot(bx - ax, bz - az);

    if (isX) {
      // Along X (south edge)
      pushBox(bucket, 'steel', texMat('steel'), L, 0.05, 0.06, midX, levelY + railH, midZ);
      pushBox(bucket, 'steel', texMat('steel'), L, kickH, 0.06, midX, levelY + kickH / 2, midZ);
      bucket.push('liftGlass', glass, new THREE.BoxGeometry(Math.max(0.1, L - 0.08), glassH, 0.03), midX, glassY, midZ);
      for (const px of [ax, midX, bx]) {
        pushBox(bucket, 'steel', texMat('steel'), 0.08, railH, 0.08, px, levelY + railH / 2, midZ);
      }
    } else {
      // Along Z (inner and outer edges)
      pushBox(bucket, 'steel', texMat('steel'), 0.06, 0.05, L, midX, levelY + railH, midZ);
      pushBox(bucket, 'steel', texMat('steel'), 0.06, kickH, L, midX, levelY + kickH / 2, midZ);
      bucket.push('liftGlass', glass, new THREE.BoxGeometry(0.03, glassH, Math.max(0.1, L - 0.08)), midX, glassY, midZ);
      const numBays = 5;
      for (let i = 0; i <= numBays; i++) {
        const pz = az + (bz - az) * (i / numBays);
        pushBox(bucket, 'steel', texMat('steel'), 0.08, railH, 0.08, midX, levelY + railH / 2, pz);
      }
    }
  };

  // South edge (back of stairwell)
  buildRun(xLo, z0, xHi, z0);
  // Inner edge (track side)
  buildRun(xInner, z0, xInner, z1);
  // Outer edge (canopy column side)
  buildRun(xOuter, z0, xOuter, z1);
}

function buildPlatform(bucket, collision, walkable, station, interactables, side, metro, psdRegistry, liftBridgeZ = null) {
  const trackHalf = TRACK_CENTRES / 2;

  // Platform floor matching metro.js: widened to canopy columns, with
  // stairwell opening (z0..z1, side*coreInnerX..side*coreOuterX) cut out
  const platformOuter = CANOPY_SPAN / 2 - 0.3; // == metro.js's own `platformOuter`
  const innerX = side * PLATFORM_INNER_X;
  const outerEdgeX = side * platformOuter;
  const cx = (innerX + outerEdgeX) / 2;
  const halfW = Math.abs(platformOuter - PLATFORM_INNER_X) / 2;

  const z0 = PLATFORM_CORE_Z - PLATFORM_CORE_HALF_D;
  const z1 = PLATFORM_CORE_Z + PLATFORM_CORE_HALF_D;
  const lenSouth = z0 - (-METRO.PLATFORM_LEN / 2);
  const midZSouth = (-METRO.PLATFORM_LEN / 2 + z0) / 2;
  const lenNorth = METRO.PLATFORM_LEN / 2 - z1;
  const midZNorth = (z1 + METRO.PLATFORM_LEN / 2) / 2;
  const lenCore = z1 - z0;
  const midZCore = PLATFORM_CORE_Z;
  const coreInnerX = PLATFORM_CORE_X - PLATFORM_CORE_HALF_W;
  const coreOuterX = PLATFORM_CORE_X + PLATFORM_CORE_HALF_W;
  const innerW = coreInnerX - PLATFORM_INNER_X;
  const outerW = platformOuter - coreOuterX;
  const innerCx = side * (PLATFORM_INNER_X + innerW / 2);
  const outerCx = side * (coreOuterX + outerW / 2);

  // 1. South full-width deck
  slabLocal(walkable, station, METRO.PLATFORM_Y, cx, midZSouth, halfW, lenSouth / 2);
  // 2. North full-width deck
  slabLocal(walkable, station, METRO.PLATFORM_Y, cx, midZNorth, halfW, lenNorth / 2);
  // 3. Inner walkway along track/PSD side
  slabLocal(walkable, station, METRO.PLATFORM_Y, innerCx, midZCore, innerW / 2, lenCore / 2);
  // 4. Outer walkway along canopy columns
  slabLocal(walkable, station, METRO.PLATFORM_Y, outerCx, midZCore, outerW / 2, lenCore / 2);

  // Platform balustrade enclosing the stair opening
  buildPlatformStairBalustrade(bucket, collision, walkable, station, side, z0, z1, side * coreInnerX, side * coreOuterX, METRO.PLATFORM_Y);

  // PSD line (P11-I item 1): per-door-bay collision, replacing the old
  // single continuous full-length wall (which nothing could ever open) —
  // see buildPsdBarrier above.
  const psdX = side * 3.55;
  const BAY_HALF = 1.0; // must match metro.js's own BAY_HALF
  const bayZs = metro.platformDoorBays ? metro.platformDoorBays(station.name, side) : [];
  const gates = buildPsdBarrier(collision, walkable, station, psdX, bayZs, BAY_HALF, METRO.PLATFORM_Y, METRO.PLATFORM_Y + WALL_BAND_H);
  psdRegistry.set(`${station.name}|${side}`, gates);

  // Outer (non-track) edge: continuous collision wall along outerX with opening for lift bridge
  const outerX = outerEdgeX;
  if (liftBridgeZ !== null) {
    const doorHalfW = 1.6;
    wallLocal(collision, walkable, station, outerX, -METRO.PLATFORM_LEN / 2, outerX, liftBridgeZ - doorHalfW, METRO.PLATFORM_Y, METRO.PLATFORM_Y + WALL_BAND_H);
    wallLocal(collision, walkable, station, outerX, liftBridgeZ + doorHalfW, outerX, METRO.PLATFORM_LEN / 2, METRO.PLATFORM_Y, METRO.PLATFORM_Y + WALL_BAND_H);
  } else {
    wallLocal(collision, walkable, station, outerX, -METRO.PLATFORM_LEN / 2, outerX, METRO.PLATFORM_LEN / 2, METRO.PLATFORM_Y, METRO.PLATFORM_Y + WALL_BAND_H);
  }

  // End barriers and corner service cabins at platform extremities
  const cabinW = 3.4;
  const cabinD = 5.5;
  const cabinInnerX = side * (platformOuter - cabinW);
  for (const endSign of [-1, 1]) {
    const ez = endSign * METRO.PLATFORM_LEN / 2;
    const frontZ = endSign * (METRO.PLATFORM_LEN / 2 - cabinD);
    // Transverse end barrier from PSD line to cabin inner wall
    wallLocal(collision, walkable, station, psdX, ez, cabinInnerX, ez, METRO.PLATFORM_Y, METRO.PLATFORM_Y + WALL_BAND_H);
    // Cabin front wall (facing platform center)
    wallLocal(collision, walkable, station, cabinInnerX, frontZ, outerX, frontZ, METRO.PLATFORM_Y, METRO.PLATFORM_Y + WALL_BAND_H);
    // Cabin inner side wall
    wallLocal(collision, walkable, station, cabinInnerX, frontZ, cabinInnerX, ez, METRO.PLATFORM_Y, METRO.PLATFORM_Y + WALL_BAND_H);
  }
}

let _liftGlassMat = null;
function liftGlassMat() {
  if (!_liftGlassMat) {
    _liftGlassMat = new THREE.MeshStandardMaterial({
      color: 0xaeded6,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      roughness: 0.15,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
  }
  return _liftGlassMat;
}

/**
 * A short, low guard rail along one edge of a lift landing pad — a solid
 * collision band (station-local `(ax,az)`-`(bx,bz)`, height `y`..`y+1.1`)
 * plus two visible steel rail tubes, for the open-air edges of the
 * concourse/platform landing pads `buildLift` adds below (P11-S item 1: the
 * platform link bridge is a real floor floating ~6.5 m above the platform's
 * own deck level with nothing stopping a player walking straight off its
 * far edge). Deliberately not `buildGuardrail` (that one raked along a
 * sloped ramp run) — this rail is flat, so a plain axis-aligned box pair is
 * enough.
 */
function buildBridgeRail(bucket, collision, walkable, station, ax, az, bx, bz, y) {
  wallLocal(collision, walkable, station, ax, az, bx, bz, y, y + 1.1);
  const midX = (ax + bx) / 2;
  const midZ = (az + bz) / 2;
  const length = Math.hypot(bx - ax, bz - az);
  const horiz = Math.abs(bx - ax) >= Math.abs(bz - az);
  const w = horiz ? length : 0.06;
  const d = horiz ? 0.06 : length;
  pushBox(bucket, 'steel', texMat('steel'), w, 0.06, d, midX, y + 1.0, midZ);
  pushBox(bucket, 'steel', texMat('steel'), w, 0.06, d, midX, y + 0.5, midZ);
}

/**
 * P11-P item 2 (owner, live-verified by the advisor): "E: call lift" worked
 * but there was "nothing there to see" — the old build was 4 corner posts
 * (0.1 m sticks) plus a lintel band at each stop, which reads as nothing
 * from across the concourse. Rebuilt as three pieces: a real car (own
 * Group, below, because it has to MOVE), a thicker glazed/framed shaft
 * enclosure (static, merged into `bucket` like everything else here), and a
 * landing-door frame at each of the 3 stops (also static/bucketed).
 */
function buildLift(bucket, group, collision, walkable, station, interactables, state, lx, lz) {
  const { x, z } = localToWorld(station, lx, lz);
  const stops = [0, METRO.CONCOURSE_Y, METRO.PLATFORM_Y];

  const carW = 2.0;
  const carH = 2.3;
  const carD = 2.2;
  const t = 0.06; // car skin thickness

  // -- Shaft enclosure: thicker corner posts + glazing on 3 sides, running
  // the full 0 -> PLATFORM_Y travel, so the route between levels is legible
  // from all three floors (brief: "glazed or framed"). The 4th (approach)
  // side is left open for the landing-door assembly below to read as the
  // entrance rather than doubling up two different "this is the opening"
  // cues on the same face.
  const shaftHalfW = carW / 2 + 0.35;
  const shaftHalfD = carD / 2 + 0.35;
  const postH = METRO.PLATFORM_Y;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pushBox(bucket, 'steel', texMat('steel'), 0.18, postH, 0.18, lx + sx * shaftHalfW, postH / 2, lz + sz * shaftHalfD);
    }
  }
  const glass = liftGlassMat();
  bucket.push('liftGlass', glass, new THREE.BoxGeometry(0.04, postH, shaftHalfD * 2), lx - shaftHalfW, postH / 2, lz);
  bucket.push('liftGlass', glass, new THREE.BoxGeometry(0.04, postH, shaftHalfD * 2), lx + shaftHalfW, postH / 2, lz);
  bucket.push('liftGlass', glass, new THREE.BoxGeometry(shaftHalfW * 2, postH, 0.04), lx, postH / 2, lz + shaftHalfD);

  // -- Landing doors + lintel at each stop (static): frames a car-sized
  // opening so each floor's landing visibly connects to something, per the
  // brief ("landing doors at each of the three stops, so it is obvious
  // where it stops").
  const doorH = 2.1;
  for (const stopY of stops) {
    const doorW = carW + 0.3;
    const doorX = doorW / 2;
    // A landing lintel alone made the shaft read as a loose overhead bar.
    // Pair it with jambs and a translucent door leaf so every stop has a
    // readable, safe opening while the actual moving car remains visible.
    pushBox(bucket, 'steel', texMat('steel'), 0.12, doorH, 0.1, lx - doorX, stopY + doorH / 2, lz - shaftHalfD, TEXTURE_SPECS.steel.repeat, [0.12, doorH]);
    pushBox(bucket, 'steel', texMat('steel'), 0.12, doorH, 0.1, lx + doorX, stopY + doorH / 2, lz - shaftHalfD, TEXTURE_SPECS.steel.repeat, [0.12, doorH]);
    pushBox(bucket, 'steel', texMat('steel'), carW + 0.3, 0.18, 0.1, lx, stopY + doorH + 0.09, lz - shaftHalfD, TEXTURE_SPECS.steel.repeat, [carW + 0.3, 0.18]);
    bucket.push('liftGlass', glass, new THREE.BoxGeometry(Math.max(0.1, doorW - 0.24), doorH - 0.18, 0.035), lx, stopY + doorH / 2, lz - shaftHalfD - 0.015);
  }

  // -- P11-S: real floor at every stop, overlapping the deck it serves. -----
  // Measured live (see the P11-S brief): `supportHeightAt(lift.x, lift.z, y)`
  // returned 0 at street (fine — the street's own ground plane already
  // covers this X/Z) but NULL at both CONCOURSE_Y and DECK_Y, because P11-P
  // correctly moved the shaft out to `PORTAL_COL_X + 0.5` (clear of the
  // carriageway) without checking that the concourse slab stops 0.5 m short
  // of that X (`CONCOURSE_W/2 = 13.5`) and the platform deck stops more than
  // 3 m short of it (`platformOuter = 10.7`). The tween raised the player's
  // feetY to a height with nothing under them; gravity then dropped them
  // straight back to the street. Fixed by registering one landing slab per
  // upper stop, anchored on the shaft footprint and extended past it to
  // OVERLAP the destination floor by a real margin (1 m), not just touch its
  // edge — the 0.1 m stair/escalator gap in P11-A was exactly this failure
  // reappearing, so this deliberately errs wide.
  const side = lx >= 0 ? 1 : -1;
  const shaftMarginX = shaftHalfW + 0.3; // past the shaft's own glazing
  // `nearestInteractable`'s range (9, hypot'd with a vertical term) lets a
  // player trigger the lift from several metres away, not only standing
  // flush against the door — so the landing needs more than just the
  // shaft's own footprint to reliably catch them. 2 m of apron (on top of
  // the shaft's own halfD) covers realistic approach positions without
  // reaching so far in Z that it would overlap unrelated geometry (the
  // paid-side stair/escalator cores sit at a fixed centerZ=12, well clear
  // of every station's liftLz in practice).
  const landingHalfD = shaftHalfD + 2.0;
  const outerX = lx + side * shaftMarginX; // far edge, past the shaft (open air)

  // Concourse landing: bridges the 0.5 m gap from the shaft (|lx|=14.0) back
  // to the concourse slab's edge (CONCOURSE_W/2=13.5), overlapping 1 m INTO
  // the concourse rather than stopping at its edge.
  const clInnerX = side * (CONCOURSE_W / 2 - 1.0);
  const clCenterX = (clInnerX + outerX) / 2;
  const clHalfW = Math.abs(outerX - clInnerX) / 2;
  slabLocal(walkable, station, METRO.CONCOURSE_Y, clCenterX, lz, clHalfW, landingHalfD);
  pushBox(bucket, 'concourseFloor', texMat('concourseFloor'), clHalfW * 2, 0.4, landingHalfD * 2,
    clCenterX, METRO.CONCOURSE_Y - 0.2, lz, TEXTURE_SPECS.concourseFloor.repeat);
  // The far (street-facing) edge of this landing now floats ~8 m above the
  // street with nothing beyond it — rail it.
  buildBridgeRail(bucket, collision, walkable, station, outerX, lz - landingHalfD, outerX, lz + landingHalfD, METRO.CONCOURSE_Y);

  // Platform landing — the hard case the brief calls out: the platform deck
  // (`platformOuter = CANOPY_SPAN/2 - 0.3 = 10.7`) ends more than 3 m short
  // of the shaft (|lx|=14.0), so the lift cannot open directly onto it.
  // Chosen option (a): a short link bridge — real walkable slab, visible
  // deck, guard rail — rather than option (b) (drop the platform from the
  // stop list). The lift already reads as a real accessibility route
  // (labelled stop, landing doors at all 3 floors); serving only street and
  // concourse would silently make the platform wheelchair-inaccessible for
  // no reason the geometry actually requires — a 3.3 m bridge is cheap.
  // Ticket gating is untouched: this is only geometry, the fare check still
  // lives in the `action` callback below and still gates the ONLY way onto
  // this bridge (stepping out of the car at DECK_Y).
  const platformOuterEdge = CANOPY_SPAN / 2 - 0.3; // == buildPlatform's own `platformOuter`
  const plInnerX = side * (platformOuterEdge - 1.0); // 1 m overlap into the platform deck
  const plCenterX = (plInnerX + outerX) / 2;
  const plHalfW = Math.abs(outerX - plInnerX) / 2;
  slabLocal(walkable, station, METRO.PLATFORM_Y, plCenterX, lz, plHalfW, landingHalfD);
  pushBox(bucket, 'platformFloor', texMat('platformFloor'), plHalfW * 2, 0.3, landingHalfD * 2,
    plCenterX, METRO.PLATFORM_Y - 0.15, lz, TEXTURE_SPECS.platformFloor.repeat);
  // Three of the bridge's four edges are open air (the platform's own deck
  // continues past the fourth, `plInnerX`, so that one is deliberately left
  // unrailed): the far (outer) edge past the shaft, and both long sides,
  // ~6.5 m above the platform's own floor level.
  buildBridgeRail(bucket, collision, walkable, station, outerX, lz - landingHalfD, outerX, lz + landingHalfD, METRO.PLATFORM_Y);
  buildBridgeRail(bucket, collision, walkable, station, plInnerX, lz - landingHalfD, outerX, lz - landingHalfD, METRO.PLATFORM_Y);
  buildBridgeRail(bucket, collision, walkable, station, plInnerX, lz + landingHalfD, outerX, lz + landingHalfD, METRO.PLATFORM_Y);

  // -- The car: floor, ceiling, three solid sides, glazed front (brief:
  // "sized like the interaction implies", ~2.0x2.2x2.3 m). This is its own
  // small Group (2 draw calls: opaque body + glazed front), not part of the
  // shared per-station `bucket`, because — unlike everything else this
  // function builds — it has to move: `carGroup.position.y` is set directly
  // to the stop the player last called it to (P11-P item 2/2b: "the car
  // should visibly sit at the level the player last sent it to ... it must
  // not be at a level unrelated to state.liftTween"). No smooth animation
  // (the brief says that's fine) — it teleports in step with the tween
  // below, which is what actually moves the player.
  const carGeoms = [];
  const addCarPart = (w, h, d, ox, oy, oz) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(ox, oy, oz);
    carGeoms.push(g);
  };
  addCarPart(carW, t, carD, 0, t / 2, 0); // floor
  addCarPart(carW, t, carD, 0, carH - t / 2, 0); // ceiling
  addCarPart(carW, carH, t, 0, carH / 2, carD / 2 - t / 2); // back (away from the shaft opening)
  addCarPart(t, carH, carD, -carW / 2 + t / 2, carH / 2, 0); // left
  addCarPart(t, carH, carD, carW / 2 - t / 2, carH / 2, 0); // right
  const bodyMesh = new THREE.Mesh(mergeGeometries(carGeoms, false), texMat('steel'));
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  const carGroup = new THREE.Group();
  carGroup.name = `lift-car:${station.name}`;
  carGroup.add(bodyMesh);
  carGroup.position.set(lx, 0, lz); // street level by default, until called
  group.add(carGroup);

  for (const stopY of stops) {
    const entrance = localToWorld(station, lx, lz - shaftHalfD - 0.6);
    interactables.push({
      position: new THREE.Vector3(entrance.x, stopY + 1, entrance.z),
      label: 'E: use lift · choose floor',
      range: 3,
      action: (player) => {
        if (state.liftTween || player.inLift) return;
        chooseLiftFloor(player.feetY, state.hasTicket, (target) => {
          player.inLift = true;
          player.keys.clear();
          player.velocity.set(0, 0, 0);
          state.liftTween = { player, from: stopY, to: target, x, z, entrance, carGroup, t: 0, dur: 2.5 };
        });
      },
    });
  }
}

/**
 * Perimeter walls on both long (X) sides of the concourse, with a door gap
 * left open at each entry point. `gaps` is { '-1': [{z,half}...], '1': [...] }
 * keyed by which side (matching entrances[].side / coreX sign) the gap is
 * on. Segments are collision-only except for the visible wall box, which is
 * pushed into the 'wall' texture bucket.
 */
function buildPerimeterWalls(bucket, collision, walkable, station, wallH, gapsBySide) {
  for (const side of [-1, 1]) {
    const gaps = (gapsBySide[side] || []).slice().sort((a, b) => a.z - b.z);
    let cursor = -CONCOURSE_LEN / 2;
    const segments = [];
    for (const g of gaps) {
      const gLo = Math.max(cursor, g.z - g.half);
      const gHi = Math.min(CONCOURSE_LEN / 2, g.z + g.half);
      if (gLo > cursor) segments.push([cursor, gLo]);
      cursor = Math.max(cursor, gHi);
    }
    if (cursor < CONCOURSE_LEN / 2) segments.push([cursor, CONCOURSE_LEN / 2]);
    for (const [z0, z1] of segments) {
      if (z1 - z0 < 0.1) continue;
      wallLocal(collision, walkable, station, (side * CONCOURSE_W) / 2, z0, (side * CONCOURSE_W) / 2, z1,
        METRO.CONCOURSE_Y, METRO.CONCOURSE_Y + wallH);
      pushBox(bucket, 'wall', texMat('wall'), 0.2, wallH, z1 - z0, (side * CONCOURSE_W) / 2, METRO.CONCOURSE_Y + wallH / 2, (z0 + z1) / 2, TEXTURE_SPECS.wall.repeat, [z1 - z0, wallH]);
    }
  }
}

/**
 * Mount a single-plane sign flush against a wall-like vertical surface at
 * station-local (x,y,z), facing INTO the room the wall bounds. `faceSign`
 * is the sign of the local-X (or local-Z, see `axis`) coordinate the wall
 * sits on relative to the space it encloses — e.g. +1 for the concourse's
 * +X perimeter wall, or a platform-access core's coreX sign — so the sign
 * always faces back toward X=0 (or the core, respectively) instead of into
 * the wall.
 */
function mountFacingCentre(mesh, group, faceSign, x, y, z) {
  mesh.position.set(x, y, z);
  mesh.rotation.y = faceSign > 0 ? -Math.PI / 2 : Math.PI / 2;
  group.add(mesh);
}

/**
 * P11-P item 3: a "Tickets"/"Platforms" wayfinding board, in the same
 * white-board/green-arrow language as signs.js's makeEntranceLabel and
 * makeDirectionBoard (imported, never edited — this is the "or an
 * equivalent" the brief allows, since makeDirectionBoard's canvas hardcodes
 * "Trains toward {dest}" text and can't be repurposed for a plain "TICKETS"
 * / "PLATFORMS" label without editing signs.js). One board carries both
 * halves (1 draw call, not 2) — left half points one way, right half the
 * other. `THREE.DoubleSide` so it reads correctly regardless of which
 * direction the player is walking past it.
 *
 * Cached by (w,h) only: the content is fixed (every station has exactly one
 * TVM bank and one paid side), so all stations share the same texture.
 */
const wayfindingBoardCache = new Map();
function makeTicketsPlatformsBoard(w, h) {
  const cached = wayfindingBoardCache.get(`${w}|${h}`);
  if (cached) return new THREE.Mesh(cached.geometry, cached.material);

  const PX = 1024;
  const aspect = h / w;
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = Math.max(96, Math.round(PX * aspect));
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = '#0c7a4e';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#006747';
  ctx.lineWidth = H * 0.03;
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);
  // Centre divider.
  ctx.fillStyle = '#006747';
  ctx.fillRect(W / 2 - H * 0.015, H * 0.12, H * 0.03, H * 0.76);

  const drawHalf = (cx, label, bnLabel, arrowRight) => {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    const arrowSize = H * 0.32;
    const arrowCx = arrowRight ? cx + W * 0.28 : cx - W * 0.28;
    ctx.translate(arrowCx, H * 0.5);
    if (!arrowRight) ctx.rotate(Math.PI);
    ctx.beginPath();
    ctx.moveTo(-arrowSize * 0.5, -arrowSize * 0.5);
    ctx.lineTo(arrowSize * 0.5, 0);
    ctx.lineTo(-arrowSize * 0.5, arrowSize * 0.5);
    ctx.lineTo(-arrowSize * 0.18, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${H * 0.17}px system-ui, "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(label, cx, H * 0.3);
    ctx.font = `600 ${H * 0.12}px "Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`;
    ctx.fillText(bnLabel, cx, H * 0.68);
  };
  drawHalf(W * 0.25, 'TICKETS', 'টিকিট', false);
  drawHalf(W * 0.75, 'PLATFORMS', 'প্ল্যাটফর্ম', true);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const geometry = new THREE.PlaneGeometry(w, h);
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  wayfindingBoardCache.set(`${w}|${h}`, { geometry, material });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'wayfinding:tickets-platforms';
  return mesh;
}

/**
 * Place every wayfinding sign for one station (P11-I item 2): a strip map
 * on the concourse wall near the TVM bank and one on each platform, a
 * direction board over each paid-side platform-access core, a platform
 * number sign at each platform head, an exit sign over each entrance
 * core's concourse-side landing, and a next-train display hung over each
 * platform. All geometry from signs.js (imported, never edited) — this
 * function only positions/orients the meshes it returns.
 *
 * P11-P item 3 adds one more: a "Tickets / Platforms" board hung over the
 * unpaid side of the AFC gate line, mounted with the same rotation
 * convention as `mountFacingCentre`'s faceSign=+1 (canvas-right maps to
 * world +Z — confirmed against the quaternion, not eyeballed, since this
 * pass can't use the browser preview) so its right-pointing "PLATFORMS"
 * arrow really points toward +Z (where the paid-side stairs are, `centerZ:
 * 12` in buildStationInterior below) and its left-pointing "TICKETS" arrow
 * points toward -Z (the TVM bank at `tvmZ`, always more negative than the
 * gate). `gateZ` must match buildTicketGate's own gate-line Z.
 */
function placeWayfindingSigns(group, station, metro, entrances, tvmZ, gateZ) {
  const en = station.name;

  const wayfinder = makeTicketsPlatformsBoard(3.4, 0.9);
  wayfinder.position.set(CONCOURSE_W / 2 - 1.2, METRO.CONCOURSE_Y + 3.6, gateZ - 4);
  wayfinder.rotation.y = -Math.PI / 2;
  group.add(wayfinder);

  // -- Strip map: concourse wall near the unpaid-side TVM bank, plus one
  // per platform, all at ~1.6 m eye height above their own deck. -----------
  const concourseMap = makeLineStripMap(en, 3.6, 0.9);
  mountFacingCentre(concourseMap, group, -1, -(CONCOURSE_W / 2 - 0.06), METRO.CONCOURSE_Y + 1.6, tvmZ);

  for (const side of [-1, 1]) {
    const platMap = makeLineStripMap(en, 3.2, 0.8);
    mountFacingCentre(platMap, group, side, side * (CANOPY_SPAN / 2 - 0.04), METRO.PLATFORM_Y + 1.6, 24);
  }

  // -- Direction boards over each paid-side platform-access core -----------
  // (buildStationInterior below builds these cores at coreX = side*6,
  // centerZ = 12, halfD = RUN_PLATFORM; their PLATFORM_Y landing — where a
  // climbing passenger actually reaches the platform — sits at
  // centerZ + (halfD + 1), matching buildCore's own y1Z). Mounted facing
  // -Z (rotation.y = PI) so it reads to a passenger climbing toward +Z
  // (buildCore's `sign: -1` here means escDir = +1, i.e. climbs toward
  // +Z) as they arrive, not to someone already past it on the platform.
  for (const side of [-1, 1]) {
    const route = getPlatformRoute(metro, station.name, side);
    const dest = { en: route.destination, bn: LINE_STOPS.find((stop) => stop.en === route.destination)?.bn ?? '' };
    const board = makeDirectionBoard(dest.en, dest.bn, [], 2.2, 0.9, { arrow: 'right' });
    const landingZ = 12 + (RUN_PLATFORM + 1);
    board.position.set(side * PLATFORM_CORE_X, METRO.PLATFORM_Y + 2.6, landingZ - 1.2);
    board.rotation.y = Math.PI;
    group.add(board);

    // Concourse / Exit wayfinding board facing platform passengers walking towards the stairs
    const exitBoard = makeExitSign('Concourse', 2.2, 0.9);
    exitBoard.position.set(side * PLATFORM_CORE_X, METRO.PLATFORM_Y + 2.6, landingZ - 1.2);
    exitBoard.rotation.y = 0;
    group.add(exitBoard);

    // -- Platform number sign at the platform head (same access point,
    // a little further out onto the platform so it doesn't overlap the
    // direction board above the stair mouth). Platform 1 = side -1,
    // platform 2 = side +1, arbitrary but stable numbering.
    const numberSign = makePlatformNumberSign(side < 0 ? 1 : 2, dest.en, dest.bn, 1.4, 1.6);
    numberSign.position.set(side * (CANOPY_SPAN / 2 - 0.04), METRO.PLATFORM_Y + 2.2, landingZ + 3);
    numberSign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(numberSign);

    // -- Next-train display hung over the platform, static rows for now
    // (stationlife.js can call mesh.userData.update(lines) later per the
    // brief). Offset in Z from the strip map (z=24) and the access core
    // (z~18.5) so nothing overlaps.
    const pid = makeNextTrainDisplay([dest.en, route.gateway ? 'Interdistrict connection' : route.available ? 'Wait for open doors' : 'Use opposite platform'], 1.6, 0.5);
    pid.position.set(side * (CANOPY_SPAN / 2 - 0.04), METRO.PLATFORM_Y + 3.0, -30);
    pid.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(pid);
  }

  // -- Exit signs over each entrance core's concourse-side landing --------
  if (entrances) {
    for (const enEntry of entrances) {
      const { lx, lz, dir: sign2 } = entranceLocal(station, enEntry);
      const centerZ = sign2 < 0 ? lz + RUN_ENTRANCE : lz - RUN_ENTRANCE;
      const landingZ = centerZ - sign2 * (RUN_ENTRANCE + 1);
      const exitSign = makeExitSign(enEntry.letter, 1.4, 0.6);
      const wallSide = lx >= 0 ? 1 : -1;
      mountFacingCentre(exitSign, group, wallSide, lx, METRO.CONCOURSE_Y + 2.6, landingZ);
    }
  }
}

function buildStationInterior(scene, station, walkable, collision, interactables, state, metro, psdRegistry) {
  const group = new THREE.Group();
  group.name = `interior:${station.name}`;
  group.position.set(station.x, 0, station.z);
  group.rotation.y = station.heading;
  scene.add(group);

  const bucket = createBucketer();

  // -- Concourse floor (tiles-light-stone) -------------------------------
  slabLocal(walkable, station, METRO.CONCOURSE_Y, 0, 0, CONCOURSE_W / 2, CONCOURSE_LEN / 2);
  pushBox(bucket, 'concourseFloor', texMat('concourseFloor'), CONCOURSE_W, 0.4, CONCOURSE_LEN, 0, METRO.CONCOURSE_Y - 0.2, 0, TEXTURE_SPECS.concourseFloor.repeat);
  // Yellow tactile strip running to the gate line (photos P8-P12).
  pushBox(bucket, 'tactile', mat('tactile'), 1.2, 0.02, CONCOURSE_LEN * 0.5, 0, METRO.CONCOURSE_Y + 0.01, -CONCOURSE_LEN * 0.12);

  // -- Ceiling: aluminium-brushed strip/baffle ceiling (procedural pattern
  // of parallel bars with small gaps, per the brief: "procedural strip
  // pattern is fine") ------------------------------------------------------
  const wallH = 4.2;
  const ceilY = METRO.CONCOURSE_Y + wallH;
  const stripW = 0.9;
  const stripGap = 0.15;
  const stripCount = Math.max(1, Math.floor(CONCOURSE_W / (stripW + stripGap)));
  const totalW = stripCount * (stripW + stripGap) - stripGap;
  const stripStartX = -totalW / 2 + stripW / 2;
  for (let i = 0; i < stripCount; i++) {
    const sx = stripStartX + i * (stripW + stripGap);
    if (Math.abs(sx) >= 4.7 && Math.abs(sx) <= 8.9) {
      // Split strip around the stair opening Z in [5.3, 18.7]
      const lenS = 5.3 - (-CONCOURSE_LEN / 2);
      const midZS = (-CONCOURSE_LEN / 2 + 5.3) / 2;
      pushBox(bucket, 'ceiling', texMat('ceiling'), stripW, 0.12, lenS, sx, ceilY, midZS, TEXTURE_SPECS.ceiling.repeat, [stripW, lenS]);
      const lenN = CONCOURSE_LEN / 2 - 18.7;
      const midZN = (18.7 + CONCOURSE_LEN / 2) / 2;
      pushBox(bucket, 'ceiling', texMat('ceiling'), stripW, 0.12, lenN, sx, ceilY, midZN, TEXTURE_SPECS.ceiling.repeat, [stripW, lenN]);
    } else {
      pushBox(bucket, 'ceiling', texMat('ceiling'), stripW, 0.12, CONCOURSE_LEN, sx, ceilY, 0, TEXTURE_SPECS.ceiling.repeat, [stripW, CONCOURSE_LEN]);
    }
  }

  // -- Entrance cores (street <-> concourse) ------------------------------
  // Real entrances (P1-E3c): station.entrances[] gives world (x,z), a
  // letter and a side (-1/1). Convert each to station-local coordinates and
  // build a core there instead of the old synthetic two-core (south/north)
  // fallback — this is what dodges the real OSM building footprint E3b
  // found sitting on top of the fallback's placement (docs/INTERIOR-PASS.md
  // "A real building blocks the south entrance's concourse-side landing").
  // Fallback (original P0-E3 placement) kept only when entrances[] is
  // absent/empty, per the brief.
  const wallGaps = { '-1': [], 1: [] };
  const coreXFallback = CONCOURSE_W / 2 + 4;
  const entrances = station.entrances && station.entrances.length ? station.entrances : null;

  if (entrances) {
    for (const en of entrances) {
      // sign picks which end of the RUN_ENTRANCE ramp is street level (loY):
      // an entrance on the -Z half of the concourse footprint approaches
      // from local -Z (sign -1), one on the +Z half from local +Z (sign +1)
      // — matches buildCore's y0/y1 convention (rampLocal: y0 at local -Z).
      // P11-Q: this is now en.dir (metro.js's own stairSign, published
      // per-entrance) rather than re-derived from lz's sign — see
      // entranceLocal()'s doc comment for why that broke 2-entrance
      // stations, where lz is legitimately 0.
      const { lx, lz, dir: sign } = entranceLocal(station, en);
      const centerZ = sign < 0 ? lz + RUN_ENTRANCE : lz - RUN_ENTRANCE;
      buildCore(bucket, collision, walkable, station, interactables, {
        coreX: lx,
        centerZ,
        halfD: RUN_ENTRANCE,
        loY: 0,
        hiY: METRO.CONCOURSE_Y,
        sign,
        label: `entrance ${en.letter}`,
        railConcourseLanding: true,
      });
      // Gap must be centred on the LANDING's local Z (top of stair, where
      // the player actually reaches the concourse-side wall), not the
      // entrance's own street-level foot Z (`lz`) — P1-E3d item 1. The
      // concourse-side landing sits RUN_ENTRANCE+1 m beyond centerZ, on the
      // opposite side from the street: matches buildCore's y0/y1Z placement
      // (`centerZ -+ (halfD+1)`), using -sign here because y0 (street) is
      // always at `centerZ - (halfD+1)*sign`'s "loY" end — see the sign
      // convention comment above (rampLocal: y0 at local -Z, y1 at local
      // +Z; y0=loY when sign<0, y1=loY when sign>0).
      const gapSide = en.side ?? (lx < 0 ? -1 : 1);
      const landingZ = centerZ - sign * (RUN_ENTRANCE + 1);
      // Door gap matches the 3.2 m entrance doorway opening in metro.js (half = 1.6)
      const half = 1.6;
      (wallGaps[gapSide] || (wallGaps[gapSide] = [])).push({ z: landingZ, half });

      // Entrance bridge connecting concourse perimeter to entrance core:
      // Bridge floor is 3.0 m wide (halfD = 1.5) at METRO.CONCOURSE_Y
      const concourseEdgeX = gapSide * (CONCOURSE_W / 2);
      const bridgeMidX = (concourseEdgeX + lx) / 2;
      const bridgeHalfW = Math.abs(lx - concourseEdgeX) / 2;
      slabLocal(walkable, station, METRO.CONCOURSE_Y, bridgeMidX, landingZ, bridgeHalfW + 0.5, 1.5);

      // Solid guardrails / side walls along both edges of the bridge so player cannot fall off
      buildBridgeRail(bucket, collision, walkable, station, concourseEdgeX, landingZ - 1.5, lx, landingZ - 1.5, METRO.CONCOURSE_Y);
      buildBridgeRail(bucket, collision, walkable, station, concourseEdgeX, landingZ + 1.5, lx, landingZ + 1.5, METRO.CONCOURSE_Y);
    }
  } else {
    buildCore(bucket, collision, walkable, station, interactables, {
      coreX: coreXFallback,
      centerZ: -(CONCOURSE_LEN / 2 + 6),
      halfD: RUN_ENTRANCE,
      loY: 0,
      hiY: METRO.CONCOURSE_Y,
      sign: -1,
      label: 'entrance (south)',
      railConcourseLanding: true,
    });
    buildCore(bucket, collision, walkable, station, interactables, {
      coreX: coreXFallback,
      centerZ: CONCOURSE_LEN / 2 + 6,
      halfD: RUN_ENTRANCE,
      loY: 0,
      hiY: METRO.CONCOURSE_Y,
      sign: 1,
      label: 'entrance (north)',
      railConcourseLanding: true,
    });
    // Fallback cores sit beyond the concourse's own Z ends (|centerZ| > 30 =
    // CONCOURSE_LEN/2), past where the perimeter walls (built below, Z in
    // [-30,30]) reach — no door gap needed, matching E3b's original layout.
  }

  // -- Concourse perimeter walls (cream panels), gapped at each entrance --


  // -- Unpaid side: TVM bank -----------------------------------------------
  const tvmZ = -CONCOURSE_LEN / 2 + 8;
  for (let i = 0; i < 3; i++) {
    const tx = -6 + i * 2.2;
    pushBox(bucket, 'tvm', mat('tvm'), 0.6, 1.7, 0.6, tx, METRO.CONCOURSE_Y + 0.85, tvmZ);
    const { x, z } = localToWorld(station, tx, tvmZ);
    interactables.push({
      position: new THREE.Vector3(x, METRO.CONCOURSE_Y, z),
      label: 'E: buy ticket',
      range: 2.5,
      action: () => {
        state.hasTicket = true;
        state.hint = 'Ticket purchased';
        state.hintUntil = performance.now() + 1500;
      },
    });
  }

  // -- AFC gate line --------------------------------------------------------
  const GATE_Z = -6; // also passed to placeWayfindingSigns below — keep in sync
  buildTicketGate(bucket, group, collision, walkable, station, interactables, state, GATE_Z);

  // -- Paid-side stairs/escalators up to each platform ----------------------
  for (const side of [-1, 1]) {
    const stairX = side > 0 ? (PLATFORM_CORE_X - 0.55) : (-PLATFORM_CORE_X + 0.55);
    const escX = side > 0 ? (PLATFORM_CORE_X + 1.05) : (-PLATFORM_CORE_X - 1.05);
    buildCore(bucket, collision, walkable, station, interactables, {
      coreX: side * PLATFORM_CORE_X,
      coreHalfW: PLATFORM_CORE_HALF_W,
      stairX,
      stairHalfW: 1.15,
      escX,
      escHalfW: 0.5,
      centerZ: PLATFORM_CORE_Z,
      halfD: PLATFORM_CORE_HALF_D,
      loY: METRO.CONCOURSE_Y,
      hiY: METRO.PLATFORM_Y,
      sign: -1,
      label: `platform ${side < 0 ? 'A' : 'B'} access`,
    });
  }

  // -- Lift: concourse<->platform<->street (see buildLift's note). --------
  // P11-P item 2b (owner, REAL): the old fixed placement was station-local
  // (8, -(CONCOURSE_LEN/2-6)) — |localX|=8 is deep inside the carriageway
  // (metro.js's own `roadHalf` estimate is 12 either side of the spine, and
  // its portal columns/footpath edge sit at PORTAL_COL_X=13.5), so the
  // lift's street-level stop, car and shaft all stood in the middle of the
  // road with traffic driving through them — the same class of bug as the
  // 2026-09-07 pole-in-the-carriageway report.
  //
  // Fix: anchor to an actual station.entrances[] core (brief: "ideally
  // alongside one of the entrances ... share a street frontage, which is
  // also how the real stations are laid out") and read the footpath edge
  // from METRO.PORTAL_COL_X (metro.js's own constant) instead of
  // hardcoding 13.5, so this tracks any future change to the road width.
  //
  // The lift doesn't move in X/Z (only feetY tweens), so ONE (lx,lz) has to
  // work at all three stops: clear of the carriageway at street level, AND
  // still close enough to the platform deck at DECK_Y for
  // nearestInteractable's range=9 check to reach it (its vertical term
  // alone already eats ~7.5 m of that budget — see buildLift). That rules
  // out simply moving all the way out to an entrance's own coreX (~16.5 m
  // out): the platform floor only reaches to ~10.7 m, which is already
  // beyond range from there. Landing just past the footpath edge instead
  // (PORTAL_COL_X + 0.5) keeps it on the platform side of that budget while
  // still being outside metro.js's carriageway estimate.
  //
  // liftLz reuses the SAME landingZ formula interior.js already computes
  // above for that entrance's own perimeter-wall door gap (so the lift's
  // concourse-level stop sits in that same opening, not behind solid
  // brick), offset 2*RUN_ENTRANCE+6 m back from the entrance's street foot
  // — clear of that entrance's own stair-shell footprint (which runs
  // RUN_ENTRANCE*2 m, see metro.js STAIR_RUN) and, checked against this
  // build's fixed constants (CONCOURSE_LEN=60, portal columns every 15 m
  // from -22.5), clear of the nearest portal column by ~2 m.
  const PORTAL_COL_X = METRO.PORTAL_COL_X ?? 13.5;
  let liftLx;
  let liftLz;
  if (entrances && entrances.length) {
    const enRef = entrances[0];
    const { lx: elx, lz: elz, dir: enSign } = entranceLocal(station, enRef);
    const enSide = enRef.side ?? (elx < 0 ? -1 : 1);
    liftLx = enSide * (PORTAL_COL_X + 0.5);
    liftLz = elz - enSign * (RUN_ENTRANCE * 2 + 6);
  } else {
    // No station.entrances[] (fallback stations, see the entrance-cores
    // block above): keep the old Z, just move X out past the footpath edge
    // so it is never in the carriageway.
    liftLx = PORTAL_COL_X + 0.5;
    liftLz = -(CONCOURSE_LEN / 2 - 6);
  }

  // P11-R fallout: lift clearance against portal columns
  {
    const PORTAL_COL_SIZE = METRO.PORTAL_COL_SIZE ?? 1.2;
    const LIFT_SHAFT_HALF_D = 2.2 / 2 + 0.35; // carD/2 + 0.35, matches buildLift's shaftHalfD
    const LIFT_COL_CLEAR = LIFT_SHAFT_HALF_D + PORTAL_COL_SIZE / 2 + 0.3; // + a real margin, not a graze
    const halfL = CONCOURSE_LEN / 2;
    for (let d = -halfL + 7.5; d <= halfL - 7.5 + 0.01; d += 15) {
      if (Math.abs(liftLz - d) < LIFT_COL_CLEAR) {
        const upZ = d + LIFT_COL_CLEAR;
        const downZ = d - LIFT_COL_CLEAR;
        liftLz = Math.abs(upZ - liftLz) < Math.abs(downZ - liftLz) ? upZ : downZ;
      }
    }
  }

  // -- Platforms --------------------------------------------------------
  const liftSide = liftLx < 0 ? -1 : 1;
  buildPlatform(bucket, collision, walkable, station, interactables, -1, metro, psdRegistry, liftSide === -1 ? liftLz : null);
  buildPlatform(bucket, collision, walkable, station, interactables, 1, metro, psdRegistry, liftSide === 1 ? liftLz : null);

  wallGaps[String(liftSide)].push({ z: liftLz, half: 3.5 });
  buildPerimeterWalls(bucket, collision, walkable, station, wallH, wallGaps);
  buildLift(bucket, group, collision, walkable, station, interactables, state, liftLx, liftLz);

  // -- Wayfinding signs (P11-I item 2) -------------------------------------
  placeWayfindingSigns(group, station, metro, entrances, tvmZ, GATE_Z);

  const draws = bucket.flush(group, `interior:${station.name}`);
  if (typeof console !== 'undefined' && console.debug) {
    console.debug(`[interior] ${station.name}: ${draws} draw calls (bucketed)`);
  }
}

/**
 * @param scene THREE.Scene to add interior geometry to (scene3 from main.js)
 * @param metro result of buildMetro() — read-only, for METRO/stations
 * @param walkable createWalkableRegistry() instance
 * @param collision buildCollisionGrid() result (extended via addSegments)
 */
export function createInteriorSystem(scene, metro, walkable, collision) {
  const built = new Set();
  const interactables = [];
  const state = { hasTicket: false, hint: '', hintUntil: 0, gates: [], gateLights: null, liftTween: null };
  // P11-I item 1: "stationName|side" -> [{seg, closed}, ...] per-bay PSD
  // collision gates, populated as each station's interior is (lazily)
  // built. setPsdOpen() below is a no-op for a station not yet built —
  // matches metro.js's own setPlatformDoors() guard for the same reason.
  const psdRegistry = new Map();

  function ensureBuilt(station) {
    if (built.has(station.name)) return;
    built.add(station.name);
    buildStationInterior(scene, station, walkable, collision, interactables, state, metro, psdRegistry);
  }

  /**
   * setPsdOpen(stationName, side, amount01): degenerate (amount01 > 0.5) or
   * restore (otherwise) every door-bay collision segment on that platform
   * edge — the exact AFC-gate trick buildTicketGate/tapIn already use
   * above. Bay positions came from metro.js's platformDoorBays() when the
   * station was built, so this always matches the visible sliding leaves
   * metro.js's setPlatformDoors() animates. Contract with stationlife.js
   * (P11-I brief) — signature must not change without saying so loudly.
   */
  function setPsdOpen(stationName, side, amount01) {
    const gates = psdRegistry.get(`${stationName}|${side}`);
    if (!gates) return;
    const open = amount01 > 0.5;
    for (const g of gates) {
      if (open) {
        g.seg[0] = g.seg[2];
        g.seg[1] = g.seg[3]; // degenerate segment: resolveCollision skips it
      } else {
        g.seg[0] = g.closed[0];
        g.seg[1] = g.closed[1];
      }
    }
  }

  function nearestInteractable(player) {
    const camDir = player.forward();
    let best = null;
    let bestD = Infinity;
    for (const it of interactables) {
      if (!it.position || !it.action) continue;
      const dx = it.position.x - player.position.x;
      const dz = it.position.z - player.position.z;
      const d = Math.hypot(dx, dz, it.position.y - player.feetY - 1);
      if (d > it.range) continue;
      const dot = dx * camDir.x + dz * camDir.z;
      if (dot < 0) continue;
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  function interact(player) {
    if (player.inLift || player.ridingTrain) return;
    const it = nearestInteractable(player);
    it?.action?.(player);
  }

  function update(dt, player) {
    for (const st of metro.stations) {
      const d = Math.hypot(st.x - player.position.x, st.z - player.position.z);
      if (d < BUILD_RADIUS) ensureBuilt(st);
    }
    updateGates(state);

    if (state.liftTween) {
      const lt = state.liftTween;
      lt.t = Math.min(1, lt.t + dt / lt.dur);
      const ease = lt.t * lt.t * (3 - 2 * lt.t);
      lt.player.feetY = lt.from + (lt.to - lt.from) * ease;
      lt.player.vy = 0;
      lt.carGroup.position.y = lt.player.feetY;
      lt.player.position.set(lt.x, lt.player.feetY + 1.68, lt.z);
      if (lt.t >= 1) {
        lt.player.position.x = lt.entrance.x;
        lt.player.position.z = lt.entrance.z;
        lt.player.inLift = false;
        state.liftTween = null;
      }
      lt.player.camera.position.copy(lt.player.position);
      return lt.t < 1 ? 'Lift moving · please wait' : 'Lift arrived';
    }

    const near = nearestInteractable(player);
    let line = near ? (typeof near.label === 'function' ? near.label(player) : near.label) : '';
    if (state.hint && performance.now() < state.hintUntil) line = state.hint;
    return line;
  }

  return { update, interact, state, interactables, setPsdOpen };
}
