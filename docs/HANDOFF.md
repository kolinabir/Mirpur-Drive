# Mirpur 3D: project handoff

Last updated: 2026-09-07 19:10 (PAUSED AGAIN — read docs/PAUSE-STATE.md first, then docs/REVIEW-2026-09-07.md)

Read this first if you are a new assistant or a new session picking up the
work. Everything needed to continue is in this repository; nothing lives only
in a chat history.

## What this is

A walkable 3D reconstruction of the Mirpur 10 to Mirpur 11 corridor in Dhaka,
Bangladesh, along MRT Line 6. Runs in the browser with Three.js and Vite.
Desktop (Mac/PC) is planned via Electron or Tauri wrapping the same build.

Owner goal, in their words: buildings, roads and especially the metro should
look like the real place. "Tier 1" scope was agreed: real street layout and
building footprints from OpenStreetMap, procedural facades, hand-modelled
metro. Photogrammetry of real facades ("Tier 2/3") needs someone on site with
a camera and is out of scope until the owner supplies photos.

## Working arrangement the owner asked for

- Opus / Fable model acts as **advisor**: diagnoses, writes briefs, reviews.
- Sonnet model acts as **executor**: makes the code changes, verifies in the
  browser with screenshots, reports back.
- Every finding and decision must be written into this repo (docs/) so the
  project survives a session or account ending mid-task.

## How to run

```bash
cd mirpur3d   # the repository root
npm install
npm run data     # only if data/mirpur.osm.json changed; rewrites public/scene.json
npx vite --port 5183 --strictPort
```

Open http://localhost:5183. Build takes ~20 s in the browser. Click "Enter the
street". Keys: WASD move, Shift run, F fly, Space/C up/down, 1 Mirpur 10,
2 Mirpur 11, 3 platform, 4 aerial, T time of day, M map, H help.

## Layout

| Path | Purpose |
|---|---|
| `data/mirpur.osm.json` | Raw Overpass dump, bbox 23.8035,90.3600 to 23.8240,90.3740 |
| `data/query.overpassql` | The Overpass query used |
| `tools/build-scene.mjs` | OSM to `public/scene.json`: projection, height inference, road widths |
| `public/scene.json` | Compact scene: 14,462 buildings, 768 roads, metro tracks, 2 stations |
| `src/main.js` | Boot, loading, HUD, key bindings, frame loop |
| `src/city.js` | Building extrusion into 200 m tiles, rooftop props, collision grid |
| `src/facades.js` | Procedural facade atlas (being switched to real textures) |
| `src/streets.js` | Ground, roads, footpaths, medians, streetlights, poles, cables |
| `src/metro.js` | Viaduct, piers, stations, trains (needs rebuild, see below) |
| `src/traffic.js` | Rickshaws, CNGs, cars, buses, bikes, pedestrians on the road graph |
| `src/signs.js` | Station name boards and Bangla shop signage |
| `src/sky.js` | Sky dome shader, sun, haze, five times of day |
| `src/player.js` | First-person walk and fly controller |
| `src/minimap.js` | 2D overview |
| `src/night.js` | Night lighting, UNFINISHED (agent stopped by owner) |
| `src/textures.js` | Loader for the CC0 texture set |
| `public/textures/` | CC0 photographic textures with MANIFEST.json and LICENSES.md |
| `reference/metro/` | Photos (CC licensed, credited) and SPEC.md for the metro |
| `docs/PAUSE-STATE.md` | Where each agent stopped when work was paused |
| `docs/RESUME-PROMPT.md` | The prompt to paste into a fresh session to continue |
| `docs/NEXT-PASS-METRO.md` | Acceptance criteria for the metro rebuild |
| `docs/WALKABLE-INTERIOR-DESIGN.md` | How to make stations walkable (floors, stairs, lifts, gates) |
| `reference/README.md` | What the reference folders are and the no-shipping rule |
| `screenshots/` | Verification captures |

Coordinate frame: metres, origin at lat 23.8137 lon 90.3668, +X east, +Z
south. Mirpur 10 station is at about (149, 594), Mirpur 11 at (-155, -601).

## Key technical facts

- Buildings are unique geometry, so they are merged per tile, not instanced.
  Facade variety comes from a 4x4 texture atlas with UVs baked per building.
- Only 506 of 14,738 OSM buildings had a storey count; the rest are inferred
  by building tag, footprint area and arterial frontage (see build-scene.mjs).
- Face winding bug was fixed once already: quads in city.js, streets.js,
  metro.js and signs.js use index order (0,2,1),(0,3,2). Keep that.
- The canvas can get pinned to 0x0 if the page lays out after script start;
  main.js has a ResizeObserver-driven resize() for that. Keep it.
- The loader yields with setTimeout, not requestAnimationFrame, because
  hidden tabs throttle rAF and stall the build.
- Google Photorealistic 3D Tiles do not cover Bangladesh; that is why no
  photogrammetry source exists for this area.

## Pass 0 (2026-09-07 afternoon): stabilise and verify, then interiors

Advisor review on resume is in docs/REVIEW-2026-09-07.md. Key finding: the
four metro-*.jpg screenshots were identical start frames, so the metro
rebuild had never been reviewed; the road surface has a pastel-blob
regression; interiors were started in parallel because they only depend on
METRO constants. Three Sonnet executors were launched with exclusive file
fences (briefs in docs/briefs/):

| Executor | Files | Output docs |
|---|---|---|
| E1 road | src/streets.js | docs/ROAD-PASS.md, screenshots/p0-road-*.jpg |
| E2 metro | src/metro.js, src/signs.js | docs/METRO-REVIEW.md, screenshots/metro-*.jpg (replaced) |
| E3 interior | src/player.js, src/main.js, src/interior.js (new) | docs/DEBUG-HOOK.md, docs/INTERIOR-PASS.md, screenshots/p0-int-*.jpg |
| E4 corridor cull | src/city.js | docs/CORRIDOR-CULL.md |
| E5 drivable car | src/drive.js (new), index.html | docs/DRIVE.md, screenshots/p0-drive-*.jpg |
| E4b footprint clip | src/city.js (after E4) | docs/CORRIDOR-CULL.md appended |
| E2b metro to owner photos | metro.js, signs.js | docs/METRO-REVIEW.md appended |
| E6 data cull (Pass 1) | tools/build-scene.mjs, public/scene.json | docs/DATA-CULL.md |
| E7 texture sourcing (done) | public/textures | docs/TEXTURES-METRO.md |
| P1-B/B2 LOD (done) | city.js | docs/LOD-PASS.md |
| P1-C streets audit (done) | none | docs/DRAWCALLS.md |
| P2-E8 north map data | tools/build-scene.mjs, data/north.osm.json, public/scene-north.json | docs/NORTH-DATA.md |
| P2-STREAMING | city.js | docs/STREAMING.md |
| E3b interior resume | player.js, main.js, interior.js, walkable.js | docs/INTERIOR-PASS.md |
| E1b poles out of road | src/streets.js (launched 15:05) | docs/ROAD-PASS.md appended |

Owner live feedback logged in docs/OWNER-FEEDBACK-2026-09-07.md.
Owner decided the playable area: 400 m each side of the metro (docs/DECISION-PLAYABLE-AREA.md). Pass 1 plan in docs/briefs/P1-PERF-BOUNDARY.md, queued behind Pass 0.

Owner photos of Mirpur 10 transcribed in reference/metro/OWNER-PHOTOS-2026-09-07.md (wins over the SPECs).
The running E2/E3 could not be told about it mid-task (messaging disabled), so a
follow-up pass must apply those corrections to metro.js and interior.js.
Owner also asked for a drivable car (E5, Drive button / V key).

If you are resuming and those docs exist, read them; if a doc is missing the
executor died before writing it, so check the file mtimes in src/ and the
screenshots md5s before trusting anything. Next after Pass 0: reconcile E3's
interior footprints with E2's final station geometry, then the performance
pass.

## State of work (update this section as you go)

Done:
- Data pipeline, city, streets, traffic, sky, player, HUD, minimap all run.
- Winding fix: buildings and signs render correctly.
- Start position moved south of Mirpur 10 on the footpath (not under the box).
- Undersides lit via hemisphere ground colour and ambient fill.
- Real CC0 textures collected (10 materials, ambientCG, 12 MB) in
  public/textures with MANIFEST.json; loader in src/textures.js; facade
  atlas now composites photographic plaster/concrete/brick under the
  procedural windows (verified in screenshots/textures.jpg).

- Metro reference dossier done: 37 CC-licensed photos (23 MB) in
  reference/metro/photos with CREDITS.md, and reference/metro/SPEC.md. The
  SPEC's ADDENDUM section (photo-verified) overrides its estimates: brick
  clad concourse, DMTCL green not teal, half-height screen doors, green
  barrel-vault entrance canopies, silver/green/red train livery, OCS gantries.

- Fix pass (stopped early, work kept): pier spacing 32 m, narrower
  concourse, merged station geometry, kerbs on arterials, lighter asphalt,
  key handling without pointer lock, start position moved. Screenshots in
  screenshots/street.jpg and aerial.jpg predate the metro rebuild.

In progress (Sonnet executor running when this was written):
1. METRO REBUILD to reference/metro/SPEC.md ADDENDUM and the photos, per
   docs/NEXT-PASS-METRO.md. Rewrites src/metro.js, edits streets.js (road
   generated from the metro centreline), signs.js (white pill boards, DMTCL
   green, logo). Output screenshots: screenshots/metro-*.jpg.
2. NIGHT LIGHTING: STOPPED BY THE OWNER partway through. src/night.js
   exists and traffic.js already has head/taillight parts; sky.js may be
   partly edited. Verify it loads and either finish or revert before
   relying on it. Do not restart it without the owner asking.
- Interior research DONE: 30 CC photos in reference/metro/interior/photos
  (from Uttara North, Agargaon, Pallabi and DU stations, which share the same
  DMTCL fit-out kit; no CC interior photos of Mirpur 10/11 exist) plus
  reference/metro/interior/SPEC-INTERIOR.md with dimensioned plans. Its
  ADVISOR ADDENDUM (photos i08, i29) corrects the entrance sign design,
  entrance geometry and placement, and adds the train interior.

Next (in order):
1. WALKABLE STATION INTERIORS. Design is written up in
   docs/WALKABLE-INTERIOR-DESIGN.md; content spec comes from
   reference/metro/interior/SPEC-INTERIOR.md. The blocker is that
   src/player.js pins the walking camera to a constant eye height
   (`this.position.y = EYE_HEIGHT + bob`), so there are no floors. The design
   adds a small walkable-surface registry (slabs + ramps + lift portals), a
   support query, gravity, interior collision walls, moving escalators, and
   ticket-gate triggers. Acceptance: walk street -> entrance -> concourse ->
   buy ticket -> gate -> platform -> lift -> street, no flying, no clipping.
2. Wire the real textures into roads, footpaths and viaduct concrete.
3. Performance pass: target under 250 draw calls and 60 fps.
4. Desktop packaging with Electron or Tauri.

### 2026-09-07: P11-F station crowds (src/traffic.js only)

Per docs/briefs/P11-F-STATION-CROWDS.md: `buildPedestrians` previously
seeded every agent onto a road route at y=0, so the concourse (8.0 m) and
platform (14.5 m) decks of both stations were empty. Added a second class
of agent, "station agents", built by a new `buildStationAgents(scene, rnd)`
helper and rendered through the SAME `bodies`/`heads` InstancedMeshes as the
street crowd (instance count grows to fit both populations; no extra draw
calls) with their own update branch — they never touch
`separateAgents`/`recycleAgents`/`applyPlayerAvoidance`, all of which assume
a road route and would otherwise interact street peds/vehicles with people
8-14.5 m overhead, or treat them as player-collidable, which the brief
explicitly rules out.

- Per station: 16 concourse agents wandering along local Z (the concourse's
  long axis) with standing pauses, kept off the TVM bank footprint (local X
  in roughly [-7,-1], Z in roughly [-26,-18]) and not made to loiter
  standing on the AFC gate line (Z=-6) — walking through it is fine, per
  the brief; plus 12+12 platform agents per side, loitering near the
  track-side edge in a small shuffle (not a full-length pace), facing the
  track. 40 agents/station total, matching the brief's budget.
- Y comes from `METRO.CONCOURSE_Y`/`METRO.DECK_Y`, never 0 — every station
  agent gets a real deck-height matrix once at build time (not just on the
  first frame it happens to be near the player), so no instance ever
  defaults to the identity matrix (y=0, i.e. sitting in the road under the
  station).
- Local-to-world transform is exactly the brief's formula
  (`x = st.x + lx*cos(h) + lz*sin(h)`, `z = st.z - lx*sin(h) + lz*cos(h)`),
  verified against the same transform metro.js itself uses to place station
  entrances.
- Heading: `scene.metro.stations` as received by `buildPedestrians` is the
  raw scene-JSON list (`{name, x, z}`, no heading) — `buildMetro()` computes
  a heading per station but only on its own returned `stations` array, not
  written back onto `scene.metro.stations`. `buildStationAgents` re-derives
  it the same way metro.js does: nearest segment of the track centreline,
  via metro.js's exported `centreAlignment(scene.metro.tracks)`. Falls back
  to heading 0 with a console warning if `scene.metro.tracks` is ever empty
  (not observed on either scene.json or scene-north.json — both have real
  tracks).
- Perf: stations more than 300 m from the player are skipped in `update()`
  entirely (state machine + matrix write), so up to 4 stations x 40 agents
  doesn't run every frame regardless of where the player stands. Verified
  the file still bundles cleanly (esbuild) but did NOT run the dev server
  or verify FPS/visuals live — that's the advisor's pass per the brief.

Nothing needed changing in metro.js, main.js, interior.js, textures.js or
signs.js; only `src/traffic.js` and this file were touched.

## P11-L (2026-09-07): night streetlights were lighting the ground from below

Owner report: "Night street light has issues, doesn't look good." Root cause
measured live by the advisor and fixed per
docs/briefs/P11-L-NIGHT-STREETLIGHTS.md — only `src/night.js` touched.

Root cause: `findLampWorldPositions()` read each lamp-head instance's world
position with `setFromMatrixPosition`, but streets.js bakes each lamp's
height into the geometry itself (`geometry.translate(x, y, z)` applied
before the per-instance transform), not into the instance matrix. So every
extracted position came back with y=0: the 34-unit additive glow `Points`
rendered as smears lying on the road, and `reassignLights()`'s
`p.y - 1.2` put all 24 real point lights at y=-1.2, underground — the
street itself stayed pitch black.

Fix (`findLampWorldPositions` in src/night.js):
1. For each candidate InstancedMesh, read the geometry's own
   `boundingBox` centre Y and add it to the XZ position
   `setFromMatrixPosition` already gets right. A Y-axis-only instance
   rotation (all these poles use) never changes a point's Y, so this
   recovers the true world head height without hardcoding 9.0 or any other
   constant — it's read straight from the geometry, so it survives streets.js
   changing the baked height later.
2. Second finding while measuring: the head detector's size window
   (`x 0.4-1.2, y 0.08-0.4, z 0.15-0.6`) only matched the cobra-head lamp
   family (2716 instances, head box ~0.72x0.2x0.34 @ y~8.9) and stopped at
   the first InstancedMesh match. `street-furniture` also carries a second,
   larger population of plain utility/power poles (5766 instances) whose
   crossarm (~1.5x0.1x0.1 @ y~7.6) failed that window on both `x` and `z` —
   so two thirds of the 8482 total lamps got no glow and no light at all.
   Widened the window to `x 0.4-1.6, y 0.08-0.4, z 0.08-0.6` and now collect
   *every* matching InstancedMesh instead of stopping at the first, pooling
   all their instance positions. There are only 5 InstancedMeshes under
   `street-furniture` (2 pole shafts + these 3 arm/head boxes, verified by
   reading `buildStreetFurniture` in streets.js), so the wider window can't
   pull in benches/bollards/signboards — none live in that group.
   Note for the advisor: this second family has no distinct lamp-fixture
   mesh in streets.js, only a bare crossarm (it's a power pole, not a
   cobra-head streetlight) — the crossarm position is used as the light
   position per the brief's instruction, but that means what glows there is
   literally the crossarm, not a lamp fixture. Worth a look to confirm that
   reads acceptably at night rather than as "the power line glows."
3. Retuned intensity/pools now that lights land above ground (all in
   src/night.js, values only — reasoning in the inline comments):
   - `LIGHT_RADIUS` 28 -> 16, `LIGHT_INTENSITY` 35 -> 7. Both old values
     were chosen while every light was buried and literally never seen lit;
     at real head height with ~30-40 m lamp spacing they read as a
     uniformly floodlit street rather than pooled light.
   - Ground pool `CircleGeometry` radius 7 -> 5, to keep visible dark gaps
     between neighbouring pools now that there are 8482 of them instead of
     2716, and so the additive pool doesn't double up with the real point
     light's own illuminated patch as much.
   - Glow `PointsMaterial` size 34 -> 16 — 34 was sized to read as
     *something* through a smear sitting in road clutter; at true head
     height it looked oversized relative to the fixture.
   **This item is a first-pass, reasoned guess — I could not verify it
   visually (browser preview tools are off-limits this pass). Please
   eyeball it live and tell me if it needs another round.**

Also seen at night, out of scope for this file (reported per the brief, not
fixed):
- The cloud layer (`src/sky.js`) renders bright grey at night as if still
  lit by day.
- The minimap (`src/minimap.js`) stays a bright white daytime map at night,
  which hurts dark adaptation.

## Known open issues seen in owner screenshots

- Viaduct reads as a black solid lid on the road; girder cross-section is
  stepped instead of a trapezoidal box; pier is a plain box.
- Pier lands at the road edge because OSM road centreline and metro
  alignment are offset by a few metres.
- Station canopy ribs rotated 90 degrees and oversized; canopy surface
  missing; platform floor incomplete.
- Grey wall at the horizon from sky/fog colour mismatch.

## Licences

Map data: OpenStreetMap contributors, ODbL. Textures: CC0 (see
public/textures/LICENSES.md). Reference photos: CC BY / CC BY-SA, credited in
reference/metro/photos/CREDITS.md; they are reference only, not shipped.

## 2026-09-07 — Cloud material no longer glows white at night (P11-M)

`buildClouds()` in `src/sky.js` built ONE `MeshBasicMaterial` at full
daylight white (`opacity: 0.72`) and `setTime()` re-tinted every other sky
element for the time of day but never touched it, so clouds stayed
daylight-white at midnight — the brightest thing above the skyline in a
night screenshot, since `MeshBasicMaterial` is unlit and no scene lighting
change could ever fix that.

Fix, scoped entirely to `src/sky.js`:
- Each entry in `TIMES_OF_DAY` now carries its own `cloudColor` /
  `cloudOpacity`. Chosen values:
  - `morning`: `0xfff8ec` @ `0.72`
  - `midday`: `0xffffff` @ `0.72` — identical to the old hardcoded default,
    so daylight is pixel-for-pixel unchanged.
  - `afternoon`: `0xffe6bd` @ `0.72`
  - `dusk`: `0xdb8f5c` @ `0.58` — picks up the warm horizon tint instead of
    staying neutral white.
  - `night`: `0x2f3850` @ `0.5` — a dim, desaturated blue-grey, a touch
    lighter than the dome's own top colour (`0x141c2c`) so clouds still
    read as cloud against the night sky rather than a black hole.
- Added `cloudLookFor(preset)`: if a preset defines `cloudColor` it uses
  that (falling back to `cloudOpacity ?? 0.72`); otherwise it derives a
  colour from that preset's own `horizon`/`haze` lerped toward white, so a
  future time-of-day entry gets a sensible cloud tint automatically instead
  of inheriting daylight white by omission.
- `setTime()` now calls `cloudLookFor()` and writes the result into the
  existing cloud material's `color`/`opacity` every call — still ONE
  material, ONE canvas texture, ONE `InstancedMesh`, ONE draw call. The
  puff texture itself is untouched (pure white with alpha falloff);
  `MeshBasicMaterial` multiplies texture by `color`, so tinting is free.
- Left `fog: false` on the cloud material. The scene fog is tuned to grey
  out the skyline at a much closer distance than where these clouds sit
  (e.g. night fog far is 450 vs. clouds spread 380–2480 out); fogging them
  would wash them back toward the fog colour and fight the new per-preset
  tint rather than let it read cleanly against the dome.

Verified `node --check` on the file (syntax only) and did not run the dev
server — the advisor verifies live per the brief. Only `src/sky.js` and
this file were touched; `src/night.js`, `src/minimap.js`, `src/signs.js`,
`tools/build-scene.mjs` and `public/scene*.json` are untouched.

## 2026-09-07 — Night lamp look retune, per live A/B measurements (P11-O)

Follow-up to P11-L: the structural fix (glow points at real head heights,
zero lights underground) was correct and is untouched. This pass only
retunes look values in `src/night.js`, all per the advisor's live
measurements in `docs/briefs/P11-O-NIGHT-RETUNE.md`.

1. **Glow sprite size 16 → 2.6.** `glowMat` is a `PointsMaterial` with
   `sizeAttenuation: true`, so `size` is world metres, not pixels. At 16 m
   per lamp the heads were overlapping orbs floating above the skyline.
   2.6 gives each head a tidy, contained halo. (16 was itself a retune from
   P11-L's 34, which was tuned for the old buried-at-y=0 position — that
   whole chain of numbers was compensating for the wrong root cause each
   time; 2.6 is the first one measured against the corrected head height.)

2. **Ground pool height 0.05 → 0.25.** Checked against `streets.js`'s `Y`
   stacking table rather than trusting the number blindly: road/paving
   surfaces top out at `Y.median = 0.16`, so 0.05 sat under literally every
   drivable/walkable surface and the pools were fully hidden. 0.25 clears
   all of them with margin (smallest gap ~0.09 m, above `Y.median`) while
   staying under the one thing taller nearby — the 0.27 m kerb top
   (`Y.major + 0.15` kerb height) that runs along arterial roads — so the
   pool doesn't visibly float past the kerb edge from a low, street-level
   view.

3. **Cut the 24 dynamic `PointLight`s entirely (option b).** The advisor
   isolated their contribution live: with pools hidden and the lights
   pushed to intensity 30 / distance 26 (well above shipped 7 / 16), the
   lit patch on the road disappeared completely — all visible road
   lighting was coming from the additive pool circles and the glow
   sprites, not the real lights. Shipped at 7 / 16 they were strictly worse
   than that already-invisible ceiling: full per-fragment cost for zero
   visible contribution. Went with (b) over (a) because raising them to a
   visible level would double up with pools/glow that already carry the
   whole look on their own (inviting a "trim the pools instead" fight
   between two systems doing the same job), and because the cost is real:
   24 forward-rendered `PointLight`s each add a per-fragment lighting term
   for every fragment inside their radius, on a scene that is already
   rasterizing ~30k buildings — removing them is a straight, guaranteed
   frame-rate win with a visual difference the advisor already confirmed
   is not perceptible. I did not personally capture an FPS number for
   this — this session has no browser access per the brief's constraints,
   and the advisor does the live verification — so the before/after FPS
   delta from this removal still needs the advisor's confirmation to close
   out acceptance criterion 3, but the removal itself required no visual
   trade-off since the lights were confirmed invisible even far above
   their shipped setting. `dynamicLights`, `reassignLights()`,
   `MAX_DYNAMIC_LIGHTS`, `LIGHT_REASSIGN_INTERVAL`, `LIGHT_RADIUS`, and
   `LIGHT_INTENSITY` are removed from `src/night.js`; `LIGHT_COLOR` is kept
   since the pools/glow sprites still use it.

4. **Utility/power poles (5766-instance family) dropped from the glow
   set — cobra-heads only.** This corrects P11-L's brief, which inferred
   these were street lamps from bounding-box size alone. Reading
   `streets.js` directly (`buildStreetFurniture()`) confirms the family is
   a plain concrete power pole with a bare crossarm (`BoxGeometry(1.5, 0.1,
   0.1)` at y≈7.6) and no separate lamp-fixture mesh at all — there is
   nothing on that pole that is a luminaire. Even at the much smaller 2.6 m
   sprite size, lighting it is still lighting a crossarm/cable support, not
   a lamp, and Dhaka utility poles of this kind don't carry pole-top
   lights, so it reads as wrong rather than merely stylized. Judgement
   call: dropped it. `findLampWorldPositions()`'s size window in
   `src/night.js` is narrowed from `x∈(0.4,1.6), z∈(0.08,0.6)` to
   `x∈(0.4,1.2), z∈(0.2,0.6)`, which isolates the cobra-head's `0.72 x 0.2
   x 0.34` head box and rejects both the cobra-head's own arm (`1.9 x 0.11
   x 0.11`) and the utility crossarm (`1.5 x 0.1 x 0.1`) — verified against
   the exact `BoxGeometry` calls in `streets.js`. Only the 2716 cobra-heads
   are now lit; the pool radius comment in `night.js` was updated to note
   the wider effective lamp spacing this leaves.

Net effect on `src/night.js`: fewer per-frame allocations too (no more
`withDist` distance-sort array rebuilt every `LIGHT_REASSIGN_INTERVAL`),
on top of the light removal.

Verified `node --check --input-type=module` on the file (syntax only). Did
not run the dev server or touch the browser preview per the brief's
constraints — the advisor verifies live. Only `src/night.js` and this file
were touched; `src/signs.js`, `tools/build-scene.mjs` and
`public/scene*.json` are untouched, per another session's concurrent work
there.

## Pass 12 (2026-09-08): the Bijoy Sarani district and the Parliament

The map is no longer one place. `src/districts.js` holds a registry of
DISTRICTS, each with its own scene file and its own stretch of MRT Line 6,
and the metro carries the player between them.

| District | Scene | Stations | Why |
|---|---|---|---|
| `north` (default) | `scene-north.json` | Mirpur 10, 11, Pallabi, Uttara South | the existing map, unchanged |
| `bijoy` | `scene-bijoy.json` | Agargaon, Bijoy Sarani, Farmgate | Jatiya Sangsad Bhaban |
| `old` | `scene.json` | Mirpur 10, 11 | the original fallback |

Owner asked for this on 2026-09-08: "after mirpur 10 it'll teleport someone
to bijor sarani! so we can show parlament house! ... it'll open a popup like
wanna go to bijor sarani? you cant visit kazipara shawapara".

- `docs/BIJOY-DATA.md` — the Overpass extract, the build command, the two
  `build-scene.mjs` changes it needed, and what is still missing (no
  satellite heights for this extract yet).
- `docs/BIJOY-DISTRICT.md` — the runtime wiring (P12-A and P12-B).
- `src/sangsad.js` — the hand-modelled National Parliament House. Its header
  states exactly which parts are measured OSM data (the 177-point ring, its
  14 light courts, the chamber block) and which are architectural
  interpretation (heights, the arrangement of the screen-wall openings).
- `npm run smoke` — headless check that the Parliament still builds without
  NaN vertices or a failed geometry merge.
- `npm run data:bijoy` — rebuilds `public/scene-bijoy.json` from the extract.

Two things deliberately NOT done, so nobody "fixes" them by accident:

1. **The district swap is a page reload**, not a live scene swap. main.js
   builds the world once and eight modules close over that one `scene`
   object; there is no teardown path. The loading screen is the journey.
   See the module comment in `src/districts.js`.
2. **The through-service gate is on the platform, not mid-ride.** `metro.js`
   walks every train through one ascending stop order, so the chronological
   sequence is one-directional and there is no southbound service that
   berths at Mirpur 10. Offering the jump from the platform gives the owner
   what they asked for without rebuilding the train simulation.

## Pass 13-B (2026-09-08): platform height rebase to train floor

Rebased elevated platform floor level from structural `DECK_Y` (14.50 m) to
`PLATFORM_Y = DECK_Y + TRAIN_Y_OFFSET + TRAIN_FLOOR_LOCAL_Y` (15.48 m) so the
platform floor is flush with the passenger saloon floor of berthed trains.

- `docs/PLATFORM-HEIGHT.md` — full before/after measurements, clearances, and
  ramp regrade formulas.
- `src/metro.js` exports `PLATFORM_Y`, `TRAIN_Y_OFFSET`, and
  `TRAIN_FLOOR_LOCAL_Y`. `PLATFORM_FLOOR_Y = PLATFORM_Y`.
- `src/traininterior.js` imports `TRAIN_FLOOR_LOCAL_Y`.
- `src/interior.js` regrades concourse-to-platform ramp with `RUN_PLATFORM = 6.5`
  (13 m run, 29.9° gradient matching escalator pitch) and rebases platform
  walkable slab, PSD collision barriers, lift platform bridge & stops, and
  signage to `METRO.PLATFORM_Y`.
- `src/traffic.js` platform pedestrians stand at `y: METRO.PLATFORM_Y`.
- `src/stationlife.js` sets `player.feetY = METRO.PLATFORM_Y` on alighting.
- `src/main.js` arrival teleport and Digit3 preset rebased to `METRO.PLATFORM_Y`.

## Pass 13-C (2026-09-08): Start Card & HUD Copy + Living World Traffic / Arterial Pedestrians

- **Start Card & HUD Copy**:
  - In `index.html`: updated static `#start .sub` and `#quick-travel` ordering to Pallabi, Mirpur 11, Mirpur 10, and Uttara South.
  - In `src/main.js`: dynamically set `#start h1`, `#start .sub`, and `#topbar .title` based on active district (`north`, `bijoy`, `old`). Set loading screen title and progress messages to state the active district name and stations.
  - In `src/districts.js`: updated `loadingLabel` for `north` and `bijoy`.
- **Traffic & Pedestrians on Expanded Maps**:
  - Fleet sizing: increased fleet in `src/traffic.js` to 160 rickshaws, 80 CNGs, 70 cars, 32 buses, 80 bikes (total 422 vehicles) and 750 pedestrians, with `MAX_VEHICLES_NEAR = 60` and `MAX_PEDS_NEAR = 95`.
  - Metro corridor dual carriageways ($\pm 6.75\text{ m}$, width $10.5\text{ m}$, rank 4) injected into `buildRoutes` while OSM roads within 15 m of `metroCentre` are split away, matching `streets.js`.
  - Corridor footpaths ($\pm 13.5\text{ m}$, width $3.0\text{ m}$, rank 3) injected into `buildPedestrians`.
  - Multi-cell route indexing & `closestDistAlongRoute`: long routes (> 180 m) are registered in all traversed cells, enabling vehicle recycling along the full 4.2 km corridor, Manik Mia Ave, and Airport Rd.
  - Corner tangent blending & lane offset easing: quadratic Bezier filleting and `cornerEase` lane offset scaling in `sampleRoute()` prevent tangent snapping and eliminate corner clipping on footpaths.
  - Elevated player proxy: elevated players (platform/concourse $y > 4.5\text{ m}$) maintain live recycling of ground traffic and pedestrians below without triggering ground-level collision pushes.
## Pass 13-D (2026-09-08): Mathematical 50m Map Zoom & Scale Calibration

Corrected scale bar and coordinate transform calculations across the HUD radar minimap and the full pause map to ensure mathematically exact 50 m minimum and default zoom:

- **Minimap Geometry Calibration (`src/map/minimap-view.js`)**:
  - In `draw()`: changed `destPxPerMetre = size / (2 * this.miniRadiusM)` to `destPxPerMetre = R / this.miniRadiusM` where $R = \text{size}/2 - 4$ is the inner radius of the circular radar bezel. Previously, using the full canvas bounding box `size / 2` mapped 50 m outside the bezel, truncating the visible radius to 47.9 m. Now points 50.0 m away land precisely on the outer circular bezel line.
- **Minimap On-Foot Speed Gating (`src/minimap.js`)**:
  - Gated speed-adaptive zoom expansion with `DRIVE_SPEED_THRESHOLD = 8.0 m/s`. Walking (3.1 m/s) and sprinting (7.4 m/s) remain strictly locked to 50.0 m radius with zero drift. Only vehicle driving speeds (8.0 to 24.0 m/s) expand the radar view smoothly up to 140 m.
- **Full Map Scale Bar CSS & Retina DPR Alignment (`src/map/fullmap-view.js`)**:
  - In `_updateScaleBar()`: calculated `cssScale = rect.width / this.canvas.width` and `cssPxPerMetre = (1 / this.mpp) * cssScale`. Previously, canvas buffer pixels were assigned directly to the HTML `#map-scale-bar` element width in CSS pixels, causing the scale bar on Retina displays (DPR = 2) to render twice as wide as 50 m of actual map geometry.
  - Set scale bar minimum distance step to 50 m (`nice = [50, 100, 200, 250, 500, ...]`).
- **Full Map 50m Default & Minimum Zoom (`src/map/fullmap-view.js`, `src/minimap.js`)**:
  - Added `setDefault50m(playerPos)` which sets default view centered on player at `targetMpp = cssScale / 1.6` (producing an ~80 px scale bar labeled "50 m") and locks `this.minMpp = targetMpp`.
  - In `src/minimap.js`: opening the full map (`setExpanded(true)`) invokes `this.fullView.setDefault50m(this._lastPos)` instead of zooming out to the entire city (`fitFull(false)`). The `[Fit]` button remains available to zoom out to the whole corridor.

## Pass 13-E (2026-09-08): High-Visibility Player Marker & Offscreen Radar Beacon

Addressed difficulty locating the player on the map by significantly enlarging the player marker, adding pulsing sonar ripples and a "YOU" badge, plus an offscreen edge beacon on the full map:

- **Full Map Player Marker (`src/map/fullmap-view.js`)**:
  - Enlarged player chevron from fixed $r = 10\text{ px}$ to dynamic $r \ge 18-28\text{ px}$ with dual-tone styling: `#020617` silhouette outline, vibrant `#00f0ff` neon cyan fill, and `#ffffff` inner directional spine.
  - Added dual expanding sonar ripples (`rgba(56, 189, 248, ...)`) that pulse outward continuously to draw immediate eye focus.
  - Added a dark backing disc with glowing cyan border and shadow blur.
  - Added a high-contrast `[ YOU ]` pill badge directly above the player arrow.
  - Reordered layer rendering so the player marker and `YOU` badge render as step 7 on top of all station blips, road labels, and place tags, preventing occlusion.
- **Offscreen Player Beacon (`src/map/fullmap-view.js`)**:
  - Added `_drawOffscreenPlayer()`: when the player position is panned offscreen, a glowing radar beacon clamps to the viewport edge pointing towards the player with an interactive `YOU • [distance]` pill. Clicking the beacon or pressing `R` recenters the view back onto the player.
## Pass 13-F (2026-09-08): Inter-District Teleportation Auto-Load

Enabled seamless cross-district teleportation from the full interactive map and waypoints with automatic scene loading:

- **District Detection & Stations Registry (`src/districts.js`)**:
  - Exported `ALL_DISTRICT_STATIONS` and `findStationNear(x, z, tolerance = 150)`.
  - Added `districtForCoord(x, z)`: determines whether a destination coordinate belongs to `north` ($Z < 2500$) or `bijoy` ($Z \ge 2500$).
  - Upgraded `resolveDistrict()` to parse `teleportX` (`x`), `teleportZ` (`z`), and `teleportY` (`y`) query parameters.
  - Extended `travelTo(districtKey, arriveStation, teleportCoords)` to set either `?arrive=StationName` or `?x=...&z=...`.
- **Auto-Load Scene Loading (`src/main.js`)**:
  - In `minimap.onTeleport(x, z, name)`: checks if the target coordinate is in another district. If so, resolves station or coordinates and calls `travelTo(targetDistrictKey, arriveSt, { x, z })`, triggering the smooth loading screen and booting the target district's full 3D scene (avoiding the empty void fall).
  - In SPAWN resolution: added priority branch for `teleportX` and `teleportZ`, dropping the player directly at destination coordinates with `interior.update(0, player)` settling walkable surfaces.
  - In Start Card: updated `#begin` button to display `Enter [Destination / District]` on arrival.
- **Interactive Map Waypoint & Controls (`src/map/fullmap-view.js`, `src/minimap.js`)**:
  - Waypoint card dynamically detects cross-district waypoints and presents `⚡ Travel (T)` button.
  - Clicking `[⚡ Travel / Teleport]`, pressing <kbd>T</kbd>, clicking `#map-teleport`, or Shift+Clicking anywhere on the map forwards the target name and coordinates to `minimap.onTeleport`, automatically loading the target district.

## Pass 13-G (2026-09-08): Full Road Network Playable Boundary & District Warning Calibration

Eliminated premature "Turn back: leaving Mirpur" boundary warnings and car steering push-backs on modelled streets:

- **Root Cause**:
  - Previously, `buildBoundarySegments` only considered MRT tracks and 18 hardcoded way IDs (`extraCorridorWayIds`). Over 423 of the 1,545 roads in `scene-north.json` (such as Kalshi Road, Ceramic Avenue/Mirpur Ceramic Road, Darus Salam Road, Mazar Road, Mirpur 2, Mirpur 14, and areas around Commerce College and Buddhijibi) and roads in Bijoy Sarani were farther than 380 m from the metro line, causing the HUD to trigger "Turn back: leaving Mirpur" and hijacking car steering.
- **Full Road & Area Coverage (`src/main.js`)**:
  - Updated `buildBoundarySegments(scene, district)` to ingest all `scene.roads`, `scene.metro.tracks`, `scene.areas` (parks, playgrounds, water bodies, cemeteries), and `district.destinations`.
  - All modelled roads in Mirpur and Bijoy Sarani now have distance $\le 2\text{ m}$ to the playable network.
- **2D Spatial Hash Grid (`src/main.js`)**:
  - Indexed all ~8,000 segments into a $100\text{ m}$ 2D spatial hash grid in `makeBoundary()`. Radial shell lookup queries take $\approx 0.002\text{ ms}$ (2 microseconds) per call, guaranteeing 60+ FPS zero-allocation performance.
- **District-Aware Warning Text & Thresholds (`src/main.js`)**:
  - Calibrated thresholds: `WARN = 400 m`, `PUSH = 440 m`, `HARD = 480 m` from any road or public area, so players can explore every street, alley, park, and courtyard in the district.
  - Dynamically updates `#boundary-warning` DOM text to `Turn back: leaving ${district.label || 'Mirpur'}` so Bijoy Sarani accurately warns "leaving Bijoy Sarani" instead of "leaving Mirpur".
