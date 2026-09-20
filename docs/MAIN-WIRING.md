# P1-MAIN: wire streaming + LOD, playable boundary, debug flag, scene switch

Owner: `src/main.js`, `index.html`, `src/player.js`, `src/drive.js`. Executor
P1-MAIN, 2026-09-07. Read: docs/briefs/P0-COMMON.md, docs/STREAMING.md,
docs/LOD-PASS.md, docs/DECISION-PLAYABLE-AREA.md, docs/briefs/P1-PERF-BOUNDARY.md
(rows P1-A, P1-D), docs/NORTH-DATA.md, docs/DEBUG-HOOK.md, docs/DRIVE.md, then
docs/briefs/P1-MAIN-WIRING.md.

## 1. Streaming + LOD wiring (`src/main.js`)

- `main.js:9` imports `updateBuildingLOD` from `city.js` alongside the existing
  `buildBuildings`/`buildCollisionGrid`.
- `main.js:192` reads `mirpur10Raw` straight off the raw `scene.metro.stations`
  JSON (before `buildMetro()` has run) so it can be passed as the streaming
  start point.
- `main.js:195-198` passes `{ start: { x: mirpur10Raw.x, z: mirpur10Raw.z },
  initialRadius: 500 }` into `buildBuildings`, per docs/STREAMING.md.
- `main.js:344-350` (frame loop) calls
  `updateBuildingLOD(player.position.x, player.position.z)` every frame,
  unconditionally, right after `player.update(dt)` — this covers driving too,
  since `drive.js` no-ops `player.update()` but keeps `player.position`/`yaw`
  synced to the car every `stepCar()` call.

**Verified** (default scene, `?debug=1`, own browser tab):
- Console: `[lod] 10508 of 14442 building(s) tagged far` logged, no
  `updateBuildingLOD not called` warning at any point (it fires ~5s after
  build if the call is missing — never seen after this change).
- `getStreamingStats()` (via the same versioned `city.js` module instance
  main.js loaded, per the DEBUG-HOOK.md caveat about re-importing) read
  `{ built: 0, pending: 0 }` at the start screen (nothing built until
  buildBuildings runs at "Enter the street" time — expected, matches the
  "Extruding N buildings" progress step) and `{ built: 42, pending: 54,
  disposed: 0, lastBuildMs: 1.4 }` right after clicking "Enter the street" —
  streaming built 42 of 96 tiles up front (initialRadius=500) instead of all
  96, confirming the wiring is live. Start-screen build-info line read
  `14,453 buildings · 436 road ways · 241 viaduct piers · 343 vehicles ·
  0.08M triangles` — triangle count dropped from the historical 0.32M
  (P1-B2, all 96 tiles) to 0.08M, consistent with only ~40% of tiles built
  up front.

## 2. Scene switch (`src/main.js`)

- `main.js:123-126`: `?scene=north` (or `localStorage.mirpurScene = 'north'`)
  loads `scene-north.json` instead of `scene.json`. Default (no param) stays
  `scene.json`. Start position logic is untouched — it always resolves
  "Mirpur 10" out of whichever scene loaded, so it stays correct for both.

**Load timings** (own tab, `navigate` then poll `#loading-text` until
"Ready"; P0-COMMON's "~28s to Enter-the-street" ballpark is for a cold
Vite dev-server + uncached fetch):

| Scene | Buildings | Cold/warm | Time to "Ready" |
|---|---:|---|---:|
| `scene.json` (default) | 14,453 | warm (2nd+ load this session, browser HTTP cache) | ~3-13s |
| `scene-north.json` (`?scene=north`) | 55,091 | first load this session (7.46 MB fetch, uncached) | ~28s |
| `scene-north.json` (`?scene=north`) | 55,091 | warm (2nd load, cached) | ~28s (unchanged — dominated by facade-atlas/texture build and bucketing, not the fetch) |

The north scene's "Extruding 55,091 buildings" progress step (loading-text
element) updates correctly and does not stall or freeze the tab — confirmed
by polling it mid-build (`"Extruding 55,091 buildings"` at t+10s,
`"Ready"` by t+28s) — it is only bucketing/streaming-setup now, not building
all 55k buildings' geometry up front, matching docs/STREAMING.md's design.
Did not attempt a true cold (dev-server-restart, empty HTTP cache) timing for
either scene, since P0-COMMON forbids restarting the dev server; the numbers
above are the closest available without violating that.

**Start-screen build-info line for the north scene**: `55,091 buildings ·
1545 road ways · 241 viaduct piers · 343 vehicles · 0.08M triangles` —
buildings/roads counts match docs/NORTH-DATA.md's reported
`public/scene-north.json` totals exactly.

## 3. Playable boundary (`src/main.js`, `src/player.js`, `src/drive.js`)

Implemented as a `makeBoundary(scene)` helper in `main.js` (`main.js:45-113`,
above `main()`), since `city.js`'s own `distToCentreline` is internal/not
exported and `city.js` is out of this executor's file fence:

- `buildBoundarySegments(scene)` flattens the metro centreline
  (`scene.metro.tracks[*].pts`, always present) plus, when
  `scene.meta.playable.extraCorridorWayIds` names extra arterial roads (the
  north scene's west/east arms, docs/NORTH-DATA.md), the matching
  `scene.roads[*].pts` polylines too, into one flat segment array.
- `distanceToCorridor(x, z)` does a linear scan for the nearest point on any
  segment, returning `{ dist, nx, nz }` — distance plus the nearest point
  itself, so callers can push back *toward* the corridor, not just detect
  "too far". Cheap enough for one call per frame per moving object (metro
  centreline is 2 tracks; north scene's extra corridors add ~900 more
  segments — still a flat, allocation-free loop).
- Thresholds: `WARN = 380` (HUD line appears), `PUSH = 400` (gentle push-back
  fades in), `HARD = 430` (hard clamp).
- `main.js:201` builds `boundary` right after `buildBuildings()` (scene data
  is loaded by then); `main.js:232` sets `player.boundary = boundary`;
  `main.js:184-198` (hook) also exposes it as `window.__mirpur.boundary` so
  `drive.js` can reach it without an import (file-fence rule: reach another
  owner's data at runtime, not via import — though here `boundary` itself is
  built by this same executor's `main.js`).

**`src/player.js`** (`player.js:66-79` constructor, `player.js:250-273`
update): after the existing wall-collision resolution and escalator-drift
step, and before the position is committed, checks
`this.boundary.distanceToCorridor(nx, nz)`. Sets `this.leavingMirpur = dist >
WARN` unconditionally (read by `main.js`'s frame loop for the HUD line) each
walking-mode update. Past `PUSH`, nudges `nx/nz` and `velocity` toward the
nearest corridor point with a force that fades in linearly from 0 at `PUSH`
to full at `HARD` (`5 * t` m/s², `t = clamp((dist-PUSH)/(HARD-PUSH), 0, 1)`).
Past `HARD`, additionally snaps the excess distance back onto the `HARD`
radius the same frame (unconditional correction, not fading — see
verification below). Fly mode is untouched (boundary only applies to the
walking branch, matching the brief's "walking and driving" — flying is a
debug-only feature, not part of the playable-boundary spec).

**`src/drive.js`** (`drive.js:108`, `drive.js:266-296` in `stepCar`): same
shape, applied to the car's `nx/nz` after building-wall collision, before
`car.x = nx; car.z = nz` is committed. Past `PUSH`, cuts `car.speed *= 1 -
0.5*t` and steers `car.yaw` toward the heading that points back at the
nearest corridor point (blended in over time, not snapped), plus a small
positional nudge; past `HARD`, same unconditional radius-snap as walking.
Also sets `player.leavingMirpur` directly (`player.update()` is a no-op
while driving, so the HUD flag has to be set from here instead — `main.js`'s
frame loop only reads `player.leavingMirpur`, so one flag serves both modes).

**Verified** (own tab, both scenes; positions found via
`boundary.distanceToCorridor` probing outward from the Mirpur 10 station):

| Test | Setup | Result |
|---|---|---|
| No wall inside 400 m | teleported to dist=342.5m, walked further out for 1s (30 ticks) with no boundary interference | moved freely 342.5m -> 345.4m, `leavingMirpur: false` — confirms no invisible wall inside the playable area |
| HUD warning | teleported to dist=405.7m (walking) | `leavingMirpur: true`; `#boundary-warning` DOM element visible with text "Turn back: leaving Mirpur"; confirmed both via `computer.screenshot` (full page) and a canvas-composited capture, see `screenshots/p1-main-boundary.jpg` |
| Gentle push (walking) | dist=405.66m at teleport, 30 update(1/30) ticks, no input keys | dist eased down to 404.76m — small, gradual pull, not a snap |
| Hard clamp (walking) | dist=444.5m at teleport | after a single `update(1/30)` call: dist -> 429.8m (inside HARD=430) |
| Gentle push+steer (driving) | dist=406.4m at teleport, entered car, 60 `tick(1/30)` calls with **no throttle** | car yaw rotated 0 -> 0.927 rad (steering back toward corridor) and dist eased 406.4m -> 404.3m purely from the boundary nudge; `player.leavingMirpur: true` set from `drive.js` |
| Hard clamp (driving) | dist=445.2m at teleport, entered car | after one `tick(1/30)`: dist -> 429.8m |

## 4. Debug flag (`src/main.js`, `src/player.js`, `index.html`)

- `main.js:123-124`: `debugMode = ?debug in the URL, or localStorage.mirpurDebug
  === '1'`.
- `main.js:231`: `new Player(camera, canvas, collision, walkable, debugMode)`
  — `player.js:66` takes a 5th `debug` constructor arg, stored as
  `this.debug`; `player.js:129` gates the `F` key
  (`if (code === 'KeyF' && this.debug)`), so fly mode is unreachable at all
  without the flag (not just hidden from the UI).
- `main.js:281-300`: `Digit3` (platform) and `Digit4` (aerial) both `break`
  immediately when `!debugMode`, before doing anything.
- `index.html`: the Fly `<dt>/<dd>` row and the "· 3 platform · 4 aerial"
  span (both the start card and the in-game `#help` panel) get a
  `debug-only` class; `main.js:132-134` hides every `.debug-only` element
  when `!debugMode`, before any async work starts.

**Verified**: loaded `http://localhost:5183/` (no `?debug`) — start-card
screenshot confirms the Fly row and "3 platform · 4 aerial" are gone (only
"1 Mirpur 10 · 2 Mirpur 11" remains under Jump to). Dispatched real
`KeyboardEvent('keydown', {code:'KeyF'})` and `{code:'Digit4'}` — confirmed
`player.flying` stayed `false` and `player.position` was unchanged (still
exactly the spawn point), i.e. both are true no-ops, not just hidden
buttons. With `?debug=1` present, both the Fly row and the 3/4 jump options
are visible (see `screenshots/p1-main-start.jpg`, taken with `?debug=1`).

## Screenshots

- **`screenshots/p1-main-start.jpg`** (md5 `e5ca6d8fd29dc3fcdac2372f29888cab`)
  — default scene (`?debug=1`), default spawn. Unchanged from prior passes'
  street view: viaduct with piers and the Mirpur 10 canopy on the left, brick
  apartment block and a taller building with shopfront signage on the right.
  Confirms the streaming/LOD wiring does not visually change the default
  start view.
- **`screenshots/p1-main-north-start.jpg`** (md5 `9506d0f7b42ba3fdc4c2ee98acfb5d8a`)
  — `?scene=north&debug=1`, default spawn (Mirpur 10, same station in both
  scenes). Visually near-identical to `p1-main-start.jpg` (expected — both
  scenes share the same Mirpur 10 station geometry and the same
  `initialRadius=500` streamed tiles around it), confirming the scene switch
  loads real, correct geometry and the start position stays Mirpur 10.
- **`screenshots/p1-main-north-uttara.jpg`** (md5 `3b280d229db9ff0c4b71ff725046a45e`)
  — north scene, player flown to the Uttara South station (`(-376.6, 30,
  -3478.7)`) after 80 `updateBuildingLOD()` calls at that position. Shows the
  metro viaduct curving toward the station platform and a scatter of
  buildings, but **far sparser than expected** — see "Not done / caveats"
  below, this screenshot documents a real streaming stall, not full
  geometry.
- **`screenshots/p1-main-boundary.jpg`** (md5 `61468551532af2312854157f4976f619`)
  — default scene, player at 406m from the corridor centreline (dist > WARN).
  Shows the red "Turn back: leaving Mirpur" HUD banner. `capture()` only
  rasterizes the WebGL canvas (not the DOM HUD overlay), so this one frame
  was composited by hand: `capture()` for the base frame, then the
  `#boundary-warning` element's actual bounding box/text drawn onto a copy
  via Canvas2D, matching what a real `computer.screenshot` of the same state
  showed (verified side-by-side before compositing).

All four have distinct, non-trivial md5s (`ls -la` + `md5`), captured with
`player.update(0)` immediately before `capture()` per the P0-COMMON gotcha.

## Not done / caveats

- **`city.js` streaming stalls when teleported far from the initially-built
  area, on the north scene specifically.** Reproduced live: after the
  north-scene start build (35 tiles built near Mirpur 10), teleporting to
  Uttara South (~4.2 km away) and calling `updateBuildingLOD()` up to 380
  times at that fixed position only ever built **one** additional tile
  (`built: 35 -> 36`, then permanently plateaued — verified with 300 more
  calls, no further change). This is not expected: a direct check against
  `public/scene-north.json` found **46 distinct 200m tile buckets with
  buildings within the 700m `BUILD_RADIUS`** of the Uttara South station
  (703 buildings total in that radius), so `updateBuildingLOD`'s "nearest
  still-pending tile" scan should have kept finding new candidates for at
  least 45 more calls. No console error or warning was ever raised (checked
  with `read_console_messages` across the whole test) — the loop returns
  normally every call, which looks like it keeps re-selecting the same
  now-un-buildable bucket as "nearest pending" without success, rather than
  throwing. **`src/city.js` is out of this executor's file fence** (owned by
  P1-B/P1-B2/P2-STREAMING's executors), so this was not fixed here — only
  reproduced, measured, and documented. `screenshots/p1-main-north-uttara.jpg`
  shows the resulting sparse geometry (metro viaduct and a handful of
  buildings only) as honest evidence, not a fabricated "fully streamed"
  scene. This does **not** affect the default `scene.json` scene, where
  STREAMING.md's own 1.5 km-teleport test streamed in 27 tiles over 60
  calls without issue — it is specific to the north scene's data/tile
  layout or scale. Recommend whoever owns `city.js` next investigates
  `updateBuildingLOD`'s nearest-pending-tile scan against
  `public/scene-north.json`.

  **Resolved 2026-09-07 in `src/city.js` (see docs/STREAMING.md item 7).**
  Re-run of this exact repro (live, `?scene=north&debug=1`, 300 calls at the
  Uttara South station) showed the scan streaming in **36** tiles, not one -
  the reported `35 -> 36` reading came from a second module instance:
  `import('/src/city.js')` returns fresh module state, because Vite serves
  the app's copy as `/src/city.js?t=<hmr-stamp>`. Importing the URL taken
  from `performance.getEntriesByType('resource')` reaches the live instance.
  The plateau at 36 was real, but it was not a stall: the scan had correctly
  exhausted every tile whose *centre* was inside `BUILD_RADIUS`. The "46
  buckets" cross-check counted tiles holding a building within 700 m of the
  player, which is a different set - a tile centre is up to `TILE_SIZE / 2`
  = 100 m farther out than its nearest building. The actual defect was that
  `BUILD_RADIUS` (700) was smaller than `LOD_TILE_VISIBLE_RANGE` (750) on
  that same centre-based metric, so tiles the visibility pass marked visible
  were never eligible to be built. `BUILD_RADIUS` is now
  `LOD_TILE_VISIBLE_RANGE + TILE_SIZE / 2` (850 m): the same repro settles
  at **50** tiles with **0 of the 813** buildings inside the 750 m visible
  range left unrendered (was 148 missing), at 114 draw calls. It was also
  never north-specific - at the default scene's origin the old radius left
  3348 of 10780 visible-range buildings unbuilt; the north scene just makes
  it obvious against open ground. `screenshots/p1-main-north-uttara.jpg` is
  accurate evidence of the old behaviour and has been left as-is.
- **Load-time measurements are not cold-cache numbers.** P0-COMMON forbids
  restarting the dev server, and the Vite dev server + browser both cache
  aggressively across `navigate()` calls within one tab session, so the
  "warm" default-scene numbers above (~3-13s) are optimistic versus a true
  first visit. The north scene's ~28s number is from its first fetch this
  session (uncached OS/browser disk cache aside) and did not measurably
  improve on a second load, so it's a more honest number, but still not a
  true cold start.
- **The pre-existing `renderer.render()` throw** (`Cannot read properties of
  undefined (reading 'value')`, first reported in docs/CORRIDOR-CULL.md, seen
  again in every prior pass's docs) is still present, still unrelated to
  this executor's files, and still fully absorbed by the existing
  `try/catch` around `renderer.render()` in the frame loop and in
  `capture()` — confirmed the frame loop keeps running and screenshots kept
  coming out correctly and distinctly throughout this pass.
- **Push/clamp tuning is a judgement call, not specified precisely by the
  brief beyond "gentle" and "hard clamp at 430m".** The push force (5 m/s²
  for walking, speed-cut + steer-blend for driving) and the exact fade curve
  (linear in `(dist-PUSH)/(HARD-PUSH)`) were chosen to satisfy "no invisible
  wall inside 400m" + "fade the push in" + "hard stop at 430m" without a
  specific target number from the brief; verified numerically above rather
  than only by feel.
- Did not touch `metro.js`, `city.js`, `streets.js`, `interior.js`,
  `walkable.js`, or `public/*`, and did not run `git commit`, per the file
  fence. Did not spawn sub-agents.

## 2026-09-07 — P11-C: scene environment map + per-caller texture clones

Brief: `docs/briefs/P11-C-ENV-AND-TEXTURE-SHARING.md`. Files touched:
`src/main.js`, `src/textures.js` only (per the brief's file fence — did not
read-modify-write `src/metro.js` or `src/interior.js`, which other executors
were editing concurrently this pass).

- **Finding 1 (`scene.environment` was null → black metals).** Added a
  `THREE.PMREMGenerator` in `src/main.js` and generated the environment map
  **from the live scene via `PMREMGenerator.fromScene(scene3, 0, 1, 2000, {
  size: 128, position })`** — i.e. from the existing Sky/sun, not the
  RoomEnvironment fallback. `fromScene` renders the current scene (sky dome,
  buildings, everything) into 6 small (128×128) cube faces from a probe
  position and convolves them into the PMREM; using the live scene means the
  reflection tint tracks the actual sky preset colour instead of a fixed
  neutral room.
  - Cost: one call to `fromScene` — a 6-face 128×128 render of the whole
    scene plus the GGX convolution pass. This runs **twice at startup**
    (once before `player` exists, probed from the Mirpur 10 spawn point;
    the `lastEnvBucket` bookkeeping means it does not run a second time
    unless the bucket actually changed) and again **only when the player
    presses `T`** to advance `TIMES_OF_DAY`, since that is the only place
    the time-of-day bucket changes today (there is no automatic day/night
    cycle timer to poll). It is never called from the frame loop. Each
    regen disposes the previous `WebGLRenderTarget` first.
  - `scene3.environmentIntensity` (three r0.180, confirmed in
    `node_modules/three/src/scenes/Scene.js`) is set to 0.35 by day / 0.12
    at night (`sky.isDark`), never touching `toneMapping`,
    `toneMappingExposure`, or any light intensity — confirmed
    `PMREMGenerator.fromScene` itself saves/restores `renderer.toneMapping`
    around its internal render, so it doesn't clobber the two other
    executors' tone-mapping-dependent re-tint work either.
  - Read `sky.current`/`sky.preset`/`sky.isDark` and `night`'s wiring for
    context but did not edit `src/sky.js` or `src/night.js`. Night intensity
    itself snaps instantly on `sky.setTime()` already (no fade there), so
    the env intensity snapping on regen rather than easing is consistent
    with existing behaviour, not a new inconsistency.
- **Finding 2 (`loadTextureSet` handed out the same Texture instance to
  every caller).** `src/textures.js`: renamed the promise cache to
  `rawCache` (still exactly one fetch/decode per slug — `preloadAll` now
  reads it directly via a new `loadRawSet()` to avoid a pointless
  clone+upload while warming) and made `loadTextureSet(name)` `await` the
  raw set and return `tex.clone()` for each map. Confirmed in
  `node_modules/three/src/textures/Texture.js` that `Texture.copy()` (what
  `clone()` calls) points the clone's `.source` at the same `Source`/image
  (no extra decode or GPU memory for pixel data) and already copies
  `wrapS`/`wrapT`/`anisotropy`/`colorSpace` and sets `needsUpdate = true` —
  so no extra manual bookkeeping was needed beyond calling `.clone()`.
  `metro.js`'s `wireTexture` (mutates `.repeat`, sets `mat.needsUpdate`) and
  `interior.js`'s `texMat` (uses baked metric UVs, expects `repeat=(1,1)`)
  both call `loadTextureSet()` independently and now each get their own
  Texture instances, so metro's `.repeat.set()` on `granite-dark-polished` /
  `steel-brushed` / `concrete-smooth-pale` no longer clobbers interior's copy
  of the same slug. Did not remove metro.js's long comment documenting the
  old limitation — that file is out of the fence — but the bug it describes
  is now fixed from the textures.js side.

Not done / disagreed with: nothing — both findings were implemented as
specified. One judgement call: the brief allowed "every ~10s" as a
regeneration cadence alternative to bucket-change detection; a wall-clock
timer was deliberately not added on top of the bucket-change trigger,
since there is no automatic day/night cycle in this build (time only
advances on `T`) — a timer would just re-render the same unchanged scene
every 10 seconds for no visual benefit, which conflicts with the "do not
make FPS worse" guard rail more than it helps.

## 2026-09-07 — P11-C CORRECTION: live-scene PMREM probe broke startup entirely

The `fromScene(scene3, ...)` approach above was **wrong and has been
reverted**, per an advisor correction after browser verification. Files
touched: `src/main.js` only (same fence as before — `src/textures.js`'s
clone fix from the original pass was verified correct and left untouched).

- **Symptom:** the app never started. Loading overlay showed `Failed to
  start: Cannot read properties of undefined (reading 'value')`, thrown
  from inside the bundled three chunk at
  `this._sceneToCubeUV(scene, near, far, cubeUVRenderTarget, position)` —
  i.e. inside `PMREMGenerator.fromScene` itself, not in this project's code.
- **Root cause:** `fromScene(scene3, ...)` re-renders the *live* scene
  (buildings, sky dome, everything) into PMREM's internal cube render
  target using each object's own material/shader program. This scene has
  several patched/custom materials — `sky.js`'s sky dome, `facades.js`'s
  facade atlas, `metro.js`'s placeholder-map materials — that do unusual
  things with uniforms outside the normal per-frame render path. One of
  those shader programs isn't valid input for PMREM's internal render pass
  and threw reading an undefined uniform's `.value`, taking down the whole
  app at startup — not just the reflection. This was never caught by a
  local build because it's a runtime GPU/shader failure, not a syntax or
  type error; the advisor caught it by loading the built app in a browser.
- **Fix, in `src/main.js`:**
  - Replaced the live-scene probe with
    `pmremGenerator.fromScene(new RoomEnvironment(), 0.04)` (imported from
    `three/addons/environments/RoomEnvironment.js`, already a valid import
    root in this project — `interior.js`/`metro.js` both pull
    `BufferGeometryUtils` from `three/addons/...`). `RoomEnvironment` is a
    tiny throwaway scene of plain built-in materials, so PMREM never
    touches this scene's custom shaders again.
  - The env map is now generated **exactly once, at startup**, inside a
    `try/catch`. On failure, `scene3.environment` is left `null` and a
    `console.warn` is logged — metals fall back to flat lighting instead of
    the whole app failing to start. This was the advisor's explicit
    instruction and is the important lesson from this bug: nothing in
    startup should be able to take the whole app down for a cosmetic
    reflection.
  - Removed the old `regenerateEnvironment()`/`lastEnvBucket` machinery
    entirely — there is no more re-probing, ever, since `RoomEnvironment`
    is fixed and doesn't need to track the sky preset.
  - Day/night response is kept exactly as before, just simplified: a new
    `setEnvironmentIntensity()` sets `scene3.environmentIntensity` to 0.35
    by day / 0.12 at night (`sky.isDark`) and is called once right after
    the initial PMREM build and again from the existing `KeyT` handler.
    Still touches only `environmentIntensity`, never
    `toneMapping`/`toneMappingExposure`/light intensities.
  - No render-target disposal changes were needed beyond what already
    existed: `envRenderTarget` is now built once and never replaced, so the
    old per-regen `prevTarget.dispose()` call is gone (nothing to dispose
    until the app itself tears down). Confirmed `src/main.js` has no
    existing `dispose()`/teardown path for the renderer or scene to hook a
    render-target cleanup into — if one is added later, `envRenderTarget`
    and `pmremGenerator` are the two GPU-owning objects from this feature
    that would need `.dispose()` calls there.
- Not done / disagreed with: nothing — implemented exactly as the advisor's
  correction specified, including preferring `RoomEnvironment` over a
  custom probe scene as instructed.

## 2026-09-07 — P11-J: stationlife (berth/door timing + boarding a train)

Executor: P11-J. Owner this pass: `src/main.js` + new `src/stationlife.js`
only — `src/metro.js`/`src/interior.js` belong to a concurrent executor
building `metro.trains`, `metro.setPlatformDoors(stationName, side, amount01)`
and `interior.setPsdOpen(stationName, side, amount01)` in parallel; none of
the three existed yet when this pass landed, so everything here is
feature-detected (see src/stationlife.js's own header comment).

- **Item 0**: `setEnvironmentIntensity()` (~main.js:307) day value changed
  0.35 -> 0.12 (night value, already 0.12, left alone — so the fill is now
  flat 0.12 day and night). Advisor-measured live: at 0.35 the station
  canopy washed from DMTCL dark green to pale mint and was the brightest
  thing in an aerial view; at 0.12 it reads dark green with nothing in the
  interior going back to black.
- `main.js` imports `createStationLife` from the new `src/stationlife.js`
  and constructs it right after `interior`:
  `createStationLife(scene3, metro, walkable, collision, player, interior)`.
  **Signature deviation from the brief**, documented at the top of
  stationlife.js: the brief's own Item 1 pseudocode omits `interior`, but
  Item 1's door-timing section requires calling `interior.setPsdOpen` — so
  `interior` is passed as a 6th argument rather than silently only driving
  half the door contract.
- Added to `window.__mirpur` as `stationlife` (docs/DEBUG-HOOK.md updated).
- `KeyE` handler: `stationlife.interact(player)` is tried first; only if it
  returns falsy (nothing to board/alight) does `interior.interact(player)`
  run, same as before this pass. Boarding/alighting is time-critical (a
  closing door, a departing train) so it gets first refusal on the key.
- Frame loop: `player.update(dt)` is now skipped entirely while
  `stationlife.state.riding` is true — same no-op pattern the codebase
  already uses for `drive.js` driving (comment at player.update() call
  site) — because `stationlife.update()` drives `player.position`/`feetY`/
  camera by hand every frame while riding and must not race
  `player.update()`'s own walking/gravity/`resolveCollision` path.
  `stationlife.update(dt, player)` runs right after `metro.update(elapsed)`
  (so it sees this frame's fresh train transforms) and its returned line
  takes precedence over `interior.update(dt, player)`'s for the HUD:
  `interactionEl.textContent = stationlifeLine || interior.update(dt, player)`.
  `interior.update()` is still called unconditionally every frame exactly
  as before (gate hints, lift tweens, lazy station-interior builds).

### Dwell timing settled on

`src/metro.js`'s own (unexported) `const DWELL = 6` was read, not guessed,
and duplicated into stationlife.js as `DWELL_ASSUMED` with a comment
explaining the coupling risk (metro.js may not touch this constant this
pass, but a future pass could without updating the copy here):

- 0.0 – 1.2 s: doors open (linear 0->1).
- 1.2 – 3.5 s: held fully open.
- 3.5 – 6.0 s: doors close (linear 1->0), finishing exactly as the 6 s dwell
  ends and the train is scheduled to depart.

1.2 + 2.3 + 2.5 = 6.0 s exactly — it fits with zero slack, so there was
nothing to report as "too short to fit." Independent of that arithmetic
being right, a runtime safety net (`BERTH_MOVING_SPEED` in
stationlife.js) forces a train's doors instantly to 0 the moment its
measured frame-to-frame speed shows it's actually departing (not just
dwell jitter) — so acceptance #2 ("doors must be shut before any train
moves") holds even if `DWELL` ever drifts out of sync with the copy here,
at the cost of losing the "closes exactly on departure" polish (logged
once via `console.warn` if it ever fires).

### State shape (`window.__mirpur.stationlife.state`)

```
{
  riding: boolean,
  rideTrainIndex: number | null,
  boardStation: string | null,
  nextStopName: string | null,
  pendingAlight: { stationName: string } | null,
  hint: string,               // current HUD line, same string returned by update()
  trains: [                   // index-aligned with metro.trains
    { berthed, station, side, phase, doorAmt01, speed }, ...
  ],
  interactables: [...],       // 0-1 entries, shape-matched to interior.js's list
}
```

### Known simplifications (not doorZs-precise)

`trainDoorZs()` (metro.js) isn't exported, so "near a bay" is approximated
as "within `BOARD_RANGE` (3 m) of the platform centreline, anywhere along
the platform length, while that train's doors are >=85% open" rather than
being keyed to the 24 real per-car door positions. Also assumed, undocumented
elsewhere and worth the concurrent executor confirming: platform `side` is
passed to both setters as the same -1/1 value already used throughout
metro.js/interior.js (`buildPlatform(side)`, `buildCore(side)`), derived
from each train's direction (`dir >= 0 ? 1 : -1`).

## P11-K — stationlife consumes metro's exports (2026-09-07, advisor-written)

`src/stationlife.js` no longer derives stop order from `metro.stations`
array indices (which are in scene-file order and skipped Mirpur 11
entirely on every northbound ride) and no longer duplicates `DWELL`.
It now imports `stationOrder` and `DWELL` from `src/metro.js`.

Advisor-verified live, full loop: board at Mirpur 10 (side +1) ->
"On board — next stop Mirpur 11" -> stops announced in geographic order ->
"E: get off at <station>" -> alight leaves the player at feetY 14.5 with
`supportHeightAt` returning 14.5 under them. Perf at Mirpur 10 after the
2 -> 6 train change: ~24 fps, 152 draws, 911k tris.
