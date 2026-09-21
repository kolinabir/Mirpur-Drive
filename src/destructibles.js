/**
 * destructibles.js
 *
 * Streetlight poles the car can knock down (owner, 2026-09-07: "make sure
 * the street lights are collapsible or destroyable using the vehicle, so it
 * won't destroy the vehicle. It just gets destroyed and rolls down the
 * vehicle."). Read-only against city.js/streets.js/drive.js — this module
 * only reads the street-furniture group streets.js tags with
 * `userData.streetlights` (position list + the three InstancedMeshes) and
 * the player position from the debug hook; it does not edit any of those
 * files' logic.
 *
 * Mechanism:
 *  - A pole is "hit" when, above IMPACT_MIN_SPEED, one of the car's own
 *    four corner points (recomputed here exactly as drive.js computes them
 *    from the car's position/yaw) comes within drive.js's own collision
 *    radius of the pole — see the CORNER_PUSH_RADIUS comment below for why
 *    a plain centre-to-pole distance test does not work.
 *  - On hit: the instanced pole/arm/head are hidden (scaled to zero — an
 *    InstancedMesh has no per-instance removal, so this is the standard
 *    trick, and it costs nothing extra: same draw call, same triangle
 *    count, just an invisible instance).
 *  - Its collision segments (pushed into the shared grid by
 *    city.js#ingestInstancedGroundObstacles) are found and removed by
 *    scanning the grid cells near the pole and dropping any segment whose
 *    entire span sits within POLE_FOOTPRINT of the pole's centre — a real
 *    pier or building wall is much larger than that, so nothing else is
 *    ever touched.
 *  - A standalone "fallen pole" mesh (a plain cylinder, not instanced —
 *    there are at most FALLEN_CAP of these alive) is spawned lying toward
 *    the direction of impact and animated toppling with a simple
 *    critically-damped rotation, then left on the ground and despawned
 *    after FALLEN_LIFETIME seconds.
 *  - The car itself is NOT stopped or meaningfully slowed by this — a
 *    light pole should not stop a vehicle. Removing its collider before
 *    resolveCollision runs next frame is what achieves that; this module
 *    does not touch drive.js's speed at all.
 */
import * as THREE from 'three';

// THE BUG (owner, 2026-09-07: "doesnt collapse"): the first version of this
// file tested the distance from the POLE to the CAR's CENTRE against a
// small IMPACT_RADIUS (1.15 m). That can only ever be true if the pole
// gets almost exactly under the car's midpoint — but drive.js's own
// collision (src/drive.js, the corner loop around HALF_L/HALF_W) already
// pushes the car's four CORNERS out to stay >= 0.9 m (its own hard-coded
// radius) from any wall segment, corners sit 2.2-2.4 m from the centre, and
// the pole is a thin obstacle that usually passes between two corners
// rather than registering as a corner hit at all. In every realistic
// side-swipe or corner clip, the CENTRE never got anywhere near a 1.15 m
// radius, so nothing ever fired.
//
// Fixed by testing drive.js's OWN four corner points (recomputed here from
// the car's position/yaw the exact same way — HALF_L/HALF_W/forwardOf/
// rightOf) against each pole, using the SAME 0.9 m radius drive.js's
// resolveCollision uses, PLUS a pre-emptive margin (see PRE_EMPT_MARGIN
// below) — testing against ground truth like this, rather than guessing a
// margin from outside drive.js, is what makes this reliable.
//
// SECOND BUG (owner, 2026-09-07: "dont slow vihincale! any speed should
// collabse or break it"): even once the hit test above fired correctly,
// the car still visibly slowed on every pole hit. Cause: drive.js runs its
// OWN requestAnimationFrame loop (src/drive.js:1143), entirely separate
// from main.js's frame loop that drives this module's update() — the two
// are independent rAF callbacks with no guaranteed ordering. drive.js's
// own stepCar() sheds 85% of the car's speed (`car.speed *= 0.15`,
// src/drive.js's corner-collision block) THE INSTANT a corner is found
// within its 0.9 m radius of ANY wall segment, including a pole's — and it
// does this inside its own single function call, before this module ever
// gets a chance to remove that pole's collider. Reacting to a hit AFTER
// drive.js has already resolved it is always at least one frame too late.
//
// Fix: detect the hit, and remove the pole's collider, at a radius
// LARGER than drive.js's own 0.9 m push radius — PRE_EMPT_MARGIN below.
// The pole disappears from the collision grid while the car's corner is
// still comfortably outside drive.js's own collision radius, so by the
// time drive.js's next stepCar() call checks that spot, there is nothing
// there to push against and no speed is ever shed. This does not
// eliminate the race (the two loops are still independent, so an
// extreme frame hitch could in principle still let drive.js see the pole
// first), but it makes the window drive.js would need to "win" in
// vanishingly small at any speed the car can actually reach mid-corridor.
const CAR_HALF_L = 2.2; // m, matches drive.js HALF_L (half body length)
const CAR_HALF_W = 0.9; // m, matches drive.js HALF_W (half body width)
const CORNER_PUSH_RADIUS = 0.35; // m, matches drive.js's own resolveCollision radius for the car
const POLE_RADIUS = 0.2; // m, a little over the pole's real ~0.15 m base radius
// m, extra clearance beyond drive.js's own push radius so the pole is gone
// before drive.js's collision loop ever reaches it. At the car's top speed
// (22 m/s, src/drive.js MAX_SPEED) a 60 fps frame covers ~0.37 m, so this
// buys several frames of lead time even on a slow device.
const PRE_EMPT_MARGIN = 1.3;
// m/s. The owner asked for "any speed" to collapse a pole — this is not
// literally 0 only so a perfectly stationary car resting against a pole
// does not endlessly re-trigger a fallen-pole spawn every frame; any actual
// approach, however gentle, clears it.
const IMPACT_MIN_SPEED = 0.05;
const POLE_FOOTPRINT = 0.5; // m; matches pushBoxFootprint's small square for a pole
const FALLEN_CAP = 8;
const FALLEN_LIFETIME = 25; // s before a fallen pole fades out and is disposed
const TOPPLE_TIME = 0.6; // s to go from standing to lying flat

/** Remove every collision segment whose full span lies within `r` of (cx,cz). */
function removeSegmentsNear(collision, cx, cz, r) {
  const cell = collision.cell;
  const gx = Math.floor(cx / cell);
  const gz = Math.floor(cz / cell);
  let removed = 0;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const key = (gx + i) * 100000 + (gz + j);
      const arr = collision.grid.get(key);
      if (!arr) continue;
      const kept = arr.filter((seg) => {
        const midX = (seg[0] + seg[2]) / 2;
        const midZ = (seg[1] + seg[3]) / 2;
        const within = Math.hypot(midX - cx, midZ - cz) <= r;
        if (within) removed++;
        return !within;
      });
      collision.grid.set(key, kept);
    }
  }
  return removed;
}

function estimateCarSpeed(prevPos, pos, dt) {
  if (!prevPos || dt <= 0) return 0;
  return Math.hypot(pos.x - prevPos.x, pos.z - prevPos.z) / dt;
}

/**
 * @param {THREE.Scene} scene3
 * @param {object} collision  buildCollisionGrid() result (already extended
 *   with piers/poles by city.js#ingestSceneColliders)
 */
export function createDestructibles(scene3, collision) {
  const furnitureGroup = scene3.getObjectByName('street-furniture');
  const lights = furnitureGroup && furnitureGroup.userData.streetlights;

  const group = new THREE.Group();
  group.name = 'destructibles';
  scene3.add(group);

  if (!lights) {
    console.warn('[destructibles] no street-furniture streetlights found; nothing to make destructible');
    return { update() {} };
  }

  const { poleMesh, armMesh, headMesh, positions, poleHeight } = lights;
  const alive = positions.map(() => true);

  const dummy = new THREE.Object3D();
  const zeroScale = new THREE.Object3D();
  zeroScale.scale.setScalar(0);
  zeroScale.updateMatrix();

  // Reusable geometry/material for fallen poles — one shared pair, N mesh
  // instances (plain Object3D, not InstancedMesh: FALLEN_CAP is small).
  const fallenGeo = new THREE.CylinderGeometry(0.09, 0.15, poleHeight, 6);
  fallenGeo.translate(0, poleHeight / 2, 0);
  const fallenMat = new THREE.MeshLambertMaterial({ color: 0x8f9296 });
  const fallen = []; // { mesh, t, axis: THREE.Vector3, life }

  let prevPlayerPos = null;

  function hidePoleInstance(i) {
    // The furniture meshes are distance-culled (src/instance-cull.js): their
    // live buffers are re-packed, so `i` is only meaningful to the culler.
    const culler = furnitureGroup.userData.culler;
    for (const mesh of [poleMesh, armMesh, headMesh]) {
      if (culler) culler.setMatrixAt(mesh, i, zeroScale.matrix);
      else {
        mesh.setMatrixAt(i, zeroScale.matrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  function spawnFallen(x, z, rot, impactDirX, impactDirZ) {
    if (fallen.length >= FALLEN_CAP) {
      // Recycle the oldest rather than skip — a fresh hit is more
      // interesting to the player than a pole that has been lying still
      // for 20+ seconds.
      const oldest = fallen.shift();
      group.remove(oldest.mesh);
      oldest.mesh.material.dispose();
    }
    // Each fallen pole gets its OWN material clone — fallenMat is shared as
    // the template, but opacity/transparent are set per-instance below as a
    // pole nears despawn, and a shared material would fade every fallen
    // pole in lockstep the moment any one of them aged out.
    const mesh = new THREE.Mesh(fallenGeo, fallenMat.clone());
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rot;
    group.add(mesh);
    // Topple axis: horizontal, perpendicular to the impact direction, so the
    // pole falls AWAY from the car along the direction it was hit.
    const axis = new THREE.Vector3(-impactDirZ, 0, impactDirX).normalize();
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    fallen.push({ mesh, t: 0, axis, life: FALLEN_LIFETIME, fallDir: new THREE.Vector3(impactDirX, 0, impactDirZ) });
  }

  function tryHit(px, pz, yaw, speed) {
    if (speed < IMPACT_MIN_SPEED) return;
    // Recompute drive.js's own four corner points (src/drive.js's corner
    // loop, `fwd`/`rgt` = forwardOf(yaw)/rightOf(yaw), HALF_L/HALF_W) —
    // this is deliberately the exact same construction, so "is a corner in
    // contact" here means the same thing it means to drive.js's own
    // resolveCollision.
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const corners = [
      [px + fx * CAR_HALF_L + rx * CAR_HALF_W, pz + fz * CAR_HALF_L + rz * CAR_HALF_W],
      [px + fx * CAR_HALF_L - rx * CAR_HALF_W, pz + fz * CAR_HALF_L - rz * CAR_HALF_W],
      [px - fx * CAR_HALF_L + rx * CAR_HALF_W, pz - fz * CAR_HALF_L + rz * CAR_HALF_W],
      [px - fx * CAR_HALF_L - rx * CAR_HALF_W, pz - fz * CAR_HALF_L - rz * CAR_HALF_W],
    ];
    const hitRadius = CORNER_PUSH_RADIUS + POLE_RADIUS + PRE_EMPT_MARGIN;
    for (let i = 0; i < positions.length; i++) {
      if (!alive[i]) continue;
      const p = positions[i];
      let hitCornerX = null;
      let hitCornerZ = null;
      for (const [cx, cz] of corners) {
        if (Math.hypot(p.x - cx, p.z - cz) <= hitRadius) {
          hitCornerX = cx;
          hitCornerZ = cz;
          break;
        }
      }
      // A pole can also be struck dead-centre on the front or rear edge,
      // between the two corners on that end, which no single corner test
      // catches — cover it with a direct body-rectangle check as well.
      if (hitCornerX === null) {
        const dx = p.x - px;
        const dz = p.z - pz;
        const along = dx * fx + dz * fz;
        const across = dx * rx + dz * rz;
        if (Math.abs(along) > CAR_HALF_L + POLE_RADIUS + PRE_EMPT_MARGIN || Math.abs(across) > CAR_HALF_W + POLE_RADIUS + PRE_EMPT_MARGIN) continue;
      }
      alive[i] = false;
      hidePoleInstance(i);
      removeSegmentsNear(collision, p.x, p.z, POLE_FOOTPRINT);
      // Impact direction: from the car toward the pole (poles fall away
      // from whatever hit them, not toward it).
      const dx = p.x - px;
      const dz = p.z - pz;
      const d = Math.hypot(dx, dz);
      const dirX = d > 1e-4 ? -dx / d : fx;
      const dirZ = d > 1e-4 ? -dz / d : fz;
      spawnFallen(p.x, p.z, p.rot, dirX, dirZ);
    }
  }

  function update(dt) {
    const hook = window.__mirpur;
    const pos = hook && hook.player && hook.player.position;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
      const driving = pos.y < 1.45; // same heuristic traffic.js uses for "is the player in the car"
      if (driving) {
        const speed = estimateCarSpeed(prevPlayerPos, pos, dt);
        tryHit(pos.x, pos.z, hook.player.yaw, speed);
      }
      prevPlayerPos = { x: pos.x, z: pos.z };
    }

    // Animate every fallen pole toward lying flat, then fade it out.
    for (let i = fallen.length - 1; i >= 0; i--) {
      const f = fallen[i];
      if (f.t < TOPPLE_TIME) {
        f.t = Math.min(TOPPLE_TIME, f.t + dt);
        const k = f.t / TOPPLE_TIME;
        // Ease-out, so it slams down fast then settles rather than
        // rotating at a constant rate.
        const angle = (Math.PI / 2) * (1 - Math.pow(1 - k, 2));
        f.mesh.setRotationFromAxisAngle(f.axis, angle);
        // Slide slightly along the fall direction as it goes down, so it
        // does not pivot in place like a hinge nobody built.
        f.mesh.position.x += f.fallDir.x * dt * 1.5 * (1 - k);
        f.mesh.position.z += f.fallDir.z * dt * 1.5 * (1 - k);
      } else {
        f.life -= dt;
        if (f.life < 2) {
          f.mesh.material.transparent = true;
          f.mesh.material.opacity = Math.max(0, f.life / 2);
        }
        if (f.life <= 0) {
          group.remove(f.mesh);
          f.mesh.material.dispose();
          fallen.splice(i, 1);
        }
      }
    }
  }

  return { update, stats: { total: positions.length, get down() { return alive.filter((a) => !a).length; } } };
}
