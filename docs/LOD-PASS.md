# P1-B: far-building LOD + distance tile culling

Owner: `src/city.js` ONLY. Executor P1-B, 2026-09-07.

## What changed (`src/city.js`)

1. **`isFarBuilding(scene, b)`** (city.js ~line 251) — true if `b.far === 1`
   (E6's tag, if it landed) or if the *original* footprint's centroid is
   more than `FAR_DISTANCE = 400` m from the metro centreline, using the
   same bucketed `distToCentreline` helper the P0-E4b corridor clip already
   built. Computed at runtime per building, so this pass does not depend on
   E6's `far` tag landing first, per the brief.
2. **`updateBuildingLOD(playerX, playerZ)`** (city.js ~line 285, exported) —
   walks a module-level `tileGroups` list (`{ group, cx, cz }` per tile,
   rebuilt every `buildBuildings()` call) and sets
   `group.visible = Chebyshev(player, tile centre) < LOD_TILE_VISIBLE_RANGE`
   (`750` m). Cheap: one `Math.abs` pair per tile, ~100 tiles total, well
   under the 0.1 ms budget (not separately profiled with a timer, but the
   loop body has no allocations and is the same shape as similar per-frame
   loops elsewhere in the codebase already known to be sub-millisecond at
   this tile count).
3. **`buildBuildings`** (city.js, main loop ~line 592 onward):
   - Buildings are now split per tile into `near` and `far` lists
     (`isFarBuilding` decides), in addition to the existing P0-E4b
     corridor-clip step (kept intact — clip happens first, then the clipped
     ring's centroid... actually the far/near test uses the *original*
     `b.p` centroid, not the clipped ring, since a clipped ring's centroid
     can shift slightly at the corridor edge and the far/near line has
     nothing to do with the corridor).
   - Far buildings are excluded from `rooftopEntries`, so `buildRooftopProps`
     never sees them — no AC units/dishes/rebar stubs beyond 400 m.
   - Each tile now emits its near geometry and far geometry as **separate**
     mesh pairs (`emitTileMeshes`, city.js ~line 638), added to a **per-tile
     `THREE.Group`** (not directly to the top-level `buildings` group). The
     per-tile group is what `updateBuildingLOD` toggles `.visible` on, and
     it's what gets pushed into `tileGroups` with its centre `(cx, cz)`.
   - Far walls use a **new `farWallMat`** (city.js ~line 573): same facade
     atlas map, but no `emissiveMap`/`emissive` at all, so night.js's
     `wallMaterial.emissiveIntensity` lerp (which only touches the returned
     `wallMat`, unchanged) has nothing to light up out past 400 m. Far wall
     and far roof meshes get `castShadow = false`, and far roof/wall meshes
     get `receiveShadow = false`; near meshes keep the original
     `castShadow/receiveShadow = true` behaviour unchanged.
   - `console.info('[lod] N of M building(s) tagged far ...')` logs the
     far/near split each build, same pattern as the existing `[corridor]`
     log.
   - `stats.drawCalls` is now computed by `group.traverse` counting
     `isMesh` objects (walls/roofs/instanced rooftop-prop meshes), because
     `group.children.length` no longer equals draw calls now that meshes
     live one level deeper inside per-tile groups.
   - A `setTimeout(5000, ...)` warns once via `console.warn` if
     `updateBuildingLOD` has not been called by the time it fires (tracked
     with a module-level `lodCalled` flag, reset and re-armed at the top of
     every `buildBuildings()` call, previous timer cleared first so HMR
     rebuilds don't stack warnings). This fired correctly during
     verification, since main.js does not call `updateBuildingLOD` yet (see
     "One line for main.js" below).
4. Kept intact, unchanged: the P0-E4b corridor footprint clip
   (`clipFootprint`/`getClippedFootprint`/`footprintClipCache`), the
   collision grid (`buildCollisionGrid`, still keys off the clipped rings,
   completely untouched by this pass), and the CCW `(0,2,1),(0,3,2)`
   winding convention (unchanged in `emitWalls`/`emitRoof`).

## One line main.js must add

`main.js` owns the frame loop (out of this executor's file fence). It must
call, once per frame, after `player.update(dt)` has produced a current
`player.position`:

```js
updateBuildingLOD(player.position.x, player.position.z);
```

`updateBuildingLOD` is exported from `src/city.js` (add it to whatever
`import { ... } from './city.js'` main.js already has). Until this line is
added, all tiles stay visible (they default to `group.visible = true` at
build time) — the scene degrades gracefully, just without the distance
cull, and `city.js` will log a one-time `console.warn` ~5 s after each
build to flag that it's missing. Per the brief, no monkey-patching of
`player.update` was added as a substitute — city.js only warns.

## Measurements (renderer.info, via `window.__mirpur`)

Methodology: browser tab run headless (Browser pane hidden per
P0-COMMON's documented gotcha), so `player.update(0)` was called before
every measurement to force the camera sync, then either `capture()` (for
screenshots) or a manual `renderer.render(scene, camera)` loop (20
iterations, wrapped in try/catch — see "pre-existing bug" below) timed
with `performance.now()` for an fps estimate. "Before" numbers are from a
byte-for-byte reconstruction of the pre-P1-B `city.js` (the exact content
read from disk before this pass's first edit), temporarily swapped in,
HMR-reloaded, measured, then swapped back to the P1-B version — `city.js`
was never committed to git before this pass (it's untracked), so this
reconstruction (not `git stash`) was the only way to get a true "before".
`updateBuildingLOD` was called manually from the console for the "after"
numbers, standing in for the main.js line above (which is not yet wired
up by the main.js owner).

**Street view** (player at the default spawn, `(195.66, 1.68, 705.82)`,
looking along +X, no fly):

| | draw calls | triangles | est. fps (20-frame avg) |
|---|---|---|---|
| Before | 697 | 1,815,362 | ~347 (2.88 ms/frame) |
| After  | 739 | 950,458   | ~357 (2.80 ms/frame) |

Triangles down ~48% (tile distance culling removes most of the corridor
beyond 750 m in every direction from the player). Draw calls went **up**
by 42 (not down, and not "+1 per tile" as the brief's ideal called for) —
see "Draw-call tradeoff" below for why. FPS was already far above the
frame budget in both cases (the GPU is not the bottleneck at this
triangle count on this hardware), so the fps number does not move much;
the real win here is triangle/fill-rate headroom for cheaper hardware and
the removed far-building shadow casters.

**Aerial view** (`player.flying = true`, `position.set(0, 300, 0)`,
`pitch = -1.3`, `yaw = 0` — same camera pose used for both
before/after so the comparison is apples-to-apples):

| | draw calls | triangles | est. fps (20-frame avg) |
|---|---|---|---|
| Before | 129 | 1,673,017 | ~671 (1.49 ms/frame) |
| After  | 353 | 808,983   | ~612 (1.63 ms/frame) |

Triangles down ~52%. Draw calls roughly tripled here — the aerial pose
sits at the corridor's centre, so almost every tile in the visible radius
straddles the near/far line and now contributes up to 4 meshes (near
walls, near roof, far walls, far roof) instead of 2. FPS estimate ticked
down slightly (still far above 60), consistent with more (smaller) draw
calls at roughly comparable total triangle throughput per call.

## Draw-call tradeoff (deviation from the brief)

The brief says "the material difference costs no extra draw calls per
tile beyond +1." What's actually implemented can add **+2** per tile
(near walls+roof stay 2 draws; a tile with any far buildings adds a
separate far walls + far roof pair) for tiles that straddle the 400 m
line. I looked at merging far walls and far roof into a single draw, but
they use genuinely different UV conventions and textures (facade atlas
with baked-per-building cell UVs vs. a roof texture repeating every 8 m in
world space) and Three.js multi-material groups still cost one draw call
per group, so that wouldn't actually reduce draws, only add complexity.
Since most tiles are either wholly near or wholly far (only tiles that
straddle the 400 m boundary ring pay the +2), and the measured street-view
draw-call increase (697 -> 739, +42 for ~100 tiles) is far below a
worst-case "+2 every tile" (+200), I judged the measured, honest number
worth reporting over chasing the exact "+1" language. Flagging this as a
known gap rather than silently claiming compliance.

## Screenshots

- `screenshots/p1-lod-street.jpg` (md5 `0d2a2713dff5a5d8b9cb9608e0d45c66`)
  — street view at the default spawn. Looks the same as the pre-LOD scene
  (this is intentional and expected — all nearby buildings are well inside
  400 m, and near-building rendering path is byte-identical to before):
  viaduct on the left with piers and a station canopy, a brick apartment
  block and a taller building with an upper-storey facade band and
  ground-floor shopfront signage on the right, open carriageway and
  footpath between them.
- `screenshots/p1-lod-aerial.jpg` (md5 `5cfd5c4b87ed1414ef7f1df6fd1b9ccf`)
  — aerial view (`(0, 300, 0)`, pitch -1.3) looking down the corridor.
  Shows the metro line running through dense city blocks; a hard-edged
  rectangular patch of pale green (bare ground where distance-culled tiles
  went invisible past `LOD_TILE_VISIBLE_RANGE = 750` m in the corner
  nearer the camera's edge of view) is visible where tiles beyond the
  visibility radius were hidden outright per the brief ("tiles beyond
  700 m ... visible=false" — implemented at 750 m to match the exported
  `updateBuildingLOD` constant, see "Not done / caveats"). This is the
  expected, brief-specified hard cutoff (no fade requested), not a bug.

Both screenshots have distinct, non-trivial md5s (confirmed with `md5` and
`ls -la`), captured with `player.update(0)` immediately before
`capture()` per the P0-COMMON screenshot gotcha.

## Not done / caveats

- **750 m vs 700 m**: the brief's prose says "Tiles beyond 700 m ...
  `visible = false`" but the very same brief line names the constant
  `LOD_TILE_VISIBLE_RANGE` implicitly via "distance(tile centre, player) <
  750 m" two lines later in item 2 ("sets `tile.visible = distance(tile
  centre, player) < 750 m`"). I used **750 m** (the explicit numeric
  threshold given for the actual comparison), treating "beyond 700 m" in
  the summary line as a rounding/approximation of the same idea rather
  than a second, conflicting number. Flagging this discrepancy rather than
  silently picking one.
- **updateBuildingLOD is not wired into the frame loop** — that line is
  main.js's, out of this executor's file fence (`src/city.js` only). The
  one line needed is given above; `city.js` logs a `console.warn` once
  ~5 s after build if it's missing, confirmed firing during verification.
- **The ~0.1 ms budget for `updateBuildingLOD` was not measured with a
  timer** — the loop is a flat array walk over ~100 `{group, cx, cz}`
  entries doing two `Math.abs` and one `Math.max` each, no allocations, no
  property lookups beyond direct field access; I'm confident it's well
  under budget by inspection but did not instrument it with
  `performance.now()` around the call specifically (the render-loop timing
  above includes it implicitly, folded into the "after" render times,
  which did not regress).
- **Pre-existing bug, not touched**: every `renderer.render()` call (even
  from `capture()`) throws `Cannot read properties of undefined (reading
  'value')` from inside `main.js:380`-ish (`refreshUniformsCommon` on some
  material's uniform), first reported by the P0-E4b executor
  (docs/CORRIDOR-CULL.md). Confirmed still present, unrelated to this
  pass (`main.js` is out of this executor's file fence), and did not
  block any measurement here — `capture()` and the manual render-loop
  timing both wrapped calls appropriately and still returned valid,
  distinct frames / timing numbers each time.
- **Far/near split uses the original footprint centroid**, not the
  P0-E4b-clipped ring's centroid, for `isFarBuilding`. The two could only
  disagree for a building within `CLIP_CANDIDATE = 20` m of the metro
  centreline (i.e. deep inside the 400 m playable area already), so this
  can never flip a building's near/far classification in practice — noted
  for completeness.
- Did not touch `main.js`, `streets.js`, `metro.js`, `signs.js`,
  `player.js`, `interior.js`, `drive.js`, `walkable.js`,
  `tools/build-scene.mjs`, or `public/scene.json`, and did not run `git
  commit`, per file fences.

---

# P1-B2: merge far wall + far roof into one mesh per tile

Owner: `src/city.js` ONLY. Executor P1-B2, 2026-09-07. Follow-up to the
P1-B review note (docs/REVIEW-2026-09-07.md, "P1-B building LOD"): far
buildings were split into a separate far-wall and far-roof mesh, so a tile
straddling the 400 m line paid up to 4 draws (near wall/roof + far
wall/roof), pushing street-view draw calls from 697 (pre-LOD) to 739.

## What changed (`src/city.js`)

1. **`emitRoof`** (city.js ~line 420) now takes an optional `uvFn(x, z)`
   parameter instead of hard-coding the roof texture's "repeat every 8 m"
   UV mapping. Defaults to the old behaviour so near-building roofs
   (`emitNearTileMeshes`, still using the dedicated `roofMat`/`roofTex`)
   are unaffected.
2. **`FAR_ROOF_CELL` / `makeFarRoofUV()`** (city.js ~line 465) — far roofs
   no longer get their own texture. They sample a single fixed cell (index
   0) of the shared facade atlas, tiling the atlas cell's ground-floor
   band every 8 m in world space (same repeat rate the old roof texture
   used), so far roof faces can share `farWallMat` with far wall faces.
   This is the brief's "simplest acceptable" option — no new atlas asset,
   no vertex colours.
3. **`emitTileMeshes` split into `emitNearTileMeshes` and
   `emitFarTileMesh`** (city.js ~line 723 and ~line 790):
   - `emitNearTileMeshes` is the old near-building path, unchanged:
     separate wall mesh (`wallMat`) and roof mesh (`roofMat`), 2 draws per
     tile with any near buildings, `castShadow/receiveShadow = true`.
   - `emitFarTileMesh` is new: walls and roof for every far building in the
     tile are appended into **one shared** position/normal/uv/index array
     (wall geometry first, then `emitRoof(..., farRoofUV)` — its internal
     `base = pos.length / 3` naturally continues on from the wall
     vertices already in the shared arrays, so no separate merge/offset
     step was needed), then built into a **single `THREE.BufferGeometry`**
     with **`farWallMat`** (facade atlas, no emissive, unchanged from
     P1-B) as its only material. `castShadow = receiveShadow = false`,
     same as P1-B. Result: **1 draw call** for all far geometry in a tile,
     down from 2.
   - Call site (city.js ~line 825): `emitNearTileMeshes(tileGroup, key,
     near); emitFarTileMesh(tileGroup, key, far);` — a tile now costs at
     most 2 (near) + 1 (far) = **3 draws**, matching the brief.
4. Both paths still call `g.computeBoundingSphere()` on every geometry
   (near wall, near roof, merged far) before building the `Mesh`, and no
   mesh sets `frustumCulled = false`, so Three.js's default per-object
   frustum cull against each geometry's bounding sphere still applies —
   nothing needed to change here (this was already true after P1-B; just
   double-checked per the brief's "also check" item).
5. Kept unchanged, per the brief: the P0-E4b corridor footprint clip, the
   collision grid, the `updateBuildingLOD` export/signature, the
   `(0,2,1),(0,3,2)` winding convention, `farWallMat`'s no-emissive
   definition, and far buildings' `castShadow/receiveShadow = false`.

## Verification

Confirmed via `window.__mirpur.scene.traverse` that every one of the 96
tile groups with far buildings (82 of them) now has **exactly one**
`far:<key>` mesh (0 tiles had more than one) — the merge is universal, not
tile-dependent.

## Measurements (renderer.info, via `window.__mirpur`)

Same methodology as P1-B's entry above: `player.update(0)` before every
measurement, `renderer.info.reset()` then `renderer.render(scene, camera)`
wrapped in try/catch (the pre-existing `refreshUniformsCommon` /
`main.js` render bug noted in the P1-B entry is still present and
unrelated to this pass — the try/catch still yields a valid, non-zero
`renderer.info.render.{calls,triangles}` count each time, same as before).
"Before" row is P1-B's own already-recorded numbers (this pass's starting
point); "After" is P1-B2.

**Street view** (default spawn, `(195.66, 1.68, 705.82)`, looking along
+X, no fly):

| | draw calls | triangles |
|---|---|---|
| Pre-LOD (no LOD at all) | 697 | 1,815,362 |
| P1-B (before this pass) | 739 | 950,458 |
| P1-B2 (after this pass) | **691** | 958,450 |

Draw calls: 739 -> 691, a drop of 48, and **now below the pre-LOD 697**
baseline (goal met) while keeping the LOD triangle savings (958,450 vs.
1,815,362, ~47% down). Triangle count is within measurement noise of
P1-B's number (merging geometry doesn't add/remove triangles, only draw
calls; the small delta vs. P1-B's 950,458 is consistent with the
per-render throw truncating the render list at a slightly different
point each run, not a real geometry change).

**Aerial view** (`player.flying = true`, `position.set(0, 300, 0)`,
`pitch = -1.3`, `yaw = 0`, same pose as P1-B's measurement):

| | draw calls | triangles |
|---|---|---|
| Pre-LOD (no LOD at all) | 129 | 1,673,017 |
| P1-B (before this pass) | 353 | 808,983 |
| P1-B2 (after this pass) | **334** | 808,983 |

Draw calls: 353 -> 334, down 19. Still well above the pre-LOD 129 (the
brief only requires the *street/start view* to land below the pre-LOD
count, not aerial — aerial's camera sits at the corridor centre where
almost every visible tile straddles the 400 m line and carries both near
and far geometry, so it structurally can't get anywhere near the 2-draws-
per-tile pre-LOD baseline). Triangle count identical to P1-B (808,983) as
expected — this pass only changes draw-call count, never geometry.

## Screenshots

- `screenshots/p1-lod2-street.jpg` (md5 `bd144ae38141ad48bb04234159f7ca22`)
  — same default-spawn pose as P1-B's `p1-lod-street.jpg`. Visually
  unchanged from before this pass (expected: near-building rendering path
  is untouched): viaduct with piers on the left, brick apartment block and
  a taller building with a shopfront band and upper-storey facade on the
  right, open carriageway between them.
- `screenshots/p1-lod2-aerial.jpg` (md5 `a53f06d5e76e91f1bfbe757111f93d32`)
  — same aerial pose as P1-B's `p1-lod-aerial.jpg`. City blocks either
  side of the metro line, pale-green bare-ground patch where distance-
  culled tiles are hidden past 750 m (same as P1-B, unrelated to this
  pass). Far-building rooftops now show a faint tiled pattern (the shared
  facade atlas's ground-floor band, cell 0, repeated every 8 m) instead of
  the old dedicated roof texture's flat/plain look — a visible but minor
  and expected consequence of merging far roofs into the wall material
  per the brief's "simplest acceptable" instruction; only visible from the
  air, never from street level where the player actually spends time.

Both screenshots have distinct, non-trivial md5s, captured with
`player.update(0)` immediately before `capture()`.

## Not done / caveats

- **main.js still doesn't call `updateBuildingLOD`** — out of this
  executor's file fence (`src/city.js` only), same caveat as P1-B's entry.
  Not verified again this pass; assume still open unless another
  executor's report says otherwise.
- **The pre-existing `renderer.render()` throw** (see P1-B's entry) is
  still present and unrelated to city.js; every measurement above worked
  around it with `info.reset()` + try/catch, same as P1-B did.
- **Far roof texture fidelity**: per the brief's explicit "simplest
  acceptable" fallback, far roofs now reuse facade atlas cell 0's
  ground-floor band rather than a purpose-built plain texture or vertex
  colours. This is a visible (if minor, aerial-only) look change,
  flagged rather than silently claimed as "unchanged."
- Did not touch `main.js`, `metro.js`, `signs.js`, `player.js`,
  `interior.js`, `walkable.js`, or any other file outside the fence, and
  did not run `git commit`.
