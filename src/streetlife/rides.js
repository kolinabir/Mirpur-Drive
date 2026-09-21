/**
 * streetlife/rides.js
 *
 * Hail a passing rickshaw, CNG or bus and ride it as a passenger: fast travel
 * that stays inside the world. The hailed traffic agent is hidden and replaced
 * by an identical standalone vehicle that follows a real A* street route
 * (map/road-graph.js) to the chosen destination, keeping left like the rest of
 * the traffic. The player sits in it with free look, can get down early, or
 * skip ahead to the last stretch.
 */

import { buildHireVehicle } from '../traffic.js';
import { resolveCollision, CARRIAGEWAY_HALF } from '../city.js';

const HAIL_RANGE = 16;
const EYE_HEIGHT = 1.68;
const CORRIDOR_CAPTURE = 16; // m from the viaduct centreline: OSM draws this dual carriageway up to ~12 m out
const FOLLOW_GAP = 2; // m, bumper to bumper, kept behind whatever is ahead
const OWN_HALF_LEN = { rickshaw: 1.3, cng: 1.4, bus: 5 }; // m, as traffic.js's HALF_LEN
const CORRIDOR_LANE = 9; // m left of the centreline: where traffic.js's corridor lanes actually run (6.75 + lane offset)

const VEHICLES = {
  rickshaw: {
    label: 'Rickshaw', speed: 4.6, accel: 2.2, lane: 1.5, maxDist: 1800, base: 20, perKm: 30,
    seat: [0.36, 1.54, -0.62], tooFar: 'Too far for a rickshaw — try a CNG',
  },
  cng: {
    label: 'CNG', speed: 11, accel: 3.5, lane: 1.9, maxDist: Infinity, base: 40, perKm: 28,
    seat: [0.38, 1.2, -0.62], tooFar: '',
  },
  bus: {
    label: 'Bus', speed: 9, accel: 1.6, lane: 2.4, maxDist: Infinity, base: 10, perKm: 5,
    seat: [0.4, 2.15, 2.5], tooFar: '', stationsOnly: true,
  },
};

// Seats are [left, up, forward] from the vehicle's origin, in metres, and are
// tied to the shapes in vehicle-models.js: the rickshaw and CNG passenger
// sits to the kerb side of the bench so the puller's / driver's back is
// beside the view rather than filling it (dead centre, 0.5 m behind the CNG
// driver, was a screen of shirt), and the bus seat is the front kerb-side
// row of vehicle-models.js#busCabin, looking out through the windscreen.

const roundFare = (taka) => Math.max(5, Math.round(taka / 5) * 5);
const fareFor = (spec, metres) => roundFare(spec.base + (spec.perKm * metres) / 1000);

/** Polyline with cumulative lengths, sampled by arclength. */
function makeRoute(points) {
  const pts = points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 0.05);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let cursor = 0;
  return {
    length: cum[cum.length - 1] || 0,
    sample(s) {
      if (s < cum[cursor]) cursor = 0;
      while (cursor < pts.length - 2 && s > cum[cursor + 1]) cursor++;
      const a = pts[cursor];
      const b = pts[Math.min(cursor + 1, pts.length - 1)];
      const seg = cum[cursor + 1] - cum[cursor] || 1;
      const t = Math.max(0, Math.min(1, (s - cum[cursor]) / seg));
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / seg, uz: (b[1] - a[1]) / seg };
    },
  };
}

/**
 * @param {{ scene3: object, player: object, camera: object, traffic: object, roadGraph: object,
 *   collision: object, walkable: object, state: object, ui: object,
 *   destinations: () => Array<{ name: string, x: number, z: number, station?: boolean }>,
 *   corridorPoint: (x: number, z: number) => { x: number, z: number, d: number } }} options
 */
export function createRides({ scene3, player, camera, traffic, roadGraph, collision, walkable, state, ui, destinations, corridorPoint }) {
  let ride = null;
  const parked = []; // vehicles left at the kerb after a ride, removed once out of sight
  let hiddenAgents = [];
  let selfTeleport = false;

  player.on('teleport', () => {
    // Map teleport, quick-travel digits etc. mid-ride: drop the ride, no fare.
    if (ride && !selfTeleport) endRide(false);
  });

  function candidate() {
    if (ride || player.flying || player.feetY > 1) return null;
    const facing = { fx: -Math.sin(player.yaw), fz: -Math.cos(player.yaw) };
    return traffic.nearestAgent(player.position.x, player.position.z, HAIL_RANGE, Object.keys(VEHICLES), facing);
  }

  function promptLine() {
    if (ride) {
      const left = Math.max(0, Math.round(ride.route.length - ride.s));
      const skip = ride.route.length - ride.s > 90 ? ' · Space: skip ahead' : '';
      return `${ride.spec.label} to ${ride.dest.name} · ${left} m · ৳${ride.fare} — E: get down here${skip}`;
    }
    const near = candidate();
    return near ? `E: hail ${VEHICLES[near.type].label.toLowerCase()} · from ৳${roundFare(VEHICLES[near.type].base)}` : '';
  }

  function openMenu(near) {
    const spec = VEHICLES[near.type];
    const px = player.position.x;
    const pz = player.position.z;
    const options = destinations()
      .filter((d) => !spec.stationsOnly || d.station)
      .map((d) => ({ ...d, metres: Math.hypot(d.x - px, d.z - pz) * 1.3 }))
      .filter((d) => d.metres > 120)
      .sort((a, b) => a.metres - b.metres)
      .slice(0, 8)
      .map((d) => {
        const fare = fareFor(spec, d.metres);
        const tooFar = d.metres > spec.maxDist;
        const broke = !state.canAfford(fare);
        return {
          label: d.name,
          detail: tooFar ? spec.tooFar : broke ? `৳${fare} — not enough taka` : `~${Math.round(d.metres / 10) * 10} m · ৳${fare}`,
          disabled: tooFar || broke,
          onSelect: () => startRide(near, d),
        };
      });
    ui.showMenu({
      title: `${spec.label}!`,
      subtitle: spec.stationsOnly ? 'The helper leans out: “Kothay jaben?” Buses stop at the metro stations.' : '“Mama, jaben?” — where to?',
      options,
    });
  }

  function startRide(near, dest) {
    const spec = VEHICLES[near.type];
    // The agent has moved while the menu was open; start from where it is now.
    const startX = near.agent._wx ?? near.x;
    const startZ = near.agent._wz ?? near.z;
    const found = roadGraph.findPath(startX, startZ, dest.x, dest.z);
    if (!found || !found.path || found.path.length < 2) {
      ui.toast('“Oi dike jabo na.” No road route there from here.', 'warn');
      return;
    }
    const route = makeRoute([[startX, startZ], ...found.path]);
    const fare = fareFor(spec, route.length);
    if (!state.canAfford(fare)) {
      ui.toast(`The fare is ৳${fare} — you only have ৳${state.data.taka}.`, 'warn');
      return;
    }

    near.agent.hidden = true;
    hiddenAgents.push(near.agent);
    const vehicle = buildHireVehicle(near.type, near.agent.colorIndex);
    scene3.add(vehicle);

    const first = route.sample(0);
    ride = {
      spec, dest, route, fare, vehicle, halfLen: OWN_HALF_LEN[near.type] || 1.5,
      s: 0, speed: 0, ux: first.ux, uz: first.uz,
      heading: Math.atan2(first.ux, first.uz),
      blockedFor: 0, ghostFor: 0, lane: spec.lane, laneTarget: spec.lane, laneTimer: 0,
      savedThirdPerson: player.thirdPerson,
    };
    player.inRide = true;
    player.keys.clear();
    player.velocity.set(0, 0, 0);
    // Player forward is (-sin yaw, -cos yaw); face the way the vehicle is heading.
    player.yaw = ride.heading + Math.PI;
    player.pitch = -0.05;
    if (player.avatar?.group) player.avatar.group.visible = false;
    place(0);
  }

  /**
   * What is close ahead in our lane: another vehicle going our way, a wreck,
   * or a person on the road. Returns the nearest one's gap (m, from our
   * centre to its near end) and speed along our heading, or null when the lane is clear.
   * Oncoming vehicles are ignored — on a narrow street they pass within a
   * lane's width, and braking for each one made the ride lurch.
   */
  function blockerAhead(x, z, ux, uz) {
    let best = null;
    for (const sys of traffic.systems) {
      for (const a of sys.agents) {
        if (a.hidden || a._wx === undefined) continue;
        const dx = a._wx - x;
        const dz = a._wz - z;
        const centre = dx * ux + dz * uz;
        if (centre < 1.5) continue;
        const ahead = centre - (sys.halfLen || 1.5);
        if (ahead > 12 || (best && ahead > best.gap)) continue;
        if (Math.abs(dx * uz - dz * ux) > 1.6) continue;
        const dot = a.wreck || a._hx === undefined ? 0 : a._hx * ux + a._hz * uz;
        if (dot < -0.3) continue;
        best = { gap: ahead, lead: a.wreck ? 0 : Math.max(0, dot) * a.speed * (a.brakeMul ?? 1) };
      }
    }
    for (const p of traffic.roadPeople?.() || []) {
      const dx = p._wx - x;
      const dz = p._wz - z;
      const ahead = dx * ux + dz * uz;
      if (ahead < 1 || ahead > 12 || (best && ahead > best.gap)) continue;
      if (Math.abs(dx * uz - dz * ux) > 1.8) continue;
      best = { gap: ahead, lead: 0 };
    }
    return best;
  }

  function place(dt) {
    const { route, spec, vehicle } = ride;
    const p = route.sample(ride.s);
    // Ease the travel direction so corners swing instead of snapping.
    const k = dt > 0 ? Math.min(1, dt * 3.2) : 1;
    ride.ux += (p.ux - ride.ux) * k;
    ride.uz += (p.uz - ride.uz) * k;
    const len = Math.hypot(ride.ux, ride.uz) || 1;
    const ux = ride.ux / len;
    const uz = ride.uz / len;
    // Left of travel is (uz, -ux): Bangladesh keeps left (see traffic.js).
    ride.laneTimer -= dt;
    if (ride.laneTimer <= 0) {
      ride.laneTimer = 0.3;
      const centre = corridorPoint(p.x, p.z);
      if (centre.d < CORRIDOR_CAPTURE) {
        // Under the viaduct traffic runs on two carriageways either side of the
        // piers (traffic.js#buildRoutes); take the left one, not the median.
        const offCentre = (p.x - centre.x) * uz - (p.z - centre.z) * ux;
        ride.laneTarget = CORRIDOR_LANE - offCentre;
      } else {
        const snap = roadGraph.snapToRoad(p.x, p.z, 20, false);
        const width = snap?.width || 6;
        ride.laneTarget = Math.max(0.9, Math.min(spec.lane * 1.6, width * 0.25));
      }
    }
    ride.lane += (ride.laneTarget - ride.lane) * (dt > 0 ? Math.min(1, dt * 1.5) : 1);
    const x = p.x + uz * ride.lane;
    const z = p.z - ux * ride.lane;
    const heading = Math.atan2(ux, uz);
    let turn = heading - ride.heading;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    ride.heading = heading;
    player.yaw += turn;

    const bob = spec === VEHICLES.rickshaw ? Math.sin(performance.now() * 0.009) * 0.015 * Math.min(1, ride.speed) : 0;
    vehicle.position.set(x, 0.16 + bob, z);
    vehicle.rotation.y = heading;

    const [sx, sy, sz] = spec.seat;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const eyeX = x + sx * cos + sz * sin;
    const eyeZ = z - sx * sin + sz * cos;
    selfTeleport = true;
    player.position.set(eyeX, 0.16 + sy + bob, eyeZ);
    selfTeleport = false;
    player.feetY = 0;
    camera.position.copy(player.position);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    return { x, z, ux, uz };
  }

  function endRide(arrived, charge = true) {
    if (!ride) return;
    const { vehicle, spec, fare, route, dest } = ride;
    const fraction = route.length > 0 ? Math.min(1, ride.s / route.length) : 1;
    const due = arrived ? fare : roundFare(fare * fraction);
    const heading = ride.heading;
    ride = null;
    player.inRide = false;
    if (player.avatar?.group) player.avatar.group.visible = true;

    if (charge) {
      // Step down on the kerb side (left of travel), clear of walls.
      const ux = Math.sin(heading);
      const uz = Math.cos(heading);
      // ...which means past the edge of the carriageway, not just beside the door.
      const centre = corridorPoint(vehicle.position.x, vehicle.position.z);
      let step = 1.9;
      if (centre.d < CORRIDOR_CAPTURE) step = CARRIAGEWAY_HALF + 1.4 - centre.d;
      else {
        const snap = roadGraph.snapToRoad(vehicle.position.x, vehicle.position.z, 20, false);
        if (snap) step = (snap.width || 6) / 2 + 1.4 - snap.dist;
      }
      step = Math.max(1.9, Math.min(9, step));
      let exitX = vehicle.position.x + uz * step;
      let exitZ = vehicle.position.z - ux * step;
      [exitX, exitZ] = resolveCollision(collision, exitX, exitZ, 0.42, 1.2);
      const groundY = walkable?.supportHeightAt(exitX, exitZ, 0) ?? 0;
      selfTeleport = true;
      player.teleport(exitX, exitZ, groundY + EYE_HEIGHT, heading + Math.PI);
      selfTeleport = false;
      state.data.taka = Math.max(0, state.data.taka - due);
      state.data.rides += 1;
      state.save();
      ui.toast(arrived ? `Arrived at ${dest.name}. Paid ৳${due}.` : `Got down early. Paid ৳${due}.`, 'good');
      parked.push({ vehicle, age: 0 });
    } else {
      scene3.remove(vehicle);
    }
  }

  /** @param {number} dt @param {Set<string>} keys */
  function update(dt, keys) {
    // Let hidden agents back into traffic once they are well out of sight.
    if (hiddenAgents.length) {
      hiddenAgents = hiddenAgents.filter((a) => {
        if (Math.hypot(a._wx - player.position.x, a._wz - player.position.z) < 190) return true;
        a.hidden = false;
        return false;
      });
    }
    for (let i = parked.length - 1; i >= 0; i--) {
      const item = parked[i];
      item.age += dt;
      const dx = item.vehicle.position.x - player.position.x;
      const dz = item.vehicle.position.z - player.position.z;
      const behind = dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw) < 0;
      if (item.age > 6 && (behind || Math.hypot(dx, dz) > 70 || item.age > 40)) {
        scene3.remove(item.vehicle);
        parked.splice(i, 1);
      }
    }
    if (!ride) return;

    if (keys.has('Space') && ride.route.length - ride.s > 90) {
      ride.s = ride.route.length - 60;
      ride.speed = ride.spec.speed * 0.6;
      const p = ride.route.sample(ride.s);
      ride.ux = p.ux;
      ride.uz = p.uz;
      keys.delete('Space');
    }

    const remaining = ride.route.length - ride.s;
    // Brake for the stop, and hold behind slower traffic rather than drive through it.
    let target = Math.min(ride.spec.speed, Math.sqrt(2 * ride.spec.accel * Math.max(0, remaining)) + 0.4);
    if (ride.ghostFor > 0) ride.ghostFor -= dt;
    else {
      const blocker = blockerAhead(ride.vehicle.position.x, ride.vehicle.position.z, Math.sin(ride.heading), Math.cos(ride.heading));
      if (blocker) {
        // Follow it: close up to a few metres, then match its speed. (This
        // used to drop to a 0.6 m/s crawl behind ANYTHING, even a vehicle
        // pulling away, which is what made a ride stop-start.)
        const room = Math.max(0, blocker.gap - ride.halfLen - FOLLOW_GAP);
        target = Math.min(target, blocker.lead * 0.9 + room * 0.8);
      }
      // Properly stuck (a wreck, a jam that is not moving): after a while
      // squeeze past, as any Dhaka driver would.
      if (blocker && ride.speed < 0.8) {
        ride.blockedFor += dt;
        if (ride.blockedFor > 5) {
          ride.ghostFor = 5;
          ride.blockedFor = 0;
        }
      } else ride.blockedFor = 0;
    }

    const dv = target - ride.speed;
    ride.speed += Math.sign(dv) * Math.min(Math.abs(dv), ride.spec.accel * (dv < 0 ? 2.2 : 1) * dt);
    ride.s = Math.min(ride.route.length, ride.s + ride.speed * dt);
    place(dt);
    if (remaining < 0.6) endRide(true);
  }

  /** @returns {boolean} true when E was consumed */
  function interact() {
    if (ride) {
      endRide(false);
      return true;
    }
    const near = candidate();
    if (!near) return false;
    openMenu(near);
    return true;
  }

  return {
    update,
    interact,
    promptLine,
    get riding() {
      return ride !== null;
    },
  };
}
