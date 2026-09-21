/**
 * traffic.js
 *
 * Moving vehicles on the real OSM road graph, plus pedestrians on the
 * footpaths. The mix is deliberately Dhaka: cycle-rickshaws outnumber
 * everything else, then CNG auto-rickshaws, then buses and private cars.
 *
 * Every vehicle type is at most three InstancedMeshes (src/vehicle-models.js),
 * so the whole traffic system costs about a dozen draw calls no matter how
 * many vehicles are moving.
 */

import * as THREE from 'three';
import { resolveCollision } from './city.js';
import { METRO, centreAlignment } from './metro.js';
import { createPedestrianModel, RAGDOLL_CENTRE } from './pedestrian-model.js';
import { vehicleGeometry, hireGeometry } from './vehicle-models.js';
import { createHitFx } from './hit-fx.js';

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

// Beyond this distance from the camera a vehicle is drawn with its few-box far
// model (src/vehicle-models.js). At 70 m a rickshaw is ~25 px tall on a 1080p
// screen, where the puller's limbs and the hood ribs are below a pixel.
const LOD_NEAR_SQ = 70 * 70;

/** Rickshaw hoods are painted in loud, saturated colours. */
const RICKSHAW_COLORS = [0xb4272c, 0x1c5fa8, 0x137a4a, 0x8b2f8f, 0xd18f16, 0x145f6e];
const CAR_COLORS = [0xd8d8d4, 0x2b2b30, 0x8b1f24, 0x243d63, 0x9a9a96, 0x53585c];
const BUS_COLORS = [0xa8302c, 0x1d5c8f, 0xcfc4a8, 0x2f6b45, 0xb5762a];
const BIKE_COLORS = [0xb3201f, 0x1b1d22, 0x1f4f9c, 0xd8d8d4, 0xd07a12, 0x2d6b3f];

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
//  - Agent vs whatever is ahead of it in its lane (lookAhead(), which
//    superseded this pass's original per-route, per-type car-following): it
//    brakes once the gap is under SAFE_GAP, which is what makes traffic QUEUE
//    nose-to-tail instead of driving through each other.
// ---------------------------------------------------------------------------

const PLAYER_WALK_RADIUS = 0.5; // a hair over player.js's PLAYER_RADIUS (0.42)
const PLAYER_RIDE_RADIUS = 1.3; // a passenger in a hailed rickshaw / CNG / bus
const PLAYER_CAR_RADIUS = 2.6; // drive.js's HALF_L 2.25 / HALF_W 0.9 (private, not exported) + margin
const PLAYER_CULL_R2 = 16 * 16; // metres^2: ignore agents further than this from the player
const AVOID_DECAY = 0.9; // per frame; higher = snaps back to its lane faster once clear
const AVOID_MAX = 2.5; // metres: clamp so a fast car can't fling an agent off the map
const SAFE_GAP = 5.5; // metres, bumper to bumper, below which a follower starts matching the leader

// Look-ahead braking (owner, 2026-09-21: "traffic and vehicles become more
// smart, like not going into each other"). See lookAhead().
const LOOK_AHEAD = 5; // m: centre of the 3x3 hash-cell scan in front of each vehicle
const SAME_WAY_DOT = -0.3; // heading dot below this = oncoming; that is the lanes' job, not the brakes'
const PATIENCE = 6; // s held near-stationary before a vehicle creeps through regardless
const CREEP_TIME = 3; // s of ignoring the brakes once patience runs out
/** Half body length per type, m (the collision radius only covers the width). */
const HALF_LEN = { bike: 1.0, rickshaw: 1.3, cng: 1.4, car: 2.2, bus: 5.0 };

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
  // A hailed ride (streetlife/rides.js) seats the eye up to 2.5 m up in a
  // bus: that is still on the road, not elevated.
  const riding = !!hook.player.inRide;
  const elevated = !riding && p.y > 4.5;
  // Driving is read off drive.js itself. It used to be guessed from eye
  // height (< 1.45 m), which also matched the CNG passenger seat (1.44 m) and
  // gave a CNG passenger the car's 2.6 m shove radius.
  const driving = !elevated && !riding && !!(hook.drive && hook.drive.driving);
  const yaw = hook.player.yaw || 0;

  // World velocity, from the position itself so it covers walking, driving
  // and riding alike. This function is called several times a frame; only
  // re-sample once real time has passed. A teleport is not a velocity.
  const now = performance.now();
  const dtMs = now - playerTrack.at;
  if (dtMs > 8) {
    const vx = ((p.x - playerTrack.x) / dtMs) * 1000;
    const vz = ((p.z - playerTrack.z) / dtMs) * 1000;
    const sane = dtMs < 500 && vx * vx + vz * vz < 45 * 45;
    playerTrack.vx = sane ? vx : 0;
    playerTrack.vz = sane ? vz : 0;
    playerTrack.x = p.x;
    playerTrack.z = p.z;
    playerTrack.at = now;
  }
  return {
    x: p.x, z: p.z, driving, riding, elevated,
    vx: playerTrack.vx, vz: playerTrack.vz,
    radius: driving ? PLAYER_CAR_RADIUS : riding ? PLAYER_RIDE_RADIUS : PLAYER_WALK_RADIUS,
    fx: -Math.sin(yaw), fz: -Math.cos(yaw),
  };
}

const playerTrack = { x: 0, z: 0, vx: 0, vz: 0, at: 0 };

/**
 * Player-vs-agent overlap: push the agent sideways off its lane (an
 * "avoid" offset that decays back to 0 once clear) and throttle its
 * forward progress. Mutates `a` in place. Returns true if the agent is
 * currently being pushed (used only for the doc's measured count).
 *
 * Sets `a.playerBrake`, NOT `a.brakeMul` — `a.brakeMul` belongs to
 * lookAhead() and is eased toward its target every frame, so anything this
 * function wrote there would be pulled straight back out. `a.playerBrake`
 * is this function's own field,
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

// ---------------------------------------------------------------------------
// Run-over physics (owner, 2026-09-21: "kill pedestrians by driving on them,
// also destroy vehicles ... must be optimized"). No physics engine: every
// agent stays a kinematic rail-rider, and only the handful that were actually
// HIT get a few lines of ballistic/friction integration until they respawn.
//  - The hit test is the player's car as an oriented box (pose + velocity
//    from drive.js's `mirpur.drive.getMotion`) against the agent's circle, in
//    the car's own frame: two dot products per agent, and only for agents
//    already inside applyPlayerAvoidance's PLAYER_CULL_R2.
//  - A hit pedestrian becomes a ragdoll in its OWN instance slot; a vehicle
//    loses hp (its tint darkens) and at 0 becomes a wreck that slides, spins,
//    tips over if it is light, smokes, then respawns out of sight.
//  - Both are hard-capped (MAX_RAGDOLLS / MAX_WRECKS, oldest evicted first),
//    so the extra per-frame work is bounded no matter how long a rampage is.
// Below HIT_MIN_SPEED nothing here fires and the P7-COLLISION push-aside
// above is all that happens, exactly as before.
// ---------------------------------------------------------------------------
const HIT_MIN_SPEED = 4; // m/s (~14 km/h); slower than this just nudges
const PLAYER_MASS = 1.6; // relative units, against VEHICLE_MASS below
const VEHICLE_MASS = { bike: 0.5, rickshaw: 0.6, cng: 0.9, car: 1.3, bus: 4 };
/** Roll a wreck settles at, rad: two- and three-wheelers end up on their side. */
const WRECK_ROLL = { bike: 1.45, rickshaw: 1.25, cng: 1.1, car: 0.07, bus: 0.04 };
const DAMAGE_PER_MS = 8; // hp (of 100) per m/s of closing speed, divided by mass
const HIT_COOLDOWN = 0.4; // s before the same vehicle can be damaged again
const MAX_RAGDOLLS = 12;
const MAX_WRECKS = 6;
const RAGDOLL_LIFETIME = 12; // s
const WRECK_LIFETIME = 25; // s
const GONE_DIST_SQ = 150 * 150; // further than this from the player: respawn early
const SINK_TIME = 1.2; // s at the end of a lifetime spent sinking into the road
const GRAVITY = 16; // m/s^2, heavier than real so a launch reads as snappy
const IMPACT_SOUND_GAP = 80; // ms between thunks, so a crowd is not 15 sounds at once

// ---------------------------------------------------------------------------
// Street sense (owner, 2026-09-21: "make pedestrians smart, now they dumb").
// The vehicle fleet and the crowd are built by two separate functions that
// never saw each other: people stepped into the road on a timer without
// looking, and vehicles drove through anyone on it. `shared` is the one
// place each side publishes what the other needs:
//  - systems       the vehicle systems, so a pedestrian at the kerb can look
//                  for a gap before crossing (roadIsClear);
//  - pedObstacles  everyone currently ON the carriageway near the player
//                  (crossing, knocked down, or up and angry), so lookAhead()
//                  brakes for them like it does for a vehicle.
// ---------------------------------------------------------------------------
const shared = { systems: null, pedObstacles: [], player: null };
const CROSS_LOOK = 4.5; // s of oncoming traffic a pedestrian wants clear (the crossing takes 3.5)
const CROSS_MAX_WAIT = 9; // s at the kerb before giving up and walking on
const SMART_RADIUS_SQ = 230 * 230; // beyond this nobody is watching: cross as before, skip the checks
const DODGE_MIN_SPEED = 3; // m/s: slower than this the car is no threat
const DODGE_SPEED = 4; // m/s sideways, a panicked jump
const DODGE_SIGHT = 24; // m: nobody reacts to a car further off than this
const BACK_TURNED_DELAY = 0.45; // s extra before someone facing away notices
const FREEZE_CHANCE = 0.15; // of people in the car's path who just stand there

const carMotion = {
  active: false, present: false, speed: 0, hitLx: 0,
  x: 0, z: 0, fx: 0, fz: 1, vx: 0, vz: 0, halfL: 2.3, halfW: 0.94,
};
let lastImpactSoundAt = 0;

/** Refresh `carMotion` from drive.js. Inactive on foot, in the air, or slow. */
function readCarMotion(playerProxy) {
  carMotion.active = false;
  carMotion.present = false;
  carMotion.speed = 0;
  carMotion.vx = 0;
  carMotion.vz = 0;
  if (!playerProxy || playerProxy.elevated) return;
  const drive = window.__mirpur && window.__mirpur.drive;
  if (!drive || !drive.getMotion || !drive.getMotion(carMotion)) return;
  carMotion.present = true;
  carMotion.speed = Math.hypot(carMotion.vx, carMotion.vz);
  carMotion.active = carMotion.speed >= HIT_MIN_SPEED;
}

/**
 * Is the circle (wx, wz, r) inside the moving car's box, and is the car
 * travelling TOWARD it? Leaves the agent's lateral offset in the car's frame
 * in `carMotion.hitLx` (its sign decides which way things spin).
 */
function carHits(wx, wz, r) {
  const dx = wx - carMotion.x;
  const dz = wz - carMotion.z;
  if (dx * carMotion.vx + dz * carMotion.vz <= 0) return false;
  const lz = dx * carMotion.fx + dz * carMotion.fz;
  if (Math.abs(lz) > carMotion.halfL + r) return false;
  const lx = dz * carMotion.fx - dx * carMotion.fz;
  if (Math.abs(lx) > carMotion.halfW + r) return false;
  carMotion.hitLx = lx;
  return true;
}

/** Tell drive.js the car hit something; the thunk is rate-limited, the speed loss is not. */
function reportImpact(keep, severity, yawKick) {
  const drive = window.__mirpur && window.__mirpur.drive;
  if (!drive || !drive.impact) return;
  const now = performance.now();
  const audible = now - lastImpactSoundAt > IMPACT_SOUND_GAP;
  if (audible) lastImpactSoundAt = now;
  drive.impact(keep, audible ? severity : 0, yawKick);
}

/** Slide a knocked-about body along walls instead of through them. */
function slideOnWorld(x, z, radius) {
  const collision = window.__mirpur && window.__mirpur.collision;
  return collision ? resolveCollision(collision, x, z, radius) : null;
}

/**
 * Would anything reach the crossing at road-centre point (cx, cz), `halfSpan`
 * metres kerb to centre, within CROSS_LOOK seconds? Looks at every vehicle
 * (and the player's car) the way a person does: is it coming TOWARD my
 * crossing line, and how soon. A stopped queue right on the line blocks too.
 */
function roadIsClear(cx, cz, halfSpan) {
  for (const sys of shared.systems || []) {
    for (const v of sys.agents) {
      if (v._wx === undefined || v._hx === undefined || v.hidden) continue;
      const dx = cx - v._wx;
      const dz = cz - v._wz;
      if (dx * dx + dz * dz > 70 * 70) continue;
      const ahead = dx * v._hx + dz * v._hz;
      const speed = v.wreck ? 0 : v.speed * v.brakeMul;
      if (ahead < -3 || ahead > speed * CROSS_LOOK + 6) continue;
      if (Math.abs(dx * v._hz - dz * v._hx) > halfSpan + 1.5) continue;
      return false;
    }
  }
  // The player's own vehicle, driven or ridden (a hailed ride is not in
  // `shared.systems`: its agent is hidden and rides.js moves a stand-in).
  const pm = shared.player;
  if (pm && (pm.driving || pm.riding)) {
    const dx = cx - pm.x;
    const dz = cz - pm.z;
    const speed = Math.hypot(pm.vx, pm.vz);
    if (speed < 0.5) return dx * dx + dz * dz > 6 * 6;
    const ix = pm.vx / speed;
    const iz = pm.vz / speed;
    const ahead = dx * ix + dz * iz;
    if (ahead > -3 && ahead < speed * CROSS_LOOK + 6
      && Math.abs(dx * iz - dz * ix) <= halfSpan + 1.5) return false;
  }
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
// The models themselves live in src/vehicle-models.js, merged down to at most
// three geometries per type: the panels that take the vehicle's colour, the
// fixed-colour detail (vertex colours), and the night-only lamps. One
// InstancedMesh each, so a type costs three draw calls and three matrix
// writes per vehicle per frame (the old boxes cost 5-11 of each).
// Local space: +Z is forward, Y is up, origin at road level.
// ---------------------------------------------------------------------------

function partsFor(type) {
  const { paint, detail, lamps, doubleSide } = vehicleGeometry(type);
  const parts = [{ key: 'detail', geometry: detail, colored: false, doubleSide }];
  if (paint) parts.unshift({ key: 'paint', geometry: paint, colored: true, doubleSide });
  if (lamps) parts.push({ key: 'lamps', geometry: lamps, colored: false, basic: true, night: true });
  return parts;
}

/** The few-box stand-in drawn beyond LOD_NEAR instead of the full model. */
function farPartFor(type) {
  const { far, doubleSide } = vehicleGeometry(type);
  return { key: 'far', geometry: far, colored: true, doubleSide };
}

const PROTOTYPES = {
  rickshaw: { parts: () => partsFor('rickshaw'), colors: RICKSHAW_COLORS },
  // Always the green livery: white leaves the baked colours of the far model untinted.
  cng: { parts: () => partsFor('cng'), colors: [0xffffff] },
  car: { parts: () => partsFor('car'), colors: CAR_COLORS },
  bus: { parts: () => partsFor('bus'), colors: BUS_COLORS },
  bike: { parts: () => partsFor('bike'), colors: BIKE_COLORS },
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
  // A hailed vehicle is seen from INSIDE, which some street models cannot be
  // (see vehicle-models.js#hireGeometry).
  let parts = proto.parts();
  const cabin = hireGeometry(type);
  if (cabin) {
    parts = [{ key: 'detail', geometry: cabin.detail, colored: false }];
    if (cabin.paint) parts.unshift({ key: 'paint', geometry: cabin.paint, colored: true });
  }
  for (const p of parts) {
    if (p.night) continue;
    const Material = p.basic ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
    const mesh = new THREE.Mesh(p.geometry, new Material({
      color: p.colored ? tint : 0xffffff,
      vertexColors: true,
      side: p.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    }));
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
 * Braking (lookAhead) only handles what is AHEAD in a vehicle's own lane;
 * two vehicles side by side, in opposing lanes, or converging at a junction
 * can still overlap. This pass hashes
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

function separateAgents(allSystems, player, follow = false) {
  if (!player) return { hits: 0, near: 0 };
  const grid = new Map();
  const live = [];
  for (const sys of allSystems) {
    const rad = sys.agentRadius || 1.2;
    const halfLen = sys.halfLen || rad;
    for (const a of sys.agents) {
      if (a.hidden) continue; // out on a hailed ride (rides.js draws it): a ghost shoves nobody
      const px = a._wx;
      const pz = a._wz;
      if (px === undefined || a.dead) continue; // a body on the road shoves nobody
      if (Math.hypot(px - player.x, pz - player.z) > SEPARATE_ACTIVE_R) continue;
      const rec = { a, x: px, z: pz, r: rad, hl: halfLen };
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
          // is lookAhead()'s job, which brakes only for what is AHEAD and
          // has its own deadlock guards; this pass only pushes sideways.
          hits++;
        }
      }
    }
    if (follow) lookAhead(rec, grid, player);
  }
  return { hits, near: live.length };
}

/**
 * Brake `rec` for whatever is in its own lane ahead: ANY vehicle type, on ANY
 * route, plus wrecks and the player. This replaces the old car-following,
 * which sorted agents by arclength inside (route, direction, TYPE) groups
 * built once at startup — so a car never saw the rickshaw in front of it, and
 * once recycleAgents had moved agents onto new routes the groups described
 * streets their members had long since left.
 *
 * Works on real world positions and headings instead, off the hash grid
 * separateAgents() has already built, so it costs one extra 3x3 cell scan
 * per vehicle near the player and nothing for the rest of the fleet.
 *
 * Writes `a.brakeTarget`; update() eases `a.brakeMul` toward it. A follower
 * closes up to SAFE_GAP and then MATCHES the leader's speed rather than
 * stopping dead, so queues flow.
 *
 * Deadlocks (the reason separateAgents itself never brakes) are closed off
 * three ways: oncoming vehicles are ignored, two vehicles that each see the
 * other ahead (a crossing) resolve by id so exactly one yields, and anything
 * held near-stationary for PATIENCE seconds creeps through regardless.
 */
function lookAhead(rec, grid, player) {
  const a = rec.a;
  if (a.wreck) return;
  const hx = a._hx;
  const hz = a._hz;
  if (hx === undefined) return;
  let target = 1;
  const cx = Math.floor((rec.x + hx * LOOK_AHEAD) / SEPARATE_CELL);
  const cz = Math.floor((rec.z + hz * LOOK_AHEAD) / SEPARATE_CELL);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const arr = grid.get((cx + i) * 100000 + (cz + j));
      if (!arr) continue;
      for (const other of arr) {
        if (other === rec) continue;
        const b = other.a;
        const dx = other.x - rec.x;
        const dz = other.z - rec.z;
        const fwd = dx * hx + dz * hz;
        if (fwd < 0.5) continue; // beside or behind
        if (Math.abs(dx * hz - dz * hx) > rec.r + other.r - 0.7) continue; // not in my lane
        const still = b.wreck || b._hx === undefined;
        const dot = still ? 0 : hx * b._hx + hz * b._hz;
        if (!still && dot < SAME_WAY_DOT) continue; // oncoming
        if (!still && b._id < a._id) {
          // Do they see ME ahead in THEIR lane too? Then the lower id goes first.
          const bf = -(dx * b._hx + dz * b._hz);
          if (bf > 0.5 && Math.abs(dx * b._hz - dz * b._hx) <= rec.r + other.r - 0.7) continue;
        }
        const lead = still ? 0 : Math.max(0, dot) * b.speed * b.brakeMul;
        target = Math.min(target, followSpeed(fwd - rec.hl - other.hl, lead, a.speed));
      }
    }
  }
  // People on the carriageway (shared.pedObstacles): a wider lane than for a
  // vehicle, because someone crossing is about to be where they are not yet.
  for (const p of shared.pedObstacles) {
    const dx = p._wx - rec.x;
    const dz = p._wz - rec.z;
    const fwd = dx * hx + dz * hz;
    if (fwd < 0.5 || fwd > 16 || Math.abs(dx * hz - dz * hx) > rec.r + 1.5) continue;
    target = Math.min(target, followSpeed(fwd - rec.hl - 1.2, 0, a.speed));
  }
  if (!player.elevated) {
    const dx = player.x - rec.x;
    const dz = player.z - rec.z;
    const fwd = dx * hx + dz * hz;
    // The player is a vehicle when driving or riding: then, exactly as for
    // any other vehicle, one coming the OTHER way is the lanes' business and
    // not something to brake for (a hailed CNG used to stop every oncoming
    // vehicle it passed), and a follower matches its speed.
    const inVehicle = player.driving || player.riding;
    const along = player.vx * hx + player.vz * hz;
    const oncoming = inVehicle && along < -1;
    const halfWide = player.driving ? 1.3 : player.riding ? 0.9 : 0.25;
    if (!oncoming && fwd > 0.5 && fwd < LOOK_AHEAD * 2.4 && Math.abs(dx * hz - dz * hx) < rec.r + halfWide) {
      const playerLen = player.driving ? carMotion.halfL : player.riding ? 1.5 : player.radius;
      target = Math.min(target, followSpeed(fwd - rec.hl - playerLen, Math.max(0, along), a.speed));
    }
  }
  a.brakeTarget = target;
}

/** Speed multiplier for a follower `gap` metres behind a leader doing `lead` m/s. */
function followSpeed(gap, lead, ownSpeed) {
  if (gap >= SAFE_GAP) return 1;
  const t = Math.max(0, gap / SAFE_GAP);
  // A touch under the leader's speed when right behind it, so the gap reopens.
  const match = Math.min(1, (lead / ownSpeed) * 0.85);
  return match + t * (1 - match);
}

/**
 * Drop `a` onto a route within the recycling band around the player, at a
 * fresh point along it. Shared by recycleAgents (agents that drifted away)
 * and the run-over respawns (ragdolls and wrecks whose time is up).
 */
function placeNearPlayer(a, index, player, rndFn, minRank) {
  const route = routeNear(index, player.x, player.z, RECYCLE_NEAR, minRank, rndFn, RECYCLE_NEAR_MIN);
  if (!route) return false;
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
  if (a.dodgeX !== undefined) {
    a.dodgeX = 0;
    a.dodgeZ = 0;
  }
  return true;
}

/**
 * Bring a run-over agent back to life somewhere the player is not looking.
 * It has to move NOW (its body is about to vanish), so unlike recycleAgents
 * this cannot wait for it to be off-screen — instead it retries a few times
 * for a spot behind the player, and takes what it has after that (110 m+
 * away either way, per RECYCLE_NEAR_MIN).
 */
function respawnAgent(a, index, player, rndFn, minRank) {
  for (let tries = 0; tries < 4; tries++) {
    if (!placeNearPlayer(a, index, player, rndFn, minRank)) return false;
    const s = sampleRoute(a.route, a.d);
    if (!s || (s.x - player.x) * player.fx + (s.z - player.z) * player.fz < 0) break;
  }
  return true;
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
    if (a.dead || a.wreck || a.free) continue; // off its rail; comes back by its own means
    const s0 = sampleRoute(a.route, a.d);
    if (!s0) continue;
    const dx = s0.x - player.x;
    const dz = s0.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist < RECYCLE_FAR) continue;
    // Behind-the-player test: normalised direction to the agent vs facing.
    const dot = (dx / (dist || 1)) * player.fx + (dz / (dist || 1)) * player.fz;
    if (dot > RECYCLE_BEHIND_DOT) continue; // still in front: leave it alone
    if (!placeNearPlayer(a, index, player, rndFn, minRank)) continue;
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
/** Shortest ground distance from (x, z) to the route's polyline. */
function distToRoute(route, x, z) {
  const s = sampleRoute(route, closestDistAlongRoute(route, x, z));
  return s ? Math.hypot(s.x - x, s.z - z) : Infinity;
}

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
  let nextAgentId = 0;
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
        // player; brakeMul (1 = free flow) is eased toward brakeTarget, which
        // lookAhead() sets from the gap to whatever is ahead.
        avoidX: 0,
        avoidZ: 0,
        brakeMul: 1,
        brakeTarget: 1,
        playerBrake: 1,
        stuck: 0, // s spent held near-stationary by lookAhead(); see PATIENCE
        creep: 0,
        _id: nextAgentId++, // fleet-wide, for lookAhead()'s who-yields tie-break
        // Run-over physics: 100 = pristine, <= 0 = wreck (see hitVehicle).
        hp: 100,
        hitCd: 0,
        wreck: false,
      });
    }
    // cfg.w (declared per TYPES entry, otherwise unused in this file) doubles
    // as the vehicle's own collision radius: half its width plus a small
    // margin for its length, since a full oriented-box test would cost more
    // than the ~1 ms budget allows for hundreds of agents.
    const agentRadius = cfg.w / 2 + 0.5;

    // Instanced meshes, split by level of detail. Near and far meshes are
    // re-packed every frame (update() below), so an agent has no fixed slot in
    // them and its colour is written alongside its matrix.
    const makeMesh = (p) => {
      const matOpts = {
        color: 0xffffff,
        side: p.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        vertexColors: true, // fixed colours are baked per vertex (vehicle-models.js)
      };
      const mat = p.basic ? new THREE.MeshBasicMaterial(matOpts) : new THREE.MeshLambertMaterial(matOpts);
      const mesh = new THREE.InstancedMesh(p.geometry, mat, agents.length);
      mesh.castShadow = !p.basic;
      mesh.frustumCulled = false;
      mesh.name = `traffic:${type}:${p.key}`;
      if (p.colored) {
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(agents.length * 3), 3);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(mesh);
      return mesh;
    };
    const near = [];
    let lamps = null;
    for (const p of proto.parts()) {
      const mesh = makeMesh(p);
      if (p.night) {
        mesh.visible = false;
        nightMeshes.push(mesh);
        lamps = mesh;
      } else {
        near.push(mesh);
      }
    }
    const far = makeMesh(farPartFor(type));
    const meshes = [...near, far, ...(lamps ? [lamps] : [])];
    const tints = proto.colors.map((hex) => new THREE.Color(hex));

    systems.push({ type, agents, meshes, near, far, lamps, tints, agentRadius, halfLen: HALF_LEN[type], minRank: cfg.minRank });
    totalVehicles += agents.length;
  }

  shared.systems = systems;
  let lodNearSq = LOD_NEAR_SQ;
  const dummy = new THREE.Object3D();
  // Mutated every frame, read by main.js/docs for the measured per-frame
  // cost of the P7-COLLISION traffic work (car-following + player
  // avoidance), kept separate from the rest of update() so it can be
  // reported without instrumenting the whole function.
  const perf = { collisionMs: 0, pushedCount: 0, dented: 0, wrecked: 0 };

  // ---- Wrecks (see "Run-over physics" above): agents knocked off their
  // rail, oldest first, never more than MAX_WRECKS of them.
  const wrecks = [];
  const tintScratch = new THREE.Color();

  function reviveWreck(a, player) {
    wrecks.splice(wrecks.indexOf(a), 1);
    a.wreck = false;
    a.hp = 100;
    a.hitCd = 0;
    if (player) respawnAgent(a, routeIndex, player, rnd, a.kminRank);
  }

  /**
   * The car (carMotion) just hit `a`, drawn at (wx, wz) facing `heading` and
   * travelling along its route sample `s`. Damage and the player's own speed
   * loss both scale with mass, so a rickshaw folds and a bus is a wall.
   */
  function hitVehicle(a, sys, s, wx, wz, heading) {
    const mass = VEHICLE_MASS[sys.type] || 1;
    const drive = a.speed * a.dir * a.brakeMul;
    const avx = s.ux * drive;
    const avz = s.uz * drive;
    const rel = Math.hypot(carMotion.vx - avx, carMotion.vz - avz);
    const side = carMotion.hitLx < 0 ? -1 : 1;
    a.hitCd = HIT_COOLDOWN;
    a.hp -= (rel * DAMAGE_PER_MS) / mass;
    perf.dented++;
    reportImpact(1 - 0.8 * (mass / (mass + PLAYER_MASS)), Math.min(1, rel / 18), -side * 0.5);
    if (a.hp > 0) return;

    if (wrecks.length >= MAX_WRECKS) reviveWreck(wrecks[0], getPlayerProxy());
    const give = (PLAYER_MASS / (mass + PLAYER_MASS)) * 1.2;
    a.wreck = true;
    a.kminRank = sys.minRank;
    a.kx = wx;
    a.kz = wz;
    a.kyaw = heading;
    a.kroll = 0;
    a.krollTo = (WRECK_ROLL[sys.type] || 0) * side;
    a.kvx = carMotion.vx * give + avx * 0.3;
    a.kvz = carMotion.vz * give + avz * 0.3;
    a.kspin = Math.max(-7, Math.min(7, (side * rel * 0.35) / mass));
    a.ktime = 0;
    a.ksmoke = 0;
    a.avoidX = 0;
    a.avoidZ = 0;
    wrecks.push(a);
    perf.wrecked++;
  }

  /** Slide, spin, tip and smoke one wreck. Returns false once it has respawned. */
  function stepWreck(a, radius, dt, player) {
    a.ktime += dt;
    const left = WRECK_LIFETIME - a.ktime;
    const pd2 = player ? (a.kx - player.x) ** 2 + (a.kz - player.z) ** 2 : 0;
    if (left <= 0 || pd2 > GONE_DIST_SQ) {
      reviveWreck(a, player);
      return false;
    }
    const friction = Math.exp(-2.2 * dt);
    a.kvx *= friction;
    a.kvz *= friction;
    a.kspin *= Math.exp(-2.5 * dt);
    a.kyaw += a.kspin * dt;
    a.kroll += (a.krollTo - a.kroll) * (1 - Math.exp(-6 * dt));
    if (a.kvx * a.kvx + a.kvz * a.kvz > 0.01) {
      const nx = a.kx + a.kvx * dt;
      const nz = a.kz + a.kvz * dt;
      const p = slideOnWorld(nx, nz, radius);
      a.kx = p ? p[0] : nx;
      a.kz = p ? p[1] : nz;
      if (p && (Math.abs(p[0] - nx) > 1e-4 || Math.abs(p[1] - nz) > 1e-4)) {
        a.kvx *= 0.4; // into a wall
        a.kvz *= 0.4;
        a.kspin *= 0.5;
      }
    }
    // Smoke comes out of drive.js's shared sprite pool, which only animates
    // while driving — so only feed it then, and only for wrecks close enough
    // to be seen, so the tyre smoke it exists for is never starved.
    a.ksmoke -= dt;
    if (a.ksmoke <= 0 && pd2 < 80 * 80) {
      a.ksmoke = 0.4;
      const drive = window.__mirpur && window.__mirpur.drive;
      if (drive && drive.driving && drive.smoke) drive.smoke(a.kx, 1.1, a.kz);
    }
    a.ksink = left < SINK_TIME ? (1 - left / SINK_TIME) * 2.5 : 0;
    return true;
  }

  /** @param {{x: number, z: number} | null} [viewPos] camera position, for level of detail */
  function update(dt, elapsed, viewPos = null) {
    const perfT0 = performance.now();
    const playerProxy = getPlayerProxy();
    readCarMotion(playerProxy);
    let pushedCount = 0;

    // Cross-route separation, so vehicles on different routes and opposing
    // lanes stop driving through each other. Runs FIRST because it also
    // reports how many agents are currently near the player, which is what
    // caps the recycling below.
    const sep = separateAgents(systems, playerProxy, true);
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

    perf.collisionMs = performance.now() - perfT0; // separation + look-ahead braking; player-avoidance portion is folded in below

    for (const sys of systems) {
      const { agents, meshes, near, far, lamps, tints, agentRadius } = sys;
      let nearCount = 0;
      let farCount = 0;
      let lampCount = 0;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a.wreck) {
          if (!stepWreck(a, agentRadius, dt, playerProxy)) continue; // respawned; drawn next frame
          a._wx = a.kx; // still an obstacle to separateAgents() and the player
          a._wz = a.kz;
          dummy.position.set(a.kx, 0.16 - a.ksink, a.kz);
          dummy.rotation.set(0, a.kyaw, a.kroll); // XYZ order: rolls about its own length, then yaws
          dummy.updateMatrix();
          tintScratch.copy(tints[a.colorIndex]).multiplyScalar(0.25); // burnt out
          // Always the full model (it is next to the player by definition),
          // and no lamps: a wreck's lights are off.
          for (const mesh of near) {
            mesh.setMatrixAt(nearCount, dummy.matrix);
            if (mesh.instanceColor) mesh.setColorAt(nearCount, tintScratch);
          }
          nearCount++;
          continue;
        }
        // Ease toward lookAhead()'s target: hard on the brakes, gentle pulling
        // away. Agents outside separateAgents' active radius never get a
        // fresh target, so theirs is reset to free flow here after each use.
        let brakeTarget = a.brakeTarget;
        a.brakeTarget = 1;
        if (a.creep > 0) {
          a.creep -= dt;
          brakeTarget = Math.max(brakeTarget, 0.3);
        } else if (brakeTarget < 0.1) {
          a.stuck += dt;
          if (a.stuck > PATIENCE) {
            a.stuck = 0;
            a.creep = CREEP_TIME;
          }
        } else {
          a.stuck = 0;
        }
        a.brakeMul += (brakeTarget - a.brakeMul) * (1 - Math.exp(-(brakeTarget < a.brakeMul ? 9 : 2) * dt));
        a.d += a.speed * dt * a.dir * a.brakeMul * a.playerBrake;
        const s = sampleRoute(a.route, a.d);
        a._hx = s.ux * a.dir; // travel direction, for next frame's lookAhead()
        a._hz = s.uz * a.dir;

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

        // A hailed vehicle is drawn by streetlife/rides.js for the length of the ride.
        if (a.hidden) continue;
        const wx = baseX + a.avoidX;
        const wz = baseZ + a.avoidZ;
        // Run-over physics. Tested against the un-pushed position: the
        // avoidance circle is wider than the car, so the pushed one would
        // always be shoved clear before the car's box reached it.
        if (a.hitCd > 0) a.hitCd -= dt;
        else if (carMotion.active && carHits(baseX, baseZ, agentRadius)) {
          hitVehicle(a, sys, s, wx, wz, heading);
        }
        dummy.position.set(wx, 0.16 + bobY, wz);
        dummy.rotation.set(0, heading, 0);
        dummy.updateMatrix();
        const ex = viewPos ? wx - viewPos.x : 0;
        const ez = viewPos ? wz - viewPos.z : 0;
        // Damage shows as the paint darkening toward the wreck's burnt-out tint.
        const tintColor = a.hp < 100
          ? tintScratch.copy(tints[a.colorIndex]).multiplyScalar(0.4 + 0.006 * Math.max(0, a.hp))
          : tints[a.colorIndex];
        if (ex * ex + ez * ez < lodNearSq) {
          for (const mesh of near) {
            mesh.setMatrixAt(nearCount, dummy.matrix);
            if (mesh.instanceColor) mesh.setColorAt(nearCount, tintColor);
          }
          nearCount++;
        } else {
          far.setMatrixAt(farCount, dummy.matrix);
          far.setColorAt(farCount, tintColor);
          farCount++;
        }
        if (lamps) lamps.setMatrixAt(lampCount++, dummy.matrix);
      }
      for (const mesh of near) mesh.count = nearCount;
      far.count = farCount;
      if (lamps) lamps.count = lampCount;
      for (const mesh of meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
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
        if (a.hidden || a.wreck || a._wx === undefined) continue;
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

  /**
   * Opening cinematic only (src/intro-cinematic.js): move the FARTHEST agents
   * of each type onto routes that pass within `within` metres of a point, so
   * the avenue the camera is about to look down is as busy as the real one.
   * Called once behind a black frame, which is why it may ignore the
   * off-screen rule recycleAgents() lives by. The agents stay ordinary fleet
   * members: separation and car-following sort them out, and the recycler
   * thins them again once the player walks off.
   * @param {number} x @param {number} z
   * @param {Record<string, number>} quotas agents to move, per vehicle type
   */
  function gather(x, z, quotas, { within = 45, minAlong = 18, maxAlong = 210 } = {}) {
    let moved = 0;
    for (const sys of systems) {
      const want = quotas[sys.type] ?? 0;
      if (!want) continue;
      const corridor = routes.filter((r) => r.rank >= sys.minRank && r.len > maxAlong && distToRoute(r, x, z) < within);
      if (!corridor.length) continue;
      const ranked = sys.agents
        .filter((a) => !a.dead && !a.wreck && !a.free && !a.hidden)
        .map((a) => { const s = sampleRoute(a.route, a.d); return { a, dist: s ? Math.hypot(s.x - x, s.z - z) : 0 }; })
        .filter((rec) => rec.dist > maxAlong)
        .sort((p, q) => q.dist - p.dist)
        .slice(0, want);
      for (const { a } of ranked) {
        const route = corridor[Math.floor(rnd() * corridor.length)];
        const offset = (rnd() < 0.5 ? -1 : 1) * (minAlong + rnd() * (maxAlong - minAlong));
        a.route = route;
        a.d = ((closestDistAlongRoute(route, x, z) + offset) % route.len + route.len) % route.len;
        a.lane = (route.w / 2) * (0.35 + rnd() * 0.3);
        a.dir = rnd() < 0.5 ? 1 : -1;
        a.avoidX = 0; a.avoidZ = 0; a.sepX = 0; a.sepZ = 0;
        moved++;
      }
    }
    return moved;
  }

  return {
    group,
    update,
    setNight,
    gather,
    /** @param {number} scale 0.5..1, from the perf governor's detail stage */
    setDetailScale(scale) { lodNearSq = LOD_NEAR_SQ * scale * scale; },
    nearestAgent,
    /** People currently on the carriageway near the player (streetlife/rides.js brakes for them). */
    roadPeople: () => shared.pedObstacles,
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
  const perf = { collisionMs: 0, pushedCount: 0, ranOver: 0 };

  const pedSys = { agents };
  const fx = createHitFx();
  group.add(fx.group);

  // ---- Run-over ragdolls (see "Run-over physics" above). `ragdolls` holds
  // agent indices, oldest first, never more than MAX_RAGDOLLS of them.
  //
  // How hard the car hit decides what happens next (a.fate):
  //   under KNOCKDOWN_SPEED  knocked over, back up in a couple of seconds and
  //                          either 'angry' (walks to the car, bangs on it and
  //                          shouts) or 'flee' (runs from it);
  //   under FATAL_SPEED      thrown; some survive and 'limp' away, bleeding;
  //   above that             'dead': thrown hard, a pool spreads under them.
  // A clip with the car's corner counts as a slower hit than a square one.
  // Anyone who gets up becomes a FREE agent (a.free): off its rail, walking
  // under stepFree() until it has made its way back to the footpath.
  const ragdolls = [];
  const LIE_Y = 0.18; // m, centre height of a body lying on the road
  const KNOCKDOWN_SPEED = 8; // m/s
  const FATAL_SPEED = 15;
  const SURVIVE_CHANCE = 0.4; // of a hit between the two speeds above
  const GET_UP_TIME = 1.2; // s from lying to standing
  const MAX_ANGRY = 3; // at once; the rest of the knocked-down run instead
  const BANG_REACH = 0.6; // m from the car's bodywork
  const PANIC_RADIUS = 14; // m around a serious hit
  let angryCount = 0;
  const carProbe = { x: 0, z: 0, fx: 0, fz: 1, vx: 0, vz: 0, halfL: 2.3, halfW: 0.94 };

  // Dhaka street Bangla, shown as-is in both language modes (owner-approved
  // wording, 2026-09-21) — a shout is flavour, not UI, so it is not translated.
  const LINES = {
    angry: ['ওই মিয়া! চোখ কি কপালে তুলছেন?!', 'নাম গাড়ি থেইকা! নাম কইতাছি!', 'লাইসেন্স কি টাকা দিয়া কিনছস?!', 'বাপের রাস্তা পাইছস নাকি?!', 'আজকা তোর খবর আছে!'],
    giveUp: ['পালাইতাছস ক্যান?! খাড়া!'],
    parting: ['গাড়ি চালানো শিখা আয় আগে!'],
    flee: ['ভাগ! ভাগ! পাগলা ড্রাইভার!', 'ও মাগো! বাঁচাও!'],
    limp: ['উফ্... পাওডা গেল রে...', 'আল্লাহ গো... মইরা গেলাম...'],
    panic: ['ভাগ! ভাগ! পাগলা ড্রাইভার!', 'ও মাগো! বাঁচাও!', 'ধর ধর! হালারে ধর!'],
  };
  const shout = (a, kind, secs) => fx.say(a, pick(LINES[kind]), secs);

  function reviveRagdoll(k, player) {
    const a = agents[ragdolls[k]];
    ragdolls.splice(k, 1);
    a.dead = false;
    a.state = 'walk';
    a.timer = 6 + rnd() * 14;
    if (player && routeIndex) respawnAgent(a, routeIndex, player, rnd, 2);
  }

  /** The car (carMotion) just hit street agent `i`, drawn at (x, z). */
  function launchRagdoll(a, i, x, z) {
    if (a.free) endFree(a);
    if (ragdolls.length >= MAX_RAGDOLLS) reviveRagdoll(0, getPlayerProxy());
    const side = carMotion.hitLx < 0 ? -1 : 1;
    const clipped = Math.abs(carMotion.hitLx) > carMotion.halfW * 0.8;
    const speed = carMotion.speed * (clipped ? 0.6 : 1);
    const hard = Math.min(1, speed / 25);
    if (speed < KNOCKDOWN_SPEED) a.fate = angryCount < MAX_ANGRY && rnd() < 0.6 ? 'angry' : 'flee';
    else if (speed < FATAL_SPEED) a.fate = rnd() < SURVIVE_CHANCE ? 'limp' : 'dead';
    else a.fate = 'dead';
    const minor = speed < KNOCKDOWN_SPEED;
    // A clip spins them off to the side; a square hit carries them along.
    const carry = minor ? 0.45 : 0.85;
    const fling = side * (clipped ? 3 + rnd() * 2 : 1 + rnd() * 2);
    a.dead = true;
    a.rx = x;
    a.ry = RAGDOLL_CENTRE * a.scale;
    a.rz = z;
    a.rvx = carMotion.vx * carry - carMotion.fz * fling;
    a.rvz = carMotion.vz * carry + carMotion.fx * fling;
    // Fast and square: up and over the bonnet.
    a.rvy = minor ? 1.6 : 3 + hard * (clipped ? 4 : 8);
    a.ryaw = Math.atan2(a.rvx, a.rvz);
    a.rpitch = 0;
    a.rspin = minor ? 5 : 4 + rnd() * 6 + hard * 5;
    a.rtime = 0;
    a.rdown = minor ? 1.5 + rnd() * 1.5 : 5 + rnd() * 3; // s lying before getting up
    a.rup = 0;
    a.rtrail = 0;
    a.rpooled = false;
    a.rbounced = false;
    a.rlanded = false;
    a.avoidX = 0;
    a.avoidZ = 0;
    a.dodgeX = 0; // (x, z) already includes any dodge; do not apply it twice later
    a.dodgeZ = 0;
    ragdolls.push(i);
    perf.ranOver++;
    fx.burst(x, 1.0 * a.scale, z, carMotion.vx, carMotion.vz, minor ? 4 : a.fate === 'dead' ? 16 : 9);
    if (!minor) panicNear(x, z);
    reportImpact(minor ? 0.985 : 0.97, Math.max(0.15, Math.min(0.6, hard)), -side * 0.12);
  }

  /** Everyone walking near a serious hit bolts along the footpath, away from the car. */
  function panicNear(x, z) {
    let screamed = false;
    for (const b of agents) {
      if (b.dead || b.free || b._wx === undefined) continue;
      const dx = b._wx - x;
      const dz = b._wz - z;
      if (dx * dx + dz * dz > PANIC_RADIUS * PANIC_RADIUS) continue;
      const s = sampleRoute(b.route, b.d);
      if (!s) continue;
      b.dir = dx * s.ux + dz * s.uz >= 0 ? 1 : -1;
      b.panic = 3 + rnd() * 2.5;
      b.state = 'walk';
      b.timer = Math.max(b.timer, b.panic);
      if (!screamed) {
        screamed = true;
        b.bx = b._wx;
        b.by = 1.75 * b.scale;
        b.bz = b._wz;
        shout(b, 'panic', 1.8);
      }
    }
  }

  /**
   * Integrate and pose the run-over figures. Called EVERY frame by main.js
   * (the rest of this system runs at half rate, which is fine for a walk
   * but visibly judders on a body in flight). Near-free when nobody has
   * been hit: fx.update() returns at once with nothing alive.
   */
  function updateRagdolls(dt) {
    fx.update(dt);
    if (!ragdolls.length) return;
    const player = getPlayerProxy();
    for (let k = ragdolls.length - 1; k >= 0; k--) {
      const i = ragdolls[k];
      const a = agents[i];
      a.rtime += dt;
      if (!a.rlanded) {
        a.rvy -= GRAVITY * dt;
        a.ry += a.rvy * dt;
        a.rpitch += a.rspin * dt;
        if (a.ry <= LIE_Y && a.rvy < 0) {
          a.ry = LIE_Y;
          if (a.fate !== 'angry' && a.fate !== 'flee') fx.splat(a.rx, a.rz, 0.12 + rnd() * 0.15);
          if (a.rvy < -5 && !a.rbounced) {
            a.rbounced = true;
            a.rvy *= -0.3;
            a.rspin *= 0.5;
          } else {
            a.rlanded = true;
            a.rlandedAt = a.rtime;
            // Settle flat on whichever of face-up / face-down is nearer.
            a.rpitchTarget = Math.round((a.rpitch - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
          }
        }
      } else if (a.rup === 0) {
        const friction = Math.exp(-5 * dt);
        a.rvx *= friction;
        a.rvz *= friction;
        a.rpitch += (a.rpitchTarget - a.rpitch) * (1 - Math.exp(-14 * dt));
      }
      const v2 = a.rvx * a.rvx + a.rvz * a.rvz;
      if (v2 > 0.01 && a.rup === 0) {
        const nx = a.rx + a.rvx * dt;
        const nz = a.rz + a.rvz * dt;
        const p = slideOnWorld(nx, nz, 0.35);
        a.rx = p ? p[0] : nx;
        a.rz = p ? p[1] : nz;
        if (p && (Math.abs(p[0] - nx) > 1e-4 || Math.abs(p[1] - nz) > 1e-4)) {
          a.rvx *= 0.3; // hit a wall: most of the throw is gone
          a.rvz *= 0.3;
        }
        // Sliding along the road on a serious hit leaves a smear behind.
        if (a.rlanded && a.fate !== 'angry' && a.fate !== 'flee' && v2 > 2) {
          a.rtrail += Math.sqrt(v2) * dt;
          if (a.rtrail > 0.55) {
            a.rtrail = 0;
            fx.splat(a.rx, a.rz, 0.1 + rnd() * 0.1, 0, a.ryaw, 2.2);
          }
        }
      } else if (a.rlanded && !a.rpooled && (a.fate === 'dead' || a.fate === 'limp')) {
        a.rpooled = true; // come to rest: the pool starts to spread
        if (a.fate === 'dead') fx.splat(a.rx, a.rz, 0.55 + rnd() * 0.45, 6);
        else fx.splat(a.rx, a.rz, 0.22 + rnd() * 0.12, 3);
      }

      if (a.fate === 'dead') {
        const left = RAGDOLL_LIFETIME - a.rtime;
        const gone = player && a.rlanded
          && (a.rx - player.x) ** 2 + (a.rz - player.z) ** 2 > GONE_DIST_SQ;
        if (left <= 0 || gone) {
          reviveRagdoll(k, player);
          continue;
        }
        const sink = left < SINK_TIME ? (1 - left / SINK_TIME) * 0.5 : 0;
        figures.poseRagdoll(i, a.rx, a.ry - sink, a.rz, a.ryaw, a.rpitch, a.scale,
          a.rlanded ? 0 : 18 * dt);
        continue;
      }

      // A survivor: lies there for a.rdown, then pushes itself back upright.
      let pitch = a.rpitch;
      let y = a.ry;
      if (a.rlanded && a.rtime - a.rlandedAt > a.rdown) {
        a.rup = Math.min(1, a.rup + dt / (a.fate === 'limp' ? GET_UP_TIME * 1.8 : GET_UP_TIME));
        const t = a.rup * a.rup * (3 - 2 * a.rup);
        const upright = Math.round(a.rpitchTarget / (Math.PI * 2)) * Math.PI * 2;
        pitch = a.rpitchTarget + (upright - a.rpitchTarget) * t;
        y = LIE_Y + (RAGDOLL_CENTRE * a.scale - LIE_Y) * t;
        if (a.rup >= 1) {
          ragdolls.splice(k, 1);
          beginFree(a);
          continue;
        }
      }
      figures.poseRagdoll(i, a.rx, y, a.rz, a.ryaw, pitch, a.scale, a.rlanded ? 0 : 18 * dt);
    }
    figures.flush();
  }

  // ---- Street sense (see `shared` above) ---------------------------------
  let tickPlayer = null; // this tick's player proxy, for nearPlayer()

  /** Close enough to the player for the looking and dodging to be worth doing. */
  function nearPlayer(a) {
    if (!tickPlayer || a._wx === undefined) return false;
    return (a._wx - tickPlayer.x) ** 2 + (a._wz - tickPlayer.z) ** 2 < SMART_RADIUS_SQ;
  }

  function startCrossing(a) {
    a.state = 'cross';
    a.crossFrom = a.side;
    a.crossTo = -a.side;
    a.crossT = 0;
    // ~3.5 s to cross, so it reads as a deliberate walk, not a jump.
    a.timer = 3.5;
  }

  /**
   * Jump out of the player's car's way. If the car's path over the next
   * second or so passes through this person they react — after their own
   * reaction time (a.nerve, 0.15-0.65 s, fixed per person) — by running
   * straight out of the path, sideways to the car. At speed that is often
   * not enough, which is the point; and a few simply freeze. Once the car
   * has gone they drift back to where they were walking.
   * Maintains a.dodgeX/dodgeZ; returns true while actively moving.
   */
  function updateDodge(a, x, z, hx, hz, dt) {
    if (a.dodgeX === undefined) {
      a.dodgeX = 0;
      a.dodgeZ = 0;
      a.dodgeT = 0;
      a.calm = 0;
      a.nerve = 0.15 + rnd() * 0.5;
    }
    if (carMotion.present && carMotion.speed > DODGE_MIN_SPEED) {
      const rx = x + a.dodgeX - carMotion.x;
      const rz = z + a.dodgeZ - carMotion.z;
      if (rx * rx + rz * rz < 40 * 40) {
        const ix = carMotion.vx / carMotion.speed;
        const iz = carMotion.vz / carMotion.speed;
        const ahead = rx * ix + rz * iz;
        const lat = rz * ix - rx * iz; // + = to the right of the car's path
        if (ahead > 0 && ahead < Math.min(DODGE_SIGHT, Math.max(12, carMotion.speed * 0.9 + 3))
          && Math.abs(lat) < carMotion.halfW + 1.3) {
          if (a.dodgeT === 0) {
            a.frozen = rnd() < FREEZE_CHANCE;
            a.dodgeSide = Math.abs(lat) > 0.15 ? Math.sign(lat) : (rnd() < 0.5 ? -1 : 1);
            if (!a.frozen && rnd() < 0.12) {
              a.bx = x;
              a.by = 1.75 * a.scale;
              a.bz = z;
              shout(a, 'panic', 1.6);
            }
          }
          a.dodgeT += dt;
          a.calm = 1.2;
          // Walking the same way the car is going = back turned to it: they
          // only hear it coming, and react that much later.
          const unseen = hx * ix + hz * iz > 0.3 ? BACK_TURNED_DELAY : 0;
          if (a.frozen || a.dodgeT < a.nerve + unseen) return false;
          const step = DODGE_SPEED * dt * a.dodgeSide;
          const p = slideOnWorld(x + a.dodgeX - iz * step, z + a.dodgeZ + ix * step, PED_RADIUS);
          a.dodgeX = p ? p[0] - x : a.dodgeX - iz * step;
          a.dodgeZ = p ? p[1] - z : a.dodgeZ + ix * step;
          return true;
        }
      }
    }
    a.dodgeT = 0;
    if (a.dodgeX === 0 && a.dodgeZ === 0) return false;
    a.calm -= dt;
    if (a.calm > 0) return false;
    const ease = Math.exp(-1.6 * dt);
    a.dodgeX *= ease;
    a.dodgeZ *= ease;
    if (Math.abs(a.dodgeX) + Math.abs(a.dodgeZ) < 0.02) {
      a.dodgeX = 0;
      a.dodgeZ = 0;
    }
    return true;
  }

  // ---- Free agents: survivors on their feet, off their rail ---------------

  function beginFree(a) {
    a.dead = false;
    a.free = true;
    a.px = a.rx;
    a.pz = a.rz;
    a.pyaw = a.ryaw;
    a.mode = a.fate;
    a.modeT = 0;
    a.bangT = 0;
    a.lineT = 0;
    a.state = 'walk';
    a.panic = 0;
    if (a.mode === 'angry') angryCount++;
    a.bx = a.px;
    a.by = 1.75 * a.scale;
    a.bz = a.pz;
    shout(a, a.mode, a.mode === 'limp' ? 3 : 2.2);
  }

  function endFree(a) {
    if (a.mode === 'angry') angryCount--;
    a.free = false;
    a.mode = null;
    a.timer = 6 + rnd() * 14;
  }

  /** Walk a free agent toward (tx, tz) at `speed`, sliding along walls. */
  function walkFree(a, tx, tz, speed, dt) {
    const dx = tx - a.px;
    const dz = tz - a.pz;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return 0;
    const step = Math.min(d, speed * dt);
    const p = slideOnWorld(a.px + (dx / d) * step, a.pz + (dz / d) * step, PED_RADIUS);
    a.px = p ? p[0] : a.px + (dx / d) * step;
    a.pz = p ? p[1] : a.pz + (dz / d) * step;
    a.pyaw = Math.atan2(dx, dz);
    return d - step;
  }

  /** One half-rate tick of a free agent `i`. `rail` is where its footpath spot is. */
  function stepFree(a, i, dt, railX, railZ) {
    a.modeT += dt;
    const drive = window.__mirpur && window.__mirpur.drive;
    const car = drive && drive.getMotion && drive.getMotion(carProbe) ? carProbe : null;
    let moving = true;
    let lunge = 0;

    if (a.mode === 'angry') {
      const carSpeed = car ? Math.hypot(car.vx, car.vz) : 0;
      const far = car ? Math.hypot(car.x - a.px, car.z - a.pz) : Infinity;
      if (!car || far > 22 || a.modeT > 16 || (carSpeed > 4 && far > 6)) {
        shout(a, car ? 'giveUp' : 'parting', 2.4);
        angryCount--;
        a.mode = 'return';
      } else {
        // Nearest point on the car's bodywork, in the car's own frame.
        const dx = a.px - car.x;
        const dz = a.pz - car.z;
        const lz = Math.max(-car.halfL, Math.min(car.halfL, dx * car.fx + dz * car.fz));
        const lx = Math.max(-car.halfW, Math.min(car.halfW, dz * car.fx - dx * car.fz));
        const nx = car.x + car.fx * lz - car.fz * lx;
        const nz = car.z + car.fz * lz + car.fx * lx;
        const gap = Math.hypot(nx - a.px, nz - a.pz);
        if (gap > BANG_REACH) {
          walkFree(a, nx, nz, 2.1, dt);
        } else {
          // Banging on it: a lunge at the bodywork every beat, and the car
          // feels each one (thunk + a touch of camera shake, no speed loss).
          moving = false;
          a.pyaw = Math.atan2(nx - a.px, nz - a.pz);
          a.bangT += dt;
          lunge = Math.max(0, Math.sin(a.bangT * 9)) * 0.22;
          if (a.bangT - (a.bangAt || 0) > 0.7) {
            a.bangAt = a.bangT;
            reportImpact(1, 0.14, 0);
          }
          a.lineT -= dt;
          if (a.lineT <= 0) {
            a.lineT = 2.6;
            shout(a, 'angry', 2.2);
          }
          if (a.bangT > 7) {
            shout(a, 'parting', 2.4);
            angryCount--;
            a.mode = 'return';
          }
        }
      }
    } else if (a.mode === 'flee' || a.mode === 'limp') {
      const limp = a.mode === 'limp';
      if (a.modeT > (limp ? 2.5 : 3.5) || !car) {
        a.mode = 'return';
        a.limping = limp;
      } else {
        const dx = a.px - car.x;
        const dz = a.pz - car.z;
        const d = Math.hypot(dx, dz) || 1;
        walkFree(a, a.px + (dx / d) * 5, a.pz + (dz / d) * 5, limp ? 0.7 : 3.2, dt);
        if (limp && rnd() < dt * 0.8) fx.splat(a.px, a.pz, 0.05 + rnd() * 0.05); // drips
      }
    } else {
      // 'return': back to its own spot on the footpath, then carry on as before.
      const left = walkFree(a, railX, railZ, a.limping ? 0.75 : a.speed * 1.3, dt);
      if (left < 0.4 || a.modeT > 60) {
        a.limping = false;
        endFree(a);
      }
    }

    a._wx = a.px;
    a._wz = a.pz;
    a.bx = a.px;
    a.by = 1.75 * a.scale;
    a.bz = a.pz;
    figures.pose(i, a.px + Math.sin(a.pyaw) * lunge, 0, a.pz + Math.cos(a.pyaw) * lunge,
      a.pyaw, a.scale, dt, moving);
  }

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
    readCarMotion(playerProxy);
    tickPlayer = playerProxy;
    shared.player = playerProxy;
    shared.pedObstacles.length = 0; // republished below, every tick
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
      if (a.dead) continue; // run over: posed by updateRagdolls()

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
        } else if (a.state === 'waitCross') {
          a.state = 'walk'; // never got a gap: give up and walk on
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
            // Wants to cross. Near the player it goes to the kerb and LOOKS
            // first (the waitCross branch below); out of sight it just goes.
            if (nearPlayer(a)) {
              a.state = 'waitCross';
              a.timer = CROSS_MAX_WAIT;
              a.checkT = rnd() * 0.3;
            } else {
              startCrossing(a);
            }
          } else {
            a.timer = 6 + rnd() * 14;
          }
        }
      }

      const walking = a.state === 'walk' || a.state === 'cross';
      // Bolting from a hit nearby (panicNear): same footpath, at a run.
      let pace = 1;
      if (a.panic > 0) {
        a.panic -= dt;
        pace = 2.8;
      }
      if (walking && !a.free) a.d += a.speed * pace * dt * a.dir * a.brakeMul * a.playerBrake;
      const s = sampleRoute(a.route, a.d);

      // Footpath offset. For corridor footpaths (isCorridorFoot), the route is already
      // on the footpath midline (+/- 13.5m from metro centreline), so off is purely jitter.
      // For general OSM roads, offset from centreline by w/2 + margin.
      // Scaled by cornerEase at sharp bends so pedestrians don't clip off corner kerbs.
      const baseOff = a.route.isCorridorFoot
        ? (a.offJitter || 0)
        : (a.route.w / 2 + 1.8 + (a.offJitter || 0));
      const footOff = baseOff * (s.cornerEase ?? 1.0);
      if (a.state === 'waitCross') {
        // At the kerb, looking. A few times a second is plenty, and staggered
        // (checkT starts random) so a crowd never all looks on one frame.
        a.checkT -= dt;
        if (a.checkT <= 0) {
          a.checkT = 0.3;
          if (roadIsClear(s.x, s.z, Math.abs(footOff))) startCrossing(a);
        }
      }
      let sideNow = a.side;
      if (a.state === 'cross') {
        a.crossT = Math.min(1, (a.crossT || 0) + dt / 3.5);
        // Smoothstep across, so they ease off and onto the kerb.
        const t = a.crossT * a.crossT * (3 - 2 * a.crossT);
        sideNow = a.crossFrom * (1 - t) + a.crossTo * t;
      }
      const off = footOff;
      let x = s.x - s.uz * off * sideNow;
      let z = s.z + s.ux * off * sideNow;
      if (a.free) {
        // A survivor off its rail. No push-aside (it has to reach the car to
        // bang on it), but it can certainly be run over a second time.
        if (carMotion.active && carHits(a.px, a.pz, PED_RADIUS)) launchRagdoll(a, i, a.px, a.pz);
        else stepFree(a, i, dt, x, z);
        if (a.free && nearPlayer(a)) shared.pedObstacles.push(a);
        continue;
      }
      const railX = s.x - s.uz * off * sideNow;
      const railZ = s.z + s.ux * off * sideNow;
      // Jumping out of the car's way moves where the person really IS, so
      // everything below (the hit test included) uses the dodged position.
      const dodging = updateDodge(a, railX, railZ, s.ux * a.dir, s.uz * a.dir, dt);
      x = railX + a.dodgeX;
      z = railZ + a.dodgeZ;
      a._wx = x;
      a._wz = z;
      if (a.state === 'cross' && nearPlayer(a)) shared.pedObstacles.push(a);
      // P7-COLLISION: "pedestrians must not be walked or driven through" —
      // same distance-culled push-out as vehicles, no car-following (a
      // footpath crowd queuing nose-to-tail is not the requirement here).
      if (applyPlayerAvoidance(a, x, z, PED_RADIUS, playerProxy)) pushedCount++;
      // Tested against the agent's own rail position, NOT the pushed-aside
      // one: the avoidance circle is wider than the car, so a pushed figure
      // would otherwise always be shoved clear before the box reached it.
      if (carMotion.active && carHits(x, z, PED_RADIUS)) {
        launchRagdoll(a, i, x + a.avoidX, z + a.avoidZ);
        continue;
      }
      // Waiting to cross, they face the road they are watching.
      const heading = a.state === 'waitCross'
        ? Math.atan2(s.x - x, s.z - z)
        : Math.atan2(s.ux * a.dir, s.uz * a.dir);
      figures.pose(i, x + a.avoidX, 0, z + a.avoidZ, heading, a.scale, dt, walking || dodging);
    }
    // Bodies lying in the road are something to stop for, too.
    for (const i of ragdolls) {
      const a = agents[i];
      if (!a.rlanded) continue;
      a._wx = a.rx;
      a._wz = a.rz;
      shared.pedObstacles.push(a);
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
    updateRagdolls,
    /** Settings > Blood. */
    setBlood: fx.setBlood,
    agents, // verification only, like buildTraffic's `systems`
    stats: { count: streetCount, stationAgents: stationAgents.length },
    perf,
  };
}
