// Runs inside the game page (added with addScriptTag after the world exists).
// Camera scripting helpers on top of window.__mirpur (docs/DEBUG-HOOK.md) and
// window.__driveDebug (src/drive.js). Everything here is per-frame driven by
// the virtual clock in virtual-time.js.
(() => {
  const M = window.__mirpur;
  const vt = window.__vt;
  const TIME_LABELS = { morning: 'Morning haze', midday: 'Midday', afternoon: 'Late afternoon', dusk: 'Dusk', night: 'Night' };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const ease = {
    linear: (t) => t,
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2),
    out: (t) => 1 - (1 - t) ** 3,
    in: (t) => t ** 3,
  };

  /** Yaw/pitch that make the fly camera at `from` look at `to` (player.js: forward = (-sin yaw, ., -cos yaw)). */
  function aim(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }

  // Portrait frames keep three.js's VERTICAL fov, which makes the horizontal
  // view very tight. In the tall format every scripted fov is widened so the
  // street still reads (60 deg -> ~82 deg vertical, ~52 deg horizontal).
  const settings = { format: 'wide' };
  function mapFov(fov) {
    if (settings.format !== 'tall') return fov;
    return (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * 1.5) * 180) / Math.PI;
  }
  function setFov(fov) {
    const mapped = mapFov(fov);
    if (Math.abs(M.camera.fov - mapped) > 1e-4) { M.camera.fov = mapped; M.camera.updateProjectionMatrix(); }
  }

  /** Put the free-fly camera somewhere. Either yaw/pitch or a `look` target. */
  function pose({ x, y, z, yaw, pitch, look, fov }) {
    const p = M.player;
    p.flying = true;
    p.position.set(x, y, z);
    p.velocity?.set(0, 0, 0);
    if (look) ({ yaw, pitch } = aim({ x, y, z }, look));
    if (yaw != null) p.yaw = yaw;
    if (pitch != null) p.pitch = pitch;
    if (fov != null) setFov(fov);
  }

  /** Interpolated camera move between two poses with look targets. */
  function dolly(a, b, t, easing = 'inOut') {
    const k = ease[easing](clamp01(t));
    const from = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) };
    const la = a.look, lb = b.look ?? a.look;
    const look = { x: lerp(la.x, lb.x, k), y: lerp(la.y, lb.y, k), z: lerp(la.z, lb.z, k) };
    pose({ ...from, look, fov: lerp(a.fov ?? 60, b.fov ?? a.fov ?? 60, k) });
  }

  /** Orbit around a centre at a radius/height, angle in radians. */
  function orbit({ cx, cy, cz, radius, height, angle, fov }) {
    pose({ x: cx + Math.sin(angle) * radius, y: height, z: cz + Math.cos(angle) * radius, look: { x: cx, y: cy, z: cz }, fov });
  }

  function key(type, code, keyChar) {
    window.dispatchEvent(new KeyboardEvent(type, { code, key: keyChar ?? code, bubbles: true }));
  }

  function setTime(name) {
    const label = document.getElementById('time-label');
    const want = TIME_LABELS[name];
    for (let i = 0; i < 6 && !label.textContent.startsWith(want); i++) key('keydown', 'KeyT', 't');
    if (!label.textContent.startsWith(want)) throw new Error(`time ${name} not reached: ${label.textContent}`);
  }

  /** Step the virtual clock without recording, yielding so async loads (tiles, textures) land. */
  async function settle(frames = 120, realMsEvery = 4) {
    for (let i = 0; i < frames; i++) {
      vt.step();
      if (i % realMsEvery === 0) await new Promise((r) => setTimeout(r, 8));
    }
  }

  function grabBlob(type = 'image/jpeg', quality = 0.95) {
    return new Promise((resolve) => M.renderer.domElement.toBlob(resolve, type, quality));
  }

  /**
   * The on-foot layer floats name pills over undiscovered places
   * (src/streetlife/world.js, a pool of 1024x96 canvas sprites). They are
   * gameplay UI, not world, so the trailer hides them. The pool toggles
   * sprite.visible every refresh, so switch the material off instead.
   */
  function hideLabels() {
    let hidden = 0;
    M.scene.traverse((o) => {
      const img = o.isSprite && o.material?.map?.image;
      if (img && img.width === 1024 && img.height === 96) { o.material.visible = false; hidden++; }
    });
    return hidden;
  }

  function info() {
    const p = M.player;
    return {
      time: document.getElementById('time-label')?.textContent,
      pos: [p.position.x, p.position.y, p.position.z].map((v) => +v.toFixed(1)),
      yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), flying: p.flying,
      driving: window.__driveDebug?.driving, blocked: document.body.className,
      calls: M.renderer.info.render.calls, tris: M.renderer.info.render.triangles,
    };
  }

  // --- Corridor path (metro.centre: [x, z] pairs, south -> north) -----------
  const centre = M.metro.centre;
  const cum = [0];
  for (let i = 1; i < centre.length; i++) cum.push(cum[i - 1] + Math.hypot(centre[i][0] - centre[i - 1][0], centre[i][1] - centre[i - 1][1]));
  const pathLength = cum[cum.length - 1];

  /** Arc length of the corridor point nearest (x, z). */
  function pathS(x, z) {
    let best = Infinity, bestS = 0;
    for (let i = 1; i < centre.length; i++) {
      const ax = centre[i - 1][0], az = centre[i - 1][1], bx = centre[i][0], bz = centre[i][1];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      const t = clamp01(((x - ax) * dx + (z - az) * dz) / len2);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) { best = d; bestS = cum[i - 1] + Math.sqrt(len2) * t; }
    }
    return bestS;
  }

  /**
   * Point at arc length s, pushed `lateral` metres to the LEFT of northbound
   * travel (west). Returns the northbound heading as a game yaw too.
   */
  function pathAt(s, lateral = 0) {
    s = Math.max(0, Math.min(pathLength - 0.01, s));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const ax = centre[i - 1][0], az = centre[i - 1][1], bx = centre[i][0], bz = centre[i][1];
    const len = cum[i] - cum[i - 1] || 1;
    const t = (s - cum[i - 1]) / len;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    return { x: ax + (bx - ax) * t + dz * lateral, z: az + (bz - az) * t - dx * lateral, yaw: Math.atan2(-dx, -dz), dx, dz };
  }

  const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // --- Driving -------------------------------------------------------------
  const D = () => window.__driveDebug;

  /** Put the player on the carriageway and get in. dir: +1 northbound, -1 southbound. */
  function enterCarAt(s, { dir = 1, lane = 6.5 } = {}) {
    if (D().driving) D().toggleDrive();
    const p = pathAt(s - dir * 3.5, dir * lane); // enterCar() spawns the car 3.5 m ahead of the player
    M.player.flying = false;
    M.player.teleport(p.x, p.z, 1.68, dir > 0 ? p.yaw : p.yaw + Math.PI);
    D().toggleDrive();
    return D().driving;
  }

  /** One control tick: pure pursuit on the corridor with keyboard steering. */
  function driveTick({ dir = 1, lane = 6.5, speed = 15, lookAhead = 22 } = {}) {
    const car = D().car;
    if (!car) return null;
    const s = pathS(car.x, car.z);
    const target = pathAt(s + dir * lookAhead, dir * lane);
    const want = Math.atan2(-(target.x - car.x), -(target.z - car.z));
    const err = wrapPi(want - car.yaw);
    const dead = 0.012;
    D().release('KeyA'); D().release('KeyD');
    if (err > dead) D().press('KeyA'); else if (err < -dead) D().press('KeyD');
    if (car.speed < speed) { D().press('KeyW'); D().release('KeyS'); } else { D().release('KeyW'); }
    return { s, err, speed: car.speed, x: car.x, z: car.z, yaw: car.yaw };
  }

  function releaseDrive() {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) D().release(k);
  }

  /** Camera placed relative to the player's car (overrides the game's chase camera for this frame). */
  function carCam({ back = 6, side = 0, up = 1.4, lookAhead = 3, lookUp = 0.9, fov = 55 }) {
    const car = D().car;
    if (!car) return;
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw); // forward
    const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);  // right
    const cam = M.camera;
    cam.position.set(car.x - fx * back + rx * side, up, car.z - fz * back + rz * side);
    cam.lookAt(car.x + fx * lookAhead, lookUp, car.z + fz * lookAhead);
    setFov(fov);
  }

  // --- Trains --------------------------------------------------------------
  function trainState(i) {
    const t = M.metro.trains[i];
    const p = t.obj.position;
    return { i, dir: t.dir, x: p.x, y: p.y, z: p.z, speed: t.speed, s: pathS(p.x, p.z) };
  }

  /** Nearest moving train to (x, z), optionally by direction. */
  function nearestTrain(x, z, { dir = 0, minSpeed = 5 } = {}) {
    let best = null;
    M.metro.trains.forEach((t, i) => {
      if (dir && t.dir !== dir) return;
      if (t.speed < minSpeed) return;
      const d = Math.hypot(t.obj.position.x - x, t.obj.position.z - z);
      if (!best || d < best.d) best = { ...trainState(i), d };
    });
    return best;
  }

  /** Step (without recording) until `test()` is true. Returns frames stepped, or -1 on timeout. */
  async function waitUntil(test, maxFrames = 60 * 240) {
    for (let f = 0; f < maxFrames; f++) {
      if (test()) return f;
      vt.step();
      if (f % 6 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return -1;
  }

  // --- Camera override hook ------------------------------------------------
  // src/drive.js's loop is queued before src/main.js's frame(), so a camera set
  // from a shot's tick() is overwritten by the chase camera before it renders.
  // metro.update() is the first thing frame() calls: wrapping it gives a hook
  // that runs after the chase camera and before culling, LOD and the render.
  const hook = { preFrame: null };
  if (!M.metro.__capWrapped) {
    const update = M.metro.update;
    M.metro.update = (...a) => { window.__cap?.hook?.preFrame?.(); return update.apply(M.metro, a); };
    M.metro.__capWrapped = true;
  }

  // --- Recorder ------------------------------------------------------------
  /**
   * Run a registered shot. Every frame: shot.tick -> one virtual-clock step ->
   * (optionally) JPEG of the canvas POSTed to the Node frame server.
   * `every` > 1 is preview mode: the whole shot is simulated, few frames kept.
   */
  async function runShot(name, { port, every = 1, quality = 0.95, fps = 60, format = 'wide' } = {}) {
    const shot = window.__shots[name];
    if (!shot) throw new Error(`no shot ${name}`);
    settings.format = format;
    hook.preFrame = null;
    // Key handlers (time of day) are ignored while the opening cinematic runs.
    if (M.introCinematic.active) { M.introCinematic.skip(); await waitUntil(() => !M.introCinematic.active, 600); }
    if (D().driving) { releaseDrive(); D().toggleDrive(); }
    vt.reseed(shot.seed ?? 1);
    setTime(shot.time ?? 'midday');
    M.monsoon.set(!!shot.rain);
    const state = { log: [] };
    await shot.setup?.(state);
    hideLabels();
    const N = Math.round(shot.seconds * fps);
    const inflight = new Set();
    if (shot.camera) hook.preFrame = () => shot.camera(state);
    for (let f = 0; f < N; f++) {
      state.f = f; state.t = f / fps; state.u = N > 1 ? f / (N - 1) : 0;
      shot.tick?.(f, f / fps, state.u, state);
      vt.step();
      if (f % every === 0 || f === N - 1) {
        const blob = await grabBlob('image/jpeg', quality);
        const post = fetch(`http://127.0.0.1:${port}/${name}_${String(f).padStart(5, '0')}.jpg`, { method: 'POST', body: blob });
        inflight.add(post);
        post.finally(() => inflight.delete(post));
        if (inflight.size >= 6) await Promise.race(inflight);
      } else if (f % 8 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await Promise.all(inflight);
    hook.preFrame = null;
    await shot.teardown?.(state);
    releaseDrive();
    return { name, frames: N, log: state.log };
  }

  window.__cap = {
    M, vt, lerp, clamp01, ease, aim, pose, dolly, orbit, key, setTime, settle, grabBlob, hideLabels, info,
    settings, mapFov, setFov, hook,
    pathS, pathAt, pathLength, wrapPi, enterCarAt, driveTick, releaseDrive, carCam, trainState, nearestTrain, waitUntil, runShot,
  };
})();
