// Shot definitions. Runs inside the game page after page-shots.js.
// Each shot: { seconds, time, rain, seed, scene, setup(state), tick(f, t, u, state), teardown }
//   f = frame index, t = seconds, u = 0..1 progress. Coordinates are world metres;
//   -z is north, the corridor arc length `s` grows northbound (see cap.pathAt),
//   and `lateral` is metres to the WEST of the viaduct centre line.
(() => {
  const cap = window.__cap;
  const { M, lerp, ease } = cap;
  const S = (x, z) => cap.pathS(x, z);
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));

  // Landmarks used below (src/districts.js, src/streetlife/landmarks.js, src/benarasi-palli.js).
  const PALLABI = { x: -266.2, z: -1386.8 };
  const MIRPUR11 = { x: -154.7, z: -600.7 };
  const STADIUM = { x: -330, z: 790 };
  const BENARASI_GATE = { x: 362.6, z: 719.2 };
  const BENARASI_INTO = { x: 346.8, z: 685.5 };
  const sPallabi = S(PALLABI.x, PALLABI.z);
  const sMirpur11 = S(MIRPUR11.x, MIRPUR11.z);

  /** Fly-camera move along the corridor: arc length, lateral offset and height all interpolated. */
  function corridorMove(a, b, u, easing = 'inOut') {
    const k = ease[easing](u);
    const p = cap.pathAt(lerp(a.s, b.s, k), lerp(a.lat, b.lat, k));
    const q = cap.pathAt(lerp(a.ls, b.ls, k), lerp(a.llat ?? 0, b.llat ?? 0, k));
    cap.pose({ x: p.x, y: lerp(a.y, b.y, k), z: p.z, look: { x: q.x, y: lerp(a.ly, b.ly, k), z: q.z }, fov: lerp(a.fov ?? 60, b.fov ?? a.fov ?? 60, k) });
  }

  /** Per-train motion frame measured from two consecutive steps (robust to whatever `dir` means). */
  function measureTrains() {
    const before = M.metro.trains.map((t) => ({ x: t.obj.position.x, z: t.obj.position.z }));
    cap.vt.step();
    return M.metro.trains.map((t, i) => {
      const p = t.obj.position;
      const vx = p.x - before[i].x, vz = p.z - before[i].z;
      const s = S(p.x, p.z);
      const tangent = cap.pathAt(s);
      return { i, x: p.x, y: p.y, z: p.z, s, speed: Math.hypot(vx, vz) * 60, north: vx * tangent.dx + vz * tangent.dz > 0 };
    });
  }

  const shots = {};

  // 1. Cold open: morning haze, crane up beside the viaduct north of Pallabi.
  shots['dawn-crane'] = {
    seconds: 6, time: 'morning', seed: 3,
    async setup(state) {
      // Stays over the carriageway (building line is ~14 m out, deck edge ~5 m).
      state.a = { s: sPallabi + 250, lat: 8.2, y: 2.0, ls: sPallabi + 150, llat: 2, ly: 8, fov: 58 };
      state.b = { s: sPallabi + 225, lat: 8.6, y: 23, ls: sPallabi + 60, llat: 0, ly: 15, fov: 54 };
      corridorMove(state.a, state.b, 0);
      await cap.settle(240);
    },
    tick(f, t, u, state) { corridorMove(state.a, state.b, u); },
  };

  // 2. Aerial tracking shot beside a northbound train between Mirpur 11 and Pallabi.
  shots['train-chase'] = {
    seconds: 6, time: 'afternoon', seed: 5,
    async setup(state) {
      const mid = cap.pathAt((sMirpur11 + sPallabi) / 2, 16);
      cap.pose({ x: mid.x, y: 22, z: mid.z, yaw: mid.yaw, pitch: -0.1 });
      await cap.settle(120);
      let pick = null;
      const waited = await cap.waitUntil(() => {
        pick = measureTrains().find((tr) => tr.north && tr.speed > 25 && tr.s > sMirpur11 + 60 && tr.s < sMirpur11 + 180);
        return !!pick;
      }, 60 * 400);
      state.train = pick ? pick.i : 0;
      state.log.push({ waited, train: pick });
    },
    tick(f, t, u, state) {
      const p = M.metro.trains[state.train].obj.position;
      const s = S(p.x, p.z);
      // Over the carriageway beside the deck: clear of the building line.
      const lead = lerp(60, 14, ease.inOut(u));
      const camP = cap.pathAt(s + lead, lerp(10.5, 9, u));
      const look = cap.pathAt(s - 6, 1.5);
      cap.pose({ x: camP.x, y: lerp(19.5, 17.8, u), z: camP.z, look: { x: look.x, y: 16.4, z: look.z }, fov: 56 });
      if (f % 60 === 0) state.log.push({ t, s: +s.toFixed(0) });
    },
  };

  // 3. Northbound through the hand-modelled Pallabi / Mirpur 12 shopfronts, the game's own chase camera.
  shots['drive-chase'] = {
    seconds: 8, time: 'midday', seed: 7,
    async setup(state) {
      state.s0 = sPallabi - 40;
      const p = cap.pathAt(state.s0, 6.5);
      cap.pose({ x: p.x, y: 1.7, z: p.z, yaw: p.yaw, pitch: 0 });
      await cap.settle(90);
      cap.enterCarAt(state.s0, { dir: 1, lane: 6.5 });
      for (let i = 0; i < 260; i++) { cap.driveTick({ dir: 1, lane: 6.5, speed: 17 }); cap.vt.step(); if (i % 6 === 0) await yieldNow(); }
    },
    tick(f, t, u, state) {
      const d = cap.driveTick({ dir: 1, lane: 6.5, speed: 17 });
      if (f % 120 === 0 && d) state.log.push({ t, speed: +d.speed.toFixed(1), x: +d.x.toFixed(1), z: +d.z.toFixed(1) });
    },
    // Portrait only: the game's chase fov is far too tight at 9:16, so frame it by hand.
    camera() { if (cap.settings.format === 'tall') cap.carCam({ back: 7.2, side: 0, up: 3.0, lookAhead: 9, lookUp: 1.6, fov: 62 }); },
  };

  // 4. Same drive, low three-quarter camera ahead of the car looking back at it.
  shots['drive-front'] = {
    seconds: 5, time: 'midday', seed: 7,
    async setup(state) {
      state.s0 = sPallabi + 40;
      const p = cap.pathAt(state.s0, 6.5);
      cap.pose({ x: p.x, y: 1.7, z: p.z, yaw: p.yaw, pitch: 0 });
      await cap.settle(90);
      cap.enterCarAt(state.s0, { dir: 1, lane: 6.5 });
      for (let i = 0; i < 260; i++) { cap.driveTick({ dir: 1, lane: 6.5, speed: 18 }); cap.vt.step(); if (i % 6 === 0) await yieldNow(); }
    },
    tick() { cap.driveTick({ dir: 1, lane: 6.5, speed: 18 }); },
    camera(state) {
      const u = state.u ?? 0;
      cap.carCam({ back: lerp(-8.5, -6, u), side: lerp(-3.4, -2.2, u), up: lerp(0.75, 1.1, u), lookAhead: 0.5, lookUp: 0.85, fov: 48 });
    },
  };

  // 5. On the Pallabi platform as a northbound train runs in and berths at the screen doors.
  shots['platform-arrival'] = {
    seconds: 9, time: 'midday', seed: 11,
    async setup(state) {
      // Back from the platform edge (waiting passengers stand on the yellow line)
      // and aimed a little high, so the floor right under the lens stays out of frame.
      state.lat = 7.3;
      const camP = cap.pathAt(sPallabi + 37, state.lat);
      const look = cap.pathAt(sPallabi - 60, 2.0);
      state.pose = { x: camP.x, y: 17.15, z: camP.z, look: { x: look.x, y: 17.2, z: look.z }, fov: 60 };
      cap.pose(state.pose);
      // At eye height on a platform the game shows a soft pale patch on the floor just ahead of
      // the camera. Shift the lens instead of tilting: render the top 85% of a taller virtual frame.
      const k = 1.26;
      M.camera.setViewOffset(1000 * k, 1000 * k, 1000 * (k - 1) / 2, 0, 1000, 1000);
      M.camera.updateProjectionMatrix();
      await cap.settle(200);
      let pick = null;
      const waited = await cap.waitUntil(() => {
        pick = measureTrains().find((tr) => tr.north && tr.speed > 8 && tr.s > sPallabi - 185 && tr.s < sPallabi - 110);
        return !!pick;
      }, 60 * 500);
      state.train = pick ? pick.i : 0;
      state.log.push({ waited, train: pick });
    },
    tick(f, t, u, state) {
      const camP = cap.pathAt(sPallabi + lerp(37, 33, ease.inOut(u)), state.lat);
      cap.pose({ ...state.pose, x: camP.x, z: camP.z });
      if (f % 60 === 0) { const p = M.metro.trains[state.train].obj.position; state.log.push({ t, toStation: +(sPallabi - S(p.x, p.z)).toFixed(0), speed: +M.metro.trains[state.train].speed.toFixed(1) }); }
    },
    teardown() { M.camera.clearViewOffset(); M.camera.updateProjectionMatrix(); },
  };

  // 6. Golden hour orbit of Sher-e-Bangla National Cricket Stadium.
  shots['stadium-orbit'] = {
    seconds: 6, time: 'afternoon', seed: 13,
    async setup() {
      cap.orbit({ cx: STADIUM.x, cy: 10, cz: STADIUM.z, radius: 235, height: 62, angle: 0.95, fov: 46 });
      await cap.settle(260);
    },
    tick(f, t, u) {
      cap.orbit({ cx: STADIUM.x, cy: 10, cz: STADIUM.z, radius: lerp(235, 215, u), height: lerp(62, 54, u), angle: lerp(0.95, 1.4, ease.inOut(u)), fov: 46 });
    },
  };

  // 7. Street level toward the Mirpur 10 foot over bridge, under the viaduct.
  shots['footbridge-glide'] = {
    seconds: 5, time: 'midday', seed: 17,
    async setup(state) {
      // East carriageway, looking north at the bridge; stays in the lane so no shop sign clips.
      const s0 = S(213, 814);
      state.a = { s: s0, lat: -7.2, y: 1.9, ls: s0 + 80, llat: -2, ly: 7.5, fov: 60 };
      state.b = { s: s0 + 34, lat: -7.2, y: 3.0, ls: s0 + 100, llat: -2, ly: 8.5, fov: 56 };
      corridorMove(state.a, state.b, 0);
      await cap.settle(240);
    },
    tick(f, t, u, state) { corridorMove(state.a, state.b, u); },
  };

  // 8. Through the Benarasi Palli gate into the saree shops.
  shots['benarasi-gate'] = {
    seconds: 5, time: 'midday', seed: 19,
    async setup(state) {
      const dx = BENARASI_INTO.x - BENARASI_GATE.x, dz = BENARASI_INTO.z - BENARASI_GATE.z;
      const len = Math.hypot(dx, dz);
      state.d = { x: dx / len, z: dz / len };
      state.at = (m, y, fov) => ({ x: BENARASI_GATE.x + state.d.x * m, y, z: BENARASI_GATE.z + state.d.z * m, look: { x: BENARASI_GATE.x + state.d.x * (m + 40), y: 4.2, z: BENARASI_GATE.z + state.d.z * (m + 40) }, fov });
      cap.dolly(state.at(-30, 2.4, 58), state.at(8, 2.1, 58), 0);
      await cap.settle(240);
    },
    tick(f, t, u, state) { cap.dolly(state.at(-30, 2.4, 58), state.at(8, 2.1, 58), u); },
  };

  // 9. On foot: the game's real walking (head bob and all) along the Pallabi footpath.
  shots['walk-pallabi'] = {
    seconds: 5, time: 'midday', seed: 23,
    async setup(state) {
      const p = cap.pathAt(sPallabi + 95, 11.6);
      M.player.flying = false;
      M.player.teleport(p.x, p.z, 1.68, p.yaw - 0.16);
      M.player.pitch = 0.06;
      cap.setFov(64);
      await cap.settle(200);
      M.player.keys.add('KeyW');
      for (let i = 0; i < 60; i++) { cap.vt.step(); if (i % 6 === 0) await yieldNow(); }
    },
    tick() { M.player.keys.add('KeyW'); },
    teardown() { M.player.keys.delete('KeyW'); },
  };

  // 10. Monsoon: slow push along the wet street under the viaduct.
  shots['rain-street'] = {
    seconds: 6, time: 'afternoon', rain: true, seed: 29,
    async setup(state) {
      state.a = { s: sPallabi + 60, lat: 9.5, y: 1.8, ls: sPallabi + 160, llat: 4, ly: 6, fov: 60 };
      state.b = { s: sPallabi + 84, lat: 8.5, y: 2.2, ls: sPallabi + 190, llat: 4, ly: 7, fov: 56 };
      corridorMove(state.a, state.b, 0);
      await cap.settle(420);
    },
    tick(f, t, u, state) { corridorMove(state.a, state.b, u); },
  };

  // 11. Night: lit windows and streetlights along the corridor.
  shots['night-street'] = {
    seconds: 6, time: 'night', seed: 31,
    async setup(state) {
      state.a = { s: sMirpur11 + 120, lat: 13.2, y: 1.9, ls: sMirpur11 + 230, llat: 2, ly: 8, fov: 62 };
      state.b = { s: sMirpur11 + 140, lat: 12.6, y: 2.6, ls: sMirpur11 + 250, llat: 2, ly: 9, fov: 58 };
      corridorMove(state.a, state.b, 0);
      await cap.settle(300);
    },
    tick(f, t, u, state) { corridorMove(state.a, state.b, u); },
  };

  // 12. The game's own ~19 s metro-first opening (approach, aerial train follow, passenger window, street, handoff).
  shots['intro-cinematic'] = {
    seconds: 19.4, time: 'midday', seed: 37,
    async setup(state) {
      M.player.flying = false;
      M.player.teleport(-262, -1466, 1.68, 0.25);
      await cap.settle(120);
      M.introCinematic.start({ onComplete() {} });
    },
    tick(f, t, u, state) {
      // Exact cut frames, so the edit can lift single shots out of the sequence.
      const shot = M.introCinematic.status.shot;
      if (shot !== state.last) { state.last = shot; state.log.push({ f, shot }); }
    },
    async teardown() {
      if (M.introCinematic.active) M.introCinematic.skip();
      await cap.waitUntil(() => !M.introCinematic.active, 600);
    },
  };

  window.__shots = shots;
})();
