/**
 * stationlife.js
 *
 * Berth detection, platform-door timing, and boarding/riding/alighting a
 * train — docs/briefs/P11-J-STATIONLIFE-BOARDING.md. Modelled on
 * `createInteriorSystem` (src/interior.js): a small state machine plus an
 * `update(dt, player)` that returns the current HUD interaction line and an
 * `interact(player)` that fires whatever is nearest/active.
 *
 * OWNERSHIP: this file and the wiring in src/main.js are the only things
 * this pass may touch. src/metro.js and src/interior.js belong to a
 * concurrent executor this pass — this module only READS `metro.stations`
 * (always present) and `metro.trains` (being added concurrently; see the
 * feature-detection below) and CALLS `metro.setPlatformDoors` /
 * `interior.setPsdOpen` (also being added concurrently) — it never writes
 * into either module's own state.
 *
 * CONTRACT DEVIATION, documented for the advisor: the brief's Item 1 gives
 * the factory signature as `createStationLife(scene3, metro, walkable,
 * collision, player)`, but Item 1's own door-timing section requires
 * driving `interior.setPsdOpen(...)` too, and nothing in the brief routes
 * an `interior` reference to this module any other way. Rather than skip
 * half the door contract, `interior` is accepted as an extra trailing
 * argument (main.js passes it); every other part of the signature and the
 * returned shape matches the brief exactly.
 *
 * FEATURE DETECTION: `metro.trains`, `metro.setPlatformDoors` and
 * `interior.setPsdOpen` may not exist yet — the concurrent executor's work
 * lands independently of this pass. Every use of them is guarded and warns
 * at most once via console.warn; nothing here ever throws, so the game
 * still starts and runs (walking, driving, the existing interior system)
 * even if none of the three ever appears.
 *
 * P13 (2026-09-08): walking around the coach interior while riding
 * (docs/briefs/P13-TRAIN-INTERIOR.md). `buildTrainInterior()`
 * (src/traininterior.js, a new file owned by this pass) is built exactly
 * ONCE here and re-parented to whichever train the player boards
 * (`attachTo`/`detach`). `board()` seeds a train-local `rideLocal`
 * position from the player's real world position; `updateRiding()` reads
 * movement intent off `player.keys`/`player.yaw` (same accel model as
 * `Player.update()`'s walking branch, but at ~1.6/3.4 m/s — 3.1/7.4 is far
 * too fast for a 123.8 m saloon), rotates that WORLD-space direction into
 * car-local space using the train object's own quaternion (never a
 * hand-rolled heading — metro.js flips a reverse-direction train's
 * `rotation.y` by +PI, which a hand-rolled heading would get backwards),
 * integrates, clamps through `clampLocal`, and places the player with
 * `trainObj.localToWorld`.
 */

import * as THREE from 'three';

// Reusable scratch objects — avoids per-frame heap allocations in updateRiding().
const _worldDir = new THREE.Vector3();
const _rideF = new THREE.Vector3();
const _rideRight = new THREE.Vector3();
const _rideQuat = new THREE.Quaternion();
const _rideEuler = new THREE.Euler();
const _rideWorldPos = new THREE.Vector3();
import { METRO, DWELL } from './metro.js';
import { buildTrainInterior } from './traininterior.js';
import { touchInput, isGameplayBlocked } from './mobile-controls.js';
import { getPlatformRoute } from './metro-routes.js';

// -- Tunables -----------------------------------------------------------
const BERTH_DIST = 10; // m from a station's own (x,z) to call a train "at" it (accommodates ~2 m track gauge offset and platform curvature)
const BERTH_STOPPED_SPEED = 0.5; // m/s below which a berthed train counts as stopped
const BERTH_MOVING_SPEED = 1.0; // m/s above which a train counts as actually departing

// P11-K bug 3 (advisor-measured): doors were fully open for only 2.4 s
// (1.2 s open / 2.3 s hold / 2.5 s close against the old DWELL=6) and a
// train reached a given station only every ~505 s (8.4 min) with 2 trains
// on the whole alignment — nobody would ever find the boarding feature.
// metro.js's DWELL is now module-scope and EXPORTED (raised to 14 s), so
// this file imports it instead of hand-duplicating a copy that can drift
// out of sync (the previous `DWELL_ASSUMED = 6` constant here carried
// exactly that coupling-risk warning). Retuned to roughly the brief's
// suggested 1.5 s open / 9 s hold / 2.5 s close = 13 s, deliberately
// leaving ~1 s of slack before the 14 s dwell ends (rather than the old
// zero-slack 1.2/2.3/2.5 = 6.0 exact fit) so there is a small cushion
// before BERTH_MOVING_SPEED's safety net would ever need to fire.
const DOOR_OPEN_DUR = 1.5; // s, brief: "open over ~1.5 s once berthed"
const DOOR_CLOSE_DUR = 2.5; // s
const DOOR_HOLD_DUR = 9; // s fully open
const CLOSE_START_T = DOOR_OPEN_DUR + DOOR_HOLD_DUR; // 10.5 s after berth; doors finish closing at 13.0 s, 1 s before the 14 s dwell ends

// Actually verify the imported DWELL still leaves room for the above split
// (rather than just trusting a comment, per the coupling risk this file
// used to carry) — logs once if a future metro.js change makes DWELL too
// short for doors to fully close before departure; BERTH_MOVING_SPEED's
// safety net still guarantees acceptance #2 either way.
if (CLOSE_START_T + DOOR_CLOSE_DUR > DWELL) {
  console.warn(`[stationlife] door open+hold+close (${(CLOSE_START_T + DOOR_CLOSE_DUR).toFixed(1)}s) exceeds metro.js's DWELL (${DWELL}s) — doors will be forced shut by the speed safety net instead of finishing their close animation`);
}

const TRAIN_CARS = 6;
const TRAIN_CAR_LEN = 19.8;
const TRAIN_CAR_PITCH = TRAIN_CAR_LEN + 1;
const TRAIN_HALF_WIDTH = 2.95 / 2;
const DOOR_BAY_RANGE = 1.1;
const BOARD_RANGE = 3; // m, brief: "within ~3 m of a bay"
const BOARD_DOOR_MIN = 0.85; // doorAmt01 threshold to allow boarding/alighting
const RIDE_EYE_HEIGHT = 1.68; // matches player.js's EYE_HEIGHT (see main.js's own teleport(...,1.68,...) calls) — not exported, duplicated for the manual camera sync while riding

// P13: walking inside the saloon. player.js's WALK_SPEED/RUN_SPEED (3.1/7.4)
// are far too fast for a 123.8 m-long car — retuned down per the brief.
// RIDE_ACCEL duplicates player.js's private ACCEL=14 constant (not
// exported) so the in-car accel/decel feel matches ordinary walking.
const RIDE_WALK_SPEED = 1.6;
const RIDE_RUN_SPEED = 3.4;
const RIDE_ACCEL = 14;
const PLATFORM_ALIGHT_MARGIN = 2; // m in from the platform end, matches the brief's "clamped to ±(PLATFORM_LEN/2 - 2)"

// P12-B: district-edge "through train" gate. How near METRO.PLATFORM_Y counts as
// "on the platform, not the street below" — the same order of magnitude as
// BERTH_DIST above, not the exact walkable-registry tolerance (private to
// interior.js, off-limits to import per the file header).
const GATEWAY_FEET_TOL = 1.0; // m

// -- Station-local coordinate helpers (duplicated from interior.js's own
// convention: station-local X across the spine, Z along it, since that file
// is off-limits to import private helpers from) -------------------------
function localToWorld(station, lx, lz) {
  const c = Math.cos(station.heading);
  const s = Math.sin(station.heading);
  return { x: station.x + lx * c + lz * s, z: station.z - lx * s + lz * c };
}
function worldToLocal(station, wx, wz) {
  const c = Math.cos(station.heading);
  const s = Math.sin(station.heading);
  const dx = wx - station.x;
  const dz = wz - station.z;
  return { lx: c * dx - s * dz, lz: s * dx + c * dz };
}

/** Which side of a station's centreline (station-local X sign) a platform sits on, matching interior.js/metro.js's own -1/1 convention. */
function platformCx(side) {
  // Center of the platform alight zone: 4.4 m from station centerline,
  // safely past the PSD line at 3.55 m and on the solid platform deck along the whole 180 m.
  return side * 4.4;
}

/** heading -> +1/-1 direction guess when a train entry doesn't expose `dir`/`direction` directly, by comparing it against the nearest station's own heading (metro.js sets a reverse-direction train's rotation.y to heading+PI). */
function inferDir(heading, station) {
  let diff = heading - station.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) < Math.PI / 2 ? 1 : -1;
}

/**
 * Normalise one `metro.trains[i]` entry into `{x,y,z,heading,dir}`.
 * The concurrent executor's exact export shape isn't known yet — this
 * accepts the internal shape metro.js already builds today ({ obj: THREE.
 * Object3D, dir, ... }, the least invasive thing to export), a plain
 * {x,z,y,heading|rotation,dir|direction} view, or a bare THREE.Object3D-ish
 * `{ position, rotation }`. Returns null if nothing recognisable is found.
 */
function trainSnapshot(entry) {
  if (!entry) return null;
  if (entry.obj && entry.obj.position) {
    return {
      x: entry.obj.position.x,
      y: entry.obj.position.y,
      z: entry.obj.position.z,
      heading: entry.obj.rotation ? entry.obj.rotation.y : entry.heading ?? 0,
      dir: entry.dir ?? entry.direction ?? null,
    };
  }
  if (typeof entry.x === 'number' && typeof entry.z === 'number') {
    return {
      x: entry.x,
      y: entry.y ?? METRO.DECK_Y + 0.36,
      z: entry.z,
      heading: entry.heading ?? entry.rotation ?? 0,
      dir: entry.dir ?? entry.direction ?? null,
    };
  }
  if (entry.position && typeof entry.position.x === 'number') {
    return {
      x: entry.position.x,
      y: entry.position.y ?? METRO.DECK_Y + 0.36,
      z: entry.position.z,
      heading: entry.rotation?.y ?? entry.heading ?? 0,
      dir: entry.dir ?? entry.direction ?? null,
    };
  }
  return null;
}

/** The live THREE.Object3D for a `metro.trains[i]` entry, or null — P13 needs the real object (not just its snapshot) to attach the interior and to rotate movement via its own transform. */
function trainObjOf(entry) {
  if (!entry) return null;
  if (entry.obj && entry.obj.isObject3D) return entry.obj;
  if (entry.isObject3D) return entry;
  return null;
}

function makeTrainState() {
  return {
    lastX: null,
    lastZ: null,
    speed: 0,
    berthed: false,
    stationName: null,
    station: null,
    side: 0,
    dir: 0,
    phase: 'closed', // 'closed' | 'opening' | 'open' | 'closing'
    doorAmt: 0,
    berthT: 0,
    warnedEarlyDeparture: false,
  };
}

/**
 * @param {{ gateway?: { station: string, label: string, onBoard: () => void } }} [opts]
 *   P12-B, optional 8th argument (interior above is the file's own already-
 *   documented deviation from the brief's 6-argument signature; this is a
 *   second, additive one). `gateway.station` is the platform at the edge of
 *   this district's modelled line (see docs/briefs/P12-B-EXCLUDE-AND-GATE.md
 *   for why a platform-side gate stands in for riding an unreachable
 *   southbound service); pressing E there when no train is berthed calls
 *   `gateway.onBoard()` — main.js supplies the district travel. Omitting
 *   `opts` (or `opts.gateway`) leaves every branch below unreachable, so it
 *   is a no-op on maps without one.
 */
export function createStationLife(scene3, metro, walkable, collision, player, interior, opts) {
  const gateway = opts?.gateway || null;

  let trainStates = [];
  let lastSnaps = [];
  let lastTrainsRaw = null; // P13: raw metro.trains array from the latest update(), so board()/updateRiding() can reach a train's real THREE.Object3D
  let warnedNoTrains = false;
  let warnedNoMetroSetter = false;
  let warnedNoInteriorSetter = false;
  let pendingAlightTs = null; // internal: the trainState the "E: get off" prompt targets

  // P13: exactly ONE interior instance for the whole game — re-parented to
  // whichever train is being ridden via attachTo()/detach(). Wrapped in
  // try/catch per this file's own no-throw discipline: a geometry-build
  // failure here must not stop the rest of the game from starting.
  let interiorRig = null;
  try {
    interiorRig = buildTrainInterior();
  } catch (err) {
    console.error('[stationlife] buildTrainInterior threw — riding a train will have no interior geometry:', err);
  }

  // P13: train-local ride position/velocity/facing, only meaningful while state.riding.
  const rideLocal = { x: 0, z: 0 };
  const rideVel = { x: 0, z: 0 };
  let rideBobPhase = 0;
  let lastTrainHeading = null;

  const state = {
    riding: false,
    rideTrainIndex: null,
    boardStation: null,
    nextStopName: null,
    pendingAlight: null, // { stationName } | null — debug-hook-friendly view of pendingAlightTs
    hint: '',
    trains: [], // per-train snapshot, index-aligned with metro.trains (once available)
    interactables: [], // kept for shape-parity with interior.js; 0-1 entries, rebuilt every update()
    atGateway: null, // gateway.label when standing on its platform with no train berthed, else null
    rideLocal, // P13, debug-hook-friendly: {x,z} train-local position while riding (see docs/DEBUG-HOOK.md)
  };

  function setDoors(stationName, side, amount01) {
    if (typeof metro.setPlatformDoors === 'function') {
      try {
        metro.setPlatformDoors(stationName, side, amount01);
      } catch (err) {
        console.error('[stationlife] metro.setPlatformDoors threw:', err);
      }
    } else if (!warnedNoMetroSetter) {
      warnedNoMetroSetter = true;
      console.warn('[stationlife] metro.setPlatformDoors is not available yet — platform-side doors will not animate until it lands');
    }
    if (interior && typeof interior.setPsdOpen === 'function') {
      try {
        interior.setPsdOpen(stationName, side, amount01);
      } catch (err) {
        console.error('[stationlife] interior.setPsdOpen threw:', err);
      }
    } else if (!warnedNoInteriorSetter) {
      warnedNoInteriorSetter = true;
      console.warn('[stationlife] interior.setPsdOpen is not available yet — platform screen doors will not animate until it lands');
    }
  }

  /** Advance one train's berth/door state machine by dt, from its latest position snapshot. */
  function updateTrainDoor(ts, snap, dt) {
    ts.speed = ts.lastX != null && dt > 0 ? Math.hypot(snap.x - ts.lastX, snap.z - ts.lastZ) / dt : 0;
    ts.lastX = snap.x;
    ts.lastZ = snap.z;

    let best = null;
    let bestD = Infinity;
    for (const st of metro.stations) {
      const d = Math.hypot(st.x - snap.x, st.z - snap.z);
      if (d < bestD) {
        bestD = d;
        best = st;
      }
    }
    const nowBerthed = !!best && bestD < BERTH_DIST && ts.speed < BERTH_STOPPED_SPEED;

    if (nowBerthed && (!ts.berthed || ts.stationName !== best.name)) {
      // Freshly berthed at a (new) station: reset the dwell clock.
      ts.berthed = true;
      ts.stationName = best.name;
      ts.station = best;
      ts.dir = snap.dir ?? inferDir(snap.heading, best);
      ts.side = ts.dir >= 0 ? 1 : -1;
      ts.berthT = 0;
      ts.phase = 'opening';
      ts.doorAmt = 0;
      ts.warnedEarlyDeparture = false;
    } else if (!nowBerthed) {
      ts.berthed = false;
      ts.phase = 'closed';
      ts.doorAmt = 0;
      ts.berthT = 0;
      // ts.stationName/ts.station deliberately kept as-is (the last stop
      // visited) so riders mid-transit can still compute "next stop".
    } else {
      ts.berthT += dt;
      if (ts.berthT < DOOR_OPEN_DUR) {
        ts.phase = 'opening';
        ts.doorAmt = ts.berthT / DOOR_OPEN_DUR;
      } else if (ts.berthT < CLOSE_START_T) {
        ts.phase = 'open';
        ts.doorAmt = 1;
      } else {
        ts.phase = 'closing';
        ts.doorAmt = Math.max(0, 1 - (ts.berthT - CLOSE_START_T) / DOOR_CLOSE_DUR);
      }
    }

    // Safety net (acceptance #2, "doors must be shut before any train
    // moves"): independent of whether the imported DWELL still matches the
    // open/hold/close split above, force doors instantly shut the moment
    // the train is actually moving at speed, not just dwell jitter.
    if (ts.speed > BERTH_MOVING_SPEED && ts.doorAmt > 0) {
      if (!ts.warnedEarlyDeparture) {
        ts.warnedEarlyDeparture = true;
        console.warn(`[stationlife] train left ${ts.stationName ?? '(unknown station)'} while its doors were still open (door timing vs DWELL out of sync?) — forcing them shut`);
      }
      ts.doorAmt = 0;
      ts.phase = 'closed';
    }
  }

  function routeFor(ts) {
    return getPlatformRoute(metro, ts.stationName, ts.side, gateway);
  }

  function nearestDoor(player, trainIndex, ts) {
    const trainObj = trainObjOf(lastTrainsRaw?.[trainIndex]);
    if (!trainObj) return null;
    const localSide = ts.side * ts.dir;
    let nearest = null;
    const cars = trainObj.userData.cars || [];
    for (let carIndex = 0; carIndex < TRAIN_CARS; carIndex++) {
      const car = cars[carIndex];
      if (!car) continue;
      const local = car.worldToLocal(player.position.clone());
      for (let doorIndex = 0; doorIndex < 4; doorIndex++) {
        const doorZ = -TRAIN_CAR_LEN / 2 + (TRAIN_CAR_LEN / 4) * (doorIndex + 0.5);
        if (Math.abs(local.z - doorZ) > DOOR_BAY_RANGE) continue;
        const distance = Math.hypot(local.x - localSide * TRAIN_HALF_WIDTH, local.z - doorZ);
        if (distance > BOARD_RANGE || (nearest && nearest.distance <= distance)) continue;
        nearest = { distance, carIndex, doorZ, localSide };
      }
    }
    return nearest;
  }

  /** Only a platform-level player beside an actual open doorway can board. */
  function findBoardCandidate(player) {
    if (!interiorRig || player.inLift || player.flying || Math.abs(player.feetY - METRO.PLATFORM_Y) > GATEWAY_FEET_TOL) return null;
    let nearest = null;
    for (let i = 0; i < trainStates.length; i++) {
      const ts = trainStates[i];
      if (!ts.berthed || !ts.station || ts.doorAmt < BOARD_DOOR_MIN) continue;
      const route = routeFor(ts);
      if (!route.available || route.gateway) continue;
      const { lx, lz } = worldToLocal(ts.station, player.position.x, player.position.z);
      if (lx * ts.side < 3.35 || Math.abs(lx - platformCx(ts.side)) >= BOARD_RANGE || Math.abs(lz) >= METRO.PLATFORM_LEN / 2) continue;
      const door = nearestDoor(player, i, ts);
      if (door && (!nearest || door.distance < nearest.door.distance)) nearest = { trainIndex: i, ts, door };
    }
    return nearest;
  }

  function board(player, candidate) {
    const ts = candidate.ts;
    state.riding = true;
    player.ridingTrain = true;
    state.rideTrainIndex = candidate.trainIndex;
    state.boardStation = ts.stationName;
    state.nextStopName = null;
    pendingAlightTs = null;
    state.pendingAlight = null;
    player.velocity.set(0, 0, 0);
    player.vy = 0;

    // P13: seed the in-car walk position from where the player was actually
    // standing (so you board at the door you queued at), and re-parent the
    // one shared interior instance onto this train.
    const trainObj = trainObjOf(lastTrainsRaw?.[candidate.trainIndex]);
    rideVel.x = 0;
    rideVel.z = 0;
    rideBobPhase = 0;
    lastTrainHeading = trainObj ? trainObj.rotation.y : null;
    if (trainObj && interiorRig) {
      try {
        const door = candidate.door;
        const carCenterZ = (door.carIndex - (TRAIN_CARS - 1) / 2) * TRAIN_CAR_PITCH;
        const clamped = interiorRig.clampLocal(door.localSide * 0.9, carCenterZ + door.doorZ);
        rideLocal.x = clamped.x;
        rideLocal.z = clamped.z;
        interiorRig.attachTo(trainObj);
        const CAR_PITCH = 19.8 + 1.0;
        const carIdx = Math.max(0, Math.min(5, Math.round((rideLocal.z / CAR_PITCH) + 2.5)));
        const car = trainObj.userData.cars?.[carIdx] || trainObj;
        const carHeadingQuat = car.getWorldQuaternion(new THREE.Quaternion());
        const carEuler = new THREE.Euler().setFromQuaternion(carHeadingQuat, 'YXZ');
        lastTrainHeading = carEuler.y;
      } catch (err) {
        console.error('[stationlife] failed to attach train interior on board:', err);
        cancelRide(player);
        return;
      }
    } else {
      rideLocal.x = 0;
      rideLocal.z = 0;
    }
    state.rideLocal.x = rideLocal.x;
    state.rideLocal.z = rideLocal.z;
  }

  function alight(player, ts) {
    const info = ts || trainStates[state.rideTrainIndex] || null;
    const station = info?.station;
    if (station) {
      // P13: put the player down beside the door they are actually standing
      // at, not always at station-local z=0 — keep their current
      // along-platform position (clamped to stay on the platform slab),
      // only snapping the across-track coordinate onto the platform centreline.
      const { lz } = worldToLocal(station, player.position.x, player.position.z);
      const maxLz = METRO.PLATFORM_LEN / 2 - PLATFORM_ALIGHT_MARGIN;
      const clampedLz = Math.max(-maxLz, Math.min(maxLz, lz));
      const { x, z } = localToWorld(station, platformCx(info.side), clampedLz);
      player.position.x = x;
      player.position.z = z;
    }
    // Authoritative walking height: the walkable registry has this
    // station's platform slab registered at METRO.PLATFORM_Y (interior.js
    // builds it as soon as the player is within range, which riding a
    // train through the station already guarantees) — setting feetY here
    // is what stops the player falling to street level on alighting.
    player.feetY = METRO.PLATFORM_Y;
    player.position.y = METRO.PLATFORM_Y + RIDE_EYE_HEIGHT; // player.update() re-derives this from feetY next frame anyway
    player.vy = 0;
    player.velocity.set(0, 0, 0);

    // Guarantee the station interior and its walkable slabs are registered immediately
    if (interior?.update) {
      interior.update(0, player);
      interior.update(0, player);
    }

    cancelRide(player);
  }

  function cancelRide(rider = player) {
    if (interiorRig && state.riding) {
      try {
        interiorRig.detach();
      } catch (err) {
        console.error('[stationlife] interiorRig.detach threw:', err);
      }
    }
    rider.ridingTrain = false;
    rider.velocity.set(0, 0, 0);
    rideVel.x = 0;
    rideVel.z = 0;
    lastTrainHeading = null;
    state.riding = false;
    state.rideTrainIndex = null;
    state.boardStation = null;
    state.nextStopName = null;
    state.hint = '';
    pendingAlightTs = null;
    state.pendingAlight = null;
  }

  /** While riding: walk around the car (train-local), follow the train, drive the camera by hand (main.js skips player.update() this frame), and track next-stop/alight state. */
  function updateRiding(dt, player) {
    const idx = state.rideTrainIndex;
    const ts = trainStates[idx];
    const snap = lastSnaps[idx];
    const trainObj = trainObjOf(lastTrainsRaw?.[idx]);
    if (!ts || !snap || !ts.station || !trainObj || !interiorRig) {
      // Train vanished from under the rider (should not happen once
      // metro.trains exists) — put them down where they stand rather than
      // leaving them stuck aboard nothing.
      alight(player, null);
      return;
    }

    // Identify which specific car the player is standing inside
    const CARS = 6;
    const CAR_LEN = 19.8;
    const GAP = 1.0;
    const CAR_PITCH = CAR_LEN + GAP; // 20.8
    const carZOf = (ci) => (ci - (CARS - 1) / 2) * CAR_PITCH;
    const carIdx = Math.max(0, Math.min(CARS - 1, Math.round((rideLocal.z / CAR_PITCH) + (CARS - 1) / 2)));
    let currentCar = trainObj.userData.cars?.[carIdx] || trainObj;

    // Movement intent rotated into currentCar's local frame
    const inputBlocked = player.switching || isGameplayBlocked();
    if (inputBlocked) { rideVel.x = 0; rideVel.z = 0; player.keys.clear(); }
    const k = { has: (code) => !inputBlocked && (player.keys.has(code) || touchInput.keys.has(code)) };
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + (inputBlocked ? 0 : touchInput.forward);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + (inputBlocked ? 0 : touchInput.strafe);
    const fast = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = fast ? RIDE_RUN_SPEED : RIDE_WALK_SPEED;

    const worldDir = _worldDir.set(0, 0, 0);
    const f = _rideF.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = _rideRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    worldDir.addScaledVector(f, fwd).addScaledVector(right, strafe);
    if (worldDir.lengthSq() > 1) worldDir.normalize();

    const carQuat = currentCar.getWorldQuaternion(_rideQuat).invert();
    const localDir = worldDir.applyQuaternion(carQuat);

    const targetVx = localDir.x * speed;
    const targetVz = localDir.z * speed;
    const accelT = Math.min(1, dt * RIDE_ACCEL);
    rideVel.x += (targetVx - rideVel.x) * accelT;
    rideVel.z += (targetVz - rideVel.z) * accelT;

    const nx = rideLocal.x + rideVel.x * dt;
    const nz = rideLocal.z + rideVel.z * dt;
    const clamped = interiorRig.clampLocal(nx, nz);
    // Damp velocity on the axis the clamp actually stopped
    if (Math.abs(clamped.x - nx) > 1e-6) rideVel.x *= 0.3;
    if (Math.abs(clamped.z - nz) > 1e-6) rideVel.z *= 0.3;
    rideLocal.x = clamped.x;
    rideLocal.z = clamped.z;
    state.rideLocal.x = rideLocal.x;
    state.rideLocal.z = rideLocal.z;

    // Crossing a gangway can change the car and its curve-aligned transform.
    const movedCarIndex = Math.max(0, Math.min(CARS - 1, Math.round(rideLocal.z / CAR_PITCH + (CARS - 1) / 2)));
    currentCar = trainObj.userData.cars?.[movedCarIndex] || trainObj;
    const carLocalZ = rideLocal.z - carZOf(movedCarIndex);
    const worldPos = currentCar.localToWorld(_rideWorldPos.set(rideLocal.x, interiorRig.FLOOR_Y, carLocalZ));
    player.feetY = worldPos.y;

    // Small sway/bob scaled by in-car ground speed
    const groundSpeed = Math.hypot(rideVel.x, rideVel.z);
    rideBobPhase += dt * (groundSpeed * 2.1 + 1.2);
    const bob = Math.sin(rideBobPhase) * (0.012 + Math.min(0.03, groundSpeed * 0.006));
    player.position.set(worldPos.x, worldPos.y + RIDE_EYE_HEIGHT + bob, worldPos.z);
    player.vy = 0;
    player.velocity.set(0, 0, 0);

    // Camera yaw turns with the specific car the rider is inside
    const carHeadingQuat = currentCar.getWorldQuaternion(_rideQuat);
    const carEuler = _rideEuler.setFromQuaternion(carHeadingQuat, 'YXZ');
    const heading = carEuler.y;
    if (lastTrainHeading != null) {
      let dh = heading - lastTrainHeading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      player.yaw += dh;
    }
    lastTrainHeading = heading;

    // Suppress the walkable/gravity path entirely: player.update() (which
    // owns resolveCollision + the walkable-registry fall/step logic) is not
    // called at all while riding (see main.js) — this replicates only the
    // camera-sync tail of Player.update()'s first-person branch so the view
    // still tracks yaw/pitch (still driven by mouse/keyboard-look, which are
    // independent event handlers) and the moving train.
    player.camera.position.copy(player.position);
    player.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    player.avatar?.setVisible?.(false);

    // Drive the interior's own door leaves in lockstep with the platform
    // screen doors / exterior doors for the ridden train.
    try {
      const localSide = ts.side * ts.dir;
      interiorRig.setDoorSide(-localSide, 0);
      interiorRig.setDoorSide(localSide, ts.doorAmt);
    } catch (err) {
      console.error('[stationlife] interiorRig.setDoorSide threw:', err);
    }

    const route = routeFor(ts);
    const hasNextPhysicalStop = route.available && !route.gateway;
    state.nextStopName = hasNextPhysicalStop ? route.destination : null;
    pendingAlightTs = null;
    state.pendingAlight = null;
    if (!hasNextPhysicalStop && (ts.doorAmt >= BOARD_DOOR_MIN || !ts.berthed)) {
      alight(player, ts);
      return;
    }
    if (ts.berthed && ts.doorAmt >= BOARD_DOOR_MIN && nearestDoor(player, idx, ts)) {
      pendingAlightTs = ts;
      state.pendingAlight = { stationName: ts.stationName };
    }
  }

  /**
   * Standing on `gateway.station`'s platform, at platform level, with no
   * train there to board. Never checked while riding (the "inert while
   * state.riding" requirement) — callers already gate on that themselves,
   * this repeats it so the function is safe to call on its own too.
   */
  function findGatewayCandidate(player) {
    if (!gateway || state.riding || player.inLift || player.flying) return null;
    const station = metro.stations.find((s) => s.name === gateway.station);
    if (!station) return null;
    // Platform level, not the street below the station (brief's explicit
    // requirement) — feetY, not position.y, matches how alight() sets it.
    if (Math.abs(player.feetY - METRO.PLATFORM_Y) > GATEWAY_FEET_TOL) return null;
    const { lx, lz } = worldToLocal(station, player.position.x, player.position.z);
    if (Math.abs(lz) >= METRO.PLATFORM_LEN / 2) return null;
    for (const side of [-1, 1]) {
      const route = getPlatformRoute(metro, station.name, side, gateway);
      if (!route.available || !route.gateway) continue;
      if (lx * side >= 3.35 && Math.abs(lx - platformCx(side)) < BOARD_RANGE) return { station, route };
    }
    return null;
  }

  function interact(player) {
    if (player.inLift) return false;
    if (state.riding) {
      const ts = trainStates[state.rideTrainIndex];
      if (ts?.berthed && ts.doorAmt >= BOARD_DOOR_MIN && nearestDoor(player, state.rideTrainIndex, ts)) {
        alight(player, ts);
        return true;
      }
      return true;
    }
    const cand = findBoardCandidate(player);
    if (cand) {
      board(player, cand);
      return true;
    }
    // Fallback only: a real berthed train always wins over the gate (see
    // the check above, which already returned if one was there to board).
    if (findGatewayCandidate(player)) {
      gateway.onBoard();
      return true;
    }
    return false;
  }

  function update(dt, player) {
    const trainsRaw = Array.isArray(metro.trains) ? metro.trains : null;
    lastTrainsRaw = trainsRaw; // P13: board()/updateRiding() need the raw entries' .obj
    // Unlike the trains loop below, the gateway needs none of metro.trains —
    // it is only ever a fallback for when nothing berths — so it must not
    // sit behind the early-return this branch used to take. Falling through
    // instead (rather than returning here) is a no-op when trainsRaw is
    // null and gateway is also unset: state.trains ends up [] either way,
    // and findBoardCandidate/findGatewayCandidate both short-circuit to
    // null (trainStates is already [], gateway is null), leaving line ''
    // exactly as the old early `return ''` did.
    if (!trainsRaw) {
      if (!warnedNoTrains) {
        warnedNoTrains = true;
        console.warn('[stationlife] metro.trains is not available yet — berth detection, door timing and boarding are disabled until it lands');
      }
      trainStates = [];
      lastSnaps = [];
      state.trains = [];
    } else {
      if (trainStates.length !== trainsRaw.length) {
        trainStates = trainsRaw.map(() => makeTrainState());
        lastSnaps = new Array(trainsRaw.length).fill(null);
      }

      for (let i = 0; i < trainsRaw.length; i++) {
        const snap = trainSnapshot(trainsRaw[i]);
        lastSnaps[i] = snap;
        if (snap) updateTrainDoor(trainStates[i], snap, dt);
        else trainStates[i] = makeTrainState();
      }

      state.trains = trainStates.map((ts) => ({
        berthed: ts.berthed,
        station: ts.stationName,
        side: ts.side,
        phase: ts.phase,
        doorAmt01: Math.round(ts.doorAmt * 100) / 100,
        speed: Math.round(ts.speed * 10) / 10,
      }));
    }

    for (const station of metro.stations) {
      for (const side of [-1, 1]) {
        let amount = 0;
        for (const ts of trainStates) {
          if (ts.berthed && ts.stationName === station.name && ts.side === side) amount = Math.max(amount, ts.doorAmt);
        }
        setDoors(station.name, side, amount);
      }
    }

    let line = '';
    state.interactables = [];
    state.atGateway = null;
    if (state.riding) {
      updateRiding(dt, player);
      if (pendingAlightTs) line = `E: get off at ${pendingAlightTs.stationName}`;
      else if (state.nextStopName) line = `On board — next stop ${state.nextStopName}, walk around the car`;
      else line = state.riding ? 'On board — walk around the car' : '';
    } else {
      const cand = findBoardCandidate(player);
      if (cand) {
        // A real berthed train always wins — the gate below is only ever
        // checked once this branch has already ruled a train out.
        line = `E: board train to ${routeFor(cand.ts).destination}`;
        state.interactables.push({ position: new THREE.Vector3(cand.ts.station.x, METRO.PLATFORM_Y, cand.ts.station.z), label: line, range: BOARD_RANGE, action: () => interact(player) });
      } else {
        const gw = findGatewayCandidate(player);
        if (gw) {
          state.atGateway = gateway.label;
          line = `E: through train to ${gateway.label}`;
          state.interactables.push({ position: new THREE.Vector3(gw.station.x, METRO.PLATFORM_Y, gw.station.z), label: line, range: BOARD_RANGE, action: () => interact(player) });
        }
      }
    }

    state.hint = line;
    return line;
  }

  player.ridingTrain = false;
  player.on('teleport', () => cancelRide(player));
  /**
   * Boarding re-parents the interior — and one PointLight per car — into the
   * scene. A new light count makes three.js recompile every material in the
   * world, which froze the first boarding. Compile that variant up front, in
   * the background; the interior is attached only for the synchronous part.
   */
  function prewarmRide(renderer, camera) {
    const trainObj = trainObjOf(metro.trains?.[0]);
    if (state.riding || !interiorRig || !trainObj || typeof renderer.compileAsync !== 'function') return;
    try {
      interiorRig.attachTo(trainObj);
      const done = renderer.compileAsync(scene3, camera);
      interiorRig.detach();
      done.catch((err) => console.warn('[stationlife] ride shader pre-compile skipped:', err));
    } catch (err) {
      console.warn('[stationlife] ride shader pre-compile skipped:', err);
      try { interiorRig.detach(); } catch { /* already detached */ }
    }
  }

  return { update, interact, alight, cancelRide, prewarmRide, state };
}
