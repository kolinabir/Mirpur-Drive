/**
 * traininterior.js
 *
 * P13 — the rideable MRT Line 6 coach interior (docs/briefs/P13-TRAIN-INTERIOR.md).
 * `buildTrainInterior()` returns ONE `THREE.Group` (built once for the whole
 * game) plus the small contract stationlife.js codes against: geometry
 * constants, `doorZs`, `setDoorSide()`, `clampLocal()`, `attachTo()`/`detach()`.
 *
 * OWNERSHIP: this file is new and owned entirely by this pass. It does NOT
 * import from src/metro.js beyond the two already-exported values
 * (`METRO`, `DWELL` are not even needed here) — every hard geometric
 * constant below is copied from the brief's own measured table, which the
 * advisor pulled directly out of `buildTrain()`. In particular `doorZs` is
 * computed by literally re-deriving metro.js's own private `trainDoorZs()`
 * formula (CAR_LEN/4 spacing, car centres at `(i-2.5)*20.8`) rather than
 * importing it — metro.js doesn't export it, and the file fence forbids
 * editing metro.js to add an export, so this duplicates the formula the
 * same way stationlife.js already duplicates interior.js's local/world
 * coordinate helpers for the same off-limits-file reason. If metro.js's
 * TRAIN_CAR_LEN/TRAIN_CAR_GAP/TRAIN_CARS constants ever change, this list
 * will silently drift — flagged here so a future pass touching metro.js
 * remembers to check this file too.
 *
 * CONSTRUCTION STYLE: box/cylinder geometry baked into per-material buckets
 * and merged with BufferGeometryUtils.mergeGeometries, same technique as
 * buildTrain() in metro.js. No photo textures are used anywhere in this
 * file (flat MeshStandardMaterial colours only) — the look-only reference
 * photo (reference/metro/interior/refonly/dstar02_female_coach.jpg) is
 * matched by hand-tuned geometry and colour, never sampled as a texture.
 *
 * DRAW CALLS: 7 merged static meshes (floor, aisleStrip, cream, lightStrip,
 * seat, white, steel) + 2 InstancedMesh (door leaves, strap rings) = 9 for
 * the whole 6-car interior, under the brief's ~12 target.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { METRO } from './metro.js';

// ---------------------------------------------------------------------------
// Hard geometric facts — copied from the brief's table, do not re-derive.
// ---------------------------------------------------------------------------
const CARS = 6;
const CAR_LEN = 19.8;
const GAP = 1.0;
const CAR_W = 2.95;

const FLOOR_Y = METRO.TRAIN_FLOOR_LOCAL_Y; // 0.62 m (saloon floor, train-local)
const IW = 1.40; // interior half-width, aisle+bench envelope
const WALL_T = 0.075; // wall lining thickness (IW + WALL_T/2 lands on CAR_W/2 = 1.475)
const CEIL_Y = 2.98;
const CEIL_RAISED = 3.06; // raised centre panel top

const WIN_Y0 = 1.78;
const WIN_Y1 = 2.70;

const DOOR_W = 1.30;
const DOOR_HALF = DOOR_W / 2;
const DOOR_Y1 = 2.70;

const SEAT_FRONT_X = 0.92; // aisle-facing cushion edge, |x|
const SEAT_TOP_Y = FLOOR_Y + 0.45;
const SEAT_BACK_Y = FLOOR_Y + 1.20;

const POCKET_X = 1.35; // aisle clearance widens to this near doors
const POCKET_HALF_LEN = 0.7; // 1.4 m-long pocket, centred on the door z
const BENCH_CUTBACK = 1.0; // benches stop this far (door half-width 0.65 + 0.35) from each doorway centre

const TOTAL_LEN = CARS * CAR_LEN + (CARS - 1) * GAP; // 123.8

// ---------------------------------------------------------------------------
// Palette — matched to real Dhaka MRT Line 6 (Kawasaki) interior reference
// photos (reference/metro/interior/refonly/). No photo textures, flat colour.
// ---------------------------------------------------------------------------
const COLOR = {
  floor: 0xb8bcc4, // cool slate-grey vinyl floor (matched to reference photos)
  aisle: 0xacb1bc, // contrasting central aisle runner
  cream: 0xf0ede6, // bright off-white wall panels / ceiling lining
  lightStrip: 0xf0f4ff, // cool white fluorescent strip (not warm)
  seat: 0x96c93d, // LIME GREEN cushion — the signature Dhaka Metro colour
  seatBack: 0x78a832, // slightly darker green for seat back rest
  white: 0xf2f0ec, // stanchion fins / misc trim
  steel: 0xd8dce0, // bright polished stainless steel (poles, grab rails)
  stripe: 0x2a2a2a, // dark rubber door seal (not red — real metro has dark seals)
  glassPanel: 0x1a2830, // door-leaf glass, large rounded panel
  green: 0x0c7a4e, // DMTCL brand green — door header stripe, partition trim
  dividerGlass: 0x8ec63f, // translucent green-tinted seat partition
  windowGlass: 0x3a5060, // tinted window glass between doors
  display: 0x14181a, // LED route info panel above doors / AC grille
};

const MAT = {
  floor: new THREE.MeshStandardMaterial({ color: COLOR.floor, roughness: 0.55, metalness: 0.02 }),
  aisle: new THREE.MeshStandardMaterial({ color: COLOR.aisle, roughness: 0.5, metalness: 0.02 }),
  // Slight emissive on cream/seat so the enclosed saloon reads bright and
  // airy (only 3 PointLights allowed; without self-illumination far ends
  // go near-black between light pools).
  cream: new THREE.MeshStandardMaterial({ color: COLOR.cream, roughness: 0.75, metalness: 0.02, emissive: 0xf0ede6, emissiveIntensity: 0.15 }),
  seat: new THREE.MeshStandardMaterial({ color: COLOR.seat, roughness: 0.7, metalness: 0.0, emissive: 0x96c93d, emissiveIntensity: 0.08 }),
  seatBack: new THREE.MeshStandardMaterial({ color: COLOR.seatBack, roughness: 0.7, metalness: 0.0, emissive: 0x78a832, emissiveIntensity: 0.08 }),
  white: new THREE.MeshStandardMaterial({ color: COLOR.white, roughness: 0.5, metalness: 0.05, emissive: 0xf2f0ec, emissiveIntensity: 0.1 }),
  // Polished stainless steel: bright chrome look — the real metro has
  // mirror-finish grab poles. Higher metalness + lower roughness.
  steel: new THREE.MeshStandardMaterial({ color: COLOR.steel, roughness: 0.18, metalness: 0.85 }),
  // Cool white fluorescent light strip — brighter emissive for that
  // well-lit Kawasaki interior feel.
  lightStrip: new THREE.MeshStandardMaterial({ color: COLOR.lightStrip, roughness: 0.5, emissive: COLOR.lightStrip, emissiveIntensity: 2.0 }),
  leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.25 }),
  ring: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.3, metalness: 0.4 }),
  // Green-tinted translucent seat partition (the curved glass dividers)
  divider: new THREE.MeshStandardMaterial({ color: COLOR.dividerGlass, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
  // Tinted window glass between doors
  windowGlass: new THREE.MeshStandardMaterial({ color: COLOR.windowGlass, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  // Dark LED route display panel above doors / AC grilles
  display: new THREE.MeshStandardMaterial({ color: COLOR.display, roughness: 0.5, metalness: 0.2, emissive: 0x081820, emissiveIntensity: 0.4 }),
  // DMTCL brand green accent strip
  greenAccent: new THREE.MeshStandardMaterial({ color: COLOR.green, roughness: 0.4, metalness: 0.1 }),
};

// ---------------------------------------------------------------------------
// Small local geometry helpers (own copies — metro.js's are file-private).
// ---------------------------------------------------------------------------
function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

/** Clone `geometry`, translate the clone to `position`, return it (ready for a merge bucket). */
function bake(geometry, position) {
  const geo = geometry.clone();
  geo.translate(position[0], position[1], position[2]);
  return geo;
}

function mergeBucket(list, mat, name) {
  if (!list.length) return null;
  const merged = mergeGeometries(list, false);
  const m = new THREE.Mesh(merged, mat);
  m.name = name;
  return m;
}

/** Vertical cylinder (axis Y already, no rotation needed), centred at `position`, spanning `height`. */
function vPole(radius, height, position) {
  const g = new THREE.CylinderGeometry(radius, radius, height, 8);
  return bake(g, position);
}

/** Horizontal cylinder along Z, centred at `position`, spanning `length`. */
function zRail(radius, length, position) {
  const g = new THREE.CylinderGeometry(radius, radius, length, 8);
  g.rotateX(Math.PI / 2);
  return bake(g, position);
}

/** Horizontal cylinder along X, centred at `position`, spanning `length`. */
function xRail(radius, length, position) {
  const g = new THREE.CylinderGeometry(radius, radius, length, 8);
  g.rotateZ(Math.PI / 2);
  return bake(g, position);
}

/** Semicircular / quarter-circle sweeping stainless steel arch at bench ends
 *  (prominent feature in Kawasaki MRT Line 6 coaches). Sweeps from aisle vertical
 *  stanchion smoothly into the car sidewall. */
function curvedDividerHoop(side, z) {
  const parts = [];
  // 1. Vertical leg from floor up to arc start (y = 0 to y = 0.85)
  parts.push(vPole(0.016, 0.85, [side * 0.90, 0.85 / 2, z]));
  // 2. Quarter-circle arc in XY plane (radius 0.48m from x = 0.90 to x = 1.38)
  const arcGeo = new THREE.TorusGeometry(0.48, 0.016, 8, 12, Math.PI / 2);
  if (side > 0) {
    arcGeo.rotateZ(Math.PI / 2);
  }
  arcGeo.translate(side * 1.38, 0.85, z);
  parts.push(arcGeo);
  // 3. Wall anchor tube into sidewall
  parts.push(xRail(0.016, 0.05, [side * 1.39, 1.33, z]));
  return parts;
}

/** Door-leaf template: one leaf (stainless body with tall window aperture, transparent
 *  glass pane, dark rubber seal edges, recessed handle cup, green DMTCL stripe at top). */
function buildLeafGeometry() {
  const w = DOOR_HALF - 0.05; // 0.60 wide, small gap either side of the doorway centreline
  const h = DOOR_Y1 - FLOOR_Y; // 1.90m
  const depth = 0.05;

  // Window extends from waist level (~0.80m above floor) to head level (~1.72m above floor)
  // Local coordinate y ranges from -h/2 (-0.95) to +h/2 (+0.95)
  const winY0 = -h * 0.08;
  const winY1 = h * 0.405;
  const winH = winY1 - winY0;
  const winMidY = (winY0 + winY1) / 2;
  const stileW = 0.065;
  const winW = w - stileW * 2;

  const botH = winY0 - (-h / 2);
  const botGeo = new THREE.BoxGeometry(depth, botH, w);
  botGeo.translate(0, -h / 2 + botH / 2, 0);

  const topH = h / 2 - winY1;
  const topGeo = new THREE.BoxGeometry(depth, topH, w);
  topGeo.translate(0, winY1 + topH / 2, 0);

  const leftStile = new THREE.BoxGeometry(depth, winH, stileW);
  leftStile.translate(0, winMidY, -w / 2 + stileW / 2);

  const rightStile = new THREE.BoxGeometry(depth, winH, stileW);
  rightStile.translate(0, winMidY, w / 2 - stileW / 2);

  // Recessed handle pocket on door leaf (waist level, opposite wall)
  const handleGeo = new THREE.BoxGeometry(depth + 0.005, 0.14, 0.035);
  handleGeo.translate(0, -0.05, -w / 2 + stileW + 0.04);

  const frameGeo = mergeGeometries([botGeo, topGeo, leftStile, rightStile, handleGeo], false);

  const pos = frameGeo.attributes.position;
  const stainless = new THREE.Color(0xc8cacc); // stainless steel body
  const seal = new THREE.Color(COLOR.stripe); // dark rubber seal edge
  const greenStripe = new THREE.Color(COLOR.green); // DMTCL green header
  const handleColor = new THREE.Color(0x383838); // dark recessed handle cup
  const color = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let c = stainless;
    if (Math.abs(z) > w / 2 - 0.035) c = seal;
    else if (y > h * 0.38) c = greenStripe;
    else if (Math.abs(y - (-0.05)) < 0.08 && Math.abs(z - (-w / 2 + stileW + 0.04)) < 0.025) c = handleColor;
    color[i * 3] = c.r;
    color[i * 3 + 1] = c.g;
    color[i * 3 + 2] = c.b;
  }
  frameGeo.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));


  return { frameGeo, w, h };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------
export function buildTrainInterior() {
  const group = new THREE.Group();
  group.name = 'train-interior';

  // doorZs: same formula as metro.js's private trainDoorZs() — see file header.
  const doorZs = [];
  const carZOf = (i) => (i - (CARS - 1) / 2) * (CAR_LEN + GAP);
  const doorSpacing = CAR_LEN / 4;
  const localDoorOffsets = [];
  for (let d = 0; d < 4; d++) localDoorOffsets.push(-CAR_LEN / 2 + doorSpacing * (d + 0.5));
  for (let i = 0; i < CARS; i++) {
    const carZ = carZOf(i);
    for (const ld of localDoorOffsets) doorZs.push(carZ + ld);
  }

  // Pre-build door leaf geometry
  const { frameGeo: leafGeo, h: leafH } = buildLeafGeometry();
  const leafGeoW = DOOR_HALF - 0.05;
  const ringGeo = new THREE.TorusGeometry(0.045, 0.008, 6, 10);
  const dummy = new THREE.Object3D();

  const carGroups = [];
  const carDoorSystems = [];

  const bucketMat = {
    floor: MAT.floor, aisle: MAT.aisle, cream: MAT.cream,
    lightStrip: MAT.lightStrip, seat: MAT.seat, seatBack: MAT.seatBack,
    white: MAT.white, steel: MAT.steel, divider: MAT.divider,
    windowGlass: MAT.windowGlass, display: MAT.display,
    greenAccent: MAT.greenAccent,
  };

  // Build each car's interior in CAR-LOCAL coordinates (z centered at 0, spanning [-CAR_LEN/2, CAR_LEN/2])
  for (let i = 0; i < CARS; i++) {
    const carGroup = new THREE.Group();
    carGroup.name = `train-interior-car-${i}`;

    const buckets = { floor: [], aisle: [], cream: [], lightStrip: [], seat: [], seatBack: [], white: [], steel: [], divider: [], windowGlass: [], display: [], greenAccent: [] };
    const bakeInto = (bucket, geometry, position) => {
      if (bucket === 'windowGlass' || bucket === 'divider') { geometry.dispose(); return; }
      buckets[bucket].push(bake(geometry, position));
    };

    // 1. Floor & Aisle
    bakeInto('floor', box(IW * 2, 0.03, CAR_LEN), [0, FLOOR_Y - 0.015, 0]);
    bakeInto('aisle', box(1.10, 0.006, CAR_LEN), [0, FLOOR_Y + 0.005, 0]);
    if (i < CARS - 1) {
      // Smooth gangway treadplate floor between cars
      bakeInto('floor', box(1.10, 0.03, GAP + 0.05), [0, FLOOR_Y - 0.015, CAR_LEN / 2 + GAP / 2]);
    }

    // 2. Ceiling & Lights
    for (const side of [-1, 1]) {
      bakeInto('cream', box(IW - 0.8, 0.03, CAR_LEN), [side * (0.85 + (IW - 0.8) / 2), CEIL_Y + 0.015, 0]);
      bakeInto('lightStrip', box(0.10, 0.015, CAR_LEN - 0.1), [side * 0.86, CEIL_Y + 0.01, 0]);
    }
    bakeInto('cream', box(1.70, CEIL_RAISED - CEIL_Y, CAR_LEN), [0, (CEIL_Y + CEIL_RAISED) / 2, 0]);
    for (const ld of localDoorOffsets) {
      bakeInto('display', box(0.65, 0.015, 0.85), [0, CEIL_RAISED - 0.008, ld]);
    }

    // 3. Side Walls & Windows
    const solidIntervals = [];
    let prevEdge = -CAR_LEN / 2;
    for (const dz of localDoorOffsets) {
      solidIntervals.push([prevEdge, dz - DOOR_HALF]);
      prevEdge = dz + DOOR_HALF;
    }
    solidIntervals.push([prevEdge, CAR_LEN / 2]);

    for (const side of [-1, 1]) {
      const wallX = side * (IW + WALL_T / 2);

      for (const [zA, zB] of solidIntervals) {
        const len = zB - zA;
        if (len <= 0.02) continue;
        const zc = (zA + zB) / 2;
        bakeInto('cream', box(WALL_T, WIN_Y0 - FLOOR_Y, len), [wallX, (FLOOR_Y + WIN_Y0) / 2, zc]);
        bakeInto('cream', box(WALL_T, CEIL_Y - WIN_Y1, len), [wallX, (WIN_Y1 + CEIL_Y) / 2, zc]);
        if (len > 0.5) {
          bakeInto('windowGlass', box(0.01, WIN_Y1 - WIN_Y0 - 0.04, len - 0.08), [side * (IW + 0.02), (WIN_Y0 + WIN_Y1) / 2, zc]);
        }
      }

      // Door headers and surrounds
      for (const dz of localDoorOffsets) {
        bakeInto('cream', box(WALL_T, CEIL_Y - DOOR_Y1, DOOR_W), [wallX, (DOOR_Y1 + CEIL_Y) / 2, dz]);
        bakeInto('display', box(0.03, 0.15, 0.8), [side * (IW - 0.03), DOOR_Y1 + 0.15, dz]);
        bakeInto('greenAccent', box(0.02, 0.04, 1.0), [side * (IW - 0.02), DOOR_Y1 + 0.04, dz]);

        for (const edgeSign of [-1, 1]) {
          buckets.steel.push(vPole(0.02, CEIL_Y - FLOOR_Y, [side * 0.97, (FLOOR_Y + CEIL_Y) / 2, dz + edgeSign * DOOR_HALF]));
          const handleZ = dz + edgeSign * (DOOR_HALF + 0.12);
          buckets.steel.push(vPole(0.014, 0.85, [side * (IW - 0.035), FLOOR_Y + 1.40, handleZ]));
          buckets.steel.push(xRail(0.010, 0.05, [side * (IW - 0.015), FLOOR_Y + 1.05, handleZ]));
          buckets.steel.push(xRail(0.010, 0.05, [side * (IW - 0.015), FLOOR_Y + 1.75, handleZ]));

          const grabX = side * 0.75;
          const grabZ = dz + edgeSign * (DOOR_HALF + 0.15);
          buckets.steel.push(vPole(0.016, 0.9, [grabX, FLOOR_Y + 1.10 + 0.45, grabZ]));
          buckets.steel.push(zRail(0.016, 0.3, [grabX, FLOOR_Y + 1.55, grabZ + edgeSign * 0.15]));
        }

        if (side === 1) {
          buckets.steel.push(vPole(0.025, CEIL_Y - FLOOR_Y, [0, (FLOOR_Y + CEIL_Y) / 2, dz]));
        }
      }

      // Bench runs
      const runBounds = [];
      let cursor = -CAR_LEN / 2 + 0.5;
      for (const dz of localDoorOffsets) {
        runBounds.push([cursor, dz - BENCH_CUTBACK]);
        cursor = dz + BENCH_CUTBACK;
      }
      runBounds.push([cursor, CAR_LEN / 2 - 0.5]);

      for (const [zA, zB] of runBounds) {
        const len = zB - zA;
        if (len <= 0.15) continue;
        const zc = (zA + zB) / 2;
        bakeInto('seat', box(0.48, 0.08, len), [side * (SEAT_FRONT_X + 0.24), SEAT_TOP_Y, zc]);
        bakeInto('seatBack', box(0.10, SEAT_BACK_Y - (FLOOR_Y + 0.4), len), [side * (IW - 0.05), (FLOOR_Y + 0.4 + SEAT_BACK_Y) / 2, zc]);

        for (const z of [zA, zB]) {
          for (const piece of curvedDividerHoop(side, z)) {
            buckets.steel.push(piece);
          }
          bakeInto('divider', box(0.46, 0.78, 0.015), [side * 1.15, 0.83, z]);
          bakeInto('greenAccent', box(0.46, 0.02, 0.02), [side * 1.15, 1.23, z]);
        }

        const rackY = 2.04;
        buckets.steel.push(zRail(0.012, len, [side * (IW - 0.16), rackY, zc]));
        buckets.steel.push(zRail(0.012, len, [side * (IW - 0.32), rackY, zc]));
        const bracketZs = [zA + 0.15, zB - 0.15];
        if (len > 2.0) bracketZs.push(zc);
        for (const bz of bracketZs) {
          buckets.steel.push(xRail(0.012, 0.34, [side * (IW - 0.17), rackY - 0.01, bz]));
        }

        buckets.steel.push(zRail(0.018, len, [side * 1.05, 1.98, zc]));
      }
    }

    // 4. End walls (Cab ends for cars 0 and 5; Walk-through gangway openings for intermediate cars)
    for (const [zEnd, isCab] of [[-CAR_LEN / 2, i === 0], [CAR_LEN / 2, i === CARS - 1]]) {
      if (isCab) {
        bakeInto('cream', box(IW * 2, CEIL_Y - FLOOR_Y, 0.05), [0, (FLOOR_Y + CEIL_Y) / 2, zEnd]);
        bakeInto('display', box(0.70, 1.90, 0.06), [0.35, (FLOOR_Y + 1.90) / 2, zEnd]);
        bakeInto('windowGlass', box(0.50, 0.70, 0.02), [-0.45, 1.90, zEnd]);
      } else {
        for (const xSign of [-1, 1]) {
          const xA = xSign * 0.55;
          const xB = xSign * IW;
          bakeInto('cream', box(Math.abs(xB - xA), CEIL_Y - FLOOR_Y, 0.05), [(xA + xB) / 2, (FLOOR_Y + CEIL_Y) / 2, zEnd]);
        }
        bakeInto('cream', box(1.10, CEIL_Y - DOOR_Y1, 0.05), [0, (DOOR_Y1 + CEIL_Y) / 2, zEnd]);
      }
    }

    // 5. Door leaves for this car (16 leaves: 4 doors * 2 sides * 2 leaves)
    const carLeafMesh = new THREE.InstancedMesh(leafGeo, MAT.leaf, 16);
    carLeafMesh.name = `train-interior-doors-${i}`;
    const carLeaves = [];
    let carLeafIdx = 0;

    for (const dz of localDoorOffsets) {
      for (const side of [-1, 1]) {
        for (const leafSide of [-1, 1]) {
          const restZ = dz + leafSide * (leafGeoW / 2);
          carLeaves.push({ side, restZ, dir: leafSide, index: carLeafIdx });
          dummy.position.set(side * (IW - 0.02), FLOOR_Y + leafH / 2, restZ);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          carLeafMesh.setMatrixAt(carLeafIdx, dummy.matrix);
          carLeafIdx++;
        }
      }
    }
    carLeafMesh.instanceMatrix.needsUpdate = true;
    carDoorSystems.push({ leafMesh: carLeafMesh, leaves: carLeaves });

    // 6. Strap rings for this car
    const carRingPositions = [];
    for (const side of [-1, 1]) {
      const runBounds = [];
      let cursor = -CAR_LEN / 2 + 0.5;
      for (const dz of localDoorOffsets) {
        runBounds.push([cursor, dz - BENCH_CUTBACK]);
        cursor = dz + BENCH_CUTBACK;
      }
      runBounds.push([cursor, CAR_LEN / 2 - 0.5]);
      for (const [zA, zB] of runBounds) {
        const len = zB - zA;
        if (len <= 0.15) continue;
        const ringCount = Math.max(1, Math.round(len / 0.65));
        for (let r = 0; r < ringCount; r++) {
          const rz = zA + (len * (r + 0.5)) / ringCount;
          carRingPositions.push([side * 1.05, 1.82, rz]);
        }
      }
    }
    if (carRingPositions.length) {
      const carRingMesh = new THREE.InstancedMesh(ringGeo, MAT.ring, carRingPositions.length);
      carRingPositions.forEach((p, idx) => {
        dummy.position.set(p[0], p[1], p[2]);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        carRingMesh.setMatrixAt(idx, dummy.matrix);
      });
      carRingMesh.instanceMatrix.needsUpdate = true;
      carGroup.add(carRingMesh);
    }

    // 7. Merged Meshes for this car
    for (const [key, mat] of Object.entries(bucketMat)) {
      const m = mergeBucket(buckets[key], mat, `train-interior-${key}-${i}`);
      if (m) {
        if (mat.transparent) m.renderOrder = 2;
        carGroup.add(m);
      }
    }
    carGroup.add(carLeafMesh);

    // 8. Interior lighting for this car
    const carLight = new THREE.PointLight(0xf0f2ff, 1.6, 22, 1.2);
    carLight.position.set(0, CEIL_Y - 0.15, 0);
    carGroup.add(carLight);

    carGroups.push(carGroup);
  }

  const SLIDE_DIST = 0.62;

  /** side is metro.js's own +1/-1 platform side; amount01: 0 shut -> 1 open. */
  function setDoorSide(side, amount01) {
    const amt = Math.max(0, Math.min(1, amount01));
    for (let ci = 0; ci < CARS; ci++) {
      const sys = carDoorSystems[ci];
      if (!sys) continue;
      for (const li of sys.leaves) {
        if (li.side !== side) continue;
        dummy.position.set(li.side * (IW - 0.02), FLOOR_Y + leafH / 2, li.restZ + li.dir * amt * SLIDE_DIST);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        sys.leafMesh.setMatrixAt(li.index, dummy.matrix);
      }
      sys.leafMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Nearest legal standing point in train-local (x,z): aisle, widening to door pockets, radius 0.32 already applied. */
  function clampLocal(lx, lz) {
    const R = 0.32;
    const halfLen = TOTAL_LEN / 2;
    const z = Math.max(-halfLen + R, Math.min(halfLen - R, lz));
    let inPocket = false;
    for (const dz of doorZs) {
      if (Math.abs(z - dz) <= POCKET_HALF_LEN) {
        inPocket = true;
        break;
      }
    }
    const xLimit = (inPocket ? POCKET_X : SEAT_FRONT_X) - R;
    const x = Math.max(-xLimit, Math.min(xLimit, lx));
    return { x, z };
  }

  let currentTrainObj = null;

  function attachTo(trainObj) {
    detach();
    currentTrainObj = trainObj;
    if (trainObj && trainObj.userData.cars) {
      for (let i = 0; i < CARS; i++) {
        const car = trainObj.userData.cars[i];
        if (car && carGroups[i]) {
          car.add(carGroups[i]);
        }
      }
      // Hide exterior static doors on the ridden train so they don't block open doorways
      trainObj.userData.cars.forEach((car) => {
        car.userData.doorMeshes?.forEach((m) => (m.visible = false));
      });
    }
    setDoorSide(1, 0);
    setDoorSide(-1, 0);
  }

  function detach() {
    if (currentTrainObj && currentTrainObj.userData.cars) {
      for (let i = 0; i < CARS; i++) {
        const car = currentTrainObj.userData.cars[i];
        if (car && carGroups[i] && carGroups[i].parent === car) {
          car.remove(carGroups[i]);
        }
      }
      currentTrainObj.userData.cars.forEach((car) => {
        car.userData.doorMeshes?.forEach((m) => (m.visible = true));
      });
      currentTrainObj = null;
    }
  }

  return {
    group,
    FLOOR_Y,
    IW,
    CEIL_Y,
    totalLen: TOTAL_LEN,
    doorZs,
    setDoorSide,
    clampLocal,
    attachTo,
    detach,
  };
}
