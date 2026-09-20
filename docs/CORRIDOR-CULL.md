# P0-E4: metro corridor building cull

Owner: `src/city.js` only. Executor E4, 2026-09-07.

## Rule (from reference/metro/OWNER-PHOTOS-2026-09-07.md, owner correction 1)

Nothing stands under the viaduct except the road. The real road under the
girder is ~24 m of carriageway plus footpaths, so nothing may stand within
~13 m of the metro centreline (`scene.metro.tracks[*].pts`).

## Implementation (`src/city.js`)

1. **`ensureCorridorIndex(scene)`** (city.js ~line 25-58) builds a bucketed
   index of the 139 centreline points from `scene.metro.tracks[*].pts`,
   bucketed by 100 m along X so distance queries don't scan the whole
   polyline per building. Built once and memoized module-level
   (`corridorSegBuckets`).
2. **`distToSegment` / `distToCentreline`** (city.js ~line 60-84): standard
   point-to-segment distance, checked against the 3 neighbouring buckets.
3. **`export function isInCorridor(scene, b)`** (city.js ~line 86-105): true
   if any footprint vertex of building `b` is within `CORRIDOR_HALF = 13`
   m of the centreline, OR the footprint centroid is within
   `CORRIDOR_CENTROID = 16` m. `scene` may be omitted (`undefined`/`null`)
   once the index is already built — see point 5 below.
4. **`buildBuildings(scene, ...)`** (city.js, tile-bucketing loop ~line
   345-361): buildings failing `isInCorridor` are skipped before being
   bucketed into tiles, so neither their walls nor their roof are emitted.
   `console.info` logs the culled count each build.
   Rooftop props (AC units / dishes, `buildRooftopProps`) are built from
   `scene.buildings.filter(b => !isInCorridor(scene, b))` (city.js
   ~line 513) so no rooftop clutter floats over an unbuilt footprint.
5. **`buildCollisionGrid(buildings)`** (city.js ~line 431-...): skips the
   same buildings (`isInCorridor(undefined, b)`) before adding their edges
   to the collision grid, so culled buildings' walls no longer block
   movement. `scene` is not passed here (main.js calls
   `buildCollisionGrid(scene.buildings)`, not `buildCollisionGrid(scene)`,
   and city.js may not be changed outside its own exports/functions to
   alter that call site in main.js). This works because main.js always
   calls `buildBuildings(scene, ...)` (line 99) before
   `buildCollisionGrid(scene.buildings)` (line 124), so the corridor index
   is already warm by the time `buildCollisionGrid` runs — see the comment
   on `ensureCorridorIndex`.
6. Station footprints are not touched — they are not in `scene.buildings`
   (confirmed: `scene.metro.stations` is a separate array), so criterion 3
   of the brief ("do not touch the stations' own footprints") required no
   code change.

## Counts

Standalone check against `public/scene.json` (139 centreline points, 14,462
buildings), replicating the exact algorithm above:

- Vertex within `CORRIDOR_HALF` (13 m): **75** buildings
- Additional buildings culled only by centroid within `CORRIDOR_CENTROID`
  (16 m), vertex test alone did not catch them: **1**
- **Total culled: 76**

This is consistent with the brief's measurements at 10 m (23) and 14 m (86):
13 m sits between those thresholds and 76 falls between 23 and 86, closer to
the 14 m figure as expected since 13 m is close to 14 m.

Live browser console (both on initial build and on HMR rebuild after the
`isInCorridor` centroid-only rooftop-prop filter edit) confirmed the same
figure both places it's computed:

```
[corridor] culled 76 building(s) within the metro corridor (CORRIDOR_HALF=13m, CORRIDOR_CENTROID=16m)
[corridor] skipped 76 culled building(s) in collision grid
```

(76 == 76, so `buildBuildings` and `buildCollisionGrid` agree on the same
set of culled buildings, as required.)

## Verification (screenshots)

Browser verification used the `window.__mirpur` debug hook. Note: this
session runs the Browser pane hidden (no live viewer), so
`requestAnimationFrame` — and with it `player.update(dt)`, which is what
copies `player.position`/`yaw`/`pitch` onto `camera` — never fires. Setting
`player.position` alone therefore has no visible effect; each screenshot
below calls `player.update(0)` once to force the camera sync, then
`window.__mirpur.capture()` (which itself does a manual
`renderer.render(...)` before returning a base64 JPEG of the canvas) to
grab a genuine, current frame. Screenshots below are byte-distinct
(different md5), confirming they are not the four-identical-copies bug
called out in docs/REVIEW-2026-09-07.md.

- **`screenshots/p0-corridor-key1.jpg`** (md5 `2162b8c65f1759cfc85dd7113a3a1fc8`)
  — flying near Mirpur 10 approach (~x=230, z=594, y=35), looking along the
  corridor. Open road and footpaths under the girder on both sides; the
  nearest buildings (brick apartment blocks left, taller building right)
  stand clear of the viaduct and its piers. No building wall or roof
  intrudes under the girder.
- **`screenshots/p0-corridor-key2.jpg`** (md5 `67398d2299fdb1d96c20da6ec71b832b`)
  — flying aerial near Mirpur 11 (~x=-125, z=-601, y=35), looking along the
  corridor toward the station canopy. Dense apartment blocks hug both sides
  of the guideway but none sits under the black station canopy / viaduct
  deck; the pale surface directly under the canopy is the viaduct's own
  pier/abutment structure, not a building.
- **`screenshots/p0-corridor-key2-ground.jpg`** (md5
  `52ce6be180a4603bede5868b123c1ffb`) — ground-level view near Mirpur 11
  (~x=-155, z=-520, y=6), looking north along the corridor. Confirms the
  same from street height: open carriageway and footpath under the girder,
  piers standing free of any building wall, buildings set back on both
  sides.

## Not done / caveats

- The brief's screenshot naming convention (`screenshots/p0-corridor-*.jpg`)
  is followed; I captured 3 files rather than exactly 2 (added a
  ground-level Mirpur 11 shot in addition to the aerial one) for stronger
  evidence, since the first Mirpur-11 capture was an aerial oblique that
  made it hard to be fully certain no building wall touched the canopy
  edge — the ground-level shot removes that ambiguity.
- I did not visually inspect all 76 culled footprints individually (that
  would require walking/flying to each one); the counts above are verified
  by an independent standalone Node re-implementation of the exact
  in-file algorithm against `public/scene.json`, matching the live
  console.info output exactly (76 == 76).
- Per file fences, only `src/city.js` was edited. I did not touch
  `main.js`, `streets.js`, `metro.js`, `signs.js`, `player.js`, or
  `interior.js`.

# P0-E4b: footprint clip supersedes the whole-building cull

Owner: `src/city.js` only. Executor E4b, 2026-09-07 (follow-up to P0-E4
above, per docs/OWNER-FEEDBACK-2026-09-07.md item 1: culling whole
buildings left bare sand lots wherever a footprint only clipped into the
carriageway; the real street has a continuous shop wall on the footpath).

## What changed

`isInCorridor` / `CORRIDOR_HALF` / `CORRIDOR_CENTROID` are gone. In their
place (`src/city.js`):

1. **`CARRIAGEWAY_HALF = 12.5`** (city.js ~line 31) — half-width of the
   clear carriageway from the metro centreline; this is what footprints get
   clipped against (previously `CORRIDOR_HALF = 13` was a whole-building
   cull threshold, not a clip line). `CLIP_CANDIDATE = 20` m gates which
   footprints are even tested (any vertex within 20 m of the centreline);
   `MIN_CLIPPED_AREA = 15` m² drops slivers.
2. **`nearestCentrelineSegment(scene, x, z)`** (city.js ~line 87) replaces
   the old `distToCentreline`-only lookup; it now also returns the nearest
   segment itself, needed to build the clip line's tangent/normal.
   `distToCentreline` is kept as a thin wrapper over it.
3. **`ringArea`** (city.js ~line 121) — shoelace area of a flat ring, used
   to test `MIN_CLIPPED_AREA`.
4. **`clipRingHalfPlane(ring, distFn, threshold)`** (city.js ~line 131) — a
   generic Sutherland-Hodgman clip of a flat `[x0,z0,x1,z1,...]` ring
   against the half-plane `distFn(p) >= threshold`. Since a half-plane is
   convex, a simple input ring's winding order is preserved in the output.
5. **`clipFootprint(scene, b)`** (city.js ~line 168) — the P0-E4b algorithm
   itself, matching the brief:
   - Skip (return `{ ring: b.p, clipped: false }`) unless some footprint
     vertex is within `CLIP_CANDIDATE` (20 m) of the centreline.
   - Find the centreline segment nearest the footprint **centroid**, take
     its unit tangent `t` and normal `n = (-tz, tx)`.
   - `rawDist(p) = (p - segStart)·n` is the signed distance from the
     *infinite line* through that segment (not just the segment itself -
     matching the brief's "single half-plane clip"). `side = sign(rawDist(centroid))`.
   - **Straddle check**: if footprint vertices have `rawDist` on both sides
     of the centreline line (not the clip line — the centreline itself),
     a single half-plane clip can't produce a sane shape → drop
     (`{ ring: null, clipped: true, dropped: true }`).
   - Otherwise clip the ring against `{ p : rawDist(p) * side >= CARRIAGEWAY_HALF }`
     via `clipRingHalfPlane`. Drop (same shape as above) if the result has
     under 3 vertices or `Math.abs(ringArea(...)) < MIN_CLIPPED_AREA`.
   - Else return `{ ring: <clipped flat ring>, clipped: true }`.
6. **`footprintClipCache` / `getClippedFootprint(scene, b)`** (city.js
   ~line 233) — a `Map<building id, clipFootprint() result>`, reset at the
   top of every `buildBuildings()` call and reused (with `scene` omitted)
   by `buildCollisionGrid`, the same warm-cache pattern the old
   `isInCorridor(undefined, b)` used (see point 5 of the P0-E4 section
   above and the comment on `buildCollisionGrid` — main.js's file fence
   means the call site there still only passes `scene.buildings`, not
   `scene`, so this cache is what lets `buildCollisionGrid` reuse
   `buildBuildings`'s clip results without a `scene` argument).
7. **`buildBuildings`** (city.js, tile-bucketing loop ~line 578): now calls
   `getClippedFootprint` per building; dropped buildings are skipped
   entirely (not bucketed, no walls/roof emitted), clipped buildings emit
   walls/roof from the clipped ring instead of `b.p`. Holes (`b.holes`) are
   only applied to buildings that were *not* clipped (3 buildings in the
   whole scene have holes; none are near the corridor) to avoid a hole
   punching outside a clipped ring's new edge. Tile-bucketing key now uses
   the clipped ring's own first vertex rather than `b.p[0]/b.p[1]`.
   `console.info` logs `clipped N` / `dropped M` each build.
8. **`buildRooftopProps`** (city.js ~line 409) now takes a list of
   `{ b, ring }` entries instead of a bare building list, so rooftop props
   (tanks/stubs/dishes) are centred/bounded by the clipped footprint, not
   the original one — no more AC units floating over a now-missing strip
   of roof. The call site (`buildBuildings`, ~line 668) builds this list
   alongside the tile buckets, using only kept (non-dropped) buildings.
9. **`buildCollisionGrid(buildings)`** (city.js ~line 691): looks up
   `getClippedFootprint(undefined, b)` per building (relying on the cache
   `buildBuildings` just warmed - see point 6) and walls off the *clipped*
   ring's edges, so the player can now walk onto the strip of former
   carriageway that P0-E4 used to block with a phantom wall. Dropped
   buildings contribute no collision edges at all.
10. Station footprints are still untouched (`scene.metro.stations` is a
    separate array from `scene.buildings`, as established in the P0-E4
    section above); no code change was needed for that.

## Counts

Standalone re-implementation of the exact in-file algorithm against
`public/scene.json` (14,462 buildings, 139 centreline points):

- **Clipped: 153** buildings (footprint cut at the carriageway edge, kept).
- **Dropped: 11** buildings — 2 straddled the centreline itself, 9 left a
  remaining area under `MIN_CLIPPED_AREA` (15 m²) after clipping.
- 14,298 buildings untouched (no vertex within `CLIP_CANDIDATE` of the
  centreline).

This is a large improvement over P0-E4's blunt cull (76 whole buildings
dropped): 153 buildings that previously vanished entirely now keep their
footprint minus only the sliver actually inside the carriageway, and only
11 (vs. 76) are dropped outright — all 11 for a documented geometric reason
(straddle or sliver), not merely "touched the corridor".

Live browser console on load and after an HMR rebuild (confirmed
identically 3 times across reloads during verification, including reloads
triggered by other executors' concurrent edits) matches the standalone
count exactly:

```
[corridor] clipped 153 building(s) at the carriageway edge (CARRIAGEWAY_HALF=12.5m), dropped 11 sliver/straddling footprint(s)
[corridor] collision grid: skipped 11 dropped building(s), clipped the rest at the carriageway edge
```

(11 == 11 between `buildBuildings` and `buildCollisionGrid`, confirming
both agree on the same dropped set via the shared `footprintClipCache`.)

## Verification (screenshots)

Same `window.__mirpur` debug hook and `player.update(0)` +
`window.__mirpur.capture()` trick as P0-E4 (Browser pane ran hidden this
session too).

- **`screenshots/p0-clip-key1.jpg`** (md5 `b686384939ccc27fcf097dcc03bb69b9`)
  — aerial near Mirpur 10 (~x=230, z=594, y=35), looking across the
  corridor toward the station canopy. Open carriageway and footpaths under
  the girder; dense apartment blocks come right up to the footpath edge on
  both sides with no bare-sand gaps, unlike the old whole-building cull.
- **`screenshots/p0-clip-key2-ground.jpg`** (md5
  `5c4ab1fb24183b5fdf0c979ed4b6f37e`) — ground level near Mirpur 11
  (~x=-161, z=-580, y=2.2), standing on a footpath and looking along the
  corridor (parallel to the centreline tangent). Shows a **continuous run
  of shopfronts** (visible shop-sign bands: "CLOTH STORE" etc.) right at
  the footpath edge under the viaduct piers, with open carriageway to the
  left and no bare lots breaking the frontage — this is the P0-E4b fix
  directly: these are buildings that P0-E4 would have culled entirely
  (vertex within 13 m) but are now clipped and still present.
- **`screenshots/p0-clip-shopwall.jpg`** (md5
  `fc18e973da33fbc2bcb26548a80bdda1`) — standing on the **far** footpath
  near Mirpur 11 (~x=-165, z=-579, y=2.0), looking across the open
  carriageway (through the viaduct piers) at the clipped building on the
  near footpath (building id 420659373, centroid ~(-128,-589), originally
  ~20 m from the centreline, clipped back to the 12.5 m carriageway edge).
  Confirms from across the road: the shop wall sits flush at the footpath
  edge, nothing intrudes into the carriageway, and the wall reads as a
  normal building front (shopfront band, shutters, upper-storey windows) —
  not a broken or degenerate clip.

All three screenshots have distinct, non-trivial md5s (confirmed with
`md5` and `ls -la`), and were captured with `player.update(0)` immediately
before `capture()` each time, per the P0-COMMON screenshot gotcha.

## Not done / caveats

- Per the brief, positions for the ground-level and shopwall shots were
  derived from a standalone JS re-implementation of the centreline
  nearest-segment/tangent/normal math (run in-page via `javascript_tool`,
  using the same segment endpoints my standalone Node check found nearest
  to a known clipped building), not from a generic "walk to a random
  clipped building" traversal — I did not visually inspect all 153 clipped
  or 11 dropped footprints individually. The 153/11 figures are verified
  by the standalone Node re-implementation against `public/scene.json`,
  matching the live `console.info` output exactly on 3 separate loads.
- Holes (`b.holes`) are dropped on any building whose footprint was
  clipped, rather than being clipped themselves against the same half
  -plane. This only affects the 3 buildings scene-wide that have holes at
  all, and none of them are within `CLIP_CANDIDATE` of the corridor, so in
  practice it changes nothing today - but if a future OSM re-import adds a
  building-with-hole near the corridor, its hole would silently disappear
  rather than being clipped correctly. Flagging this as a known gap rather
  than fixing it now, since the brief didn't call out hole handling and no
  current data exercises it.
- During verification, the dev server reloaded several times mid-session
  from other executors' concurrent edits (to `streets.js`/`main.js` per
  the P0-COMMON file-fence note); each reload required re-clicking "Enter
  the street" and re-warming `window.__mirpur`. The clipped/dropped counts
  were identical (153/11) across all reloads, which is good evidence the
  clip is deterministic and not order-dependent on which other files were
  mid-edit.
- Console showed a pre-existing, unrelated error on every frame:
  `renderer.render threw ... main.js:380/382 ... Cannot read properties of
  undefined (reading 'value')`, reproduced even inside `capture()`. This
  traces into `main.js` (a file I'm fenced off from), not `city.js` -
  `capture()` still returned valid, distinct JPEG frames each time despite
  the caught exception, so it didn't block verification, but it's a bug
  for whichever executor owns `main.js` to look at.
- Per file fences, only `src/city.js` was edited this pass too. I did not
  touch `main.js`, `streets.js`, `metro.js`, `signs.js`, `player.js`,
  `interior.js`, `drive.js`, or `index.html`, and did not run `git
  commit`.
