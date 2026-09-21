/**
 * vehicle-models.js
 *
 * Geometry for the traffic fleet (src/traffic.js) and the hired ride
 * (streetlife/rides.js): cycle-rickshaw, CNG auto-rickshaw, sedan, city bus,
 * motorbike. Procedural on purpose — docs/CAR-MODEL-HUNT.md records that no
 * usable CC0 vehicle models exist, and nothing CC0 looks like a Dhaka rickshaw.
 *
 * Each vehicle is merged down to at most three geometries, so a whole vehicle
 * type costs three draw calls however detailed it is:
 *   paint  — the panels that take the per-vehicle colour (instanceColor).
 *            Vertex colours are white, or a grey to shade a panel darker.
 *   detail — everything with a fixed colour, carried as vertex colours.
 *   lamps  — head/tail lights, drawn unlit and only at night.
 *   far    — a few-box stand-in drawn past LOD range instead of paint + detail.
 *
 * Local space matches traffic.js: +Z forward, +Y up, origin at road level.
 * Bangladesh drives on the left, so the kerb side of a vehicle is +X.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TYRE = 0x141414;
const RIM = 0x8d9296;
const GLASS = 0x1d2a30;
const DARK = 0x222528;
const CHROME = 0xb9bec2;
const SKIN = 0x7a5234;
const PLATE = 0xe8c53a;
const LENS = 0xdfe3da;
const LENS_RED = 0x8c1a16;
const HEAD_LIT = 0xfff2c0;
const TAIL_LIT = 0xff2a20;

const _color = new THREE.Color();

/** Bake one flat colour into a geometry and normalise it for merging. */
function tint(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  _color.setHex(hex);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function box(w, h, d, x, y, z, hex) {
  return tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
}

/** Cylinder with its axis along 'x' (axles, wheels), 'y' or 'z' (lights, exhausts). */
function cyl(r, len, x, y, z, hex, axis = 'x', segments = 10) {
  const g = new THREE.CylinderGeometry(r, r, len, segments);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return tint(g.translate(x, y, z), hex);
}

function ball(r, x, y, z, hex) {
  return tint(new THREE.SphereGeometry(r, 6, 4).translate(x, y, z), hex);
}

/** Tyre plus a lighter rim disc that stands just proud of it on both faces. */
function wheel(r, width, x, y, z) {
  return [
    cyl(r, width, x, y, z, TYRE, 'x', 10),
    cyl(r * 0.6, width + 0.03, x, y, z, RIM, 'x', 8),
  ];
}

/**
 * A side silhouette extruded across the vehicle's width. `points` are [z, y]
 * pairs; a small bevel chamfers the long edges so bodies stop reading as boxes.
 */
function profile(points, width, hex, bevel = 0) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel, // keep the silhouette at the drawn size; detail is placed against it
    bevelSegments: 1,
    steps: 1,
  });
  // Shape space (x, y, depth) -> vehicle space (z, y, x), centred across the width.
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return tint(g, hex);
}

/**
 * A bar or panel laid along the segment (z0,y0)-(z1,y1) in the side view, at
 * lateral position `x`. `lift` pushes it off the surface along the upward
 * normal, which is how glass sits proud of a raked screen.
 */
function strut(z0, y0, z1, y1, x, width, thick, hex, lift = 0) {
  const dz = z1 - z0;
  const dy = y1 - y0;
  const angle = Math.atan2(dz, dy);
  let ny = -Math.sin(angle);
  let nz = Math.cos(angle);
  if (ny < 0) { ny = -ny; nz = -nz; }
  const g = new THREE.BoxGeometry(width, Math.hypot(dz, dy), thick);
  g.rotateX(angle);
  g.translate(x, (y0 + y1) / 2 + ny * lift, (z0 + z1) / 2 + nz * lift);
  return tint(g, hex);
}

/** Two lit lens pairs for the night mesh. */
function lampSet(w, h, x, y, zFront, zRear) {
  return [
    box(w, h, 0.05, x, y, zFront, HEAD_LIT), box(w, h, 0.05, -x, y, zFront, HEAD_LIT),
    box(w, h, 0.05, x, y, zRear, TAIL_LIT), box(w, h, 0.05, -x, y, zRear, TAIL_LIT),
  ];
}

// ---------------------------------------------------------------------------
// Cycle-rickshaw
// ---------------------------------------------------------------------------
function rickshaw() {
  const FRAME = 0x2c3f52;
  const ART = 0xe9c85e;
  const LUNGI = 0x3b5a7a;
  const SHIRT = 0xa9ac98;

  // The folding hood: same half-cylinder the old model used, so the hired
  // ride's seat camera (rides.js) still sits inside it.
  const hood = new THREE.CylinderGeometry(0.62, 0.62, 0.98, 10, 1, true, 0, Math.PI);
  hood.rotateZ(Math.PI / 2);
  hood.rotateY(Math.PI / 2);
  hood.translate(0, 1.16, -0.42);
  const hoodBack = new THREE.CircleGeometry(0.62, 10, 0, Math.PI).translate(0, 1.16, -0.91);

  const paint = [
    tint(hood, 0xffffff),
    tint(hoodBack, 0xd8d8d8),
    box(0.04, 0.34, 0.92, 0.47, 0.8, -0.45, 0xffffff), // side panels
    box(0.04, 0.34, 0.92, -0.47, 0.8, -0.45, 0xffffff),
    box(0.9, 0.46, 0.04, 0, 0.86, -0.93, 0xc8c8c8), // the painted back plate
  ];

  const rib = (z) => tint(new THREE.TorusGeometry(0.625, 0.016, 3, 8, Math.PI).translate(0, 1.16, z), ART);

  const detail = [
    ...wheel(0.34, 0.05, 0, 0.34, 1.05),
    ...wheel(0.34, 0.05, 0.52, 0.34, -0.6),
    ...wheel(0.34, 0.05, -0.52, 0.34, -0.6),
    cyl(0.025, 1.04, 0, 0.34, -0.6, DARK), // rear axle
    // Diamond frame, fork and chain stay.
    strut(1.05, 0.34, 0.84, 1.04, 0, 0.05, 0.05, FRAME), // fork
    strut(0.84, 0.98, 0.35, 0.9, 0, 0.045, 0.045, FRAME), // top tube
    strut(0.84, 0.92, 0.3, 0.4, 0, 0.045, 0.045, FRAME), // down tube
    strut(0.35, 0.94, 0.3, 0.4, 0, 0.045, 0.045, FRAME), // seat tube
    strut(0.3, 0.4, -0.6, 0.34, 0, 0.045, 0.045, FRAME), // chain stay
    cyl(0.018, 0.52, 0, 1.08, 0.8, CHROME), // handlebar
    box(0.2, 0.06, 0.28, 0, 0.97, 0.33, DARK), // saddle
    cyl(0.09, 0.03, 0.06, 0.4, 0.3, CHROME, 'x', 8), // chainring
    // Passenger tub.
    box(0.92, 0.05, 0.55, 0, 0.5, -0.12, FRAME), // footboard
    box(0.9, 0.26, 0.56, 0, 0.66, -0.55, 0x7a1f22), // seat cushion
    box(0.9, 0.4, 0.1, 0, 0.98, -0.84, 0x7a1f22), // seat back
    box(0.96, 0.04, 0.96, 0, 0.6, -0.45, FRAME), // tub rail
    // Rickshaw art: a gold border and a flower on the back plate.
    box(0.94, 0.04, 0.05, 0, 1.1, -0.935, ART),
    box(0.94, 0.04, 0.05, 0, 0.62, -0.935, ART),
    box(0.04, 0.5, 0.05, 0.46, 0.86, -0.935, ART),
    box(0.04, 0.5, 0.05, -0.46, 0.86, -0.935, ART),
    cyl(0.13, 0.03, 0, 0.86, -0.955, 0xf3efe2, 'z', 8),
    cyl(0.055, 0.04, 0, 0.86, -0.96, 0xc23a2c, 'z', 6),
    rib(-0.9), rib(-0.42), rib(0.06),
    box(0.26, 0.09, 0.02, 0, 0.5, -0.95, PLATE),
    box(0.06, 0.06, 0.02, 0.4, 0.5, -0.95, LENS_RED),
    box(0.06, 0.06, 0.02, -0.4, 0.5, -0.95, LENS_RED),
    // The puller: leaning into the bars, one leg down and one up.
    box(0.3, 0.2, 0.24, 0, 1.06, 0.33, LUNGI), // hips
    strut(0.33, 1.1, 0.56, 1.52, 0, 0.34, 0.2, SHIRT), // torso
    ball(0.11, 0, 1.66, 0.62, SKIN),
    box(0.2, 0.05, 0.2, 0, 1.76, 0.62, 0xb8402f), // gamcha
    strut(0.56, 1.46, 0.8, 1.1, 0.2, 0.07, 0.07, SKIN), // arms
    strut(0.56, 1.46, 0.8, 1.1, -0.2, 0.07, 0.07, SKIN),
    strut(0.33, 1.0, 0.56, 0.74, 0.11, 0.12, 0.12, LUNGI), // right thigh (pedal up)
    strut(0.56, 0.74, 0.4, 0.5, 0.11, 0.08, 0.08, SKIN),
    strut(0.33, 1.0, 0.46, 0.64, -0.11, 0.12, 0.12, LUNGI), // left thigh (pedal down)
    strut(0.46, 0.64, 0.24, 0.3, -0.11, 0.08, 0.08, SKIN),
  ];

  return { paint, detail, lamps: null, doubleSide: true };
}

// ---------------------------------------------------------------------------
// CNG auto-rickshaw: green body, black canopy, grille doors
// ---------------------------------------------------------------------------
/** @param {boolean} [cabin] the hailed ride's variant: see hireGeometry() */
function cng(cabin = false) {
  const GREEN = 0x1f7a3d;
  const GREEN_DARK = 0x175c2e;
  const CANOPY = 0x18181a;
  const CAGE = 0x6d7470;

  const bars = (side) => [1.12, 1.27, 1.42].map((y) => box(0.02, 0.025, 1.02, side * 0.655, y, -0.74, CAGE));

  const detail = [
    profile([[-1.25, 0.3], [-1.3, 1.0], [0.78, 1.0], [1.3, 0.78], [1.36, 0.46], [1.22, 0.3]], 1.3, GREEN, 0.04),
    profile([[-1.3, 1.55], [-1.26, 1.72], [0.56, 1.72], [0.82, 1.6], [0.8, 1.55]], 1.36, CANOPY, 0.03),
    box(1.3, 0.56, 0.06, 0, 1.27, -1.27, GREEN), // rear upper panel
    box(0.7, 0.26, 0.02, 0, 1.36, -1.305, GLASS), // rear window
    // The windscreen is an opaque dark panel: right from the street, a wall in
    // front of a passenger. The ridden CNG goes without (open-fronted, as many are).
    ...(cabin ? [] : [strut(0.96, 1.0, 0.74, 1.57, 0, 1.14, 0.02, GLASS, 0.01)]),
    strut(0.96, 1.0, 0.74, 1.57, 0.6, 0.06, 0.06, GREEN_DARK), // screen pillars
    strut(0.96, 1.0, 0.74, 1.57, -0.6, 0.06, 0.06, GREEN_DARK),
    box(0.05, 0.56, 0.05, 0.62, 1.27, -0.2, CANOPY), // B pillars
    box(0.05, 0.56, 0.05, -0.62, 1.27, -0.2, CANOPY),
    ...bars(1), ...bars(-1),
    box(1.2, 0.12, 0.5, 0, 0.98, -0.75, DARK), // passenger bench
    box(1.2, 0.45, 0.08, 0, 1.2, -1.02, DARK),
    // Driver.
    box(0.36, 0.5, 0.24, 0, 1.22, 0.2, 0x4a5560),
    ball(0.11, 0, 1.58, 0.22, SKIN),
    cyl(0.015, 0.4, 0, 1.12, 0.6, DARK), // handlebar
    // Front end: single headlamp, mudguard, plates.
    cyl(0.1, 0.06, 0, 0.88, 1.27, LENS, 'z', 10),
    box(0.08, 0.06, 0.03, 0.4, 0.84, 1.26, 0xd98a1f),
    box(0.08, 0.06, 0.03, -0.4, 0.84, 1.26, 0xd98a1f),
    box(0.26, 0.06, 0.7, 0, 0.56, 1.02, GREEN_DARK), // front mudguard
    box(0.34, 0.1, 0.02, 0, 0.62, 1.37, PLATE),
    box(1.32, 0.1, 0.06, 0, 0.34, -1.28, DARK), // rear bumper
    box(0.4, 0.1, 0.02, 0, 0.62, -1.315, PLATE),
    box(0.1, 0.12, 0.03, 0.52, 0.86, -1.31, LENS_RED),
    box(0.1, 0.12, 0.03, -0.52, 0.86, -1.31, LENS_RED),
    ...wheel(0.26, 0.12, 0, 0.26, 1.02),
    ...wheel(0.26, 0.14, 0.6, 0.26, -0.8),
    ...wheel(0.26, 0.14, -0.6, 0.26, -0.8),
  ];

  const lamps = [
    cyl(0.1, 0.05, 0, 0.88, 1.3, HEAD_LIT, 'z', 10),
    box(0.1, 0.12, 0.04, 0.52, 0.86, -1.33, TAIL_LIT),
    box(0.1, 0.12, 0.04, -0.52, 0.86, -1.33, TAIL_LIT),
  ];

  return { paint: null, detail, lamps, doubleSide: false };
}

// ---------------------------------------------------------------------------
// Sedan
// ---------------------------------------------------------------------------
function car() {
  const paint = [
    profile([
      [-2.13, 0.28], [-2.16, 0.62], [-2.1, 0.94], [-1.45, 1.0], [-0.95, 1.42],
      [0.35, 1.45], [1.05, 1.02], [2.0, 0.86], [2.15, 0.6], [2.12, 0.28],
    ], 1.74, 0xffffff, 0.06),
    box(1.78, 0.36, 0.07, 0, 1.22, -0.22, 0xe0e0e0), // B pillar
    box(0.1, 0.07, 0.16, 0.92, 1.06, 0.78, 0xffffff), // mirrors
    box(0.1, 0.07, 0.16, -0.92, 1.06, 0.78, 0xffffff),
  ];

  const detail = [
    profile([[-0.98, 1.05], [-0.8, 1.37], [0.3, 1.4], [0.93, 1.05]], 1.76, GLASS), // side glass
    strut(1.05, 1.02, 0.35, 1.45, 0, 1.46, 0.02, GLASS, 0.035), // windscreen
    strut(-1.45, 1.0, -0.95, 1.42, 0, 1.4, 0.02, GLASS, 0.035), // rear screen
    box(1.76, 0.2, 0.1, 0, 0.4, 2.12, DARK), // bumpers
    box(1.76, 0.2, 0.1, 0, 0.4, -2.12, DARK),
    box(0.9, 0.13, 0.04, 0, 0.66, 2.15, DARK), // grille
    box(0.34, 0.13, 0.04, 0.62, 0.72, 2.12, LENS),
    box(0.34, 0.13, 0.04, -0.62, 0.72, 2.12, LENS),
    box(0.36, 0.13, 0.04, 0.6, 0.8, -2.13, LENS_RED),
    box(0.36, 0.13, 0.04, -0.6, 0.8, -2.13, LENS_RED),
    box(0.46, 0.12, 0.02, 0, 0.58, -2.165, PLATE),
    box(1.78, 0.08, 3.0, 0, 0.3, 0, DARK), // sill
    cyl(0.42, 1.77, 0, 0.36, 1.32, DARK, 'x', 10), // wheel arches
    cyl(0.42, 1.77, 0, 0.36, -1.32, DARK, 'x', 10),
    ...wheel(0.32, 0.2, 0.8, 0.32, 1.32),
    ...wheel(0.32, 0.2, -0.8, 0.32, 1.32),
    ...wheel(0.32, 0.2, 0.8, 0.32, -1.32),
    ...wheel(0.32, 0.2, -0.8, 0.32, -1.32),
  ];

  return { paint, detail, lamps: lampSet(0.34, 0.13, 0.62, 0.72, 2.15, -2.16), doubleSide: false };
}

// ---------------------------------------------------------------------------
// City bus
// ---------------------------------------------------------------------------
function bus() {
  const STRIPE = 0xe8dfc8;
  const paint = [
    profile([[-5.25, 0.45], [-5.25, 2.95], [-5.1, 3.06], [4.7, 3.06], [5.05, 2.92], [5.25, 1.5], [5.25, 0.45]], 2.5, 0xffffff, 0.06),
    box(1.5, 0.2, 2.4, 0, 3.14, -1.2, 0xc4c4c4), // roof vent housing
  ];

  const detail = [
    box(2.53, 0.34, 10.36, 0, 0.6, 0, 0x2a2c2e), // skirt
    box(2.53, 0.16, 10.4, 0, 1.4, 0, STRIPE),
    box(2.53, 0.05, 10.4, 0, 1.27, 0, 0x8c1a16),
    strut(5.26, 1.6, 5.07, 2.84, 0, 2.28, 0.02, GLASS, 0.02), // windscreen
    box(2.0, 0.7, 0.02, 0, 2.3, -5.26, GLASS), // rear window
    box(0.9, 0.2, 0.02, 0.55, 1.78, 5.29, PLATE), // route board in the screen
    box(1.3, 0.36, 0.04, 0, 1.12, 5.26, DARK), // grille
    box(2.54, 0.3, 0.14, 0, 0.58, 5.24, DARK), // bumpers
    box(2.54, 0.3, 0.14, 0, 0.58, -5.24, DARK),
    box(0.4, 0.2, 0.04, 0.9, 1.05, 5.26, LENS),
    box(0.4, 0.2, 0.04, -0.9, 1.05, 5.26, LENS),
    box(0.26, 0.4, 0.04, 1.0, 1.2, -5.26, LENS_RED),
    box(0.26, 0.4, 0.04, -1.0, 1.2, -5.26, LENS_RED),
    box(0.5, 0.13, 0.02, 0, 0.9, -5.27, PLATE),
    box(0.08, 0.4, 0.06, 1.36, 2.3, 4.98, DARK), // mirrors
    box(0.08, 0.4, 0.06, -1.36, 2.3, 4.98, DARK),
    box(0.16, 0.04, 0.04, 1.3, 2.48, 4.98, DARK),
    box(0.16, 0.04, 0.04, -1.3, 2.48, 4.98, DARK),
    // Kerb-side passenger door.
    box(0.02, 1.95, 0.95, 1.26, 1.5, 3.95, GLASS),
    box(0.03, 1.95, 0.05, 1.262, 1.5, 3.95, DARK),
    cyl(0.64, 2.53, 0, 0.5, 3.0, DARK, 'x', 10), // wheel arches
    cyl(0.64, 2.53, 0, 0.5, -3.2, DARK, 'x', 10),
    ...wheel(0.5, 0.3, 1.1, 0.5, 3.0),
    ...wheel(0.5, 0.3, -1.1, 0.5, 3.0),
    ...wheel(0.5, 0.3, 1.1, 0.5, -3.2),
    ...wheel(0.5, 0.3, -1.1, 0.5, -3.2),
  ];
  // Window bays with pillars between them; the door takes the front kerb-side bay.
  for (let i = 0; i < 8; i++) {
    const z = -4.45 + i * 1.12;
    if (i < 7) detail.push(box(0.02, 0.82, 0.98, 1.26, 2.22, z, GLASS));
    detail.push(box(0.02, 0.82, 0.98, -1.26, 2.22, z, GLASS));
  }

  return { paint, detail, lamps: lampSet(0.4, 0.2, 0.9, 1.05, 5.29, -5.29), doubleSide: false };
}

/**
 * The bus as its PASSENGER sees it (streetlife/rides.js). bus() above is a
 * closed shell with dark panels stuck on for windows: right from the street,
 * but from a seat inside the back-face-culled walls vanish and the "glass"
 * hangs in the air as opaque black slabs in front of the camera. This variant
 * has the same outline built from panels instead, with real open window bays
 * (every Dhaka bus runs with them open), a floor, seats, grab rails, a
 * dashboard and the driver. Only ever built when a bus is actually hailed.
 */
function busCabin() {
  const STRIPE = 0xe8dfc8;
  const SEAT = 0x2f4a6b;
  const FLOOR = 0x3a3d40;
  const paint = [
    box(2.5, 0.08, 10.4, 0, 3.04, 0, 0xffffff), // roof
    box(2.5, 1.5, 0.06, 0, 1.2, -5.22, 0xffffff), // rear wall, below its window
    box(2.5, 0.4, 0.06, 0, 2.86, -5.22, 0xffffff),
    box(0.25, 0.7, 0.06, 1.125, 2.3, -5.22, 0xffffff),
    box(0.25, 0.7, 0.06, -1.125, 2.3, -5.22, 0xffffff),
    box(2.5, 1.15, 0.06, 0, 1.03, 5.22, 0xffffff), // front, below the screen
    box(2.5, 0.22, 0.06, 0, 2.95, 5.18, 0xffffff),
    box(0.1, 1.25, 0.1, 1.2, 2.22, 5.15, 0xffffff), // A pillars
    box(0.1, 1.25, 0.1, -1.2, 2.22, 5.15, 0xffffff),
    box(1.5, 0.2, 2.4, 0, 3.14, -1.2, 0xc4c4c4), // roof vent housing
  ];
  for (const side of [1, -1]) {
    paint.push(box(0.06, 1.36, 10.4, side * 1.22, 1.13, 0, 0xffffff)); // wall below the windows
    paint.push(box(0.06, 0.43, 10.4, side * 1.22, 2.845, 0, 0xffffff)); // and above them
    // Pillars between the eight window bays (same spacing as bus()).
    for (let i = 0; i <= 8; i++) {
      paint.push(box(0.06, 0.82, 0.14, side * 1.22, 2.22, -5.01 + i * 1.12, 0xffffff));
    }
  }

  const detail = [
    box(2.4, 0.06, 10.3, 0, 0.85, 0, FLOOR),
    box(2.53, 0.34, 10.36, 0, 0.6, 0, 0x2a2c2e), // skirt (under the floor)
    box(1.3, 0.36, 0.04, 0, 1.12, 5.26, DARK), // grille
    box(2.54, 0.3, 0.14, 0, 0.58, 5.24, DARK), // bumpers
    box(2.54, 0.3, 0.14, 0, 0.58, -5.24, DARK),
    box(0.4, 0.2, 0.04, 0.9, 1.05, 5.26, LENS),
    box(0.4, 0.2, 0.04, -0.9, 1.05, 5.26, LENS),
    box(0.26, 0.4, 0.04, 1.0, 1.2, -5.26, LENS_RED),
    box(0.26, 0.4, 0.04, -1.0, 1.2, -5.26, LENS_RED),
    box(0.5, 0.13, 0.02, 0, 0.9, -5.27, PLATE),
    box(0.08, 0.4, 0.06, 1.36, 2.3, 4.98, DARK), // mirrors
    box(0.08, 0.4, 0.06, -1.36, 2.3, 4.98, DARK),
    cyl(0.64, 2.53, 0, 0.5, 3.0, DARK, 'x', 10), // wheel arches (they hump the floor inside, too)
    cyl(0.64, 2.53, 0, 0.5, -3.2, DARK, 'x', 10),
    ...wheel(0.5, 0.3, 1.1, 0.5, 3.0),
    ...wheel(0.5, 0.3, -1.1, 0.5, 3.0),
    ...wheel(0.5, 0.3, 1.1, 0.5, -3.2),
    ...wheel(0.5, 0.3, -1.1, 0.5, -3.2),
    // Cab: dashboard, wheel, and the driver on the right (-X; front is +Z).
    box(2.4, 0.4, 0.5, 0, 1.5, 4.85, DARK),
    cyl(0.2, 0.03, -0.7, 1.85, 4.55, DARK, 'z', 10),
    box(0.5, 0.12, 0.5, -0.7, 1.35, 4.15, SEAT),
    box(0.5, 0.7, 0.08, -0.7, 1.7, 3.9, SEAT),
    box(0.42, 0.55, 0.26, -0.7, 1.72, 4.12, 0x4a5560),
    ball(0.12, -0.7, 2.13, 4.14, SKIN),
    // Grab rails under the roof, either side of the aisle.
    cyl(0.02, 8.4, 0.42, 2.82, -0.6, CHROME, 'z', 6),
    cyl(0.02, 8.4, -0.42, 2.82, -0.6, CHROME, 'z', 6),
  ];
  for (const side of [1, -1]) {
    // The livery stripes, as strips on the wall rather than slabs through the cabin.
    detail.push(box(0.02, 0.16, 10.4, side * 1.255, 1.4, 0, STRIPE));
    detail.push(box(0.02, 0.05, 10.4, side * 1.255, 1.27, 0, 0x8c1a16));
    // Eight rows of double seats; the kerb-side (+X) front row is where the door is.
    for (let row = 0; row < 8; row++) {
      const z = -4.3 + row * 0.95;
      detail.push(box(0.86, 0.1, 0.46, side * 0.74, 1.3, z, SEAT));
      detail.push(box(0.86, 0.62, 0.08, side * 0.74, 1.64, z - 0.24, SEAT));
    }
  }

  return { paint, detail };
}

const HIRE_BUILDERS = { bus: busCabin, cng: () => cng(true) };
const hireCache = new Map();

/**
 * Geometry for a vehicle the player RIDES IN (streetlife/rides.js), where the
 * street model does not work from the inside; null for types that are fine
 * as they are. Built on first use, i.e. only once one is actually hailed.
 * @returns {{ paint: THREE.BufferGeometry | null, detail: THREE.BufferGeometry } | null}
 */
export function hireGeometry(type) {
  if (!HIRE_BUILDERS[type]) return null;
  if (!hireCache.has(type)) {
    const { paint, detail } = HIRE_BUILDERS[type]();
    hireCache.set(type, { paint: paint ? mergeGeometries(paint) : null, detail: mergeGeometries(detail) });
  }
  return hireCache.get(type);
}

// ---------------------------------------------------------------------------
// Motorbike and rider
// ---------------------------------------------------------------------------
function bike() {
  const JACKET = 0x3c4450;
  const JEANS = 0x2a3140;

  const paint = [
    profile([[-0.12, 0.72], [-0.12, 0.9], [0.34, 0.99], [0.5, 0.86], [0.44, 0.72]], 0.28, 0xffffff, 0.03), // tank
    box(0.2, 0.05, 0.5, 0, 0.72, -0.72, 0xffffff), // rear fender
    box(0.16, 0.04, 0.4, 0, 0.66, 0.72, 0xe0e0e0), // front fender
    box(0.24, 0.16, 0.3, 0, 0.7, -0.35, 0xd0d0d0), // side covers
  ];

  const leg = (side) => [
    strut(-0.2, 0.98, 0.16, 0.8, side * 0.15, 0.13, 0.13, JEANS),
    strut(0.16, 0.8, 0.02, 0.42, side * 0.16, 0.1, 0.1, JEANS),
    box(0.1, 0.07, 0.24, side * 0.16, 0.4, 0.08, DARK),
    strut(0.08, 1.42, 0.46, 1.08, side * 0.24, 0.08, 0.08, JACKET),
  ];

  const detail = [
    ...wheel(0.31, 0.1, 0, 0.31, 0.72),
    ...wheel(0.31, 0.12, 0, 0.31, -0.72),
    strut(0.72, 0.31, 0.5, 1.02, 0.07, 0.035, 0.035, CHROME), // forks
    strut(0.72, 0.31, 0.5, 1.02, -0.07, 0.035, 0.035, CHROME),
    cyl(0.016, 0.62, 0, 1.08, 0.48, DARK), // handlebar
    cyl(0.09, 0.1, 0, 0.94, 0.62, LENS, 'z', 8), // headlamp
    box(0.24, 0.08, 0.62, 0, 0.9, -0.38, DARK), // seat
    box(0.22, 0.28, 0.36, 0, 0.5, 0.06, 0x55595c), // engine
    strut(0.3, 0.72, -0.72, 0.31, 0, 0.05, 0.05, DARK), // swingarm
    cyl(0.045, 0.72, -0.15, 0.4, -0.5, CHROME, 'z', 8), // exhaust
    box(0.1, 0.06, 0.03, 0, 0.78, -0.98, LENS_RED),
    box(0.2, 0.1, 0.02, 0, 0.62, -0.99, PLATE),
    // Rider.
    box(0.32, 0.2, 0.26, 0, 1.02, -0.2, JEANS),
    strut(-0.2, 1.06, 0.1, 1.5, 0, 0.38, 0.22, JACKET),
    ball(0.15, 0, 1.68, 0.16, 0x1e1e22),
    box(0.22, 0.09, 0.04, 0, 1.69, 0.29, GLASS), // visor
    ...leg(1), ...leg(-1),
  ];

  const lamps = [
    cyl(0.09, 0.05, 0, 0.94, 0.68, HEAD_LIT, 'z', 8),
    box(0.1, 0.06, 0.04, 0, 0.78, -1.0, TAIL_LIT),
  ];

  return { paint, detail, lamps, doubleSide: false };
}

// ---------------------------------------------------------------------------
// Far models: the same silhouettes in a handful of boxes, for vehicles past
// LOD range (traffic.js). ONE mesh per type, tinted by instanceColor, so the
// fixed-colour parts are kept dark enough that the tint cannot show on them.
// ---------------------------------------------------------------------------
const FAR_DARK = 0x0c0c0c;
const farWheel = (r, w, x, z) => cyl(r, w, x, r, z, FAR_DARK, 'x', 6);

const FAR = {
  rickshaw() {
    const hood = new THREE.CylinderGeometry(0.62, 0.62, 0.98, 5, 1, true, 0, Math.PI);
    hood.rotateZ(Math.PI / 2);
    hood.rotateY(Math.PI / 2);
    hood.translate(0, 1.16, -0.42);
    return [
      tint(hood, 0xffffff),
      box(0.9, 0.5, 0.04, 0, 0.86, -0.93, 0xc8c8c8),
      box(0.92, 0.3, 0.95, 0, 0.62, -0.45, 0x1a1a1a),
      box(0.3, 0.75, 0.3, 0, 1.3, 0.45, 0x2a2a2a), // puller
      box(0.06, 0.6, 1.0, 0, 0.7, 0.55, FAR_DARK), // frame
      farWheel(0.34, 0.05, 0, 1.05), farWheel(0.34, 0.05, 0.52, -0.6), farWheel(0.34, 0.05, -0.52, -0.6),
    ];
  },
  cng() {
    return [
      profile([[-1.25, 0.3], [-1.3, 1.0], [0.78, 1.0], [1.3, 0.78], [1.36, 0.46], [1.22, 0.3]], 1.3, 0x1f7a3d),
      box(1.36, 0.17, 2.1, 0, 1.64, -0.25, FAR_DARK),
      box(1.2, 0.56, 1.9, 0, 1.27, -0.3, 0x10150f),
      farWheel(0.26, 0.12, 0, 1.02), farWheel(0.26, 0.14, 0.6, -0.8), farWheel(0.26, 0.14, -0.6, -0.8),
    ];
  },
  car() {
    return [
      profile([[-2.13, 0.28], [-2.1, 0.94], [-1.45, 1.0], [-0.95, 1.42], [0.35, 1.45], [1.05, 1.02], [2.0, 0.86], [2.12, 0.28]], 1.74, 0xffffff),
      profile([[-1.4, 1.04], [-0.95, 1.4], [0.33, 1.42], [1.0, 1.04]], 1.76, FAR_DARK),
      farWheel(0.32, 1.78, 0, 1.32), farWheel(0.32, 1.78, 0, -1.32),
    ];
  },
  bus() {
    return [
      profile([[-5.25, 0.45], [-5.25, 3.0], [4.8, 3.06], [5.05, 2.92], [5.25, 1.5], [5.25, 0.45]], 2.5, 0xffffff),
      box(2.53, 0.82, 8.9, 0, 2.22, -0.55, FAR_DARK),
      box(2.3, 1.2, 0.04, 0, 2.22, 5.19, FAR_DARK),
      farWheel(0.5, 2.54, 0, 3.0), farWheel(0.5, 2.54, 0, -3.2),
    ];
  },
  bike() {
    return [
      box(0.26, 0.3, 1.0, 0, 0.78, 0, 0xffffff),
      box(0.36, 0.8, 0.4, 0, 1.3, -0.05, 0x1c1c1c),
      box(0.26, 0.26, 0.26, 0, 1.68, 0.16, FAR_DARK),
      farWheel(0.31, 0.1, 0, 0.72), farWheel(0.31, 0.12, 0, -0.72),
    ];
  },
};

const BUILDERS = { rickshaw, cng, car, bus, bike };
const cache = new Map();

/**
 * @param {keyof typeof BUILDERS} type
 * @returns {{ paint: THREE.BufferGeometry | null, detail: THREE.BufferGeometry, lamps: THREE.BufferGeometry | null, far: THREE.BufferGeometry, doubleSide: boolean }}
 */
export function vehicleGeometry(type) {
  if (!cache.has(type)) {
    const { paint, detail, lamps, doubleSide } = BUILDERS[type]();
    cache.set(type, {
      paint: paint ? mergeGeometries(paint) : null,
      detail: mergeGeometries(detail),
      lamps: lamps ? mergeGeometries(lamps) : null,
      far: mergeGeometries(FAR[type]()),
      doubleSide,
    });
  }
  return cache.get(type);
}
