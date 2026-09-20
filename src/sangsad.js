/**
 * sangsad.js
 *
 * Jatiya Sangsad Bhaban — the National Parliament House of Bangladesh,
 * designed by Louis I. Kahn, completed 1982 — hand-modelled, because it is
 * the reason the Bijoy Sarani district exists at all.
 *
 * Why this is not left to city.js
 * -------------------------------
 * city.js extrudes an OSM footprint into a flat-topped box wearing one cell
 * of a shared facade atlas. Applied here that produces a grey slab, which is
 * a worse-than-nothing depiction of the most architecturally significant
 * building in the country. So main.js excludes this footprint's OSM ids from
 * the procedural pass (`excludeIds`) and calls buildSangsad() instead.
 *
 * What is real and what is interpretation — stated plainly
 * --------------------------------------------------------
 * REAL, straight out of public/scene-bijoy.json (OSM relation 18085267,
 * traced from aerial imagery, ODbL):
 *   - the outer ring of the nine peripheral blocks: 177 points, 849 m of
 *     perimeter, 150 m x 174 m, 14,336 m^2 of floorplate;
 *   - its 14 interior voids — the light courts between the blocks, and the
 *     large central void the assembly chamber stands in;
 *   - the separate central chamber block (947 m^2);
 *   - position, in the same metric frame as everything else in this game;
 *   - the two lake polygons this file now draws a retaining wall along
 *     ("Cresent Lake", "Shangsad bhaban Lake" in scene.areas) — their shape
 *     is read straight out of the scene, not invented;
 *   - the overall HEIGHT: 37.7 m, from Google Open Buildings 2.5D Temporal
 *     via tools/fetch-heights.mjs, sampled over 44,405 pixels of this
 *     footprint — the densest sample in the entire extract. Read off the
 *     scene record at build time, never hardcoded here.
 *     Caveat, stated because it changes what the number means:
 *     build-scene.mjs feeds the raster's MAX to the scene, so 37.7 m is the
 *     tallest thing standing anywhere on this footprint — the crown — not
 *     the roofline of the peripheral blocks. The same raster record puts
 *     p50 at 18 m, p75 at 23 m and p90 at 27.5 m, which is the blocks.
 *     applyVerticalScheme() below splits the one number the scene can carry
 *     back out along those measured proportions.
 * Nothing in this file moves, rounds or prettifies any of that.
 *
 * INTERPRETED here, from the building as it is publicly and famously known
 * (no proprietary drawings were used, and none are shipped):
 *   - the PROPORTIONS of the vertical scheme — which fraction of the
 *     measured height each level sits at (see applyVerticalScheme). The
 *     height itself is measured; only the split between block roofline,
 *     recessed mass and drum is inferred, and it is inferred FROM the
 *     raster's own percentile profile rather than from taste.
 *     (An earlier pass took 27 m from OSM way 24448328's building:levels=8.
 *     That was wrong twice over: the scene emits the RELATION, which carries
 *     no levels tag at all, and a storey count was never a height.)
 *   - Kahn's signature outer screen walls, pierced by enormous primary
 *     geometry — full circles, inverted triangles, tall slots — one opening
 *     per major straight run of the real perimeter. Which shape lands on
 *     which face is derived from that face's own length (see OPENINGS), not
 *     copied from the building; the LANGUAGE is the building's, the
 *     ARRANGEMENT is this file's. The openings are sized large (Kahn's
 *     circles fill most of their bay) rather than window-like.
 *   - the recessed glazing plane set well behind each opening, and the
 *     ~1.1 m deep reveal the screen thickness gives it — a dark glazed
 *     plane is not documented per-opening anywhere; it is the generic,
 *     obviously-true statement that there is glass behind the screen.
 *   - the white marble banding on grey board-formed concrete: real
 *     practice, painted here as a procedural stripe texture, now at ~3 m
 *     spacing with the board-form grain suppressed so the horizontal bands
 *     read as the dominant pattern at street distance instead of a panel
 *     joint grid.
 *   - the octagonal assembly-chamber drum (given its own lighter, banded
 *     material so it separates from the dark recessed mass) and its crown
 *     of angled clerestory fins above the roofline, now with wider gaps
 *     between fins and a dark glazed ring showing through them, plus a
 *     matching glazed slit at the collar.
 *   - the south portico: a cantilevered canopy and a pair of piers at the
 *     longest south-facing bay, with a human-scale band of entrance doors
 *     set into that opening's base. Nothing about Kahn's actual entrance
 *     detailing is copied — this is generic "there is a door here, and it
 *     is this tall" scale-cueing.
 *   - the south approach: lawn either side of a narrower paved ceremonial
 *     axis, with two shallow reflecting pools flanking it near the podium,
 *     replacing what was a single 250 m paved slab.
 *   - the podium coping (a raised lip at the plinth edge) and the approach
 *     stair, now cut to human-scale risers instead of battered slabs.
 *   - the lake retaining wall along the real lake polygons' edges (see
 *     REAL above for the polygons themselves).
 * If someone later supplies measured elevations, this file is where they go.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * OSM ids of the Parliament building itself. main.js passes these to
 * buildBuildings() as `excludeIds` so the procedural extruder leaves the
 * footprint alone, and passes the same scene here so this file can read the
 * REAL rings back out of it.
 */
export const SANGSAD_IDS = [18085267];

/** Names of the real lake polygons in scene.areas that border the complex. */
const LAKE_NAMES = ['Cresent Lake', 'Shangsad bhaban Lake'];

// --- Vertical scheme (metres) ----------------------------------------------
// The podium and the parapet are human-scale details and stay fixed. Every
// level above them is derived from the MEASURED height by
// applyVerticalScheme(), called first thing in buildSangsad().
const PLINTH_TOP = 2.2; // the podium the whole complex stands on
const PARAPET = 1.1;

/** Only used if the scene record somehow carries no usable height. */
const FALLBACK_HEIGHT = 37.7;

let MASS_TOP = 0; // top of the solid block mass, behind the screens
let SCREEN_TOP = 0; // top of the pierced outer screen walls
let DRUM_TOP = 0; // top of the assembly-chamber drum
let CROWN_TOP = 0; // tip of the clerestory crown above it

/**
 * Split the ONE height the scene can carry into the four levels this model
 * needs, along the proportions the raster actually measured.
 *
 * `h` is the raster MAX over the footprint, i.e. the crown tip. The raster
 * record for this building reads p50 18 m, p75 23 m, p90 27.5 m, max
 * 36.5 m (snapped to 37.7 m by the storey grid). The fractions below
 * reproduce that profile: 0.75 puts the screen roofline on p90 — the ring
 * of blocks — 0.58 puts the recessed mass near p75, and the crown takes the
 * full measured maximum.
 *
 * This matters more than it sounds: the previous pass had the crown at
 * 44.5 m, eight metres ABOVE the tallest thing the satellite can see on
 * this footprint. Deriving it means a data rebuild corrects the model
 * instead of silently disagreeing with it.
 *
 * Module-level rather than threaded through every helper because this
 * module builds exactly one building, once; the alternative is passing a
 * scheme object through eight functions for no gain.
 */
function applyVerticalScheme(h) {
  const H = Number.isFinite(h) && h > 10 ? h : FALLBACK_HEIGHT;
  MASS_TOP = +(H * 0.58).toFixed(2);
  SCREEN_TOP = +(H * 0.75).toFixed(2);
  DRUM_TOP = +(H * 0.82).toFixed(2);
  CROWN_TOP = +H.toFixed(2);
  return H;
}

const SCREEN_THICK = 1.15;
const MASS_INSET = 1.5; // how far the block mass sits behind the screen line
const GLAZING_RECESS = 1.7; // how far behind the screen's outer face the glass sits
const GLAZING_THICK = 0.14;

// --- Palette ------------------------------------------------------------
const CONCRETE = '#a1998c'; // board-formed grey concrete in Dhaka daylight, darkened a touch for band contrast
const CONCRETE_DEEP = '#6f6b64'; // the shaded mass seen through the openings
const MARBLE = '#f1eee5'; // the white marble inlay strips, brightened for street-distance legibility
const PLINTH = '#9c968c';
const PAVING = '#b3ada2';
const LAWN = '#5d7248';
const POOL = '#3d4f47';
const GLASS = '#232b30';
const GLASS_WARM = 0xe8c98a; // interior light glimpsed through the glass at night

// ---------------------------------------------------------------------------
// Ring helpers. Rings arrive as the scene's flat [x0,z0,x1,z1,...] arrays.
// ---------------------------------------------------------------------------

/** Flat [x,z,...] -> [{x,z}, ...], dropping a repeated closing point. */
function toPoints(flat) {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i], z: flat[i + 1] });
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6) pts.pop();
  }
  return pts;
}

/** Average of a ring's vertices. Good enough as a centre for a blob this regular. */
function centroidOf(pts) {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p.x;
    z += p.z;
  }
  return { x: x / pts.length, z: z / pts.length };
}

/**
 * Move every vertex `d` metres toward (negative) or away from (positive) the
 * ring's centre.
 *
 * This is a radial scale, not a true polygon offset: it is exact only for a
 * circle. Used deliberately — the plan here is a ring of nine blocks about a
 * common centre, i.e. very close to radially symmetric, and the offsets
 * involved are 1.5 m against an ~85 m radius. A real offset (miter joins,
 * self-intersection handling) would be a lot of code for a sub-pixel
 * difference at any distance the player can see this from.
 */
function offsetRing(pts, d) {
  const c = centroidOf(pts);
  return pts.map((p) => {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const r = Math.hypot(dx, dz) || 1;
    const s = (r + d) / r;
    return { x: c.x + dx * s, z: c.z + dz * s };
  });
}

/**
 * mergeGeometries() refuses to mix indexed and non-indexed inputs, and this
 * file mixes both by nature: ExtrudeGeometry comes back non-indexed while
 * CylinderGeometry/ConeGeometry/BoxGeometry come back indexed. Everything
 * pushed into a merge bucket goes through here first. (Dropping the index is
 * the cheap direction — the alternative, mergeVertices on the extrusions,
 * would weld across the screen-wall openings.)
 */
function flatten(geo) {
  return geo.index ? geo.toNonIndexed() : geo;
}

/** mergeGeometries returns null (and logs) on mismatched attributes; never hand that to a Mesh. */
function mergeOrThrow(geos, what) {
  const merged = mergeGeometries(geos.map(flatten), false);
  if (!merged) throw new Error(`[sangsad] could not merge ${geos.length} geometries for "${what}"`);
  return merged;
}

/** A THREE.Shape in the extruder's 2D frame: shape (X, Y) == world (x, -z). */
function shapeFrom(pts, holes = []) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p.x, -p.z) : s.moveTo(p.x, -p.z)));
  s.closePath();
  for (const h of holes) {
    const path = new THREE.Path();
    h.forEach((p, i) => (i ? path.lineTo(p.x, -p.z) : path.moveTo(p.x, -p.z)));
    path.closePath();
    s.holes.push(path);
  }
  return s;
}

/**
 * Extrude a horizontal shape upward.
 *
 * rotateX(-PI/2) maps the extruder's (X, Y, depth) onto world (x, -Y, up),
 * which is why shapeFrom() negates z going in. Verified rather than assumed:
 * a shape point (sx, sy) at depth d becomes world (sx, d, -sy).
 */
function extrudeUp(shape, from, to) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: to - from, bevelEnabled: false, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, from, 0);
  return geo;
}

/** A closed loop shape between two concentric offsets of a ring — used for coping/cap bands. */
function bandShape(pts, outerD, innerD) {
  return shapeFrom(offsetRing(pts, outerD), [offsetRing(pts, innerD)]);
}

// ---------------------------------------------------------------------------
// The concrete texture: grey board-formed concrete banded with white marble.
// ---------------------------------------------------------------------------

/**
 * Physical tile size in metres. Narrowed from the original 4 x 4.5 m to
 * 4 x 3 m and the board-form grain suppressed almost to nothing: at street
 * distance across Manik Mia Avenue the old texture read as a panel-joint
 * grid (the vertical shuttering lines) with the marble barely visible. The
 * fix is fewer, stronger competing signals — kill the grid, widen and
 * brighten the horizontal band, tighten its repeat so more of them are in
 * view at once.
 */
const TILE_W = 4;
const TILE_H = 3;

function concreteTexture(base = CONCRETE) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);

  // Board-form grain: barely-there vertical shuttering lines. Kept faint on
  // purpose (see comment above) — it should read as concrete grain up
  // close, not as a grid at distance.
  g.globalAlpha = 0.035;
  for (let x = 0; x < c.width; x += 8) {
    g.fillStyle = x % 16 === 0 ? '#ffffff' : '#000000';
    g.fillRect(x, 0, 1, c.height);
  }
  g.globalAlpha = 1;

  // The marble strip: wider and brighter than before, so it is the pattern
  // that wins at distance, with its own shadow line under it for depth.
  g.fillStyle = MARBLE;
  g.fillRect(0, 0, c.width, 9);
  g.globalAlpha = 0.22;
  g.fillStyle = '#000000';
  g.fillRect(0, 9, c.width, 1.5);
  g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // ExtrudeGeometry's default UV generator emits METRES for both the caps
  // and the side walls, so the repeat is a straight 1/size in metres.
  tex.repeat.set(1 / TILE_W, 1 / TILE_H);
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------------------
// The screen walls and their openings
// ---------------------------------------------------------------------------

/**
 * Which primary shape gets cut into a face, by that face's real length.
 *
 * Kahn's rule on this building is one enormous opening per bay, in primary
 * geometry, sized to the bay — not a grid of windows. These thresholds
 * reproduce that rule against the measured perimeter: the four longest runs
 * (29-32 m) take the full circles, the 17-20 m runs take the inverted
 * triangles, the short returns between blocks stay solid.
 */
function openingFor(L) {
  if (L >= 23) return 'circle';
  if (L >= 16) return 'triangle';
  if (L >= 11.5) return 'slot';
  return null;
}

/**
 * The opening's outline, as either a hole Path (for cutting the screen
 * panel) or a filled Shape (for the recessed glazing plane behind it).
 * Sized large and open on purpose — defect #2 from the live look was that
 * these read as windows punched in a wall; Kahn's circles fill most of
 * their bay.
 */
function openingOutline(L, height, kind, filled) {
  const Ctor = filled ? THREE.Shape : THREE.Path;
  const cx = L / 2;
  const p = new Ctor();
  if (kind === 'circle') {
    const r = Math.min(L * 0.42, height * 0.38);
    const cy = height * 0.52;
    p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  } else if (kind === 'triangle') {
    // Point down, flat top: the inverted triangle of the south and west faces.
    const w = Math.min(L * 0.78, height * 0.82);
    const top = height * 0.76;
    const bottom = top - w * 0.88;
    p.moveTo(cx - w / 2, top);
    p.lineTo(cx, bottom);
    p.lineTo(cx + w / 2, top);
    p.closePath();
  } else if (kind === 'slot') {
    const w = Math.min(L * 0.42, 5.2);
    const bottom = height * 0.16;
    const top = height * 0.84;
    p.moveTo(cx - w / 2, bottom);
    p.lineTo(cx + w / 2, bottom);
    p.lineTo(cx + w / 2, top);
    p.lineTo(cx - w / 2, top);
    p.closePath();
  } else {
    return null;
  }
  return p;
}

/** One screen-wall panel spanning a-b, as a Shape with its opening as a hole. */
function panelShape(L, height, kind) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(L, 0);
  s.lineTo(L, height);
  s.lineTo(0, height);
  s.closePath();
  const hole = openingOutline(L, height, kind, false);
  if (hole) s.holes.push(hole);
  return s;
}

/** The local (U, V, N) basis and placement matrix for the panel spanning a-b, facing away from centre c. */
function edgeFrame(a, b, c) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  const U = new THREE.Vector3(dx / L, 0, dz / L);
  const V = new THREE.Vector3(0, 1, 0);
  const N = new THREE.Vector3(dz / L, 0, -dx / L);
  const mx = (a.x + b.x) / 2 - c.x;
  const mz = (a.z + b.z) / 2 - c.z;
  // Face normal, flipped if it points back at the building's centre — the
  // OSM ring's winding is not guaranteed, so this is derived, not assumed.
  if (N.x * mx + N.z * mz < 0) N.negate();
  const M = new THREE.Matrix4().makeBasis(U, V, N);
  return { a, b, L, U, V, N, M };
}

/**
 * Build every screen panel around a ring, already transformed into world
 * space. Returns the merge-ready geometries AND the per-edge frame data
 * (with its opening kind), so the glazing pass below can place the glass
 * exactly where each hole is without recomputing the ring geometry.
 */
function screenWalls(pts, baseY, topY) {
  const c = centroidOf(pts);
  const height = topY - baseY;
  const geos = [];
  const openings = [];

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const frame = edgeFrame(a, b, c);
    if (frame.L < 0.4) continue; // OSM traces carry the odd sub-metre nub; skip those
    const kind = openingFor(frame.L);

    const geo = new THREE.ExtrudeGeometry(panelShape(frame.L, height, kind), {
      depth: SCREEN_THICK,
      bevelEnabled: false,
      curveSegments: 20,
    });
    // Centre the panel's thickness on the ring line rather than hanging it
    // all outward, so the screens meet cleanly at the corners.
    geo.translate(0, 0, -SCREEN_THICK / 2);
    geo.applyMatrix4(frame.M.clone().setPosition(a.x, baseY, a.z));
    geos.push(geo);

    if (kind) openings.push({ a, b, L: frame.L, height, kind, M: frame.M, baseY });
  }
  return { geos, openings };
}

/**
 * The recessed glazing behind each opening: a thin, dark, filled plane the
 * same shape as the hole, set back GLAZING_RECESS metres from the screen's
 * outer face. This is what turns the openings from a decal into a real
 * ~1 m-deep reveal with something visible (and, at night, lit) inside it.
 */
function openingGlazing(openings) {
  const geos = [];
  for (const o of openings) {
    const shape = openingOutline(o.L, o.height, o.kind, true);
    if (!shape) continue;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: GLAZING_THICK, bevelEnabled: false, curveSegments: 20 });
    geo.translate(0, 0, -(GLAZING_RECESS + GLAZING_THICK / 2));
    geo.applyMatrix4(o.M.clone().setPosition(o.a.x, o.baseY, o.a.z));
    geos.push(geo);
  }
  return geos;
}

// ---------------------------------------------------------------------------
// The assembly chamber: octagonal drum, and the clerestory crown over it.
// ---------------------------------------------------------------------------

/**
 * @param geosDrum  the drum shaft — kept OUT of the dark recessed mass and
 *   given its own lighter, banded material so it separates from the block
 *   behind it (defect #3: "reads as a lumpy box, not an octagonal drum").
 * @param geosCrown the marble parapet/collar/cap.
 * @param geosGlass the dark glazed ring glimpsed through the clerestory fins.
 */
function chamber(cx, cz, radius, geosDrum, geosCrown, geosGlass) {
  const SIDES = 8;
  const TWIST = Math.PI / 8; // flat face to the south approach, not a corner

  // Drum, from the plinth to just above the block roofline.
  const drum = new THREE.CylinderGeometry(radius, radius, DRUM_TOP - PLINTH_TOP, SIDES, 1, true);
  drum.rotateY(TWIST);
  drum.translate(cx, PLINTH_TOP + (DRUM_TOP - PLINTH_TOP) / 2, cz);
  geosDrum.push(drum);

  // A shallow collar where the drum meets the crown, with a dark glazed
  // slit under it so the drum-to-crown transition reads as a change of
  // material, not just a wider cylinder.
  const collar = new THREE.CylinderGeometry(radius * 1.06, radius * 1.06, 1.1, SIDES);
  collar.rotateY(TWIST);
  collar.translate(cx, DRUM_TOP + 1.0, cz);
  geosCrown.push(collar);

  const slit = new THREE.CylinderGeometry(radius * 0.98, radius * 0.98, 0.6, SIDES, 1, true);
  slit.rotateY(TWIST);
  slit.translate(cx, DRUM_TOP + 0.3, cz);
  geosGlass.push(slit);

  // A dark glazed ring behind the fins, so the gaps between them show glass
  // rather than sky-coloured nothing — this is what sells "ring of
  // clerestory fins" rather than "solid octagonal cap" from a distance.
  const finH = CROWN_TOP - DRUM_TOP - 1.6;
  const glassRing = new THREE.CylinderGeometry(radius * 0.94, radius * 0.8, finH, SIDES, 1, true);
  glassRing.rotateY(TWIST);
  glassRing.translate(cx, DRUM_TOP + 1.6 + finH / 2, cz);
  geosGlass.push(glassRing);

  // The crown: eight clerestory fins, each raking inward, narrower than
  // before so the glazed ring behind shows through the gaps.
  for (let i = 0; i < SIDES; i++) {
    const ang = TWIST + (i / SIDES) * Math.PI * 2;
    const faceW = 2 * radius * Math.tan(Math.PI / SIDES);
    const shape = new THREE.Shape();
    // Trapezoid in the fin's own plane: wide at the bottom, raked back, and
    // narrower overall than the old 0.46/0.3 so the glazed ring shows.
    shape.moveTo(-faceW * 0.36, 0);
    shape.lineTo(faceW * 0.36, 0);
    shape.lineTo(faceW * 0.2, finH);
    shape.lineTo(-faceW * 0.2, finH);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false });
    geo.translate(0, 0, -1.6);
    geo.rotateX(-0.26); // the inward rake
    geo.rotateY(ang);
    geo.translate(cx + Math.sin(ang) * radius * 0.99, DRUM_TOP + 1.6, cz + Math.cos(ang) * radius * 0.99);
    geosCrown.push(geo);
  }

  // A shallow cap closing the middle of the crown.
  const cap = new THREE.ConeGeometry(radius * 0.58, 3.0, SIDES);
  cap.rotateY(TWIST);
  cap.translate(cx, CROWN_TOP - 2.2, cz);
  geosCrown.push(cap);
}

// ---------------------------------------------------------------------------
// The south entrance: portico, piers and a human-scale band of doors.
// ---------------------------------------------------------------------------

/**
 * The most south-facing bay-scale run of the ring — the natural place for
 * the main approach. This building's plan is not axis-aligned and its
 * southernmost single POINT belongs to a diagonal corner block, not a wall
 * that actually faces the approach; picking by outward-normal "southness"
 * (frame.N.z, +Z is south in this project's frame) rather than by raw z
 * finds the bay a visitor coming up Manik Mia Avenue would actually walk
 * into, which is what the portico below needs.
 */
function findEntranceEdge(pts) {
  const c = centroidOf(pts);
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 10) continue; // a bay-scale run, not a short return between blocks
    const frame = edgeFrame(a, b, c);
    if (!best || frame.N.z > best.frame.N.z) best = { a, b, L, frame };
  }
  return best;
}

/**
 * A cantilevered canopy on two piers at the entrance bay, plus a band of
 * doors set into the opening's base — defect #5: the south face had no
 * portico, no doors, no scale cues. Nothing here is measured; it is the
 * generic statement "here is the entrance, and it is human-scaled."
 */
function entrancePortico(edge, geosPortico, geosDoors) {
  const { a, b, L, frame } = edge;
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const width = Math.min(L * 0.62, 24);
  const canopyY = 6.2;
  const projection = 8.5;

  // Canopy slab, projecting south off the mass along the face normal.
  const canopy = new THREE.BoxGeometry(width, 0.55, projection);
  const cM = frame.M.clone();
  cM.setPosition(mx + frame.N.x * (projection / 2 - 0.4), canopyY, mz + frame.N.z * (projection / 2 - 0.4));
  canopy.applyMatrix4(cM);
  geosPortico.push(canopy);

  // Two piers holding the canopy's outer edge.
  for (const s of [-1, 1]) {
    const pier = new THREE.BoxGeometry(0.9, canopyY, 0.9);
    const px = mx + frame.U.x * s * (width / 2 - 0.6) + frame.N.x * (projection - 0.9);
    const pz = mz + frame.U.z * s * (width / 2 - 0.6) + frame.N.z * (projection - 0.9);
    pier.translate(px, canopyY / 2, pz);
    geosPortico.push(pier);
  }

  // A human-scale band of entrance doors set into the opening's base, dark
  // and slightly recessed — the scale cue the flat screen wall could not
  // give on its own.
  const doorW = Math.min(width * 0.75, 14);
  const doorH = 2.6;
  const doors = new THREE.BoxGeometry(doorW, doorH, 0.16);
  const dM = frame.M.clone();
  dM.setPosition(
    mx - frame.N.x * (GLAZING_RECESS - 0.1),
    doorH / 2 + PLINTH_TOP,
    mz - frame.N.z * (GLAZING_RECESS - 0.1)
  );
  doors.applyMatrix4(dM);
  geosDoors.push(doors);
}

// ---------------------------------------------------------------------------
// The lake edge and its retaining wall (north/west sides)
// ---------------------------------------------------------------------------

/**
 * A low retaining wall traced along the REAL lake polygons already shipped
 * in the scene (`Cresent Lake`, `Shangsad bhaban Lake`) — read back out the
 * same way the building rings are, not invented. Returns both the wall
 * geometry and matching collider segments, so the lake edge stops the
 * player the same way the building itself does.
 */
function lakeWalls(scene, geosWall, colliders) {
  const areas = (scene.areas || []).filter((a) => LAKE_NAMES.includes(a.name));
  for (const area of areas) {
    const pts = toPoints(area.p);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const L = Math.hypot(dx, dz);
      if (L < 1) continue; // skip degenerate sub-metre nubs in the traced shoreline
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const ang = Math.atan2(dx, dz);
      const wall = new THREE.BoxGeometry(0.6, 1.5, L + 0.3);
      wall.rotateY(ang);
      wall.translate(mx, -0.3 + 1.5 / 2, mz);
      geosWall.push(wall);
      colliders.push([a.x, a.z, b.x, b.z]);
    }
  }
}

// ---------------------------------------------------------------------------
// buildSangsad
// ---------------------------------------------------------------------------

/**
 * @param {object} scene parsed scene-bijoy.json (needs `buildings`)
 * @returns {{group: THREE.Group, stats: object, colliders: number[][]}|null}
 *          null when the scene has no Parliament footprint, so a caller on
 *          another district (or an older scene file) is a clean no-op.
 */
export function buildSangsad(scene) {
  const parts = (scene.buildings || []).filter((b) => SANGSAD_IDS.includes(b.id));
  if (!parts.length) return null;

  // The complex comes back as two rings sharing one OSM id: the big ring of
  // peripheral blocks, and the assembly-chamber block inside it. Sort by
  // footprint area so `outer` is the ring whatever order the file lists them.
  parts.sort((a, b) => (b.a || 0) - (a.a || 0));
  // Measured height first: every vertical level below is derived from it.
  const measuredHeight = applyVerticalScheme(parts[0].h);
  const outerRaw = toPoints(parts[0].p);
  const holes = (parts[0].holes || []).map(toPoints);
  const inner = parts[1] ? toPoints(parts[1].p) : null;

  const group = new THREE.Group();
  group.name = 'landmark:jatiya-sangsad-bhaban';

  const skinTex = concreteTexture(CONCRETE);
  const deepTex = concreteTexture(CONCRETE_DEEP);
  const skinMat = new THREE.MeshLambertMaterial({ map: skinTex, side: THREE.DoubleSide });
  const massMat = new THREE.MeshLambertMaterial({ map: deepTex, side: THREE.DoubleSide });
  const plinthMat = new THREE.MeshLambertMaterial({ color: PLINTH, side: THREE.DoubleSide });
  const crownMat = new THREE.MeshLambertMaterial({ color: MARBLE, side: THREE.DoubleSide });
  const pavingMat = new THREE.MeshLambertMaterial({ color: PAVING, side: THREE.DoubleSide });
  const lawnMat = new THREE.MeshLambertMaterial({ color: LAWN, side: THREE.DoubleSide });
  const poolMat = new THREE.MeshLambertMaterial({ color: POOL, side: THREE.DoubleSide });
  const glassMat = new THREE.MeshLambertMaterial({ color: GLASS, side: THREE.DoubleSide });
  const doorMat = new THREE.MeshLambertMaterial({ color: '#1b1f21' });
  const porticoMat = new THREE.MeshLambertMaterial({ color: CONCRETE });

  // Night: the real building is floodlit from the plinth, which is the only
  // reason it is visible at all across the lake after dark. There is no
  // signage to light here, so rather than emissive MAPS (the landmarks.js /
  // signs.js pattern) this is a flat emissive lift on the concrete itself,
  // ramped by night.js's own 0..1 factor through the same
  // setNightIntensity contract every other lit material in this project
  // uses. Values kept low: it should read as washed concrete at dusk, not
  // as a glowing white block. The glass gets a warm interior-light lift
  // instead, so the huge Kahn openings read as lit from within at night.
  const FLOODLIT = [
    { mat: skinMat, colour: 0xd9d2c2, amount: 0.34 },
    { mat: crownMat, colour: 0xe6e2d6, amount: 0.42 },
    { mat: plinthMat, colour: 0xcfc8ba, amount: 0.22 },
    { mat: glassMat, colour: GLASS_WARM, amount: 0.55 },
  ];
  for (const f of FLOODLIT) {
    f.mat.emissive = new THREE.Color(f.colour);
    f.mat.emissiveIntensity = 0;
  }

  const massGeos = [];
  const crownGeos = [];
  const drumGeos = [];
  const glassGeos = [];
  const porticoGeos = [];
  const doorGeos = [];
  const wallGeos = [];

  // --- The podium the whole thing stands on --------------------------------
  const plinthRing = offsetRing(outerRaw, 7.5);
  const plinth = extrudeUp(shapeFrom(plinthRing), 0.05, PLINTH_TOP);
  plinth.computeVertexNormals();
  const plinthMesh = new THREE.Mesh(plinth, plinthMat);
  plinthMesh.name = 'sangsad:plinth';
  plinthMesh.receiveShadow = true;
  group.add(plinthMesh);

  // A raised coping lip at the podium edge, so it reads as a built edge
  // rather than the ground simply stopping (defect: "no ... scale cues").
  const copingGeos = [extrudeUp(bandShape(outerRaw, 8.0, 6.6), PLINTH_TOP, PLINTH_TOP + 0.22)];
  const coping = mergeOrThrow(copingGeos, 'podium coping');
  coping.computeVertexNormals();
  const copingMesh = new THREE.Mesh(coping, plinthMat);
  copingMesh.name = 'sangsad:podium-coping';
  copingMesh.receiveShadow = true;
  group.add(copingMesh);

  // --- The block mass, set back behind the screen line ---------------------
  const massRing = offsetRing(outerRaw, -(SCREEN_THICK / 2 + MASS_INSET));
  const massGeo = extrudeUp(shapeFrom(massRing, holes), PLINTH_TOP, MASS_TOP);
  massGeos.push(massGeo);

  // --- The pierced screen walls, and the glass recessed behind them -------
  const { geos: screenGeos, openings } = screenWalls(outerRaw, PLINTH_TOP, SCREEN_TOP);
  const screens = mergeOrThrow(screenGeos, 'screen walls');
  screens.computeVertexNormals();
  const screenMesh = new THREE.Mesh(screens, skinMat);
  screenMesh.name = 'sangsad:screen-walls';
  screenMesh.castShadow = true;
  screenMesh.receiveShadow = true;
  group.add(screenMesh);

  glassGeos.push(...openingGlazing(openings));

  // A plain parapet band capping the screens, so the roofline reads as one
  // line rather than as the top edge of a stack of separate panels.
  crownGeos.push(extrudeUp(bandShape(outerRaw, SCREEN_THICK / 2 + 0.15, -(SCREEN_THICK / 2 + 0.15)), SCREEN_TOP, SCREEN_TOP + PARAPET));

  // --- The assembly chamber ------------------------------------------------
  let chamberRadius = 0;
  if (inner) {
    const c = centroidOf(inner);
    for (const p of inner) chamberRadius = Math.max(chamberRadius, Math.hypot(p.x - c.x, p.z - c.z));
    chamber(c.x, c.z, chamberRadius, drumGeos, crownGeos, glassGeos);
  }

  // --- The south entrance: portico, piers, doors ---------------------------
  const entranceEdge = findEntranceEdge(outerRaw);
  if (entranceEdge) entrancePortico(entranceEdge, porticoGeos, doorGeos);

  // --- The lake edge retaining wall -----------------------------------------
  const colliders = [];
  lakeWalls(scene, wallGeos, colliders);

  const mass = mergeOrThrow(massGeos, 'block mass');
  mass.computeVertexNormals();
  const massMesh = new THREE.Mesh(mass, massMat);
  massMesh.name = 'sangsad:mass';
  massMesh.castShadow = true;
  massMesh.receiveShadow = true;
  group.add(massMesh);

  if (drumGeos.length) {
    // The drum gets its own material instance: skin-toned and banded like
    // the screen walls, but with a repeat tuned to the drum's own
    // circumference/height so the marble courses land at the same physical
    // spacing rather than stretching around a cylinder's 0-1 UV wrap.
    const circumference = 2 * Math.PI * chamberRadius;
    const drumTex = concreteTexture(CONCRETE);
    drumTex.repeat.set(Math.max(1, Math.round(circumference / TILE_W)), Math.max(1, Math.round((DRUM_TOP - PLINTH_TOP) / TILE_H)));
    const drumMat = new THREE.MeshLambertMaterial({ map: drumTex, side: THREE.DoubleSide });
    drumMat.emissive = new THREE.Color(0xd9d2c2);
    drumMat.emissiveIntensity = 0;
    FLOODLIT.push({ mat: drumMat, colour: 0xd9d2c2, amount: 0.3 });
    const drum = mergeOrThrow(drumGeos, 'chamber drum');
    drum.computeVertexNormals();
    const drumMesh = new THREE.Mesh(drum, drumMat);
    drumMesh.name = 'sangsad:drum';
    drumMesh.castShadow = true;
    drumMesh.receiveShadow = true;
    group.add(drumMesh);
  }

  const crown = mergeOrThrow(crownGeos, 'parapet + crown');
  crown.computeVertexNormals();
  const crownMesh = new THREE.Mesh(crown, crownMat);
  crownMesh.name = 'sangsad:crown';
  crownMesh.castShadow = true;
  group.add(crownMesh);

  if (glassGeos.length) {
    const glass = mergeOrThrow(glassGeos, 'recessed glazing');
    glass.computeVertexNormals();
    const glassMesh = new THREE.Mesh(glass, glassMat);
    glassMesh.name = 'sangsad:glazing';
    group.add(glassMesh);
  }

  if (porticoGeos.length) {
    const portico = mergeOrThrow(porticoGeos, 'south portico');
    portico.computeVertexNormals();
    const porticoMesh = new THREE.Mesh(portico, porticoMat);
    porticoMesh.name = 'sangsad:portico';
    porticoMesh.castShadow = true;
    porticoMesh.receiveShadow = true;
    group.add(porticoMesh);
  }

  if (doorGeos.length) {
    const doors = mergeOrThrow(doorGeos, 'entrance doors');
    doors.computeVertexNormals();
    const doorMesh = new THREE.Mesh(doors, doorMat);
    doorMesh.name = 'sangsad:doors';
    group.add(doorMesh);
  }

  // --- The south plaza, lawn, pools and steps ------------------------------
  // The building is approached from Manik Mia Avenue across open ground:
  // that approach is the view of it everyone knows, so it is not left as
  // bare procedural ground. Previously a single 250 m paved slab (read as
  // an airfield); now lawn either side of a narrower paved ceremonial axis,
  // with two shallow pools flanking it near the podium.
  const bounds = outerRaw.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      maxX: Math.max(acc.maxX, p.x),
      minZ: Math.min(acc.minZ, p.z),
      maxZ: Math.max(acc.maxZ, p.z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  );
  const centreX = (bounds.minX + bounds.maxX) / 2;
  // The paved axis and pools lead specifically to the entrance portico, so
  // they are centred on that bay rather than the building's overall
  // bounding box — this building's plan is not axis-aligned, and the two
  // centres are ~30 m apart. The grand steps below deliberately stay on
  // centreX: they run the width of the whole south face, not just one bay.
  const approachX = entranceEdge ? (entranceEdge.a.x + entranceEdge.b.x) / 2 : centreX;
  const plazaW = bounds.maxX - bounds.minX + 90;
  const plazaDepth = 250;
  const plazaCentreZ = bounds.maxZ + 118;

  const lawn = new THREE.PlaneGeometry(plazaW, plazaDepth);
  lawn.rotateX(-Math.PI / 2);
  lawn.translate(centreX, 0.08, plazaCentreZ);
  const lawnMesh = new THREE.Mesh(lawn, lawnMat);
  lawnMesh.name = 'sangsad:south-lawn';
  lawnMesh.receiveShadow = true;
  group.add(lawnMesh);

  const axisW = Math.min(plazaW * 0.28, 34);
  const axis = new THREE.PlaneGeometry(axisW, plazaDepth - 10);
  axis.rotateX(-Math.PI / 2);
  axis.translate(approachX, 0.1, plazaCentreZ + 5);
  const axisMesh = new THREE.Mesh(axis, pavingMat);
  axisMesh.name = 'sangsad:south-axis';
  axisMesh.receiveShadow = true;
  group.add(axisMesh);

  const poolGeos = [];
  const poolW = axisW * 1.15;
  const poolLen = 46;
  const poolZ = bounds.maxZ + 46;
  for (const s of [-1, 1]) {
    const px = approachX + s * (axisW / 2 + poolW / 2 + 4);
    const pool = new THREE.PlaneGeometry(poolW, poolLen);
    pool.rotateX(-Math.PI / 2);
    pool.translate(px, 0.11, poolZ);
    poolGeos.push(pool);
  }
  const pools = mergeOrThrow(poolGeos, 'reflecting pools');
  const poolMesh = new THREE.Mesh(pools, poolMat);
  poolMesh.name = 'sangsad:reflecting-pools';
  poolMesh.receiveShadow = true;
  group.add(poolMesh);

  // Approach steps, now cut to human-scale risers (~0.18 m) rather than the
  // old 5 battered slabs (~0.44 m each).
  const stepGeos = [];
  const STEPS = 12;
  for (let i = 0; i < STEPS; i++) {
    const y = PLINTH_TOP * ((i + 1) / STEPS);
    const depth = 1.3;
    const box = new THREE.BoxGeometry(plazaW - 60 - i * 2, y, depth);
    box.translate(centreX, y / 2, bounds.maxZ + 9 + (STEPS - 1 - i) * depth);
    stepGeos.push(box);
  }
  const steps = new THREE.Mesh(mergeOrThrow(stepGeos, 'south steps'), plinthMat);
  steps.name = 'sangsad:south-steps';
  steps.receiveShadow = true;
  group.add(steps);

  if (wallGeos.length) {
    const wall = mergeOrThrow(wallGeos, 'lake retaining wall');
    wall.computeVertexNormals();
    const wallMesh = new THREE.Mesh(wall, plinthMat);
    wallMesh.name = 'sangsad:lake-wall';
    wallMesh.receiveShadow = true;
    group.add(wallMesh);
  }

  // --- Collision -----------------------------------------------------------
  // Wall segments along the real ring, so the player cannot walk through the
  // Parliament. Returned rather than added here: main.js owns the collision
  // grid and hands it to walkable.addSegments, the same route the station
  // interiors use. The lake-edge segments collected above are already in
  // `colliders`; the building ring is appended after them.
  for (let i = 0; i < outerRaw.length; i++) {
    const a = outerRaw[i];
    const b = outerRaw[(i + 1) % outerRaw.length];
    colliders.push([a.x, a.z, b.x, b.z]);
  }

  // A good south-elevation camera spot: on the paved axis, back far enough
  // to see the whole screen wall and the crown above it, looking north at
  // the building's centre. Offered for another executor's flythrough/menu
  // camera; not consumed anywhere in this file.
  const viewpoint = {
    x: centreX,
    y: 11,
    z: bounds.maxZ + 165,
    lookAt: { x: centreX, y: 16, z: (bounds.minZ + bounds.maxZ) / 2 },
  };

  return {
    group,
    colliders,
    stats: {
      ringPoints: outerRaw.length,
      courts: holes.length,
      screens: screenGeos.length,
      openings: openings.length,
      height: SCREEN_TOP + PARAPET,
      crownHeight: CROWN_TOP,
      lakeWallSegments: wallGeos.length,
    },
    viewpoint,
    /** night.js contract: 0 by day, ramping to 1 at night. See FLOODLIT above. */
    setNightIntensity(v) {
      for (const f of FLOODLIT) f.mat.emissiveIntensity = f.amount * v;
    },
  };
}
