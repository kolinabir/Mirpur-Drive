/**
 * mirpur10-bridge.js
 *
 * The Mirpur 10 foot over bridge (মিরপুর - ১০ ফুট ওভার ব্রিজ), hand-modelled
 * from the real structure — the same approach landmarks.js and sangsad.js
 * take for the other real buildings in this scene.
 *
 * PLAN — surveyed, not estimated. Every coordinate below is an OpenStreetMap
 * node converted to this project's metres (+X east, +Z south):
 *   way 344116313  bridge arms W–E, through a shared hub node
 *   way 344116314  bridge arms N–S, through the same hub node
 *   ways 420696376..420696380  the seven stair flights at the four arm ends
 * So the bridge is an X of four arms radiating from one hub over Mirpur 10
 * circle, each arm 20–24 m, each end dropping to the footpath by one or two
 * flights. That X plan is the surveyed shape; I would have guessed a ring.
 *
 * ELEVATION — from Google Street View photospheres over the deck (April
 * 2020, contributor "Asif Ahmed"), transcribed in
 * reference/mirpur10/OBSERVATIONS.md. Red-oxide steel throughout: paired
 * horizontal rails with X cross-bracing between posts, a buff concrete deck
 * with a painted ochre centre strip, and a gabled portal frame at the hub
 * and at each arm end. Hawker stalls under tarpaulins stand along the deck.
 *
 * The hub is a RING, not a solid platform: the MRT-6 viaduct centreline
 * passes 0.9 m from the hub node, so a pier lands inside it. Real Dhaka
 * footbridges are built around such obstructions, and the void also keeps
 * the deck out of the pier geometry metro.js builds.
 *
 * Cost: four draw calls (deck, railings, portals, steps), ~12k triangles, no
 * lights — a light would recompile every material in the world (see
 * drive.js's prewarmDriving).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// --- Surveyed plan ---------------------------------------------------------
const HUB = [184.8, 735.4];
/** Arm ends, and the stair flights that drop from each (OSM ways 420696376..80). */
const ARMS = [
  { name: 'east', end: [205.1, 747.5], stairs: [[207.1, 756.0]] },
  { name: 'south', end: [173.6, 754.4], stairs: [[175.2, 763.1], [164.5, 756.2]] },
  { name: 'west', end: [166.5, 725.9], stairs: [[154.7, 728.7], [162.8, 714.1]] },
  { name: 'north', end: [195.5, 714.6], stairs: [[192.4, 704.0], [205.6, 713.3]] },
];

// --- Dimensions ------------------------------------------------------------
const DECK_TOP = 5.5;      // m: clears the carriageway below
const DECK_T = 0.28;       // deck slab thickness
const ARM_HALF_W = 1.4;    // 2.8 m overall; ~2.4 m clear between railings
const HUB_OUT = 4.2;       // hub ring outer half-extent
const HUB_IN = 2.0;        // hub ring void half-extent — the viaduct pier passes through
const RAIL_H = 1.12;       // railing height above the deck
const PANEL_LEN = 2.2;     // one railing bay
const RISER = 0.163;       // step rise; tread follows from the surveyed flight length

const RED = 0xb0342c;      // red-oxide steel
const DECK_GREY = 0xb9ad93; // buff concrete deck
const STRIPE = 0xcf9f34;    // painted ochre centre strip

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len2 = (v) => Math.hypot(v[0], v[1]);
const unit = (v) => { const l = len2(v) || 1; return [v[0] / l, v[1] / l]; };
const add = (a, v, s) => [a[0] + v[0] * s, a[1] + v[1] * s];
/** Object3D yaw whose local +Z points along the ground direction u. */
const yawOf = (u) => Math.atan2(u[0], u[1]);

/** Box centred at (x,y,z), sized (w,h,d), yawed about Y. */
function box(w, h, d, x, y, z, yaw = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (yaw) g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
}

/**
 * One railing bay, built in local space: the span runs along local Z from
 * -PANEL_LEN/2 to +PANEL_LEN/2, the deck surface is y = 0.
 * Two horizontal rails, a post at each end, and the X cross-brace between.
 */
function railPanelGeometry() {
  const parts = [];
  parts.push(box(0.07, 0.09, PANEL_LEN, 0, RAIL_H - 0.05, 0));        // top rail
  parts.push(box(0.05, 0.07, PANEL_LEN, 0, RAIL_H * 0.52, 0));        // mid rail
  parts.push(box(0.05, 0.06, PANEL_LEN, 0, 0.12, 0));                 // kerb rail
  for (const z of [-PANEL_LEN / 2, PANEL_LEN / 2]) {
    parts.push(box(0.08, RAIL_H, 0.08, 0, RAIL_H / 2, z));            // posts
  }
  // X brace across the lower half, the bay's most recognisable feature.
  const diag = Math.hypot(PANEL_LEN, RAIL_H * 0.52);
  for (const sign of [1, -1]) {
    const g = new THREE.BoxGeometry(0.04, 0.05, diag);
    g.rotateX(sign * Math.atan2(RAIL_H * 0.52, PANEL_LEN));
    g.translate(0, RAIL_H * 0.26, 0);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/**
 * The gabled portal frame: two posts and a shallow pitched roof meeting at a
 * peak over the walkway. Spans local X, walkway runs along local Z.
 */
function portalGeometry() {
  const parts = [];
  const halfW = ARM_HALF_W + 0.25;
  const head = 2.35;
  const peak = 3.05;
  for (const x of [-halfW, halfW]) {
    parts.push(box(0.14, head, 0.14, x, head / 2, 0));
  }
  const rafter = Math.hypot(halfW, peak - head);
  for (const sign of [1, -1]) {
    const g = new THREE.BoxGeometry(rafter, 0.12, 0.12);
    g.rotateZ(sign * Math.atan2(peak - head, halfW));
    g.translate((sign * halfW) / 2, (head + peak) / 2, 0);
    parts.push(g);
  }
  parts.push(box(0.1, 0.26, 0.1, 0, peak + 0.13, 0)); // finial over the peak
  return mergeGeometries(parts);
}

/**
 * @param {{ walkable: object, collision: object }} deps
 * @returns {{ group: THREE.Group, deckY: number, stats: object } | null}
 */
export function buildMirpur10Bridge({ walkable, collision }) {
  const group = new THREE.Group();
  group.name = 'mirpur10-bridge';

  const deckParts = [];
  const stripeParts = [];
  const stepParts = [];
  /** @type {Array<{ x: number, z: number, yaw: number, tilt: number }>} */
  const panels = [];
  /** @type {Array<{ x: number, z: number, yaw: number }>} */
  const portals = [];
  /** @type {Array<[number, number, number, number, number, number]>} */
  const walls = [];

  const deckMid = DECK_TOP - DECK_T / 2;

  /** Railing down one edge, from world A to B, sitting on a deck at height y. */
  function railing(a, b, y, tilt = 0) {
    const d = sub(b, a);
    const length = len2(d);
    if (length < 0.6) return;
    const u = unit(d);
    const yaw = yawOf(u);
    const bays = Math.max(1, Math.round(length / PANEL_LEN));
    for (let i = 0; i < bays; i++) {
      const t = (i + 0.5) / bays;
      panels.push({ x: a[0] + d[0] * t, y: y + (tilt ? 0 : 0), z: a[1] + d[1] * t, yaw, tilt, scale: length / bays / PANEL_LEN });
    }
    // Keep the player on the deck: a wall band from the deck up to the rail.
    walls.push([a[0], a[1], b[0], b[1], y - 0.1, y + RAIL_H]);
  }

  // --- Hub ring ------------------------------------------------------------
  // Four slabs around a central void, in the frame of the W–E arm so the ring
  // lines up with the arms rather than with north.
  const axis = unit(sub(ARMS[0].end, ARMS[2].end));
  const hubYaw = yawOf(axis);
  const cross = [-axis[1], axis[0]];
  const ringMid = (HUB_OUT + HUB_IN) / 2;
  const ringW = HUB_OUT - HUB_IN;
  for (const [along, side] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = HUB[0] + axis[0] * ringMid * along + cross[0] * ringMid * side;
    const cz = HUB[1] + axis[1] * ringMid * along + cross[1] * ringMid * side;
    const w = along ? ringW : HUB_OUT * 2;
    const d = along ? HUB_OUT * 2 : ringW;
    deckParts.push(box(w, DECK_T, d, cx, deckMid, cz, hubYaw));
    walkable.slab(DECK_TOP, cx, cz, w / 2, d / 2, -hubYaw);
  }

  // --- Arms ----------------------------------------------------------------
  for (const arm of ARMS) {
    const u = unit(sub(arm.end, HUB));
    const n = [-u[1], u[0]];
    const yaw = yawOf(u);
    const start = add(HUB, u, HUB_IN + 0.2);
    const end = arm.end;
    const length = len2(sub(end, start));
    const mid = add(start, u, length / 2);

    deckParts.push(box(ARM_HALF_W * 2, DECK_T, length, mid[0], deckMid, mid[1], yaw));
    stripeParts.push(box(0.5, 0.03, length - 0.2, mid[0], DECK_TOP + 0.012, mid[1], yaw));
    walkable.slab(DECK_TOP, mid[0], mid[1], ARM_HALF_W, length / 2, -yaw);

    for (const side of [1, -1]) {
      const a = add(start, n, side * ARM_HALF_W);
      const b = add(end, n, side * ARM_HALF_W);
      railing(a, b, DECK_TOP);
    }

    // One gabled portal per arm, at the head of the stairs, so each span is
    // entered through a gate and you see the next one across the hub. Framing
    // both ends put four of them inside the hub ring, which read as clutter.
    portals.push({ x: end[0], z: end[1], yaw });

    // --- Landing + stairs --------------------------------------------------
    // A small landing at the arm end, then one or two surveyed flights down.
    const landHalf = 1.6;
    deckParts.push(box(landHalf * 2, DECK_T, landHalf * 2, end[0], deckMid, end[1], yaw));
    walkable.slab(DECK_TOP, end[0], end[1], landHalf, landHalf, -yaw);

    for (const foot of arm.stairs) {
      const sv = sub(foot, end);
      const run = len2(sv);
      const su = unit(sv);
      const sYaw = yawOf(su);
      const steps = Math.max(12, Math.round(DECK_TOP / RISER));
      const tread = run / steps;
      for (let i = 0; i < steps; i++) {
        const y = DECK_TOP - RISER * (i + 1);
        const c = add(end, su, tread * (i + 0.5));
        // Each tread is a slab down to the one below, so the flight reads as
        // a solid stair from the side rather than a floating ladder.
        stepParts.push(box(2.4, RISER + 0.04, tread + 0.02, c[0], y + RISER / 2, c[1], sYaw));
      }
      // One ramp surface for the whole flight — supportHeightAt only needs the
      // slope, and 224 individual tread slabs would be 224 bucket entries.
      const rampMid = add(end, su, run / 2);
      walkable.ramp(0, DECK_TOP, rampMid[0], rampMid[1], 1.2, run / 2, -yawOf([-su[0], -su[1]]));

      const tilt = Math.atan2(DECK_TOP, run);
      for (const side of [1, -1]) {
        const sn = [-su[1], su[0]];
        const a = add(add(end, su, 0.2), sn, side * 1.25);
        const b = add(add(end, su, run), sn, side * 1.25);
        railing(a, b, DECK_TOP, -tilt);
      }
      walls.push([
        end[0] + su[0] * 0.2, end[1] + su[1] * 0.2,
        foot[0], foot[1], 0, DECK_TOP + RAIL_H,
      ]);
    }
  }

  // --- Meshes --------------------------------------------------------------
  const deckMesh = new THREE.Mesh(
    mergeGeometries(deckParts),
    new THREE.MeshLambertMaterial({ color: DECK_GREY })
  );
  deckMesh.name = 'mirpur10-bridge:deck';
  deckMesh.castShadow = true;
  group.add(deckMesh);

  const stripeMesh = new THREE.Mesh(
    mergeGeometries(stripeParts),
    new THREE.MeshLambertMaterial({ color: STRIPE })
  );
  stripeMesh.name = 'mirpur10-bridge:stripe';
  group.add(stripeMesh);

  const stepMesh = new THREE.Mesh(
    mergeGeometries(stepParts),
    new THREE.MeshLambertMaterial({ color: DECK_GREY })
  );
  stepMesh.name = 'mirpur10-bridge:steps';
  stepMesh.castShadow = true;
  group.add(stepMesh);

  const railMat = new THREE.MeshLambertMaterial({ color: RED });
  const panelMesh = new THREE.InstancedMesh(railPanelGeometry(), railMat, panels.length);
  panelMesh.name = 'mirpur10-bridge:railings';
  panelMesh.castShadow = true;
  const dummy = new THREE.Object3D();
  panels.forEach((p, i) => {
    dummy.position.set(p.x, p.y ?? DECK_TOP, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.scale.set(1, 1, p.scale ?? 1);
    if (p.tilt) {
      dummy.updateMatrix();
      dummy.matrix.multiply(new THREE.Matrix4().makeRotationX(p.tilt));
    } else {
      dummy.updateMatrix();
    }
    panelMesh.setMatrixAt(i, dummy.matrix);
  });
  panelMesh.instanceMatrix.needsUpdate = true;
  group.add(panelMesh);

  const portalMesh = new THREE.InstancedMesh(portalGeometry(), railMat, portals.length);
  portalMesh.name = 'mirpur10-bridge:portals';
  portalMesh.castShadow = true;
  portals.forEach((p, i) => {
    dummy.position.set(p.x, DECK_TOP, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    portalMesh.setMatrixAt(i, dummy.matrix);
  });
  portalMesh.instanceMatrix.needsUpdate = true;
  group.add(portalMesh);

  collision.addSegments?.(walls);

  let triangles = 0;
  group.traverse((o) => {
    if (!o.geometry) return;
    const count = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
    triangles += (count / 3) * (o.isInstancedMesh ? o.count : 1);
  });

  return {
    group,
    deckY: DECK_TOP,
    hub: { x: HUB[0], z: HUB[1] },
    stats: { drawCalls: group.children.length, triangles: Math.round(triangles), panels: panels.length },
  };
}
