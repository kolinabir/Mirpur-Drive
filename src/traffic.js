/**
 * traffic.js
 *
 * Moving vehicles on the real OSM road graph, plus pedestrians on the
 * footpaths. The mix is deliberately Dhaka: cycle-rickshaws outnumber
 * everything else, then CNG auto-rickshaws, then buses and private cars.
 *
 * Every vehicle type is one InstancedMesh per body part, so the whole traffic
 * system costs about a dozen draw calls no matter how many vehicles are moving.
 */

import * as THREE from 'three';
import { METRO, centreAlignment } from './metro.js';
import { createPedestrianModel } from './pedestrian-model.js';

// Counts were tuned for the old two-station map (436 roads). The north
// corridor has 1,369 drivable routes over 4.2 km, so the same fleet spread
// out to roughly a quarter of the old density and the street read as empty
// (owner, 2026-09-07: "It is mostly empty ... no pedestrians, no traffic").
// Raised here AND made player-local by the recycling pass in update(), which
// is what actually fixes it: without recycling, simply adding vehicles just
// scatters more of them across 4 km of road you are not standing on.
const TYPES = {
  rickshaw: { count: 160, speed: [2.2, 3.6], minRank: 0, w: 1.1 },
  cng: { count: 80, speed: [5.5, 9.0], minRank: 2, w: 1.4 },
  car: { count: 70, speed: [6.0, 11.0], minRank: 2, w: 1.7 },
  bus: { count: 32, speed: [4.5, 8.0], minRank: 3, w: 2.5 },
  bike: { count: 80, speed: [6.0, 12.0], minRank: 1, w: 0.7 },
};

// Recycling band. An agent that strays beyond RECYCLE_FAR of the player is
// teleported onto a route within RECYCLE_NEAR, so the fleet always travels
// with the player instead of being spread thin over the whole map. Far is
// well beyond the fog, so nothing is ever seen popping.
// Fog far is 450-900 m depending on time of day (sky.js), so distance ALONE
// can never mean "off screen" — an agent 340 m ahead is plainly visible.
// Recycling therefore requires the agent to be BOTH beyond RECYCLE_FAR and
// behind the player (negative dot with the facing vector, i.e. outside the
// forward hemisphere), which guarantees it is off-screen when it moves.
const RECYCLE_FAR = 260;
const RECYCLE_NEAR_MIN = 110; // never drop an agent right on top of the player
const RECYCLE_NEAR = 240;
const RECYCLE_BEHIND_DOT = -0.15; // slightly behind the 90-degree line, for margin
const RECYCLE_PER_FRAME = 8; // agents examined per frame, amortised round-robin

// HARD DENSITY CAP. Recycling pulls agents toward the player, so without a
// ceiling a stationary player accumulates the entire fleet — which is
// exactly what happened (owner screenshot, 2026-09-07: a heap of vehicles
// and pedestrians piled on each other). separateAgents() already counts how
// many agents are within SEPARATE_ACTIVE_R; recycling simply stops once
// that count reaches the cap, so density settles instead of growing.
const MAX_VEHICLES_NEAR = 60;
const MAX_PEDS_NEAR = 95;

/** Rickshaw hoods are painted in loud, saturated colours. */
const RICKSHAW_COLORS = [0xb4272c, 0x1c5fa8, 0x137a4a, 0x8b2f8f, 0xd18f16, 0x145f6e];
const CAR_COLORS = [0xd8d8d4, 0x2b2b30, 0x8b1f24, 0x243d63, 0x9a9a96, 0x53585c];
const BUS_COLORS = [0xa8302c, 0x1d5c8f, 0xcfc4a8, 0x2f6b45, 0xb5762a];

// ---------------------------------------------------------------------------
// P7-COLLISION item 3 (docs/PLAN-COLLISION-PHYSICS.md gap #2): traffic was a
// ghost in both directions — 343 vehicles + 320 pedestrians ran on rails and
// collided with nothing, in either direction. Two O(n) effects, no per-frame
// allocation (matches this file's existing convention):
//  - Agent vs PLAYER (car or on foot): distance-culled against the player's
//    live position; on overlap the AGENT gets a lateral "avoid" offset
//    (decaying back to 0 once clear) and its forward progress is throttled,
//    simulating the impact absorbing some of its speed. player.js/drive.js
//    are read-only this pass (P0-COMMON file fence) so this cannot push the
//    car/player back — it reads the player's position off window.__mirpur
//    (the shared debug hook, this repo's own cross-file technique)
//    defensively and no-ops if that hook isn't there yet.
//  - Agent vs the agent ahead of it on the SAME route + direction + vehicle
//    TYPE (car-following/braking): each system groups its own agents by
//    (route, direction) once at build time; every frame each such (small —
//    never all 343 at once) group is order-corrected with an insertion sort
//    (cheap since the order rarely changes frame to frame) and brakes if the
//    gap ahead is under SAFE_GAP, which is what makes traffic QUEUE
//    nose-to-tail instead of overtaking through each other.
// ---------------------------------------------------------------------------

const PLAYER_WALK_RADIUS = 0.5; // a hair over player.js's PLAYER_RADIUS (0.42)
const PLAYER_CAR_RADIUS = 2.6; // drive.js's HALF_L 2.25 / HALF_W 0.9 (private, not exported) + margin
const PLAYER_CULL_R2 = 16 * 16; // metres^2: ignore agents further than this from the player
const AVOID_DECAY = 0.9; // per frame; higher = snaps back to its lane faster once clear
const AVOID_MAX = 2.5; // metres: clamp so a fast car can't fling an agent off the map
const SAFE_GAP = 5.5; // metres of route-arclength kept clear of the vehicle ahead

/**
 * Player world position + an effective collision radius, read defensively
 * off the shared debug hook (window.__mirpur) since player.js/drive.js are
 * both read-only this pass. Returns null when there is nothing to collide
 * with yet (page still loading) or the player is well above street level
 * (flying — nothing down here should react to a bird's-eye flythrough).
 */
function getPlayerProxy() {
  const hook = typeof window !== 'undefined' ? window.__mirpur : null;
  const p = hook && hook.player && hook.player.position;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  // If player is flying high in bird's-eye flythrough (> 200m), skip all ground traffic tracking
  if (p.y > 200) return null;
  // Elevated check: player is on station platform (y=15.48) or concourse (y=8).
  // When elevated, player position is still valid for recycling and separation,
  // but ground-level vehicle push collision is skipped.
  const elevated = p.y > 4.5;
  const driving = !elevated && p.y < 1.45;
  const yaw = hook.player.yaw || 0;
  return {
    x: p.x, z: p.z, driving, elevated,
    radius: driving ? PLAYER_CAR_RADIUS : PLAYER_WALK_RADIUS,
    fx: -Math.sin(yaw), fz: -Math.cos(yaw),
  };
}

/**
 * Group agent indices of ONE system by (route identity, direction) so the
 * car-following pass below never has to look outside an agent's own small
 * group. Built once at buildTraffic()/buildPedestrians() time — agents never
 * change route or direction after spawning.
 */
function groupByRouteAndDirection(agents) {
  const map = new Map();
  agents.forEach((a, i) => {
    let g = map.get(a.route);
    if (!g) map.set(a.route, (g = { pos: [], neg: [] }));
    (a.dir > 0 ? g.pos : g.neg).push(i);
  });
  return map;
}

/**
 * Insertion-sort `idx` (indices into `agents`) by each agent's normalised
 * arclength position on its route, ascending, then set `brakeMul` on every
 * agent so it slows down if the gap to the agent ahead (wrapping around the
 * route's length) is under SAFE_GAP. O(k) amortised for the nearly-sorted
 * case, which is every frame in practice since relative order changes
 * slowly — never a full re-sort of all agents on the map at once, since
 * `idx` only ever holds one (route, direction, type) group.
 */
function applyCarFollowing(agents, idx, len, ascendingIsAhead) {
  const n = idx.length;
  if (n === 0) return;
  if (n === 1) {
    agents[idx[0]].brakeMul = 1;
    return;
  }
  for (const i of idx) {
    const a = agents[i];
    a._dn = ((a.d % len) + len) % len;
  }
  // Insertion sort on normalised position — cheap when nearly sorted.
  for (let i = 1; i < n; i++) {
    const v = idx[i];
    const vd = agents[v]._dn;
    let j = i - 1;
    while (j >= 0 && agents[idx[j]]._dn > vd) {
      idx[j + 1] = idx[j];
      j--;
    }
    idx[j + 1] = v;
  }
  // `idx` is now sorted ascending by _dn. For a `pos` group (dir=+1, moving
  // toward increasing d) the vehicle ahead has the NEXT larger _dn; for a
  // `neg` group (dir=-1, moving toward decreasing d) the vehicle ahead has
  // the PREVIOUS smaller _dn. Both wrap around the route's length.
  for (let i = 0; i < n; i++) {
    const me = agents[idx[i]];
    let ahead;
    let gap;
    if (ascendingIsAhead) {
      ahead = agents[idx[(i + 1) % n]];
      gap = (ahead._dn - me._dn + len) % len;
    } else {
      ahead = agents[idx[(i - 1 + n) % n]];
      gap = (me._dn - ahead._dn + len) % len;
    }
    me.brakeMul = gap >= SAFE_GAP ? 1 : Math.max(0.04, gap / SAFE_GAP);
  }
}

/**
 * Player-vs-agent overlap: push the agent sideways off its lane (an
 * "avoid" offset that decays back to 0 once clear) and throttle its
 * forward progress. Mutates `a` in place. Returns true if the agent is
 * currently being pushed (used only for the doc's measured count).
 *
 * Sets `a.playerBrake`, NOT `a.brakeMul` — `a.brakeMul` is fully
 * recomputed from scratch by applyCarFollowing() every frame (see its "n
 * === 1 -> brakeMul = 1" branch and the unconditional assignment in its
 * main loop), so anything this function wrote there would be overwritten
 * before ever being read. `a.playerBrake` is this function's own field,
 * multiplied in alongside `a.brakeMul` at the one call site that steps
 * `a.d`, so a player hit still actually slows the agent down.
 */
function applyPlayerAvoidance(a, worldX, worldZ, agentRadius, playerProxy) {
  a.avoidX *= AVOID_DECAY;
  a.avoidZ *= AVOID_DECAY;
  if (Math.abs(a.avoidX) < 0.001) a.avoidX = 0;
  if (Math.abs(a.avoidZ) < 0.001) a.avoidZ = 0;
  a.playerBrake = 1;
  if (!playerProxy || playerProxy.elevated) return false;
  const dx = worldX - playerProxy.x;
  const dz = worldZ - playerProxy.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > PLAYER_CULL_R2) return false;
  const minDist = agentRadius + playerProxy.radius;
  const d = Math.sqrt(d2);
  if (d >= minDist) return false;
  const push = d > 1e-4 ? (minDist - d) / d : minDist;
  const nx = d > 1e-4 ? dx / d : 1;
  const nz = d > 1e-4 ? dz / d : 0;
  a.avoidX = Math.max(-AVOID_MAX, Math.min(AVOID_MAX, a.avoidX + nx * push));
  a.avoidZ = Math.max(-AVOID_MAX, Math.min(AVOID_MAX, a.avoidZ + nz * push));
  // "transfer some speed": the impact eats into forward progress instead of
  // continuing to interpenetrate.
  a.playerBrake = 0.15;
  return true;
}

let seed = 424242;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

// ---------------------------------------------------------------------------
// Vehicle prototypes
//
// Each returns a list of { geometry, material, count } part descriptors; the
// caller allocates an InstancedMesh per part and writes a matrix per vehicle.
// Local space: +Z is forward, Y is up, origin at road level.
// ---------------------------------------------------------------------------

function rickshawParts() {
  const frame = new THREE.BoxGeometry(0.95, 0.42, 1.85);
  frame.translate(0, 0.62, 0);

  const seatBack = new THREE.BoxGeometry(0.9, 0.62, 0.14);
  seatBack.translate(0, 1.06, -0.72);

  // The folding canopy: a half-cylinder over the passenger seat.
  const hood = new THREE.CylinderGeometry(0.62, 0.62, 0.98, 12, 1, true, 0, Math.PI);
  hood.rotateZ(Math.PI / 2);
  hood.rotateY(Math.PI / 2);
  hood.translate(0, 1.16, -0.42);

  const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 10);
  wheel.rotateZ(Math.PI / 2);

  const rider = new THREE.BoxGeometry(0.34, 0.72, 0.26);
  rider.translate(0, 0.98, 0.72);

  return [
    { key: 'frame', geometry: frame, colored: false, color: 0x2f3a44 },
    { key: 'seat', geometry: seatBack, colored: true },
    { key: 'hood', geometry: hood, colored: true, doubleSide: true },
    { key: 'wheelL', geometry: wheel, colored: false, color: 0x1a1a1a, offset: [0.48, 0.34, -0.55] },
    { key: 'wheelR', geometry: wheel, colored: false, color: 0x1a1a1a, offset: [-0.48, 0.34, -0.55] },
    { key: 'wheelF', geometry: wheel, colored: false, color: 0x1a1a1a, offset: [0, 0.34, 0.85] },
    { key: 'rider', geometry: rider, colored: false, color: 0x6b5a48 },
  ];
}

/** Small emissive headlight/taillight boxes, added to car/bus/cng only.
 * MeshBasicMaterial so they read as lit regardless of scene lighting; hidden
 * by day and shown at night via the returned `setNight()`. */
function lampParts(hw, hh, hz, tz, side) {
  const headGeo = new THREE.BoxGeometry(hw, hh, 0.06);
  const tailGeo = new THREE.BoxGeometry(hw, hh, 0.06);
  return [
    { key: 'headL', geometry: headGeo, colored: false, color: 0xfff2c0, basic: true, night: true, offset: [side, 0.5, hz] },
    { key: 'headR', geometry: headGeo, colored: false, color: 0xfff2c0, basic: true, night: true, offset: [-side, 0.5, hz] },
    { key: 'tailL', geometry: tailGeo, colored: false, color: 0xff2a20, basic: true, night: true, offset: [side, 0.5, tz] },
    { key: 'tailR', geometry: tailGeo, colored: false, color: 0xff2a20, basic: true, night: true, offset: [-side, 0.5, tz] },
  ];
}

function cngParts() {
  // Green body, black canopy: the standard Dhaka auto-rickshaw livery.
  const body = new THREE.BoxGeometry(1.3, 1.05, 2.5);
  body.translate(0, 0.72, 0);

  const roof = new THREE.BoxGeometry(1.34, 0.5, 2.1);
  roof.translate(0, 1.5, -0.1);

  const nose = new THREE.BoxGeometry(0.7, 0.7, 0.6);
  nose.translate(0, 0.75, 1.35);

  const wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.16, 10);
  wheel.rotateZ(Math.PI / 2);

  return [
    { key: 'body', geometry: body, colored: false, color: 0x1f7a3d },
    { key: 'roof', geometry: roof, colored: false, color: 0x1a1a1c },
    { key: 'nose', geometry: nose, colored: false, color: 0x1f7a3d },
    { key: 'wheelL', geometry: wheel, colored: false, color: 0x141414, offset: [0.62, 0.3, -0.75] },
    { key: 'wheelR', geometry: wheel, colored: false, color: 0x141414, offset: [-0.62, 0.3, -0.75] },
    { key: 'wheelF', geometry: wheel, colored: false, color: 0x141414, offset: [0, 0.3, 1.15] },
    ...lampParts(0.14, 0.1, 1.62, -1.22, 0.42),
  ];
}

function carParts() {
  const body = new THREE.BoxGeometry(1.72, 0.78, 4.1);
  body.translate(0, 0.62, 0);
  const cabin = new THREE.BoxGeometry(1.6, 0.62, 2.1);
  cabin.translate(0, 1.3, -0.25);
  const wheel = new THREE.CylinderGeometry(0.31, 0.31, 0.2, 10);
  wheel.rotateZ(Math.PI / 2);

  return [
    { key: 'body', geometry: body, colored: true },
    { key: 'cabin', geometry: cabin, colored: false, color: 0x33393d },
    { key: 'wFL', geometry: wheel, colored: false, color: 0x151515, offset: [0.82, 0.31, 1.3] },
    { key: 'wFR', geometry: wheel, colored: false, color: 0x151515, offset: [-0.82, 0.31, 1.3] },
    { key: 'wRL', geometry: wheel, colored: false, color: 0x151515, offset: [0.82, 0.31, -1.3] },
    { key: 'wRR', geometry: wheel, colored: false, color: 0x151515, offset: [-0.82, 0.31, -1.3] },
    ...lampParts(0.2, 0.13, 2.04, -2.04, 0.62),
  ];
}

function busParts() {
  const body = new THREE.BoxGeometry(2.5, 2.5, 10.5);
  body.translate(0, 1.55, 0);
  const roof = new THREE.BoxGeometry(2.44, 0.22, 10.2);
  roof.translate(0, 2.9, 0);
  const glass = new THREE.BoxGeometry(2.54, 0.85, 8.4);
  glass.translate(0, 2.25, -0.4);
  const wheel = new THREE.CylinderGeometry(0.48, 0.48, 0.3, 10);
  wheel.rotateZ(Math.PI / 2);

  return [
    { key: 'body', geometry: body, colored: true },
    { key: 'roof', geometry: roof, colored: false, color: 0x9c968a },
    { key: 'glass', geometry: glass, colored: false, color: 0x2b3336 },
    { key: 'wFL', geometry: wheel, colored: false, color: 0x141414, offset: [1.15, 0.48, 3.4] },
    { key: 'wFR', geometry: wheel, colored: false, color: 0x141414, offset: [-1.15, 0.48, 3.4] },
    { key: 'wRL', geometry: wheel, colored: false, color: 0x141414, offset: [1.15, 0.48, -3.2] },
    { key: 'wRR', geometry: wheel, colored: false, color: 0x141414, offset: [-1.15, 0.48, -3.2] },
    ...lampParts(0.26, 0.18, 5.26, -5.26, 0.95),
  ];
}

function bikeParts() {
  const body = new THREE.BoxGeometry(0.32, 0.4, 1.75);
  body.translate(0, 0.62, 0);
  const rider = new THREE.BoxGeometry(0.42, 0.85, 0.34);
  rider.translate(0, 1.28, -0.1);
  const helmet = new THREE.SphereGeometry(0.17, 8, 6);
  helmet.translate(0, 1.82, -0.1);
  const wheel = new THREE.CylinderGeometry(0.31, 0.31, 0.09, 10);
  wheel.rotateZ(Math.PI / 2);

  return [
    { key: 'body', geometry: body, colored: true },
    { key: 'rider', geometry: rider, colored: false, color: 0x3c4450 },
    { key: 'helmet', geometry: helmet, colored: false, color: 0x1e1e22 },
    { key: 'wF', geometry: wheel, colored: false, color: 0x141414, offset: [0, 0.31, 0.72] },
    { key: 'wR', geometry: wheel, colored: false, color: 0x141414, offset: [0, 0.31, -0.72] },
  ];
}

const PROTOTYPES = {
  rickshaw: { parts: rickshawParts, colors: RICKSHAW_COLORS },
  cng: { parts: cngParts, colors: CAR_COLORS },
  car: { parts: carParts, colors: CAR_COLORS },
  bus: { parts: busParts, colors: BUS_COLORS },
  bike: { parts: bikeParts, colors: CAR_COLORS },
};

/**
 * A standalone copy of one traffic vehicle, for the ride the player hails
 * (streetlife/rides.js). Same parts and colours as the instanced fleet, so it
 * is indistinguishable from the vehicle that was flagged down. Front is +Z.
 * @param {keyof typeof PROTOTYPES} type
 * @param {number} colorIndex
 */
export function buildHireVehicle(type, colorIndex = 0) {
  const proto = PROTOTYPES[type];
  const vehicle = new THREE.Group();
  vehicle.name = `hire:${type}`;
  const tint = proto.colors[colorIndex % proto.colors.length];
  for (const p of proto.parts()) {
    if (p.night) continue;
    const Material = p.basic ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
    const mesh = new THREE.Mesh(p.geometry, new Material({
      color: p.colored ? tint : p.color,
      side: p.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    }));
    if (p.offset) mesh.position.set(p.offset[0], p.offset[1], p.offset[2]);
    mesh.castShadow = !p.basic;
    vehicle.add(mesh);
  }
  return vehicle;
}

// ---------------------------------------------------------------------------
// Route graph
// ---------------------------------------------------------------------------

/**
 * Cross-route separation (owner, 2026-09-07: "vehicles are bumping into each
 * other, going through each other").
 *
 * applyCarFollowing only ever compares agents inside ONE (route, direction)
 * group, which is why two vehicles on different routes, in opposing lanes,
 * or converging at a junction could interpenetrate freely. This pass hashes
 * every agent's CURRENT world position into a coarse grid and pushes apart
 * any overlapping pair, regardless of which route each is on.
 *
 * Cost is O(n) with a small constant: one grid rebuild plus a 3x3 cell
 * neighbourhood per agent. Only agents within SEPARATE_ACTIVE_R of the
 * player are considered — separation the player cannot see is not worth a
 * single microsecond, and this keeps the pass flat as the fleet grows.
 */
const SEPARATE_CELL = 6;      // m, hash cell (a little larger than a bus)
const SEPARATE_ACTIVE_R = 220; // m from the player; beyond this, skip entirely

function separateAgents(allSystems, player) {
  if (!player) return { hits: 0, near: 0 };
  const grid = new Map();
  const live = [];
  for (const sys of allSystems) {
    const rad = sys.agentRadius || 1.2;
    for (const a of sys.agents) {
      const px = a._wx;
      const pz = a._wz;
      if (px === undefined) continue;
      if (Math.hypot(px - player.x, pz - player.z) > SEPARATE_ACTIVE_R) continue;
      const rec = { a, x: px, z: pz, r: rad };
      live.push(rec);
      const k = Math.floor(px / SEPARATE_CELL) * 100000 + Math.floor(pz / SEPARATE_CELL);
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(rec);
    }
  }

  let hits = 0;
  for (const rec of live) {
    const cx = Math.floor(rec.x / SEPARATE_CELL);
    const cz = Math.floor(rec.z / SEPARATE_CELL);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = grid.get((cx + i) * 100000 + (cz + j));
        if (!arr) continue;
        for (const other of arr) {
          if (other === rec) continue;
          const dx = rec.x - other.x;
          const dz = rec.z - other.z;
          const minD = rec.r + other.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= minD * minD || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          // Split the correction between the pair, applied as a lateral
          // nudge next frame (a.sepX/sepZ) rather than teleporting either.
          const push = (minD - d) / d / 2;
          rec.a.sepX = (rec.a.sepX || 0) + dx * push;
          rec.a.sepZ = (rec.a.sepZ || 0) + dz * push;
          other.a.sepX = (other.a.sepX || 0) - dx * push;
          other.a.sepZ = (other.a.sepZ || 0) - dz * push;
          // NO braking here. An earlier version clamped brakeMul on overlap,
          // which deadlocked: overlapping agents braked, so they stopped
          // separating, so more piled in behind them — a positive feedback
          // loop that produced a heap of vehicles and pedestrians on top of
          // each other (owner screenshot, 2026-09-07). Longitudinal queuing
          // is applyCarFollowing's job; this pass only pushes sideways.
          hits++;
        }
      }
    }
  }
  return { hits, near: live.length };
}

/**
 * Move agents that have drifted out of the player's neighbourhood onto a
 * route near them, so the fleet always travels WITH the player rather than
 * being spread thin over a 4.2 km map.
 *
 * Two hard rules, both from the owner's report:
 *  - an agent is only ever moved while it is BEHIND the player and beyond
 *    RECYCLE_FAR, so it is off-screen at the moment it teleports and never
 *    appears to vanish;
 *  - the destination route is picked within RECYCLE_NEAR but the agent is
 *    dropped at a random point along it, so vehicles arrive spread down the
 *    street instead of materialising in a clump.
 *
 * Amortised: only RECYCLE_PER_FRAME agents are examined per call, round
 * robin via `sys._rrCursor`, so cost is flat regardless of fleet size.
 */
function recycleAgents(sys, index, player, rndFn, minRank, allowed = Infinity) {
  if (!player || allowed <= 0) return 0;
  const { agents } = sys;
  if (!agents.length) return 0;
  let cursor = sys._rrCursor || 0;
  let moved = 0;
  const n = Math.min(RECYCLE_PER_FRAME, agents.length);
  for (let k = 0; k < n; k++) {
    const a = agents[cursor % agents.length];
    cursor++;
    const s0 = sampleRoute(a.route, a.d);
    if (!s0) continue;
    const dx = s0.x - player.x;
    const dz = s0.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist < RECYCLE_FAR) continue;
    // Behind-the-player test: normalised direction to the agent vs facing.
    const dot = (dx / (dist || 1)) * player.fx + (dz / (dist || 1)) * player.fz;
    if (dot > RECYCLE_BEHIND_DOT) continue; // still in front: leave it alone
    const route = routeNear(index, player.x, player.z, RECYCLE_NEAR, minRank, rndFn, RECYCLE_NEAR_MIN);
    if (!route) continue;
    a.route = route;
    if (route.len > RECYCLE_NEAR * 1.5) {
      const dNear = closestDistAlongRoute(route, player.x, player.z);
      const offset = (rndFn() < 0.5 ? -1 : 1) * (RECYCLE_NEAR_MIN + rndFn() * (RECYCLE_NEAR - RECYCLE_NEAR_MIN));
      a.d = ((dNear + offset) % route.len + route.len) % route.len;
    } else {
      a.d = rndFn() * route.len;
    }
    a.lane = (route.w / 2) * (0.35 + rndFn() * 0.3);
    a.dir = rndFn() < 0.5 ? 1 : -1;
    a.avoidX = 0;
    a.avoidZ = 0;
    a.sepX = 0;
    a.sepZ = 0;
    moved++;
    if (moved >= allowed) break; // density cap reached for this frame
  }
  sys._rrCursor = cursor;
  return moved;
}

/**
 * Index routes by a coarse grid so "give me a route near the player" is O(1)-ish.
 * For long routes (> cell * 1.5), register across all cells traversed by the polyline
 * so corridor routes spanning kilometers (e.g. Begum Rokeya Sarani, Manik Mia Avenue)
 * are accessible at any station along the line.
 */
function buildRouteIndex(routes, cell = 120) {
  const grid = new Map();
  for (const r of routes) {
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    r._mx = mid[0];
    r._mz = mid[1];
    if (r.len > cell * 1.5) {
      const step = cell * 0.8;
      const seenCells = new Set();
      for (let d = 0; d <= r.len; d += step) {
        const s = sampleRoute(r, d);
        const k = Math.floor(s.x / cell) * 100000 + Math.floor(s.z / cell);
        if (!seenCells.has(k)) {
          seenCells.add(k);
          let arr = grid.get(k);
          if (!arr) grid.set(k, (arr = []));
          arr.push(r);
        }
      }
    } else {
      const k = Math.floor(r._mx / cell) * 100000 + Math.floor(r._mz / cell);
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(r);
    }
  }
  return { grid, cell };
}

/** Random route within `radius` of (x,z), or null. */
function routeNear(index, x, z, radius, minRank, rndFn, minRadius = 0) {
  const { grid, cell } = index;
  const cx = Math.floor(x / cell);
  const cz = Math.floor(z / cell);
  const span = Math.ceil(radius / cell);
  const hits = [];
  const seenRoutes = new Set();
  for (let i = -span; i <= span; i++) {
    for (let j = -span; j <= span; j++) {
      const arr = grid.get((cx + i) * 100000 + (cz + j));
      if (!arr) continue;
      for (const r of arr) {
        if (seenRoutes.has(r)) continue;
        seenRoutes.add(r);
        if (r.rank < minRank) continue;
        if (r.len > cell * 1.5) {
          hits.push(r);
        } else {
          const d = Math.hypot(r._mx - x, r._mz - z);
          // Annulus, not a disc: dropping an agent a few metres from the
          // player is both visible and a good way to build a pile.
          if (d <= radius && d >= minRadius) hits.push(r);
        }
      }
    }
  }
  if (!hits.length) return null;
  return hits[Math.floor(rndFn() * hits.length)];
}

/** Distance from point (x,z) to a polyline. */
function distToPolyline(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0];
    const az = pts[i][1];
    const bx = pts[i + 1][0];
    const bz = pts[i + 1][1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + t * dx;
    const pz = az + t * dz;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

/** Split a polyline into sub-polylines wherever it comes within minDist of centre. */
function splitAwayFromCentre(pts, centre, minDist) {
  const out = [];
  let cur = [];
  for (const p of pts) {
    if (distToPolyline(centre, p[0], p[1]) > minDist) {
      cur.push(p);
    } else if (cur.length > 1) {
      out.push(cur);
      cur = [];
    } else {
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Offset a polyline perpendicular to its own running direction. */
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

/** Arc length along route closest to (x, z). */
function closestDistAlongRoute(route, x, z) {
  const pts = route.pts;
  const cum = route.cum;
  let bestDist2 = Infinity;
  let bestArc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0];
    const az = pts[i][1];
    const bx = pts[i + 1][0];
    const bz = pts[i + 1][1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + t * dx;
    const pz = az + t * dz;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < bestDist2) {
      bestDist2 = d2;
      bestArc = cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return bestArc;
}

/** Build a per-rank pool of drivable polylines with cumulative length tables. */
function buildRoutes(roads, metroTracks = null) {
  const routes = [];
  const metroCentre = metroTracks?.length ? centreAlignment(metroTracks) : null;
  const CORRIDOR_CLEARANCE = 15;

  for (const r of roads) {
    if (r.rank < 1 || r.pts.length < 2) continue;
    const segments = metroCentre && r.rank >= 3
      ? splitAwayFromCentre(r.pts, metroCentre, CORRIDOR_CLEARANCE)
      : [r.pts];
    for (const seg of segments) {
      if (seg.length < 2) continue;
      const cum = [0];
      for (let i = 1; i < seg.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]));
      }
      if (cum[cum.length - 1] < 25) continue;
      routes.push({ pts: seg, cum, len: cum[cum.length - 1], rank: r.rank, w: r.w });
    }
  }

  // Inject the purpose-built metro corridor dual carriageways (+/- 6.75m offset from centre, w = 10.5m, rank = 4)
  if (metroCentre && metroCentre.length >= 2) {
    for (const side of [-1, 1]) {
      const carriagePts = offsetPolyline(metroCentre, side * 6.75);
      const cum = [0];
      for (let i = 1; i < carriagePts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(carriagePts[i][0] - carriagePts[i - 1][0], carriagePts[i][1] - carriagePts[i - 1][1]));
      }
      if (cum[cum.length - 1] >= 25) {
        routes.push({
          pts: carriagePts,
          cum,
          len: cum[cum.length - 1],
          rank: 4,
          w: 10.5,
          isCorridor: true,
        });
      }
    }
  }

  return routes;
}

/**
 * Sample position, smooth blended tangent, and corner clearance along route.
 * Smoothly rounds corners across vertices within CORNER_MAX_R to eliminate
 * tangent snapping and prevent vehicle paths from cutting into footpath corners.
 */
function sampleRoute(route, d) {
  const total = route.len;
  d = ((d % total) + total) % total;
  const cum = route.cum;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const segLen = cum[lo + 1] - cum[lo] || 1;
  const s = d - cum[lo];
  const rem = segLen - s;
  const a = route.pts[lo];
  const b = route.pts[lo + 1];

  let x = a[0] + (b[0] - a[0]) * (s / segLen);
  let z = a[1] + (b[1] - a[1]) * (s / segLen);
  let dx = b[0] - a[0];
  let dz = b[1] - a[1];
  let l = Math.hypot(dx, dz) || 1;
  let ux = dx / l;
  let uz = dz / l;
  let cornerEase = 1.0;

  // Corner transition blending & fillet: prevents sharp tangent jumps and corner-clipping on footpaths
  const CORNER_MAX_R = 5.0;
  if (s < CORNER_MAX_R && lo > 0) {
    const prevSegLen = cum[lo] - cum[lo - 1] || 1;
    const R = Math.min(CORNER_MAX_R, prevSegLen * 0.45, segLen * 0.45);
    if (s < R && R > 0.3) {
      const pPrev = route.pts[lo - 1];
      const u1x = (a[0] - pPrev[0]) / prevSegLen;
      const u1z = (a[1] - pPrev[1]) / prevSegLen;
      const u2x = ux;
      const u2z = uz;
      const dot = u1x * u2x + u1z * u2z;
      if (dot < 0.999) {
        const uSigned = s;
        const alpha = (uSigned + R) / (2 * R);
        const tau = alpha * alpha * (3 - 2 * alpha);
        const bx = (1 - tau) * u1x + tau * u2x;
        const bz = (1 - tau) * u1z + tau * u2z;
        const bl = Math.hypot(bx, bz) || 1;
        ux = bx / bl;
        uz = bz / bl;

        const pAx = a[0] - R * u1x, pAz = a[1] - R * u1z;
        const pBx = a[0] + R * u2x, pBz = a[1] + R * u2z;
        const omt = 1 - tau;
        x = omt * omt * pAx + 2 * omt * tau * a[0] + tau * tau * pBx;
        z = omt * omt * pAz + 2 * omt * tau * a[1] + tau * tau * pBz;

        const beta = 4 * alpha * (1 - alpha);
        const minEase = Math.max(0.55, (1 + dot) * 0.5);
        cornerEase = 1.0 - (1.0 - minEase) * beta;
      }
    }
  } else if (rem < CORNER_MAX_R && lo + 1 < route.pts.length - 1) {
    const nextSegLen = cum[lo + 2] - cum[lo + 1] || 1;
    const R = Math.min(CORNER_MAX_R, segLen * 0.45, nextSegLen * 0.45);
    if (rem < R && R > 0.3) {
      const pNext = route.pts[lo + 2];
      const u1x = ux;
      const u1z = uz;
      const u2x = (pNext[0] - b[0]) / nextSegLen;
      const u2z = (pNext[1] - b[1]) / nextSegLen;
      const dot = u1x * u2x + u1z * u2z;
      if (dot < 0.999) {
        const uSigned = -rem;
        const alpha = (uSigned + R) / (2 * R);
        const tau = alpha * alpha * (3 - 2 * alpha);
        const bx = (1 - tau) * u1x + tau * u2x;
        const bz = (1 - tau) * u1z + tau * u2z;
        const bl = Math.hypot(bx, bz) || 1;
        ux = bx / bl;
        uz = bz / bl;

        const pAx = b[0] - R * u1x, pAz = b[1] - R * u1z;
        const pBx = b[0] + R * u2x, pBz = b[1] + R * u2z;
        const omt = 1 - tau;
        x = omt * omt * pAx + 2 * omt * tau * b[0] + tau * tau * pBx;
        z = omt * omt * pAz + 2 * omt * tau * b[1] + tau * tau * pBz;

        const beta = 4 * alpha * (1 - alpha);
        const minEase = Math.max(0.55, (1 + dot) * 0.5);
        cornerEase = 1.0 - (1.0 - minEase) * beta;
      }
    }
  }

  return { x, z, ux, uz, cornerEase };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * @returns {{ group: THREE.Group, update: (dt:number)=>void, stats: object }}
 */
export function buildTraffic(scene, origin = null) {
  const t0 = performance.now();
  const group = new THREE.Group();
  group.name = 'traffic';

  const routes = buildRoutes(scene.roads, scene.metro?.tracks);
  if (!routes.length) return { group, update: () => {}, setNight: () => {}, stats: { vehicles: 0 } };
  const routeIndex = buildRouteIndex(routes);

  const systems = [];
  const nightMeshes = [];
  let totalVehicles = 0;

  for (const [type, cfg] of Object.entries(TYPES)) {
    const proto = PROTOTYPES[type];
    const eligible = routes.filter((r) => r.rank >= cfg.minRank);
    if (!eligible.length) continue;

    // Seed near the player's spawn rather than uniformly over 4.2 km of
    // road: otherwise the first minute of play is spent watching an empty
    // street while the recycling pass slowly gathers the fleet in.
    const seedPool = origin
      ? eligible.filter((r) => Math.hypot(r._mx - origin.x, r._mz - origin.z) < 900)
      : [];
    const pool = seedPool.length >= 8 ? seedPool : eligible;

    const agents = [];
    for (let i = 0; i < cfg.count; i++) {
      const route = pool[Math.floor(rnd() * pool.length)];
      let d = rnd() * route.len;
      if (origin && route.len > 400) {
        const dNear = closestDistAlongRoute(route, origin.x, origin.z);
        d = ((dNear + (rnd() - 0.5) * 600) % route.len + route.len) % route.len;
      }
      agents.push({
        route,
        d,
        speed: cfg.speed[0] + rnd() * (cfg.speed[1] - cfg.speed[0]),
        // Vehicles keep left in Bangladesh.
        lane: (route.w / 2) * (0.35 + rnd() * 0.3),
        dir: rnd() < 0.5 ? 1 : -1,
        colorIndex: Math.floor(rnd() * proto.colors.length),
        bob: rnd() * Math.PI * 2,
        // P7-COLLISION: avoidX/avoidZ is a decaying lateral push-out from the
        // player, brakeMul (1 = free flow) comes from car-following +
        // player avoidance, _dn is a scratch field for the car-following
        // sort (see applyCarFollowing).
        avoidX: 0,
        avoidZ: 0,
        brakeMul: 1,
        playerBrake: 1,
        _dn: 0,
      });
    }
    // cfg.w (declared per TYPES entry, otherwise unused in this file) doubles
    // as the vehicle's own collision radius: half its width plus a small
    // margin for its length, since a full oriented-box test would cost more
    // than the ~1 ms budget allows for hundreds of agents.
    const agentRadius = cfg.w / 2 + 0.5;
    const routeGroups = groupByRouteAndDirection(agents);

    // Per-part instanced meshes.
    const partDescs = proto.parts();
    const meshes = [];
    for (const p of partDescs) {
      const matOpts = {
        color: p.colored ? 0xffffff : p.color,
        side: p.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        vertexColors: false,
      };
      const mat = p.basic ? new THREE.MeshBasicMaterial(matOpts) : new THREE.MeshLambertMaterial(matOpts);
      const mesh = new THREE.InstancedMesh(p.geometry, mat, agents.length);
      mesh.castShadow = !p.basic;
      mesh.frustumCulled = false;
      mesh.name = `traffic:${type}:${p.key}`;
      if (p.night) {
        mesh.visible = false;
        nightMeshes.push(mesh);
      }

      if (p.colored) {
        mesh.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(agents.length * 3),
          3
        );
        const c = new THREE.Color();
        agents.forEach((a, i) => {
          c.setHex(proto.colors[a.colorIndex]);
          mesh.setColorAt(i, c);
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }

      group.add(mesh);
      meshes.push({ mesh, offset: p.offset || null });
    }

    systems.push({ type, agents, meshes, routeGroups, agentRadius, minRank: cfg.minRank });
    totalVehicles += agents.length;
  }

  const dummy = new THREE.Object3D();
  // Mutated every frame, read by main.js/docs for the measured per-frame
  // cost of the P7-COLLISION traffic work (car-following + player
  // avoidance), kept separate from the rest of update() so it can be
  // reported without instrumenting the whole function.
  const perf = { collisionMs: 0, pushedCount: 0 };

  function update(dt, elapsed) {
    const perfT0 = performance.now();
    const playerProxy = getPlayerProxy();
    let pushedCount = 0;

    // Cross-route separation, so vehicles on different routes and opposing
    // lanes stop driving through each other. Runs FIRST because it also
    // reports how many agents are currently near the player, which is what
    // caps the recycling below.
    const sep = separateAgents(systems, playerProxy);
    perf.separated = sep.hits;
    perf.near = sep.near;

    // Keep the fleet with the player (see recycleAgents), off-screen only,
    // and never past MAX_VEHICLES_NEAR — an uncapped pull toward a
    // stationary player heaps the whole fleet on top of him.
    let budget = Math.max(0, MAX_VEHICLES_NEAR - sep.near);
    let recycled = 0;
    for (const sys of systems) {
      if (budget <= 0) break;
      const n = recycleAgents(sys, routeIndex, playerProxy, rnd, sys.minRank, budget);
      recycled += n;
      budget -= n;
    }
    perf.recycled = recycled;

    for (const sys of systems) {
      const { agents, routeGroups } = sys;
      // Car-following: one small group at a time, never all agents at once.
      for (const [route, g] of routeGroups.entries()) {
        if (g.pos.length) applyCarFollowing(agents, g.pos, route.len, true);
        if (g.neg.length) applyCarFollowing(agents, g.neg, route.len, false);
      }
    }
    perf.collisionMs = performance.now() - perfT0; // car-following portion; player-avoidance portion is folded in below

    for (const sys of systems) {
      const { agents, meshes, agentRadius } = sys;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        a.d += a.speed * dt * a.dir * a.brakeMul * a.playerBrake;
        const s = sampleRoute(a.route, a.d);

        // Offset into the LEFT-hand lane relative to travel direction
        // (Bangladesh drives on the left).
        //
        // The sign here was inverted, putting every vehicle in the
        // right-hand lane (owner, 2026-09-07: "the vehicle should be going
        // on the left lane, not from the right"). Derivation, in this
        // repo's frame (+X east, +Z south, +Y up): for forward f = (fx, fz),
        // left = up x forward = (0,1,0) x (fx,0,fz) = (fz, 0, -fx).
        // Sanity check: heading north is f = (0,-1); left = (-1, 0) = west,
        // which is correct. Travel direction is a.dir * (ux, uz), so the
        // lane offset is a.dir * lane * (uz, -ux) — the negation of what
        // this line used to compute.
        const side = a.dir > 0 ? 1 : -1;
        const effectiveLane = a.lane * (s.cornerEase ?? 1.0);
        const px = s.uz * effectiveLane * side;
        const pz = -s.ux * effectiveLane * side;

        // P7-COLLISION: player-vs-agent overlap test, distance-culled inside
        // applyPlayerAvoidance. Updates a.avoidX/avoidZ (applied to the
        // render position immediately below, same frame) and a.playerBrake
        // (read at the top of NEXT frame's iteration, in the a.d += line).
        const avT0 = performance.now();
        // Separation offset from LAST frame's pass, decayed so a nudge eases
        // out instead of sticking.
        a.sepX = (a.sepX || 0) * 0.82;
        a.sepZ = (a.sepZ || 0) * 0.82;
        if (Math.abs(a.sepX) > 2.5) a.sepX = Math.sign(a.sepX) * 2.5;
        if (Math.abs(a.sepZ) > 2.5) a.sepZ = Math.sign(a.sepZ) * 2.5;
        const baseX = s.x + px + a.sepX;
        const baseZ = s.z + pz + a.sepZ;
        // Cached for separateAgents(), which runs across ALL systems at the
        // top of the next frame and needs each agent's real world position.
        a._wx = baseX;
        a._wz = baseZ;
        if (applyPlayerAvoidance(a, baseX, baseZ, agentRadius, playerProxy)) pushedCount++;
        perf.collisionMs += performance.now() - avT0;

        const heading = Math.atan2(s.ux * a.dir, s.uz * a.dir);
        // A little vertical bob on the rickshaws over broken tarmac.
        const bobY = sys.type === 'rickshaw' || sys.type === 'bike'
          ? Math.sin(elapsed * 7 + a.bob) * 0.018
          : 0;

        for (const { mesh, offset } of meshes) {
          if (offset) {
            // Rotate the local part offset into world space.
            const ox = offset[0];
            const oy = offset[1];
            const oz = offset[2];
            const cos = Math.cos(heading);
            const sin = Math.sin(heading);
            dummy.position.set(
              baseX + a.avoidX + ox * cos + oz * sin,
              0.16 + oy + bobY,
              baseZ + a.avoidZ - ox * sin + oz * cos
            );
          } else {
            dummy.position.set(baseX + a.avoidX, 0.16 + bobY, baseZ + a.avoidZ);
          }
          dummy.rotation.set(0, heading, 0);
          // A hailed vehicle is drawn by streetlife/rides.js for the length of the ride.
          dummy.scale.setScalar(a.hidden ? 0 : 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
      }
      for (const { mesh } of meshes) mesh.instanceMatrix.needsUpdate = true;
    }
    perf.pushedCount = pushedCount;
  }

  function setNight(on) {
    for (const m of nightMeshes) m.visible = on;
  }

  /**
   * Nearest visible vehicle of the given types, for hailing a ride
   * (streetlife/rides.js). Reads the world positions cached by update().
   * @param {number} x @param {number} z @param {number} maxDist @param {string[]} types
   * @param {{ fx: number, fz: number } | null} [facing] unit view direction on the ground plane
   */
  function nearestAgent(x, z, maxDist, types, facing = null) {
    let best = null;
    let bestScore = Infinity;
    for (const sys of systems) {
      if (!types.includes(sys.type)) continue;
      for (const a of sys.agents) {
        if (a.hidden || a._wx === undefined) continue;
        const d = Math.hypot(a._wx - x, a._wz - z);
        if (d > maxDist) continue;
        // Prefer the vehicle being looked at over one that is merely closer.
        const looking = facing && d > 0.5 ? ((a._wx - x) * facing.fx + (a._wz - z) * facing.fz) / d : 0;
        const score = d - looking * 9;
        if (score < bestScore) {
          bestScore = score;
          const s = sampleRoute(a.route, a.d);
          best = { agent: a, type: sys.type, x: a._wx, z: a._wz, dist: d, heading: Math.atan2(s.ux * a.dir, s.uz * a.dir) };
        }
      }
    }
    return best;
  }

  return {
    group,
    update,
    setNight,
    nearestAgent,
    perf,
    systems, // P7-COLLISION verification only: read-only introspection of agent state
    stats: {
      vehicles: totalVehicles,
      routes: routes.length,
      drawCalls: group.children.length,
      ms: Math.round(performance.now() - t0),
    },
  };
}

// ---------------------------------------------------------------------------
// Pedestrians
// ---------------------------------------------------------------------------

// P11-F: the pedestrian system stopped at street level — a brand-new metro
// station reads as deserted because nobody ever walks the concourse (y=8) or
// platform (y=14.5) decks (owner, 2026-09-07: "No people inside the
// stations"). Station agents are a second class of agent living in the SAME
// shared InstancedMesh as the street crowd (no extra draw calls),
// with their own build-time bands and their own update branch below — they
// never enter separateAgents/recycleAgents/applyPlayerAvoidance, all of
// which assume a road route and a shared street/vehicle grid.
const STATION_AGENTS_PER_STATION = 40;
// Stations further than this from the player are not re-posed each frame —
// four stations' worth of crowd (up to 160 agents) should not animate every
// frame regardless of where the player is standing, matching the
// origin/MAX_PEDS_NEAR budgeting spirit used for the street crowd. Their
// last computed matrix simply persists (cheap: identical bytes re-uploaded)
// until the player is close enough to see them move.
const STATION_NEAR_R = 300;

/**
 * Local-space (station-frame) -> world transform, per the brief:
 *   x = st.x + lx*cos(h) + lz*sin(h)
 *   z = st.z - lx*sin(h) + lz*cos(h)
 * Matches the transform metro.js itself uses to place station children
 * (see buildStation's entrance placement, `wx = x + coreX*cos(heading) +
 * zc*sin(heading)`).
 */
function stationLocalToWorld(st, lx, lz) {
  return {
    x: st.x + lx * st.cosH + lz * st.sinH,
    z: st.z - lx * st.sinH + lz * st.cosH,
  };
}

/**
 * Build the station-agent population: up to STATION_AGENTS_PER_STATION per
 * station, split across the concourse deck and the two platforms.
 *
 * `scene.metro.stations` as handed to buildPedestrians is the RAW scene-JSON
 * station list ({name, x, z}) — buildMetro() computes a heading per station
 * (nearest segment of the track centreline) but returns it on its OWN
 * `stations` result, not written back onto `scene.metro.stations`. So this
 * derives heading the same way metro.js does, straight from
 * `scene.metro.tracks` via the exported `centreAlignment` helper. If tracks
 * are missing for some reason, heading falls back to 0 rather than
 * inventing a value (reported back to the owner, per the brief).
 */
function buildStationAgents(scene, rndFn) {
  const stations = scene.metro?.stations || [];
  if (!stations.length) return [];

  const tracks = scene.metro.tracks || [];
  const centre = tracks.length ? centreAlignment(tracks) : null;
  let derivedHeadingFallback = false;

  const platHalfW = METRO.PLATFORM_W / 2;
  const platCenterX = -(METRO.TRACK_CENTRES / 2 + 0.1 + platHalfW); // platform A (owner formula)
  // Split the per-station budget 40/40 concourse vs the two platforms,
  // 20/20 between the platforms (rounded so the three counts sum exactly to
  // STATION_AGENTS_PER_STATION).
  const nConcourse = Math.round(STATION_AGENTS_PER_STATION * 0.4);
  const nPlat = Math.round((STATION_AGENTS_PER_STATION - nConcourse) / 2);

  const list = [];
  for (const st of stations) {
    let heading = st.heading;
    if (heading === undefined || heading === null) {
      if (centre && centre.length > 1) {
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
        heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
      } else {
        heading = 0;
        derivedHeadingFallback = true;
      }
    }

    const stRef = { x: st.x, z: st.z, cosH: Math.cos(heading), sinH: Math.sin(heading), name: st.name };

    // ---- Concourse deck, y = CONCOURSE_Y --------------------------------
    // Long axis is Z (60 m) vs X (27 m), so agents wander along Z with a
    // fixed lane X, per the brief ("wander along its band's long axis").
    // Kept off the TVM bank box (local X in [-7,-1], Z near -22) by
    // resampling X whenever an agent's full wander path would cross it; the
    // AFC gate line (Z=-6) is not avoided outright since walking through it
    // is the "crossing" the brief calls out as fine, only loitering on it
    // is not — see the pause guard in the update loop below.
    for (let i = 0; i < nConcourse; i++) {
      const anchor = (rndFn() * 2 - 1) * (METRO.CONCOURSE_LEN / 2 - 4);
      const rangeHalf = 6 + rndFn() * 10;
      const zMin = anchor - rangeHalf;
      const zMax = anchor + rangeHalf;
      const crossesTvm = zMin < -18 && zMax > -26;
      let localPerp;
      let tries = 0;
      do {
        localPerp = (rndFn() * 2 - 1) * (METRO.CONCOURSE_W / 2 - 1.5);
        tries++;
      } while (crossesTvm && localPerp > -7.5 && localPerp < -0.5 && tries < 20);
      list.push({
        kind: 'station',
        st: stRef,
        band: 'concourse',
        y: METRO.CONCOURSE_Y,
        localPerp,
        anchor,
        rangeHalf,
        z: anchor,
        dir: rndFn() < 0.5 ? 1 : -1,
        speed: 0.55 + rndFn() * 0.35,
        faceInward: false,
        inwardSign: 0,
        state: 'walk',
        timer: rndFn() * 10,
        phase: rndFn() * Math.PI * 2,
        scale: 0.92 + rndFn() * 0.16,
      });
    }

    // ---- Platforms, y = PLATFORM_Y ---------------------------------------
    // Loitering near the track-side edge, facing the track (waiting for a
    // train) — not pacing the full 180 m length, just a small shuffle
    // around a fixed spot, per the brief ("not conga-line up and down").
    for (const [band, inwardSign] of [['platA', 1], ['platB', -1]]) {
      for (let i = 0; i < nPlat; i++) {
        const anchor = ((i + 0.5) / nPlat - 0.5) * (METRO.PLATFORM_LEN - 24);
        // Position on platform deck (X in 4.8..7.5), behind the yellow tactile line at 4.10
        // inwardSign: 1 for platA (faces +X toward track), -1 for platB (faces -X toward track)
        const localPerp = -inwardSign * (5.2 + rndFn() * 2.2);
        list.push({
          kind: 'station',
          st: stRef,
          band,
          y: METRO.PLATFORM_Y,
          localPerp,
          anchor,
          rangeHalf: 1.5 + rndFn() * 2,
          z: anchor,
          dir: rndFn() < 0.5 ? 1 : -1,
          speed: 0.3 + rndFn() * 0.2,
          faceInward: true,
          inwardSign,
          state: rndFn() < 0.6 ? 'stand' : 'walk',
          timer: rndFn() * 8,
          phase: rndFn() * Math.PI * 2,
          scale: 0.92 + rndFn() * 0.16,
        });
      }
    }
  }

  if (derivedHeadingFallback) {
    console.warn(
      '[traffic] station heading could not be derived (scene.metro.tracks empty) — ' +
      'station agents fell back to heading 0, which may not match the platform orientation.'
    );
  }
  return list;
}

/** Simple walking figures along the footpaths beside the arterials. */
export function buildPedestrians(scene, count = 750, origin = null) {
  const group = new THREE.Group();
  group.name = 'pedestrians';

  const rawRoutes = buildRoutes(scene.roads, scene.metro?.tracks);
  const routes = rawRoutes.filter((r) => r.rank >= 2);
  const metroCentre = scene.metro?.tracks?.length ? centreAlignment(scene.metro.tracks) : null;
  if (metroCentre && metroCentre.length >= 2) {
    for (const side of [-1, 1]) {
      const footPts = offsetPolyline(metroCentre, side * 13.5);
      const cum = [0];
      for (let i = 1; i < footPts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(footPts[i][0] - footPts[i - 1][0], footPts[i][1] - footPts[i - 1][1]));
      }
      if (cum[cum.length - 1] >= 25) {
        routes.push({
          pts: footPts,
          cum,
          len: cum[cum.length - 1],
          rank: 3,
          w: 3.0,
          isCorridorFoot: true,
        });
      }
    }
  }

  // Station agents (P11-F) do not depend on the road graph at all, so build
  // them even on a scene with no eligible footpath routes.
  const stationAgents = buildStationAgents(scene, rnd);
  const streetCount = routes.length ? count : 0;
  if (!streetCount && !stationAgents.length) return { group, update: () => {}, stats: { count: 0 } };
  const routeIndex = routes.length ? buildRouteIndex(routes) : null; // also stamps r._mx/_mz

  const shirtColors = [
    0xd8d5cc, 0x3f5f8c, 0x7a3f42, 0x2f5d43, 0xc9a24a,
    0x4a4a52, 0xa85c7a, 0x5c6b7a, 0xe0dcd0, 0x8f6b3f,
  ];

  const totalInstances = streetCount + stationAgents.length;
  const figures = createPedestrianModel(totalInstances);
  const bodies = figures.mesh;

  const c = new THREE.Color();
  const pedSeed = origin && routes.length
    ? routes.filter((r) => Math.hypot(r._mx - origin.x, r._mz - origin.z) < 900)
    : [];
  const pedPool = pedSeed.length >= 8 ? pedSeed : routes;
  const agents = [];
  for (let i = 0; i < streetCount; i++) {
    const route = pedPool[Math.floor(rnd() * pedPool.length)];
    let d = rnd() * route.len;
    if (origin && route.len > 400) {
      const dNear = closestDistAlongRoute(route, origin.x, origin.z);
      d = ((dNear + (rnd() - 0.5) * 500) % route.len + route.len) % route.len;
    }
    // Lateral spread across the footpath width, so the crowd occupies the
    // paving rather than tracing one line along it.
    const offJitter = (rnd() - 0.35) * 1.8;
    agents.push({
      route,
      d,
      speed: 0.9 + rnd() * 0.55,
      dir: rnd() < 0.5 ? 1 : -1,
      side: rnd() < 0.5 ? 1 : -1,
      phase: rnd() * Math.PI * 2,
      scale: 0.92 + rnd() * 0.16,
      offJitter,
      // Stagger the first state change so the whole crowd does not stop,
      // start and cross in lockstep on the same frame.
      state: 'walk',
      timer: rnd() * 18,
      // P7-COLLISION (same fields/meaning as buildTraffic's agents above).
      avoidX: 0,
      avoidZ: 0,
      brakeMul: 1,
      playerBrake: 1,
    });
    c.setHex(shirtColors[Math.floor(rnd() * shirtColors.length)]);
    bodies.setColorAt(i, c);
  }
  // Reuse the same shirt palette for station agents so they read as the
  // same population as the street (brief requirement), at the index range
  // just past the street agents.
  for (let k = 0; k < stationAgents.length; k++) {
    c.setHex(shirtColors[Math.floor(rnd() * shirtColors.length)]);
    bodies.setColorAt(streetCount + k, c);
  }
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;

  group.add(bodies);
  const PED_RADIUS = 0.3;
  const perf = { collisionMs: 0, pushedCount: 0 };

  const pedSys = { agents };

  /**
   * Pose one station agent and write its matrix at instance index `idx`.
   * Shared between the one-off initial pass (below, so every station
   * instance has a real deck-height matrix before the first frame — an
   * un-posed instance defaults to an identity matrix, i.e. sitting at
   * y=0 under the station, exactly the bug this feature exists to fix)
   * and the per-frame update branch for stations near the player.
   */
  function poseStationAgent(a, idx, dt) {
    const { x: wx, z: wz } = stationLocalToWorld(a.st, a.localPerp, a.z);
    let heading;
    if (a.faceInward && a.state !== 'walk') {
      // Face across the track: local +/-X rotated into world, per the same
      // local->world transform (with lz=0, since this is a pure direction).
      const dx = a.inwardSign * a.st.cosH;
      const dz = -a.inwardSign * a.st.sinH;
      heading = Math.atan2(dx, dz);
    } else {
      // Face the direction of travel along local Z, matching the street
      // agents' atan2(ux*dir, uz*dir) convention.
      const dx = a.dir * a.st.sinH;
      const dz = a.dir * a.st.cosH;
      heading = Math.atan2(dx, dz);
    }
    figures.pose(idx, wx, a.y, wz, heading, a.scale, dt, a.state === 'walk');
  }

  // One-off initial pose for every station agent (see poseStationAgent's
  // doc comment) — otherwise whichever stations start outside
  // STATION_NEAR_R render their people at the identity matrix (y=0) until
  // the player first walks close enough to update them.
  for (let k = 0; k < stationAgents.length; k++) {
    poseStationAgent(stationAgents[k], streetCount + k, 0);
  }
  if (stationAgents.length) {
    figures.flush();
  }

  function update(dt) {
    const t0 = performance.now();
    const playerProxy = getPlayerProxy();
    let pushedCount = 0;
    // Keep the crowd with the player, off-screen only, and capped the same
    // way the vehicle fleet is (see MAX_PEDS_NEAR).
    // Station agents (pushed only into `stationAgents`, never into `agents`)
    // deliberately do NOT go through this pass — separateAgents hashes by
    // (x,z) only, ignoring Y, so a platform agent 14.5 m above a street
    // pedestrian at the same map coordinate would otherwise be shoved
    // sideways by a person it is nowhere near (brief: station agents "must
    // be skipped entirely by the street-crowd separation pass").
    const pedSep = routeIndex
      ? separateAgents([{ agents, agentRadius: PED_RADIUS }], playerProxy)
      : { hits: 0, near: 0 };
    if (routeIndex) {
      recycleAgents(pedSys, routeIndex, playerProxy, rnd, 2,
        Math.max(0, MAX_PEDS_NEAR - pedSep.near));
    }
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];

      // ---- Behaviour state machine (owner, 2026-09-07: "Pedestrians should
      // walk, stay, or stand on the road side, not directly in the road but
      // they can cross the road"). Three states:
      //   walk  - moving along the footpath
      //   stand - stopped on the footpath for a few seconds
      //   cross - traversing the carriageway, side lerping +1 <-> -1
      a.state = a.state || 'walk';
      a.timer = (a.timer || 0) - dt;
      if (a.timer <= 0) {
        if (a.state === 'cross') {
          a.state = 'walk';
          a.side = a.crossTo;
          a.timer = 6 + rnd() * 14;
        } else if (a.state === 'stand') {
          a.state = 'walk';
          a.timer = 8 + rnd() * 16;
        } else {
          // From walking: mostly keep walking, sometimes stop, rarely cross.
          const roll = rnd();
          if (roll < 0.16) {
            a.state = 'stand';
            a.timer = 2.5 + rnd() * 7;
          } else if (roll < 0.24) {
            a.state = 'cross';
            a.crossFrom = a.side;
            a.crossTo = -a.side;
            a.crossT = 0;
            // ~3.5 s to cross, so it reads as a deliberate walk, not a jump.
            a.timer = 3.5;
          } else {
            a.timer = 6 + rnd() * 14;
          }
        }
      }

      const walking = a.state === 'walk' || a.state === 'cross';
      if (walking) a.d += a.speed * dt * a.dir * a.brakeMul * a.playerBrake;
      const s = sampleRoute(a.route, a.d);

      // Footpath offset. For corridor footpaths (isCorridorFoot), the route is already
      // on the footpath midline (+/- 13.5m from metro centreline), so off is purely jitter.
      // For general OSM roads, offset from centreline by w/2 + margin.
      // Scaled by cornerEase at sharp bends so pedestrians don't clip off corner kerbs.
      const baseOff = a.route.isCorridorFoot
        ? (a.offJitter || 0)
        : (a.route.w / 2 + 1.8 + (a.offJitter || 0));
      const footOff = baseOff * (s.cornerEase ?? 1.0);
      let sideNow = a.side;
      if (a.state === 'cross') {
        a.crossT = Math.min(1, (a.crossT || 0) + dt / 3.5);
        // Smoothstep across, so they ease off and onto the kerb.
        const t = a.crossT * a.crossT * (3 - 2 * a.crossT);
        sideNow = a.crossFrom * (1 - t) + a.crossTo * t;
      }
      const off = footOff;
      const x = s.x - s.uz * off * sideNow;
      const z = s.z + s.ux * off * sideNow;
      a._wx = x;
      a._wz = z;
      // P7-COLLISION: "pedestrians must not be walked or driven through" —
      // same distance-culled push-out as vehicles, no car-following (a
      // footpath crowd queuing nose-to-tail is not the requirement here).
      if (applyPlayerAvoidance(a, x, z, PED_RADIUS, playerProxy)) pushedCount++;
      figures.pose(i, x + a.avoidX, 0, z + a.avoidZ,
        Math.atan2(s.ux * a.dir, s.uz * a.dir), a.scale, dt, walking);
    }
    // ---- Station agents (P11-F): their own branch, own state machine, no
    // separateAgents/recycleAgents/applyPlayerAvoidance — they are scenery
    // on a deck 8-14.5 m above the road, not part of the street/vehicle
    // grid, and the brief explicitly says no player collision for them.
    if (stationAgents.length) {
      // Cheap per-frame check (at most a handful of stations): stations far
      // from the player are skipped outright, so up to 160 station agents
      // do not get posed every frame regardless of where the player is
      // standing (see STATION_NEAR_R doc comment above).
      const nearStations = new Set();
      if (playerProxy) {
        for (const a of stationAgents) {
          if (nearStations.has(a.st)) continue;
          if (Math.hypot(a.st.x - playerProxy.x, a.st.z - playerProxy.z) < STATION_NEAR_R) {
            nearStations.add(a.st);
          }
        }
      } else {
        for (const a of stationAgents) nearStations.add(a.st);
      }

      for (let k = 0; k < stationAgents.length; k++) {
        const a = stationAgents[k];
        if (!nearStations.has(a.st)) continue; // leave last frame's matrix in place

        a.timer -= dt;
        if (a.timer <= 0) {
          if (a.band === 'concourse') {
            if (a.state === 'walk') {
              a.state = 'stand';
              a.timer = 2.5 + rnd() * 6;
            } else {
              a.state = 'walk';
              a.timer = 5 + rnd() * 12;
              if (rnd() < 0.4) a.dir *= -1;
            }
          } else {
            // Platform loitering: mostly standing, with short shuffles —
            // never a full-length pace (brief: "not conga-line up and
            // down").
            if (a.state === 'walk') {
              a.state = 'stand';
              a.timer = 4 + rnd() * 10;
            } else {
              a.state = 'walk';
              a.timer = 1.5 + rnd() * 3;
              if (rnd() < 0.5) a.dir *= -1;
            }
          }
        }

        if (a.state === 'walk') {
          a.z += a.dir * a.speed * dt;
          if (a.z > a.anchor + a.rangeHalf) {
            a.z = a.anchor + a.rangeHalf;
            a.dir = -1;
          } else if (a.z < a.anchor - a.rangeHalf) {
            a.z = a.anchor - a.rangeHalf;
            a.dir = 1;
          }
          // Concourse-only: don't loiter standing right on the AFC gate
          // line (local Z = -6) — walking through it while state is 'walk'
          // is the "crossing" the brief says is fine, only stopping there
          // reads wrong. Nudge the next pause decision away from it by
          // shortening this walk leg if we're already past the line.
          if (a.band === 'concourse' && Math.abs(a.z - (-6)) < 1.2 && a.timer > 2) {
            a.timer = 1;
          }
        }

        poseStationAgent(a, streetCount + k, dt);
      }
    }

    figures.flush();
    perf.collisionMs = performance.now() - t0; // whole-function cost; pedestrians do no car-following, so this is ~all avoidance + the existing per-agent work
    perf.pushedCount = pushedCount;
  }

  return {
    group,
    update,
    stats: { count: streetCount, stationAgents: stationAgents.length },
    perf,
  };
}
