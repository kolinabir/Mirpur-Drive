/**
 * metro.js
 *
 * MRT Line 6: the elevated viaduct, the Mirpur 10 and Mirpur 11 stations, and
 * the trains that run between them. Rebuilt to reference/metro/SPEC.md
 * (its ADDENDUM overrides the estimates above it) and docs/NEXT-PASS-METRO.md.
 *
 * Key real-world numbers used here:
 *  - Box girder: single-cell trapezoid, top 9.7 m / bottom 5.5 m / depth 2.0 m,
 *    soffit 12.5 m above road, deck top (rail level) 14.5 m.
 *  - Piers: chamfered rectangular shaft 2.0x1.6 m tapering slightly, flaring
 *    hammerhead cap 7.5 m wide, spacing 32 m.
 *  - Stations: street (0), concourse (8.0 m), platform (14.5 m, the deck).
 *  - Train: 6 cars, 19.8 x 2.95 x 4.1 m, stainless/green/red DMTCL livery.
 *  - Brand green #0C7A4E / #006747. No teal anywhere.
 */

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadTextureSet } from './textures.js';
import { makeEntranceLabel } from './signs.js';

// ---------------------------------------------------------------------------
// Governing dimensions (metres)
// ---------------------------------------------------------------------------

const PIER_SPACING = 32;
const GIRDER_TOP_W = 9.7;
const GIRDER_BOTTOM_W = 5.5;
const GIRDER_DEPTH = 2.0;
const SOFFIT_Y = 12.5;
const DECK_Y = SOFFIT_Y + GIRDER_DEPTH; // 14.5 m — rail top / structural deck
const TRAIN_Y_OFFSET = 0.36;          // train group sits this far above DECK_Y (rail top)
const TRAIN_FLOOR_LOCAL_Y = 0.62;     // saloon floor, train-local (src/traininterior.js)
const PLATFORM_Y = DECK_Y + TRAIN_Y_OFFSET + TRAIN_FLOOR_LOCAL_Y; // 15.48 — platform is level with the car floor
const PARAPET_H = 1.2;
const PARAPET_T = 0.4;
const TRACK_CENTRES = 3.9;
const TRACK_GAUGE_OFFSET = TRACK_CENTRES / 2;
const GAUGE = 1.435;

// Train door pitch (P11-I item 1): hoisted out of buildTrain() so
// trainDoorZs() (used to lay out the platform screen door bays) can never
// drift out of sync with the geometry a berthed train actually shows.
const TRAIN_CARS = 6;
const TRAIN_CAR_LEN = 19.8;
const TRAIN_CAR_GAP = 1.0;

// P11-K item 3 (advisor-measured bug): a train reached a given station only
// every ~505 s (8.4 min) with 2 trains sharing the whole alignment, and
// DWELL was only 6 s (a 1.2/2.3/2.5 open/hold/close split in stationlife.js
// — a ~2.4 s fully-open boarding window). Nobody would ever find the
// boarding feature. DWELL is now module-scope and exported so
// stationlife.js can import it instead of hand-duplicating a copy that can
// drift out of sync (its own file used to carry `DWELL_ASSUMED = 6` with a
// SPEED matches the authentic 100 km/h commercial operating speed scaled
// up to ~200 km/h (55.6 m/s) for faster, snappier gameplay transit.
const SPEED = 55.6;
export const DWELL = 14;

const CONCOURSE_Y = 8.0;
const CONCOURSE_LEN = 60;
const CONCOURSE_W = 27; // owner P1/P2: box spans the full carriageway (~26 m)
const CONCOURSE_WALL_H = 4.6;
const PORTAL_COL_X = 13.5; // footpath edge, owner P1/P2 (matches roadHalf below)
const PORTAL_COL_SIZE = 1.2;
const PLATFORM_LEN = 180;
const PLATFORM_W = 5;
const PLATFORM_INNER_X = 3.48; // clears 2.95m train body (outer edge at TRACK_GAUGE_OFFSET + 1.475 = 3.425m) by 55mm
const PLATFORM_CORE_X = 6.8;
const PLATFORM_CORE_HALF_W = 1.8;
const PLATFORM_CORE_Z = 12;
const PLATFORM_CORE_HALF_D = 6.5;

const CANOPY_SPAN = 22;
const CANOPY_RISE = 4.5;
const CANOPY_APEX = 6.5; // above platform floor
const CANOPY_SPRING_Y = CANOPY_APEX - CANOPY_RISE; // 2.0 m above platform

export const METRO = {
  SOFFIT_Y, DECK_Y, PLATFORM_Y, TRAIN_Y_OFFSET, TRAIN_FLOOR_LOCAL_Y, CONCOURSE_Y, PLATFORM_LEN,
  PLATFORM_W, CANOPY_SPAN, TRACK_CENTRES, CONCOURSE_W, CONCOURSE_LEN,
  // P11-P item 2b: exported so interior.js can place the lift's street-level
  // stop outside the carriageway without hardcoding this file's own footpath
  // constant (and silently drifting out of sync with it later).
  PORTAL_COL_X,
  // P11-R fallout: exported so interior.js can keep its lift shaft clear of
  // a portal column without hardcoding this file's own column size (see
  // docs/INTERIOR-PASS.md's matching dated section — the lift's X sits only
  // 0.5 m past PORTAL_COL_X, so it needs to know the column's real footprint
  // to check Z clearance against it).
  PORTAL_COL_SIZE,
  PLATFORM_INNER_X,
  PLATFORM_CORE_X,
  PLATFORM_CORE_HALF_W,
  PLATFORM_CORE_Z,
  PLATFORM_CORE_HALF_D,
};

// ---------------------------------------------------------------------------
// Colours (SPEC ADDENDUM)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// P11-H: honest, owner-documented tints again — no pre-division.
//
// P11-B pre-divided each textured tint by its map's measured mean (dividing
// the "intended final colour" by the map's own darkness) to fight
// MeshStandardMaterial multiplying `color` by `.map` per channel. That
// overshot: any tint brighter than the map's mean clipped per channel
// (which is what shifted brick's hue to salmon-pink once its red channel
// pinned at 0xff) and, in sRGB, didn't even land on the intended colour
// where it didn't clip. The station also read brighter than the city
// around it as a result (canopy shipped as pale mint / white barn roof
// instead of dark green / mid grey).
//
// The actual fix is at the source: `loadTextureSet(slug, { normalise: true
// })` in textures.js hands back a colour map whose mean has been scaled
// toward white (single luminance factor, hue-preserving), so the map
// supplies photographic VARIATION and the tint below supplies the overall
// LEVEL again, same as an untextured material. Every COL entry here is
// therefore just the owner's documented intended hex (see
// docs/TEXTURES-METRO.md) — no arithmetic. Do not re-introduce a
// pre-division step; if a material still looks wrong after normalisation,
// that's a report-back, not a hex hand-tune.
const COL = {
  concrete: 0xc9c7bd, // owner TEXTURES-METRO concrete-smooth-pale tint
  concreteDark: 0xb7b4a9,
  brick: 0xa0523a,
  band: 0xd8d3c6,
  glassDark: 0x2c3438,
  green: 0x0c7a4e,
  greenDark: 0x006747,
  corrugatedGreen: 0x2f8f5b, // entrance barrel-vault canopy
  galvanised: 0x6e7276,
  steel: 0x8e9296,
  psdFrame: 0xc9cdce, // owner TEXTURES-METRO steel-brushed tint
  psdGlass: 0xaeded6,
  canopyTop: 0x2f6b4a, // dark green corrugated top
  canopyUnder: 0x8a8d8a, // mid-grey corrugated underside
  trussWhite: 0xf1efe8, // benches / lift / roundel post — stainless, unchanged
  trussGrey: 0xb8bcbe, // light-grey lattice arches + outer columns (owner batch 2 correction, was white)
  skylightGlass: 0xa9d6db,
  platformFloor: 0x4f5250, // owner TEXTURES-METRO granite-dark-polished tint
  tactile: 0xd8b02a,
  trainBody: 0xdde0e2,
  trainRib: 0xc4c7c9,
  trainRed: 0xd8261e,
  trainGreen: 0x006747,
  trainWhite: 0xf5f7fa,
};

// A 1x1 white placeholder so USE_MAP is compiled into the shader from the
// very first frame — swapping which texture `.map` points to later (once the
// real photo loads over the network) then never needs a program recompile,
// which is the failure mode that otherwise trips refreshUniformsCommon.
let _placeholderTex = null;
function whiteTex() {
  if (_placeholderTex) return _placeholderTex;
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 2, 2);
  _placeholderTex = new THREE.CanvasTexture(c);
  _placeholderTex.colorSpace = THREE.SRGBColorSpace;
  return _placeholderTex;
}

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: COL.concrete, roughness: 0.95, metalness: 0.02, map: whiteTex() }),
  concreteDark: new THREE.MeshStandardMaterial({ color: COL.concreteDark, roughness: 0.95, metalness: 0.02, map: whiteTex() }),
  brick: new THREE.MeshStandardMaterial({ color: COL.brick, roughness: 0.92, metalness: 0.0, map: whiteTex() }),
  band: new THREE.MeshStandardMaterial({ color: COL.band, roughness: 0.9, metalness: 0.02, map: whiteTex() }),
  glass: new THREE.MeshStandardMaterial({ color: COL.glassDark, roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.75, depthWrite: false }),
  green: new THREE.MeshStandardMaterial({ color: COL.green, roughness: 0.55, metalness: 0.1 }),
  corrugatedGreen: new THREE.MeshStandardMaterial({ color: COL.corrugatedGreen, roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide, map: whiteTex() }),
  // P11-B item 3: scene.environment is null (verified live by the advisor),
  // so anything with high metalness has nothing to reflect and goes
  // near-black. A separate executor is adding an environment map, but these
  // materials must look right with OR without one — cap metalness at 0.35
  // and raise roughness to compensate so the diffuse `color` term still
  // carries most of the shading.
  galvanised: new THREE.MeshStandardMaterial({ color: COL.galvanised, roughness: 0.75, metalness: 0.35 }),
  steel: new THREE.MeshStandardMaterial({ color: COL.steel, roughness: 0.7, metalness: 0.35 }),
  psdFrame: new THREE.MeshStandardMaterial({ color: COL.psdFrame, roughness: 0.55, metalness: 0.35, map: whiteTex() }),
  psdGlass: new THREE.MeshStandardMaterial({ color: 0x98cfd4, roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.55, depthWrite: false }),
  canopyTop: new THREE.MeshStandardMaterial({ color: COL.canopyTop, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide, map: whiteTex() }),
  canopyUnder: new THREE.MeshStandardMaterial({ color: COL.canopyUnder, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide, map: whiteTex() }),
  trussWhite: new THREE.MeshStandardMaterial({ color: COL.trussWhite, roughness: 0.45, metalness: 0.35 }),
  trussGrey: new THREE.MeshStandardMaterial({ color: COL.trussGrey, roughness: 0.5, metalness: 0.4 }),
  skylight: new THREE.MeshStandardMaterial({ color: COL.skylightGlass, roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
  downlight: new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff2c8, emissiveIntensity: 1.4, roughness: 0.4 }),
  display: new THREE.MeshStandardMaterial({ color: 0x14181a, roughness: 0.5, metalness: 0.2 }),
  platformFloor: new THREE.MeshStandardMaterial({ color: COL.platformFloor, roughness: 0.35, metalness: 0.05, map: whiteTex() }),
  tactile: new THREE.MeshStandardMaterial({ color: COL.tactile, roughness: 0.7 }),
  rail: new THREE.MeshStandardMaterial({ color: 0x3d3a36, roughness: 0.4, metalness: 0.6 }),
  trainBody: new THREE.MeshStandardMaterial({ color: COL.trainBody, roughness: 0.35, metalness: 0.28 }),
  // Far-LOD car shell: the body's surface, colours from vertex attributes (buildTrain).
  trainFar: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, metalness: 0.28 }),
  trainRib: new THREE.MeshStandardMaterial({ color: COL.trainRib, roughness: 0.32, metalness: 0.32 }),
  trainGreen: new THREE.MeshStandardMaterial({ color: COL.trainGreen, roughness: 0.35, metalness: 0.08 }),
  trainWhite: new THREE.MeshStandardMaterial({ color: COL.trainWhite, roughness: 0.28, metalness: 0.1 }),
  trainRed: new THREE.MeshStandardMaterial({ color: COL.trainRed, roughness: 0.35, metalness: 0.08 }),
  trainGlass: new THREE.MeshStandardMaterial({ color: 0x6498a2, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.58, depthWrite: false, side: THREE.DoubleSide }),
  trainWindow: new THREE.MeshStandardMaterial({ color: 0x4d7f8a, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }),
  trainWindowFrame: new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.75, metalness: 0.2 }),
  trainInterior: new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0x665840, emissiveIntensity: 0.75, roughness: 0.4 }),
  trainHeadlight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfffae8, emissiveIntensity: 3.0, roughness: 0.1 }),
  trainTaillight: new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xee1111, emissiveIntensity: 2.2, roughness: 0.2 }),
  trainDest: new THREE.MeshStandardMaterial({ color: 0xffaa22, emissive: 0xff8800, emissiveIntensity: 2.5 }),
  trainRoofAC: new THREE.MeshStandardMaterial({ color: 0xd2d6d8, roughness: 0.45, metalness: 0.2 }),
  trainPantograph: new THREE.MeshStandardMaterial({ color: 0xe64a19, roughness: 0.4, metalness: 0.25 }),
  trainWheel: new THREE.MeshStandardMaterial({ color: 0x9ca0a4, roughness: 0.3, metalness: 0.6 }),
  trainDoorEdge: new THREE.MeshStandardMaterial({ color: 0xf5b800, roughness: 0.4 }),
  bogie: new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.65, metalness: 0.2 }),
  wireOrange: new THREE.MeshStandardMaterial({ color: 0xe08a2a, emissive: 0x552e00, emissiveIntensity: 0.6 }),
};

// Wire real CC0 photo textures onto the concrete/brick/corrugated materials as
// they load. Fire-and-forget: buildMetro() runs synchronously and the group
// is returned immediately, so materials start flat-tinted and gain their
// photographic detail a moment later once fetch() resolves.
// NOTE: loadTextureSet() caches ONE texture object per slug and returns the
// SAME instance to every caller, so calling `.repeat.set()` a second time
// for a different material sharing that slug clobbers the first material's
// repeat (a pre-existing limitation of textures.js, not touched here — out
// of file fence). Materials below that share a slug are therefore given the
// SAME repeat value on purpose to sidestep the conflict, and rely on the
// per-vertex world-space box-projected UV (`boxProjectUV`, geometry is now
// baked in real metres) plus `repeat` acting as "tiles per metre" (1/tile
// size), per docs/TEXTURES-METRO.md's tint/repeat table.
function wireTexture(mat, slug, repeatMetres = 3) {
  // { normalise: true } — P11-H: colour map only, mean scaled toward white
  // so the material's own `color` tint (COL, above) sets the level and the
  // photo supplies variation on top. normalMap/roughnessMap are unaffected.
  loadTextureSet(slug, { normalise: true }).then((set) => {
    const r = 1 / repeatMetres;
    if (set.map) {
      set.map.repeat.set(r, r);
      mat.map = set.map;
    }
    if (set.normalMap) {
      set.normalMap.repeat.set(r, r);
      mat.normalMap = set.normalMap;
    }
    if (set.roughnessMap) {
      set.roughnessMap.repeat.set(r, r);
      mat.roughnessMap = set.roughnessMap;
    }
    mat.needsUpdate = true;
  });
}
// concrete-smooth-pale: pier/girder/frame, TEXTURES-METRO repeat 3 m.
wireTexture(MAT.concrete, 'concrete-smooth-pale', 3);
wireTexture(MAT.concreteDark, 'concrete-smooth-pale', 3);
wireTexture(MAT.band, 'concrete-smooth-pale', 3);
// brick-old: concourse panels, tinted #A0523A (17:30 addendum).
wireTexture(MAT.brick, 'brick-old', 2.5);
// corrugated-metal: platform canopy top/underside AND entrance barrel-vault
// roofs share this slug — same repeat value on all three per the note above,
// tint differs per material (dark green / mid grey / entrance green).
wireTexture(MAT.corrugatedGreen, 'corrugated-metal', 1.2);
wireTexture(MAT.canopyTop, 'corrugated-metal', 1.2);
wireTexture(MAT.canopyUnder, 'corrugated-metal', 1.2);
// granite-dark-polished: platform floor, TEXTURES-METRO repeat 0.6 m.
wireTexture(MAT.platformFloor, 'granite-dark-polished', 0.6);
// steel-brushed: PSD frames, TEXTURES-METRO repeat 1 m.
wireTexture(MAT.psdFrame, 'steel-brushed', 1);

// ---------------------------------------------------------------------------
// Alignment helpers
// ---------------------------------------------------------------------------

function closestOnPolyline(pts, x, z) {
  let best = null;
  let bestD = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-9) continue;
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + t * dx;
    const pz = a[1] + t * dz;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [px, pz];
    }
  }
  return best;
}

function polylinePairDist(p, q) {
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

function polylineLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += polylinePairDist(pts[i], pts[i - 1]);
  return d;
}

/**
 * P11-K "366 s ride" root cause: some scenes (scene-north.json) don't give
 * each physical rail as ONE continuous OSM way — they hand back 4 track
 * pieces, where rail A is really tracks[1]+tracks[3] end-to-end and rail B
 * is tracks[2]+tracks[0] end-to-end (a shared endpoint within a couple of
 * metres, everywhere else tens to thousands of metres apart). The old
 * `centreAlignment` just read `tracks[0]`/`tracks[1]` and silently dropped
 * tracks[2]/[3] — for scene-north.json that truncated the alignment right
 * next to Uttara South, so that station's nearest-point match landed ~175 m
 * off the real line, at index 1 (almost the very start of the truncated
 * polyline) instead of near its true ~7800 m mark. That put a phantom
 * "Uttara South" dwell point 68.7 m into the line — nowhere near the real
 * station — which is what inflated a real ~127 s Mirpur10->Pallabi-adjacent
 * hop into the advisor's measured 366 s (the train had to run almost the
 * whole 7.7 km truncated line to loop back around to that phantom point).
 * Fixed at the source: chain same-endpoint segments into full rails first.
 * A normal 2-track scene (scene.json) is a no-op here — two already-full
 * tracks don't share an endpoint with each other, so each just becomes its
 * own 1-segment "chain", identical to the old direct tracks[0]/tracks[1]
 * behaviour.
 */
function chainTrackSegments(tracks, eps = 3) {
  let remaining = tracks.map((t) => t.pts.slice());
  const chains = [];
  while (remaining.length) {
    let chain = remaining.shift();
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const chainEnd = chain[chain.length - 1];
        const chainStart = chain[0];
        const segStart = seg[0];
        const segEnd = seg[seg.length - 1];
        if (polylinePairDist(chainEnd, segStart) < eps) {
          chain = chain.concat(seg.slice(1));
        } else if (polylinePairDist(chainEnd, segEnd) < eps) {
          chain = chain.concat(seg.slice(0, -1).reverse());
        } else if (polylinePairDist(chainStart, segEnd) < eps) {
          chain = seg.slice(0, -1).concat(chain);
        } else if (polylinePairDist(chainStart, segStart) < eps) {
          chain = seg.slice(1).reverse().concat(chain);
        } else {
          continue;
        }
        remaining.splice(i, 1);
        extended = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
}

/**
 * Smooth sharp corners of a polyline using quadratic Bezier transition fillets.
 * Replaces sharp angle vertices with a finely sampled smooth curve, giving
 * elevated viaducts and track alignments proper railway curve geometry.
 */
function smoothPolyline(pts, maxFilletLen = 45.0, sampleStep = 3.0) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const pPrev = pts[i - 1];
    const pCurr = pts[i];
    const pNext = pts[i + 1];

    const v1x = pCurr[0] - pPrev[0];
    const v1z = pCurr[1] - pPrev[1];
    const len1 = Math.hypot(v1x, v1z);

    const v2x = pNext[0] - pCurr[0];
    const v2z = pNext[1] - pCurr[1];
    const len2 = Math.hypot(v2x, v2z);

    if (len1 < 1e-4 || len2 < 1e-4) {
      out.push(pCurr);
      continue;
    }

    const u1x = v1x / len1;
    const u1z = v1z / len1;
    const u2x = v2x / len2;
    const u2z = v2z / len2;

    const dot = u1x * u2x + u1z * u2z;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

    if (angle > 0.015 && angle < 2.5) {
      const filletDist = Math.min(maxFilletLen, len1 * 0.4, len2 * 0.4);
      if (filletDist > 2.0) {
        const pStart = [pCurr[0] - u1x * filletDist, pCurr[1] - u1z * filletDist];
        const pEnd = [pCurr[0] + u2x * filletDist, pCurr[1] + u2z * filletDist];
        const curveLen = filletDist * 2 * Math.cos(angle / 4);
        const steps = Math.max(3, Math.ceil(curveLen / sampleStep));

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const oneMinusT = 1 - t;
          const bx = oneMinusT * oneMinusT * pStart[0] + 2 * oneMinusT * t * pCurr[0] + t * t * pEnd[0];
          const bz = oneMinusT * oneMinusT * pStart[1] + 2 * oneMinusT * t * pCurr[1] + t * t * pEnd[1];
          out.push([bx, bz]);
        }
        continue;
      }
    }
    out.push(pCurr);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** The two OSM track ways (chained back together first, see
 * chainTrackSegments) averaged into a single deck centreline and smoothed with transition fillets. */
export function centreAlignment(tracks) {
  if (tracks.length <= 1) return tracks[0] ? tracks[0].pts.slice() : [];
  const chains = chainTrackSegments(tracks).sort((x, y) => polylineLength(y) - polylineLength(x));
  const a = chains[0];
  const b = chains.length > 1 ? chains[1] : chains[0];
  const out = [];
  for (const p of a) {
    const q = closestOnPolyline(b, p[0], p[1]);
    out.push(q ? [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] : [p[0], p[1]]);
  }
  return smoothPolyline(out);
}

function resample(pts, spacing) {
  const out = [];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const ux = dx / len;
    const uz = dz / len;
    let d = carry;
    while (d < len) {
      out.push({ x: a[0] + ux * d, z: a[1] + uz * d, ux, uz });
      d += spacing;
    }
    carry = d - len;
  }
  return out;
}

function buildDistanceTable(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return cum;
}

function samplePos(pts, cum, d, clamp = false) {
  const total = cum[cum.length - 1];
  const n = pts.length;
  if (clamp) {
    if (d <= 0) {
      const a = pts[0];
      const b = pts[1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return {
        x: a[0] + ((b[0] - a[0]) / len) * d,
        z: a[1] + ((b[1] - a[1]) / len) * d,
      };
    }
    if (d >= total) {
      const a = pts[n - 2];
      const b = pts[n - 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const excess = d - total;
      return {
        x: b[0] + ((b[0] - a[0]) / len) * excess,
        z: b[1] + ((b[1] - a[1]) / len) * excess,
      };
    }
  } else {
    d = ((d % total) + total) % total;
  }
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[lo + 1];
  const segLen = cum[lo + 1] - cum[lo] || 1;
  const t = (d - cum[lo]) / segLen;
  return {
    x: a[0] + (b[0] - a[0]) * t,
    z: a[1] + (b[1] - a[1]) * t,
  };
}

function sampleAt(pts, cum, d, clamp = false) {
  const p = samplePos(pts, cum, d, clamp);
  const EPS = 0.75; // 0.75m central-difference lookahead smooths heading across curve vertices
  const pPrev = samplePos(pts, cum, d - EPS, clamp);
  const pNext = samplePos(pts, cum, d + EPS, clamp);
  const heading = Math.atan2(pNext.x - pPrev.x, pNext.z - pPrev.z);
  return { x: p.x, z: p.z, heading };
}

function offsetPolyline(pts, dist) {
  return pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    return [p[0] - dz * dist, p[1] + dx * dist];
  });
}

// ---------------------------------------------------------------------------
// Geometry builders
// ---------------------------------------------------------------------------

/** Winding convention used throughout the project: (0,2,1),(0,3,2). */
function addQuad(pos, nor, uv, idx, p0, p1, p2, p3, n, uvs) {
  const base = pos.length / 3;
  pos.push(...p0, ...p1, ...p2, ...p3);
  for (let k = 0; k < 4; k++) nor.push(n[0], n[1], n[2]);
  if (uv) uv.push(...uvs[0], ...uvs[1], ...uvs[2], ...uvs[3]);
  idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

/**
 * Extrude a trapezoidal box-girder cross-section (top width / bottom width /
 * depth) along a centreline polyline. One single-cell box, sloping webs.
 */
function extrudeTrapezoid(pts, topW, botW, yBottom, yTop, pos, nor, uv, idx) {
  const n = pts.length;
  const rails = [];
  let dist = 0;
  const dists = [0];
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    rails.push({ x: pts[i][0], z: pts[i][1], px: -dz, pz: dx });
    if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    dists.push(dist);
  }

  const ht = topW / 2;
  const hb = botW / 2;

  for (let i = 0; i < n - 1; i++) {
    const a = rails[i];
    const b = rails[i + 1];
    const v0 = dists[i] / 3;
    const v1 = dists[i + 1] / 3;

    const aTL = [a.x + a.px * ht, a.z + a.pz * ht];
    const aTR = [a.x - a.px * ht, a.z - a.pz * ht];
    const bTL = [b.x + b.px * ht, b.z + b.pz * ht];
    const bTR = [b.x - b.px * ht, b.z - b.pz * ht];
    const aBL = [a.x + a.px * hb, a.z + a.pz * hb];
    const aBR = [a.x - a.px * hb, a.z - a.pz * hb];
    const bBL = [b.x + b.px * hb, b.z + b.pz * hb];
    const bBR = [b.x - b.px * hb, b.z - b.pz * hb];

    // Top flange.
    addQuad(pos, nor, uv, idx,
      [aTL[0], yTop, aTL[1]], [aTR[0], yTop, aTR[1]], [bTR[0], yTop, bTR[1]], [bTL[0], yTop, bTL[1]],
      [0, 1, 0], [[0, v0], [1, v0], [1, v1], [0, v1]]);
    // Bottom flange.
    addQuad(pos, nor, uv, idx,
      [aBR[0], yBottom, aBR[1]], [aBL[0], yBottom, aBL[1]], [bBL[0], yBottom, bBL[1]], [bBR[0], yBottom, bBR[1]],
      [0, -1, 0], [[0, v0], [1, v0], [1, v1], [0, v1]]);
    // Left sloping web.
    addQuad(pos, nor, uv, idx,
      [aBL[0], yBottom, aBL[1]], [aTL[0], yTop, aTL[1]], [bTL[0], yTop, bTL[1]], [bBL[0], yBottom, bBL[1]],
      [a.px, 0.15, a.pz], [[0, v0], [1, v0], [1, v1], [0, v1]]);
    // Right sloping web.
    addQuad(pos, nor, uv, idx,
      [aTR[0], yTop, aTR[1]], [aBR[0], yBottom, aBR[1]], [bBR[0], yBottom, bBR[1]], [bTR[0], yTop, bTR[1]],
      [-a.px, 0.15, -a.pz], [[0, v0], [1, v0], [1, v1], [0, v1]]);
  }
}

/** Rectangular ribbon at constant height (parapet faces, plinths, etc). */
function extrudeBox(pts, width, yBottom, yTop, pos, nor, uv, idx) {
  extrudeTrapezoid(pts, width, width, yBottom, yTop, pos, nor, uv, idx);
}

/**
 * World-space box-projected UV (ADDED 20:20 item E / 17:30 addendum): for
 * each vertex, pick the dominant axis of its normal and use the OTHER two
 * world coordinates (already in metres, since this runs after the geometry
 * has been transformed into the station/group's local space, which is
 * metre-scale and axis-aligned with world space) as u,v. This makes
 * concrete/brick/corrugated/granite maps tile at real-world scale on every
 * box-shaped bucket geometry, replacing both the zero-filled UVs that used
 * to ship on custom pier geometry and the normalized-0-1 UVs BoxGeometry
 * provides by default (which don't scale with the box's real size).
 */
function boxProjectUV(pos, nor) {
  const count = pos.length / 3;
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const nx = Math.abs(nor[i * 3]);
    const ny = Math.abs(nor[i * 3 + 1]);
    const nz = Math.abs(nor[i * 3 + 2]);
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    let u, v;
    if (nx >= ny && nx >= nz) {
      u = z; v = y;
    } else if (ny >= nx && ny >= nz) {
      u = x; v = z;
    } else {
      u = x; v = y;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  return uv;
}

function bakeGeometry(geometry, position, rotation = [0, 0, 0], scale = 1) {
  const geo = geometry.clone();
  const m = new THREE.Matrix4();
  let euler;
  if (typeof rotation === 'number') {
    euler = new THREE.Euler(0, rotation, 0);
  } else if (Array.isArray(rotation)) {
    euler = new THREE.Euler(...rotation);
  } else if (rotation instanceof THREE.Euler) {
    euler = rotation;
  } else {
    euler = new THREE.Euler(0, 0, 0);
  }
  m.compose(
    position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(euler),
    scale instanceof THREE.Vector3 ? scale : new THREE.Vector3(scale, scale, scale)
  );
  geo.applyMatrix4(m);
  // Always regenerate real-world-scale UVs from the now-transformed position/
  // normal, overriding whatever normalized 0-1 UV the source primitive
  // (BoxGeometry, CylinderGeometry, ...) shipped with — see boxProjectUV.
  if (geo.attributes.normal) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(
      boxProjectUV(geo.attributes.position.array, geo.attributes.normal.array), 2));
  } else if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  }
  return geo;
}

function mergeBucket(list, mat, name) {
  if (!list.length) return null;
  const merged = mergeGeometries(list, false);
  const m = new THREE.Mesh(merged, mat);
  m.name = name;
  const isTransparent = mat.transparent === true;
  m.castShadow = !isTransparent;
  m.receiveShadow = true;
  if (isTransparent) m.renderOrder = 1;
  return m;
}

function meshFrom(pos, nor, uv, idx, mat, name) {
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  const isTransparent = mat.transparent === true;
  m.castShadow = !isTransparent;
  m.receiveShadow = true;
  if (isTransparent) m.renderOrder = 1;
  return m;
}

/**
 * Chamfered rectangular pier shaft (SPEC A9 / owner P2,P3): an octagonal
 * cross-section built explicitly from a chamfered-rectangle ring (not a
 * smooth CylinderGeometry, which reads as a plain round column at typical
 * viewing distance) with flat per-face normals so the chamfer reads as
 * crisp facets, not a curve.
 *
 * FLARED, 2026-09-07, from the owner's own Street View of the Pallabi
 * viaduct (reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md, item 1).
 * The real pier is NARROWER AT THE GROUND and opens out as it rises into
 * the girder seat. This code previously had it exactly backwards: a single
 * band with `taper = 1.15`, i.e. 15% WIDER at the base, narrowing upward.
 * It is now a 7-band swept profile whose width is nearly constant for the
 * lower 42% and then smoothstep-flares to full width at the cap, which is
 * the shape that actually reads from street level — and street level is
 * where the player now spawns (Mirpur 12).
 */
function pierShaftGeometry(topW, topD, height, taper = 0.78) {
  const chamferFrac = 0.22;
  const ring = (w, d) => {
    const hw = w / 2, hd = d / 2;
    const c = Math.min(hw, hd) * chamferFrac;
    return [
      [hw - c, hd], [hw, hd - c], [hw, -hd + c], [hw - c, -hd],
      [-hw + c, -hd], [-hw, -hd + c], [-hw, hd - c], [-hw + c, hd],
    ];
  };

  // FLARE PROFILE. `taper` is now the BASE width as a fraction of the top
  // width, so values < 1 mean the pier is NARROWER at the ground and widens
  // as it rises. The profile is a curve, not a straight line: nearly
  // constant for the lower half, then opening out smoothly into the cap.
  // widthAt(0) = taper, widthAt(1) = 1.
  const RINGS = 7;
  const widthAt = (t) => {
    const k = Math.max(0, (t - 0.42) / 0.58); // 0 below 42% height, 1 at the top
    return taper + (1 - taper) * (k * k * (3 - 2 * k)); // smoothstep flare
  };

  const levels = [];
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS;
    const w = widthAt(t);
    levels.push({ y: t * height, ring: ring(topW * w, topD * w) });
  }

  const n = 8;
  const pos = [];
  const nor = [];
  const idx = [];
  for (let r = 0; r < RINGS; r++) {
    const lo = levels[r];
    const hi = levels[r + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [bx0, bz0] = lo.ring[i];
      const [bx1, bz1] = lo.ring[j];
      const [tx0, tz0] = hi.ring[i];
      const [tx1, tz1] = hi.ring[j];
      let nx = bz1 - bz0;
      let nz = -(bx1 - bx0);
      const l = Math.hypot(nx, nz) || 1;
      nx /= l;
      nz /= l;
      const midx = (bx0 + bx1) / 2;
      const midz = (bz0 + bz1) / 2;
      if (nx * midx + nz * midz < 0) {
        nx = -nx;
        nz = -nz;
      }
      // Tilt the normal outward-up in proportion to how much this band
      // flares, so the flare catches light as a surface rather than reading
      // as a stack of cylinders.
      const dw = (hi.ring[i][0] - lo.ring[i][0]);
      const ny = Math.min(0.5, Math.abs(dw) / Math.max(0.001, hi.y - lo.y)) * 0.6 + 0.03;
      const base = pos.length / 3;
      pos.push(bx0, lo.y, bz0, tx0, hi.y, tz0, tx1, hi.y, tz1, bx1, lo.y, bz1);
      for (let k = 0; k < 4; k++) nor.push(nx, ny, nz);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  // ADDED 20:20 item E: was a zero-filled UV (pier concrete map sampled one
  // texel / looked flat) — real world-space projection instead. This is the
  // shaft's own LOCAL geometry (before the per-instance InstancedMesh
  // transform), so the UV is still metre-scale since the shaft is built at
  // its true real-world dimensions.
  g.setAttribute('uv', new THREE.Float32BufferAttribute(boxProjectUV(pos, nor), 2));
  return g;
}

/** Hammerhead pier cap: a flared frustum from the shaft top to the girder soffit width. */
function pierCapGeometry(bottomW, bottomD, topW, topD, height) {
  const pos = [];
  const nor = [];
  const idx = [];
  const bx = bottomW / 2, bz = bottomD / 2, tx = topW / 2, tz = topD / 2;
  const b = [[-bx, -bz], [bx, -bz], [bx, bz], [-bx, bz]];
  const t = [[-tx, -tz], [tx, -tz], [tx, tz], [-tx, tz]];
  const addQ = (p0, p1, p2, p3, n) => {
    const base = pos.length / 3;
    pos.push(...p0, ...p1, ...p2, ...p3);
    for (let k = 0; k < 4; k++) nor.push(...n);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  // top and bottom
  addQ([t[0][0], height, t[0][1]], [t[1][0], height, t[1][1]], [t[2][0], height, t[2][1]], [t[3][0], height, t[3][1]], [0, 1, 0]);
  addQ([b[1][0], 0, b[1][1]], [b[0][0], 0, b[0][1]], [b[3][0], 0, b[3][1]], [b[2][0], 0, b[2][1]], [0, -1, 0]);
  // 4 sloping sides
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const nrm = [
      (b[i][1] + b[j][1]) / 2, 0, -(b[i][0] + b[j][0]) / 2,
    ];
    const l = Math.hypot(nrm[0], nrm[2]) || 1;
    addQ(
      [b[i][0], 0, b[i][1]], [t[i][0], height, t[i][1]], [t[j][0], height, t[j][1]], [b[j][0], 0, b[j][1]],
      [nrm[0] / l, 0.1, nrm[2] / l]
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(boxProjectUV(pos, nor), 2)); // item E, see pierShaftGeometry
  return g;
}

/** Simple box helper returning a geometry positioned at its own centre. */
function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

/** Simple cylinder helper returning a geometry positioned at its own centre. */
function cyl(rt, rb, h, segs = 12) {
  return new THREE.CylinderGeometry(rt, rb, h, segs);
}

/**
 * Segmental-arch canopy cross-section: y(x) for x in [-span/2, span/2],
 * springing at CANOPY_SPRING_Y, apex at CANOPY_SPRING_Y + rise.
 */
function archProfile(segments = 20) {
  const S = CANOPY_SPAN / 2;
  const r = CANOPY_RISE;
  const R = (S * S + r * r) / (2 * r);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const x = -S + (2 * S * i) / segments;
    const y = CANOPY_SPRING_Y + r - (R - Math.sqrt(Math.max(0, R * R - x * x)));
    pts.push({ x, y });
  }
  return pts;
}

/** Extrude the arch profile as a thin double shell (top + underside) along Z. */
/** 8 m skylight panels with 1 m gaps along the ridge (ADDED 20:20 item A). */
function skylightPanelRanges(zFrom, zTo, panel = 8, gap = 1) {
  const ranges = [];
  let z = zFrom;
  while (z < zTo - 1e-6) {
    const zEnd = Math.min(z + panel, zTo);
    ranges.push([z, zEnd]);
    z = zEnd + gap;
  }
  return ranges;
}

function buildCanopy(bucket, platformY, zFrom, zTo) {
  const profile = archProfile(20);
  const thick = 0.14;
  const skylightHalf = 1.0; // 2 m wide strip (item A), was 3.2 m
  const panelRanges = skylightPanelRanges(zFrom, zTo);

  const shells = [
    { key: 'canopyTop', off: thick / 2 },
    { key: 'canopyUnder', off: -thick / 2 },
  ];

  // Skylight quads (translucent strip along the ridge) are collected
  // separately from the top shell, cut out of it so daylight actually shows.
  if (!bucket.skylight) bucket.skylight = { pos: [], nor: [], idx: [] };

  for (const shell of shells) {
    const pos = [];
    const nor = [];
    const idx = [];
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i];
      const b = profile[i + 1];
      const mx = (a.x + b.x) / 2;
      const isSkylight = Math.abs(mx) < skylightHalf;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      // True outward normal of the arch surface (rotate tangent +90 deg so it
      // points up/away from the canopy interior for the springing-to-apex
      // curve used here). The top shell offsets along +this normal (up and
      // out, so it really is the upper/outer surface); the under shell
      // offsets along the opposite direction (down toward the platform, so
      // it really is the lower/inner surface you see from below).
      let nx = -dy / l;
      let ny = dx / l;
      const dir = shell.off > 0 ? 1 : -1;
      const ox = nx * dir;
      const oy = ny * dir;
      const ax = a.x + ox * Math.abs(shell.off);
      const ay = platformY + a.y + oy * Math.abs(shell.off);
      const bx2 = b.x + ox * Math.abs(shell.off);
      const by = platformY + b.y + oy * Math.abs(shell.off);
      // Per-segment normal follows the true local surface direction (outward
      // for the top shell, inward/downward for the under shell) instead of a
      // constant up/down vector, so lighting is correct along the whole arc.
      const n = [ox, oy, 0];
      // Skip the skylight band on the top shell — it is cut out and replaced
      // by a translucent strip below, so daylight actually reads through it.
      // ADDED 20:20 item A: panelized (8 m panel / 1 m gap) instead of one
      // continuous strip the full platform length, and the solid corrugated
      // top shell fills the 1 m gaps between panels (so it isn't just a
      // giant hole where there's no panel).
      if (isSkylight && shell.key === 'canopyTop') {
        for (const [zA, zB] of panelRanges) {
          const sb = bucket.skylight;
          const base = sb.pos.length / 3;
          sb.pos.push(ax, ay, zA, ax, ay, zB, bx2, by, zB, bx2, by, zA);
          for (let k = 0; k < 4; k++) sb.nor.push(n[0], n[1], n[2]);
          sb.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        }
        // Solid corrugated infill in the 1 m gaps between panels, so the
        // "cut out" strip isn't an actual hole outside the glass panels.
        for (let g = 0; g < panelRanges.length - 1; g++) {
          const gapZ0 = panelRanges[g][1];
          const gapZ1 = panelRanges[g + 1][0];
          const base = pos.length / 3;
          pos.push(ax, ay, gapZ0, ax, ay, gapZ1, bx2, by, gapZ1, bx2, by, gapZ0);
          for (let k = 0; k < 4; k++) nor.push(n[0], n[1], n[2]);
          idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        }
        // Also close the strip before the first panel and after the last.
        if (panelRanges.length) {
          const firstZ = panelRanges[0][0];
          if (firstZ > zFrom + 1e-6) {
            const base = pos.length / 3;
            pos.push(ax, ay, zFrom, ax, ay, firstZ, bx2, by, firstZ, bx2, by, zFrom);
            for (let k = 0; k < 4; k++) nor.push(n[0], n[1], n[2]);
            idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
          }
          const lastZ = panelRanges[panelRanges.length - 1][1];
          if (lastZ < zTo - 1e-6) {
            const base = pos.length / 3;
            pos.push(ax, ay, lastZ, ax, ay, zTo, bx2, by, zTo, bx2, by, lastZ);
            for (let k = 0; k < 4; k++) nor.push(n[0], n[1], n[2]);
            idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
          }
        }
        continue;
      }
      const p0 = [ax, ay, zFrom];
      const p1 = [ax, ay, zTo];
      const p2 = [bx2, by, zTo];
      const p3 = [bx2, by, zFrom];
      const base = pos.length / 3;
      pos.push(...p0, ...p1, ...p2, ...p3);
      for (let k = 0; k < 4; k++) nor.push(n[0], n[1], n[2]);
      if (shell.off > 0) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const key = shell.key;
    if (!bucket[key]) bucket[key] = { pos: [], nor: [], idx: [] };
    // Offset indices when appending into shared arrays for this key.
    const off = bucket[key].pos.length / 3;
    bucket[key].pos.push(...pos);
    bucket[key].nor.push(...nor);
    for (const v of idx) bucket[key].idx.push(v + off);
  }

  // Ribs: 0.25 m-wide slices of the profile every 9 m along the span,
  // plus structural portal ribs at the two platform ends.
  for (let z = zFrom + 4.5; z <= zTo - 4.5 + 0.01; z += 9) {
    buildRib(bucket, platformY, z);
  }
  buildRib(bucket, platformY, zFrom);
  buildRib(bucket, platformY, zTo);
}

/** Sweep an octagonal tube of `radius` along a 2D point list (already in
 * absolute x/y, i.e. platformY has been added by the caller) at constant
 * world Z `zCentre`. Shared by the truss chords and the diagonal struts. */
function sweepTube(pts2D, zCentre, radius, sides) {
  const pos = [];
  const nor = [];
  const idx = [];
  for (let i = 0; i < pts2D.length; i++) {
    const a = pts2D[Math.max(0, i - 1)];
    const b = pts2D[Math.min(pts2D.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const tx = dx / l, ty = dy / l;
    const nx = -ty, ny = tx;
    const p = pts2D[i];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const ox = nx * Math.cos(ang) * radius;
      const oy = ny * Math.cos(ang) * radius;
      const oz = Math.sin(ang) * radius;
      pos.push(p.x + ox, p.y + oy, zCentre + oz);
      nor.push(ox, oy, oz);
    }
  }
  for (let i = 0; i < pts2D.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const s2 = (s + 1) % sides;
      const a0 = i * sides + s;
      const a1 = i * sides + s2;
      const b0 = (i + 1) * sides + s;
      const b1 = (i + 1) * sides + s2;
      idx.push(a0, b0, b1, a0, b1, a1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/**
 * Light-grey LATTICE truss arch (ADDED 20:20 item A, owner second batch
 * Q1-Q5 correction: "curved tubular steel space-frame arches ... each arch
 * a lattice truss (two chords with diagonal web tubes)", 0.25 m tube
 * diameter). Replaces the earlier single-tube-plus-occasional-brace rib:
 * now builds a genuine outer chord + inner chord (offset radially by the
 * truss depth) following the arch profile, latticed by a zigzag of
 * diagonal web tubes every segment, all in the MAT.trussGrey colour.
 */
function buildRib(bucket, platformY, zCentre) {
  const profile = archProfile(16);
  if (!bucket.ribGeoms) bucket.ribGeoms = [];
  const r = 0.125; // 0.25 m tube diameter, per owner spec
  const depth = 0.35; // truss depth between the two chords
  const braceR = 0.05;
  const sides = 8;

  const outer = [];
  const inner = [];
  for (let i = 0; i < profile.length; i++) {
    const a = profile[Math.max(0, i - 1)];
    const b = profile[Math.min(profile.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -(dy / l), ny = dx / l; // outward in-plane normal
    const p = profile[i];
    outer.push({ x: p.x + nx * depth / 2, y: platformY + p.y + ny * depth / 2 });
    inner.push({ x: p.x - nx * depth / 2, y: platformY + p.y - ny * depth / 2 });
  }

  bucket.ribGeoms.push(sweepTube(outer, zCentre, r, sides));
  bucket.ribGeoms.push(sweepTube(inner, zCentre, r, sides));

  // Zigzag diagonal web members between the two chords, one per bay.
  for (let i = 0; i < profile.length - 1; i++) {
    const pA = i % 2 === 0 ? outer[i] : inner[i];
    const pB = i % 2 === 0 ? inner[i + 1] : outer[i + 1];
    bucket.ribGeoms.push(sweepTube([pA, pB], zCentre, braceR, 6));
  }
}

function meshFromBucketEntry(entry, mat, name) {
  if (!entry || !entry.idx.length) return null;
  // ADDED 20:20 item E: generate real world-space UVs instead of passing
  // null (which left canopy-top/under/skylight with NO uv attribute at
  // all, so the corrugated-metal map sampled nothing / one texel).
  const uv = boxProjectUV(new Float32Array(entry.pos), new Float32Array(entry.nor));
  return meshFrom(entry.pos, entry.nor, uv, entry.idx, mat, name);
}

/**
 * Station-local Z offset of every door on one 6-car train (P11-I item 1),
 * computed from the SAME constants buildTrain() uses to place its doors
 * (TRAIN_CARS/TRAIN_CAR_LEN/TRAIN_CAR_GAP), so the platform screen door
 * bays are guaranteed to line up with a berthed train's real doors rather
 * than an eyeballed pitch. A train's group origin sits at the midpoint of
 * the whole 6-car set (see buildTrain: car i's centre is at
 * `(i - (CARS-1)/2) * (CAR_LEN+GAP)`, symmetric about 0), and trains dock
 * with that origin at the station's own local Z=0 (buildMetro's `update`
 * sets tr.obj.position to the station's world x/z when dwelling) — so
 * these offsets are directly usable as station-local Z without any further
 * translation. The set is symmetric about 0, so it is unaffected by which
 * physical end of the train is leading (heading flip = Z negation maps the
 * set onto itself).
 */
function trainDoorZs() {
  const doorSpacing = TRAIN_CAR_LEN / 4;
  const zs = [];
  for (let i = 0; i < TRAIN_CARS; i++) {
    const carZ = (i - (TRAIN_CARS - 1) / 2) * (TRAIN_CAR_LEN + TRAIN_CAR_GAP);
    for (let d = 0; d < 4; d++) {
      zs.push(carZ - TRAIN_CAR_LEN / 2 + doorSpacing * (d + 0.5));
    }
  }
  return zs;
}

// ---------------------------------------------------------------------------
// P11-R: building-aware entrance placement helpers
//
// The advisor's live point-in-polygon test found 5 of 10 entrances (both at
// Pallabi) standing inside real OSM building footprints, because the old
// code placed every entrance at a fixed +-16.5 m offset from the spine with
// no reference to the building data at all. These helpers let
// buildStation() search for an entrance position that is simultaneously
// clear of every nearby building footprint, the carriageway, and the
// viaduct's portal columns -- testing the WHOLE entrance-shell rectangle
// (its full width and stair-run length), not just a single centre point:
// a rectangle whose centre clears a wall by 10 cm can still have a corner
// or an edge buried. See docs/briefs/P11-R-ENTRANCES-INSIDE-BUILDINGS.md.
// ---------------------------------------------------------------------------

function pointInPolyLocal(x, z, ring) {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2], zi = ring[i * 2 + 1];
    const xj = ring[j * 2], zj = ring[j * 2 + 1];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a, b, c, d) {
  const ccw = (p, q, r) => (r[1] - p[1]) * (q[0] - p[0]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = ccw(c, d, a), d2 = ccw(c, d, b), d3 = ccw(a, b, c), d4 = ccw(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Does the axis-aligned rectangle [xMin,xMax]x[zMin,zMax] -- already in the
 * same local frame as `ring` -- intersect polygon `ring` (flat
 * [x0,z0,x1,z1,...]) at all? Tests the whole footprint: any polygon vertex
 * inside the rect, any rect corner inside the polygon, or any polygon edge
 * crossing a rect edge (that last case catches a thin building wall slicing
 * straight through the rect without either shape's own vertices landing
 * inside the other).
 */
function rectIntersectsPolygon(xMin, xMax, zMin, zMax, ring) {
  const n = ring.length / 2;
  let bMinX = Infinity, bMaxX = -Infinity, bMinZ = Infinity, bMaxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = ring[i * 2], z = ring[i * 2 + 1];
    if (x < bMinX) bMinX = x;
    if (x > bMaxX) bMaxX = x;
    if (z < bMinZ) bMinZ = z;
    if (z > bMaxZ) bMaxZ = z;
  }
  if (bMaxX < xMin || bMinX > xMax || bMaxZ < zMin || bMinZ > zMax) return false; // cheap bbox reject
  for (let i = 0; i < n; i++) {
    const x = ring[i * 2], z = ring[i * 2 + 1];
    if (x >= xMin && x <= xMax && z >= zMin && z <= zMax) return true;
  }
  const corners = [[xMin, zMin], [xMax, zMin], [xMax, zMax], [xMin, zMax]];
  for (const c of corners) if (pointInPolyLocal(c[0], c[1], ring)) return true;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = [ring[j * 2], ring[j * 2 + 1]];
    const b = [ring[i * 2], ring[i * 2 + 1]];
    for (let k = 0; k < 4; k++) {
      if (segmentsIntersect(a, b, corners[k], corners[(k + 1) % 4])) return true;
    }
  }
  return false;
}

/** Rect vs. an axis-aligned square (a portal column footprint), same local frame. */
function rectIntersectsSquare(xMin, xMax, zMin, zMax, cx, cz, halfSize) {
  return !(xMax < cx - halfSize || xMin > cx + halfSize || zMax < cz - halfSize || zMin > cz + halfSize);
}

// ---------------------------------------------------------------------------
// Station
// ---------------------------------------------------------------------------

function buildStation(name, bnName, x, z, heading, legCount, labelFactory, buildings) {
  const g = new THREE.Group();
  g.name = `station:${name}`;
  g.position.set(x, 0, z);
  g.rotation.y = heading;

  const buckets = {
    concrete: [], concreteDark: [], brick: [], band: [], glass: [], green: [],
    corrugatedGreen: [], galvanised: [], steel: [], psdFrame: [], psdGlass: [],
    platformFloor: [], tactile: [], trussWhite: [], trussGrey: [], downlight: [], display: [],
  };
  const bake = (bucket, geometry, position, rotationY = 0, scale = 1) => {
    if (bucket === 'glass' || bucket === 'psdGlass') { geometry.dispose(); return; }
    buckets[bucket].push(bakeGeometry(geometry, position, rotationY, scale));
  };

  const canopyBuckets = {};

  // --- Platform floor: runs from the platform edge out to the canopy
  // columns on both sides, so there is no void beyond the yellow line.
  //
  // P11-I item 0 (advisor-measured bug): this slab used to be centred at
  // DECK_Y + 0.2 (0.4 m thick), so its TOP FACE sat at DECK_Y + 0.4 while
  // interior.js's walkable platform slab — and therefore the player's feet
  // and every collision wall on the platform — is registered at DECK_Y
  // exactly (interior.js owns the walkable HEIGHT convention the whole
  // stair/lift/collision system is built around; see
  // docs/WALKABLE-INTERIOR-DESIGN.md). That put the player 0.4 m sunk into
  // the visible floor. metro.js remains the visible-floor OWNER (this file
  // keeps its own WIDTH, which already runs the full distance to the
  // canopy columns — interior.js's walkable slab is widened to match, see
  // its buildPlatform, instead of duplicating a second floor box here) —
  // the fix is simply to drop this slab 0.4 m so its top face lands
  // exactly on DECK_Y. Every other platform fixture below that used to be
  // measured from "DECK_Y + 0.4" as the floor-top reference (PSD, benches,
  // lift core, canopy) is rebased to DECK_Y for the same reason: they must
  // still sit flush on the floor they visibly rest on, not float 0.4 m
  // above it.
  const PLATFORM_FLOOR_Y = PLATFORM_Y; // floor top == walkable height, exactly (level with train car floor)
  const platformOuter = CANOPY_SPAN / 2 + 0.15; // 11.15 m: floor slab extends under outer columns and parapet wall
  const doorZs = trainDoorZs();
  const BAY_HALF = 1.0; // half-width of the wall gap cut for each door bay (2 m clear cut)
  const LEAF_W = BAY_HALF + 0.05; // each leaf slightly wider than half the gap: 0.1 m closed overlap, no seam
  const LEAF_H = 1.4;
  const LEAF_T = 0.06;
  const LEAF_TRAVEL = BAY_HALF * 1.9; // outward slide distance when fully open — enough to tuck behind the fixed panel
  const psdCentreY = PLATFORM_FLOOR_Y + 0.775; // centre of the 1.55 m frame run
  const PSD_RUN_H = 1.55;
  const PSD_RAIL_H = 0.12; // P11-K bug 4: top/bottom stainless rail height, glass fills the middle
  const doorLeaves = {}; // side -> { mesh, leaves:[{index,x,y,closedZ,openZ}], bayZs }

  // P11-K bug 4: the fixed PSD segments used to be ONE solid psdFrame box
  // top to bottom (the `psdGlass` bucket was declared but never baked into
  // — the "psdGlass:<station>" mesh literally didn't exist), so the fixed
  // panels read as plain opaque grey slabs instead of frame + glass. Now
  // each fixed segment bakes a stainless top rail + bottom rail (psdFrame)
  // with a glazed psdGlass pane filling the run between them, matching the
  // sliding leaves (already MAT.psdGlass) so the whole PSD run — fixed and
  // moving — reads as one glazed system, as the owner's photos show.
  const bakeFixedPsd = (x, zFrom, zTo) => {
    const zLen = zTo - zFrom;
    if (zLen <= 0.01) return;
    const zMid = (zFrom + zTo) / 2;
    const kickH = 0.28;
    const capH = 0.10;
    const glassH = PSD_RUN_H - kickH - capH;

    // 1. Stainless kick base skirt panel
    bake('psdFrame', box(0.14, kickH, zLen), [x, PLATFORM_FLOOR_Y + kickH / 2, zMid]);
    // 2. Stainless top header profile
    bake('psdFrame', box(0.14, capH, zLen), [x, PLATFORM_FLOOR_Y + PSD_RUN_H - capH / 2, zMid]);
    // Green accent stripe on top cap
    bake('green', box(0.145, 0.025, zLen), [x, PLATFORM_FLOOR_Y + PSD_RUN_H - 0.015, zMid]);
    // 3. Glazed safety glass pane
    bake('psdGlass', box(0.06, glassH, zLen), [x, PLATFORM_FLOOR_Y + kickH + glassH / 2, zMid]);
    // 4. Safety frosted decal band across the glass
    bake('trussWhite', box(0.065, 0.08, zLen), [x, PLATFORM_FLOOR_Y + 0.95, zMid]);
    bake('green', box(0.068, 0.02, zLen), [x, PLATFORM_FLOOR_Y + 0.95, zMid]);

    // 5. Vertical structural mullions/posts every ~1.5m
    const numPosts = Math.max(1, Math.round(zLen / 1.5));
    for (let i = 0; i <= numPosts; i++) {
      const pz = zFrom + (zLen * i) / numPosts;
      bake('psdFrame', box(0.15, PSD_RUN_H, 0.08), [x, PLATFORM_FLOOR_Y + PSD_RUN_H / 2, pz]);
    }
  };

  const z0 = PLATFORM_CORE_Z - PLATFORM_CORE_HALF_D;
  const z1 = PLATFORM_CORE_Z + PLATFORM_CORE_HALF_D;
  const lenSouth = z0 - (-PLATFORM_LEN / 2);
  const midZSouth = (-PLATFORM_LEN / 2 + z0) / 2;
  const lenNorth = PLATFORM_LEN / 2 - z1;
  const midZNorth = (z1 + PLATFORM_LEN / 2) / 2;
  const lenCore = z1 - z0;
  const midZCore = PLATFORM_CORE_Z;
  const coreInnerX = PLATFORM_CORE_X - PLATFORM_CORE_HALF_W;
  const coreOuterX = PLATFORM_CORE_X + PLATFORM_CORE_HALF_W;
  const innerW = coreInnerX - PLATFORM_INNER_X;
  const outerW = platformOuter - coreOuterX;

  const PSD_X = 3.55; // stainless frame and sliding glass doors
  const TACTILE_X = 4.10; // yellow tactile warning strip behind the PSD on the platform

  for (const side of [-1, 1]) {
    const innerX = side * PLATFORM_INNER_X;
    const outerX = side * platformOuter;
    const cx = (innerX + outerX) / 2;
    const floorW = Math.abs(platformOuter - PLATFORM_INNER_X);

    // Platform floor with stairwell opening (z0..z1, side*coreInnerX..side*coreOuterX)
    // 1. South full-width deck
    bake('platformFloor', box(floorW, 0.4, lenSouth), [cx, PLATFORM_FLOOR_Y - 0.2, midZSouth]);
    // 2. North full-width deck
    bake('platformFloor', box(floorW, 0.4, lenNorth), [cx, PLATFORM_FLOOR_Y - 0.2, midZNorth]);
    // 3. Inner walkway along track/PSD side
    const innerCx = side * (PLATFORM_INNER_X + innerW / 2);
    bake('platformFloor', box(innerW, 0.4, lenCore), [innerCx, PLATFORM_FLOOR_Y - 0.2, midZCore]);
    // 4. Outer walkway along canopy columns
    const outerCx = side * (coreOuterX + outerW / 2);
    bake('platformFloor', box(outerW, 0.4, lenCore), [outerCx, PLATFORM_FLOOR_Y - 0.2, midZCore]);

    // Solid concrete front wall under platform edge (closing the gap between PLATFORM_FLOOR_Y and DECK_Y)
    const edgeH = PLATFORM_FLOOR_Y - DECK_Y;
    bake('concreteDark', box(0.32, edgeH, PLATFORM_LEN), [side * (PLATFORM_INNER_X + 0.16), DECK_Y + edgeH / 2, 0]);
    // Platform edge nosing strip with safety caution indicator
    bake('tactile', box(0.08, 0.04, PLATFORM_LEN), [side * (PLATFORM_INNER_X + 0.04), PLATFORM_FLOOR_Y - 0.02, 0]);

    // Yellow tactile strip on the platform floor behind the PSD
    bake('tactile', box(0.5, 0.03, PLATFORM_LEN), [side * TACTILE_X, PLATFORM_FLOOR_Y + 0.015, 0]);

    // --- Platform screen doors (P11-I item 1): FIXED stainless frame
    // panels with door mechanism portals flanking each bay
    const psdX = side * PSD_X;
    let cursor = -PLATFORM_LEN / 2;
    const sortedDoorZs = doorZs.filter((z) => z > -PLATFORM_LEN / 2 && z < PLATFORM_LEN / 2).sort((a, b) => a - b);
    for (const bz of sortedDoorZs) {
      const gLo = Math.max(cursor, bz - BAY_HALF);
      const gHi = Math.min(PLATFORM_LEN / 2, bz + BAY_HALF);
      if (gLo > cursor) bakeFixedPsd(psdX, cursor, gLo);
      cursor = Math.max(cursor, gHi);

      // Gate mechanism drive portal columns flanking each door opening
      for (const pz of [bz - BAY_HALF - 0.12, bz + BAY_HALF + 0.12]) {
        if (pz >= -PLATFORM_LEN / 2 && pz <= PLATFORM_LEN / 2) {
          // Robust stainless drive casing
          bake('psdFrame', box(0.18, PSD_RUN_H, 0.24), [psdX, PLATFORM_FLOOR_Y + PSD_RUN_H / 2, pz]);
          // Green/red door status indicator lamp on top
          bake('downlight', box(0.12, 0.05, 0.14), [psdX, PLATFORM_FLOOR_Y + PSD_RUN_H + 0.025, pz]);
          bake('psdFrame', box(0.14, 0.02, 0.16), [psdX, PLATFORM_FLOOR_Y + PSD_RUN_H + 0.05, pz]);
          // Emergency release handle housing (green box facing platform)
          bake('green', box(0.04, 0.16, 0.12), [psdX - side * 0.09, PLATFORM_FLOOR_Y + 1.05, pz]);
          bake('display', box(0.045, 0.05, 0.08), [psdX - side * 0.09, PLATFORM_FLOOR_Y + 1.05, pz]);
        }
      }
    }
    if (cursor < PLATFORM_LEN / 2) bakeFixedPsd(psdX, cursor, PLATFORM_LEN / 2);

    // Sliding leaves
    const leafX = psdX + side * 0.03;
    const leaves = [];
    for (const bz of sortedDoorZs) {
      const closedLeftZ = bz - (LEAF_W / 2 - 0.05);
      const closedRightZ = bz + (LEAF_W / 2 - 0.05);
      leaves.push({ x: leafX, y: psdCentreY - 0.025, closedZ: closedLeftZ, openZ: closedLeftZ - LEAF_TRAVEL });
      leaves.push({ x: leafX, y: psdCentreY - 0.025, closedZ: closedRightZ, openZ: closedRightZ + LEAF_TRAVEL });
    }
    doorLeaves[side] = { leaves, bayZs: sortedDoorZs.slice() };

    // Stainless benches, back-to-canopy-column, every ~18 m (owner item 6).
    const benchX = side * (platformOuter - 1.1);
    for (let dz = -PLATFORM_LEN / 2 + 9; dz <= PLATFORM_LEN / 2 - 9; dz += 18) {
      bake('trussWhite', box(1.5, 0.06, 0.45), [benchX, PLATFORM_FLOOR_Y + 0.46, dz]);
      for (const legZ of [-0.55, 0.55]) {
        bake('trussWhite', box(0.06, 0.46, 0.06), [benchX, PLATFORM_FLOOR_Y + 0.23, dz + legZ]);
      }
    }
  }

  // Build the shared door-leaf InstancedMesh with framed door leaf geometry
  {
    const topRail = box(LEAF_T, 0.12, LEAF_W);
    topRail.translate(0, (LEAF_H - 0.12) / 2, 0);
    const botRail = box(LEAF_T, 0.16, LEAF_W);
    botRail.translate(0, -(LEAF_H - 0.16) / 2, 0);
    const leadStile = box(LEAF_T * 1.05, LEAF_H, 0.08);
    leadStile.translate(0, 0, (LEAF_W - 0.08) / 2);
    const rearStile = box(LEAF_T * 1.05, LEAF_H, 0.08);
    rearStile.translate(0, 0, -(LEAF_W - 0.08) / 2);
    const midDecal = box(LEAF_T * 0.7, 0.06, LEAF_W);
    midDecal.translate(0, 0.12, 0);
    const leafGeo = mergeGeometries([topRail, botRail, leadStile, rearStile, midDecal], false);

    const dummy = new THREE.Object3D();
    let total = 0;
    for (const side of [-1, 1]) total += doorLeaves[side].leaves.length;
    const leafMesh = new THREE.InstancedMesh(leafGeo, MAT.psdFrame, Math.max(1, total));
    leafMesh.name = `psd-leaves:${name}`;
    leafMesh.castShadow = false;
    leafMesh.renderOrder = 1;
    let idx = 0;
    for (const side of [-1, 1]) {
      for (const leaf of doorLeaves[side].leaves) {
        leaf.index = idx;
        dummy.position.set(leaf.x, leaf.y, leaf.closedZ);
        dummy.updateMatrix();
        leafMesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
      doorLeaves[side].mesh = leafMesh;
    }
    leafMesh.instanceMatrix.needsUpdate = true;
    if (total > 0) g.add(leafMesh);
  }

  // --- Track bed and central viaduct structure inside station --------------
  // 1. Continuous structural concrete deck slab under both tracks
  bake('concreteDark', box(PLATFORM_INNER_X * 2, 0.40, PLATFORM_LEN), [0, DECK_Y - 0.20, 0]);

  // 2. Center elevated emergency/maintenance walkway between tracks
  const walkW = 1.30;
  bake('concrete', box(walkW, 0.26, PLATFORM_LEN), [0, DECK_Y + 0.13, 0]);
  // Yellow warning stripes on both edges of the center walkway
  bake('tactile', box(0.06, 0.02, PLATFORM_LEN), [-walkW / 2 + 0.03, DECK_Y + 0.27, 0]);
  bake('tactile', box(0.06, 0.02, PLATFORM_LEN), [walkW / 2 - 0.03, DECK_Y + 0.27, 0]);
  // Center safety handrail along the walkway
  bake('galvanised', box(0.05, 0.05, PLATFORM_LEN), [0, DECK_Y + 1.20, 0]); // top handrail
  bake('galvanised', box(0.04, 0.04, PLATFORM_LEN), [0, DECK_Y + 0.72, 0]); // intermediate rail
  for (let dz = -PLATFORM_LEN / 2 + 4.5; dz <= PLATFORM_LEN / 2 - 4.5 + 0.01; dz += 9) {
    bake('galvanised', box(0.06, 1.0, 0.06), [0, DECK_Y + 0.75, dz]); // posts
  }
  // Galvanized cable containment ducts alongside the walkway
  bake('galvanised', box(0.18, 0.08, PLATFORM_LEN), [-0.85, DECK_Y + 0.06, 0]);
  bake('galvanised', box(0.18, 0.08, PLATFORM_LEN), [0.85, DECK_Y + 0.06, 0]);

  // 3. Concrete derailment curbs on both sides of each track
  for (const sx of [-1, 1]) {
    const tx = sx * TRACK_GAUGE_OFFSET;
    bake('concrete', box(0.18, 0.22, PLATFORM_LEN), [tx - 1.05, DECK_Y + 0.11, 0]);
    bake('concrete', box(0.18, 0.22, PLATFORM_LEN), [tx + 1.05, DECK_Y + 0.11, 0]);
  }

  // 4. Overhead Catenary System (OCS) over each track inside the canopy
  for (const sx of [-1, 1]) {
    const tx = sx * TRACK_GAUGE_OFFSET;
    // Rigid overhead conductor beam at Y = DECK_Y + 5.0m
    bake('steel', box(0.08, 0.14, PLATFORM_LEN), [tx, DECK_Y + 5.0, 0]);
    // Copper contact wire profile under the beam
    bake('steel', box(0.025, 0.025, PLATFORM_LEN), [tx, DECK_Y + 4.91, 0]);
  }
  // Cantilever drop supports from the canopy ribs every 18m
  for (let dz = -PLATFORM_LEN / 2 + 9; dz <= PLATFORM_LEN / 2 - 9 + 0.01; dz += 18) {
    for (const sx of [-1, 1]) {
      const tx = sx * TRACK_GAUGE_OFFSET;
      bake('galvanised', box(0.08, 1.4, 0.08), [tx, DECK_Y + 5.7, dz]);
      bake('galvanised', box(0.7, 0.08, 0.08), [tx + sx * 0.3, DECK_Y + 5.5, dz]);
      bake('concreteDark', box(0.12, 0.22, 0.12), [tx, DECK_Y + 5.15, dz]); // ceramic insulator
    }
  }

  // Note: the functional 3-stop glass lift with bridge connections is built by interior.js at |x| = 14.0.

  // --- Canopy: segmental arch across the platforms, full length -----------
  buildCanopy(canopyBuckets, PLATFORM_FLOOR_Y, -PLATFORM_LEN / 2, PLATFORM_LEN / 2);
  {
    const topMesh = meshFromBucketEntry(canopyBuckets.canopyTop, MAT.canopyTop, `canopy-top:${name}`);
    if (topMesh) g.add(topMesh);
    const underMesh = meshFromBucketEntry(canopyBuckets.canopyUnder, MAT.canopyUnder, `canopy-under:${name}`);
    if (underMesh) g.add(underMesh);
    if (canopyBuckets.ribGeoms && canopyBuckets.ribGeoms.length) {
      const merged = mergeGeometries(canopyBuckets.ribGeoms, false);
      // ADDED 20:20 item A: light-grey (MAT.trussGrey), was white — owner's
      // second photo batch corrected the arch colour from white to
      // galvanised light-grey (#B8BCBE).
      const ribMesh = new THREE.Mesh(merged, MAT.trussGrey);
      ribMesh.name = `canopy-ribs:${name}`;
      ribMesh.castShadow = true;
      g.add(ribMesh);
    }
    const skylightMesh = meshFromBucketEntry(canopyBuckets.skylight, MAT.skylight, `canopy-skylight:${name}`);
    if (skylightMesh) g.add(skylightMesh);
  }
  // Longitudinal eaves box beam and green trim along both outer edges at springing line.
  const springY = PLATFORM_FLOOR_Y + CANOPY_SPRING_Y;
  for (const side of [-1, 1]) {
    bake('trussGrey', box(0.35, 0.35, PLATFORM_LEN), [side * (CANOPY_SPAN / 2 - 0.1), springY, 0]);
    bake('green', box(0.15, 0.4, PLATFORM_LEN), [side * CANOPY_SPAN / 2, springY + 0.2, 0]);
  }

  // Curved green gable fascia trim framing the arch profile at both platform ends.
  const gableProfile = archProfile(24);
  for (const ez of [-PLATFORM_LEN / 2, PLATFORM_LEN / 2]) {
    for (let i = 0; i < gableProfile.length - 1; i++) {
      const a = gableProfile[i];
      const b = gableProfile[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const segLen = Math.hypot(dx, dy) || 1;
      const ang = Math.atan2(dy, dx);
      const nx = -dy / segLen;
      const ny = dx / segLen;
      const mx = (a.x + b.x) / 2 + nx * 0.12;
      const my = PLATFORM_FLOOR_Y + (a.y + b.y) / 2 + ny * 0.12;
      const fascia = box(segLen + 0.02, 0.42, 0.25);
      fascia.rotateZ(ang);
      bake('green', fascia, [mx, my, ez]);
    }
  }

  // Round steel canopy columns resting on sturdy concrete pedestals at outer platform edges.
  const PARAPET_H = 1.15;
  const PARAPET_TOP_Y = PLATFORM_FLOOR_Y + PARAPET_H;
  const colH = springY - PARAPET_TOP_Y;
  for (const side of [-1, 1]) {
    for (let dz = -PLATFORM_LEN / 2 + 4.5; dz <= PLATFORM_LEN / 2 - 4.5 + 0.01; dz += 9) {
      // Concrete pedestal & cap band
      bake('concreteDark', box(0.65, PARAPET_H, 0.65), [side * CANOPY_SPAN / 2, PLATFORM_FLOOR_Y + PARAPET_H / 2, dz]);
      bake('band', box(0.72, 0.08, 0.72), [side * CANOPY_SPAN / 2, PLATFORM_FLOOR_Y + PARAPET_H - 0.04, dz]);

      // Steel column resting on the pedestal
      bake('trussGrey', new THREE.CylinderGeometry(0.225, 0.225, colH, 10), [side * CANOPY_SPAN / 2, PARAPET_TOP_Y + colH / 2, dz]);

      // Round downlight under the arch at this bay, hanging from the truss
      bake('downlight', new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10),
        [side * CANOPY_SPAN * 0.28, PLATFORM_FLOOR_Y + CANOPY_APEX - 0.6, dz]);
    }
  }
  // Hanging passenger info displays under the canopy ribs (item B: "hanging
  // displays"), small black boxes with an orange LED face, one per side
  // every other rib bay.
  {
    let dispIdx = 0;
    for (let dz = -PLATFORM_LEN / 2 + 4.5; dz <= PLATFORM_LEN / 2 - 4.5 + 0.01; dz += 9) {
      dispIdx++;
      if (dispIdx % 2 !== 0) continue;
      for (const side of [-1, 1]) {
        const dx = side * CANOPY_SPAN * 0.22;
        bake('display', box(0.7, 0.28, 0.12), [dx, PLATFORM_FLOOR_Y + CANOPY_APEX - 1.3, dz]);
        bake('galvanised', box(0.05, 0.35, 0.05), [dx, PLATFORM_FLOOR_Y + CANOPY_APEX - 1.0, dz]);
      }
    }
  }
  // Overhead catenary portal gantry at each platform end (clears 2.95m train body).
  const GANTRY_POST_X = TRACK_GAUGE_OFFSET + 1.85; // 3.80m (0.375m clearance from train outer edge 3.425m)
  for (const zc of [-PLATFORM_LEN / 2 + 6, PLATFORM_LEN / 2 - 6]) {
    bake('galvanised', box(0.14, 5.4, 0.14), [-GANTRY_POST_X, DECK_Y + 2.7, zc]);
    bake('galvanised', box(0.14, 5.4, 0.14), [GANTRY_POST_X, DECK_Y + 2.7, zc]);
    bake('galvanised', box(GANTRY_POST_X * 2 + 0.14, 0.12, 0.12), [0, DECK_Y + 5.4, zc]);
  }

  // --- Concourse: pale concrete frame + red-brown brick infill -------------
  const halfL = CONCOURSE_LEN / 2;
  const halfW = CONCOURSE_W / 2;
  // Concourse floor slab
  bake('concrete', box(CONCOURSE_W, 0.4, CONCOURSE_LEN), [0, CONCOURSE_Y, 0]);

  // Concourse roof slab with cutouts for platform stair cores
  const roofY = CONCOURSE_Y + CONCOURSE_WALL_H + 0.6;
  const roofW = CONCOURSE_W + 1.2;
  const roofL = CONCOURSE_LEN + 1.2;
  const roofSouthL = (z0 - 0.2) - (-roofL / 2);
  const roofSouthMidZ = (-roofL / 2 + (z0 - 0.2)) / 2;
  const roofNorthL = (roofL / 2) - (z1 + 0.2);
  const roofNorthMidZ = ((z1 + 0.2) + roofL / 2) / 2;
  const coreCutL = (z1 + 0.2) - (z0 - 0.2);
  const coreCutMidZ = (z0 + z1) / 2;

  // 1. Full-width south concourse roof
  bake('concreteDark', box(roofW, 0.5, roofSouthL), [0, roofY, roofSouthMidZ]);
  // 2. Full-width north concourse roof
  bake('concreteDark', box(roofW, 0.5, roofNorthL), [0, roofY, roofNorthMidZ]);
  // 3. Center strip between stair cores
  const centerW = (coreInnerX - 0.1) * 2;
  bake('concreteDark', box(centerW, 0.5, coreCutL), [0, roofY, coreCutMidZ]);
  // 4. West and East outer strips outside stair cores
  const outerStripW = roofW / 2 - (coreOuterX + 0.1);
  const outerStripMidX = (coreOuterX + 0.1 + roofW / 2) / 2;
  for (const s of [-1, 1]) {
    bake('concreteDark', box(outerStripW, 0.5, coreCutL), [s * outerStripMidX, roofY, coreCutMidZ]);

    // Structural rim trim around the stairwell openings
    bake('concrete', box(0.2, 0.52, coreCutL), [s * (coreInnerX - 0.05), roofY, coreCutMidZ]);
    bake('concrete', box(0.2, 0.52, coreCutL), [s * (coreOuterX + 0.05), roofY, coreCutMidZ]);
    const cutW = (coreOuterX + 0.1) - (coreInnerX - 0.1);
    bake('concrete', box(cutW, 0.52, 0.2), [s * PLATFORM_CORE_X, roofY, z0 - 0.1]);
    bake('concrete', box(cutW, 0.52, 0.2), [s * PLATFORM_CORE_X, roofY, z1 + 0.1]);

    // Vertical stairwell enclosure panels between concourse roof and platform floor
    const shaftH = PLATFORM_FLOOR_Y - roofY;
    const shaftMidY = roofY + shaftH / 2;
    // South back wall at z0
    bake('concreteDark', box(cutW, shaftH, 0.18), [s * PLATFORM_CORE_X, shaftMidY, z0]);
    // Outer side wall at coreOuterX
    bake('concreteDark', box(0.18, shaftH, lenCore), [s * coreOuterX, shaftMidY, midZCore]);
    // Inner side wall at coreInnerX
    bake('concreteDark', box(0.18, shaftH, lenCore), [s * coreInnerX, shaftMidY, midZCore]);
  }

  // (Concourse perimeter walls are baked after entrance placements to leave doorway openings at bridge landings)

  // Portal columns: pale concrete, standing on each footpath edge (owner
  // P1/P2), 4 per side, carrying the brick box clear over the carriageway.
  // Road passes freely underneath — nothing of the concourse stands in it.
  // Positions are also kept in `portalColPositions` (station-local) so the
  // P11-R entrance search below can avoid sliding a shell on top of one.
  const portalColPositions = [];
  for (const sx of [-1, 1]) {
    for (let d = -halfL + 7.5; d <= halfL - 7.5 + 0.01; d += 15) {
      bake('concrete', box(PORTAL_COL_SIZE, CONCOURSE_Y, PORTAL_COL_SIZE), [sx * PORTAL_COL_X, CONCOURSE_Y / 2, d]);
      portalColPositions.push({ x: sx * PORTAL_COL_X, z: d });
    }
  }

  // --- Street fascia name boards, both long faces ---------------------------
  if (labelFactory) {
    for (const side of [-1, 1]) {
      const label = labelFactory(name, bnName, 6, 1);
      label.position.set(side * (halfW + 0.03), CONCOURSE_Y - 0.3, 0);
      label.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(label);
      bake('green', box(0.08, 0.06, 6.2), [side * (halfW + 0.04), CONCOURSE_Y - 0.85, 0]);
    }
  }

  // --- Entrances: stair cores on the footpaths, brick+concrete, joined by a
  // green corrugated barrel-vault bridge. ------------------------------------
  // roadHalf is an ESTIMATE of the carriageway+median half-width the bridge
  // must clear (see docs/METRO-REVIEW.md — E1 owns the actual road ribbon
  // width in streets.js; if it differs from 12 m the core lands short of or
  // past the real footpath edge).
  const roadHalf = 12.0;
  const coreOffset = roadHalf + 4.5; // NOMINAL offset; lands on the footpath outside traffic where the real frontage happens to be set back
  const legZs = legCount >= 4 ? [-halfL + 6, halfL - 6] : [0];
  const ENTRANCE_LETTERS = ['A', 'B', 'C', 'D'];
  const entrances = [];
  const bridgeLandings = { '-1': [], 1: [] };
  let letterIdx = 0;
  // Hoisted out of the per-entrance loop below: these three are the actual
  // physical dimensions of the shell built further down (shellHalfW,
  // wallT, STAIR_RUN — kept as the same names there) and are loop-
  // invariant, so the P11-R search needs them before any entrance's shell
  // is built.
  const shellHalfW = 2.6; // just outside interior.js's guard walls at coreX -+ 2.4
  const wallT = 0.2;
  const STAIR_RUN = 14; // must track interior.js RUN_ENTRANCE * 2
  const EN_MARGIN = 0.3; // real clearance beyond the physical shell footprint — a wall grazed by 10 cm still fails

  // P11-R: station-local (unrotated, station-centred) footprints of every
  // building close enough to matter, built ONCE per station. `buildings`
  // (scene.buildings) is in world space, flat [x0,z0,x1,z1,...] per
  // footprint (see src/city.js, the actual owner of that data — this file
  // only reads it). `worldToLocal` is the exact inverse of the local -> world
  // transform the entrance loop already used to publish `wx`/`wz` below, so
  // a rectangle built in this local frame maps back to the same world
  // rectangle the player actually walks through.
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);
  const worldToLocalXZ = (wx, wz) => {
    const dx = wx - x;
    const dz = wz - z;
    return [dx * cosH - dz * sinH, dx * sinH + dz * cosH];
  };
  // 250 m, not just "beyond the widest search below" (~64 m worst case):
  // a real building can be large enough that its NEAREST vertex sits well
  // outside the search area while an edge still cuts through it (measured:
  // building 1008072207 near Pallabi has its closest vertex 90.4 m from the
  // station centre yet its footprint reaches to within 16.5 m of the spine
  // — a 90 m cutoff silently excluded it and let Pallabi A's nominal
  // position pass as "clear" when it is not). 250 m gives real margin
  // against that without meaningfully increasing build-time cost (a linear
  // scan of ~30k buildings' vertices, once per station, is still cheap).
  const ENTRANCE_SEARCH_RADIUS = 250;
  const localBuildingRings = [];
  if (buildings && buildings.length) {
    for (const b of buildings) {
      const ring = b.p;
      const n = ring.length / 2;
      let close = false;
      for (let i = 0; i < n; i++) {
        const dx = ring[i * 2] - x;
        const dz = ring[i * 2 + 1] - z;
        if (dx * dx + dz * dz < ENTRANCE_SEARCH_RADIUS * ENTRANCE_SEARCH_RADIUS) { close = true; break; }
      }
      if (!close) continue;
      const localRing = new Array(n * 2);
      for (let i = 0; i < n; i++) {
        const [lx, lz] = worldToLocalXZ(ring[i * 2], ring[i * 2 + 1]);
        localRing[i * 2] = lx;
        localRing[i * 2 + 1] = lz;
      }
      localBuildingRings.push(localRing);
    }
  }

  /**
   * Find a station-local (coreX, zc) for this entrance that is
   * simultaneously (a) outside every nearby building footprint, (b)
   * outside the carriageway, and — best-effort — (c) clear of the portal
   * columns, testing the WHOLE shell rectangle (width shellHalfW*2, length
   * STAIR_RUN), not just its centre point. Returns null if nothing in the
   * search range clears every building (the caller drops the entrance
   * rather than placing it inside one).
   */
  function findEntrancePosition(side, nominalZc) {
    const footprintOf = (coreX, zc) => {
      const stairSign = zc !== 0 ? (zc < 0 ? -1 : 1) : (side < 0 ? -1 : 1);
      const stairDir = -stairSign;
      const zFar = zc + stairDir * STAIR_RUN;
      return {
        xMin: coreX - shellHalfW - wallT - EN_MARGIN,
        xMax: coreX + shellHalfW + wallT + EN_MARGIN,
        zMin: Math.min(zc, zFar) - EN_MARGIN,
        zMax: Math.max(zc, zFar) + EN_MARGIN,
      };
    };
    const clearOfBuildings = (coreX, zc) => {
      const { xMin, xMax, zMin, zMax } = footprintOf(coreX, zc);
      for (const ring of localBuildingRings) {
        if (rectIntersectsPolygon(xMin, xMax, zMin, zMax, ring)) return false;
      }
      return true;
    };
    const clearOfCarriageway = (coreX) => {
      const outer = side > 0 ? coreX - shellHalfW - wallT : coreX + shellHalfW + wallT;
      return side > 0 ? outer >= PORTAL_COL_X : outer <= -PORTAL_COL_X;
    };
    const clearOfColumns = (coreX, zc) => {
      const { xMin, xMax, zMin, zMax } = footprintOf(coreX, zc);
      for (const pc of portalColPositions) {
        if (rectIntersectsSquare(xMin, xMax, zMin, zMax, pc.x, pc.z, PORTAL_COL_SIZE / 2)) return false;
      }
      return true;
    };

    // The nominal position (today's fixed +-16.5 m offset) is tried FIRST
    // and kept as-is whenever it already clears buildings and the
    // carriageway — this is what keeps an already-correct entrance
    // (Mirpur 10 A, measured live by the advisor) byte-identical, per the
    // brief's own acceptance criteria, rather than nudging it sideways just
    // because a stricter footprint check also grazes a portal column.
    // Portal-column clearance is enforced only while searching for a
    // REPLACEMENT below, as a preference, not a veto on an already-good spot.
    const nominalCoreX = side * coreOffset;
    if (clearOfBuildings(nominalCoreX, nominalZc) && clearOfCarriageway(nominalCoreX)) {
      return { coreX: nominalCoreX, zc: nominalZc };
    }

    // Search order per the brief: slide along the spine (local Z) first —
    // the footpath runs that way and the concourse is 60 m long — then
    // outward in local X (larger offset from the spine) if nothing along Z
    // works at the current offset.
    let fallback = null; // best building-clear spot found, even if it grazes a portal column
    const zBound = halfL - 1; // stay within the 60 m concourse's own span
    for (let extraX = 0; extraX <= 40; extraX += 1) {
      const coreX = side * (coreOffset + extraX);
      if (!clearOfCarriageway(coreX)) continue;
      const zCandidates = [nominalZc];
      for (let d = 1; d <= zBound; d += 1) {
        if (nominalZc + d <= zBound) zCandidates.push(nominalZc + d);
        if (nominalZc - d >= -zBound) zCandidates.push(nominalZc - d);
      }
      for (const zc of zCandidates) {
        if (!clearOfBuildings(coreX, zc)) continue;
        if (!fallback) fallback = { coreX, zc };
        if (clearOfColumns(coreX, zc)) return { coreX, zc };
      }
    }
    return fallback; // null => genuinely nothing in range clears every building; caller drops the entrance
  }

  for (const side of [-1, 1]) {
    for (const nominalZc of legZs) {
      const letter = ENTRANCE_LETTERS[letterIdx++] || '?';
      const placement = findEntrancePosition(side, nominalZc);
      if (!placement) {
        console.warn(
          `[metro] ${name} entrance ${letter}: dropped — no position within the search range clears every ` +
          `nearby building footprint (checked +-40 m out from the nominal footpath offset and along the full ` +
          `concourse span). Placing it anyway would bury it in a building, so it is omitted entirely.`
        );
        continue;
      }
      const { coreX, zc } = placement;
      // --- Stair/escalator core shell (P11-B item 1) -------------------
      // This used to be a SEALED solid block (4.6x8.4x5.6 m, no opening of
      // any kind) sitting right on top of the walkable stair src/interior.js
      // registers for this same entrance: a 14 m run along station-local Z
      // from the entrance foot (zc) toward the concourse centre, at local X
      // coreX-2.4..coreX+2.4, climbing loY=0 (street) to hiY=CONCOURSE_Y=8
      // (see interior.js buildCore()/RUN_ENTRANCE=7, i.e. halfD=7 -> 14 m
      // total run). The block carried no doorway and did not even reach
      // that run in Z, so the player walked straight through solid concrete
      // to find the (invisible) stair. Replace it with a hollow shell that
      // ENCLOSES the run instead of merely standing beside it: two side
      // walls that step up following the stair's rise (matching the
      // stepped-tread style interior.js itself uses to fake its physically
      // smooth ramp) plus a stepped roof over them, and a footpath-facing
      // end wall with an actual doorway cut into it. interior.js owns
      // everything INSIDE (the ramp, treads, guard walls at coreX -+ 2.4,
      // landings) — this shell only has to clear that footprint; it must
      // not (and per ingestSceneColliders in main.js, does not — station
      // meshes are never scanned into the collision grid, only instanced
      // piers/poles and the analytic portal columns are) carry its own
      // collision, so there is no risk of the visual doorway being blocked
      // by an invisible wall.
      //
      // The far (concourse-ward) end of the run is left OPEN on purpose:
      // it flows straight into the barrel-vault bridge already baked below
      // (`vault`/`vaultEnd`), which is how the player actually continues
      // from the top of the stair into the concourse box — walling it here
      // would just recreate a sealed box at the other end.
      // (STAIR_RUN is hoisted above the entrance loop now — the P11-R
      // search needs it before this shell is built.)
      // P11-Q: this used to be `zc < 0 ? -1 : 1`, independently re-derived
      // in interior.js from `lz < 0 ? -1 : 1` after recovering lz through
      // worldToLocal(). At a 4-leg station (Mirpur 10) zc is +-24 and both
      // files agreed by luck. At every 2-entrance station (Mirpur 11,
      // Pallabi, Uttara South) legZs = [0], so zc is EXACTLY 0 here but
      // interior.js's recovered lz is 0 plus floating-point noise from the
      // trig round-trip — whichever way that noise's sign happened to fall
      // decided, per entrance, whether the walkable stair agreed with the
      // shell built around it. One of the two always disagreed: a bare
      // stair running out into open air with no shell (the owner's Pallabi
      // screenshot). Fix: never key off the sign of a legitimately-zero
      // zc. When zc is 0 (2-entrance stations), use `side` instead, which
      // is never zero and is already opposite for the two entrances — so
      // they come out as true mirror images of each other (opposite stair
      // direction as well as opposite X) instead of both defaulting to the
      // same +1. This value is now the SINGLE source of truth: it is
      // published below as `dir` on the entrance record, and interior.js
      // consumes that directly instead of re-deriving anything. See
      // docs/briefs/P11-Q-TWO-ENTRANCE-STATION-STAIR-DIRECTION.md.
      const stairSign = zc !== 0 ? (zc < 0 ? -1 : 1) : (side < 0 ? -1 : 1);
      const stairDir = -stairSign; // local-Z direction from the footpath foot toward the concourse centre
      // (shellHalfW, wallT also hoisted above the entrance loop.)
      const roofT = 0.3;
      const doorW = 3.0; // brief: ~3.0 m wide
      const doorH = 2.6; // brief: ~2.6 m high
      const clearance = 2.9; // headroom above the (rising) stair surface, held constant along the run
      // P11-T: THIRD attempt at this shell. P11-B's 6 Z-stepped segments and
      // P11-P's riser-panelled 10-segment version both read from outside as a
      // stepped "brick ziggurat" — a staircase of stacked boxes with pale
      // caps, never a single building. The stepped construction itself is
      // the defect, not any one gap in it, so this replaces the whole
      // massing with the shape the brief actually asks for: two side walls
      // whose top edge is a single straight rake (built once each, as one
      // ExtrudeGeometry trapezoid — not per-segment boxes), one raked roof
      // slab over them (the ONLY rotation in the whole shell), a head wall
      // at the concourse end, the existing footpath doorway (kept exactly
      // where it was), and a floor slab under the whole footprint.
      //
      // y0/y1: wall height at the footpath foot (zc) and at the concourse
      // end (zc + stairDir*STAIR_RUN) respectively — the same two numbers
      // the old code's topYs[0] and topYs[SEGMENTS-1] bracketed, so the new
      // single rake starts and ends exactly where the old stepped one did.
      const y0 = clearance;
      const y1 = clearance + CONCOURSE_Y;

      // --- Two side walls: one ExtrudeGeometry trapezoid each, no gaps, no
      // steps. Built in a local (s, y) plane — s = 0..STAIR_RUN along the
      // run, y = 0..height — then extruded by wallT for thickness and
      // rotated a fixed +-90 deg about Y so that local s maps onto world Z
      // (scaled by stairDir) and the extrusion (thickness) maps onto world
      // X. This is plain axis-remapping, not the general rotation the brief
      // warns about elsewhere (setFromUnitVectors/atan2 with an
      // uncontrolled roll) — the angle is always exactly +-90 deg, so there
      // is no sign-of-a-continuous-value to get subtly wrong, only a
      // discrete choice verified by hand below for both stairDir values.
      //
      // Hand-verified (script, not the browser) at Pallabi A (dir=-1,
      // zc=0, coreX=-24.5) and Pallabi B (dir=+1, zc=24, coreX=17.5), and
      // again at Uttara South A/B (same dir pattern, different coreX/zc):
      // in all four cases the resulting wall's world-Z bounding box runs
      // exactly from zc to zc+stairDir*STAIR_RUN (the low end sitting at
      // zc, the high end at the concourse-ward end, never reversed), and
      // its world-X bounding box sits flush on wallCenterX +- wallT/2 with
      // no drift. See docs/METRO-REVIEW.md's matching dated section for the
      // numbers.
      const wallShape = new THREE.Shape();
      wallShape.moveTo(0, 0);
      wallShape.lineTo(STAIR_RUN, 0);
      wallShape.lineTo(STAIR_RUN, y1);
      wallShape.lineTo(0, y0);
      wallShape.closePath();
      const wallRotY = -stairDir * (Math.PI / 2);
      for (const wallSide of [-1, 1]) {
        const wallCenterX = coreX + wallSide * shellHalfW;
        // ExtrudeGeometry is non-indexed by default (BoxGeometry is
        // indexed) — mixing the two in the same merge bucket makes
        // mergeGeometries() throw ("must have ... index attribute ...
        // among all geometries, or in none of them"), caught by the
        // Node-harness verification below. mergeVertices() both
        // de-duplicates and produces the matching indexed geometry.
        let wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: wallT, bevelEnabled: false });
        wallGeo = mergeVertices(wallGeo);
        wallGeo.rotateY(wallRotY);
        bake('brick', wallGeo, [wallCenterX + stairDir * (wallT / 2), 0, zc]);
      }

      // --- One raked roof slab, rotated about local X by
      // Math.atan2(rise, run) per the brief — negated by stairDir, since
      // atan2(rise, run) alone only tilts the high end toward +Z, and half
      // of this station's entrances climb toward -Z (stairDir=-1). Verified
      // by hand for both signs (same four entrances as the walls above):
      // the roof's world-Y bounding box brackets y0..y1 and its world-Z
      // bounding box brackets zc..zc+stairDir*STAIR_RUN (plus the small
      // overhang below) in every case — never mirrored to the wrong end.
      // Box length is the SLANT length (hypot(rise,run), not run) so that,
      // once rotated, its horizontal projection is exactly STAIR_RUN
      // (plus overhang) rather than falling short of it.
      const roofOverhangZ = 0.4; // extra slant-length reach past each end, so there's no seam at the wall ends
      const roofOverhangX = 0.15; // extra width past each side wall, so there's no seam along the sides
      const roofRun = STAIR_RUN + 2 * roofOverhangZ;
      const roofSlant = Math.hypot(CONCOURSE_Y, STAIR_RUN) * (roofRun / STAIR_RUN);
      const roofAngle = -stairDir * Math.atan2(CONCOURSE_Y, STAIR_RUN);
      const roofGeo = box(shellHalfW * 2 + wallT * 2 + 2 * roofOverhangX, roofT, roofSlant);
      roofGeo.rotateX(roofAngle);
      bake('concrete', roofGeo, [coreX, (y0 + y1) / 2, zc + stairDir * (STAIR_RUN / 2)]);

      // --- Head wall at the concourse end: jambs either side of a doorway
      // opening, same shape as the footpath end wall below but based on the
      // landing floor (CONCOURSE_Y) instead of the street (0). By
      // construction y1 - CONCOURSE_Y === clearance (the same headroom
      // clearance used everywhere else along the raked run), so the full
      // available height above the landing here IS exactly one doorway's
      // worth — there's no spare band to wall off above the opening the
      // way the footpath end has one below its lower doorway. Left open:
      // the landing itself and the barrel-vault bridge baked further down,
      // both of which sit at/below CONCOURSE_Y and pass under this head
      // wall's jambs and roofline without needing this file to know their
      // exact footprint.
      {
        const farZ = zc + stairDir * STAIR_RUN;
        const headJambW = shellHalfW - doorW / 2;
        const headWallH = y1 - CONCOURSE_Y; // == clearance, by construction
        bake('brick', box(headJambW, headWallH, wallT), [coreX - (doorW / 2 + headJambW / 2), CONCOURSE_Y + headWallH / 2, farZ]);
        bake('brick', box(headJambW, headWallH, wallT), [coreX + (doorW / 2 + headJambW / 2), CONCOURSE_Y + headWallH / 2, farZ]);
      }

      // Footpath-facing end wall, flush with the low end of the side walls,
      // with a doorway cut into it (brief: ~3.0 m wide x 2.6 m high, centred
      // on coreX, under the entrance fascia sign baked just below). Height
      // matches the side walls' own low-end height (y0), the same fix P11-P
      // made for the old stepped wall's segment-0 height — keeps the jambs
      // flush with the new raked walls instead of stopping short.
      {
        const endWallH = y0;
        const endZ = zc - stairDir * (wallT / 2);
        const jambW = shellHalfW - doorW / 2;
        bake('brick', box(jambW, endWallH, wallT), [coreX - (doorW / 2 + jambW / 2), endWallH / 2, endZ]);
        bake('brick', box(jambW, endWallH, wallT), [coreX + (doorW / 2 + jambW / 2), endWallH / 2, endZ]);
        bake('band', box(doorW, endWallH - doorH, wallT), [coreX, doorH + (endWallH - doorH) / 2, endZ]);
      }

      // --- Floor slab under the whole footprint (brief item 5: "the shell
      // stands on bare earth with daylight under it" in the owner's
      // screenshots). A flat street-level foundation slab is enough here —
      // interior.js owns the actual rising stair/escalator floor above it.
      {
        const floorT = 0.3;
        const floorLen = STAIR_RUN + 0.6;
        bake('concreteDark', box(shellHalfW * 2 + wallT * 2, floorT, floorLen), [coreX, -floorT / 2, zc + stairDir * (STAIR_RUN / 2)]);
      }

      // Bridge from the concourse edge to the core, and the green vault
      // over it, must sit at the LANDING (top-of-stair, concourse height)
      // Z, not at `zc` (the street-level foot) — P11-T second defect. The
      // landing is the exact same point interior.js's wallGaps push uses:
      // `landingZ = centerZ - sign*(RUN_ENTRANCE+1)` where
      // `centerZ = lz -+ RUN_ENTRANCE` (sign convention flips the +-).
      // Substituting centerZ in terms of `lz` (== `zc` here, published
      // verbatim as `en.lz` below) collapses to a single offset from zc:
      // `landingZ = zc - stairSign*(2*RUN_ENTRANCE + 1)`, and
      // 2*RUN_ENTRANCE === STAIR_RUN (already tracked against
      // interior.js's RUN_ENTRANCE above). Deriving it this way — from the
      // same STAIR_RUN/stairSign this function already used to place the
      // stair, walls and roof — means this can't drift from interior.js's
      // landingZ the way P11-Q's independent re-derivation did.
      const landingLz = zc - stairSign * (STAIR_RUN + 1);
      bridgeLandings[side].push(landingLz);
      const bridgeStart = side * halfW;
      const bridgeLen = Math.max(1.0, Math.abs(coreX - bridgeStart) - 1.0);
      const bridgeMid = bridgeStart + side * (1.0 + bridgeLen / 2);
      bake('concreteDark', box(bridgeLen, 0.3, 3.0), [bridgeMid, CONCOURSE_Y - 0.2, landingLz]);

      // Green corrugated barrel-vault roof over the bridge and stair run.
      const vault = new THREE.CylinderGeometry(1.7, 1.7, bridgeLen + 4, 12, 1, true, Math.PI, Math.PI);
      vault.rotateZ(Math.PI / 2);
      bake('corrugatedGreen', vault, [bridgeMid, CONCOURSE_Y + 0.35, landingLz]);
      const vaultEnd = new THREE.CylinderGeometry(1.7, 1.7, 3.2, 12, 1, true, Math.PI, Math.PI);
      vaultEnd.rotateZ(Math.PI / 2);
      bake('corrugatedGreen', vaultEnd, [coreX, CONCOURSE_Y - 1.0, landingLz]);

      // Entrance fascia board (B1): dark green, letter square, hung from the
      // canopy frame at the footpath-facing end of the core.
      const sign = makeEntranceLabel(name, bnName, letter, 3.2, 0.75);
      sign.position.set(coreX, CONCOURSE_Y - 0.6, zc + side * 2.9);
      sign.rotation.y = side > 0 ? 0 : Math.PI;
      g.add(sign);

      // World-space street-level foot of this entrance core, for the
      // interior executor and for docs/METRO-REVIEW.md.
      const wx = x + coreX * Math.cos(heading) + zc * Math.sin(heading);
      const wz = z - coreX * Math.sin(heading) + zc * Math.cos(heading);
      // dir/lz (P11-Q): publish the exact local-Z (`zc`, known here — not
      // recovered later through a worldToLocal() trig round-trip that turns
      // a legitimate 0 into signed float noise) and the direction actually
      // used to build this entrance's shell (`stairSign`), so interior.js
      // can consume the same single source of truth instead of re-deriving
      // its own (and possibly disagreeing at a 2-entrance station).
      entrances.push({ x: wx, z: wz, letter, side, dir: stairSign, lz: zc });
    }
  }

  // --- Platform Outer Walls, Glazed Louver Screens, Corner Cabins & End Barriers ---
  const RUN_ENTRANCE = 7;
  let liftSide = -1;
  let liftLz = -(CONCOURSE_LEN / 2 - 6);
  if (entrances.length) {
    const enRef = entrances[0];
    const elx = enRef.side * coreOffset;
    liftSide = enRef.side ?? (elx < 0 ? -1 : 1);
    liftLz = enRef.lz - (enRef.dir ?? 1) * (RUN_ENTRANCE * 2 + 6);
  }
  {
    const LIFT_SHAFT_HALF_D = 2.2 / 2 + 0.35;
    const LIFT_COL_CLEAR = LIFT_SHAFT_HALF_D + PORTAL_COL_SIZE / 2 + 0.3;
    for (let d = -halfL + 7.5; d <= halfL - 7.5 + 0.01; d += 15) {
      if (Math.abs(liftLz - d) < LIFT_COL_CLEAR) {
        const upZ = d + LIFT_COL_CLEAR;
        const downZ = d - LIFT_COL_CLEAR;
        liftLz = Math.abs(upZ - liftLz) < Math.abs(downZ - liftLz) ? upZ : downZ;
      }
    }
  }

  const cabinW = 3.4;
  const cabinD = 5.5;
  const wallXOffset = CANOPY_SPAN / 2 - 0.15; // 10.85 m
  const screenH = springY - PARAPET_TOP_Y; // 0.85 m

  for (const side of [-1, 1]) {
    const wallX = side * wallXOffset;
    const zCabinMin = -PLATFORM_LEN / 2 + cabinD;
    const zCabinMax = PLATFORM_LEN / 2 - cabinD;

    // Outer wall segments (leaving doorway opening at lift landing bridge)
    const wallSegs = [];
    if (side === liftSide) {
      const doorHalfW = 1.6;
      wallSegs.push([zCabinMin, liftLz - doorHalfW]);
      wallSegs.push([liftLz + doorHalfW, zCabinMax]);
    } else {
      wallSegs.push([zCabinMin, zCabinMax]);
    }

    for (const [zA, zB] of wallSegs) {
      const segLen = zB - zA;
      if (segLen < 0.1) continue;
      const segMidZ = (zA + zB) / 2;

      // Concrete parapet base
      bake('concrete', box(0.28, PARAPET_H, segLen), [wallX, PLATFORM_FLOOR_Y + PARAPET_H / 2, segMidZ]);
      bake('band', box(0.32, 0.08, segLen), [wallX, PLATFORM_FLOOR_Y + PARAPET_H - 0.04, segMidZ]);

      // Stainless steel safety handrail along inner face of parapet
      bake('steel', box(0.05, 0.05, segLen), [side * 10.65, PLATFORM_FLOOR_Y + 1.0, segMidZ]);
      for (let bz = Math.ceil((zA + 1) / 4.5) * 4.5; bz < zB - 0.5; bz += 4.5) {
        bake('steel', box(0.12, 0.04, 0.04), [side * 10.72, PLATFORM_FLOOR_Y + 0.95, bz]);
      }

      // Glazed louver window screen
      bake('psdGlass', box(0.06, screenH - 0.08, segLen), [wallX, PARAPET_TOP_Y + screenH / 2, segMidZ]);
      bake('psdFrame', box(0.12, 0.06, segLen), [wallX, springY - 0.03, segMidZ]);
      bake('psdFrame', box(0.12, 0.06, segLen), [wallX, PARAPET_TOP_Y + 0.03, segMidZ]);
      bake('steel', box(0.08, 0.03, segLen), [wallX, PARAPET_TOP_Y + screenH * 0.35, segMidZ]);
      bake('steel', box(0.08, 0.03, segLen), [wallX, PARAPET_TOP_Y + screenH * 0.70, segMidZ]);
      for (let mz = Math.ceil((zA + 0.5) / 2.25) * 2.25; mz < zB - 0.5; mz += 2.25) {
        bake('psdFrame', box(0.12, screenH, 0.06), [wallX, PARAPET_TOP_Y + screenH / 2, mz]);
      }
    }

    // Corner Service Cabins (at north and south ends)
    for (const endSign of [-1, 1]) {
      const ez = endSign * (PLATFORM_LEN / 2);
      const zFrom = endSign > 0 ? ez - cabinD : ez;
      const zTo = endSign > 0 ? ez : ez + cabinD;
      const cabinMidZ = (zFrom + zTo) / 2;
      const cabinMidX = side * (platformOuter - cabinW / 2);
      const frontZ = endSign * (PLATFORM_LEN / 2 - cabinD);

      // Cabin room enclosure
      bake('band', box(cabinW, 2.6, cabinD), [cabinMidX, PLATFORM_FLOOR_Y + 1.3, cabinMidZ]);
      bake('concreteDark', box(cabinW + 0.08, 0.16, cabinD + 0.08), [cabinMidX, PLATFORM_FLOOR_Y + 0.08, cabinMidZ]);
      bake('concreteDark', box(cabinW + 0.08, 0.16, cabinD + 0.08), [cabinMidX, PLATFORM_FLOOR_Y + 2.52, cabinMidZ]);
      bake('concrete', box(cabinW + 0.2, 0.2, cabinD + 0.2), [cabinMidX, PLATFORM_FLOOR_Y + 2.7, cabinMidZ]);

      // Service door on front face
      const doorX = side * (platformOuter - cabinW / 2);
      const doorZ = frontZ - endSign * 0.02;
      bake('psdFrame', box(1.05, 2.15, 0.06), [doorX, PLATFORM_FLOOR_Y + 1.075, doorZ]);
      bake('psdFrame', box(0.95, 2.05, 0.04), [doorX, PLATFORM_FLOOR_Y + 1.025, doorZ]);
      bake('psdGlass', box(0.25, 0.65, 0.06), [doorX, PLATFORM_FLOOR_Y + 1.4, doorZ]);
      bake('steel', box(0.04, 0.18, 0.06), [doorX + side * 0.35, PLATFORM_FLOOR_Y + 1.0, doorZ - endSign * 0.04]);

      // Digital LED clock & platform sign above door
      bake('display', box(0.7, 0.25, 0.08), [doorX, PLATFORM_FLOOR_Y + 2.32, doorZ]);
      bake('downlight', box(0.55, 0.15, 0.09), [doorX, PLATFORM_FLOOR_Y + 2.32, doorZ]);
      bake('green', box(1.6, 0.3, 0.06), [doorX, PLATFORM_FLOOR_Y + 2.0, doorZ]);

      // Equipment louver on inner side face
      bake('steel', box(0.06, 0.8, 1.4), [side * (platformOuter - cabinW), PLATFORM_FLOOR_Y + 1.3, cabinMidZ]);

      // Transverse platform end security balustrade across track walkway
      const barrierZ = endSign * (PLATFORM_LEN / 2 - 0.12);
      const cabinInnerX = side * (platformOuter - cabinW);
      const trackEdgeX = side * PLATFORM_INNER_X;
      const barW = Math.abs(platformOuter - cabinW - PLATFORM_INNER_X);
      const barMidX = (cabinInnerX + trackEdgeX) / 2;

      bake('concrete', box(barW, 0.2, 0.24), [barMidX, PLATFORM_FLOOR_Y + 0.1, barrierZ]);
      bake('psdFrame', box(barW, 0.08, 0.08), [barMidX, PLATFORM_FLOOR_Y + 1.3, barrierZ]);
      bake('psdFrame', box(barW, 0.06, 0.06), [barMidX, PLATFORM_FLOOR_Y + 0.25, barrierZ]);
      bake('psdGlass', box(barW - 0.04, 0.98, 0.04), [barMidX, PLATFORM_FLOOR_Y + 0.775, barrierZ]);

      // Balustrade posts
      bake('psdFrame', box(0.08, 1.3, 0.08), [trackEdgeX, PLATFORM_FLOOR_Y + 0.65, barrierZ]);
      bake('psdFrame', box(0.08, 1.3, 0.08), [barMidX, PLATFORM_FLOOR_Y + 0.65, barrierZ]);
      bake('psdFrame', box(0.08, 1.3, 0.08), [cabinInnerX, PLATFORM_FLOOR_Y + 0.65, barrierZ]);

      // Staff caution indicator plate
      bake('tactile', box(0.7, 0.22, 0.06), [barMidX, PLATFORM_FLOOR_Y + 0.9, barrierZ - endSign * 0.03]);
    }
  }

  // Perimeter walls: columns 0.8 sq every 8 m, brick infill panels between,
  // pale concrete band courses every 1.2 m, glazed window band at 2.6 m.
  // Concourse side walls (axis: 'x') leave doorway openings at each entrance bridge landing.
  function getWallSegments(landingZs, gapWidth = 3.2) {
    const gaps = landingZs.map((z) => ({ z0: z - gapWidth / 2, z1: z + gapWidth / 2 })).sort((a, b) => a.z0 - b.z0);
    let cursor = -halfL;
    const segs = [];
    for (const g of gaps) {
      const lo = Math.max(cursor, g.z0);
      const hi = Math.min(halfL, g.z1);
      if (lo > cursor) segs.push([cursor, lo]);
      cursor = Math.max(cursor, hi);
    }
    if (cursor < halfL) segs.push([cursor, halfL]);
    return segs;
  }

  for (const face of [
    { axis: 'x', sign: -1, len: CONCOURSE_LEN, half: halfW },
    { axis: 'x', sign: 1, len: CONCOURSE_LEN, half: halfW },
    { axis: 'z', sign: -1, len: CONCOURSE_W, half: halfL },
    { axis: 'z', sign: 1, len: CONCOURSE_W, half: halfL },
  ]) {
    const isX = face.axis === 'x';
    const wallCentre = face.half - 0.05;
    // Columns.
    for (let d = -face.len / 2 + 4; d <= face.len / 2 - 4; d += 8) {
      const pos = isX ? [face.sign * wallCentre, CONCOURSE_Y + CONCOURSE_WALL_H / 2, d] : [d, CONCOURSE_Y + CONCOURSE_WALL_H / 2, face.sign * wallCentre];
      bake('concrete', box(isX ? 0.8 : face.len > 40 ? 0.8 : 0.8, CONCOURSE_WALL_H, 0.8), pos);
    }
    // Brick infill panel (thin skin) and band courses.
    if (isX) {
      const segs = getWallSegments(bridgeLandings[face.sign] || [], 3.2);
      for (const [z0, z1] of segs) {
        const segLen = z1 - z0;
        if (segLen < 0.1) continue;
        const segMidZ = (z0 + z1) / 2;
        bake('brick', box(0.14, CONCOURSE_WALL_H, segLen), [face.sign * (wallCentre - 0.02), CONCOURSE_Y + CONCOURSE_WALL_H / 2, segMidZ]);
        for (let yy = CONCOURSE_Y + 1.0; yy < CONCOURSE_Y + CONCOURSE_WALL_H; yy += 1.2) {
          bake('band', box(0.15, 0.25, segLen), [face.sign * (wallCentre - 0.01), yy, segMidZ]);
        }
      }
    } else {
      const panelPos = [0, CONCOURSE_Y + CONCOURSE_WALL_H / 2, face.sign * (wallCentre - 0.02)];
      bake('brick', box(face.len, CONCOURSE_WALL_H, 0.14), panelPos);
      for (let yy = CONCOURSE_Y + 1.0; yy < CONCOURSE_Y + CONCOURSE_WALL_H; yy += 1.2) {
        const bPos = [0, yy, face.sign * (wallCentre - 0.01)];
        bake('band', box(face.len, 0.25, 0.15), bPos);
      }
    }
    // Glazed window band, 1.4 m tall, 2.6 m up.
    const gPos = isX ? [face.sign * (wallCentre - 0.02), CONCOURSE_Y + 2.6 + 0.7, 0] : [0, CONCOURSE_Y + 2.6 + 0.7, face.sign * (wallCentre - 0.02)];
    bake('glass', box(isX ? 0.12 : face.len * 0.9, 1.4, isX ? face.len * 0.9 : 0.12), gPos);
    // Edge beam at roof line.
    const beamPos = isX ? [face.sign * wallCentre, CONCOURSE_Y + CONCOURSE_WALL_H + 0.35, 0] : [0, CONCOURSE_Y + CONCOURSE_WALL_H + 0.35, face.sign * wallCentre];
    // Pallabi's side roof edge was reading as a stray white floating line
    // across the carriageway from street level. The station wall already has
    // a complete fascia/band here; omit only this redundant edge beam at
    // Pallabi and keep the structural beam on the other stations.
    if (name !== 'Pallabi') bake('concrete', box(isX ? 0.8 : face.len, 0.7, isX ? face.len : 0.8), beamPos);
  }

  // Merge buckets.
  const bucketMat = {
    concrete: MAT.concrete, concreteDark: MAT.concreteDark, brick: MAT.brick, band: MAT.band,
    glass: MAT.glass, green: MAT.green, corrugatedGreen: MAT.corrugatedGreen,
    galvanised: MAT.galvanised, steel: MAT.steel, psdFrame: MAT.psdFrame, psdGlass: MAT.psdGlass,
    platformFloor: MAT.platformFloor, tactile: MAT.tactile, trussWhite: MAT.trussWhite,
    trussGrey: MAT.trussGrey, downlight: MAT.downlight, display: MAT.display,
  };
  for (const [key, mat] of Object.entries(bucketMat)) {
    const m = mergeBucket(buckets[key], mat, `${key}:${name}`);
    if (m) g.add(m);
  }

  // --- Roundel signs on every second canopy column --------------------------
  // ADDED 20:20 item E: was one Torus Mesh + one pill Mesh PER column
  // (~40 draw calls/station) — rings now merge into a single mesh, and the
  // pills (all identical content, now cached/shared by signs.js) collapse
  // into one InstancedMesh, for 2 draw calls total instead of ~40.
  if (labelFactory) {
    const ringGeoms = [];
    const pillMatrices = [];
    let samplePill = null;
    let colIdx = 0;
    const dummy = new THREE.Object3D();
    for (const side of [-1, 1]) {
      for (let dz = -PLATFORM_LEN / 2 + 4.5; dz <= PLATFORM_LEN / 2 - 4.5 + 0.01; dz += 9) {
        colIdx++;
        if (colIdx % 2 !== 0) continue;
        ringGeoms.push(bakeGeometry(
          new THREE.TorusGeometry(0.6, 0.07, 8, 20),
          [side * CANOPY_SPAN / 2, PLATFORM_FLOOR_Y + 3.4, dz],
          Math.PI / 2
        ));
        if (!samplePill) samplePill = labelFactory(name, bnName, 0.9, 0.42);
        dummy.position.set(side * (CANOPY_SPAN / 2 - 0.02), PLATFORM_FLOOR_Y + 3.4, dz);
        dummy.rotation.set(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        dummy.updateMatrix();
        pillMatrices.push(dummy.matrix.clone());
      }
    }
    if (ringGeoms.length) {
      const ringMesh = mergeBucket(ringGeoms, MAT.green, `roundel-rings:${name}`);
      if (ringMesh) g.add(ringMesh);
    }
    if (samplePill && pillMatrices.length) {
      const pillMesh = new THREE.InstancedMesh(samplePill.geometry, samplePill.material, pillMatrices.length);
      pillMesh.name = `roundel-pills:${name}`;
      pillMatrices.forEach((m, i) => pillMesh.setMatrixAt(i, m));
      pillMesh.instanceMatrix.needsUpdate = true;
      g.add(pillMesh);
    }
  }

  g.userData.entrances = entrances;
  g.userData.doorLeaves = doorLeaves; // P11-I item 1: { '-1': {mesh,leaves,bayZs}, '1': {...} }
  return g;
}

// ---------------------------------------------------------------------------
// Train
// ---------------------------------------------------------------------------

/**
 * One six-car set in DMTCL stainless/green/red livery.
 *
 * ADDED 20:20 item E: rewritten from ~33-38 individual Mesh objects PER CAR
 * (body/roof/skirt/stripe/window/8 doors+edges/cab parts/bogies — about 208
 * meshes for a 6-car set, ~416 for the two trains in the scene, the single
 * largest contributor to the 472-524 draw-call metro group) into one merged
 * BufferGeometry PER MATERIAL for the WHOLE TRAIN (8 materials -> 8 draw
 * calls per train, regardless of car count). Visual geometry is unchanged —
 * same box positions/sizes per car, just baked into shared buckets instead
 * of individual Mesh instances.
 */
// Buckets that stay as their own always-visible meshes (emissive), and the
// small ones a train 350 m away does not need at all.
const TRAIN_ALWAYS_KEYS = new Set(['trainInterior', 'trainHeadlight', 'trainTaillight', 'trainDest']);
const TRAIN_FAR_SKIP_KEYS = new Set(['trainWindowFrame', 'trainWheel', 'trainRib', 'trainPantograph', 'trainDoorEdge', 'wireOrange', 'trainRoofAC']);
const TRAIN_LOD_RANGE = 350;
// Station fittings that are under a pixel from this far: canopy ribs, platform
// screen door frames, roundel rings, downlights, trusses, displays.
const STATION_DETAIL_RANGE = 700;
const STATION_DETAIL_PREFIXES = ['canopy-ribs', 'psdFrame', 'psd-leaves', 'roundel-rings', 'downlight', 'display', 'trussGrey', 'trussWhite', 'galvanised', 'steel'];

function buildTrain() {
  const g = new THREE.Group();
  g.name = 'train';

  const CAR_LEN = TRAIN_CAR_LEN;
  const CAR_W = 2.95;
  const CAR_H = 3.5;
  const GAP = TRAIN_CAR_GAP;
  const CARS = TRAIN_CARS;

  const cars = [];
  const bucketMat = {
    trainBody: MAT.trainBody, trainRib: MAT.trainRib, trainGreen: MAT.trainGreen,
    trainWhite: MAT.trainWhite, trainRed: MAT.trainRed, trainGlass: MAT.trainGlass,
    trainWindow: MAT.trainWindow, trainWindowFrame: MAT.trainWindowFrame,
    trainInterior: MAT.trainInterior, trainHeadlight: MAT.trainHeadlight,
    trainTaillight: MAT.trainTaillight, trainDest: MAT.trainDest,
    trainRoofAC: MAT.trainRoofAC, trainPantograph: MAT.trainPantograph,
    trainWheel: MAT.trainWheel, trainDoorEdge: MAT.trainDoorEdge,
    trainDoorLeaf: MAT.trainBody, trainDoorGreen: MAT.trainGreen, trainDoorRed: MAT.trainRed,
    bogie: MAT.bogie, wireOrange: MAT.wireOrange,
  };

  for (let i = 0; i < CARS; i++) {
    const car = new THREE.Group();
    car.name = `train-car-${i}`;
    const zOffset = (i - (CARS - 1) / 2) * (CAR_LEN + GAP);
    car.position.set(0, 0, zOffset);

    const buckets = {};
    for (const key of Object.keys(bucketMat)) buckets[key] = [];
    const bake = (b, geo, pos, rot = [0, 0, 0], sc = 1) => {
      if (b === 'trainGlass' || b === 'trainWindow') { geo.dispose(); return; }
      if (buckets[b]) buckets[b].push(bakeGeometry(geo, pos, rot, sc));
    };

    const isEnd = i === 0 || i === CARS - 1;
    const endDir = i === 0 ? -1 : 1;

    // 1. Main underframe / floor chassis
    bake('bogie', box(CAR_W - 0.25, 0.22, CAR_LEN - 0.1), [0, 0.50, 0]);

    // 2. Stainless steel lower & upper side walls
    for (const side of [-1, 1]) {
      const wx = side * (CAR_W / 2 - 0.05);

      // Lower body plate
      bake('trainBody', box(0.10, 1.14, CAR_LEN), [wx, 1.18, 0]);

      // Upper body plate above windows (from Y=2.70 to Y=3.35)
      bake('trainBody', box(0.10, 0.65, CAR_LEN), [wx, 3.025, 0]);

      // Pressed stainless steel longitudinal corrugations / ribs (Kawasaki beading)
      for (const ry of [0.75, 0.90, 1.05, 1.20, 2.90, 3.15]) {
        bake('trainRib', box(0.04, 0.035, CAR_LEN - 0.2), [side * (CAR_W / 2 + 0.015), ry, 0]);
      }

      // DMTCL Official Emerald Green belt stripe (waistline below windows)
      bake('trainGreen', box(0.03, 0.28, CAR_LEN - 0.05), [side * (CAR_W / 2 + 0.018), 1.62, 0]);

      // Bangladesh Red accent stripe (directly below green stripe)
      bake('trainRed', box(0.035, 0.08, CAR_LEN - 0.05), [side * (CAR_W / 2 + 0.02), 1.44, 0]);

      // Upper roof cantrail thin green line
      bake('trainGreen', box(0.03, 0.06, CAR_LEN - 0.1), [side * (CAR_W / 2 + 0.015), 3.32, 0]);
    }

    // 3. Curved Aerodynamic Stainless Steel Roof
    bake('trainBody', box(CAR_W - 0.7, 0.18, CAR_LEN), [0, 3.56, 0]);
    bake('trainBody', box(CAR_W - 1.2, 0.12, CAR_LEN - 0.4), [0, 3.65, 0]);
    for (const side of [-1, 1]) {
      bake('trainBody', box(0.55, 0.15, CAR_LEN), [side * (CAR_W / 2 - 0.40), 3.46, 0], [0, 0, side * 0.22]);
      bake('trainRib', box(0.03, 0.03, CAR_LEN - 0.4), [side * 0.75, 3.66, 0]);
      bake('trainRib', box(0.03, 0.03, CAR_LEN - 0.4), [side * 1.15, 3.52, 0]);
    }

    // 4. Doors (4 bi-parting sliding passenger doors per side, spaced CAR_LEN/4)
    const doorSpacing = CAR_LEN / 4;
    const doorZs = [];
    for (let d = 0; d < 4; d++) {
      const dz = -CAR_LEN / 2 + doorSpacing * (d + 0.5);
      doorZs.push(dz);
      for (const side of [-1, 1]) {
        const sx = side * (CAR_W / 2);

        // Door frame surround / recess (hollow perimeter)
        bake('trainWindowFrame', box(0.06, 0.06, 1.34), [sx + side * 0.015, 2.73, dz]);
        bake('trainWindowFrame', box(0.06, 2.12, 0.05), [sx + side * 0.015, 1.70, dz - 0.65]);
        bake('trainWindowFrame', box(0.06, 2.12, 0.05), [sx + side * 0.015, 1.70, dz + 0.65]);

        // Two door leaves (stainless steel)
        bake('trainDoorLeaf', box(0.05, 2.06, 0.62), [sx + side * 0.025, 1.70, dz - 0.32]);
        bake('trainDoorLeaf', box(0.05, 2.06, 0.62), [sx + side * 0.025, 1.70, dz + 0.32]);

        // Vertical center rubber seal between leaves
        bake('trainDoorLeaf', box(0.055, 2.06, 0.035), [sx + side * 0.03, 1.70, dz]);

        // Glazed door windows with rounded profile & black gasket
        for (const lz of [dz - 0.32, dz + 0.32]) {
          bake('trainDoorLeaf', box(0.06, 0.04, 0.42), [sx + side * 0.03, 2.54, lz]);
          bake('trainDoorLeaf', box(0.06, 0.04, 0.42), [sx + side * 0.03, 1.50, lz]);
          bake('trainDoorLeaf', box(0.06, 1.08, 0.04), [sx + side * 0.03, 2.02, lz - 0.19]);
          bake('trainDoorLeaf', box(0.06, 1.08, 0.04), [sx + side * 0.03, 2.02, lz + 0.19]);
          bake('trainGlass', box(0.02, 1.00, 0.36), [sx + side * 0.032, 2.02, lz]);
        }

        // DMTCL green/red waistline stripe carried across the door leaves
        bake('trainDoorGreen', box(0.06, 0.28, 1.26), [sx + side * 0.028, 1.62, dz]);
        bake('trainDoorRed', box(0.062, 0.08, 1.26), [sx + side * 0.03, 1.44, dz]);

        // Door threshold / sill warning edge
        bake('trainDoorEdge', box(0.08, 0.04, 1.30), [sx + side * 0.02, 0.65, dz]);

        // Over-door LED indicator lamp (red/orange warning light)
        bake('trainDest', box(0.05, 0.05, 0.12), [sx + side * 0.035, 2.80, dz]);
      }
    }

    // 5. Side Windows (Between doors)
    const windowBays = [
      (doorZs[0] + doorZs[1]) / 2,
      (doorZs[1] + doorZs[2]) / 2,
      (doorZs[2] + doorZs[3]) / 2,
    ];
    const winW = doorSpacing - 1.55;
    for (const wz of windowBays) {
      for (const side of [-1, 1]) {
        const sx = side * (CAR_W / 2);

        // Window black frame perimeter (hollow perimeter)
        const frameT = 0.04;
        const winH = 0.94;
        bake('trainWindowFrame', box(0.06, frameT, winW + 0.08), [sx + side * 0.01, 2.22 + winH / 2, wz]);
        bake('trainWindowFrame', box(0.06, frameT, winW + 0.08), [sx + side * 0.01, 2.22 - winH / 2, wz]);
        bake('trainWindowFrame', box(0.06, winH, frameT), [sx + side * 0.01, 2.22, wz - winW / 2]);
        bake('trainWindowFrame', box(0.06, winH, frameT), [sx + side * 0.01, 2.22, wz + winW / 2]);

        // Tinted glass panel (crystal clear transparent view)
        bake('trainGlass', box(0.02, winH, winW), [sx + side * 0.015, 2.22, wz]);

        // Center vertical black mullion dividing the bay into twin panoramic panes
        bake('trainWindowFrame', box(0.07, winH, 0.06), [sx + side * 0.02, 2.22, wz]);

        // Simple seat block for exterior viewing
        bake('trainGreen', box(0.35, 0.38, winW - 0.2), [sx - side * 0.25, 0.82, wz]);
      }
    }

    // 6. End Walls & Aerodynamic Front Cab
    if (!isEnd) {
      for (const ez of [-CAR_LEN / 2, CAR_LEN / 2]) {
        // Gangway end wall with central walk-through opening (1.15m wide, 2.10m high)
        const wallW = (CAR_W - 0.2 - 1.15) / 2;
        bake('trainBody', box(wallW, CAR_H - 0.4, 0.08), [-0.575 - wallW / 2, 1.95, ez]);
        bake('trainBody', box(wallW, CAR_H - 0.4, 0.08), [0.575 + wallW / 2, 1.95, ez]);
        bake('trainBody', box(1.15, CAR_H - 0.4 - 2.10, 0.08), [0, 2.10 + (CAR_H - 0.4 - 2.10) / 2, ez]);
        bake('trainWindowFrame', box(0.06, 2.10, 0.08), [-0.575, 1.70, ez]);
        bake('trainWindowFrame', box(0.06, 2.10, 0.08), [0.575, 1.70, ez]);
        bake('trainWindowFrame', box(1.15, 0.06, 0.08), [0, 2.75, ez]);
      }
    } else {
      const zNose = endDir * (CAR_LEN / 2);
      const sign = endDir;

      // Lower chin bumper (White/Silver aerodynamic fairing)
      bake('trainWhite', box(CAR_W - 0.10, 0.95, 0.65), [0, 1.05, zNose + sign * 0.32]);
      for (const cs of [-1, 1]) {
        bake('trainWhite', box(0.55, 1.10, 0.65), [cs * (CAR_W / 2 - 0.22), 1.10, zNose + sign * 0.25], [0, cs * sign * 0.55, 0]);
      }

      // Emerald Green Front Livery Mask
      bake('trainGreen', box(CAR_W - 0.15, 0.42, 0.55), [0, 1.70, zNose + sign * 0.36]);

      // Bangladesh National Red Roundel / Winged Center Graphic
      bake('trainRed', cyl(0.32, 0.32, 0.06, 16), [0, 1.70, zNose + sign * 0.64], [Math.PI / 2, 0, 0]);
      bake('trainRed', box(1.30, 0.10, 0.06), [0, 1.70, zNose + sign * 0.63]);

      // Aerodynamic Panoramic Windscreen (Raked back ~16 degrees)
      bake('trainWindowFrame', box(CAR_W - 0.28, 1.05, 0.48), [0, 2.38, zNose + sign * 0.25], [-sign * 0.28, 0, 0]);
      bake('trainGlass', box(CAR_W - 0.42, 0.95, 0.46), [0, 2.38, zNose + sign * 0.27], [-sign * 0.28, 0, 0]);
      bake('trainWindowFrame', box(0.04, 0.95, 0.48), [0, 2.38, zNose + sign * 0.28], [-sign * 0.28, 0, 0]);
      bake('trainWindowFrame', box(0.02, 0.55, 0.48), [sign * 0.45, 2.32, zNose + sign * 0.28], [-sign * 0.28, 0, 0.35]);

      // LED Headlights & Marker Clusters (Left & Right)
      for (const hs of [-1, 1]) {
        const hx = hs * 0.95;
        bake('trainWindowFrame', box(0.38, 0.18, 0.12), [hx, 1.35, zNose + sign * 0.64]);
        bake('trainHeadlight', cyl(0.06, 0.06, 0.04, 12), [hx - hs * 0.08, 1.35, zNose + sign * 0.70], [Math.PI / 2, 0, 0]);
        bake('trainHeadlight', cyl(0.06, 0.06, 0.04, 12), [hx + hs * 0.08, 1.35, zNose + sign * 0.70], [Math.PI / 2, 0, 0]);
        bake('trainTaillight', box(0.06, 0.06, 0.03), [hx + hs * 0.16, 1.35, zNose + sign * 0.69]);
      }

      // Amber Electronic Destination Matrix Display ("UTTARA NORTH" / "MOTIJHEEL")
      bake('trainWindowFrame', box(1.32, 0.28, 0.12), [0, 3.12, zNose + sign * 0.14]);
      bake('trainDest', box(1.22, 0.20, 0.08), [0, 3.12, zNose + sign * 0.18]);

      // Center Shibata Automatic Coupler & Pilot (Cowcatcher)
      bake('bogie', box(0.24, 0.22, 0.75), [0, 0.46, zNose + sign * 0.65]);
      bake('bogie', box(0.36, 0.32, 0.24), [0, 0.46, zNose + sign * 1.02]);
      bake('bogie', box(CAR_W - 0.7, 0.22, 0.35), [0, 0.26, zNose + sign * 0.45]);

      // Driver's Side Windows & External CCTV Cameras
      for (const side of [-1, 1]) {
        bake('trainWindowFrame', box(0.06, 0.75, 0.75), [side * (CAR_W / 2 + 0.01), 2.25, zNose - sign * 0.95]);
        bake('trainGlass', box(0.065, 0.68, 0.68), [side * (CAR_W / 2 + 0.015), 2.25, zNose - sign * 0.95]);
        bake('trainWhite', box(0.12, 0.14, 0.24), [side * (CAR_W / 2 + 0.08), 2.88, zNose - sign * 0.35]);
        bake('trainWindowFrame', cyl(0.03, 0.03, 0.06, 8), [side * (CAR_W / 2 + 0.09), 2.86, zNose - sign * 0.22], [Math.PI / 2, 0, 0]);
      }

      // Non-cab end of end-car
      const backZ = -sign * (CAR_LEN / 2);
      bake('trainBody', box(CAR_W - 0.2, CAR_H - 0.4, 0.08), [0, 1.95, backZ]);
      bake('trainWindowFrame', box(1.15, 2.10, 0.12), [0, 1.70, backZ]);
    }

    // 7. Rooftop Equipment (High-Capacity Kawasaki Dual HVAC Units)
    for (const acZ of [-4.8, 4.8]) {
      bake('trainRoofAC', box(2.15, 0.38, 3.40), [0, 3.82, acZ]);
      for (const es of [-1, 1]) {
        bake('trainRoofAC', box(2.15, 0.32, 0.45), [0, 3.76, acZ + es * 1.80], [es * 0.35, 0, 0]);
      }
      for (const side of [-1, 1]) {
        bake('trainWindowFrame', box(0.04, 0.20, 2.60), [side * 1.09, 3.82, acZ]);
      }
      for (const fanZ of [-0.85, 0.85]) {
        bake('trainWindowFrame', cyl(0.42, 0.42, 0.04, 16), [0, 4.02, acZ + fanZ]);
      }
    }

    // 8. Single-Arm Pantographs (Motor Cars: Cars 1 and 4)
    if (i === 1 || i === 4) {
      const pZ = i === 1 ? -6.8 : 6.8;
      bake('bogie', box(1.60, 0.08, 1.80), [0, 3.75, pZ]);
      for (const ix of [-0.65, 0.65]) {
        for (const iz of [-0.75, 0.75]) {
          bake('trainRed', cyl(0.06, 0.07, 0.16, 8), [ix, 3.84, pZ + iz]);
        }
      }
      bake('trainPantograph', box(0.10, 0.85, 0.10), [0, 4.18, pZ - 0.30], [0.65, 0, 0]);
      bake('trainPantograph', box(0.08, 0.85, 0.08), [0, 4.55, pZ + 0.10], [-0.55, 0, 0]);
      bake('bogie', box(1.80, 0.05, 0.22), [0, 4.88, pZ + 0.45]);
      for (const hs of [-1, 1]) {
        bake('trainPantograph', box(0.04, 0.08, 0.22), [hs * 0.90, 4.84, pZ + 0.45], [0, 0, hs * 0.45]);
      }
    }

    // 9. High-Voltage Roof Cable Conduit
    bake('bogie', cyl(0.025, 0.025, CAR_LEN - 0.8, 6), [0.82, 3.72, 0], [Math.PI / 2, 0, 0]);

    // 10. Fabricated Steel 2-Axle Bogies & Wheelsets (2 per car, at z = -6.5m and +6.5m)
    for (const bz of [-6.5, 6.5]) {
      bake('bogie', box(CAR_W - 0.65, 0.22, 2.70), [0, 0.46, bz]);
      for (const side of [-1, 1]) {
        bake('bogie', box(0.22, 0.28, 2.70), [side * 1.15, 0.46, bz]);
        bake('bogie', cyl(0.20, 0.20, 0.24, 12), [side * 1.05, 0.60, bz]);
      }

      for (const wz of [-1.05, 1.05]) {
        bake('bogie', cyl(0.06, 0.06, 1.55, 8), [0, 0.43, bz + wz], [0, 0, Math.PI / 2]);
        for (const side of [-1, 1]) {
          const wx = side * 0.7175;
          bake('trainWheel', cyl(0.43, 0.43, 0.10, 16), [wx, 0.43, bz + wz], [0, 0, Math.PI / 2]);
          bake('bogie', cyl(0.32, 0.32, 0.11, 12), [wx, 0.43, bz + wz], [0, 0, Math.PI / 2]);
          bake('bogie', box(0.18, 0.24, 0.18), [side * 1.15, 0.43, bz + wz]);
        }
      }
    }

    // 11. Underfloor Equipment Bay (Between bogies, z = -4.2m to +4.2m)
    bake('bogie', box(0.85, 0.50, 2.40), [-0.55, 0.32, -1.8]);
    for (let fz = -2.8; fz <= -0.8; fz += 0.25) {
      bake('trainRoofAC', box(0.02, 0.42, 0.04), [-0.98, 0.32, fz]);
    }
    bake('bogie', box(0.85, 0.50, 1.80), [0.55, 0.32, -1.5]);
    bake('trainRoofAC', cyl(0.20, 0.20, 2.10, 12), [-0.45, 0.35, 1.8], [Math.PI / 2, 0, 0]);
    bake('trainRoofAC', cyl(0.20, 0.20, 2.10, 12), [-0.45, 0.35, 1.3], [Math.PI / 2, 0, 0]);
    bake('bogie', box(0.80, 0.48, 1.90), [0.55, 0.32, 1.6]);

    // 12. Flexible Gangway Bellows between adjacent cars (hollow walk-through collar)
    if (i < CARS - 1) {
      const gZ = CAR_LEN / 2 + GAP / 2;
      const bW = CAR_W - 0.55;
      const bH = CAR_H - 0.45;
      const wallT = 0.30;
      bake('bogie', box(bW, wallT, GAP + 0.08), [0, 2.05 + bH / 2 - wallT / 2, gZ]);
      bake('bogie', box(bW, 0.15, GAP + 0.08), [0, 0.50, gZ]);
      bake('bogie', box(wallT, bH, GAP + 0.08), [-bW / 2 + wallT / 2, 2.05, gZ]);
      bake('bogie', box(wallT, bH, GAP + 0.08), [bW / 2 - wallT / 2, 2.05, gZ]);
    }

    // Level of detail. A car is ~14 meshes, and six trains of six cars were
    // ~500 meshes submitted every frame, most of them kilometres away. Past
    // TRAIN_LOD_RANGE the `detail` group is swapped for ONE merged mesh of the
    // big painted surfaces (vertex-coloured, same steel material as the body,
    // so the shell does not change shade at the swap). The lit parts — window
    // band, head/tail lights, destination board — stay separate and always
    // on, because their glow is what a distant train is at night.
    const detail = new THREE.Group();
    detail.name = `train-detail-${i}`;
    const farParts = [];
    const doorMeshes = [];
    for (const [key, mat] of Object.entries(bucketMat)) {
      const m = mergeBucket(buckets[key], mat, `train-${key}-${i}`);
      if (!m) continue;
      if (TRAIN_ALWAYS_KEYS.has(key)) {
        car.add(m);
        continue;
      }
      detail.add(m);
      if (key.startsWith('trainDoor')) doorMeshes.push(m);
      if (TRAIN_FAR_SKIP_KEYS.has(key)) continue;
      const g = m.geometry.clone();
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let v = 0; v < colors.length; v += 3) {
        colors[v] = mat.color.r;
        colors[v + 1] = mat.color.g;
        colors[v + 2] = mat.color.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      farParts.push(g);
    }
    car.add(detail);
    const far = farParts.length ? new THREE.Mesh(mergeGeometries(farParts, false), MAT.trainFar) : null;
    if (far) {
      far.name = `train-far-${i}`;
      far.visible = false;
      car.add(far);
    }
    farParts.forEach((g) => g.dispose());
    car.userData.doorMeshes = doorMeshes;
    car.userData.lod = { detail, far };

    cars.push(car);
    g.add(car);
  }

  g.userData.cars = cars;
  g.userData.length = CARS * CAR_LEN + (CARS - 1) * GAP;
  return g;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Build the whole metro system.
 * @param {object} scene parsed scene.json
 * @param {(en:string, bn:string, w:number, h:number)=>THREE.Mesh} labelFactory
 * @returns {{ group: THREE.Group, update: (t:number)=>void, stations: object[], stats: object }}
 */
export function buildMetro(scene, labelFactory) {
  const t0 = performance.now();
  const group = new THREE.Group();
  group.name = 'metro';

  const tracks = scene.metro.tracks;
  if (!tracks.length) {
    return { group, update: () => {}, stations: [], stats: { piers: 0, ms: 0 } };
  }

  const centre = centreAlignment(tracks);

  // --- Girder ---------------------------------------------------------------
  {
    const pos = [];
    const nor = [];
    const uv = [];
    const idx = [];
    extrudeTrapezoid(centre, GIRDER_TOP_W, GIRDER_BOTTOM_W, SOFFIT_Y, DECK_Y, pos, nor, uv, idx);
    const m = meshFrom(pos, nor, uv, idx, MAT.concrete, 'viaduct-girder');
    if (m) group.add(m);
  }

  // --- Girder segment joints (P9-PALLABI-REAL, owner Street View item 2) ----
  // The real box girder is precast SEGMENTAL: ~3 m match-cast segments
  // stressed together, and each joint reads from the street as a shallow
  // dark line crossing the soffit and both sides. Ours was a smooth
  // continuous box. Modelled as thin MAT.concreteDark bands pushed a few mm
  // proud of the girder surface — one extra merged mesh for the whole
  // viaduct (not per-building), so this does not touch the facades.js
  // one-atlas/one-material constraint.
  {
    const JOINT_SPACING = 3.1; // metres, typical precast box-girder segment length
    const jointPts = resample(centre, JOINT_SPACING);
    const pos = [];
    const nor = [];
    const uv = [];
    const idx = [];
    const BAND = 0.05; // half-width of the joint line along the girder axis
    const EPS = 0.015; // proud of the surface, avoids z-fighting
    const ht = GIRDER_TOP_W / 2;
    const hb = GIRDER_BOTTOM_W / 2;
    for (const p of jointPts) {
      const px = -p.uz;
      const pz = p.ux;
      // Soffit band: thin strip across the underside, facing down.
      addQuad(pos, nor, uv, idx,
        [p.x + px * hb - p.ux * BAND, SOFFIT_Y - EPS, p.z + pz * hb - p.uz * BAND],
        [p.x - px * hb - p.ux * BAND, SOFFIT_Y - EPS, p.z - pz * hb - p.uz * BAND],
        [p.x - px * hb + p.ux * BAND, SOFFIT_Y - EPS, p.z - pz * hb + p.uz * BAND],
        [p.x + px * hb + p.ux * BAND, SOFFIT_Y - EPS, p.z + pz * hb + p.uz * BAND],
        [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      // Two sloping side bands, following the trapezoid's outer edge.
      for (const side of [-1, 1]) {
        const botX = p.x + px * side * hb;
        const botZ = p.z + pz * side * hb;
        const topX = p.x + px * side * ht;
        const topZ = p.z + pz * side * ht;
        const nx = px * side;
        const nz = pz * side;
        addQuad(pos, nor, uv, idx,
          [botX - p.ux * BAND + nx * EPS, SOFFIT_Y, botZ - p.uz * BAND + nz * EPS],
          [botX + p.ux * BAND + nx * EPS, SOFFIT_Y, botZ + p.uz * BAND + nz * EPS],
          [topX + p.ux * BAND + nx * EPS, DECK_Y, topZ + p.uz * BAND + nz * EPS],
          [topX - p.ux * BAND + nx * EPS, DECK_Y, topZ - p.uz * BAND + nz * EPS],
          [nx, 0, nz], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
    }
    const m = meshFrom(pos, nor, uv, idx, MAT.concreteDark, 'viaduct-girder-joints');
    if (m) group.add(m);
  }

  // --- Under-deck conduits and light fittings (P9-PALLABI-REAL, owner Street
  // View item 3) --------------------------------------------------------------
  // S1 (looking up under the deck) shows conduit/service pipes running the
  // full length of the soffit and light fittings mounted under the deck.
  // Ours was bare. Three galvanised conduit runs (extruded boxes, same
  // technique as the parapet) plus a light fitting every ~9 m using the
  // metro's existing warm downlight material.
  {
    const pos = [];
    const nor = [];
    const uv = [];
    const idx = [];
    const CONDUIT_OFFSETS = [-1.5, -0.15, 1.5]; // metres either side of the girder centreline
    for (const off of CONDUIT_OFFSETS) {
      const line = offsetPolyline(centre, off);
      extrudeBox(line, 0.1, SOFFIT_Y - 0.16, SOFFIT_Y - 0.04, pos, nor, uv, idx);
    }
    const m = meshFrom(pos, nor, uv, idx, MAT.galvanised, 'viaduct-conduits');
    if (m) group.add(m);

    const lightPts = resample(centre, 9);
    if (lightPts.length) {
      const fittingGeo = new THREE.BoxGeometry(0.4, 0.12, 0.22);
      const lensGeo = new THREE.BoxGeometry(0.3, 0.03, 0.16);
      lensGeo.translate(0, -0.075, 0);
      const fittingMesh = new THREE.InstancedMesh(fittingGeo, MAT.steel, lightPts.length);
      const lensMesh = new THREE.InstancedMesh(lensGeo, MAT.downlight, lightPts.length);
      const dummy = new THREE.Object3D();
      lightPts.forEach((p, i) => {
        dummy.position.set(p.x, SOFFIT_Y - 0.06, p.z);
        dummy.rotation.set(0, Math.atan2(p.ux, p.uz), 0);
        dummy.updateMatrix();
        fittingMesh.setMatrixAt(i, dummy.matrix);
        lensMesh.setMatrixAt(i, dummy.matrix);
      });
      fittingMesh.instanceMatrix.needsUpdate = true;
      lensMesh.instanceMatrix.needsUpdate = true;
      group.add(fittingMesh, lensMesh);
    }
  }

  // Parapets, both edges.
  {
    const isInsideStationPlatform = (px, pz, margin = 2) =>
      scene.metro.stations.some((st) => Math.hypot(px - st.x, pz - st.z) < PLATFORM_LEN / 2 + margin);
    const isInsideStationConcourse = (px, pz, margin = 2) =>
      scene.metro.stations.some((st) => Math.hypot(px - st.x, pz - st.z) < CONCOURSE_LEN / 2 + margin);

    const pos = [];
    const nor = [];
    const uv = [];
    const idx = [];
    for (const side of [-1, 1]) {
      const off = offsetPolyline(centre, side * (GIRDER_TOP_W / 2 - PARAPET_T / 2));
      let seg = [];
      for (const pt of off) {
        if (!isInsideStationPlatform(pt[0], pt[1])) {
          seg.push(pt);
        } else {
          if (seg.length >= 2) extrudeBox(seg, PARAPET_T, DECK_Y, DECK_Y + PARAPET_H, pos, nor, uv, idx);
          seg = [];
        }
      }
      if (seg.length >= 2) extrudeBox(seg, PARAPET_T, DECK_Y, DECK_Y + PARAPET_H, pos, nor, uv, idx);
    }
    const m = meshFrom(pos, nor, uv, idx, MAT.concreteDark, 'viaduct-parapet');
    if (m) group.add(m);
  }

  // --- Piers ------------------------------------------------------------------
  const allPierPts = resample(centre, PIER_SPACING);
  const pierPts = allPierPts.filter((p) => !scene.metro.stations.some((st) => Math.hypot(p.x - st.x, p.z - st.z) < CONCOURSE_LEN / 2));
  {
    const shaft = pierShaftGeometry(2.0, 1.6, SOFFIT_Y - 1.6);
    const shaftMesh = new THREE.InstancedMesh(shaft, MAT.concrete, pierPts.length);
    const cap = pierCapGeometry(2.0, 1.6, GIRDER_BOTTOM_W, 1.6, 1.6);
    const capMesh = new THREE.InstancedMesh(cap, MAT.concreteDark, pierPts.length);
    const base = new THREE.BoxGeometry(3.4, 0.5, 2.8);
    base.translate(0, 0.25, 0);
    const baseMesh = new THREE.InstancedMesh(base, MAT.concreteDark, pierPts.length);

    const dummy = new THREE.Object3D();
    pierPts.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, Math.atan2(p.ux, p.uz), 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      shaftMesh.setMatrixAt(i, dummy.matrix);
      baseMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.y = SOFFIT_Y - 1.6;
      dummy.updateMatrix();
      capMesh.setMatrixAt(i, dummy.matrix);
    });
    shaftMesh.instanceMatrix.needsUpdate = true;
    capMesh.instanceMatrix.needsUpdate = true;
    baseMesh.instanceMatrix.needsUpdate = true;
    shaftMesh.castShadow = true;
    capMesh.castShadow = true;
    group.add(shaftMesh, capMesh, baseMesh);
  }

  // Streetlight poles and OCS masts only sit on the open viaduct parapet, not inside stations
  const isInsideStation = (px, pz, margin = 2) =>
    scene.metro.stations.some((st) => Math.hypot(px - st.x, pz - st.z) < PLATFORM_LEN / 2 + margin);
  const parapetPierPts = pierPts.filter((p) => !isInsideStation(p.x, p.z));

  // --- Streetlight poles on the parapet, every span --------------------------
  {
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.09, 3.4, 6);
    poleGeo.translate(0, 1.7, 0);
    const lampGeo = new THREE.BoxGeometry(0.35, 0.15, 0.2);
    lampGeo.translate(0, 3.35, 0.12);
    const poleMesh = new THREE.InstancedMesh(poleGeo, MAT.galvanised, parapetPierPts.length * 2);
    const lampMesh = new THREE.InstancedMesh(lampGeo, MAT.steel, parapetPierPts.length * 2);
    const dummy = new THREE.Object3D();
    let i = 0;
    for (const p of parapetPierPts) {
      const heading = Math.atan2(p.ux, p.uz);
      for (const side of [-1, 1]) {
        const off = offsetPolyline([[p.x, p.z]], side * (GIRDER_TOP_W / 2 - 0.2))[0];
        dummy.position.set(off[0], DECK_Y + PARAPET_H, off[1]);
        dummy.rotation.set(0, heading, 0);
        dummy.updateMatrix();
        poleMesh.setMatrixAt(i, dummy.matrix);
        lampMesh.setMatrixAt(i, dummy.matrix);
        i++;
      }
    }
    poleMesh.instanceMatrix.needsUpdate = true;
    lampMesh.instanceMatrix.needsUpdate = true;
    group.add(poleMesh, lampMesh);
  }

  // --- Catenary: OCS masts on BOTH parapets, cantilever arms, portal ---------
  // gantries every 5th mast, rigid conductor bar (ADDED 20:20 item D, owner
  // second batch Q6-Q9: "galvanised light-grey masts every ~30 m on BOTH
  // parapets, each with a cantilever arm over its track; rigid conductor
  // bar; at intervals the two masts are joined by a cross-beam (portal)").
  // Was: masts on ONE side only, no portals, a thin Line for the wire.
  {
    const mastGeo = new THREE.CylinderGeometry(0.09, 0.12, 4.4, 8);
    mastGeo.translate(0, 2.2, 0);
    const armGeo = new THREE.BoxGeometry(1.6, 0.08, 0.08);
    armGeo.translate(0.8, 4.3, 0);
    const n = parapetPierPts.length;
    const mastMesh = new THREE.InstancedMesh(mastGeo, MAT.galvanised, n * 2);
    const armMesh = new THREE.InstancedMesh(armGeo, MAT.galvanised, n * 2);
    const dummy = new THREE.Object3D();
    let inst = 0;
    const mastEdgeOffsets = []; // world-space mast base per pier per side, for the portal beams
    parapetPierPts.forEach((p) => {
      const heading = Math.atan2(p.ux, p.uz);
      const row = [];
      for (const side of [-1, 1]) {
        // Arm always reaches back IN over its own track (mirrored per side).
        const off = offsetPolyline([[p.x, p.z]], side * (GIRDER_TOP_W / 2 - 0.25))[0];
        dummy.position.set(off[0], DECK_Y + PARAPET_H, off[1]);
        dummy.rotation.set(0, heading + (side > 0 ? Math.PI : 0), 0);
        dummy.updateMatrix();
        mastMesh.setMatrixAt(inst, dummy.matrix);
        armMesh.setMatrixAt(inst, dummy.matrix);
        inst++;
        row.push({ x: off[0], z: off[1], heading });
      }
      mastEdgeOffsets.push(row);
    });
    mastMesh.instanceMatrix.needsUpdate = true;
    armMesh.instanceMatrix.needsUpdate = true;
    group.add(mastMesh, armMesh);

    // Portal gantry every 5th mast: a cross-beam joining the two mast tops.
    {
      const pos = [];
      const nor = [];
      const uv = [];
      const idx = [];
      for (let i = 0; i < mastEdgeOffsets.length; i += 5) {
        const [a, b] = mastEdgeOffsets[i];
        extrudeBox([[a.x, a.z], [b.x, b.z]], 0.12, DECK_Y + 4.5, DECK_Y + 4.62, pos, nor, uv, idx);
      }
      const portalMesh = meshFrom(pos, nor, uv, idx, MAT.galvanised, 'ocs-portals');
      if (portalMesh) group.add(portalMesh);
    }

    // Rigid conductor bar, one per track (was a single centreline Line) —
    // a real extruded bar mesh instead of a THREE.Line, merged both tracks
    // into one draw call.
    {
      const pos = [];
      const nor = [];
      const uv = [];
      const idx = [];
      for (const off of [-TRACK_GAUGE_OFFSET, TRACK_GAUGE_OFFSET]) {
        const line = offsetPolyline(centre, off);
        extrudeBox(line, 0.1, DECK_Y + 5.34, DECK_Y + 5.46, pos, nor, uv, idx);
      }
      const barMesh = meshFrom(pos, nor, uv, idx, MAT.rail, 'conductor-bar');
      if (barMesh) group.add(barMesh);
    }
  }

  // --- Track: twin ballastless plinths, rails at 1.435 m gauge ---------------
  const trackLines = [
    offsetPolyline(centre, -TRACK_GAUGE_OFFSET),
    offsetPolyline(centre, TRACK_GAUGE_OFFSET),
  ];
  {
    const pos = [];
    const nor = [];
    const uv = [];
    const idx = [];
    for (const line of trackLines) {
      extrudeBox(line, 2.2, DECK_Y, DECK_Y + 0.22, pos, nor, uv, idx);
      for (const rs of [-GAUGE / 2, GAUGE / 2]) {
        const rail = offsetPolyline(line, rs);
        extrudeBox(rail, 0.12, DECK_Y + 0.22, DECK_Y + 0.36, pos, nor, uv, idx);
      }
    }
    const m = meshFrom(pos, nor, uv, idx, MAT.rail, 'metro-track');
    if (m) group.add(m);
  }

  // --- Stations ---------------------------------------------------------------
  const stationList = [];
  const doorRegistry = new Map(); // stationName -> { '-1': {mesh,leaves,bayZs}, '1': {...} }, for setPlatformDoors/platformDoorBays
  for (const st of scene.metro.stations) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 1; i < centre.length; i++) {
      const d = (centre[i][0] - st.x) ** 2 + (centre[i][1] - st.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const a = centre[Math.max(0, best - 1)];
    const b = centre[Math.min(centre.length - 1, best + 1)];
    const heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const onLine = closestOnPolyline(centre, st.x, st.z) || [st.x, st.z];

    const legCount = /10/.test(st.name) ? 4 : 2;
    const s = buildStation(st.name, st.bn, onLine[0], onLine[1], heading, legCount, labelFactory, scene.buildings);
    group.add(s);

    // Build-time footprint assertion (NEXT-PASS-METRO D14): no station child
    // may extend beyond the station's own footprint (+/-110 m along the
    // track, +/-40 m across) in the station's own local (unrotated) frame,
    // i.e. before g.position/g.rotation.y are applied. Anything that fails
    // this is either overhanging the carriageway/shopfronts or is the kind
    // of degenerate box that produced the D12 stray-plane regression.
    const box3 = new THREE.Box3();
    const childBox = new THREE.Box3();
    for (const child of s.children) {
      if (!child.geometry) continue;
      child.geometry.computeBoundingBox();
      childBox.copy(child.geometry.boundingBox);
      childBox.applyMatrix4(child.matrix);
      if (!isFinite(childBox.min.x) || !isFinite(childBox.max.x)) {
        console.warn(`[metro] ${child.name || '(unnamed)'} at ${st.name} has a non-finite bounding box`);
        continue;
      }
      box3.union(childBox);
      const overAcross = Math.max(Math.abs(childBox.min.x), Math.abs(childBox.max.x)) > 40;
      const overAlong = Math.max(Math.abs(childBox.min.z), Math.abs(childBox.max.z)) > 110;
      if (overAcross || overAlong) {
        console.warn(
          `[metro] ${child.name || '(unnamed)'} at ${st.name} exceeds the station footprint ` +
          `(local bbox x:[${childBox.min.x.toFixed(1)},${childBox.max.x.toFixed(1)}] ` +
          `z:[${childBox.min.z.toFixed(1)},${childBox.max.z.toFixed(1)}], limit +/-40 across, +/-110 along)`
        );
      }
    }

    stationList.push({ ...st, x: onLine[0], z: onLine[1], heading, entrances: s.userData.entrances || [] });
    doorRegistry.set(st.name, s.userData.doorLeaves || {});
  }

  // --- Trains -------------------------------------------------------------
  const cum0 = buildDistanceTable(trackLines[0]);
  const cum1 = buildDistanceTable(trackLines[1]);
  const total = cum0[cum0.length - 1];

  const getStopDistances = (line, cum) =>
    stationList.map((s) => {
      let bestD = Infinity;
      let bestDist = 0;
      for (let i = 1; i < line.length; i++) {
        const p = line[i];
        const d = (p[0] - s.x) ** 2 + (p[1] - s.z) ** 2;
        if (d < bestD) {
          bestD = d;
          bestDist = cum[i];
        }
      }
      return bestDist;
    });

  const stopDistances0 = getStopDistances(trackLines[0], cum0);
  const stopDistances1 = getStopDistances(trackLines[1], cum1);

  // P11-K bug 1 (advisor-measured): `scene.metro.stations` — and therefore
  // `stationList`/the `stations` this function returns — comes back in
  // SCENE-FILE order (['Mirpur 10','Pallabi','Uttara South','Mirpur 11'] in
  // scene-north.json), which is arbitrary data-entry order, not geographic
  // order. stationOrder is station NAMES sorted ascending by distance-along-track
  // (the one true "next stop" sequence for northbound trains).
  const stationOrder = stationList
    .map((s, i) => ({ name: s.name, dist: stopDistances0[i] }))
    .sort((a, b) => a.dist - b.dist)
    .map((o) => o.name);

  // --- Train fleet: 6 trains (3 per physical rail/direction, matching the 2 real tracks),
  // offsets spread evenly over that rail's own dwell-inclusive cycle time.
  const TRAINS_PER_LINE = 3;
  const trainLines = [
    { line: trackLines[0], cum: cum0, dir: 1, stopDistances: stopDistances0 },
    { line: trackLines[1], cum: cum1, dir: -1, stopDistances: stopDistances1 },
  ];

  const EASE_BONUS = 5.0; // s extra per segment for realistic train acceleration & braking

  function smoothTrapezoidDist(t, T, L) {
    if (t <= 0) return 0;
    if (t >= T) return L;
    const tEase = Math.min(5.0, T * 0.25);
    const V_max = L / Math.max(0.1, T - tEase);
    function intSmoothstep(x) {
      const c = Math.max(0, Math.min(1, x));
      return c * c * c - 0.5 * c * c * c * c;
    }
    if (t < tEase) {
      return V_max * tEase * intSmoothstep(t / tEase);
    } else if (t <= T - tEase) {
      return V_max * tEase * 0.5 + V_max * (t - tEase);
    } else {
      const x = (t - (T - tEase)) / tEase;
      return V_max * tEase * 0.5 + V_max * (T - 2 * tEase) + V_max * tEase * (x - intSmoothstep(x));
    }
  }

  function calcCycleDuration(stopDistances, totalLen) {
    const sorted = [...stopDistances].sort((a, b) => a - b);
    let total = 0;
    let cur = 0;
    for (const sd of sorted) {
      const L = sd - cur;
      total += L / SPEED + (L > 60 ? EASE_BONUS : 0) + DWELL;
      cur = sd;
    }
    const L = totalLen - cur;
    total += L / SPEED + (L > 60 ? EASE_BONUS : 0);
    return total;
  }

  const trains = [];
  // Optional presentation override used only by the opening cinematic. It
  // reuses a real train object and the real track sampling, so the hero shot
  // always shows an actual Line 6 train entering a real station envelope.
  let cinematicTrain = null;
  let latestElapsed = 0;
  for (const tl of trainLines) {
    const lineTotal = tl.cum[tl.cum.length - 1];
    const cycle = calcCycleDuration(tl.stopDistances, lineTotal);
    for (let k = 0; k < TRAINS_PER_LINE; k++) {
      const t = buildTrain();
      t.position.y = DECK_Y + TRAIN_Y_OFFSET;
      group.add(t);
      trains.push({
        obj: t,
        line: tl.line,
        cum: tl.cum,
        dir: tl.dir,
        stopDistances: tl.stopDistances,
        offset: (k * cycle) / TRAINS_PER_LINE,
        lineIndex: trainLines.indexOf(tl),
      });
    }
  }

  // Distance-driven detail (see TRAIN_LOD_RANGE / STATION_DETAIL_RANGE).
  const stationDetail = [];
  group.traverse((obj) => {
    if (!obj.name || !obj.name.startsWith('station:')) return;
    const parts = obj.children.filter((c) => STATION_DETAIL_PREFIXES.some((prefix) => c.name.startsWith(`${prefix}:`)));
    if (parts.length) stationDetail.push({ x: obj.position.x, z: obj.position.z, parts, shown: true });
  });
  const _trainPos = new THREE.Vector3();
  let detailScale = 1; // 0.5..1, from the perf governor's detail stage
  function updateDetail(viewPos) {
    const STATION_RANGE = STATION_DETAIL_RANGE * detailScale;
    const TRAIN_RANGE = TRAIN_LOD_RANGE * detailScale;
    for (const st of stationDetail) {
      const d = Math.hypot(st.x - viewPos.x, st.z - viewPos.z);
      // 10% hysteresis so standing on the boundary cannot flicker.
      const show = st.shown ? d < STATION_RANGE * 1.1 : d < STATION_RANGE;
      if (show === st.shown) continue;
      st.shown = show;
      for (const part of st.parts) part.visible = show;
    }
    for (const tr of trains) {
      const cars = tr.obj.userData.cars;
      if (!cars) continue;
      tr.obj.getWorldPosition(_trainPos);
      const d = Math.hypot(_trainPos.x - viewPos.x, _trainPos.z - viewPos.z);
      const near = tr.lodNear === false ? d < TRAIN_RANGE : d < TRAIN_RANGE * 1.1;
      if (near === tr.lodNear) continue;
      tr.lodNear = near;
      for (const car of cars) {
        const lod = car.userData.lod;
        if (!lod || !lod.far) continue;
        lod.detail.visible = near;
        lod.far.visible = !near;
      }
    }
  }

  /** @param {number} elapsed @param {{x: number, z: number} | null} [viewPos] camera, for level of detail */
  function update(elapsed, viewPos = null) {
    latestElapsed = elapsed;
    if (viewPos) updateDetail(viewPos);
    for (const tr of trains) {
      const totalLen = tr.cum[tr.cum.length - 1];
      const cycle = calcCycleDuration(tr.stopDistances, totalLen);
      let tt = (elapsed + tr.offset) % cycle;

      let d = 0;
      if (tr.dir > 0) {
        let dist = 0;
        const ordered = [...tr.stopDistances].sort((a, b) => a - b);
        let arrived = false;
        for (const sd of ordered) {
          const L = sd - dist;
          const travelTime = L / SPEED + (L > 60 ? EASE_BONUS : 0);
          if (tt < travelTime) {
            d = dist + smoothTrapezoidDist(tt, travelTime, L);
            arrived = true;
            break;
          }
          tt -= travelTime;
          dist = sd;
          if (tt < DWELL) {
            d = sd;
            arrived = true;
            break;
          }
          tt -= DWELL;
        }
        if (!arrived) {
          const L = totalLen - dist;
          const travelTime = L / SPEED + (L > 60 ? EASE_BONUS : 0);
          d = dist + smoothTrapezoidDist(tt, travelTime, L);
        }
      } else {
        let dist = totalLen;
        const ordered = [...tr.stopDistances].sort((a, b) => b - a);
        let arrived = false;
        for (const sd of ordered) {
          const L = dist - sd;
          const travelTime = L / SPEED + (L > 60 ? EASE_BONUS : 0);
          if (tt < travelTime) {
            d = dist - smoothTrapezoidDist(tt, travelTime, L);
            arrived = true;
            break;
          }
          tt -= travelTime;
          dist = sd;
          if (tt < DWELL) {
            d = sd;
            arrived = true;
            break;
          }
          tt -= DWELL;
        }
        if (!arrived) {
          const L = dist;
          const travelTime = L / SPEED + (L > 60 ? EASE_BONUS : 0);
          d = dist - smoothTrapezoidDist(tt, travelTime, L);
        }
      }

      const s = sampleAt(tr.line, tr.cum, d, true);
      tr.obj.position.set(s.x, DECK_Y + TRAIN_Y_OFFSET, s.z);
      const trainHeading = s.heading + (tr.dir > 0 ? 0 : Math.PI);
      tr.obj.rotation.y = trainHeading;
      tr.obj.updateMatrixWorld(true);

      const prevD = tr.lastD;
      const prevElapsed = tr.lastElapsed;
      tr.lastD = d;
      tr.lastElapsed = elapsed;
      if (prevElapsed !== undefined && elapsed > prevElapsed) {
        const dt = elapsed - prevElapsed;
        let deltaD = Math.abs(d - prevD);
        if (deltaD > totalLen * 0.5) deltaD = Math.max(0, totalLen - deltaD);
        const rawSpeed = deltaD / dt;
        const targetSpeed = rawSpeed > SPEED * 2 ? 0 : rawSpeed;
        tr.speed = tr.speed !== undefined ? tr.speed + (targetSpeed - tr.speed) * Math.min(1, dt * 8) : targetSpeed;
      } else {
        tr.speed = tr.speed || 0;
      }

      if (tr.obj.userData.cars) {
        const _carWorld = new THREE.Vector3();
        for (let i = 0; i < tr.obj.userData.cars.length; i++) {
          const car = tr.obj.userData.cars[i];
          const carOffset = (i - (tr.obj.userData.cars.length - 1) / 2) * (TRAIN_CAR_LEN + TRAIN_CAR_GAP);
          const carD = d + carOffset * tr.dir;
          const cs = sampleAt(tr.line, tr.cum, carD, true);
          const carHeading = cs.heading + (tr.dir > 0 ? 0 : Math.PI);

          _carWorld.set(cs.x, DECK_Y + TRAIN_Y_OFFSET, cs.z);
          tr.obj.worldToLocal(_carWorld);
          car.position.copy(_carWorld);

          let lyaw = carHeading - trainHeading;
          while (lyaw > Math.PI) lyaw -= 2 * Math.PI;
          while (lyaw < -Math.PI) lyaw += 2 * Math.PI;
          car.rotation.y = lyaw;
        }
      }
    }

    if (cinematicTrain) {
      if (cinematicTrain.startTime == null) cinematicTrain.startTime = elapsed;
      const tr = trains[cinematicTrain.index] || trains[0];
      const stationIndex = stationList.findIndex((s) => s.name === cinematicTrain.stationName);
      if (tr && stationIndex >= 0) {
        const stopD = tr.stopDistances[stationIndex];
        const approach = cinematicTrain.approach ?? 150;
        const u = Math.max(0, Math.min(1, (elapsed - cinematicTrain.startTime) / (cinematicTrain.duration ?? 3.8)));
        const remaining = approach + ((cinematicTrain.endApproach ?? 0) - approach) * u;
        const d = tr.dir > 0 ? stopD - remaining : stopD + remaining;
        tr.speed = u < 1 ? Math.abs(approach - (cinematicTrain.endApproach ?? 0)) / (cinematicTrain.duration ?? 3.8) : 0;
        const s = sampleAt(tr.line, tr.cum, d, true);
        tr.obj.position.set(s.x, DECK_Y + TRAIN_Y_OFFSET, s.z);
        tr.obj.rotation.y = s.heading + (tr.dir > 0 ? 0 : Math.PI);
        tr.obj.updateMatrixWorld(true);
        // Rebuild each car's local pose for the staged distance as well. The
        // normal fleet update has already posed them once, but leaving those
        // old local transforms in place makes a staged train appear to bend
        // or enter the platform sideways.
        if (tr.obj.userData.cars) {
          const carWorld = new THREE.Vector3();
          const trainHeading = tr.obj.rotation.y;
          tr.obj.userData.cars.forEach((car, i) => {
            const carOffset = (i - (tr.obj.userData.cars.length - 1) / 2) * (TRAIN_CAR_LEN + TRAIN_CAR_GAP);
            const carD = d + carOffset * tr.dir;
            const cs = sampleAt(tr.line, tr.cum, carD, true);
            const carHeading = cs.heading + (tr.dir > 0 ? 0 : Math.PI);
            carWorld.set(cs.x, DECK_Y + TRAIN_Y_OFFSET, cs.z);
            tr.obj.worldToLocal(carWorld);
            car.position.copy(carWorld);
            let localYaw = carHeading - trainHeading;
            while (localYaw > Math.PI) localYaw -= Math.PI * 2;
            while (localYaw < -Math.PI) localYaw += Math.PI * 2;
            car.rotation.y = localYaw;
          });
        }
      }
    }
  }

  // --- Timetable (src/platform-boards.js) ------------------------------------
  // update() above is a PURE function of `elapsed`: a train's place in its
  // cycle is (elapsed + offset) % cycle, walked through the same run times and
  // dwells every lap, and nothing anywhere holds a train or edits an offset.
  // So an arrival is not predicted, it is computed: `arriveAt` is the phase at
  // which update() first puts the train at rest at each stop, built with the
  // identical arithmetic (run = L / SPEED, + EASE_BONUS over 60 m, then DWELL).
  // If update()'s timing ever changes, change this with it.
  const timetable = trainLines.map((tl, lineIndex) => {
    const totalLen = tl.cum[tl.cum.length - 1];
    const ordered = tl.stopDistances
      .map((sd, stationIndex) => ({ sd, stationIndex }))
      .sort((a, b) => (tl.dir > 0 ? a.sd - b.sd : b.sd - a.sd));
    const arriveAt = new Array(stationList.length).fill(null);
    const side = new Array(stationList.length).fill(0);
    let phase = 0;
    let dist = tl.dir > 0 ? 0 : totalLen;
    for (const { sd, stationIndex } of ordered) {
      const L = Math.abs(sd - dist);
      phase += L / SPEED + (L > 60 ? EASE_BONUS : 0);
      arriveAt[stationIndex] = phase;
      phase += DWELL;
      dist = sd;
      // Which platform this rail runs past, in the station's own frame (+x or -x).
      const st = stationList[stationIndex];
      const at = sampleAt(tl.line, tl.cum, sd, true);
      side[stationIndex] = Math.sign((at.x - st.x) * Math.cos(st.heading) - (at.z - st.z) * Math.sin(st.heading)) || 1;
    }
    // North is -z on every district map: that is the Uttara North end of Line 6.
    const from = sampleAt(tl.line, tl.cum, tl.dir > 0 ? 0 : totalLen, true);
    const to = sampleAt(tl.line, tl.cum, tl.dir > 0 ? totalLen : 0, true);
    return { lineIndex, dir: tl.dir, cycle: calcCycleDuration(tl.stopDistances, totalLen), arriveAt, side, northbound: to.z < from.z, offsets: [] };
  });
  for (const tr of trains) timetable[tr.lineIndex].offsets.push(tr.offset);

  /**
   * Seconds until each of the next `count` arrivals on one rail at one station,
   * soonest first. A train standing at the platform right now is `eta: 0` with
   * `departsIn` seconds of dwell left. Exact (see above), allocation is the
   * result array only.
   * @param {number} stationIndex index into `stations` @param {number} lineIndex 0 or 1
   * @returns {{ eta: number, departsIn: number }[]}
   */
  function arrivals(stationIndex, lineIndex, elapsed, count = 4) {
    const line = timetable[lineIndex];
    const at = line?.arriveAt[stationIndex];
    if (at == null) return [];
    const out = [];
    for (const offset of line.offsets) {
      const phase = (elapsed + offset) % line.cycle;
      const since = ((phase - at) % line.cycle + line.cycle) % line.cycle; // s since this train last stopped here
      if (since < DWELL) out.push({ eta: 0, departsIn: DWELL - since });
      // Its next stop here, and the one after: four rows can need more than one lap of a three-train rail.
      for (let lap = 1; lap <= 2; lap++) out.push({ eta: line.cycle * lap - since, departsIn: 0 });
    }
    out.sort((a, b) => a.eta - b.eta);
    out.length = Math.min(out.length, count);
    return out;
  }

  function setCinematicTrain(options = null) {
    cinematicTrain = options ? { ...options, startTime: null } : null;
    // The opening has one readable hero subject. Hide the rest of the fleet
    // for those few seconds so two services cannot arrive on top of each
    // other in the same station shot.
    trains.forEach((tr, i) => {
      tr.obj.visible = !options || i === (options.index ?? 0);
    });
    if (options) update(latestElapsed);
  }

  // --- Platform screen door control (P11-I item 1 contract) -----------------
  // Exported exactly per the brief so src/stationlife.js (a concurrent
  // executor) can drive doors without reaching into metro.js internals:
  //   setPlatformDoors(stationName, side, amount01)   // 0 = shut, 1 = open
  //   platformDoorBays(stationName, side) -> [localZ, ...]
  const doorDummy = new THREE.Object3D();
  function setPlatformDoors(stationName, side, amount01) {
    const reg = doorRegistry.get(stationName);
    const sideData = reg && reg[side];
    if (!sideData || !sideData.mesh) return;
    const amt = Math.max(0, Math.min(1, amount01));
    for (const leaf of sideData.leaves) {
      const z = leaf.closedZ + (leaf.openZ - leaf.closedZ) * amt;
      doorDummy.position.set(leaf.x, leaf.y, z);
      doorDummy.updateMatrix();
      sideData.mesh.setMatrixAt(leaf.index, doorDummy.matrix);
    }
    sideData.mesh.instanceMatrix.needsUpdate = true;
  }
  function platformDoorBays(stationName, side) {
    const reg = doorRegistry.get(stationName);
    const sideData = reg && reg[side];
    return sideData ? sideData.bayZs.slice() : [];
  }

  return {
    group,
    update,
    setDetailScale(scale) { detailScale = scale; },
    stations: stationList,
    stationOrder, // P11-K bug 1: station NAMES sorted ascending by distance-along-track (NOT scene-file order) — the one true "next stop" sequence, see the comment above
    setPlatformDoors,
    platformDoorBays,
    trains, // read-only view: [{obj, line, cum, dir, offset}, ...] per the P11-I contract
    setCinematicTrain,
    centre,
    piers: pierPts, // [{x, z, ux, uz}] shaft centres and track direction, for street-clutter.js's posters
    timetable, // per rail: cycle, arrival phase and platform side per station, which end it runs to
    arrivals,
    stats: {
      piers: pierPts.length,
      trackLength: Math.round(total),
      stations: stationList.length,
      drawCalls: group.children.length,
      ms: Math.round(performance.now() - t0),
    },
  };
}

/**
 * Register the elevated viaduct track bed as solid walkable surfaces,
 * plus outer parapet collision walls so the player can stand, walk, and stay
 * solidly on the metro tracks anywhere along the entire corridor.
 */
export function registerViaductWalkable(centre, walkable, collision, stations) {
  if (!centre || !centre.length || !walkable) return;

  const TRACK_Y = DECK_Y + 0.22; // 14.72 m — top of ballast plinths / track surface
  const HALF_W = GIRDER_TOP_W / 2 - 0.2; // 4.65 m clear width
  const SLAB_SPACING = 10; // m per slice

  // 1. Walkable slabs for the entire viaduct deck/tracks
  for (let i = 1; i < centre.length; i++) {
    const a = centre[i - 1];
    const b = centre[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;

    const steps = Math.max(1, Math.ceil(len / SLAB_SPACING));
    const stepLen = len / steps;
    const ux = dx / len;
    const uz = dz / len;
    const rot = -Math.atan2(ux, uz);

    for (let s = 0; s < steps; s++) {
      const midDist = (s + 0.5) * stepLen;
      const cx = a[0] + ux * midDist;
      const cz = a[1] + uz * midDist;
      walkable.slab(TRACK_Y, cx, cz, HALF_W, stepLen / 2 + 0.4, rot);
    }
  }

  // 2. Parapet collision walls along both outer edges
  if (collision && typeof collision.addSegments === 'function') {
    const wallSegs = [];
    const parapetOff = GIRDER_TOP_W / 2 - PARAPET_T / 2;
    for (const side of [-1, 1]) {
      const parapetLine = offsetPolyline(centre, side * parapetOff);
      for (let i = 1; i < parapetLine.length; i++) {
        const p1 = parapetLine[i - 1];
        const p2 = parapetLine[i];
        const midX = (p1[0] + p2[0]) / 2;
        const midZ = (p1[1] + p2[1]) / 2;
        const inStation = stations && stations.some(
          (st) => Math.hypot(midX - st.x, midZ - st.z) < PLATFORM_LEN / 2
        );
        if (!inStation) {
          // Banded between DECK_Y - 0.5 (14.0 m) and DECK_Y + PARAPET_H + 1.5 (17.2 m)
          wallSegs.push([p1[0], p1[1], p2[0], p2[1], DECK_Y - 0.5, DECK_Y + PARAPET_H + 1.5]);
        }
      }
    }
    if (wallSegs.length) {
      collision.addSegments(wallSegs);
    }
  }

  // 3. Station platform-to-track transitional step slabs
  if (stations && stations.length) {
    for (const st of stations) {
      const c = Math.cos(st.heading);
      const s = Math.sin(st.heading);
      // Step slab along each platform edge so player can step up/down seamlessly
      // Height 15.10 m is halfway between track (14.72 m) and platform (15.48 m)
      for (const side of [-1, 1]) {
        const lx = side * 3.4;
        const wx = st.x + lx * c;
        const wz = st.z - lx * s;
        walkable.slab(15.10, wx, wz, 0.6, PLATFORM_LEN / 2, -st.heading);
      }
    }
  }
}
