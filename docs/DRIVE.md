# P0-E5: drivable car ("Drive" button)

Owner: E5. Files: `src/drive.js` (new), `index.html` (button/CSS/script tag).
Never touches main.js, player.js, city.js, traffic.js, streets.js, metro.js —
reaches the world only through `window.__mirpur` (player, scene, camera,
collision) that main.js exposes, plus `import { resolveCollision } from
'./city.js'` and three.js.

## How it works

`src/drive.js` polls `window.__mirpur` every 250 ms (`waitForMirpur`) until
main.js has built the world, then wires up:

- A `<button id="drive-btn">` in the HUD (added in `index.html`, styled like
  the other HUD chips) and the `V` key, both calling `toggleDrive()`.
- `enterCar()`: spawns a car mesh 3 m in front of the player along
  `player`'s forward vector, facing `player.yaw`, replaces
  `player.update` with a no-op (saved and restored on exit) so the built-in
  first-person controller stops fighting for the camera, and starts driving.
- A `requestAnimationFrame` loop (`performance.now()` deltas) that, while
  driving, steps the car physics (`stepCar`) and the chase camera
  (`stepCamera`) every frame — independent of main.js's own frame loop.
- `exitCar()`: teleports the player beside the driver-side door
  (`player.teleport(x, z, 1.68, car.yaw)`, restoring normal walking/eye
  height), restores the original `player.update`, removes the car mesh and
  disposes its geometries/materials.

## Controls

- `W` / `ArrowUp` — throttle, accel 6 m/s^2, up to 22 m/s (~80 km/h).
- `S` / `ArrowDown` — brake if moving forward (10 m/s^2), else builds up
  reverse (4 m/s^2, up to 8 m/s).
- `A` / `D` (or arrows) — steer; steering angle is scaled down with speed
  (max 0.55 rad at a standstill, down to ~35% of that at top speed) and
  smoothed toward the target over ~1/8 s.
- `Space` — handbrake, 16 m/s^2 decel toward zero from either direction.
- Coasting (no throttle/brake) applies 2.2 m/s^2 drag toward zero.
- Steering + speed feed a simple kinematic bicycle model (wheelbase 2.7 m):
  `yaw += (speed / wheelbase) * tan(steer) * dt`, then the car moves along
  its own forward vector. The car is held at `y = 0` — it never climbs the
  viaduct.

## Collision

Each frame, the car's 4 corner points (half-length 2.2 m, half-width 0.9 m
around the new centre) are each pushed out of building walls with
`resolveCollision(collision, x, z, 0.9)` from `src/city.js`. If any corner
was pushed, the average correction is applied to the car's position and
speed is cut to 15% of its prior value (arcade-style "you hit something,
you stop"). Verified live: steering hard into a building wall during a test
run dropped speed from 18 m/s to ~0 m/s within one steer input.

**Traffic vehicles are not collidable this pass** — the drivable car can
drive through `traffic.js` cars/buses/bikes/pedestrians without incident.
Noted per the brief; out of scope for P0-E5.

## Camera

Third-person chase camera: target position is `car.position - forward *
7.5m + up * 3.2m`, exponentially smoothed toward that target
(`1 - exp(-5.5 * dt)`) so it doesn't snap on sudden speed/steering changes,
looking at a point ~1.1 m above the car's centre. `player.position` (and
`player.yaw`) are kept synced to the car every frame so the minimap and the
"### m from Mirpur 10" HUD readout keep working while driving.

## Car mesh

Self-contained low-poly sedan built in `buildCarMesh()` (same
box-primitives approach as `traffic.js`'s `carParts()`, not imported from
it since that file is owned by another executor): a 1.8×0.85×4.4 m body,
a cabin box, 4 cylinder wheels (parented to per-wheel pivot groups so the
front two can also yaw with the steering angle), a pair of emissive
headlamps at the front and a pair of emissive taillamps at the back. Wheels
spin around their local X axis proportional to `speed / wheel_radius`.
Body colour: off-white (`#e9e7df`), "most Dhaka" per the brief.

One bug caught and fixed during review: the first implementation had the
headlamps/front-wheel-pivots on the wrong end relative to this file's
`forwardOf(yaw) = {x: -sin(yaw), z: -cos(yaw)}` convention, so the chase
camera (positioned behind the car, i.e. opposite of forward) was looking at
the *headlamps* instead of the *taillamps*. Fixed by swapping the z signs
for the lamp pair and the front/rear wheel pivots; confirmed visually in
`p0-drive-spawn.jpg` (small red squares — taillamps — face the camera).

## Debug hook for automated review

`window.__driveDebug = { tick(dt), press(code), release(code), driving,
car }` is exposed alongside the normal rAF loop. This exists because
`requestAnimationFrame` is suspended while this background browser pane
isn't actively composited (confirmed during this pass: clicking Drive and
immediately capturing via `window.__mirpur.capture()` produced a frame
frozen at the pre-drive walking camera pose, since the rAF loop never got a
tick in between). `tick(dt)` runs the exact same `stepCar`/`stepCamera`
code the real rAF loop calls, so an automated reviewer can pump frames
synchronously between calls. Not used by normal interactive play — a real
user's tab is visible and the rAF loop runs on its own.

## Verification (this pass)

Browser tab: own tab (`tabs_create`), navigated to `http://localhost:5183`,
"Enter the street" clicked, dev server already running — not started or
stopped by this executor.

- `node --check src/drive.js` — passes.
- No console errors originate from `drive.js`. The only console errors seen
  (`renderer.render threw ... reading 'value'`, `main.js:380`/`:190`) are a
  pre-existing material/uniform issue in a concurrently-edited file,
  already caught by main.js's own try/catch (see its comment above that
  render call) and unrelated to this change.
- `screenshots/p0-drive-spawn.jpg` — md5 `e7dbdb610de627e25a749f34c8c17545`.
  Car freshly spawned, chase camera settled (90 ticks pumped via
  `__driveDebug.tick`), taillamps facing camera, correct chase framing.
- `screenshots/p0-drive-moving.jpg` — md5 `d25c03ef0a4b34e5afdca247bf21326d`.
  After 3 s of simulated `W` (`speed` measured 0 -> 18 m/s, matching the
  6 m/s^2 accel spec exactly), car visibly further down the road, chase cam
  followed.
- `screenshots/p0-drive-exit.jpg` — md5 `54c9529aab4a1aa8c2254b49ce08ca20`.
  Taken after `V` exit; `player.position`/`mode` confirmed back to walking
  (`Mode: Walk`, eye height 1.68 m) via JS state check. This particular
  frame is close against a building wall because it was captured right
  after a deliberate hard-steer-into-a-wall collision test (see Collision
  above) — the car had come to rest against that wall, so the exit spot
  beside it is tight; this is expected given where the car stopped, not a
  placement bug.
- A fourth, live (non-ticked) confirmation was also captured with the pane
  actually compositing: HUD showing "Exit car (V)", "Mode Drive", minimap,
  and genuine `renderer.info`-based stats — see FPS below. Not saved to
  disk (not one of the three named screenshots) but visually matches
  `p0-drive-moving.jpg`'s framing.
- `V` key confirmed to toggle drive/exit via real `KeyboardEvent('keydown',
  {code:'KeyV'})` dispatch (not just the button).
- Steering + bicycle-model heading change and collision speed-cut both
  confirmed via `__driveDebug.car` state deltas (see script results in
  session — steer -0.54 rad after holding `D`, speed collapsed from 18 to
  ~0.02 m/s after steering into a wall at speed).

### FPS

- Baseline (walking, start-street view, pane actively composited):
  **26 fps · 706 draws · 1834k tris**.
- While driving (chase cam, pane actively composited for 3 s so the real
  rAF/main.js frame loop — not the debug tick — produced the reading):
  **60 fps · 676 draws · 1768k tris**.

Both numbers came from the existing `#stats` HUD element (`renderer.info`),
unmodified by this pass. The jump is plausible (fewer buildings in the
chase-cam framing than the start view down the corridor) but was not
independently isolated from other executors' concurrent changes to
streets/metro/city this same session — take it as a rough before/after, not
a controlled A/B.

## Not done / known limitations

- Traffic vehicles are not collidable (per brief, explicitly out of scope).
- No sound effects (engine/collision) — not requested by the brief.
- No visible dashboard/speedometer HUD — brief only asked for the chase
  camera and controls, not an instrument cluster.
- The exit spot is always directly beside the car's current position; if
  the car is wedged against a wall (e.g. after a collision) the exit point
  can be tight against that wall too — matches "beside the driver door" as
  specified, but does not additionally check that the exit point itself is
  clear of geometry.
- FPS numbers above are from this automated background-tab session
  (`p0-drive-*` screenshots note the same caveat as other P0 executors:
  pessimistic vs. a normal foreground tab) and were not cross-checked
  against a second run.
